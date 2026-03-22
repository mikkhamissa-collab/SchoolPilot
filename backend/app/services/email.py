"""Email service via Resend."""
import logging
import html as html_mod
import json
from datetime import datetime, timezone
from typing import Optional

import resend

from app.config import get_settings

logger = logging.getLogger(__name__)


def _check_resend_key() -> bool:
    """Check if Resend API key is configured. Logs a warning if not."""
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY not set — email will not be sent. Set it in .env to enable emails.")
        return False
    resend.api_key = settings.resend_api_key
    return True


def send_reminder_email(to_email: str, title: str) -> bool:
    if not _check_resend_key():
        return False

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


def render_briefing_html(
    briefing_data: dict,
    date_str: str,
    student_name: Optional[str] = None,
) -> str:
    """Render structured briefing data into a clean HTML email.

    briefing_data should have keys: grades, priorities, quick_wins, streak, motivation
    """
    name_greeting = f", {html_mod.escape(student_name)}" if student_name else ""
    safe_date = html_mod.escape(date_str)

    # Build sections
    sections: list[str] = []

    # Grade snapshot
    grades = briefing_data.get("grades", [])
    if grades:
        grade_rows = ""
        for g in grades:
            course = html_mod.escape(str(g.get("course", "")))
            grade_val = html_mod.escape(str(g.get("grade", "N/A")))
            at_risk = g.get("at_risk", False)
            color = "#ef4444" if at_risk else "#10b981"
            grade_rows += (
                f"<tr><td style='padding: 8px 0; color: #e0e0e0; border-bottom: 1px solid #2a2a4a;'>{course}</td>"
                f"<td style='padding: 8px 0; color: {color}; font-weight: 600; text-align: right; border-bottom: 1px solid #2a2a4a;'>{grade_val}</td></tr>"
            )
        sections.append(
            "<div style='background: #141428; border-radius: 12px; padding: 20px; margin-bottom: 16px;'>"
            "<h3 style='color: #7c3aed; margin: 0 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;'>Grade Snapshot</h3>"
            f"<table style='width: 100%; border-collapse: collapse;'>{grade_rows}</table>"
            "</div>"
        )

    # Priorities
    priorities = briefing_data.get("priorities", [])
    if priorities:
        items = ""
        for p in priorities:
            text = html_mod.escape(str(p.get("text", p) if isinstance(p, dict) else p))
            urgency = p.get("urgency", "") if isinstance(p, dict) else ""
            urgency_color = "#ef4444" if urgency == "overdue" else "#f59e0b" if urgency == "today" else "#a0a0b0"
            urgency_label = f"<span style='color: {urgency_color}; font-size: 11px; text-transform: uppercase;'>{html_mod.escape(urgency)}</span> " if urgency else ""
            items += f"<li style='padding: 6px 0; color: #e0e0e0;'>{urgency_label}{text}</li>"
        sections.append(
            "<div style='background: #141428; border-radius: 12px; padding: 20px; margin-bottom: 16px;'>"
            "<h3 style='color: #7c3aed; margin: 0 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;'>Today's Priorities</h3>"
            f"<ul style='margin: 0; padding: 0 0 0 20px;'>{items}</ul>"
            "</div>"
        )

    # Quick wins
    quick_wins = briefing_data.get("quick_wins", [])
    if quick_wins:
        items = ""
        for w in quick_wins:
            text = html_mod.escape(str(w.get("text", w) if isinstance(w, dict) else w))
            items += f"<li style='padding: 4px 0; color: #e0e0e0;'>{text}</li>"
        sections.append(
            "<div style='background: #141428; border-radius: 12px; padding: 20px; margin-bottom: 16px;'>"
            "<h3 style='color: #7c3aed; margin: 0 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;'>Quick Wins</h3>"
            f"<ul style='margin: 0; padding: 0 0 0 20px;'>{items}</ul>"
            "</div>"
        )

    # Streak
    streak = briefing_data.get("streak", 0)
    if streak:
        sections.append(
            "<div style='background: #141428; border-radius: 12px; padding: 20px; margin-bottom: 16px; text-align: center;'>"
            f"<p style='color: #f59e0b; font-size: 32px; margin: 0;'>&#128293; {streak}</p>"
            "<p style='color: #a0a0b0; font-size: 12px; margin: 4px 0 0;'>day streak</p>"
            "</div>"
        )

    # Motivation
    motivation = briefing_data.get("motivation", "")
    if motivation:
        sections.append(
            "<div style='text-align: center; padding: 16px 0;'>"
            f"<p style='color: #a0a0b0; font-style: italic; font-size: 14px;'>{html_mod.escape(motivation)}</p>"
            "</div>"
        )

    sections_html = "".join(sections) if sections else "<p style='color: #a0a0b0;'>No updates for today. Enjoy your day!</p>"

    # Unsubscribe link
    unsubscribe = (
        "<div style='text-align: center; padding: 24px 0 0; border-top: 1px solid #2a2a4a; margin-top: 16px;'>"
        "<p style='color: #707080; font-size: 11px;'>"
        "You're receiving this because you enabled daily briefings on SchoolPilot.<br>"
        "<a href='https://schoolpilot.co/settings' style='color: #7c3aed;'>Unsubscribe</a>"
        "</p></div>"
    )

    return (
        "<div style='font-family: Inter, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 16px;'>"
        "<div style='background: #0a0a1a; padding: 32px; border-radius: 16px;'>"
        # Header
        "<div style='text-align: center; margin-bottom: 24px;'>"
        "<h1 style='color: #7c3aed; font-size: 24px; margin: 0;'>SchoolPilot</h1>"
        f"<p style='color: #a0a0b0; margin: 4px 0 0; font-size: 14px;'>{safe_date}</p>"
        f"<p style='color: #fff; font-size: 18px; margin: 12px 0 0;'>Hey{name_greeting} &#128075;</p>"
        "</div>"
        # Sections
        f"{sections_html}"
        # CTA
        "<div style='text-align: center; margin-top: 20px;'>"
        "<a href='https://schoolpilot.co/today' style='display: inline-block; background: #7c3aed; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;'>Open SchoolPilot</a>"
        "</div>"
        # Unsubscribe
        f"{unsubscribe}"
        "</div></div>"
    )


def send_briefing_email(to_email: str, briefing_html: str, date_str: str) -> bool:
    if not _check_resend_key():
        return False

    try:
        resend.Emails.send({
            "from": "SchoolPilot <pilot@schoolpilot.co>",
            "to": to_email,
            "subject": f"Your plan for {date_str}",
            "html": briefing_html,
        })
        return True
    except Exception:
        logger.exception("Failed to send briefing email to %s", to_email)
        return False


def send_buddy_nudge_email(to_email: str, from_name: str) -> bool:
    if not _check_resend_key():
        return False

    safe_name = html_mod.escape(from_name)
    try:
        resend.Emails.send({
            "from": "SchoolPilot <buddy@schoolpilot.co>",
            "to": to_email,
            "subject": f"{safe_name} nudged you on SchoolPilot!",
            "html": (
                "<div style='font-family: Inter, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;'>"
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
