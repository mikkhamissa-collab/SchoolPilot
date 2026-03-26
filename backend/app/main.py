# main.py — FastAPI application entry point.
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request as FastAPIRequest

# ── Sentry error tracking (init early, before anything else) ──────────
_SENTRY_DSN = os.getenv("SENTRY_DSN")
if _SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(
        dsn=_SENTRY_DSN,
        traces_sample_rate=0.2,
        profiles_sample_rate=0.1,
        environment=os.getenv("ENVIRONMENT", "production"),
        release=os.getenv("RENDER_GIT_COMMIT", "unknown"),
    )
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import get_settings
from app.middleware.audit import AuditLogMiddleware
from app.routes import auth_routes, chat_routes, agent_routes, grades_routes, profile_routes, plan_routes, study_routes, focus_routes, buddy_routes, email_routes, remote_browser
from app.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Rate limiter — keyed by remote address
limiter = Limiter(key_func=get_remote_address)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com wss://*.onrender.com;"
        )
        return response


_REQUIRED_ENV_VARS = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "ANTHROPIC_API_KEY",
    "CREDENTIAL_ENCRYPTION_KEY",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    settings = get_settings()

    # Validate required environment variables
    missing = []
    for var in _REQUIRED_ENV_VARS:
        val = getattr(settings, var.lower(), None)
        if not val:
            missing.append(var)
    if missing:
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}. "
            "Set them in .env or your deployment config."
        )

    logger.info("SchoolPilot Agent backend starting...")
    logger.info(f"Claude model: {settings.claude_model}")

    # Validate Fernet encryption key
    try:
        from cryptography.fernet import Fernet
        key = settings.credential_encryption_key
        if isinstance(key, str):
            key = key.encode("utf-8")
        Fernet(key)  # Validates key format (must be 32 url-safe base64-encoded bytes)
        logger.info("Encryption key validated successfully")
    except Exception as e:
        raise RuntimeError(
            f"Invalid CREDENTIAL_ENCRYPTION_KEY: {e}. "
            "Must be a valid Fernet key (32 url-safe base64-encoded bytes). "
            "Generate one with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
        )

    # Start background scheduler (daily syncs, reminders)
    start_scheduler()
    logger.info("Background scheduler started")

    yield

    stop_scheduler()
    logger.info("SchoolPilot Agent backend stopped")


app = FastAPI(
    title="SchoolPilot API",
    description="AI-powered academic companion for high school students. Handles LMS sync, grade tracking, study tools, and AI chat.",
    version="3.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Rate limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Middleware — order matters: audit first, then security headers, then CORS
# (Starlette processes middleware in reverse add order, so add in this order
# to get: CORS outer → SecurityHeaders → AuditLog inner)
app.add_middleware(AuditLogMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

def _setup_cors(app: FastAPI):
    """Configure CORS with explicit origins + optional regex for Vercel previews."""
    s = get_settings()
    cors_kwargs = {
        "allow_origins": s.cors_origins,
        "allow_credentials": True,
        "allow_methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
    }
    if s.cors_origin_regex:
        cors_kwargs["allow_origin_regex"] = s.cors_origin_regex
    app.add_middleware(CORSMiddleware, **cors_kwargs)

_setup_cors(app)

# Routes
app.include_router(auth_routes.router, prefix="/api/auth", tags=["auth"])
app.include_router(chat_routes.router, prefix="/api/chat", tags=["chat"])
app.include_router(agent_routes.router, prefix="/api/agent", tags=["agent"])
app.include_router(grades_routes.router, prefix="/api/grades", tags=["grades"])
app.include_router(profile_routes.router, prefix="/api/profile", tags=["profile"])
app.include_router(plan_routes.router, prefix="/api/plan", tags=["plan"])
app.include_router(study_routes.router, prefix="/api/study", tags=["study"])
app.include_router(focus_routes.router, prefix="/api/focus", tags=["focus"])
app.include_router(buddy_routes.router, prefix="/api/buddy", tags=["buddy"])
app.include_router(email_routes.router, prefix="/api/email", tags=["email"])
app.include_router(remote_browser.router, prefix="/api/agent", tags=["remote-browser"])


@app.get("/health")
async def health():
    """Health check with database connectivity verification."""
    from app.db import get_db
    try:
        db = get_db()
        # Simple query to verify DB is reachable
        db.table("student_profiles").select("user_id").limit(1).execute()
        return {"status": "ok", "db": "connected", "version": "3.0.0"}
    except Exception as e:
        logger.error("Health check DB failure: %s", e)
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "db": "disconnected", "version": "3.0.0"},
        )
