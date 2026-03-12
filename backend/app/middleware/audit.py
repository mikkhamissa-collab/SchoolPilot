"""Audit logging middleware -- logs all data access for FERPA compliance."""
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


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if not any(path.startswith(p) for p in AUDITED_PREFIXES):
            return await call_next(request)

        request_id = str(uuid4())[:8]
        start = time.monotonic()
        has_auth = "authorization" in request.headers
        user_hint = "authenticated" if has_auth else "anonymous"

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
