"""Email service via Resend."""
import logging
import html as html_mod
from datetime import datetime, timezone

import resend

from app.config import get_settings

logger = logging.getLogger(__name__)


def send_reminder_email(to_email: str, title: str) -> bool:
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("Resend API key not set, skipping email")
        return False

    resend.api_key = settings.resend_api_key
    safe_title = html_mod.escape(title)
    try:
        resend.Emails.send({
            "from": "SchoolPilot <reminders@schoolpilot.co>",
            "to": to_email,
            "subject": f"Reminder: {safe_title}",
            "html": (
                "<div style='font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;'>"
                "<div style='background: #0a0a1a; padding: 24px; border-radius: 12px;'>"
                "<h2 style='color: #7c3aed; margin: 0 0 12px;'>&#9200; Reminder</h2>"
                f"<p style='color: #fff; font-size: 16px;'><strong>{safe_title}</strong></p>"
                "<p style='color: #a0a0b0; font-size: 14px;'>From your SchoolPilot assistant</p>"
                "</div></div>"
            ),
        })
        return True
    except Exception:
        logger.exception("Failed to send reminder email to %s", to_email)
        return False


def send_briefing_email(to_email: str, briefing_html: str, date_str: str) -> bool:
    settings = get_settings()
    if not settings.resend_api_key:
        return False

    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send({
            "from": "SchoolPilot <pilot@schoolpilot.co>",
            "to": to_email,
            "subject": f"Your plan for {date_str}",
            "html": (
                "<div style='font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;'>"
                "<div style='background: #0a0a1a; padding: 32px; border-radius: 16px;'>"
                "<div style='text-align: center; margin-bottom: 24px;'>"
                "<h1 style='color: #7c3aed; font-size: 24px; margin: 0;'>SchoolPilot</h1>"
                f"<p style='color: #a0a0b0; margin: 4px 0 0;'>{html_mod.escape(date_str)}</p>"
                "</div>"
                f"<div style='color: #e0e0e0; line-height: 1.6;'>{briefing_html}</div>"
                "</div></div>"
            ),
        })
        return True
    except Exception:
        logger.exception("Failed to send briefing email to %s", to_email)
        return False


def send_buddy_nudge_email(to_email: str, from_name: str) -> bool:
    settings = get_settings()
    if not settings.resend_api_key:
        return False

    resend.api_key = settings.resend_api_key
    safe_name = html_mod.escape(from_name)
    try:
        resend.Emails.send({
            "from": "SchoolPilot <buddy@schoolpilot.co>",
            "to": to_email,
            "subject": f"{safe_name} nudged you on SchoolPilot!",
            "html": (
                "<div style='font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;'>"
                "<div style='background: #0a0a1a; padding: 24px; border-radius: 12px; text-align: center;'>"
                f"<h2 style='color: #7c3aed;'>&#128075; {safe_name} nudged you!</h2>"
                "<p style='color: #e0e0e0;'>Your study buddy wants you to get to work.</p>"
                "<a href='https://schoolpilot.co/today' style='display: inline-block; background: #7c3aed; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 16px;'>Open SchoolPilot</a>"
                "</div></div>"
            ),
        })
        return True
    except Exception:
        logger.exception("Failed to send nudge email to %s", to_email)
        return False
