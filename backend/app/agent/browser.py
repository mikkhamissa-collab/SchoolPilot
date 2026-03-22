# browser.py — Vision-based browser agent that explores LMS websites using
# Playwright screenshots and Claude for decision-making.  The core loop is:
# observe (screenshot) → decide (Claude) → act (Playwright) → repeat.
from __future__ import annotations

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
You are a browser automation agent exploring Teamie LMS (lms.asl.org)
to extract academic information for a high-school student.

CRITICAL WORKFLOW — follow this exact sequence:
═══════════════════════════════════════════════

PHASE 1 — Dashboard (steps 1-3):
  You start on the dashboard (/dash/#/). You will see "Classes" with
  course tiles and a right sidebar with "ToDos" and "OVERDUE" counts.
  1. Extract each visible course using the "course" schema (name, teacher).
     Extract ALL courses in ONE action with multiple extract calls.
  2. Note the OVERDUE count and any tasks visible in the right sidebar.

PHASE 2 — Explore each classroom (steps 4-40):
  For EACH course (at least 3-4 courses), do this:
  1. CLICK the course name/tile to enter the classroom page.
  2. Inside the classroom, look for tabs or sections:
     - "Newsfeed" / "Timeline" — shows assignments as posts with due dates
     - "Materials" — has files and resources
     - "Assessments" / "Gradebook" — shows grades
     - Look for posts marked as "Task" — these are assignments
  3. SCROLL DOWN in the classroom feed to find assignment posts.
  4. Extract each assignment you see (title, course, due_date, description).
  5. If you see grades or scores, extract them as "grade" type.
  6. Click "Back" or navigate back to dashboard, then enter the next course.

PHASE 3 — Check overdue/calendar (steps 41-50):
  1. Click "ToDos" or "OVERDUE" in the right sidebar to see all tasks.
  2. Extract any remaining assignments from the overdue/upcoming list.
  3. NOW you may return "done".

RULES:
- Extract each item ONLY ONCE. Check "Data extracted so far" before extracting.
- If you already extracted 6+ courses, STOP extracting courses and START
  clicking into classrooms to find assignments.
- ASSIGNMENTS are the priority. Courses alone are not enough.
- Each step should make PROGRESS — don't repeat the same action.
- DO NOT return "done" until you have extracted at least some assignments.

Return **exactly one** JSON action per turn — no markdown, no prose.
Return ONLY the JSON object, nothing else.

Available actions
─────────────────
{"action":"click","selector":"<css_or_text>"}
  Click a link, button, tab, or element. For Teamie, use the visible
  text of the element (e.g. "AP Psychology P5 MM [25-26]").

{"action":"navigate","url":"<full_url>"}
  Go to a specific URL directly.

{"action":"extract","data":{...}}
  Record structured data you can see on screen RIGHT NOW.
  Schemas:
    assignment → {"type":"assignment","title":"…","course":"…",
                  "due_date":"…","description":"…","points":null,
                  "assignment_type":"homework|test|quiz|lab|essay|project",
                  "submitted":false,"graded":false,"score":null}
    grade      → {"type":"grade","course":"…","overall_grade":"…",
                  "overall_percentage":null,"categories":{}}
    course     → {"type":"course","name":"…","teacher":"…",
                  "period":"…","room":null}
    announcement → {"type":"announcement","title":"…","course":"…",
                    "content":"…","date":"…"}
    calendar   → {"type":"calendar","title":"…","date":"…",
                  "course":"…","details":"…"}

{"action":"scroll","direction":"down|up","amount":500}
  Scroll the viewport.

{"action":"back"}
  Navigate back to the previous page.

{"action":"wait","seconds":2}
  Pause for content to load.

{"action":"done","summary":"short summary of what was collected"}
  ONLY after extracting assignments from multiple classrooms.
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
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ],
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
        # Remove webdriver indicator for anti-detection
        await self.context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
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
        logger.debug("Claude raw response (%.300s)", raw_text)

        # Strategy: try multiple approaches to extract JSON from Claude's response
        # 1. Direct parse (clean JSON response)
        try:
            return json.loads(raw_text)
        except json.JSONDecodeError:
            pass

        # 2. Strip markdown code fences
        cleaned = raw_text
        if cleaned.startswith("```"):
            lines = cleaned.split("\n", 1)
            if len(lines) > 1:
                cleaned = lines[1].rsplit("```", 1)[0].strip()
            else:
                cleaned = cleaned.strip("`").strip()
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                pass

        # 3. Extract first JSON object using brace matching
        import re
        json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', raw_text)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        # 4. Try to find JSON with nested braces (deeper)
        brace_start = raw_text.find("{")
        if brace_start >= 0:
            depth = 0
            for i in range(brace_start, len(raw_text)):
                if raw_text[i] == "{":
                    depth += 1
                elif raw_text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(raw_text[brace_start : i + 1])
                        except json.JSONDecodeError:
                            break

        logger.warning("Claude returned unparseable response: %.500s", raw_text)
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
            # Detect if selector looks like CSS or like plain text
            import re
            is_css = bool(re.search(r'[.#\[\]>+~:=]', selector))

            if not is_css and selector.strip():
                # Looks like plain text — try text-based click FIRST
                try:
                    await self.page.get_by_text(selector, exact=False).first.click(timeout=5000)
                    await self._wait_for_stable()
                    return f"clicked by text '{selector}'"
                except Exception:
                    # Fallback to CSS selector
                    try:
                        await self.page.click(selector, timeout=5000)
                        await self._wait_for_stable()
                        return f"clicked as css '{selector}'"
                    except Exception as e2:
                        return f"click failed for '{selector}': {e2}"
            else:
                # CSS selector — try CSS first, text fallback
                try:
                    await self.page.click(selector, timeout=5000)
                    await self._wait_for_stable()
                    return f"clicked '{selector}'"
                except PlaywrightTimeout:
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
        try:
            await self.page.wait_for_load_state("networkidle", timeout=5000)
        except PlaywrightTimeout:
            pass
        # Extra settle time for JS-heavy SPAs
        await asyncio.sleep(2.0)

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

    # ── Cookie injection ─────────────────────────────────────────────

    async def inject_cookies_and_verify(self, cookies: list, dashboard_url: str) -> bool:
        """Inject saved cookies and navigate to dashboard. Returns True if authenticated."""
        if not self.context or not self.page:
            raise RuntimeError("Browser not started")
        logger.info(
            "Injecting %d cookies for user %s, navigating to %s",
            len(cookies), self.user_id, dashboard_url,
        )
        await self.context.add_cookies(cookies)
        await self.page.goto(dashboard_url, wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(3)
        current_url = self.page.url
        logger.info(
            "After cookie injection, landed on: %s (expected dashboard at %s)",
            current_url, dashboard_url,
        )
        # If redirected to login page, cookies are expired
        is_login = "/login" in current_url.lower()
        is_dashboard = "/dash" in current_url.lower() or "classroom" in current_url.lower()
        if is_login or not is_dashboard:
            logger.warning(
                "Cookie verification FAILED: is_login=%s, is_dashboard=%s, url=%s",
                is_login, is_dashboard, current_url,
            )
            return False
        logger.info("Cookie verification PASSED — user is authenticated")
        return True

    # ── DOM extraction helpers ────────────────────────────────────────

    async def get_page_data(self) -> dict:
        """Extract structured page data from the DOM without screenshots.

        Returns a dict with url, title, text, links, headings — everything
        needed for Claude to understand the page without vision.
        """
        assert self.page is not None
        try:
            return await self.page.evaluate("""() => {
                const links = Array.from(document.querySelectorAll('a[href]'))
                    .map(a => ({ text: a.innerText.trim().substring(0, 100), href: a.href }))
                    .filter(l => l.text && l.text.length > 1)
                    .slice(0, 80);
                const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4'))
                    .map(h => h.innerText.trim().substring(0, 150))
                    .filter(h => h.length > 0);
                return {
                    url: location.href,
                    title: document.title,
                    text: document.body?.innerText?.substring(0, 4000) || '',
                    links: links,
                    headings: headings,
                };
            }""")
        except Exception as e:
            logger.warning("get_page_data failed: %s", e)
            return {"url": self.page.url, "title": "", "text": "", "links": [], "headings": []}

    async def get_feed_posts(self) -> list[dict]:
        """Extract Teamie feed posts from the DOM.

        Teamie renders assignments/announcements as feed posts with specific
        CSS classes. This method extracts them deterministically.
        """
        assert self.page is not None
        try:
            return await self.page.evaluate("""() => {
                // Teamie feed posts typically have these selectors
                const selectors = [
                    '.activity-stream-entry',
                    '.feed-post',
                    '.post-item',
                    '[class*="post"]',
                    '[class*="activity"]',
                    '.stream-item',
                ];
                let posts = [];
                for (const sel of selectors) {
                    const elements = document.querySelectorAll(sel);
                    if (elements.length > 0) {
                        elements.forEach(el => {
                            const text = el.innerText?.trim() || '';
                            if (text.length > 20) {
                                posts.push({
                                    text: text.substring(0, 800),
                                    html_class: el.className?.substring(0, 100) || '',
                                    tag: el.tagName,
                                });
                            }
                        });
                        break;  // Use first matching selector
                    }
                }

                // Fallback: grab large content blocks if no feed posts found
                if (posts.length === 0) {
                    const blocks = document.querySelectorAll(
                        'article, .card, [class*="card"], [class*="item"], .content-block'
                    );
                    blocks.forEach(el => {
                        const text = el.innerText?.trim() || '';
                        if (text.length > 30 && text.length < 2000) {
                            posts.push({
                                text: text.substring(0, 800),
                                html_class: el.className?.substring(0, 100) || '',
                                tag: el.tagName,
                            });
                        }
                    });
                }

                return posts.slice(0, 30);
            }""")
        except Exception as e:
            logger.warning("get_feed_posts failed: %s", e)
            return []

    # ── Hybrid exploration (deterministic nav + Claude interpretation) ─

    async def explore(self, goal: str = "Extract all academic information") -> list[dict]:
        """Hybrid exploration: deterministic navigation + Claude for content parsing.

        Instead of relying on Claude vision to decide WHERE to click,
        this method navigates programmatically (click each classroom,
        scroll through feeds) and uses Claude (text-only) to INTERPRET
        the content it finds.

        Falls back to explore_vision_only() if the hybrid approach fails.
        """
        if not self.page:
            raise RuntimeError("Browser not started — call start() first")

        logger.info("Starting HYBRID exploration (goal: %s)", goal)

        # Wait for SPA to fully render
        logger.info("Waiting for SPA to render before exploration...")
        await asyncio.sleep(5)
        try:
            await self.page.wait_for_load_state("networkidle", timeout=8000)
        except (PlaywrightTimeout, Exception):
            pass
        logger.info("SPA wait complete, current URL: %s", self.page.url)

        try:
            # ── Phase 1: Dashboard — extract courses ──────────────────
            logger.info("Phase 1: Extracting courses from dashboard")
            page_data = await self.get_page_data()
            dashboard_text = page_data.get("text", "")
            dashboard_links = page_data.get("links", [])

            # Ask Claude to extract courses from dashboard text
            courses = await self._claude_extract_from_text(
                page_text=dashboard_text,
                instruction=(
                    "Extract ALL courses/classes visible on this Teamie LMS dashboard. "
                    "Return a JSON array of objects, each with: "
                    '{"type":"course","name":"...","teacher":"..."}\n'
                    "Return ONLY the JSON array, nothing else. If no courses found, return []."
                ),
            )
            if isinstance(courses, list):
                for course in courses:
                    if isinstance(course, dict) and course.get("name"):
                        course["type"] = "course"
                        self._add_extracted(course)
                logger.info("Phase 1: Extracted %d courses", len(courses))
            else:
                logger.warning("Phase 1: Claude returned non-list for courses: %s", type(courses))

            # ── Phase 2: Find classroom links ─────────────────────────
            # Look for links that point to classroom pages
            classroom_links = []
            for link in dashboard_links:
                href = link.get("href", "")
                text = link.get("text", "")
                if (
                    "classroom" in href.lower()
                    or "/dash/#/classroom/" in href
                    or (text and any(
                        keyword in text.lower()
                        for keyword in ["ap ", "ib ", "honors", "class", "period"]
                    ))
                ):
                    classroom_links.append(link)

            # If no classroom links found, try to find them by clicking "Classrooms" or "View all"
            if not classroom_links:
                logger.info("No classroom links found in DOM, trying to click 'View all' or 'Classrooms'")
                for text_to_try in ["View all", "Classrooms", "My Classrooms"]:
                    try:
                        loc = self.page.get_by_text(text_to_try, exact=False).first
                        if await loc.is_visible(timeout=2000):
                            await loc.click(timeout=3000)
                            await self._wait_for_stable()
                            page_data = await self.get_page_data()
                            dashboard_links = page_data.get("links", [])
                            for link in dashboard_links:
                                href = link.get("href", "")
                                if "classroom" in href.lower():
                                    classroom_links.append(link)
                            if classroom_links:
                                logger.info("Found %d classroom links after clicking '%s'", len(classroom_links), text_to_try)
                                break
                    except Exception:
                        continue

            # Deduplicate classroom links by href
            seen_hrefs = set()
            unique_classroom_links = []
            for link in classroom_links:
                href = link.get("href", "")
                if href and href not in seen_hrefs:
                    seen_hrefs.add(href)
                    unique_classroom_links.append(link)
            classroom_links = unique_classroom_links[:10]  # Cap at 10 classrooms

            logger.info(
                "Phase 2: Found %d unique classroom links: %s",
                len(classroom_links),
                [l.get("text", "?")[:40] for l in classroom_links],
            )

            # ── Phase 3: Visit each classroom ─────────────────────────
            for i, link in enumerate(classroom_links):
                href = link.get("href", "")
                link_text = link.get("text", f"Classroom {i+1}")
                logger.info(
                    "Phase 3: Entering classroom %d/%d: %s",
                    i + 1, len(classroom_links), link_text[:50],
                )

                try:
                    # Navigate to the classroom
                    await self.page.goto(href, wait_until="domcontentloaded", timeout=15000)
                    await self._wait_for_stable()

                    # Scroll down to load more content (Teamie lazy-loads feed)
                    for scroll_round in range(3):
                        await self.page.evaluate("window.scrollBy(0, 600)")
                        await asyncio.sleep(1.5)

                    # Get feed posts from DOM
                    posts = await self.get_feed_posts()
                    page_data = await self.get_page_data()
                    page_text = page_data.get("text", "")

                    # Use Claude to interpret the feed content
                    if posts:
                        posts_text = "\n---POST---\n".join(p.get("text", "") for p in posts[:15])
                        content_to_parse = posts_text
                    else:
                        content_to_parse = page_text[:5000]

                    if content_to_parse.strip():
                        items = await self._claude_extract_from_text(
                            page_text=content_to_parse,
                            instruction=(
                                f"This is content from the classroom '{link_text}' on Teamie LMS. "
                                "Extract ALL assignments and graded items visible. "
                                "Return a JSON array of objects. Each object should have:\n"
                                '{"type":"assignment","title":"...","course":"' + link_text.split("[")[0].strip() + '",'
                                '"due_date":"YYYY-MM-DD or null","description":"brief description",'
                                '"assignment_type":"homework|test|quiz|lab|essay|project|task",'
                                '"submitted":false,"graded":false,"score":null}\n\n'
                                "Also extract any grades you see as:\n"
                                '{"type":"grade","course":"...","overall_grade":"A/B/C/etc",'
                                '"overall_percentage":null}\n\n'
                                "Return ONLY the JSON array, nothing else. If nothing found, return [].\n"
                                "Look for: due dates, 'Task' labels, 'Assessment', point values, "
                                "submission status, overdue markers."
                            ),
                        )
                        if isinstance(items, list):
                            new_count = 0
                            for item in items:
                                if isinstance(item, dict) and item.get("title"):
                                    self._add_extracted(item)
                                    new_count += 1
                            logger.info(
                                "Classroom '%s': extracted %d items",
                                link_text[:30], new_count,
                            )
                        else:
                            logger.warning(
                                "Claude returned non-list for classroom '%s'",
                                link_text[:30],
                            )

                except Exception as e:
                    logger.warning(
                        "Failed to explore classroom '%s': %s",
                        link_text[:30], str(e)[:200],
                    )
                    continue

            # ── Phase 4: Check overdue/todos ──────────────────────────
            logger.info("Phase 4: Checking overdue/todos")
            try:
                # Navigate back to dashboard
                dashboard_url = self.page.url.split("#")[0] + "#/"
                await self.page.goto(dashboard_url, wait_until="domcontentloaded", timeout=15000)
                await self._wait_for_stable()

                # Try to click "ToDos" or "OVERDUE"
                for text_to_try in ["OVERDUE", "ToDos", "To Do", "Upcoming"]:
                    try:
                        loc = self.page.get_by_text(text_to_try, exact=False).first
                        if await loc.is_visible(timeout=2000):
                            await loc.click(timeout=3000)
                            await self._wait_for_stable()
                            logger.info("Clicked '%s' for overdue items", text_to_try)

                            # Scroll to load content
                            for _ in range(2):
                                await self.page.evaluate("window.scrollBy(0, 500)")
                                await asyncio.sleep(1)

                            page_data = await self.get_page_data()
                            overdue_text = page_data.get("text", "")

                            if overdue_text.strip():
                                overdue_items = await self._claude_extract_from_text(
                                    page_text=overdue_text[:5000],
                                    instruction=(
                                        "This is the overdue/todo list from Teamie LMS. "
                                        "Extract ALL assignments/tasks visible. "
                                        "Return a JSON array of objects, each with:\n"
                                        '{"type":"assignment","title":"...","course":"...",'
                                        '"due_date":"YYYY-MM-DD or null","description":"...",'
                                        '"assignment_type":"task"}\n\n'
                                        "Return ONLY the JSON array. If nothing found, return []."
                                    ),
                                )
                                if isinstance(overdue_items, list):
                                    new_count = 0
                                    for item in overdue_items:
                                        if isinstance(item, dict) and item.get("title"):
                                            self._add_extracted(item)
                                            new_count += 1
                                    logger.info("Overdue/todos: extracted %d items", new_count)
                            break
                    except Exception:
                        continue
            except Exception as e:
                logger.warning("Phase 4 (overdue check) failed: %s", str(e)[:200])

        except Exception as e:
            logger.error(
                "Hybrid exploration failed, falling back to vision-only: %s",
                str(e)[:300],
            )
            # Fall back to vision-only exploration
            return await self.explore_vision_only(goal)

        # Log results
        extracted_types = {}
        for item in self.extracted:
            t = item.get("type", "other")
            extracted_types[t] = extracted_types.get(t, 0) + 1

        logger.info(
            "Hybrid exploration finished: %d items extracted (%s)",
            len(self.extracted),
            json.dumps(extracted_types),
        )

        # If we got very few results, try vision-only as supplement
        assignment_count = sum(1 for item in self.extracted if item.get("type") == "assignment")
        if assignment_count == 0 and len(self.extracted) < 3:
            logger.warning(
                "Hybrid exploration yielded few results (%d items, %d assignments), "
                "supplementing with vision-only",
                len(self.extracted), assignment_count,
            )
            return await self.explore_vision_only(goal)

        return self.extracted

    def _add_extracted(self, data: dict) -> bool:
        """Add an extracted item, deduplicating by (type, title/name, course).

        Returns True if the item was added, False if it was a duplicate.
        """
        item_key = (
            data.get("type", ""),
            (data.get("title") or data.get("name") or "").strip().lower(),
            (data.get("course") or "").strip().lower(),
        )
        for existing in self.extracted:
            existing_key = (
                existing.get("type", ""),
                (existing.get("title") or existing.get("name") or "").strip().lower(),
                (existing.get("course") or "").strip().lower(),
            )
            if item_key == existing_key:
                logger.debug(
                    "Skipping duplicate %s: %s",
                    data.get("type", "?"),
                    (data.get("title") or data.get("name") or "?")[:60],
                )
                return False
        self.extracted.append(data)
        logger.info(
            "Extracted %s: %s",
            data.get("type", "?"),
            (data.get("title") or data.get("name") or "?")[:60],
        )
        return True

    async def _claude_extract_from_text(
        self,
        *,
        page_text: str,
        instruction: str,
    ) -> list:
        """Send page text (no screenshot) to Claude and parse the JSON array response."""
        try:
            response = await self.client.messages.create(
                model=self.settings.claude_model,
                max_tokens=4096,
                system=(
                    "You are a data extraction assistant. You extract structured data "
                    "from LMS page content. Return ONLY valid JSON — no markdown fences, "
                    "no explanation, no prose. Just the JSON array."
                ),
                messages=[
                    {
                        "role": "user",
                        "content": f"{instruction}\n\n---PAGE CONTENT---\n{page_text}",
                    }
                ],
            )
            raw = response.content[0].text.strip()
            logger.debug("Claude extract response (%.300s)", raw)

            # Try to parse as JSON array
            # Strategy 1: direct parse
            try:
                result = json.loads(raw)
                if isinstance(result, list):
                    return result
                if isinstance(result, dict):
                    return [result]
            except json.JSONDecodeError:
                pass

            # Strategy 2: strip markdown fences
            cleaned = raw
            if cleaned.startswith("```"):
                lines = cleaned.split("\n", 1)
                if len(lines) > 1:
                    cleaned = lines[1].rsplit("```", 1)[0].strip()
                try:
                    result = json.loads(cleaned)
                    return result if isinstance(result, list) else [result]
                except json.JSONDecodeError:
                    pass

            # Strategy 3: find array brackets
            bracket_start = raw.find("[")
            if bracket_start >= 0:
                depth = 0
                for i in range(bracket_start, len(raw)):
                    if raw[i] == "[":
                        depth += 1
                    elif raw[i] == "]":
                        depth -= 1
                        if depth == 0:
                            try:
                                result = json.loads(raw[bracket_start:i + 1])
                                return result if isinstance(result, list) else [result]
                            except json.JSONDecodeError:
                                break

            logger.warning("Could not parse Claude extract response as JSON array")
            return []

        except Exception as e:
            logger.error("Claude extraction failed: %s", str(e)[:200])
            return []

    # ── Vision-only exploration (fallback) ─────────────────────────────

    async def explore_vision_only(self, goal: str = "Extract all academic information") -> list[dict]:
        """Run the vision-only exploration agent loop (original approach).

        Uses screenshots + Claude vision to navigate and extract.
        This is the fallback if the hybrid approach fails.

        Returns the list of extracted data dicts.
        """
        if not self.page:
            raise RuntimeError("Browser not started — call start() first")

        logger.info("Starting VISION-ONLY exploration (goal: %s, max_steps: %d)", goal, self.max_explore_steps)

        # Wait for SPA to fully render before starting exploration
        logger.info("Waiting for SPA to render before exploration...")
        await asyncio.sleep(5)
        try:
            await self.page.wait_for_load_state("networkidle", timeout=8000)
        except (PlaywrightTimeout, Exception):
            pass
        logger.info("SPA wait complete, current URL: %s", self.page.url)

        consecutive_errors = 0  # circuit-breaker for repeated parse errors

        for step in range(1, self.max_explore_steps + 1):
            screenshot_b64 = await self.screenshot()

            # Also get page text for better extraction
            page_text = ""
            try:
                page_text = await self.page.evaluate(
                    "document.body?.innerText?.substring(0, 2000) || ''"
                )
            except Exception:
                pass

            # Build a detailed summary of what we've collected so far.
            extracted_types = {}
            for item in self.extracted:
                t = item.get("type", "other")
                extracted_types[t] = extracted_types.get(t, 0) + 1
            extracted_summary = json.dumps(extracted_types) if extracted_types else "nothing yet"

            # Build list of already-extracted titles to prevent re-extraction
            already_extracted = []
            seen_titles = set()
            for item in self.extracted:
                title = item.get("title") or item.get("name") or ""
                if title and title not in seen_titles:
                    seen_titles.add(title)
                    already_extracted.append(f"- [{item.get('type')}] {title}")
            already_str = "\n".join(already_extracted[-20:]) if already_extracted else "none"

            visited_urls = list(dict.fromkeys(
                h["url"] for h in self.history if h.get("phase") == "explore"
            ))[-15:]  # last 15 unique URLs

            # Build nudge text based on extraction progress
            nudge = ""
            assignment_count = sum(1 for item in self.extracted if item.get("type") == "assignment")
            course_count = sum(1 for item in self.extracted if item.get("type") == "course")

            if len(self.extracted) == 0 and step > 1:
                nudge = (
                    "\n\nIMPORTANT: You haven't extracted any data yet! "
                    "Look at the page and extract the course names you see. "
                    "Then click into a classroom to find assignments."
                )
            elif course_count > 0 and assignment_count == 0:
                nudge = (
                    f"\n\nYou have {course_count} courses but 0 assignments. "
                    "STOP extracting courses. Click INTO a classroom name to "
                    "enter it, then look for assignment posts (marked as 'Task'), "
                    "scroll down in the feed, and extract each assignment. "
                    "In Teamie, assignments appear as posts in the classroom feed "
                    "with due dates. Look for text like 'Task', 'Due', dates, "
                    "or teacher instructions."
                )

            action = await self._ask_claude(
                system=_EXPLORER_SYSTEM_PROMPT,
                screenshot_b64=screenshot_b64,
                user_text=(
                    f"Goal: {goal}\n"
                    f"Current URL: {self.page.url}\n"
                    f"Step: {step}/{self.max_explore_steps}\n"
                    f"Pages visited: {json.dumps(visited_urls)}\n"
                    f"Data extracted so far: {extracted_summary}\n"
                    f"Already extracted items (DO NOT re-extract these):\n{already_str}\n\n"
                    f"Page text content:\n{page_text[:1500]}\n\n"
                    "What should I do next?"
                    f"{nudge}"
                ),
                max_tokens=2048,
            )

            act = action.get("action")
            logger.info(
                "Explore step %d: action=%s, full_action=%s, url=%s",
                step, act, json.dumps(action)[:500], self.page.url,
            )
            self.history.append({"phase": "explore", "step": step, "url": self.page.url, "action": action})

            # ── Handle terminal / meta actions ────────────────────────
            if act == "done":
                # Guard: don't accept "done" if we haven't done real work
                has_assignments = any(
                    item.get("type") == "assignment" for item in self.extracted
                )
                should_override = (
                    (step < 10 and len(self.extracted) == 0)
                    or (step < 40 and not has_assignments and len(self.extracted) > 0)
                )
                if should_override:
                    logger.warning(
                        "Claude returned 'done' at step %d (items=%d, assignments=%s) — "
                        "overriding to continue",
                        step, len(self.extracted), has_assignments,
                    )
                    # Proactively try to click into a classroom
                    assert self.page is not None
                    clicked = False
                    for text_to_try in [
                        "AP Psychology",
                        "AP Statistics",
                        "Calculus",
                        "Literature",
                        "Global Issues",
                        "Journalism",
                        "View all",
                        "Classrooms",
                        "ToDos",
                        "OVERDUE",
                    ]:
                        try:
                            loc = self.page.get_by_text(text_to_try, exact=False).first
                            if await loc.is_visible(timeout=1000):
                                await loc.click(timeout=3000)
                                await self._wait_for_stable()
                                logger.info("Override: clicked '%s'", text_to_try)
                                clicked = True
                                break
                        except Exception:
                            continue
                    if not clicked:
                        await self.page.evaluate("window.scrollBy(0, 400)")
                        await asyncio.sleep(2)
                        logger.info("Override: scrolled down to reveal content")
                    consecutive_errors = 0
                    continue

                summary = action.get("summary", "")
                logger.info(
                    "Exploration complete at step %d (%d items). %s",
                    step, len(self.extracted), summary,
                )
                break

            if act == "_parse_error":
                consecutive_errors += 1
                logger.warning(
                    "Parse error %d/5 at step %d. Raw: %.300s",
                    consecutive_errors, step, action.get("raw", ""),
                )
                if consecutive_errors >= 5:
                    logger.error("Too many consecutive parse errors — aborting exploration")
                    break
                await asyncio.sleep(1)
                continue

            consecutive_errors = 0  # reset on any valid action

            if act == "extract":
                data = action.get("data")
                if isinstance(data, dict) and data:
                    self._add_extracted(data)
                else:
                    logger.warning("Step %d: extract action had empty/invalid data", step)
                # No need to interact with the browser — continue to next step
                # without the normal inter-step pause.
                continue

            # ── Execute browser action ────────────────────────────────
            result = await self._execute_action(action)
            logger.debug("Explore step %d result: %s", step, result)

            # Brief pause between browser interactions (longer for SPAs)
            await asyncio.sleep(2.5)

        logger.info(
            "Vision-only exploration finished: %d steps, %d items extracted",
            len([h for h in self.history if h.get("phase") == "explore"]),
            len(self.extracted),
        )
        return self.extracted
