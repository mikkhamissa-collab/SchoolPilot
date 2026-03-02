# main.py — FastAPI application entry point.
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.routes import auth_routes, chat_routes, agent_routes, grades_routes, profile_routes
from app.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    settings = get_settings()
    logger.info("SchoolPilot Agent backend starting...")
    logger.info(f"Claude model: {settings.claude_model}")

    # Install Playwright browsers on first run
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as pw:
            # Just verify it works
            pass
        logger.info("Playwright ready")
    except Exception as e:
        logger.warning(f"Playwright not available: {e}. Browser agent will not work.")

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

# CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth_routes.router, prefix="/api/auth", tags=["auth"])
app.include_router(chat_routes.router, prefix="/api/chat", tags=["chat"])
app.include_router(agent_routes.router, prefix="/api/agent", tags=["agent"])
app.include_router(grades_routes.router, prefix="/api/grades", tags=["grades"])
app.include_router(profile_routes.router, prefix="/api/profile", tags=["profile"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
