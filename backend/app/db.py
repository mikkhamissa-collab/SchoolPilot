# db.py — Supabase client initialization.
from __future__ import annotations
from supabase import create_client, Client
from app.config import get_settings

_client: Client | None = None


def get_db() -> Client:
    """Lazy-init singleton Supabase admin client."""
    global _client
    if _client is None:
        s = get_settings()
        _client = create_client(s.supabase_url, s.supabase_service_key)
    return _client
