# agent_routes.py — Browser agent control endpoints.
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.auth import get_current_user
from app.db import get_db
from app.agent.explorer import LMSExplorer

logger = logging.getLogger(__name__)
router = APIRouter()


class SyncRequest(BaseModel):
    job_type: str = "full_sync"


@router.post("/sync")
async def start_sync(
    body: SyncRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
):
    """Start a new LMS sync job. Runs in background."""
    db = get_db()

    # Check for running jobs
    running = (
        db.table("agent_jobs")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "running")
        .execute()
    )
    if running.data:
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
    user_id: str = Depends(get_current_user),
):
    """List recent agent jobs."""
    db = get_db()
    result = (
        db.table("agent_jobs")
        .select("id, job_type, status, pages_visited, data_extracted, error_message, started_at, completed_at, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


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
    user_id: str = Depends(get_current_user),
):
    """List extracted assignments."""
    db = get_db()
    query = db.table("lms_assignments").select("*").eq("user_id", user_id)

    if upcoming_only:
        now = datetime.now(timezone.utc).isoformat()
        query = query.gte("due_date", now)

    result = query.order("due_date").limit(limit).execute()
    return result.data or []


@router.get("/grades")
async def list_lms_grades(user_id: str = Depends(get_current_user)):
    """List LMS-extracted grades per course."""
    db = get_db()
    result = db.table("lms_grades").select("*").eq("user_id", user_id).execute()
    return result.data or []


@router.get("/sync-status")
async def sync_status(user_id: str = Depends(get_current_user)):
    """Get overall sync status: when was the last sync, is one running, etc."""
    db = get_db()

    # Last completed sync
    last = (
        db.table("agent_jobs")
        .select("id, status, completed_at, data_extracted, error_message")
        .eq("user_id", user_id)
        .eq("status", "completed")
        .order("completed_at", desc=True)
        .limit(1)
        .execute()
    )

    # Currently running?
    running = (
        db.table("agent_jobs")
        .select("id, started_at")
        .eq("user_id", user_id)
        .eq("status", "running")
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
        "last_sync": last.data[0] if last.data else None,
        "is_syncing": bool(running.data),
        "running_job_id": running.data[0]["id"] if running.data else None,
        "credentials": creds.data or [],
    }
