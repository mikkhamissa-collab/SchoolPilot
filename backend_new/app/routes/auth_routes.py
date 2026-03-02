# auth_routes.py — Authentication and credential management.
from __future__ import annotations
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from cryptography.fernet import Fernet
from app.auth import get_current_user
from app.db import get_db
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()


class LMSCredentialRequest(BaseModel):
    lms_type: str       # 'teamie', 'canvas', 'blackboard', 'google_classroom'
    lms_url: str        # 'https://lms.asl.org'
    username: str
    password: str


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
        "lms_url": body.lms_url.rstrip("/"),
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
