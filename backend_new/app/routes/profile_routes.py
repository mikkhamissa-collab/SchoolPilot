# profile_routes.py — Student profile and settings management.
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.auth import get_current_user
from app.memory.store import MemoryStore
from app.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    school_name: Optional[str] = None
    grade_level: Optional[str] = None
    timezone: Optional[str] = None
    goals: Optional[list[str]] = None
    patterns: Optional[dict] = None
    personality_preset: Optional[str] = None
    daily_briefing_enabled: Optional[bool] = None
    briefing_time: Optional[str] = None
    email_briefings: Optional[bool] = None


class OnboardingAnswer(BaseModel):
    step: str
    answers: dict


class ClassContextUpdate(BaseModel):
    teacher_name: Optional[str] = None
    teacher_style: Optional[str] = None
    difficulty_rating: Optional[str] = None
    student_goal: Optional[str] = None
    weak_areas: Optional[list[str]] = None
    strong_areas: Optional[list[str]] = None
    note: Optional[str] = None


@router.get("/me")
async def get_profile(user_id: str = Depends(get_current_user)):
    """Get the current student profile."""
    memory = MemoryStore(user_id)
    return await memory.get_profile()


@router.patch("/me")
async def update_profile(body: ProfileUpdate, user_id: str = Depends(get_current_user)):
    """Update student profile fields."""
    memory = MemoryStore(user_id)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    return await memory.update_profile(updates)


@router.post("/onboarding")
async def save_onboarding_step(body: OnboardingAnswer, user_id: str = Depends(get_current_user)):
    """Save answers from an onboarding step and advance to the next."""
    memory = MemoryStore(user_id)
    profile = await memory.get_profile()

    step = body.step
    answers = body.answers

    if step == "basics":
        await memory.update_profile({
            "display_name": answers.get("name", profile.get("display_name")),
            "school_name": answers.get("school"),
            "grade_level": answers.get("grade"),
            "timezone": answers.get("timezone", "America/New_York"),
            "onboarding_step": "personality",
        })
    elif step == "personality":
        await memory.update_profile({
            "personality_preset": answers.get("preset", "coach"),
            "onboarding_step": "goals",
        })
    elif step == "goals":
        await memory.update_profile({
            "goals": answers.get("goals", []),
            "onboarding_step": "lms",
        })
    elif step == "lms":
        # LMS credentials are saved via auth_routes, just advance
        await memory.update_profile({"onboarding_step": "classes"})
    elif step == "classes":
        # Per-class context saved via class context endpoints
        await memory.update_profile({"onboarding_step": "confirm"})
    elif step == "confirm":
        await memory.update_profile({
            "onboarding_complete": True,
            "onboarding_step": "done",
        })
    else:
        raise HTTPException(status_code=400, detail=f"Unknown onboarding step: {step}")

    return await memory.get_profile()


@router.get("/classes")
async def list_classes(user_id: str = Depends(get_current_user)):
    """List all class contexts."""
    memory = MemoryStore(user_id)
    return await memory.get_all_classes()


@router.get("/classes/{class_name}")
async def get_class(class_name: str, user_id: str = Depends(get_current_user)):
    """Get context for a specific class."""
    memory = MemoryStore(user_id)
    cls = await memory.get_class(class_name)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    return cls


@router.patch("/classes/{class_name}")
async def update_class(class_name: str, body: ClassContextUpdate, user_id: str = Depends(get_current_user)):
    """Update class context."""
    memory = MemoryStore(user_id)
    updates = {k: v for k, v in body.model_dump().items() if v is not None and k != "note"}
    if body.note:
        await memory.add_class_note(class_name, body.note)
    if updates:
        return await memory.update_class(class_name, updates)
    return await memory.get_class(class_name) or {"status": "updated"}


@router.get("/context")
async def get_full_context(user_id: str = Depends(get_current_user)):
    """Get the full assembled context (for debugging/display)."""
    memory = MemoryStore(user_id)
    context = await memory.build_context()
    return {"context": context}


@router.get("/export")
async def export_all_data(user_id: str = Depends(get_current_user)):
    """Export all student data (GDPR-style full data export)."""
    db = get_db()
    memory = MemoryStore(user_id)

    profile = await memory.get_profile()
    classes = await memory.get_all_classes()
    conversations = await memory.get_conversations(limit=1000)
    assignments = await memory.get_all_assignments(limit=1000)
    grades = await memory.get_all_grades()

    # Get all messages across all conversations
    all_messages = []
    for conv in conversations:
        msgs = await memory.get_conversation_messages(conv["id"], limit=10000)
        all_messages.extend(msgs)

    return {
        "exported_at": "now",
        "profile": profile,
        "classes": classes,
        "conversations": conversations,
        "messages": all_messages,
        "assignments": assignments,
        "grades": grades,
    }
