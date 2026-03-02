# grades_routes.py — Grade calculation endpoints (ported from Flask).
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.auth import get_current_user
from app.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


class GradeCategory(BaseModel):
    name: str
    weight: float


class GradeEntry(BaseModel):
    category: str
    name: str
    score: float
    max: float = 100


class Policies(BaseModel):
    drop_lowest: dict[str, int] = {}
    missing_penalty: float = 0


class CalculateRequest(BaseModel):
    categories: list[GradeCategory]
    grades: list[GradeEntry]
    policies: Optional[Policies] = None


class WhatIfRequest(BaseModel):
    categories: list[GradeCategory]
    grades: list[GradeEntry]
    hypothetical_category: str
    hypothetical_score: float
    hypothetical_max: float = 100
    policies: Optional[Policies] = None


class RequiredScoreRequest(BaseModel):
    categories: list[GradeCategory]
    grades: list[GradeEntry]
    target_percentage: float
    target_category: str
    policies: Optional[Policies] = None


# ── Pure math functions (no DB, no AI) ───────────────────────────────

def _category_average(grades: list[dict], category: str, drop_n: int = 0) -> Optional[float]:
    cat_grades = sorted(
        [g for g in grades if g["category"] == category],
        key=lambda g: g["score"] / g["max"] if g["max"] > 0 else 0,
    )
    if not cat_grades:
        return None
    if drop_n > 0 and len(cat_grades) > drop_n:
        cat_grades = cat_grades[drop_n:]
    total_score = sum(g["score"] for g in cat_grades)
    total_max = sum(g["max"] for g in cat_grades)
    if total_max == 0:
        return None
    return (total_score / total_max) * 100


def _calculate(categories: list[dict], grades: list[dict], policies: dict = None) -> dict:
    policies = policies or {}
    drop_lowest = policies.get("drop_lowest", {})
    cat_weights = {c["name"]: c["weight"] for c in categories}

    category_results = {}
    weighted_sum = 0.0
    weight_used = 0.0

    for cat_name, weight in cat_weights.items():
        avg = _category_average(grades, cat_name, drop_lowest.get(cat_name, 0))
        category_results[cat_name] = {"weight": weight, "average": avg}
        if avg is not None:
            weighted_sum += avg * weight
            weight_used += weight

    overall = round(weighted_sum / weight_used, 2) if weight_used > 0 else None

    # Letter grade
    letter = None
    if overall is not None:
        if overall >= 97: letter = "A+"
        elif overall >= 93: letter = "A"
        elif overall >= 90: letter = "A-"
        elif overall >= 87: letter = "B+"
        elif overall >= 83: letter = "B"
        elif overall >= 80: letter = "B-"
        elif overall >= 77: letter = "C+"
        elif overall >= 73: letter = "C"
        elif overall >= 70: letter = "C-"
        elif overall >= 67: letter = "D+"
        elif overall >= 63: letter = "D"
        elif overall >= 60: letter = "D-"
        else: letter = "F"

    return {"overall": overall, "letter": letter, "categories": category_results}


# ── Endpoints ────────────────────────────────────────────────────────

@router.post("/calculate")
async def calculate_grade(body: CalculateRequest, user_id: str = Depends(get_current_user)):
    """Calculate current grade from categories and grade entries."""
    grades = [g.model_dump() for g in body.grades]
    categories = [c.model_dump() for c in body.categories]
    policies = body.policies.model_dump() if body.policies else {}
    return _calculate(categories, grades, policies)


@router.post("/what-if")
async def what_if(body: WhatIfRequest, user_id: str = Depends(get_current_user)):
    """Calculate grade with a hypothetical additional score."""
    grades = [g.model_dump() for g in body.grades]
    grades.append({
        "category": body.hypothetical_category,
        "name": "Hypothetical",
        "score": body.hypothetical_score,
        "max": body.hypothetical_max,
    })
    categories = [c.model_dump() for c in body.categories]
    policies = body.policies.model_dump() if body.policies else {}
    return _calculate(categories, grades, policies)


@router.post("/required-score")
async def required_score(body: RequiredScoreRequest, user_id: str = Depends(get_current_user)):
    """Calculate the score needed on the next assignment in a category to reach a target grade."""
    categories = [c.model_dump() for c in body.categories]
    grades = [g.model_dump() for g in body.grades]
    policies = body.policies.model_dump() if body.policies else {}
    cat_weights = {c["name"]: c["weight"] for c in categories}
    drop_lowest = policies.get("drop_lowest", {})

    target = body.target_percentage
    target_cat = body.target_category
    target_weight = cat_weights.get(target_cat)

    if target_weight is None:
        raise HTTPException(status_code=400, detail=f"Unknown category: {target_cat}")

    # Calculate current contribution from other categories
    other_contribution = 0.0
    other_weight = 0.0
    for cat_name, weight in cat_weights.items():
        if cat_name == target_cat:
            continue
        avg = _category_average(grades, cat_name, drop_lowest.get(cat_name, 0))
        if avg is not None:
            other_contribution += avg * weight
            other_weight += weight

    # What the target category needs to average
    remaining_weight = target_weight
    total_weight = other_weight + remaining_weight
    needed_weighted = target * total_weight - other_contribution
    needed_average = needed_weighted / remaining_weight if remaining_weight > 0 else None

    if needed_average is None:
        raise HTTPException(status_code=400, detail="Cannot calculate required score")

    # Current scores in the target category
    cat_grades = [g for g in grades if g["category"] == target_cat]
    current_total_score = sum(g["score"] for g in cat_grades)
    current_total_max = sum(g["max"] for g in cat_grades)

    # Assuming next assignment is out of 100
    next_max = 100
    needed_score = (needed_average / 100) * (current_total_max + next_max) - current_total_score

    return {
        "target_percentage": target,
        "target_category": target_cat,
        "needed_average_in_category": round(needed_average, 2),
        "needed_on_next_assignment": round(max(0, min(next_max, needed_score)), 2),
        "next_assignment_max": next_max,
        "achievable": 0 <= needed_score <= next_max,
    }
