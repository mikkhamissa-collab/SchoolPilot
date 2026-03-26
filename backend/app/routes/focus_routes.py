"""Focus timer endpoints — session logging and stats."""
import logging
from datetime import datetime, date, timezone, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import get_current_user
from app.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _get_user_tz(db, user_id: str) -> str:
    """Look up the user's configured timezone, defaulting to UTC."""
    try:
        result = db.table("student_profiles").select("timezone").eq("user_id", user_id).execute()
        if result.data:
            return result.data[0].get("timezone", "UTC") or "UTC"
    except Exception:
        pass
    return "UTC"


class FocusSessionRequest(BaseModel):
    duration_minutes: int = Field(gt=0, le=480, description="Duration 1-480 minutes")
    focus_type: Optional[str] = Field(default="pomodoro", pattern=r"^(pomodoro|deep_work|quick|custom)$")
    assignment_id: Optional[str] = None


@router.post("/session")
@limiter.limit("30/hour")
async def log_focus_session(request: Request, body: FocusSessionRequest, user_id: str = Depends(get_current_user)):
    db = get_db()
    row = {
        "user_id": user_id,
        "duration_minutes": body.duration_minutes,
        "focus_type": body.focus_type,
    }
    if body.assignment_id:
        row["assignment_id"] = body.assignment_id

    result = db.table("study_sessions").insert(row).execute()
    session = result.data[0] if result.data else {}

    # Update streak using user's timezone
    tz_name = _get_user_tz(db, user_id)
    streak_ok = _update_streak(db, user_id, tz_name)
    session["streak_updated"] = streak_ok

    return session


@router.get("/stats")
@limiter.limit("30/minute")
async def get_focus_stats(request: Request, user_id: str = Depends(get_current_user)):
    db = get_db()
    tz = ZoneInfo(_get_user_tz(db, user_id))
    user_today = datetime.now(tz).date()
    today_start = datetime.combine(user_today, datetime.min.time(), tzinfo=tz).astimezone(timezone.utc).isoformat()
    week_ago = datetime.combine(user_today - timedelta(days=7), datetime.min.time(), tzinfo=tz).astimezone(timezone.utc).isoformat()

    today_sessions = (
        db.table("study_sessions")
        .select("duration_minutes, focus_type")
        .eq("user_id", user_id)
        .gte("completed_at", today_start)
        .execute()
    )

    week_sessions = (
        db.table("study_sessions")
        .select("duration_minutes")
        .eq("user_id", user_id)
        .gte("completed_at", week_ago)
        .execute()
    )

    streak_data = (
        db.table("streaks")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    today_minutes = sum(s["duration_minutes"] for s in (today_sessions.data or []))
    week_minutes = sum(s["duration_minutes"] for s in (week_sessions.data or []))
    streak = streak_data.data[0] if streak_data.data else {"current_streak": 0, "longest_streak": 0, "total_active_days": 0}

    return {
        "today_sessions": len(today_sessions.data or []),
        "today_minutes": today_minutes,
        "week_minutes": week_minutes,
        "current_streak": streak.get("current_streak", 0),
        "longest_streak": streak.get("longest_streak", 0),
        "total_active_days": streak.get("total_active_days", 0),
    }


def _update_streak(db, user_id: str, tz_name: str = "UTC") -> bool:
    """Update the user's streak. Returns True on success, False on failure."""
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")
    today = datetime.now(tz).date()
    try:
        result = db.table("streaks").select("*").eq("user_id", user_id).execute()
        if result.data:
            streak = result.data[0]
            last_active = streak.get("last_active_date")
            if last_active:
                last_date = date.fromisoformat(last_active) if isinstance(last_active, str) else last_active
                if last_date == today:
                    return True  # Already counted today
                elif last_date == today - timedelta(days=1):
                    new_current = streak.get("current_streak", 0) + 1
                else:
                    new_current = 1
            else:
                new_current = 1

            new_longest = max(streak.get("longest_streak", 0), new_current)
            db.table("streaks").update({
                "current_streak": new_current,
                "longest_streak": new_longest,
                "last_active_date": today.isoformat(),
                "total_active_days": streak.get("total_active_days", 0) + 1,
            }).eq("user_id", user_id).execute()
        else:
            db.table("streaks").insert({
                "user_id": user_id,
                "current_streak": 1,
                "longest_streak": 1,
                "last_active_date": today.isoformat(),
                "total_active_days": 1,
            }).execute()
        return True
    except Exception:
        logger.exception("Failed to update streak for user %s", user_id)
        return False
