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

    for user_id in user_ids:
        try:
            # Create job record
            job = db.table("agent_jobs").insert({
                "user_id": user_id,
                "job_type": "full_sync",
                "status": "pending",
            }).execute()

            job_id = job.data[0]["id"] if job.data else None

            # Import here to avoid circular imports
            from app.agent.explorer import LMSExplorer
            explorer = LMSExplorer(user_id, job_id)
            await explorer.run()

        except Exception as e:
            logger.exception(f"Daily sync failed for user {user_id}: {e}")

    logger.info("Daily sync job complete.")


async def check_reminders_job():
    """Check for due reminders and create notification messages."""
    db = get_db()
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

    for reminder in due.data:
        try:
            # Mark as sent
            db.table("reminders").update({
                "sent": True,
                "sent_at": now,
            }).eq("id", reminder["id"]).execute()

            # TODO: Send push notification or in-app message
            logger.info(f"Reminder sent: {reminder['title']} for user {reminder['user_id']}")

        except Exception as e:
            logger.exception(f"Failed to process reminder {reminder['id']}: {e}")


async def send_daily_briefings_job():
    """Send daily email briefings to users who have them enabled."""
    logger.info("Starting daily briefing job...")
    db = get_db()

    profiles = (
        db.table("student_profiles")
        .select("user_id, display_name, email_briefings, personality_preset")
        .eq("daily_briefing_enabled", True)
        .eq("email_briefings", True)
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
    import resend

    resend.api_key = settings.resend_api_key
    client = anthropic_sdk.Anthropic(api_key=settings.anthropic_api_key)

    from app.memory.store import MemoryStore
    from app.agent.prompts.personalities import get_personality

    for profile in profiles.data:
        try:
            user_id = profile["user_id"]
            memory = MemoryStore(user_id)
            context = await memory.build_context()

            personality = get_personality(profile.get("personality_preset", "coach"))
            today = datetime.now(timezone.utc).strftime("%A, %B %d, %Y")

            response = client.messages.create(
                model=settings.claude_model,
                max_tokens=1024,
                system=f"""{personality['system_prompt']}

Create a concise daily briefing email for this student. Include:
1. What's due today and tomorrow (URGENT items first)
2. A quick priority list for the day
3. One encouraging note

Keep it short — this is a morning email, not an essay. Use HTML formatting (bold, bullet points, headers).
""",
                messages=[{
                    "role": "user",
                    "content": f"Today is {today}.\n\n{context}\n\nWrite the daily briefing email.",
                }],
            )

            briefing_html = response.content[0].text

            # Get user email from Supabase auth
            user_data = db.auth.admin.get_user_by_id(user_id)
            user_email = user_data.user.email if user_data and user_data.user else None

            if user_email:
                resend.Emails.send({
                    "from": "SchoolPilot <briefing@schoolpilot.co>",
                    "to": user_email,
                    "subject": f"SchoolPilot — Your Plan for {today}",
                    "html": f"<div style='font-family: sans-serif; max-width: 600px; margin: 0 auto;'>{briefing_html}</div>",
                })
                logger.info(f"Briefing sent to {user_email}")
            else:
                logger.warning(f"No email found for user {user_id}")

        except Exception as e:
            logger.exception(f"Failed to send briefing for user {profile['user_id']}: {e}")

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

    # Daily briefings at 7 AM UTC
    _scheduler.add_job(
        send_daily_briefings_job,
        CronTrigger(hour=7, minute=0),
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
