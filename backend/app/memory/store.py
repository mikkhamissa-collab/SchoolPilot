# store.py — Student memory management. Reads/writes profiles, class context, and conversation history.
# This is the "brain" that gives the agent persistent context about each student.
import logging
from datetime import datetime, timezone
from typing import Optional

from supabase import Client

from app.db import get_db

logger = logging.getLogger(__name__)


class MemoryStore:
    """Manages persistent memory for a student.

    Each instance is scoped to a single user_id. All reads and writes are
    filtered by that user_id so one student can never see another's data.
    """

    def __init__(self, user_id: str):
        self.user_id = user_id
        self.db: Client = get_db()

    # ── Profile ──────────────────────────────────────────────────────────

    async def get_profile(self) -> dict:
        """Get student profile. Creates a default row if none exists yet."""
        try:
            result = (
                self.db.table("student_profiles")
                .select("*")
                .eq("user_id", self.user_id)
                .execute()
            )
            if result.data:
                return result.data[0]

            # First interaction — seed a default profile
            default: dict = {
                "user_id": self.user_id,
                "personality_preset": "coach",
                "onboarding_complete": False,
                "onboarding_step": "welcome",
            }
            insert_result = (
                self.db.table("student_profiles").insert(default).execute()
            )
            logger.info("Created default profile for user %s", self.user_id)
            return insert_result.data[0] if insert_result.data else default

        except Exception:
            logger.exception("Failed to get/create profile for user %s", self.user_id)
            # Return a sensible fallback so downstream code never crashes
            return {
                "user_id": self.user_id,
                "personality_preset": "coach",
                "onboarding_complete": False,
                "onboarding_step": "welcome",
            }

    async def update_profile(self, updates: dict) -> dict:
        """Update student profile fields.

        Automatically stamps ``updated_at`` with the current UTC time.
        """
        if not updates:
            logger.warning("update_profile called with empty updates for user %s", self.user_id)
            return {}
        try:
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()
            result = (
                self.db.table("student_profiles")
                .update(updates)
                .eq("user_id", self.user_id)
                .execute()
            )
            logger.info("Updated profile for user %s: %s", self.user_id, list(updates.keys()))
            return result.data[0] if result.data else {}
        except Exception:
            logger.exception("Failed to update profile for user %s", self.user_id)
            return {}

    # ── Class Context ────────────────────────────────────────────────────

    async def get_all_classes(self) -> list[dict]:
        """Get all class contexts for this student, ordered by name."""
        try:
            result = (
                self.db.table("class_context")
                .select("*")
                .eq("user_id", self.user_id)
                .order("class_name")
                .execute()
            )
            return result.data or []
        except Exception:
            logger.exception("Failed to get classes for user %s", self.user_id)
            return []

    async def get_class(self, class_name: str) -> Optional[dict]:
        """Get context for a specific class. Returns None if not found."""
        try:
            result = (
                self.db.table("class_context")
                .select("*")
                .eq("user_id", self.user_id)
                .eq("class_name", class_name)
                .execute()
            )
            return result.data[0] if result.data else None
        except Exception:
            logger.exception("Failed to get class '%s' for user %s", class_name, self.user_id)
            return None

    async def update_class(self, class_name: str, updates: dict) -> dict:
        """Update class context. Creates the row via upsert if it doesn't exist."""
        try:
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()
            updates["user_id"] = self.user_id
            updates["class_name"] = class_name
            result = (
                self.db.table("class_context")
                .upsert(updates, on_conflict="user_id,class_name")
                .execute()
            )
            logger.info("Upserted class '%s' for user %s", class_name, self.user_id)
            return result.data[0] if result.data else {}
        except Exception:
            logger.exception("Failed to update class '%s' for user %s", class_name, self.user_id)
            return {}

    async def add_class_note(self, class_name: str, note: str) -> None:
        """Append a timestamped note to a class context's notes array."""
        try:
            cls = await self.get_class(class_name)
            notes: list[dict] = cls.get("notes", []) if cls else []
            notes.append({
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "note": note,
            })
            await self.update_class(class_name, {"notes": notes})
            logger.info("Added note to class '%s' for user %s", class_name, self.user_id)
        except Exception:
            logger.exception("Failed to add note to class '%s' for user %s", class_name, self.user_id)

    # ── Assignments ──────────────────────────────────────────────────────

    async def get_upcoming_assignments(self, limit: int = 20) -> list[dict]:
        """Get assignments that are not yet past due, ordered soonest-first."""
        try:
            now = datetime.now(timezone.utc).isoformat()
            result = (
                self.db.table("lms_assignments")
                .select("*")
                .eq("user_id", self.user_id)
                .gte("due_date", now)
                .order("due_date")
                .limit(limit)
                .execute()
            )
            return result.data or []
        except Exception:
            logger.exception("Failed to get upcoming assignments for user %s", self.user_id)
            return []

    async def get_all_assignments(self, limit: int = 50) -> list[dict]:
        """Get all recent assignments (including past-due), newest first."""
        try:
            result = (
                self.db.table("lms_assignments")
                .select("*")
                .eq("user_id", self.user_id)
                .order("due_date", desc=True)
                .limit(limit)
                .execute()
            )
            return result.data or []
        except Exception:
            logger.exception("Failed to get all assignments for user %s", self.user_id)
            return []

    # ── Grades ───────────────────────────────────────────────────────────

    async def get_all_grades(self) -> list[dict]:
        """Get LMS-extracted grades for every course."""
        try:
            result = (
                self.db.table("lms_grades")
                .select("*")
                .eq("user_id", self.user_id)
                .execute()
            )
            return result.data or []
        except Exception:
            logger.exception("Failed to get grades for user %s", self.user_id)
            return []

    # ── Conversations ────────────────────────────────────────────────────

    async def get_conversations(self, limit: int = 20) -> list[dict]:
        """Get recent conversations (metadata only, not full messages)."""
        try:
            result = (
                self.db.table("conversations")
                .select("id, title, message_count, last_message_at, summary, created_at")
                .eq("user_id", self.user_id)
                .order("last_message_at", desc=True)
                .limit(limit)
                .execute()
            )
            return result.data or []
        except Exception:
            logger.exception("Failed to get conversations for user %s", self.user_id)
            return []

    async def get_conversation_messages(self, conversation_id: str, limit: int = 50) -> list[dict]:
        """Get messages for a specific conversation, oldest first."""
        try:
            result = (
                self.db.table("messages")
                .select("*")
                .eq("conversation_id", conversation_id)
                .eq("user_id", self.user_id)
                .order("created_at")
                .limit(limit)
                .execute()
            )
            return result.data or []
        except Exception:
            logger.exception(
                "Failed to get messages for conversation %s, user %s",
                conversation_id, self.user_id,
            )
            return []

    async def create_conversation(self, title: Optional[str] = None) -> dict:
        """Create a new conversation and return its row."""
        try:
            result = (
                self.db.table("conversations")
                .insert({
                    "user_id": self.user_id,
                    "title": title or "New conversation",
                })
                .execute()
            )
            conversation = result.data[0] if result.data else {}
            if conversation:
                logger.info("Created conversation %s for user %s", conversation.get("id"), self.user_id)
            return conversation
        except Exception:
            logger.exception("Failed to create conversation for user %s", self.user_id)
            return {}

    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        rich_content: Optional[dict] = None,
        actions_taken: Optional[list] = None,
        model_used: Optional[str] = None,
        tokens_used: Optional[int] = None,
    ) -> dict:
        """Add a message to a conversation and update conversation metadata.

        Parameters
        ----------
        conversation_id : str
            UUID of the parent conversation.
        role : str
            ``"user"`` or ``"assistant"``.
        content : str
            Plain-text message body.
        rich_content : dict, optional
            Structured payload (cards, charts, etc.) for the frontend.
        actions_taken : list, optional
            Agent tool-use actions taken while generating this message.
        model_used : str, optional
            The Claude model ID that produced this response.
        tokens_used : int, optional
            Token count for billing/tracking.
        """
        try:
            msg: dict = {
                "conversation_id": conversation_id,
                "user_id": self.user_id,
                "role": role,
                "content": content,
            }
            if rich_content is not None:
                msg["rich_content"] = rich_content
            if actions_taken is not None:
                msg["actions_taken"] = actions_taken
            if model_used is not None:
                msg["model_used"] = model_used
            if tokens_used is not None:
                msg["tokens_used"] = tokens_used

            result = self.db.table("messages").insert(msg).execute()
            saved_message = result.data[0] if result.data else {}

            # Update conversation metadata (last activity + message count)
            self._touch_conversation(conversation_id)

            return saved_message

        except Exception:
            logger.exception(
                "Failed to add message to conversation %s for user %s",
                conversation_id, self.user_id,
            )
            return {}

    async def get_conversation(self, conversation_id: str) -> Optional[dict]:
        """Get a single conversation by ID."""
        try:
            result = (
                self.db.table("conversations")
                .select("id, title, message_count, last_message_at, summary, created_at")
                .eq("id", conversation_id)
                .eq("user_id", self.user_id)
                .single()
                .execute()
            )
            return result.data
        except Exception:
            logger.exception("Failed to get conversation %s for user %s", conversation_id, self.user_id)
            return None

    def _touch_conversation(self, conversation_id: str) -> None:
        """Refresh the conversation's last_message_at and message_count."""
        try:
            count_result = (
                self.db.table("messages")
                .select("id", count="exact")
                .eq("conversation_id", conversation_id)
                .execute()
            )
            message_count = count_result.count if count_result.count is not None else 0

            self.db.table("conversations").update({
                "last_message_at": datetime.now(timezone.utc).isoformat(),
                "message_count": message_count,
            }).eq("id", conversation_id).execute()

        except Exception:
            logger.exception("Failed to touch conversation %s", conversation_id)

    # ── Context Builder ──────────────────────────────────────────────────

    async def build_context(self, conversation_id: Optional[str] = None) -> str:
        """Assemble everything the AI agent needs to know about this student.

        Returns a structured markdown string with the student's profile,
        classes, grades, upcoming assignments, and (optionally) a summary
        of the current conversation so far.  This is the single most
        important method in the memory layer — the quality of agent
        responses depends on how rich and accurate this context is.
        """
        profile = await self.get_profile()
        classes = await self.get_all_classes()
        upcoming_assignments = await self.get_upcoming_assignments(limit=15)
        all_assignments = await self.get_all_assignments(limit=30)
        grades = await self.get_all_grades()

        # Fetch streak data
        streak_data = None
        try:
            streak_result = (
                self.db.table("streaks")
                .select("*")
                .eq("user_id", self.user_id)
                .execute()
            )
            if streak_result.data:
                streak_data = streak_result.data[0]
        except Exception:
            logger.warning("Failed to fetch streak data", exc_info=True)

        # Fetch recent focus sessions
        focus_sessions = []
        try:
            focus_result = (
                self.db.table("study_sessions")
                .select("*")
                .eq("user_id", self.user_id)
                .order("completed_at", desc=True)
                .limit(5)
                .execute()
            )
            if focus_result.data:
                focus_sessions = focus_result.data
        except Exception:
            logger.warning("Failed to fetch focus sessions", exc_info=True)

        parts: list[str] = []

        # ── Data freshness
        try:
            last_sync = (
                self.db.table("agent_jobs")
                .select("completed_at")
                .eq("user_id", self.user_id)
                .eq("status", "completed")
                .order("completed_at", desc=True)
                .limit(1)
                .execute()
            )
            if last_sync.data and last_sync.data[0].get("completed_at"):
                sync_time = last_sync.data[0]["completed_at"]
                parts.append(f"## Data Freshness\nLast sync: {sync_time}")
        except Exception:
            logger.debug("Failed to fetch last sync time", exc_info=True)

        # ── Student profile
        parts.append("\n## Student Profile")
        if profile.get("display_name"):
            parts.append(f"Name: {profile['display_name']}")
        if profile.get("school_name"):
            parts.append(f"School: {profile['school_name']}")
        if profile.get("grade_level"):
            parts.append(f"Grade: {profile['grade_level']}")
        if profile.get("goals"):
            goals = profile["goals"]
            if isinstance(goals, list):
                parts.append(f"Goals: {', '.join(goals)}")
            else:
                parts.append(f"Goals: {goals}")
        if profile.get("patterns"):
            patterns = profile["patterns"]
            if isinstance(patterns, dict):
                for key, value in patterns.items():
                    parts.append(f"- {key}: {value}")

        # ── Classes
        if classes:
            parts.append("\n## Classes")
            for cls in classes:
                parts.append(f"\n### {cls['class_name']}")
                if cls.get("teacher_name"):
                    parts.append(f"Teacher: {cls['teacher_name']}")
                if cls.get("current_grade"):
                    parts.append(f"Current grade: {cls['current_grade']}")
                if cls.get("difficulty_rating"):
                    parts.append(f"Difficulty: {cls['difficulty_rating']}")
                if cls.get("student_goal"):
                    parts.append(f"Goal: {cls['student_goal']}")
                if cls.get("weak_areas"):
                    areas = cls["weak_areas"]
                    parts.append(f"Weak areas: {', '.join(areas) if isinstance(areas, list) else areas}")
                if cls.get("strong_areas"):
                    areas = cls["strong_areas"]
                    parts.append(f"Strong areas: {', '.join(areas) if isinstance(areas, list) else areas}")
                if cls.get("teacher_style"):
                    parts.append(f"Teacher style: {cls['teacher_style']}")
                if cls.get("notes"):
                    notes = cls["notes"]
                    if isinstance(notes, list):
                        # Show only the three most recent notes to keep context lean
                        for note in notes[-3:]:
                            if isinstance(note, dict):
                                parts.append(f"- [{note.get('date', '?')}] {note.get('note', '')}")

        # ── Grades
        if grades:
            parts.append("\n## Current Grades")
            for g in grades:
                line = f"- {g.get('course_name', 'Unknown')}: {g.get('overall_grade', 'N/A')}"
                if g.get("overall_percentage") is not None:
                    line += f" ({g['overall_percentage']}%)"
                parts.append(line)

        # ── All assignments (overdue + upcoming)
        if all_assignments:
            # Split into overdue and upcoming
            from datetime import datetime as _dt, timezone as _tz
            _now = _dt.now(_tz.utc)
            overdue = []
            upcoming = []
            no_date = []
            for a in all_assignments:
                due = a.get("due_date")
                if not due:
                    no_date.append(a)
                else:
                    try:
                        due_dt = _dt.fromisoformat(due.replace("Z", "+00:00"))
                        if due_dt < _now:
                            overdue.append(a)
                        else:
                            upcoming.append(a)
                    except (ValueError, TypeError):
                        no_date.append(a)

            if overdue:
                parts.append(f"\n## Overdue Assignments ({len(overdue)})")
                for a in overdue[:10]:
                    line = f"- [{a.get('course_name', 'Unknown')}] {a.get('title', 'Untitled')}"
                    if a.get("due_date"):
                        line += f" -- was due {a['due_date']}"
                    if a.get("assignment_type"):
                        line += f" ({a['assignment_type']})"
                    parts.append(line)

            if upcoming:
                parts.append(f"\n## Upcoming Assignments ({len(upcoming)})")
                for a in upcoming[:15]:
                    line = f"- [{a.get('course_name', 'Unknown')}] {a.get('title', 'Untitled')}"
                    if a.get("due_date"):
                        line += f" -- due {a['due_date']}"
                    if a.get("assignment_type"):
                        line += f" ({a['assignment_type']})"
                    if a.get("points_possible") is not None:
                        line += f" [{a['points_possible']} pts]"
                    parts.append(line)

            if no_date:
                parts.append(f"\n## Assignments (No Due Date) ({len(no_date)})")
                for a in no_date[:5]:
                    parts.append(f"- [{a.get('course_name', 'Unknown')}] {a.get('title', 'Untitled')}")

        # ── Streak & activity
        if streak_data:
            parts.append(f"\n## Activity")
            parts.append(f"Current streak: {streak_data.get('current_streak', 0)} days")
            parts.append(f"Longest streak: {streak_data.get('longest_streak', 0)} days")
            parts.append(f"Total active days: {streak_data.get('total_active_days', 0)}")

        if focus_sessions:
            parts.append("\n## Recent Focus Sessions")
            for s in focus_sessions[:3]:
                parts.append(f"- {s.get('duration_minutes', 0)} min ({s.get('focus_type', 'study')}) on {s.get('completed_at', 'unknown')[:10]}")

        # ── Conversation summary (if we're inside a conversation)
        if conversation_id:
            try:
                conv = (
                    self.db.table("conversations")
                    .select("summary")
                    .eq("id", conversation_id)
                    .execute()
                )
                if conv.data and conv.data[0].get("summary"):
                    parts.append(f"\n## Conversation Summary\n{conv.data[0]['summary']}")
            except Exception:
                logger.exception("Failed to fetch conversation summary for %s", conversation_id)

        return "\n".join(parts)

    # ── Summarization ────────────────────────────────────────────────────

    async def summarize_conversation(self, conversation_id: str, anthropic_client) -> str:
        """Compress older messages into a rolling summary.

        Keeps the most recent 10 messages verbatim and summarizes
        everything before them.  The summary is stored on the
        ``conversations`` row so it can be included in future context
        builds without re-reading the full message history.

        Parameters
        ----------
        conversation_id : str
            The conversation to summarize.
        anthropic_client :
            An ``anthropic.AsyncAnthropic`` client instance.

        Returns
        -------
        str
            The generated summary text, or ``""`` if there aren't enough
            messages to warrant summarization.
        """
        from app.config import get_settings

        settings = get_settings()

        messages = await self.get_conversation_messages(conversation_id, limit=1000)
        if len(messages) <= 10:
            return ""  # Not enough messages to justify summarization

        # Everything except the last 10 messages gets summarized
        to_summarize = messages[:-10]

        # Fetch existing summary to feed into the new one (rolling window)
        existing_summary = ""
        try:
            conv = (
                self.db.table("conversations")
                .select("summary")
                .eq("id", conversation_id)
                .execute()
            )
            if conv.data and conv.data[0].get("summary"):
                existing_summary = conv.data[0]["summary"]
        except Exception:
            logger.exception("Failed to fetch existing summary for conversation %s", conversation_id)

        # Build the text block for Claude to summarize
        text_parts: list[str] = []
        if existing_summary:
            text_parts.append(f"Previous summary: {existing_summary}")
        for msg in to_summarize:
            # Truncate individual messages to avoid blowing up the prompt
            content_preview = (msg.get("content") or "")[:500]
            text_parts.append(f"{msg.get('role', 'unknown').upper()}: {content_preview}")

        try:
            response = await anthropic_client.messages.create(
                model=settings.claude_model,
                max_tokens=500,
                system=(
                    "Summarize this conversation between a student and their AI "
                    "academic companion. Capture key decisions, preferences learned, "
                    "action items, and important context. Be concise."
                ),
                messages=[{"role": "user", "content": "\n".join(text_parts)}],
            )
            summary = response.content[0].text
        except Exception:
            logger.exception("Claude summarization failed for conversation %s", conversation_id)
            return ""

        # Persist the summary
        try:
            self.db.table("conversations").update({
                "summary": summary,
                "summary_updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", conversation_id).execute()
            logger.info(
                "Summarized conversation %s (%d messages compressed)",
                conversation_id, len(to_summarize),
            )
        except Exception:
            logger.exception("Failed to store summary for conversation %s", conversation_id)

        return summary
