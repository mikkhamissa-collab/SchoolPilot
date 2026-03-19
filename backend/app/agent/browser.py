# browser.py — Vision-based browser agent that explores LMS websites using
# Playwright screenshots and Claude for decision-making.  The core loop is:
# observe (screenshot) → decide (Claude) → act (Playwright) → repeat.

import asyncio
import base64
import json
import logging
from typing import Optional

from playwright.async_api import (
    async_playwright,
    Browser,
    BrowserContext,
    Page,
    Playwright,
    TimeoutError as PlaywrightTimeout,
)
import anthropic

from app.config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

_LOGIN_SYSTEM_PROMPT = """\
You are a browser automation agent.  Your ONLY job right now is to help a
student log into their school Learning Management System.

Analyse the screenshot and return **exactly one** JSON action — nothing else
(no markdown fences, no explanation).

Available actions
─────────────────
{"action":"type","selector":"<css>","text":"<value>"}
  Fill a text field.  Use USERNAME_PLACEHOLDER for the student's username
  and PASSWORD_PLACEHOLDER for the password — the caller will replace them.

{"action":"click","selector":"<css>"}
  Click a button, link, or element.

{"action":"press","key":"Enter"}
  Press a keyboard key (e.g. Enter after typing password).

{"action":"wait","seconds":3}
  Wait for something to load.

{"action":"login_complete"}
  Return this once you can see the logged-in dashboard / landing page.

{"action":"login_failed","reason":"short explanation"}
  Return this if login is clearly impossible (wrong creds, CAPTCHA, etc.).

Tips
────
* Prefer specific CSS selectors — id > name > type > placeholder text.
* If you see a CAPTCHA or 2FA prompt, return login_failed immediately.
* If the page is still loading (spinner, blank), return a wait action.
* After submitting credentials, return wait then check the result.
"""

_EXPLORER_SYSTEM_PROMPT = """\
You are a browser automation agent exploring a Learning Management System
(LMS) to extract academic information for a high-school student.

GOAL: find and extract ALL useful academic data — courses, assignments,
grades, due dates, syllabi, teacher info, announcements, calendar events.

Return **exactly one** JSON action per turn — no markdown, no prose.

Available actions
─────────────────
{"action":"click","selector":"<css_or_text>"}
  Click a link, button, tab, or element.

{"action":"navigate","url":"<full_url>"}
  Go to a specific URL directly.

{"action":"extract","data":{...}}
  Record structured data you can see on screen RIGHT NOW.
  Schemas:
    assignment → {"type":"assignment","title":"…","course":"…",
                  "due_date":"…","description":"…","points":…,
                  "assignment_type":"homework|test|quiz|lab|essay|project",
                  "submitted":false,"graded":false,"score":null,"url":"…"}
    grade      → {"type":"grade","course":"…","overall_grade":"…",
                  "overall_percentage":…,"categories":{…}}
    course     → {"type":"course","name":"…","teacher":"…",
                  "period":"…","room":"…"}
    announcement → {"type":"announcement","title":"…","course":"…",
                    "content":"…","date":"…"}
    calendar   → {"type":"calendar","title":"…","date":"…",
                  "course":"…","details":"…"}
  You may include extra fields.  Omit fields you cannot see (don't guess).

{"action":"scroll","direction":"down|up","amount":500}
  Scroll the viewport.

{"action":"back"}
  Navigate back.

{"action":"wait","seconds":2}
  Pause for content to load.

{"action":"done","summary":"short summary of what was collected"}
  Call this when you have thoroughly explored the LMS.

Strategy
────────
1. Identify the main navigation first (sidebar, top nav, tabs).
2. Visit each course page → extract assignments, grades, teacher info.
3. Check calendars and announcement boards.
4. Scroll lists to make sure you see everything.
5. Don't revisit pages you already fully explored.
6. Extract data the moment you see it; don't batch.
7. Be thorough but efficient.  Aim for quality over quantity of steps.
"""


class BrowserAgent:
    """Vision-based browser agent that explores LMS websites.

    Lifecycle::

        agent = BrowserAgent(user_id="abc")
        await agent.start()
        logged_in = await agent.login(url, user, pwd)
        data = await agent.explore()
        await agent.stop()
    """

    # ── Construction ──────────────────────────────────────────────────

    def __init__(self, user_id: str) -> None:
        self.user_id = user_id
        self.settings = get_settings()
        self.client = anthropic.AsyncAnthropic(api_key=self.settings.anthropic_api_key)

        self._pw: Optional[Playwright] = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None

        # Telemetry / state
        self.history: list[dict] = []       # action log
        self.extracted: list[dict] = []     # structured data pulled so far
        self.screenshots: list[bytes] = []  # raw PNGs (last N kept)

        # Safety limits
        self.max_login_steps: int = 8
        self.max_explore_steps: int = 50
        self._max_screenshots_kept: int = 10

    # ── Lifecycle ─────────────────────────────────────────────────────

    async def start(self) -> None:
        """Launch a Chromium browser and open a blank page."""
        self._pw = await async_playwright().start()
        self.browser = await self._pw.chromium.launch(
            headless=self.settings.playwright_headless,
        )
        self.context = await self.browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            java_script_enabled=True,
            ignore_https_errors=True,
        )
        # Block known analytics/tracking domains to speed up page loads.
        await self.context.route(
            "**/{google-analytics,googletagmanager,hotjar,segment,mixpanel}**",
            lambda route: route.abort(),
        )
        self.page = await self.context.new_page()
        logger.info("Browser started for user %s (headless=%s)", self.user_id, self.settings.playwright_headless)

    async def stop(self) -> None:
        """Tear down browser resources gracefully."""
        try:
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
            if self._pw:
                await self._pw.stop()
        except Exception:
            logger.debug("Swallowed error during browser teardown", exc_info=True)
        finally:
            self.context = None
            self.browser = None
            self._pw = None
            self.page = None
        logger.info("Browser stopped for user %s", self.user_id)

    # ── Screenshot ────────────────────────────────────────────────────

    async def screenshot(self) -> str:
        """Take a viewport screenshot and return it as a base64-encoded PNG.

        Keeps the last ``_max_screenshots_kept`` raw PNGs in memory for
        potential debugging / storage.
        """
        if not self.page:
            raise RuntimeError("Browser not started — call start() first")

        raw: bytes = await self.page.screenshot(type="png", full_page=False)
        # Rotate buffer
        self.screenshots.append(raw)
        if len(self.screenshots) > self._max_screenshots_kept:
            self.screenshots.pop(0)

        return base64.b64encode(raw).decode("ascii")

    # ── Claude helpers ────────────────────────────────────────────────

    async def _ask_claude(
        self,
        *,
        system: str,
        screenshot_b64: str,
        user_text: str,
        max_tokens: int = 1024,
    ) -> dict:
        """Send a screenshot + text to Claude and parse the JSON response.

        Returns the parsed dict, or ``{"action": "_parse_error", "raw": ...}``
        if the response is not valid JSON.
        """
        response = await self.client.messages.create(
            model=self.settings.claude_model,
            max_tokens=max_tokens,
            system=system,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": screenshot_b64,
                            },
                        },
                        {"type": "text", "text": user_text},
                    ],
                }
            ],
        )

        raw_text: str = response.content[0].text.strip()

        # Claude sometimes wraps JSON in ```json … ```  — strip that.
        if raw_text.startswith("```"):
            lines = raw_text.split("\n", 1)
            if len(lines) > 1:
                raw_text = lines[1].rsplit("```", 1)[0].strip()
            else:
                raw_text = raw_text.strip("`").strip()

        try:
            return json.loads(raw_text)
        except json.JSONDecodeError:
            logger.warning("Claude returned unparseable response: %.200s", raw_text)
            return {"action": "_parse_error", "raw": raw_text}

    # ── Action executor ───────────────────────────────────────────────

    async def _execute_action(self, action: dict) -> str:
        """Execute a single action dict on ``self.page``.

        Returns a short human-readable result string for logging.
        """
        assert self.page is not None
        act = action.get("action", "")

        if act == "click":
            selector: str = action.get("selector", "")
            try:
                await self.page.click(selector, timeout=5000)
                await self._wait_for_stable()
                return f"clicked '{selector}'"
            except PlaywrightTimeout:
                # Fallback: try clicking by visible text
                try:
                    await self.page.get_by_text(selector, exact=False).first.click(timeout=5000)
                    await self._wait_for_stable()
                    return f"clicked by text '{selector}'"
                except Exception as inner:
                    return f"click failed for '{selector}': {inner}"
            except Exception as e:
                return f"click error: {e}"

        if act == "type":
            selector = action.get("selector", "")
            text = action.get("text", "")
            try:
                await self.page.fill(selector, text, timeout=5000)
                return f"typed into '{selector}'"
            except Exception as e:
                return f"type error: {e}"

        if act == "press":
            key = action.get("key", "Enter")
            try:
                await self.page.keyboard.press(key)
                await self._wait_for_stable()
                return f"pressed {key}"
            except Exception as e:
                return f"press error: {e}"

        if act == "navigate":
            url = action.get("url", "")
            try:
                await self.page.goto(url, wait_until="domcontentloaded", timeout=20000)
                await self._wait_for_stable()
                return f"navigated to {url}"
            except Exception as e:
                return f"navigate error: {e}"

        if act == "scroll":
            direction = action.get("direction", "down")
            amount = int(action.get("amount", 500))
            delta = amount if direction == "down" else -amount
            await self.page.evaluate(f"window.scrollBy(0, {delta})")
            await asyncio.sleep(0.5)
            return f"scrolled {direction} {amount}px"

        if act == "back":
            try:
                await self.page.go_back(wait_until="domcontentloaded", timeout=10000)
                await self._wait_for_stable()
                return "went back"
            except Exception as e:
                return f"back error: {e}"

        if act == "wait":
            seconds = min(float(action.get("seconds", 2)), 10)
            await asyncio.sleep(seconds)
            return f"waited {seconds}s"

        return f"unknown action '{act}'"

    async def _wait_for_stable(self, timeout_ms: int = 8000) -> None:
        """Wait for the page to reach a reasonably stable state."""
        assert self.page is not None
        try:
            await self.page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
        except PlaywrightTimeout:
            pass
        # Extra settle time for JS-heavy SPAs
        await asyncio.sleep(1.0)

    # ── Login flow ────────────────────────────────────────────────────

    async def login(self, lms_url: str, username: str, password: str) -> bool:
        """Navigate to *lms_url* and attempt to log in.

        Uses Claude vision to identify form fields, fill credentials, and
        submit.  Returns ``True`` on success, ``False`` on failure.

        The actual credentials are **never** sent to Claude — the model sees
        ``USERNAME_PLACEHOLDER`` / ``PASSWORD_PLACEHOLDER`` and this method
        swaps them in locally before executing the action.
        """
        if not self.page:
            raise RuntimeError("Browser not started — call start() first")

        # Strip hash fragments and post-login paths — navigate to the base login page
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(lms_url)
        # Remove /dash/# or similar post-login paths
        clean_path = parsed.path
        for suffix in ["/dash/", "/dash", "/dashboard", "/home"]:
            if clean_path.endswith(suffix):
                clean_path = clean_path[: -len(suffix)] or "/"
                break
        clean_url = urlunparse(parsed._replace(path=clean_path, fragment=""))
        logger.info("Navigating to LMS login: %s (original: %s)", clean_url, lms_url)

        try:
            await self.page.goto(clean_url, wait_until="domcontentloaded", timeout=30000)
        except PlaywrightTimeout:
            logger.warning("Initial navigation timed out — continuing anyway")
        await asyncio.sleep(2)
        logger.info("After initial navigation, landed on: %s", self.page.url)

        for step in range(1, self.max_login_steps + 1):
            screenshot_b64 = await self.screenshot()
            action = await self._ask_claude(
                system=_LOGIN_SYSTEM_PROMPT,
                screenshot_b64=screenshot_b64,
                user_text=(
                    f"Step {step}/{self.max_login_steps}. "
                    f"Current URL: {self.page.url}\n"
                    "Username: USERNAME_PLACEHOLDER\n"
                    "Password: PASSWORD_PLACEHOLDER\n"
                    "What should I do next?"
                ),
            )

            logger.info("Login step %d: action=%s, url=%s", step, action.get("action"), self.page.url)
            self.history.append({"phase": "login", "step": step, "url": self.page.url, "action": action})

            act = action.get("action")

            if act == "login_complete":
                logger.info("Login succeeded at step %d", step)
                return True

            if act == "login_failed":
                reason = action.get("reason", "unknown")
                logger.error("Login failed at step %d: %s", step, reason)
                return False

            if act == "_parse_error":
                logger.warning("Login step %d: unparseable response, retrying", step)
                await asyncio.sleep(1)
                continue

            # Swap credential placeholders BEFORE executing
            if act == "type":
                text = action.get("text", "")
                action["text"] = text.replace(
                    "USERNAME_PLACEHOLDER", username
                ).replace(
                    "PASSWORD_PLACEHOLDER", password
                )

            result = await self._execute_action(action)
            logger.debug("Login step %d result: %s", step, result)
            await asyncio.sleep(1)

        logger.error("Login did not complete within %d steps", self.max_login_steps)
        return False

    # ── Exploration loop ──────────────────────────────────────────────

    async def explore(self, goal: str = "Extract all academic information") -> list[dict]:
        """Run the exploration agent loop.

        Returns the list of extracted data dicts.
        """
        if not self.page:
            raise RuntimeError("Browser not started — call start() first")

        logger.info("Starting exploration (goal: %s, max_steps: %d)", goal, self.max_explore_steps)

        consecutive_errors = 0  # circuit-breaker for repeated parse errors

        for step in range(1, self.max_explore_steps + 1):
            screenshot_b64 = await self.screenshot()

            # Build a concise summary of what we've collected so far.
            extracted_types = {}
            for item in self.extracted:
                t = item.get("type", "other")
                extracted_types[t] = extracted_types.get(t, 0) + 1
            extracted_summary = json.dumps(extracted_types) if extracted_types else "nothing yet"

            visited_urls = list(dict.fromkeys(
                h["url"] for h in self.history if h.get("phase") == "explore"
            ))[-15:]  # last 15 unique URLs

            action = await self._ask_claude(
                system=_EXPLORER_SYSTEM_PROMPT,
                screenshot_b64=screenshot_b64,
                user_text=(
                    f"Goal: {goal}\n"
                    f"Current URL: {self.page.url}\n"
                    f"Step: {step}/{self.max_explore_steps}\n"
                    f"Pages visited: {json.dumps(visited_urls)}\n"
                    f"Data extracted so far: {extracted_summary}\n\n"
                    "What should I do next?"
                ),
                max_tokens=2048,
            )

            act = action.get("action")
            logger.info("Explore step %d: %s (url: %s)", step, act, self.page.url)
            self.history.append({"phase": "explore", "step": step, "url": self.page.url, "action": action})

            # ── Handle terminal / meta actions ────────────────────────
            if act == "done":
                summary = action.get("summary", "")
                logger.info(
                    "Exploration complete at step %d (%d items). %s",
                    step, len(self.extracted), summary,
                )
                break

            if act == "_parse_error":
                consecutive_errors += 1
                if consecutive_errors >= 3:
                    logger.error("Too many consecutive parse errors — aborting exploration")
                    break
                await asyncio.sleep(1)
                continue

            consecutive_errors = 0  # reset on any valid action

            if act == "extract":
                data = action.get("data")
                if isinstance(data, dict) and data:
                    self.extracted.append(data)
                    logger.info(
                        "Extracted %s: %s",
                        data.get("type", "unknown"),
                        data.get("title", data.get("course", ""))[:60],
                    )
                else:
                    logger.warning("Step %d: extract action had empty/invalid data", step)
                # No need to interact with the browser — continue to next step
                # without the normal inter-step pause.
                continue

            # ── Execute browser action ────────────────────────────────
            result = await self._execute_action(action)
            logger.debug("Explore step %d result: %s", step, result)

            # Brief pause between browser interactions
            await asyncio.sleep(1.5)

        logger.info(
            "Exploration finished: %d steps, %d items extracted",
            len([h for h in self.history if h.get("phase") == "explore"]),
            len(self.extracted),
        )
        return self.extracted
