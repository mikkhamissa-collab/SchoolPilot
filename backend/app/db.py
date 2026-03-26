# db.py — Supabase client initialization.
# Two clients: admin (service key, bypasses RLS) and user-scoped (respects RLS).
from __future__ import annotations
from supabase import create_client, Client
from fastapi import Request
from app.config import get_settings

_client: Client | None = None


def get_db() -> Client:
    """Lazy-init singleton Supabase admin client (service key).

    ONLY use for:
    - Scheduler jobs (no user request context)
    - Explorer/agent runs (server-side automation)
    - Admin lookups (db.auth.admin.get_user_by_id)
    - Health checks

    For user-facing routes, use ``get_user_db(request)`` instead.
    """
    global _client
    if _client is None:
        s = get_settings()
        _client = create_client(s.supabase_url, s.supabase_service_key)
    return _client


def get_user_db(request: Request) -> Client:
    """Create a Supabase client scoped to the requesting user's JWT.

    This client respects Row Level Security (RLS). Even if a route
    forgets to filter by user_id, the database will enforce it.

    Falls back to the admin client if no valid token is present
    (shouldn't happen since routes use ``get_current_user`` first).
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return get_db()  # fallback — should not happen in practice

    token = auth_header[7:]
    s = get_settings()
    return create_client(
        s.supabase_url,
        s.supabase_service_key,  # anon key would be better but service key with RLS works too
        options={"headers": {"Authorization": f"Bearer {token}"}},
    )
