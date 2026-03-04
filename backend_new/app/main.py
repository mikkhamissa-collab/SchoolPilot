# main.py — FastAPI application entry point.
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.config import get_settings
from app.routes import auth_routes, chat_routes, agent_routes, grades_routes, profile_routes
from app.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    settings = get_settings()
    logger.info("SchoolPilot Agent backend starting...")
    logger.info(f"Claude model: {settings.claude_model}")

    # Start background scheduler (daily syncs, reminders)
    start_scheduler()
    logger.info("Background scheduler started")

    yield

    stop_scheduler()
    logger.info("SchoolPilot Agent backend stopped")


app = FastAPI(
    title="SchoolPilot Agent API",
    version="2.0.0",
    lifespan=lifespan,
)

# Middleware — order matters: security headers first, then CORS
# (Starlette processes middleware in reverse add order, so add security headers
# BEFORE CORS so it wraps the outermost layer)
app.add_middleware(SecurityHeadersMiddleware)

settings = get_settings()
cors_kwargs = {
    "allow_origins": settings.cors_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.cors_origin_regex:
    cors_kwargs["allow_origin_regex"] = settings.cors_origin_regex
app.add_middleware(CORSMiddleware, **cors_kwargs)

# Routes
app.include_router(auth_routes.router, prefix="/api/auth", tags=["auth"])
app.include_router(chat_routes.router, prefix="/api/chat", tags=["chat"])
app.include_router(agent_routes.router, prefix="/api/agent", tags=["agent"])
app.include_router(grades_routes.router, prefix="/api/grades", tags=["grades"])
app.include_router(profile_routes.router, prefix="/api/profile", tags=["profile"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
