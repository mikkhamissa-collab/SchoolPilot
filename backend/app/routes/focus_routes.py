"""Focus timer endpoints — session logging and stats."""
import logging
from datetime import datetime, date, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


class FocusSessionRequest(BaseModel):
    duration_minutes: int = Field(gt=0, le=480, description="Duration 1-480 minutes")
    focus_type: Optional[str] = Field(default="pomodoro", pattern=r"^(pomodoro|deep_work|quick|custom)$")
    assignment_id: Optional[str] = None


@router.post("/session")
async def log_focus_session(body: FocusSessionRequest, user_id: str = Depends(get_current_user)):
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

    # Update streak
    _update_streak(db, user_id)

    return session


@router.get("/stats")
async def get_focus_stats(user_id: str = Depends(get_current_user)):
    db = get_db()
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

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


def _update_streak(db, user_id: str):
    today = date.today()
    try:
        result = db.table("streaks").select("*").eq("user_id", user_id).execute()
        if result.data:
            streak = result.data[0]
            last_active = streak.get("last_active_date")
            if last_active:
                last_date = date.fromisoformat(last_active) if isinstance(last_active, str) else last_active
                if last_date == today:
                    return  # Already counted today
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
    except Exception:
        logger.exception("Failed to update streak for user %s", user_id)
