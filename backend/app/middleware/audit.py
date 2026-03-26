"""Audit logging middleware -- logs all data access for FERPA compliance."""
import base64
import json
import logging
import time
from uuid import uuid4
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("audit")

AUDITED_PREFIXES = [
    "/api/grades",
    "/api/profile",
    "/api/chat",
    "/api/plan",
    "/api/study",
    "/api/buddy",
    "/api/agent",
    "/api/focus",
    "/api/email",
]


def _extract_user_id(auth_header: str) -> str:
    """Extract user_id from JWT sub claim without full verification (base64-decode only)."""
    try:
        token = auth_header.split(" ", 1)[1]
        payload_b64 = token.split(".")[1]
        # Add padding
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        return payload.get("sub", "unknown")
    except Exception:
        return "unknown"


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if not any(path.startswith(p) for p in AUDITED_PREFIXES):
            return await call_next(request)

        request_id = str(uuid4())[:8]
        start = time.monotonic()
        auth_header = request.headers.get("authorization", "")
        if auth_header:
            user_hint = _extract_user_id(auth_header)
        else:
            user_hint = "anonymous"

        response = await call_next(request)
        duration_ms = round((time.monotonic() - start) * 1000)

        logger.info(
            "AUDIT req=%s method=%s path=%s user=%s status=%d duration=%dms ip=%s",
            request_id,
            request.method,
            path,
            user_hint,
            response.status_code,
            duration_ms,
            request.client.host if request.client else "unknown",
        )
        response.headers["X-Request-Id"] = request_id
        return response
