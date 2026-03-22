# auth.py — JWT verification for Supabase auth tokens.
# Supports both legacy HS256 (shared secret) and modern JWKS (ECC/RSA) verification.
import logging
import time
import httpx
from fastapi import HTTPException, Request
from jose import jwt, JWTError
from app.config import get_settings

logger = logging.getLogger(__name__)

# TTL-based JWKS cache (refreshes every 6 hours instead of caching forever)
_jwks_cache: dict = {}
_jwks_cache_time: float = 0
_JWKS_TTL = 6 * 60 * 60  # 6 hours


def _fetch_jwks(supabase_url: str) -> dict:
    """Fetch the JWKS from Supabase's well-known endpoint.

    Uses a TTL-based cache that expires every 6 hours so key rotations
    are picked up without requiring a process restart.
    """
    global _jwks_cache, _jwks_cache_time
    now = time.time()
    if _jwks_cache and (now - _jwks_cache_time) < _JWKS_TTL:
        return _jwks_cache
    url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
    try:
        resp = httpx.get(url, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_cache_time = now
        return _jwks_cache
    except Exception:
        logger.warning("Failed to fetch JWKS from %s", url, exc_info=True)
        return _jwks_cache if _jwks_cache else {"keys": []}


def _get_signing_key(token: str, jwks: dict):
    """Find the matching public key from JWKS for the given token's kid."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        return None

    kid = header.get("kid")
    if not kid:
        return None

    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            return key_data

    return None


async def get_current_user(request: Request) -> str:
    """Extract and verify user_id from the Authorization header.

    Accepts: Bearer <supabase_access_token>
    Returns: user_id (UUID string)
    Raises: 401 if token is missing/invalid

    Verification strategy:
    1. Try JWKS-based verification (ECC/RSA) — modern Supabase projects
    2. Fall back to HS256 with the legacy JWT secret
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization token")

    token = auth_header[7:]
    settings = get_settings()

    # Attempt 1: JWKS-based verification (asymmetric — ECC P-256 or RSA)
    jwks = _fetch_jwks(settings.supabase_url)
    signing_key = _get_signing_key(token, jwks)

    if signing_key:
        try:
            alg = signing_key.get("alg", "ES256")
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[alg],
                audience="authenticated",
            )
            user_id = payload.get("sub")
            if not user_id:
                logger.warning("JWKS token missing subject claim")
                raise HTTPException(status_code=401, detail="Authentication failed. Please sign in again.")
            return user_id
        except JWTError:
            logger.debug("JWKS verification failed, trying HS256 fallback", exc_info=True)

    # Attempt 2: Legacy HS256 with shared secret
    if settings.supabase_jwt_secret:
        try:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
            user_id = payload.get("sub")
            if not user_id:
                logger.warning("HS256 token missing subject claim")
                raise HTTPException(status_code=401, detail="Authentication failed. Please sign in again.")
            return user_id
        except JWTError as e:
            logger.warning("HS256 token verification failed: %s", e)
            raise HTTPException(status_code=401, detail="Authentication failed. Please sign in again.")

    raise HTTPException(status_code=401, detail="Authentication failed. Please sign in again.")


async def verify_jwt(token: str) -> str:
    """Standalone JWT verification — returns user_id or raises ValueError.

    Same logic as get_current_user but doesn't require a FastAPI Request object.
    Used for WebSocket auth where we get the token from query params.
    """
    settings = get_settings()

    # Attempt 1: JWKS-based verification
    jwks = _fetch_jwks(settings.supabase_url)
    signing_key = _get_signing_key(token, jwks)

    if signing_key:
        try:
            alg = signing_key.get("alg", "ES256")
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[alg],
                audience="authenticated",
            )
            user_id = payload.get("sub")
            if not user_id:
                raise ValueError("Token missing subject claim")
            return user_id
        except JWTError:
            pass

    # Attempt 2: Legacy HS256
    if settings.supabase_jwt_secret:
        try:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
            user_id = payload.get("sub")
            if not user_id:
                raise ValueError("Token missing subject claim")
            return user_id
        except JWTError:
            pass

    raise ValueError("Invalid token")
