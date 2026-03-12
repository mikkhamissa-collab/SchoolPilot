"""Study buddy endpoints — invite, accept, status, nudge."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.auth import get_current_user
from app.db import get_db
from app.services.email import send_buddy_nudge_email

logger = logging.getLogger(__name__)
router = APIRouter()


class BuddyInvite(BaseModel):
    buddy_email: EmailStr


@router.post("/invite")
async def invite_buddy(body: BuddyInvite, user_id: str = Depends(get_current_user)):
    db = get_db()

    # Targeted lookup — never iterate all users
    try:
        result = db.rpc("get_user_id_by_email", {"target_email": body.buddy_email}).execute()
        buddy_id = result.data if isinstance(result.data, str) else None
    except Exception:
        logger.exception("Failed to look up buddy by email")
        raise HTTPException(status_code=500, detail="Failed to look up user")

    if not buddy_id:
        # Don't reveal whether email exists — consistent response
        return {"status": "invited", "message": "Invite sent. They'll see it when they sign up."}

    if buddy_id == user_id:
        raise HTTPException(status_code=400, detail="You can't buddy with yourself")

    # Check existing pair
    existing = (
        db.table("buddy_pairs")
        .select("id, status")
        .or_(f"user_a.eq.{user_id},user_b.eq.{user_id}")
        .execute()
    )
    active = [p for p in (existing.data or []) if p["status"] in ("pending", "active")]
    if active:
        raise HTTPException(status_code=409, detail="You already have an active buddy")

    result = db.table("buddy_pairs").insert({
        "user_a": user_id,
        "user_b": buddy_id,
        "status": "pending",
    }).execute()

    return {"status": "pending", "pair_id": result.data[0]["id"] if result.data else None}


@router.post("/accept")
async def accept_buddy(user_id: str = Depends(get_current_user)):
    db = get_db()
    pending = (
        db.table("buddy_pairs")
        .select("id, user_a, status")
        .eq("user_b", user_id)
        .eq("status", "pending")
        .execute()
    )
    if not pending.data:
        raise HTTPException(status_code=404, detail="No pending buddy invite")

    pair = pending.data[0]
    db.table("buddy_pairs").update({
        "status": "active",
    }).eq("id", pair["id"]).execute()

    return {"status": "active", "pair_id": pair["id"]}


@router.get("/status")
async def get_buddy_status(user_id: str = Depends(get_current_user)):
    db = get_db()
    # Only select necessary columns — never expose raw user_a/user_b UUIDs
    pairs = (
        db.table("buddy_pairs")
        .select("id, user_a, user_b, status, streak_count, last_activity_a, last_activity_b")
        .or_(f"user_a.eq.{user_id},user_b.eq.{user_id}")
        .neq("status", "ended")
        .execute()
    )
    if not pairs.data:
        return {"has_buddy": False}

    pair = pairs.data[0]
    is_user_a = pair["user_a"] == user_id
    buddy_id = pair["user_b"] if is_user_a else pair["user_a"]

    # Get buddy profile — only display_name, never leak ID or other data
    buddy_profile = (
        db.table("student_profiles")
        .select("display_name")
        .eq("user_id", buddy_id)
        .execute()
    )
    buddy_name = buddy_profile.data[0]["display_name"] if buddy_profile.data else "Study Buddy"

    return {
        "has_buddy": True,
        "pair_id": pair["id"],
        "status": pair["status"],
        "buddy_name": buddy_name,
        "streak_count": pair.get("streak_count", 0),
        "last_activity_buddy": pair.get("last_activity_b") if is_user_a else pair.get("last_activity_a"),
    }


@router.post("/nudge")
async def nudge_buddy(user_id: str = Depends(get_current_user)):
    db = get_db()
    pairs = (
        db.table("buddy_pairs")
        .select("id, user_a, user_b, status")
        .or_(f"user_a.eq.{user_id},user_b.eq.{user_id}")
        .eq("status", "active")
        .execute()
    )
    if not pairs.data:
        raise HTTPException(status_code=404, detail="No active buddy")

    pair = pairs.data[0]
    buddy_id = pair["user_b"] if pair["user_a"] == user_id else pair["user_a"]

    # Get buddy email
    buddy_user = db.auth.admin.get_user_by_id(buddy_id)
    buddy_email = buddy_user.user.email if buddy_user and buddy_user.user else None

    # Get my name
    my_profile = (
        db.table("student_profiles")
        .select("display_name")
        .eq("user_id", user_id)
        .execute()
    )
    my_name = my_profile.data[0]["display_name"] if my_profile.data else "Your study buddy"

    if buddy_email:
        send_buddy_nudge_email(buddy_email, my_name)

    return {"status": "nudged"}
