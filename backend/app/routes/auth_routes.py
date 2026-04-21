# auth_routes.py — Authentication and credential management.
from __future__ import annotations
import json
import logging
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from cryptography.fernet import Fernet
from app.agent.sync_utils import encrypt_credential, utcnow
from app.auth import get_current_user
from app.db import get_db
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()


class LMSCredentialRequest(BaseModel):
    lms_type: str       # 'teamie', 'canvas', 'blackboard', 'google_classroom', 'schoology', 'moodle'
    lms_url: str        # 'https://lms.asl.org'
    username: str
    password: str

    @field_validator("lms_type")
    @classmethod
    def validate_lms_type(cls, v):
        allowed = {"teamie", "canvas", "blackboard", "google_classroom", "schoology", "moodle"}
        if v.lower() not in allowed:
            raise ValueError(f"Invalid LMS type. Allowed: {', '.join(sorted(allowed))}")
        return v.lower()

    @field_validator("lms_url")
    @classmethod
    def validate_lms_url(cls, v):
        if not re.match(r'^https?://', v):
            raise ValueError("LMS URL must start with http:// or https://")
        dangerous = ["file://", "javascript:", "data:", "ftp://"]
        for scheme in dangerous:
            if v.lower().startswith(scheme):
                raise ValueError(f"Invalid URL scheme: {scheme}")
        return v.rstrip("/")


class LMSCredentialResponse(BaseModel):
    id: str
    lms_type: str
    lms_url: str
    last_login_success: Optional[bool]
    last_sync_at: Optional[str]
    sync_enabled: bool


@router.post("/lms-credentials", response_model=LMSCredentialResponse)
async def save_lms_credentials(body: LMSCredentialRequest, user_id: str = Depends(get_current_user)):
    """Save encrypted LMS credentials for server-side browser automation."""
    settings = get_settings()
    if not settings.credential_encryption_key:
        raise HTTPException(status_code=500, detail="Encryption not configured")

    f = Fernet(settings.credential_encryption_key.encode())
    encrypted_username = f.encrypt(body.username.encode()).decode()
    encrypted_password = f.encrypt(body.password.encode()).decode()

    db = get_db()
    result = db.table("lms_credentials").upsert({
        "user_id": user_id,
        "lms_type": body.lms_type,
        "lms_url": body.lms_url,
        "encrypted_username": encrypted_username,
        "encrypted_password": encrypted_password,
        "sync_enabled": True,
    }, on_conflict="user_id,lms_type").execute()

    row = result.data[0] if result.data else {}
    return LMSCredentialResponse(
        id=row.get("id", ""),
        lms_type=row.get("lms_type", body.lms_type),
        lms_url=row.get("lms_url", body.lms_url),
        last_login_success=row.get("last_login_success"),
        last_sync_at=row.get("last_sync_at"),
        sync_enabled=row.get("sync_enabled", True),
    )


@router.get("/lms-credentials")
async def get_lms_credentials(user_id: str = Depends(get_current_user)):
    """Get saved LMS credentials (without the actual passwords)."""
    db = get_db()
    result = db.table("lms_credentials").select(
        "id, lms_type, lms_url, last_login_success, last_login_at, last_sync_at, sync_enabled, last_error"
    ).eq("user_id", user_id).execute()
    return result.data or []


@router.delete("/lms-credentials/{cred_id}")
async def delete_lms_credentials(cred_id: str, user_id: str = Depends(get_current_user)):
    """Delete stored LMS credentials."""
    db = get_db()
    db.table("lms_credentials").delete().eq("id", cred_id).eq("user_id", user_id).execute()
    return {"status": "deleted"}


# ── LMS session cookies (captured by the Chrome extension) ───────────────────

class LmsCookie(BaseModel):
    """A single browser cookie captured from the student's LMS session.

    The field names mirror Chrome's cookies API + Playwright's add_cookies
    format so the extension can pass them through verbatim.
    """
    name: str
    value: str
    domain: str
    path: str = "/"
    secure: bool = True
    httpOnly: bool = False
    sameSite: Optional[str] = None
    expirationDate: Optional[float] = None


class LmsCookiesPayload(BaseModel):
    lms_type: str = "teamie"
    lms_url: str
    cookies: list[LmsCookie]

    @field_validator("lms_type")
    @classmethod
    def _validate_lms_type(cls, v: str) -> str:
        allowed = {"teamie", "canvas", "blackboard", "google_classroom", "schoology", "moodle"}
        if v.lower() not in allowed:
            raise ValueError(f"Invalid LMS type. Allowed: {', '.join(sorted(allowed))}")
        return v.lower()

    @field_validator("lms_url")
    @classmethod
    def _validate_lms_url(cls, v: str) -> str:
        if not re.match(r"^https?://", v):
            raise ValueError("LMS URL must start with http:// or https://")
        for scheme in ("file://", "javascript:", "data:", "ftp://"):
            if v.lower().startswith(scheme):
                raise ValueError(f"Invalid URL scheme: {scheme}")
        return v.rstrip("/")


@router.post("/lms-cookies")
async def save_lms_cookies(
    body: LmsCookiesPayload,
    user_id: str = Depends(get_current_user),
):
    """Save encrypted LMS session cookies captured by the Chrome extension.

    The extension POSTs the student's authenticated teamie cookies here after
    they've logged in with Google SSO in their own browser. We encrypt the JSON
    blob and stash it on ``lms_credentials.encrypted_session_cookies``; the
    Playwright sync agent replays it so we never have to touch SSO server-side.
    """
    if not 1 <= len(body.cookies) <= 100:
        raise HTTPException(status_code=400, detail="Must provide 1–100 cookies")

    cookies_json = json.dumps([c.model_dump() for c in body.cookies])
    encrypted = encrypt_credential(cookies_json)
    now_iso = utcnow()

    db = get_db()
    db.table("lms_credentials").upsert(
        {
            "user_id": user_id,
            "lms_type": body.lms_type,
            "lms_url": body.lms_url,
            "encrypted_session_cookies": encrypted,
            "cookies_updated_at": now_iso,
            "sync_enabled": True,
        },
        on_conflict="user_id,lms_type",
    ).execute()

    return {
        "ok": True,
        "cookies_stored": len(body.cookies),
        "updated_at": now_iso,
    }
