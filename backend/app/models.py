"""Shared Pydantic models for type safety across the application."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ExtractedAssignment(BaseModel):
    title: str
    course: str = "Unknown"
    assignment_type: Optional[str] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    points_possible: Optional[float] = None
    is_submitted: bool = False
    is_graded: bool = False
    points_earned: Optional[float] = None


class ExtractedGrade(BaseModel):
    course: str
    overall_grade: Optional[str] = None
    overall_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    categories: dict = Field(default_factory=dict)


class ExtractedData(BaseModel):
    assignments: list[ExtractedAssignment] = Field(default_factory=list)
    grades: list[ExtractedGrade] = Field(default_factory=list)


class SyncResult(BaseModel):
    status: str  # "success", "partial", "failed"
    assignments_count: int = 0
    grades_count: int = 0
    errors: list[str] = Field(default_factory=list)
    duration_seconds: float = 0


class StudentContext(BaseModel):
    """Full context for a student, used by chat and plan generation."""
    display_name: Optional[str] = None
    personality_preset: str = "coach"
    school_name: Optional[str] = None
    goals: list[str] = Field(default_factory=list)
    classes: list[dict] = Field(default_factory=list)
    assignments: list[dict] = Field(default_factory=list)
    grades: list[dict] = Field(default_factory=list)
    streak: int = 0


class ChatToolResult(BaseModel):
    """Standardized tool result from chat engine."""
    success: bool
    message: str
    data: Optional[dict] = None


# -- Response models for routes ------------------------------------------------


class HealthResponse(BaseModel):
    status: str
    db: str
    version: str


class FocusSessionResponse(BaseModel):
    id: str
    user_id: str
    duration_minutes: int
    focus_type: Optional[str] = None
    completed_at: str


class FocusStatsResponse(BaseModel):
    today_sessions: int
    today_minutes: int
    week_minutes: int
    current_streak: int
    longest_streak: int
    total_active_days: int


class BuddyStatusResponse(BaseModel):
    has_buddy: bool
    pair_id: Optional[str] = None
    status: Optional[str] = None
    buddy_name: Optional[str] = None
    streak_count: int = 0
    last_activity_buddy: Optional[str] = None


class GradeCalculationResponse(BaseModel):
    overall: Optional[float] = None
    letter: Optional[str] = None
    categories: dict = Field(default_factory=dict)


class ProfileResponse(BaseModel):
    user_id: str
    display_name: Optional[str] = None
    school_name: Optional[str] = None
    grade_level: Optional[str] = None
    timezone: str = "America/New_York"
    personality_preset: str = "coach"
    onboarding_complete: bool = False
    onboarding_step: str = "welcome"
    goals: Optional[list] = None
    patterns: Optional[dict] = None
    daily_briefing_enabled: bool = True
    email_briefings: bool = True
