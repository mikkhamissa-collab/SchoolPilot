# agent_routes.py — Browser agent control endpoints.
from __future__ import annotations
import json
import logging
from datetime import datetime, timezone
from cryptography.fernet import Fernet
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.auth import get_current_user
from app.config import get_settings
from app.db import get_db
from app.agent.explorer import LMSExplorer

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class SyncRequest(BaseModel):
    job_type: str = "full_sync"


@router.post("/sync")
@limiter.limit("5/hour")
async def start_sync(
    request: Request,
    body: SyncRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
):
    """Start a new LMS sync job. Runs in background."""
    db = get_db()

    # Check for running jobs — but expire stale ones (>5 min)
    from datetime import timedelta
    running = (
        db.table("agent_jobs")
        .select("id, created_at")
        .eq("user_id", user_id)
        .in_("status", ["running", "pending"])
        .execute()
    )
    if running.data:
        for job in running.data:
            created = datetime.fromisoformat(job["created_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - created > timedelta(minutes=5):
                # Stale job — mark as failed
                db.table("agent_jobs").update({
                    "status": "failed",
                    "error_message": "Job timed out (stale)",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", job["id"]).execute()
                logger.warning("Cleaned up stale job %s (created %s)", job["id"], job["created_at"])
            else:
                raise HTTPException(status_code=409, detail="A sync is already running")

    # Create job record
    job = db.table("agent_jobs").insert({
        "user_id": user_id,
        "job_type": body.job_type,
        "status": "pending",
    }).execute()

    job_id = job.data[0]["id"] if job.data else None
    if not job_id:
        raise HTTPException(status_code=500, detail="Failed to create job")

    # Run exploration in background
    async def run_exploration():
        explorer = LMSExplorer(user_id, job_id)
        await explorer.run()

    background_tasks.add_task(run_exploration)

    return {"job_id": job_id, "status": "pending"}


@router.get("/jobs")
async def list_jobs(
    limit: int = 10,
    offset: int = 0,
    user_id: str = Depends(get_current_user),
):
    """List recent agent jobs with pagination."""
    db = get_db()
    result = (
        db.table("agent_jobs")
        .select("id, job_type, status, pages_visited, data_extracted, error_message, started_at, completed_at, created_at", count="exact")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {
        "data": result.data or [],
        "total": result.count or 0,
        "limit": limit,
        "offset": offset,
    }


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, user_id: str = Depends(get_current_user)):
    """Get status of a specific job."""
    db = get_db()
    result = (
        db.table("agent_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return result.data[0]


@router.get("/assignments")
async def list_assignments(
    upcoming_only: bool = True,
    limit: int = 30,
    offset: int = 0,
    user_id: str = Depends(get_current_user),
):
    """List extracted assignments with pagination."""
    db = get_db()
    query = db.table("lms_assignments").select("*", count="exact").eq("user_id", user_id)

    if upcoming_only:
        now = datetime.now(timezone.utc).isoformat()
        query = query.gte("due_date", now)

    result = query.order("due_date").range(offset, offset + limit - 1).execute()
    return {
        "data": result.data or [],
        "total": result.count or 0,
        "limit": limit,
        "offset": offset,
    }


@router.get("/grades")
async def list_lms_grades(user_id: str = Depends(get_current_user)):
    """List LMS-extracted grades per course."""
    db = get_db()
    result = db.table("lms_grades").select("*").eq("user_id", user_id).execute()
    return result.data or []


class CookieSaveRequest(BaseModel):
    cookies: list
    lms_url: str


@router.post("/sync/cookies")
async def save_cookies(
    body: CookieSaveRequest,
    user_id: str = Depends(get_current_user),
):
    """Standalone cookie save endpoint (backup for WebSocket flow)."""
    settings = get_settings()
    fernet = Fernet(settings.credential_encryption_key.encode("utf-8"))
    encrypted_cookies = fernet.encrypt(
        json.dumps(body.cookies).encode("utf-8")
    ).decode("utf-8")

    # Clean URL
    lms_url = body.lms_url.split("#")[0].rstrip("/")
    for suffix in ["/dash", "/dashboard", "/home"]:
        if lms_url.endswith(suffix):
            lms_url = lms_url[:-len(suffix)]
            break

    now_iso = datetime.now(timezone.utc).isoformat()
    db = get_db()
    db.table("lms_credentials").upsert(
        {
            "user_id": user_id,
            "lms_type": "teamie",
            "lms_url": lms_url,
            "encrypted_session_cookies": encrypted_cookies,
            "cookies_updated_at": now_iso,
            "last_login_success": True,
            "last_login_at": now_iso,
            "sync_enabled": True,
        },
        on_conflict="user_id,lms_type",
    ).execute()

    return {"status": "ok", "message": "Cookies saved successfully"}


@router.get("/sync/debug-screenshot")
async def debug_screenshot(user_id: str = Depends(get_current_user)):
    """Inject cookies, navigate to dashboard, return screenshot of what the agent sees."""
    import asyncio as _asyncio
    import json as _json

    from app.agent.browser import BrowserAgent

    db = get_db()
    creds = (
        db.table("lms_credentials")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not creds.data:
        raise HTTPException(404, "No credentials found")

    cred = creds.data[0]
    cookie_cipher = cred.get("encrypted_session_cookies") or cred.get("encrypted_cookies")
    if not cookie_cipher:
        raise HTTPException(400, "No cookies saved — connect your LMS first")

    settings = get_settings()
    fernet = Fernet(settings.credential_encryption_key.encode("utf-8"))
    cookies = _json.loads(
        fernet.decrypt(cookie_cipher.encode()).decode()
    )
    lms_url = cred["lms_url"].rstrip("/") + "/dash/#/"

    agent = BrowserAgent(user_id)
    try:
        await agent.start()
        authenticated = await agent.inject_cookies_and_verify(cookies, lms_url)

        # Wait extra time for SPA to fully render
        await _asyncio.sleep(5)
        try:
            assert agent.page is not None
            await agent.page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            logger.debug("Debug screenshot networkidle wait timed out (expected for SPAs)")

        screenshot_b64 = await agent.screenshot()
        current_url = agent.page.url if agent.page else "unknown"

        # Also get page text content for diagnosis
        page_text = ""
        if agent.page:
            page_text = await agent.page.evaluate(
                "document.body?.innerText?.substring(0, 3000) || 'empty'"
            )

        return {
            "authenticated": authenticated,
            "current_url": current_url,
            "screenshot_b64": screenshot_b64,
            "page_text_preview": page_text[:2000],
            "cookies_injected": len(cookies),
        }
    finally:
        await agent.stop()


@router.get("/sync-status")
async def sync_status(user_id: str = Depends(get_current_user)):
    """Get overall sync status: when was the last sync, is one running, etc."""
    db = get_db()

    # Last completed sync (successful)
    last = (
        db.table("agent_jobs")
        .select("id, status, completed_at, data_extracted, error_message")
        .eq("user_id", user_id)
        .eq("status", "completed")
        .order("completed_at", desc=True)
        .limit(1)
        .execute()
    )

    # Most recent job (any status) — so frontend can detect failures
    latest = (
        db.table("agent_jobs")
        .select("id, status, completed_at, data_extracted, error_message, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    # Currently running?
    running = (
        db.table("agent_jobs")
        .select("id, started_at")
        .eq("user_id", user_id)
        .in_("status", ["running", "pending"])
        .execute()
    )

    # Credential status
    creds = (
        db.table("lms_credentials")
        .select("lms_type, last_login_success, last_sync_at, sync_enabled")
        .eq("user_id", user_id)
        .execute()
    )

    return {
        "last_sync": latest.data[0] if latest.data else (last.data[0] if last.data else None),
        "is_syncing": bool(running.data),
        "running_job_id": running.data[0]["id"] if running.data else None,
        "credentials": creds.data or [],
    }
