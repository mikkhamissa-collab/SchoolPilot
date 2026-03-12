# explorer.py — High-level LMS exploration orchestrator.
# Manages the full lifecycle: decrypt credentials → launch browser agent →
# login → explore → store extracted data in Supabase → update job record.

import asyncio
import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from cryptography.fernet import Fernet, InvalidToken

from app.agent.browser import BrowserAgent
from app.config import get_settings
from app.db import get_db

logger = logging.getLogger(__name__)


class LMSExplorer:
    """Orchestrates a full LMS exploration run for one student.

    Usage::

        explorer = LMSExplorer(user_id="uuid", job_id="uuid")
        result = await explorer.run()
        # result is e.g. {"status": "success", "assignments": 12, ...}
    """

    def __init__(self, user_id: str, job_id: Optional[str] = None) -> None:
        self.user_id = user_id
        self.job_id = job_id
        self.settings = get_settings()
        self.db = get_db()

    # ── Credential encryption helpers ─────────────────────────────────

    def _fernet(self) -> Fernet:
        """Build a Fernet instance from the configured encryption key."""
        key = self.settings.credential_encryption_key
        if not key:
            raise RuntimeError("credential_encryption_key is not configured")
        # Fernet expects bytes
        return Fernet(key.encode("utf-8") if isinstance(key, str) else key)

    def _decrypt(self, encrypted: str) -> str:
        """Decrypt a Fernet-encrypted credential string."""
        try:
            return self._fernet().decrypt(encrypted.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            raise ValueError("Failed to decrypt credential — key may have changed")

    def _encrypt(self, plain: str) -> str:
        """Encrypt a plaintext credential string with Fernet."""
        return self._fernet().encrypt(plain.encode("utf-8")).decode("utf-8")

    # ── Main entry point ──────────────────────────────────────────────

    async def run(self) -> dict[str, Any]:
        """Execute the full sync: login, explore, extract, store.

        Returns a summary dict with at least a ``status`` key.
        """
        # 1. Fetch LMS credentials for this user
        creds_response = (
            self.db.table("lms_credentials")
            .select("*")
            .eq("user_id", self.user_id)
            .eq("sync_enabled", True)
            .execute()
        )

        if not creds_response.data:
            logger.warning("No active LMS credentials for user %s", self.user_id)
            self._update_job("failed", error="No LMS credentials configured")
            return {"status": "no_credentials", "message": "No LMS credentials configured"}

        cred = creds_response.data[0]
        cred_id: str = cred["id"]
        lms_url: str = cred["lms_url"]

        # 2. Mark job as running
        self._update_job("running", extra={"started_at": _utcnow()})

        agent = BrowserAgent(self.user_id)

        try:
            await agent.start()

            # 3. Decrypt credentials
            try:
                username = self._decrypt(cred["encrypted_username"])
                password = self._decrypt(cred["encrypted_password"])
            except (ValueError, KeyError) as exc:
                logger.error("Credential decryption failed for user %s: %s", self.user_id, exc)
                self._update_job("failed", error="Could not decrypt LMS credentials")
                self._update_cred_status(cred_id, success=False, error="Decryption failed")
                return {"status": "decrypt_error", "message": str(exc)}

            # 4. Login
            logger.info("Attempting LMS login for user %s at %s", self.user_id, lms_url)
            login_ok = await agent.login(lms_url, username, password)

            if not login_ok:
                msg = "Login failed — credentials may be wrong or a CAPTCHA was detected"
                logger.warning("Login failed for user %s", self.user_id)
                self._update_job("failed", error=msg)
                self._update_cred_status(cred_id, success=False, error=msg)
                return {"status": "login_failed", "message": msg}

            logger.info("Login succeeded for user %s", self.user_id)
            self._update_cred_status(cred_id, success=True)

            # 5. Explore & extract
            extracted = await agent.explore()
            logger.info(
                "Exploration complete for user %s: %d items from %d steps",
                self.user_id, len(extracted), len(agent.history),
            )

            # 6. Store extracted data
            counts = await self._store_extracted_data(extracted)

            # 7. Mark job complete
            self._update_job(
                "completed",
                extra={
                    "pages_visited": len(agent.history),
                    "data_extracted": counts,
                    "completed_at": _utcnow(),
                },
            )

            return {"status": "success", **counts}

        except Exception as exc:
            logger.exception("Exploration failed for user %s", self.user_id)
            self._update_job("failed", error=str(exc)[:500])
            return {"status": "error", "message": str(exc)}

        finally:
            await agent.stop()

    # ── Data storage ──────────────────────────────────────────────────

    async def _store_extracted_data(self, extracted: list[dict]) -> dict[str, int]:
        """Process the raw extracted dicts and upsert them into Supabase.

        Returns a dict of ``{type: count}`` for each category persisted.
        """
        counts: dict[str, int] = {
            "assignments": 0,
            "grades": 0,
            "courses": 0,
            "announcements": 0,
            "calendar": 0,
        }

        for item in extracted:
            item_type = item.get("type")
            try:
                if item_type == "assignment":
                    self._upsert_assignment(item)
                    counts["assignments"] += 1

                elif item_type == "grade":
                    self._upsert_grade(item)
                    counts["grades"] += 1

                elif item_type == "course":
                    self._upsert_course(item)
                    counts["courses"] += 1

                elif item_type == "announcement":
                    self._upsert_announcement(item)
                    counts["announcements"] += 1

                elif item_type == "calendar":
                    self._upsert_calendar(item)
                    counts["calendar"] += 1

                else:
                    logger.debug("Skipping unknown extracted type: %s", item_type)

            except Exception:
                logger.warning(
                    "Failed to store %s item: %s",
                    item_type,
                    item.get("title", "<no title>"),
                    exc_info=True,
                )

        # Update last_sync_at on the credential row
        self.db.table("lms_credentials").update({
            "last_sync_at": _utcnow(),
        }).eq("user_id", self.user_id).execute()

        logger.info("Stored data for user %s: %s", self.user_id, counts)
        return counts

    # ── Upsert helpers ────────────────────────────────────────────────

    def _stable_id(self, *parts: Optional[str]) -> str:
        """Create a deterministic ID from component strings.

        Used as ``lms_id`` so that re-scraping the same assignment doesn't
        create duplicates.
        """
        combined = "__".join(str(p or "") for p in parts)
        return hashlib.sha256(combined.encode("utf-8")).hexdigest()[:40]

    def _upsert_assignment(self, item: dict) -> None:
        lms_id = self._stable_id(
            item.get("course"),
            item.get("title"),
            item.get("due_date"),
        )
        self.db.table("lms_assignments").upsert(
            {
                "user_id": self.user_id,
                "lms_id": lms_id,
                "title": item.get("title", "Untitled"),
                "description": item.get("description"),
                "course_name": item.get("course"),
                "assignment_type": item.get("assignment_type"),
                "due_date": item.get("due_date"),
                "points_possible": item.get("points"),
                "is_submitted": item.get("submitted", False),
                "is_graded": item.get("graded", False),
                "points_earned": item.get("score"),
                "lms_url": item.get("url"),
                "job_id": self.job_id,
                "extracted_at": _utcnow(),
            },
            on_conflict="user_id,lms_id",
        ).execute()

    def _upsert_grade(self, item: dict) -> None:
        overall_pct = item.get("overall_percentage")
        if overall_pct is not None:
            try:
                overall_pct = float(overall_pct)
                if overall_pct < 0 or overall_pct > 100:
                    logger.warning(
                        "Grade percentage out of range (%.2f) for course %s, setting to None",
                        overall_pct, item.get("course"),
                    )
                    overall_pct = None
            except (TypeError, ValueError):
                logger.warning("Invalid grade percentage value: %s", overall_pct)
                overall_pct = None

        self.db.table("lms_grades").upsert(
            {
                "user_id": self.user_id,
                "course_name": item.get("course", "Unknown"),
                "overall_grade": item.get("overall_grade"),
                "overall_percentage": overall_pct,
                "category_breakdown": item.get("categories", {}),
                "job_id": self.job_id,
                "extracted_at": _utcnow(),
            },
            on_conflict="user_id,course_name",
        ).execute()

    def _upsert_course(self, item: dict) -> None:
        self.db.table("class_context").upsert(
            {
                "user_id": self.user_id,
                "class_name": item.get("name", "Unknown"),
                "teacher_name": item.get("teacher"),
                "period": item.get("period"),
                "room": item.get("room"),
                "updated_at": _utcnow(),
            },
            on_conflict="user_id,class_name",
        ).execute()

    def _upsert_announcement(self, item: dict) -> None:
        lms_id = self._stable_id(
            item.get("course"),
            item.get("title"),
            item.get("date"),
        )
        self.db.table("lms_announcements").upsert(
            {
                "user_id": self.user_id,
                "lms_id": lms_id,
                "title": item.get("title", "Untitled"),
                "course_name": item.get("course"),
                "content": item.get("content"),
                "posted_date": item.get("date"),
                "job_id": self.job_id,
                "extracted_at": _utcnow(),
            },
            on_conflict="user_id,lms_id",
        ).execute()

    def _upsert_calendar(self, item: dict) -> None:
        lms_id = self._stable_id(
            item.get("course"),
            item.get("title"),
            item.get("date"),
        )
        self.db.table("lms_calendar_events").upsert(
            {
                "user_id": self.user_id,
                "lms_id": lms_id,
                "title": item.get("title", "Untitled"),
                "course_name": item.get("course"),
                "event_date": item.get("date"),
                "details": item.get("details"),
                "job_id": self.job_id,
                "extracted_at": _utcnow(),
            },
            on_conflict="user_id,lms_id",
        ).execute()

    # ── Job / credential status updates ───────────────────────────────

    def _update_job(
        self,
        status: str,
        *,
        error: Optional[str] = None,
        extra: Optional[dict] = None,
    ) -> None:
        """Persist job status to the ``agent_jobs`` table."""
        if not self.job_id:
            return

        update: dict[str, Any] = {"status": status}
        if error:
            update["error_message"] = error[:1000]
        if extra:
            update.update(extra)

        try:
            self.db.table("agent_jobs").update(update).eq("id", self.job_id).execute()
        except Exception:
            logger.warning("Failed to update job %s", self.job_id, exc_info=True)

    def _update_cred_status(
        self,
        cred_id: str,
        *,
        success: bool,
        error: Optional[str] = None,
    ) -> None:
        """Record whether the most recent login attempt succeeded."""
        update: dict[str, Any] = {
            "last_login_success": success,
            "last_login_at": _utcnow(),
        }
        if error:
            update["last_error"] = error[:500]

        try:
            self.db.table("lms_credentials").update(update).eq("id", cred_id).execute()
        except Exception:
            logger.warning("Failed to update cred status %s", cred_id, exc_info=True)


# ── Utility ───────────────────────────────────────────────────────────

def _utcnow() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


# ── Convenience runner (for background tasks / CLI) ───────────────────

async def run_exploration(user_id: str, job_id: Optional[str] = None) -> dict[str, Any]:
    """Top-level async function to kick off an exploration.

    Suitable for use with ``asyncio.create_task()`` or from a task queue.
    """
    explorer = LMSExplorer(user_id=user_id, job_id=job_id)
    return await explorer.run()
