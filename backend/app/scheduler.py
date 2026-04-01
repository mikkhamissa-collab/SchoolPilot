# scheduler.py — Background job scheduler for daily syncs and reminders.
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.config import get_settings
from app.db import get_db

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def daily_sync_job():
    """Run daily LMS sync for all users with sync enabled."""
    logger.info("Starting daily LMS sync job...")
    db = get_db()

    # Find all users with sync enabled
    creds = (
        db.table("lms_credentials")
        .select("user_id")
        .eq("sync_enabled", True)
        .execute()
    )

    if not creds.data:
        logger.info("No users with sync enabled. Skipping.")
        return

    user_ids = list({c["user_id"] for c in creds.data})
    logger.info(f"Syncing {len(user_ids)} users...")

    from app.agent.explorer import LMSExplorer

    sem = asyncio.Semaphore(3)  # Max 3 concurrent browser instances

    async def sync_one(uid: str):
        async with sem:
            try:
                job = db.table("agent_jobs").insert({
                    "user_id": uid,
                    "job_type": "full_sync",
                    "status": "pending",
                }).execute()

                if not job.data:
                    logger.error("Failed to create job record for user %s, skipping", uid)
                    return

                job_id = job.data[0]["id"]
                explorer = LMSExplorer(uid, job_id)
                await explorer.run()
            except Exception as e:
                logger.exception(f"Daily sync failed for user {uid}: {e}")

    await asyncio.gather(*[sync_one(uid) for uid in user_ids])
    logger.info("Daily sync job complete.")


async def check_reminders_job():
    """Check for due reminders and send email notifications."""
    db = get_db()
    settings = get_settings()
    now = datetime.now(timezone.utc).isoformat()

    # Find unsent reminders that are due
    due = (
        db.table("reminders")
        .select("*")
        .eq("sent", False)
        .eq("dismissed", False)
        .lte("remind_at", now)
        .limit(50)
        .execute()
    )

    if not due.data:
        return

    logger.info(f"Processing {len(due.data)} due reminders...")

    import resend

    for reminder in due.data:
        try:
            # Send email notification via Resend
            user_data = db.auth.admin.get_user_by_id(reminder["user_id"])
            user_email = user_data.user.email if user_data and user_data.user else None

            if user_email and settings.resend_api_key:
                import html as html_mod
                safe_title = html_mod.escape(reminder.get("title", ""))
                resend.api_key = settings.resend_api_key
                resend.Emails.send({
                    "from": "SchoolPilot <reminders@schoolpilot.co>",
                    "to": user_email,
                    "subject": f"Reminder: {safe_title}",
                    "html": (
                        "<div style='font-family: sans-serif;'>"
                        "<h2>&#9200; Reminder</h2>"
                        f"<p><strong>{safe_title}</strong></p>"
                        "<p>This is your scheduled reminder from SchoolPilot.</p>"
                        "</div>"
                    ),
                })
                logger.info(f"Reminder email sent to {user_email}: {safe_title}")
                # Mark as sent only AFTER email actually succeeds
                db.table("reminders").update({
                    "sent": True,
                    "sent_at": now,
                }).eq("id", reminder["id"]).execute()
            else:
                logger.warning(
                    f"Could not send reminder email for user {reminder['user_id']}: "
                    f"email={'found' if user_email else 'missing'}, "
                    f"resend_key={'set' if settings.resend_api_key else 'missing'}"
                )

        except Exception as e:
            logger.exception(f"Failed to process reminder {reminder['id']}: {e}")


async def send_daily_briefings_job():
    """Send daily email briefings to users who have them enabled."""
    logger.info("Starting daily briefing job...")
    db = get_db()

    profiles = (
        db.table("student_profiles")
        .select("user_id, display_name, personality_preset, timezone")
        .eq("daily_briefing_enabled", True)
        .execute()
    )

    if not profiles.data:
        logger.info("No users with briefings enabled.")
        return

    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("Resend API key not set, skipping briefings.")
        return

    import anthropic as anthropic_sdk
    import json

    client = anthropic_sdk.AsyncAnthropic(api_key=settings.anthropic_api_key)

    from app.prompts.personalities import get_personality
    from app.services.email import render_daily_tasks_html, send_briefing_email

    now_utc = datetime.now(timezone.utc)
    for profile in profiles.data:
        try:
            # Check if it's ~7 AM in the student's timezone
            tz_str = profile.get("timezone") or "UTC"
            try:
                from zoneinfo import ZoneInfo
                local_time = now_utc.astimezone(ZoneInfo(tz_str))
                if local_time.hour != 7:
                    continue  # Not 7 AM in their timezone yet
            except Exception:
                # If timezone parsing fails, only send at 7 AM UTC
                if now_utc.hour != 7:
                    continue

            user_id = profile["user_id"]
            today = datetime.now(timezone.utc).strftime("%A, %B %d, %Y")

            # Pull REAL data from database — no hallucination
            grades_data = db.table("lms_grades").select("course_name, overall_grade, overall_percentage").eq("user_id", user_id).execute()
            assignments_data = db.table("lms_assignments").select("title, course_name, due_date, is_submitted").eq("user_id", user_id).eq("is_submitted", False).order("due_date").limit(10).execute()

            grades_list = grades_data.data or []
            assignments_list = assignments_data.data or []

            # Build context from real data
            grade_lines = "\n".join([f"- {g['course_name']}: {g.get('overall_grade', 'N/A')} ({g.get('overall_percentage', 'N/A')}%)" for g in grades_list])
            assignment_lines = "\n".join([f"- {a['title']} ({a['course_name']}) — due {a.get('due_date', 'TBD')}" for a in assignments_list])

            real_context = f"GRADES:\n{grade_lines or 'No grades synced yet.'}\n\nUPCOMING ASSIGNMENTS:\n{assignment_lines or 'No upcoming assignments.'}"

            personality = get_personality(profile.get("personality_preset", "coach"))

            # Ask Claude to pick the 3 most important things to do today
            response = await client.messages.create(
                model=settings.claude_model,
                max_tokens=512,
                system=f"""{personality['system_prompt']}

You are generating a short daily email for a high school student. Return ONLY valid JSON with this structure:
{{
  "tasks": [
    {{"text": "Short actionable task description", "course": "Course name", "why": "One sentence on why this matters"}}
  ],
  "motivation": "One short line — not cheesy, match the personality"
}}

Rules:
- tasks: EXACTLY 3 items. Pick the 3 most impactful things to do TODAY based on upcoming assignments and grade situation.
- Sort by urgency and grade impact (things due soonest + courses where grade is lowest = highest priority)
- Each task text should be specific and actionable (not "study for test" but "Review chapters 5-6 for AP Stats cumulative MC test")
- motivation: short, real, matches the personality style
- Return ONLY the JSON, no markdown, no explanation
""",
                messages=[{
                    "role": "user",
                    "content": f"Today is {today}.\n\n{real_context}\n\nWhat are my 3 most important things to do today?",
                }],
            )

            # Parse structured data
            raw = response.content[0].text.strip()
            try:
                briefing_data = json.loads(raw)
            except json.JSONDecodeError:
                # Try to extract JSON from response
                start = raw.find("{")
                end = raw.rfind("}") + 1
                if start >= 0 and end > start:
                    try:
                        briefing_data = json.loads(raw[start:end])
                    except json.JSONDecodeError:
                        logger.warning("Could not parse briefing JSON for user %s", user_id)
                        continue
                else:
                    logger.warning("No JSON found in briefing response for user %s", user_id)
                    continue

            # Render to simple HTML — 3 tasks + motivation
            student_name = profile.get("display_name")
            briefing_html = render_daily_tasks_html(briefing_data, today, student_name)

            # Get user email from Supabase auth
            user_data = db.auth.admin.get_user_by_id(user_id)
            user_email = user_data.user.email if user_data and user_data.user else None

            if user_email:
                send_briefing_email(user_email, briefing_html, today)
                logger.info("Briefing sent to %s", user_email)
            else:
                logger.warning("No email found for user %s", user_id)

        except Exception as e:
            logger.exception("Failed to send briefing for user %s: %s", profile['user_id'], e)

    logger.info("Daily briefing job complete.")


def start_scheduler():
    """Start the background scheduler."""
    global _scheduler
    settings = get_settings()
    _scheduler = AsyncIOScheduler()

    # Daily LMS sync at configured hour
    _scheduler.add_job(
        daily_sync_job,
        CronTrigger(hour=settings.daily_sync_hour, minute=0),
        id="daily_sync",
        replace_existing=True,
    )

    # Check reminders every 5 minutes
    _scheduler.add_job(
        check_reminders_job,
        CronTrigger(minute="*/5"),
        id="check_reminders",
        replace_existing=True,
    )

    # Daily briefings — run every hour, send to users where it's 7 AM local
    _scheduler.add_job(
        send_daily_briefings_job,
        CronTrigger(minute=0),
        id="daily_briefings",
        replace_existing=True,
    )

    _scheduler.start()


def stop_scheduler():
    """Stop the background scheduler."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
