# patterns.py — Cross-student anonymized pattern detection.
# Detects and stores class/teacher-level patterns that can benefit all students
# without exposing any individual student's data.
import logging
from datetime import datetime, timezone
from typing import Optional

from supabase import Client

from app.db import get_db

logger = logging.getLogger(__name__)

# Upper bound on confidence — patterns are never treated as certainties.
_MAX_CONFIDENCE: float = 0.95

# Blending weights for incremental confidence updates (EMA-style).
_NEW_WEIGHT: float = 0.3
_EXISTING_WEIGHT: float = 0.7


class PatternDetector:
    """Detects and stores anonymized patterns across students.

    Patterns are scoped to (school, class, teacher) tuples.  No student
    identifiers are stored in the pattern rows — only aggregate
    observations and sample sizes.  This lets the agent say things like
    "Other students in this class found that homework grades are weighted
    more heavily than tests" without revealing who said it.
    """

    def __init__(self):
        self.db: Client = get_db()

    async def get_patterns_for_class(
        self,
        school_name: str,
        class_name: str,
        teacher_name: Optional[str] = None,
    ) -> list[dict]:
        """Get known patterns for a class.

        Parameters
        ----------
        school_name : str
            The school (e.g. ``"ASL"``).
        class_name : str
            The class (e.g. ``"AP Physics C"``).
        teacher_name : str, optional
            If provided, further filters patterns to those reported for
            this specific teacher.

        Returns
        -------
        list[dict]
            Pattern rows from the ``anonymized_patterns`` table.
        """
        try:
            query = (
                self.db.table("anonymized_patterns")
                .select("*")
                .eq("school_name", school_name)
                .eq("class_name", class_name)
            )
            if teacher_name:
                query = query.eq("teacher_name", teacher_name)

            result = query.execute()
            return result.data or []

        except Exception:
            logger.exception(
                "Failed to get patterns for %s / %s (teacher=%s)",
                school_name, class_name, teacher_name,
            )
            return []

    async def report_pattern(
        self,
        school_name: str,
        class_name: str,
        teacher_name: str,
        pattern_type: str,
        observation: str,
        confidence: float = 0.5,
    ) -> None:
        """Report a new pattern observation.

        If a pattern with the same ``(school, class, pattern_type)``
        already exists, increments its ``sample_size`` and blends the
        new confidence value into the running average using an
        exponential moving average.  Otherwise creates a fresh row.

        Parameters
        ----------
        school_name : str
            The school.
        class_name : str
            The class.
        teacher_name : str
            The teacher associated with this observation.
        pattern_type : str
            A short category key (e.g. ``"grading_weight"``,
            ``"test_difficulty"``, ``"homework_style"``).
        observation : str
            Human-readable description of the pattern.
        confidence : float
            How confident we are in this observation (0.0 -- 1.0).
            Defaults to 0.5 for a single data point.
        """
        confidence = max(0.0, min(1.0, confidence))  # clamp to [0, 1]

        try:
            # Check if a matching pattern already exists
            existing = (
                self.db.table("anonymized_patterns")
                .select("*")
                .eq("school_name", school_name)
                .eq("class_name", class_name)
                .eq("pattern_type", pattern_type)
                .execute()
            )

            if existing.data:
                self._merge_existing_pattern(existing.data[0], confidence)
            else:
                self._create_new_pattern(
                    school_name, class_name, teacher_name,
                    pattern_type, observation, confidence,
                )

        except Exception:
            logger.exception(
                "Failed to report pattern '%s' for %s / %s",
                pattern_type, school_name, class_name,
            )

    # ── Internal helpers ─────────────────────────────────────────────────

    def _merge_existing_pattern(self, pattern: dict, new_confidence: float) -> None:
        """Merge a new observation into an existing pattern row."""
        try:
            new_size: int = pattern.get("sample_size", 1) + 1

            pattern_data: dict = pattern.get("pattern_data") or {}
            old_confidence: float = pattern_data.get("confidence", 0.5)
            blended_confidence: float = min(
                _MAX_CONFIDENCE,
                new_confidence * _NEW_WEIGHT + old_confidence * _EXISTING_WEIGHT,
            )

            updated_data = {**pattern_data, "confidence": round(blended_confidence, 4)}

            self.db.table("anonymized_patterns").update({
                "sample_size": new_size,
                "pattern_data": updated_data,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", pattern["id"]).execute()

            logger.info(
                "Updated pattern %s: sample_size=%d, confidence=%.3f",
                pattern["id"], new_size, blended_confidence,
            )
        except Exception:
            logger.exception("Failed to merge pattern %s", pattern.get("id"))

    def _create_new_pattern(
        self,
        school_name: str,
        class_name: str,
        teacher_name: str,
        pattern_type: str,
        observation: str,
        confidence: float,
    ) -> None:
        """Insert a brand-new pattern row."""
        try:
            self.db.table("anonymized_patterns").insert({
                "school_name": school_name,
                "class_name": class_name,
                "teacher_name": teacher_name,
                "pattern_type": pattern_type,
                "pattern_data": {
                    "observation": observation,
                    "confidence": round(confidence, 4),
                },
                "sample_size": 1,
            }).execute()

            logger.info(
                "Created new pattern '%s' for %s / %s (teacher=%s)",
                pattern_type, school_name, class_name, teacher_name,
            )
        except Exception:
            logger.exception(
                "Failed to create pattern '%s' for %s / %s",
                pattern_type, school_name, class_name,
            )
