"""Study tools endpoints — guides, flashcards, quizzes, explanations, summaries.

Includes per-user caching via study_content table and rate limiting.
"""
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
from app.db import get_db
from app.prompts.study import (
    STUDY_GUIDE_PROMPT, FLASHCARD_PROMPT, QUIZ_PROMPT,
    EXPLAIN_PROMPT, SUMMARY_PROMPT,
)

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class StudyRequest(BaseModel):
    course: str
    topic: str
    additional_context: Optional[str] = None


async def _call_claude(system_prompt: str, user_content: str, max_tokens: int = 2048) -> str:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model=settings.claude_model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
            timeout=30.0,
        )
    except anthropic.APITimeoutError:
        raise HTTPException(status_code=504, detail="AI service timed out. Please try again.")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=502, detail="Cannot reach AI service. Please try again.")
    return response.content[0].text


def _build_user_content(body: StudyRequest) -> str:
    parts = [f"Course: {body.course}", f"Topic: {body.topic}"]
    if body.additional_context:
        parts.append(f"Additional context: {body.additional_context}")
    return "\n".join(parts)


def _get_cached(user_id: str, content_type: str, course: str, topic: str):
    """Check for cached study content."""
    db = get_db()
    try:
        result = (
            db.table("study_content")
            .select("content")
            .eq("user_id", user_id)
            .eq("content_type", content_type)
            .eq("course", course)
            .eq("topic", topic)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]["content"]
    except Exception:
        logger.debug("Cache lookup failed for %s/%s/%s", content_type, course, topic, exc_info=True)
    return None


def _save_cache(user_id: str, content_type: str, course: str, topic: str, content):
    """Save generated study content to cache."""
    db = get_db()
    try:
        db.table("study_content").insert({
            "user_id": user_id,
            "content_type": content_type,
            "course": course,
            "topic": topic,
            "content": content,
        }).execute()
    except Exception:
        logger.warning("Failed to cache study content", exc_info=True)


@router.post("/guide")
@limiter.limit("5/hour")
async def generate_study_guide(request: Request, body: StudyRequest, user_id: str = Depends(get_current_user)):
    cached = _get_cached(user_id, "guide", body.course, body.topic)
    if cached:
        return cached

    text = await _call_claude(STUDY_GUIDE_PROMPT, _build_user_content(body))
    result = {"guide": text}
    _save_cache(user_id, "guide", body.course, body.topic, result)
    return result


@router.post("/flashcards")
@limiter.limit("5/hour")
async def generate_flashcards(request: Request, body: StudyRequest, user_id: str = Depends(get_current_user)):
    cached = _get_cached(user_id, "flashcards", body.course, body.topic)
    if cached:
        return cached

    text = await _call_claude(FLASHCARD_PROMPT, _build_user_content(body), max_tokens=3000)
    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        result = {"cards": [], "raw": text}
    _save_cache(user_id, "flashcards", body.course, body.topic, result)
    return result


@router.post("/quiz")
@limiter.limit("5/hour")
async def generate_quiz(request: Request, body: StudyRequest, user_id: str = Depends(get_current_user)):
    cached = _get_cached(user_id, "quiz", body.course, body.topic)
    if cached:
        return cached

    text = await _call_claude(QUIZ_PROMPT, _build_user_content(body), max_tokens=3000)
    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        result = {"questions": [], "raw": text}
    _save_cache(user_id, "quiz", body.course, body.topic, result)
    return result


@router.post("/explain")
@limiter.limit("5/hour")
async def explain_concept(request: Request, body: StudyRequest, user_id: str = Depends(get_current_user)):
    cached = _get_cached(user_id, "explain", body.course, body.topic)
    if cached:
        return cached

    text = await _call_claude(EXPLAIN_PROMPT, _build_user_content(body))
    result = {"explanation": text}
    _save_cache(user_id, "explain", body.course, body.topic, result)
    return result


@router.post("/summary")
@limiter.limit("5/hour")
async def generate_summary(request: Request, body: StudyRequest, user_id: str = Depends(get_current_user)):
    cached = _get_cached(user_id, "summary", body.course, body.topic)
    if cached:
        return cached

    text = await _call_claude(SUMMARY_PROMPT, _build_user_content(body))
    result = {"summary": text}
    _save_cache(user_id, "summary", body.course, body.topic, result)
    return result
