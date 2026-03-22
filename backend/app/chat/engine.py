# engine.py — Core chat engine with streaming, context injection, and tool use.
# This is the beating heart of SchoolPilot's conversational AI.  It manages the
# full lifecycle of a chat turn: build context from memory, stream Claude's
# response via SSE, execute any tool calls the agent makes, get follow-up
# responses, and persist everything back to the memory store.
#
# IMPORTANT: Uses AsyncAnthropic so that streaming does NOT block the FastAPI
# event loop.  All generators are async generators that yield SSE strings.

import json
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional

import anthropic

from app.config import get_settings
from app.memory.store import MemoryStore
from app.prompts.personalities import get_personality

logger = logging.getLogger(__name__)


# ── Tool definitions ─────────────────────────────────────────────────────────
# These are the actions the agent can take mid-conversation.  Each tool maps to
# a handler method on ChatEngine.  The schemas follow Anthropic's tool-use spec.

CHAT_TOOLS = [
    {
        "name": "set_reminder",
        "description": (
            "Set a reminder for the student. Use this when they mention needing "
            "to remember something or when you think a deadline reminder would help."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "What to remind about",
                },
                "remind_at": {
                    "type": "string",
                    "description": "ISO 8601 datetime for when to send the reminder",
                },
                "assignment_id": {
                    "type": "string",
                    "description": "Optional: linked assignment ID",
                },
            },
            "required": ["title", "remind_at"],
        },
    },
    {
        "name": "update_student_profile",
        "description": (
            "Update something you learned about the student — their goals, "
            "patterns, preferences. Use this when they tell you something "
            "important about themselves."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "field": {
                    "type": "string",
                    "enum": ["goals", "patterns", "display_name", "grade_level"],
                },
                "value": {
                    "description": "The new value",
                },
            },
            "required": ["field", "value"],
        },
    },
    {
        "name": "update_class_context",
        "description": (
            "Update information about a specific class — teacher style, "
            "difficulty, student goals for the class, weak/strong areas."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "class_name": {"type": "string"},
                "updates": {
                    "type": "object",
                    "description": (
                        "Fields to update: teacher_style, difficulty_rating, "
                        "student_goal, weak_areas, strong_areas, notes"
                    ),
                },
            },
            "required": ["class_name", "updates"],
        },
    },
    {
        "name": "get_grade_analysis",
        "description": (
            "Analyze grades for a specific course. Use when the student asks "
            "about their grade, what they need on a test, or grade projections."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "course_name": {"type": "string"},
                "analysis_type": {
                    "type": "string",
                    "enum": ["current", "what_if", "required_score"],
                },
            },
            "required": ["course_name"],
        },
    },
    {
        "name": "create_study_plan",
        "description": (
            "Create a structured study plan. Use when the student asks what to "
            "work on or needs help organizing their time."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "focus": {
                    "type": "string",
                    "description": "What to focus on (specific class, upcoming test, general)",
                },
                "duration": {
                    "type": "string",
                    "description": "Time available (e.g., '2 hours', 'tonight', 'this week')",
                },
            },
            "required": ["focus"],
        },
    },
]


class ChatEngine:
    """Manages chat interactions with streaming and tool use.

    Each instance is scoped to a single user.  It holds an async Anthropic
    client (``AsyncAnthropic``) so that streaming does NOT block the FastAPI
    event loop.  All streaming methods are async generators.

    The main entry point is ``stream_response`` which yields SSE-formatted
    strings suitable for direct use with a ``StreamingResponse``.
    """

    def __init__(self, user_id: str) -> None:
        self.user_id = user_id
        self.settings = get_settings()
        self.client = anthropic.AsyncAnthropic(api_key=self.settings.anthropic_api_key)
        self.memory = MemoryStore(user_id)

    # ── Public API ────────────────────────────────────────────────────────

    async def stream_response(
        self,
        conversation_id: str,
        user_message: str,
        personality_preset: str = "coach",
    ) -> AsyncGenerator[str, None]:
        """Stream a response to the user's message.

        Yields SSE-formatted strings:
            ``data: {"type": "text", "content": "..."}``   — text delta
            ``data: {"type": "action", "action": {...}}``   — tool execution
            ``data: {"type": "done"}``                      — stream complete
            ``data: {"type": "error", "message": "..."}``   — recoverable error

        The full assistant response (including any follow-up after tool use)
        is persisted to the memory store before the ``done`` event.
        """
        # 1. Persist user message
        await self.memory.add_message(conversation_id, "user", user_message)

        # 2. Build rich context from student memory
        context = await self.memory.build_context(conversation_id)

        # 3. Assemble Claude message history
        claude_messages = await self._build_claude_messages(conversation_id, user_message)

        # 4. Build system prompt
        personality = get_personality(personality_preset)
        system_prompt = self._build_system_prompt(personality, context)

        # 5. Stream the response
        full_response = ""
        actions_taken: list[dict] = []

        try:
            # First turn — may include tool_use blocks
            async for sse_chunk in self._stream_turn(
                system_prompt, claude_messages, full_response, actions_taken
            ):
                yield sse_chunk
            # Retrieve accumulated state from the async generator
            full_response = self._turn_full_response
            actions_taken = self._turn_actions_taken
        except anthropic.APIConnectionError:
            logger.error("Cannot reach Claude API")
            yield _sse({"type": "error", "message": "Cannot reach AI service. Please try again."})
            yield _sse({"type": "done"})
            return
        except anthropic.RateLimitError:
            logger.warning("Claude API rate limit hit for user %s", self.user_id)
            yield _sse({"type": "error", "message": "AI service is busy. Please wait a moment and try again."})
            yield _sse({"type": "done"})
            return
        except anthropic.APIStatusError as exc:
            logger.error("Claude API error %d: %s", exc.status_code, exc.message)
            yield _sse({"type": "error", "message": "AI service error. Please try again."})
            yield _sse({"type": "done"})
            return
        except Exception:
            logger.exception("Unexpected error during streaming for user %s", self.user_id)
            yield _sse({"type": "error", "message": "Something went wrong. Please try again."})
            yield _sse({"type": "done"})
            return

        # 6. If the model used tools, execute them and get a follow-up response
        if actions_taken:
            try:
                followup_text = ""
                async for sse_chunk in self._handle_tool_results(
                    system_prompt, claude_messages, actions_taken
                ):
                    yield sse_chunk
                followup_text = self._followup_text
                full_response += followup_text
            except Exception:
                logger.exception("Tool follow-up failed for user %s", self.user_id)
                yield _sse({"type": "error", "message": "Tool action completed but follow-up failed."})

        # 7. Persist assistant message
        tokens_used = getattr(self, "_last_usage_tokens", None)
        await self.memory.add_message(
            conversation_id,
            "assistant",
            full_response,
            actions_taken=actions_taken if actions_taken else None,
            model_used=self.settings.claude_model,
            tokens_used=tokens_used,
        )

        # 8. Periodic summarization (every ~10 messages after the first 20)
        await self._maybe_summarize(conversation_id)

        # 9. Done
        yield _sse({"type": "done"})

    # ── Streaming internals ──────────────────────────────────────────────

    async def _stream_turn(
        self,
        system_prompt: str,
        claude_messages: list[dict],
        full_response: str,
        actions_taken: list[dict],
    ) -> AsyncGenerator[str, None]:
        """Run one Claude streaming turn.  Yields SSE strings.

        After the generator is exhausted, the caller reads
        ``self._turn_full_response`` and ``self._turn_actions_taken``
        to get the accumulated state.

        This is an async generator because it uses the AsyncAnthropic
        streaming client, which does NOT block the event loop.
        """
        tool_use_blocks: list[dict] = []  # Collect tool_use content blocks
        current_tool_input_json = ""
        current_tool_name: Optional[str] = None
        current_tool_id: Optional[str] = None

        async with self.client.messages.stream(
            model=self.settings.claude_model,
            max_tokens=2048,
            system=system_prompt,
            messages=claude_messages,
            tools=CHAT_TOOLS,
            timeout=30.0,
        ) as stream:
            async for event in stream:
                if event.type == "content_block_start":
                    if hasattr(event.content_block, "name"):
                        # Tool use block starting
                        current_tool_name = event.content_block.name
                        current_tool_id = event.content_block.id
                        current_tool_input_json = ""

                elif event.type == "content_block_delta":
                    if hasattr(event.delta, "text"):
                        chunk = event.delta.text
                        full_response += chunk
                        yield _sse({"type": "text", "content": chunk})
                    elif hasattr(event.delta, "partial_json"):
                        current_tool_input_json += event.delta.partial_json

                elif event.type == "content_block_stop":
                    if current_tool_name is not None:
                        # Parse accumulated tool input
                        try:
                            tool_input = json.loads(current_tool_input_json) if current_tool_input_json else {}
                        except json.JSONDecodeError:
                            logger.warning(
                                "Failed to parse tool input for %s: %s",
                                current_tool_name, current_tool_input_json[:200],
                            )
                            tool_input = {}

                        tool_use_blocks.append({
                            "id": current_tool_id,
                            "name": current_tool_name,
                            "input": tool_input,
                        })

                        # Reset
                        current_tool_name = None
                        current_tool_id = None
                        current_tool_input_json = ""

            # Capture usage for persistence
            final_message = await stream.get_final_message()
            if final_message.usage:
                self._last_usage_tokens = (
                    final_message.usage.input_tokens + final_message.usage.output_tokens
                )

        # Execute each tool and yield action events
        for tool_block in tool_use_blocks:
            result = await self._execute_tool(tool_block["name"], tool_block["input"])
            action = {
                "tool": tool_block["name"],
                "tool_use_id": tool_block["id"],
                "input": tool_block["input"],
                "result": result,
            }
            actions_taken.append(action)
            yield _sse({"type": "action", "action": {
                "tool": tool_block["name"],
                "input": tool_block["input"],
                "result": result,
            }})

        # Stash accumulated state for the caller
        self._turn_full_response = full_response
        self._turn_actions_taken = actions_taken

    async def _handle_tool_results(
        self,
        system_prompt: str,
        original_messages: list[dict],
        actions_taken: list[dict],
    ) -> AsyncGenerator[str, None]:
        """Send tool results back to Claude and stream the follow-up.

        Yields SSE strings.  After exhaustion the caller reads
        ``self._followup_text`` for the accumulated follow-up text.
        """
        # Reconstruct the assistant turn that contained tool_use blocks
        assistant_content: list[dict] = []
        for action in actions_taken:
            assistant_content.append({
                "type": "tool_use",
                "id": action["tool_use_id"],
                "name": action["tool"],
                "input": action["input"],
            })

        # Build the messages list with tool results
        followup_messages = original_messages.copy()
        followup_messages.append({"role": "assistant", "content": assistant_content})

        # Each tool result is a separate content block in a single user message
        tool_result_content: list[dict] = []
        for action in actions_taken:
            tool_result_content.append({
                "type": "tool_result",
                "tool_use_id": action["tool_use_id"],
                "content": json.dumps(action["result"]),
            })
        followup_messages.append({"role": "user", "content": tool_result_content})

        # Stream follow-up
        followup_text = ""
        async with self.client.messages.stream(
            model=self.settings.claude_model,
            max_tokens=1024,
            system=system_prompt,
            messages=followup_messages,
            timeout=30.0,
        ) as followup_stream:
            async for event in followup_stream:
                if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                    chunk = event.delta.text
                    followup_text += chunk
                    yield _sse({"type": "text", "content": chunk})

            # Update usage
            final = await followup_stream.get_final_message()
            if final.usage:
                prev = getattr(self, "_last_usage_tokens", 0) or 0
                self._last_usage_tokens = prev + final.usage.input_tokens + final.usage.output_tokens

        # Stash result for the caller
        self._followup_text = followup_text

    # ── Message building ─────────────────────────────────────────────────

    async def _build_claude_messages(
        self, conversation_id: str, current_message: str
    ) -> list[dict]:
        """Build the messages array for Claude from conversation history.

        Retrieves the last N messages from the database, converts them to
        Claude's expected format, then appends the current user turn.
        Messages with unsupported roles are mapped to "user" to avoid
        API errors.
        """
        recent_messages = await self.memory.get_conversation_messages(
            conversation_id, limit=20
        )

        claude_messages: list[dict] = []

        # Exclude the message we just saved (it's the current turn)
        history = recent_messages[:-1] if recent_messages else []

        for msg in history:
            role = msg.get("role", "user")
            if role not in ("user", "assistant"):
                role = "user"
            content = msg.get("content", "")
            if not content:
                continue

            # Avoid consecutive messages with the same role (Claude requires
            # strict alternation).  Merge into the previous message if needed.
            if claude_messages and claude_messages[-1]["role"] == role:
                claude_messages[-1]["content"] += f"\n\n{content}"
            else:
                claude_messages.append({"role": role, "content": content})

        # Ensure the first message is from the user (Claude requirement)
        if claude_messages and claude_messages[0]["role"] == "assistant":
            claude_messages.insert(0, {"role": "user", "content": "(conversation resumed)"})

        # Append current user message
        if claude_messages and claude_messages[-1]["role"] == "user":
            claude_messages[-1]["content"] += f"\n\n{current_message}"
        else:
            claude_messages.append({"role": "user", "content": current_message})

        return claude_messages

    def _build_system_prompt(self, personality: dict, context: str) -> str:
        """Assemble the full system prompt from personality + student context."""
        today = datetime.now(timezone.utc).strftime("%A, %B %d, %Y")
        time_now = datetime.now(timezone.utc).strftime("%I:%M %p UTC")

        return f"""{personality['system_prompt']}

## Current Context
Today is {today}. Current time: {time_now}.

{context}

## Important Rules
- You are SchoolPilot, an AI academic companion.
- **ONLY reference courses and data that appear in the context above.** If a course isn't listed above, you don't know about it. Say "I don't have data for that class" instead of guessing.
- If the student asks about their grades and you have grade data above, show ALL of them immediately — don't ask which class.
- If the student asks about assignments and you have assignments above, list them sorted by due date — don't ask which class.
- Use the tools available to you to take actions (set reminders, update your knowledge about the student, analyze grades, create study plans).
- When you learn something new about the student, use update_student_profile or update_class_context to remember it.
- When the student mentions a deadline, proactively offer to set a reminder.
- Keep responses SHORT. 2-4 sentences for simple questions. Use bullet lists for data.
- Never fabricate grade data, assignment titles, or course names. Only reference what's in the context above.
"""

    # ── Tool execution ───────────────────────────────────────────────────

    async def _execute_tool(self, tool_name: str, tool_input: dict) -> dict:
        """Dispatch a tool call to the appropriate handler.

        Every handler returns a dict that will be serialized as the tool
        result for Claude.  On any unhandled exception the error is logged
        and a generic error dict is returned so the conversation can
        continue gracefully.
        """
        handlers = {
            "set_reminder": self._tool_set_reminder,
            "update_student_profile": self._tool_update_profile,
            "update_class_context": self._tool_update_class,
            "get_grade_analysis": self._tool_grade_analysis,
            "create_study_plan": self._tool_study_plan,
        }
        handler = handlers.get(tool_name)
        if handler is None:
            logger.warning("Unknown tool requested: %s", tool_name)
            return {"error": f"Unknown tool: {tool_name}"}

        try:
            return await handler(tool_input)
        except Exception:
            logger.exception("Tool execution failed: %s with input %s", tool_name, tool_input)
            return {"error": f"Failed to execute {tool_name}. The action could not be completed."}

    async def _tool_set_reminder(self, tool_input: dict) -> dict:
        """Create a reminder in the database."""
        title = tool_input.get("title", "").strip()
        remind_at = tool_input.get("remind_at", "").strip()

        if not title:
            return {"error": "Reminder title is required."}
        if not remind_at:
            return {"error": "Reminder time (remind_at) is required."}

        # Validate the datetime is parseable
        try:
            parsed_time = datetime.fromisoformat(remind_at.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return {"error": f"Invalid datetime format: {remind_at}. Use ISO 8601."}

        # Don't allow reminders in the past
        if parsed_time < datetime.now(timezone.utc):
            logger.info("Reminder time is in the past, setting anyway: %s", remind_at)

        db = self.memory.db
        row = {
            "user_id": self.user_id,
            "title": title,
            "remind_at": remind_at,
            "sent": False,
            "dismissed": False,
        }
        if tool_input.get("assignment_id"):
            row["assignment_id"] = tool_input["assignment_id"]

        result = db.table("reminders").insert(row).execute()
        reminder_id = result.data[0]["id"] if result.data else None

        logger.info(
            "Set reminder '%s' at %s for user %s (id=%s)",
            title, remind_at, self.user_id, reminder_id,
        )
        return {
            "status": "set",
            "reminder_id": reminder_id,
            "title": title,
            "remind_at": remind_at,
        }

    async def _tool_update_profile(self, tool_input: dict) -> dict:
        """Update a field on the student's profile."""
        field = tool_input.get("field", "")
        value = tool_input.get("value")

        if not field:
            return {"error": "Profile field is required."}
        if value is None:
            return {"error": "Profile value is required."}

        valid_fields = {"goals", "patterns", "display_name", "grade_level"}
        if field not in valid_fields:
            return {"error": f"Invalid field: {field}. Valid: {', '.join(sorted(valid_fields))}"}

        profile = await self.memory.get_profile()

        if field == "goals":
            current_goals: list = profile.get("goals") or []
            if not isinstance(current_goals, list):
                current_goals = [current_goals] if current_goals else []
            if isinstance(value, str):
                # Don't add duplicates
                if value not in current_goals:
                    current_goals.append(value)
            elif isinstance(value, list):
                current_goals = value
            else:
                current_goals.append(str(value))
            await self.memory.update_profile({"goals": current_goals})
            return {"status": "updated", "field": "goals", "current_value": current_goals}

        elif field == "patterns":
            current_patterns: dict = profile.get("patterns") or {}
            if not isinstance(current_patterns, dict):
                current_patterns = {}
            if isinstance(value, dict):
                current_patterns.update(value)
            else:
                return {"error": "Patterns value must be a dict (e.g. {'study_time': 'evening'})."}
            await self.memory.update_profile({"patterns": current_patterns})
            return {"status": "updated", "field": "patterns", "current_value": current_patterns}

        else:
            # Simple scalar fields: display_name, grade_level
            await self.memory.update_profile({field: value})
            return {"status": "updated", "field": field, "current_value": value}

    async def _tool_update_class(self, tool_input: dict) -> dict:
        """Update information about a specific class."""
        class_name = tool_input.get("class_name", "").strip()
        updates = tool_input.get("updates")

        if not class_name:
            return {"error": "Class name is required."}
        if not updates or not isinstance(updates, dict):
            return {"error": "Updates must be a non-empty dict."}

        valid_class_fields = {
            "teacher_style", "difficulty_rating", "student_goal",
            "weak_areas", "strong_areas", "notes", "teacher_name",
        }
        invalid_keys = set(updates.keys()) - valid_class_fields
        if invalid_keys:
            logger.warning(
                "Ignoring invalid class update fields for '%s': %s",
                class_name, invalid_keys,
            )
            updates = {k: v for k, v in updates.items() if k in valid_class_fields}

        if not updates:
            return {"error": "No valid fields to update."}

        # Handle notes separately — append, don't overwrite
        if "notes" in updates:
            note = updates.pop("notes")
            if isinstance(note, str) and note.strip():
                await self.memory.add_class_note(class_name, note.strip())
            elif isinstance(note, list):
                for n in note:
                    if isinstance(n, str) and n.strip():
                        await self.memory.add_class_note(class_name, n.strip())

        if updates:
            await self.memory.update_class(class_name, updates)

        logger.info("Updated class '%s' for user %s", class_name, self.user_id)
        return {"status": "updated", "class": class_name, "fields_updated": list(tool_input.get("updates", {}).keys())}

    async def _tool_grade_analysis(self, tool_input: dict) -> dict:
        """Retrieve and structure grade data for a course."""
        course_name = tool_input.get("course_name", "").strip()
        if not course_name:
            return {"error": "Course name is required."}

        analysis_type = tool_input.get("analysis_type", "current")

        grades = await self.memory.get_all_grades()
        if not grades:
            return {"error": "No grade data available. Grades haven't been synced yet."}

        # Fuzzy match: try exact first, then case-insensitive, then partial
        course_grade = None
        for g in grades:
            gname = g.get("course_name", "")
            if gname == course_name:
                course_grade = g
                break
        if course_grade is None:
            for g in grades:
                gname = g.get("course_name", "")
                if gname.lower() == course_name.lower():
                    course_grade = g
                    break
        if course_grade is None:
            for g in grades:
                gname = g.get("course_name", "")
                if course_name.lower() in gname.lower() or gname.lower() in course_name.lower():
                    course_grade = g
                    break

        if course_grade is None:
            available = [g.get("course_name", "?") for g in grades]
            return {
                "error": f"No grade data found for '{course_name}'.",
                "available_courses": available,
            }

        result = {
            "course": course_grade.get("course_name"),
            "overall_grade": course_grade.get("overall_grade"),
            "percentage": course_grade.get("overall_percentage"),
            "breakdown": course_grade.get("category_breakdown", {}),
            "analysis_type": analysis_type,
        }

        # Add last sync time if available
        if course_grade.get("extracted_at"):
            result["last_synced"] = course_grade["extracted_at"]

        return result

    async def _tool_study_plan(self, tool_input: dict) -> dict:
        """Gather data needed for the agent to build a study plan."""
        focus = tool_input.get("focus", "general").strip()
        duration = tool_input.get("duration", "")

        assignments = await self.memory.get_upcoming_assignments(limit=15)

        # If a specific focus is given, filter assignments
        if focus and focus.lower() != "general":
            focused = [
                a for a in assignments
                if focus.lower() in (a.get("course_name") or "").lower()
                or focus.lower() in (a.get("title") or "").lower()
            ]
            # Fall back to all if filter yields nothing
            if focused:
                assignments = focused

        # Get class context for richer plans
        classes = await self.memory.get_all_classes()
        class_info = {}
        for cls in classes:
            name = cls.get("class_name", "")
            info = {}
            if cls.get("difficulty_rating"):
                info["difficulty"] = cls["difficulty_rating"]
            if cls.get("weak_areas"):
                info["weak_areas"] = cls["weak_areas"]
            if cls.get("strong_areas"):
                info["strong_areas"] = cls["strong_areas"]
            if info:
                class_info[name] = info

        return {
            "upcoming_assignments": [
                {
                    "title": a.get("title", "Untitled"),
                    "course": a.get("course_name"),
                    "due": a.get("due_date"),
                    "type": a.get("assignment_type"),
                    "points": a.get("points_possible"),
                    "submitted": a.get("is_submitted", False),
                }
                for a in assignments
            ],
            "class_context": class_info if class_info else None,
            "focus": focus,
            "duration": duration or None,
        }

    # ── Summarization ────────────────────────────────────────────────────

    async def _maybe_summarize(self, conversation_id: str) -> None:
        """Trigger conversation summarization if the message count warrants it.

        Summarization compresses older messages into a rolling summary,
        keeping the context window lean for future turns.  We trigger it
        every 10 messages after the first 20.
        """
        try:
            conv_msgs = await self.memory.get_conversation_messages(
                conversation_id, limit=1000
            )
            msg_count = len(conv_msgs)
            if msg_count > 20 and msg_count % 10 == 0:
                await self.memory.summarize_conversation(conversation_id, self.client)
                logger.info(
                    "Summarized conversation %s at %d messages",
                    conversation_id, msg_count,
                )
        except Exception:
            logger.warning(
                "Failed to summarize conversation %s", conversation_id, exc_info=True
            )


# ── Helpers ──────────────────────────────────────────────────────────────────

def _sse(data: dict) -> str:
    """Format a dict as a Server-Sent Events data line."""
    return f"data: {json.dumps(data)}\n\n"
