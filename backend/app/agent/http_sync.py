# http_sync.py — HTTP-based LMS sync using Teamie's internal REST API.
# Replaces the Playwright browser agent for data fetching. Uses saved session
# cookies to make authenticated httpx requests against Teamie endpoints.
#
# This is dramatically faster than browser-based scraping (~2-5 seconds vs
# 30-60 seconds per sync) and more reliable since we parse structured JSON
# instead of scraping rendered HTML.

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from cryptography.fernet import Fernet, InvalidToken

from app.agent.sync_utils import (
    decrypt_credential,
    get_fernet,
    normalize_course_name,
    pct_to_letter,
    stable_id,
    utcnow,
)
from app.config import get_settings
from app.db import get_db

logger = logging.getLogger(__name__)


async def ping_session(user_id: str) -> bool:
    """Lightweight session keep-alive: hit /api/fresh-posts.json with saved cookies.

    Returns True if the session is still valid, False if expired.
    Does NOT extract any data — just keeps the Drupal session from expiring.
    """
    db = get_db()

    cred_resp = (
        db.table("lms_credentials")
        .select("id, lms_url, encrypted_cookies")
        .eq("user_id", user_id)
        .eq("sync_enabled", True)
        .execute()
    )
    if not cred_resp.data or not cred_resp.data[0].get("encrypted_cookies"):
        return False

    cred = cred_resp.data[0]
    base_url = (cred.get("lms_url") or "https://lms.asl.org").rstrip("/")

    # Decrypt cookies
    try:
        cookies_json = decrypt_credential(cred["encrypted_cookies"])
        cookie_list = json.loads(cookies_json)
    except (ValueError, json.JSONDecodeError):
        return False

    jar = httpx.Cookies()
    for c in cookie_list:
        jar.set(c.get("name", ""), c.get("value", ""), domain=c.get("domain", ""), path=c.get("path", "/"))

    async with httpx.AsyncClient(cookies=jar, timeout=15.0, follow_redirects=False, headers={"Accept": "application/json"}) as client:
        try:
            resp = await client.get(f"{base_url}/api/fresh-posts.json")
            if resp.status_code != 200 or "html" in resp.headers.get("content-type", ""):
                logger.info("Session expired for user %s during ping", user_id)
                db.table("lms_credentials").update(
                    {"last_login_success": False, "last_error": "Session expired (ping)"}
                ).eq("id", cred["id"]).execute()
                return False
            resp.json()  # confirm it's valid JSON
            logger.debug("Session ping OK for user %s", user_id)
            return True
        except (httpx.HTTPError, json.JSONDecodeError):
            return False


# _utcnow and _normalize_course_name are imported from sync_utils
_utcnow = utcnow
_normalize_course_name = normalize_course_name


class TeamieHTTPSync:
    """Syncs student data from Teamie LMS using direct HTTP API calls.

    Replaces the Playwright-based BrowserAgent approach. Uses session cookies
    captured during onboarding to make authenticated API requests.

    Usage::

        sync = TeamieHTTPSync(user_id="uuid", job_id="uuid")
        result = await sync.run()
    """

    def __init__(self, user_id: str, job_id: Optional[str] = None) -> None:
        self.user_id = user_id
        self.job_id = job_id
        self.settings = get_settings()
        self.db = get_db()
        self.base_url = ""
        self.teamie_uid = ""
        self._stats: dict[str, int] = {
            "classrooms": 0,
            "grades": 0,
            "assignments": 0,
        }

    # ── Crypto helpers (delegated to sync_utils) ────────────────────

    def _decrypt(self, encrypted: str) -> str:
        return decrypt_credential(encrypted)

    # ── Job tracking ──────────────────────────────────────────────────

    def _update_job(self, status: str, error: Optional[str] = None, extra: Optional[dict] = None) -> None:
        if not self.job_id:
            return
        payload: dict[str, Any] = {"status": status, "updated_at": _utcnow()}
        if status in ("completed", "failed"):
            payload["completed_at"] = _utcnow()
        if error:
            payload["error_message"] = error[:1000]
        if extra:
            payload.update(extra)
        try:
            self.db.table("agent_jobs").update(payload).eq("id", self.job_id).execute()
        except Exception:
            logger.debug("Failed to update job %s", self.job_id, exc_info=True)

    # ── Stable ID for dedup (delegated to sync_utils) ──────────────

    def _stable_id(self, *parts: Optional[str]) -> str:
        return stable_id(*parts)

    # ── Main entry point ──────────────────────────────────────────────

    async def run(self) -> dict[str, Any]:
        """Full sync: validate cookies → fetch classrooms → grades → assignments → store."""

        # 1. Load credentials
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
            return {"status": "no_credentials"}

        cred = creds_response.data[0]
        self.base_url = (cred.get("lms_url") or "https://lms.asl.org").rstrip("/")
        self.teamie_uid = cred.get("teamie_uid") or ""

        # 2. Decrypt cookies
        if not cred.get("encrypted_cookies"):
            self._update_job("failed", error="No cookies stored — re-login required")
            return {"status": "no_cookies"}

        try:
            cookies_json = self._decrypt(cred["encrypted_cookies"])
            cookie_list = json.loads(cookies_json)
        except (ValueError, json.JSONDecodeError) as exc:
            logger.error("Cookie decryption failed for user %s: %s", self.user_id, exc)
            self._update_job("failed", error="Cookie decryption failed")
            return {"status": "decrypt_error"}

        # 3. Build httpx client with cookies
        jar = httpx.Cookies()
        for c in cookie_list:
            jar.set(
                c.get("name", ""),
                c.get("value", ""),
                domain=c.get("domain", ""),
                path=c.get("path", "/"),
            )

        self._update_job("running", extra={"started_at": _utcnow()})

        async with httpx.AsyncClient(
            cookies=jar,
            timeout=30.0,
            follow_redirects=False,
            headers={"Accept": "application/json"},
        ) as client:
            # 4. Validate cookies with fresh-posts endpoint
            valid = await self._check_cookies(client)
            if not valid:
                self._mark_session_expired(cred["id"])
                self._update_job("failed", error="Session cookies expired")
                return {"status": "session_expired"}

            # 5. Discover teamie_uid if not stored
            if not self.teamie_uid:
                self.teamie_uid = await self._discover_uid(client)
                if self.teamie_uid:
                    # Save it for future syncs
                    try:
                        self.db.table("lms_credentials").update(
                            {"teamie_uid": self.teamie_uid}
                        ).eq("id", cred["id"]).execute()
                    except Exception:
                        logger.debug("Failed to save teamie_uid", exc_info=True)

            if not self.teamie_uid:
                self._update_job("failed", error="Could not determine Teamie user ID")
                return {"status": "no_uid"}

            # 6. Fetch classrooms
            classrooms = await self._fetch_classrooms(client)
            if not classrooms:
                logger.warning("No classrooms found for user %s", self.user_id)

            # 7. For each classroom: fetch gradebook + store course
            for cr in classrooms:
                self._upsert_course(cr)
                self._stats["classrooms"] += 1
                await self._fetch_and_store_grades(client, cr)

            # 8. Fetch events (upcoming + past assignments)
            await self._fetch_and_store_events(client, "upcoming")
            await self._fetch_and_store_events(client, "past")

            # 9. Update sync timestamp
            try:
                self.db.table("lms_credentials").update(
                    {"last_sync_at": _utcnow(), "last_login_success": True, "last_error": None}
                ).eq("id", cred["id"]).execute()
            except Exception:
                logger.debug("Failed to update sync timestamp", exc_info=True)

        # 10. Mark job complete
        self._update_job("completed", extra={"result": self._stats})
        logger.info(
            "HTTP sync complete for user %s: %d classrooms, %d grades, %d assignments",
            self.user_id,
            self._stats["classrooms"],
            self._stats["grades"],
            self._stats["assignments"],
        )
        return {"status": "success", **self._stats}

    # ── Cookie validation ─────────────────────────────────────────────

    async def _check_cookies(self, client: httpx.AsyncClient) -> bool:
        """Test cookie validity with /api/fresh-posts.json."""
        try:
            resp = await client.get(f"{self.base_url}/api/fresh-posts.json")
            if resp.status_code in (301, 302, 303, 307, 308):
                logger.info("Cookies expired for user %s (redirect to login)", self.user_id)
                return False
            if resp.status_code != 200:
                logger.info("Cookies invalid for user %s (status %d)", self.user_id, resp.status_code)
                return False
            # Check that response is JSON, not HTML login page
            content_type = resp.headers.get("content-type", "")
            if "html" in content_type:
                logger.info("Cookies expired for user %s (got HTML instead of JSON)", self.user_id)
                return False
            resp.json()  # will raise if not JSON
            return True
        except (httpx.HTTPError, json.JSONDecodeError) as exc:
            logger.warning("Cookie check failed for user %s: %s", self.user_id, exc)
            return False

    def _mark_session_expired(self, cred_id: str) -> None:
        """Mark credentials as having an expired session."""
        try:
            self.db.table("lms_credentials").update(
                {"last_login_success": False, "last_error": "Session cookies expired", "last_sync_at": _utcnow()}
            ).eq("id", cred_id).execute()
        except Exception:
            logger.debug("Failed to mark session expired", exc_info=True)

    # ── UID discovery ─────────────────────────────────────────────────

    async def _discover_uid(self, client: httpx.AsyncClient) -> str:
        """Try to discover the Teamie uid from cookies or profile endpoint.

        The Drupal session sometimes includes uid info. As a fallback, we try
        uid values from 1-based guessing — but the most reliable method is
        that the cookies themselves may contain the uid in their name/metadata.
        """
        # Try to extract uid from cookie names or a known endpoint
        # The /api/classroom.json response doesn't need uid, so we can use
        # classrooms to find events which reference our uid
        try:
            resp = await client.get(f"{self.base_url}/api/events.json", params={
                "mode": "category",
                "category": "upcoming",
                "items_per_page": "1",
                "page": "1",
            })
            if resp.status_code == 200:
                data = resp.json()
                # Events endpoint works without uid param (uses session user)
                # We can get uid from the profile
                # Try fetching our own profile — Teamie redirects /api/profile/me.json
                # or we can look at the response headers
                pass
        except Exception:
            pass

        # Try the profile endpoint with common patterns
        # Some Teamie instances support /api/profile/current.json or similar
        # Let's try a self-profile fetch
        try:
            resp = await client.get(f"{self.base_url}/api/profile/me.json")
            if resp.status_code == 200:
                data = resp.json()
                uid = data.get("user", {}).get("uid")
                if uid:
                    logger.info("Discovered Teamie uid=%s for user %s", uid, self.user_id)
                    return str(uid)
        except Exception:
            pass

        logger.warning("Could not auto-discover Teamie uid for user %s", self.user_id)
        return ""

    # ── Data fetching ─────────────────────────────────────────────────

    async def _fetch_classrooms(self, client: httpx.AsyncClient) -> list[dict]:
        """GET /api/classroom.json → list of classroom objects."""
        try:
            resp = await client.get(f"{self.base_url}/api/classroom.json")
            resp.raise_for_status()
            data = resp.json()
            # Response is a direct array of classrooms
            if isinstance(data, list):
                return data
            # Some versions wrap in an object
            if isinstance(data, dict) and "classrooms" in data:
                return data["classrooms"]
            return data if isinstance(data, list) else []
        except Exception as exc:
            logger.error("Failed to fetch classrooms for user %s: %s", self.user_id, exc)
            return []

    async def _fetch_and_store_grades(self, client: httpx.AsyncClient, classroom: dict) -> None:
        """Fetch gradebook for a classroom and store individual scores + overall grade."""
        nid = classroom.get("nid")
        course_name = classroom.get("name", "Unknown")
        if not nid:
            return

        try:
            resp = await client.get(
                f"{self.base_url}/api/classroom/{nid}/gradebook_summary.json",
                params={"uid": self.teamie_uid},
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("Failed to fetch gradebook for classroom %s: %s", nid, exc)
            return

        scores = data.get("scores") or []
        if not scores:
            return

        total_score = 0.0
        total_max = 0.0
        published_count = 0

        for score in scores:
            if not score.get("is_published"):
                continue

            qid = score.get("qid")
            student_score = score.get("score")
            max_score = score.get("max_score")

            # Store each score as an assignment with grade
            lms_id = self._stable_id(str(nid), str(qid))
            score_updated = score.get("score_updated")
            due_date = None
            if score_updated:
                try:
                    due_date = datetime.fromtimestamp(score_updated, tz=timezone.utc).isoformat()
                except (ValueError, OSError):
                    pass

            self.db.table("lms_assignments").upsert(
                {
                    "user_id": self.user_id,
                    "lms_id": lms_id,
                    "title": score.get("title", "Untitled"),
                    "course_name": course_name,
                    "assignment_type": score.get("assessment_type", ""),
                    "due_date": due_date,
                    "points_possible": max_score,
                    "is_graded": True,
                    "points_earned": student_score,
                    "is_submitted": True,
                    "job_id": self.job_id,
                    "extracted_at": _utcnow(),
                },
                on_conflict="user_id,lms_id",
            ).execute()
            self._stats["grades"] += 1

            # Accumulate for overall percentage
            if student_score is not None and max_score and max_score > 0:
                total_score += float(student_score)
                total_max += float(max_score)
                published_count += 1

        # Calculate and store overall course grade
        # DB schema: UNIQUE(user_id, course_name) — no lms_id column on lms_grades
        if total_max > 0:
            overall_pct = round(total_score / total_max * 100, 2)
            letter = pct_to_letter(overall_pct)

            self.db.table("lms_grades").upsert(
                {
                    "user_id": self.user_id,
                    "course_name": course_name,
                    "overall_grade": letter,
                    "overall_percentage": overall_pct,
                    "category_breakdown": {
                        "_total_score": round(total_score, 2),
                        "_total_possible": round(total_max, 2),
                        "_graded_items": published_count,
                    },
                    "job_id": self.job_id,
                    "extracted_at": _utcnow(),
                },
                on_conflict="user_id,course_name",
            ).execute()

    async def _fetch_and_store_events(self, client: httpx.AsyncClient, category: str) -> None:
        """Fetch events (upcoming/past assignments) and store them."""
        page = 1
        max_pages = 5  # Safety limit

        while page <= max_pages:
            try:
                resp = await client.get(
                    f"{self.base_url}/api/events.json",
                    params={
                        "mode": "category",
                        "category": category,
                        "uid": self.teamie_uid,
                        "items_per_page": "100",
                        "page": str(page),
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                logger.warning("Failed to fetch %s events page %d: %s", category, page, exc)
                break

            events = data.get("events") or []
            if not events:
                break

            for event in events:
                self._upsert_event(event, category)

            # Check if there are more pages
            total = data.get("count", 0)
            if page * 100 >= total:
                break
            page += 1

    # ── Upsert helpers ────────────────────────────────────────────────

    def _upsert_course(self, classroom: dict) -> None:
        """Store a classroom as a course in class_context."""
        raw_name = classroom.get("name", "Unknown")
        normalized = _normalize_course_name(raw_name)

        # Check for existing course with same normalized name
        existing = (
            self.db.table("class_context")
            .select("class_name")
            .eq("user_id", self.user_id)
            .execute()
        )
        canonical = raw_name
        for row in existing.data or []:
            if _normalize_course_name(row["class_name"]) == normalized:
                if len(row["class_name"]) >= len(canonical):
                    canonical = row["class_name"]
                break

        self.db.table("class_context").upsert(
            {
                "user_id": self.user_id,
                "class_name": canonical,
                "updated_at": _utcnow(),
            },
            on_conflict="user_id,class_name",
        ).execute()

    def _upsert_event(self, event: dict, category: str) -> None:
        """Store an event as an assignment in lms_assignments."""
        group = event.get("group") or {}
        entity = event.get("entity") or {}
        stats = entity.get("stats", {}).get("submission_status", {})

        course_name = group.get("title", "")
        title = event.get("title", "Untitled")
        nid = group.get("nid", "")
        entity_id = entity.get("id", "")

        lms_id = self._stable_id(str(nid), str(entity_id))

        # Parse created timestamp
        created = event.get("created")
        due_date = None
        if created:
            try:
                due_date = datetime.fromtimestamp(int(created), tz=timezone.utc).isoformat()
            except (ValueError, OSError):
                pass

        is_submitted = bool(stats.get("num_attempts", 0) > 0 or stats.get("submission_access", 0) > 0)
        score = stats.get("score")

        self.db.table("lms_assignments").upsert(
            {
                "user_id": self.user_id,
                "lms_id": lms_id,
                "title": title,
                "course_name": course_name,
                "due_date": due_date,
                "is_submitted": is_submitted,
                "is_graded": score is not None,
                "points_earned": score,
                "lms_url": event.get("url"),
                "job_id": self.job_id,
                "extracted_at": _utcnow(),
            },
            on_conflict="user_id,lms_id",
        ).execute()
        self._stats["assignments"] += 1

    # _pct_to_letter is now imported from sync_utils as pct_to_letter
