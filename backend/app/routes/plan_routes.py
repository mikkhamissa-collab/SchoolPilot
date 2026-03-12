"""Daily plan generation endpoints."""
import json
import logging
from typing import Optional

import anthropic

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import get_current_user
from app.config import get_settings
from app.memory.store import MemoryStore
from app.prompts.planner import MORNING_BRIEFING_PROMPT, GRADE_IMPACT_PROMPT, PANIC_MODE_PROMPT

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class PlanRequest(BaseModel):
    regenerate: bool = False


class PanicRequest(BaseModel):
    assignment: str
    hours_available: Optional[float] = None


class StudySessionDiagnosticRequest(BaseModel):
    assignmentName: str
    course: str
    courseContent: Optional[str] = None


class StudySessionRequest(BaseModel):
    assignmentName: str
    assignmentType: str = "assignment"
    course: str
    currentGrade: Optional[float] = None
    targetScore: Optional[float] = None
    courseContent: Optional[str] = None
    studentProfile: Optional[dict] = None
    availableMinutes: int = 120


@router.get("/today")
async def get_today_plan(user_id: str = Depends(get_current_user)):
    memory = MemoryStore(user_id)
    context = await memory.build_context()
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    try:
        response = await client.messages.create(
            model=settings.claude_model,
            max_tokens=1500,
            system=MORNING_BRIEFING_PROMPT,
            messages=[{"role": "user", "content": context}],
            timeout=30.0,
        )
    except anthropic.APITimeoutError:
        raise HTTPException(status_code=504, detail="AI service timed out. Please try again.")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=502, detail="Cannot reach AI service. Please try again.")
    text = response.content[0].text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw": text}


@router.post("/generate")
@limiter.limit("5/minute")
async def regenerate_plan(request: Request, body: PlanRequest, user_id: str = Depends(get_current_user)):
    return await get_today_plan(user_id=user_id)


@router.post("/email")
async def send_plan_email(user_id: str = Depends(get_current_user)):
    from app.services.email import send_briefing_email
    from datetime import datetime, timezone

    memory = MemoryStore(user_id)
    context = await memory.build_context()
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    db = memory.db

    try:
        response = await client.messages.create(
            model=settings.claude_model,
            max_tokens=1500,
            system=MORNING_BRIEFING_PROMPT + "\n\nFormat the output as clean HTML for an email. Use dark theme colors (background #0a0a1a, text #e0e0e0, accent #7c3aed).",
            messages=[{"role": "user", "content": context}],
            timeout=30.0,
        )
    except anthropic.APITimeoutError:
        raise HTTPException(status_code=504, detail="AI service timed out. Please try again.")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=502, detail="Cannot reach AI service. Please try again.")

    user_data = db.auth.admin.get_user_by_id(user_id)
    user_email = user_data.user.email if user_data and user_data.user else None
    if not user_email:
        return {"status": "error", "message": "No email found"}

    today = datetime.now(timezone.utc).strftime("%A, %B %d, %Y")
    send_briefing_email(user_email, response.content[0].text, today)
    return {"status": "sent"}


@router.post("/panic")
async def panic_mode(body: PanicRequest, user_id: str = Depends(get_current_user)):
    memory = MemoryStore(user_id)
    context = await memory.build_context()
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    user_content = f"{context}\n\nPANIC: {body.assignment}"
    if body.hours_available:
        user_content += f"\nTime available: {body.hours_available} hours"

    try:
        response = await client.messages.create(
            model=settings.claude_model,
            max_tokens=1500,
            system=PANIC_MODE_PROMPT,
            messages=[{"role": "user", "content": user_content}],
            timeout=30.0,
        )
    except anthropic.APITimeoutError:
        raise HTTPException(status_code=504, detail="AI service timed out. Please try again.")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=502, detail="Cannot reach AI service. Please try again.")
    text = response.content[0].text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw": text}


# ── Study session endpoints ─────────────────────────────────────────


DIAGNOSTIC_PROMPT = """You are creating a quick diagnostic quiz for a student about to study.
Generate 3-5 short multiple-choice questions to assess the student's current understanding.

The student is studying: {assignment} for {course}.

Output valid JSON:
{{
    "course": "{course}",
    "assignment": "{assignment}",
    "intro_message": "Let's see where you stand...",
    "questions": [
        {{
            "id": "q1",
            "topic": "string (the concept being tested)",
            "question": "string",
            "options": ["A", "B", "C", "D"],
            "correct": "the correct option text",
            "difficulty": "easy|medium|hard",
            "what_it_tells_us": "string"
        }}
    ]
}}"""


SESSION_PROMPT = """You are building a personalized study session plan for a high school student.

Assignment: {assignment} ({assignment_type})
Course: {course}
{grade_context}
{profile_context}
{content_context}
Available time: {available_minutes} minutes

Create a structured study plan broken into timed chunks. Each chunk should be focused and actionable.

RULES:
- Total time across all chunks should not exceed available time
- Start with weakest areas first
- Include practice problems where relevant
- Be specific — not "review chapter 5" but "work through the 3 types of chemical bonds"
- Include explanations for deep review chunks (tutor mode)

Output valid JSON:
{{
    "assignment": "{assignment}",
    "course": "{course}",
    "total_time_minutes": number,
    "chunks": [
        {{
            "step": 1,
            "title": "string",
            "focus": "string (what exactly to do)",
            "minutes": number,
            "done_when": "string (how student knows they're done)",
            "tip": "string",
            "type": "deep_review|practice|review|warm_up",
            "explanation": "string or null (detailed explanation for tutor mode)",
            "practice_problems": [
                {{"problem": "string", "hint": "string", "answer": "string"}}
            ]
        }}
    ],
    "key_concepts": ["string"],
    "cheat_sheet": ["string (quick reference items)"],
    "prediction": "string (grade projection after studying)",
    "encouragement": "string (not cheesy)"
}}"""


@router.post("/study-session/diagnostic")
@limiter.limit("10/minute")
async def study_session_diagnostic(
    request: Request,
    body: StudySessionDiagnosticRequest,
    user_id: str = Depends(get_current_user),
):
    """Generate diagnostic quiz before a study session."""
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    prompt = DIAGNOSTIC_PROMPT.format(
        assignment=body.assignmentName,
        course=body.course,
    )
    user_content = f"Generate a diagnostic for: {body.assignmentName} in {body.course}"
    if body.courseContent:
        user_content += f"\n\nCourse materials context:\n{body.courseContent[:3000]}"

    try:
        response = await client.messages.create(
            model=settings.claude_model,
            max_tokens=1500,
            system=prompt,
            messages=[{"role": "user", "content": user_content}],
            timeout=30.0,
        )
    except anthropic.APITimeoutError:
        raise HTTPException(status_code=504, detail="AI service timed out.")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=502, detail="Cannot reach AI service.")

    text = response.content[0].text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"course": body.course, "assignment": body.assignmentName, "questions": [], "intro_message": text}


@router.post("/study-session")
@limiter.limit("10/minute")
async def generate_study_session(
    request: Request,
    body: StudySessionRequest,
    user_id: str = Depends(get_current_user),
):
    """Generate a full study session plan with timed chunks."""
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    grade_context = ""
    if body.currentGrade is not None:
        grade_context = f"Current grade: {body.currentGrade}%"
        if body.targetScore is not None:
            grade_context += f" | Target: {body.targetScore}%"

    profile_context = ""
    if body.studentProfile:
        strong = body.studentProfile.get("strong_topics", [])
        weak = body.studentProfile.get("weak_topics", [])
        if strong:
            profile_context += f"Strong areas: {', '.join(strong)}\n"
        if weak:
            profile_context += f"Weak areas (focus here): {', '.join(weak)}\n"

    content_context = ""
    if body.courseContent:
        content_context = f"Course materials:\n{body.courseContent[:3000]}"

    prompt = SESSION_PROMPT.format(
        assignment=body.assignmentName,
        assignment_type=body.assignmentType,
        course=body.course,
        grade_context=grade_context,
        profile_context=profile_context,
        content_context=content_context,
        available_minutes=body.availableMinutes,
    )

    try:
        response = await client.messages.create(
            model=settings.claude_model,
            max_tokens=3000,
            system=prompt,
            messages=[{"role": "user", "content": f"Create a study plan for: {body.assignmentName}"}],
            timeout=30.0,
        )
    except anthropic.APITimeoutError:
        raise HTTPException(status_code=504, detail="AI service timed out.")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=502, detail="Cannot reach AI service.")

    text = response.content[0].text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"assignment": body.assignmentName, "course": body.course, "total_time_minutes": body.availableMinutes, "chunks": [], "prediction": "", "encouragement": text}
