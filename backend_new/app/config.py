# config.py — Application settings loaded from environment variables.
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_service_key: str
    supabase_jwt_secret: str

    # Anthropic
    anthropic_api_key: str
    claude_model: str = "claude-opus-4-20250514"

    # Resend (email)
    resend_api_key: str = ""

    # Encryption key for LMS credentials (Fernet, 32-byte base64)
    credential_encryption_key: str = ""

    # CORS origins
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://schoolpilot.co",
        "https://*.schoolpilot.co",
        "https://*.vercel.app",
    ]

    # Playwright
    playwright_headless: bool = True

    # Background jobs
    daily_sync_hour: int = 6  # 6 AM UTC

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
