# browser.py — Vision-based browser agent that explores LMS websites using
# Playwright screenshots and Claude for decision-making.  The core loop is:
# observe (screenshot) → decide (Claude) → act (Playwright) → repeat.
from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
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

    async def _wait_for_stable(self, sleep_s: float = 0.3) -> None:
        """Wait for the page to reach a reasonably stable state.

        Only waits for domcontentloaded (fast) + a short sleep for SPA rendering.
        networkidle is intentionally omitted — SPAs never go network-idle,
        so it always hits the timeout and wastes ~5s per call.
        """
        assert self.page is not None
        try:
            await self.page.wait_for_load_state("domcontentloaded", timeout=5000)
        except PlaywrightTimeout:
            pass
        await asyncio.sleep(sleep_s)

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
        await asyncio.sleep(1.5)
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
                    text: document.body?.innerText?.substring(0, 6000) || '',
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
        CSS classes. Uses aggressive selectors and multiple fallbacks since
        Teamie is a proprietary SPA with unknown class names.
        """
        assert self.page is not None
        try:
            return await self.page.evaluate("""() => {
                // Teamie feed posts — try many selectors (proprietary SPA)
                const selectors = [
                    '.activity-stream-entry',
                    '.feed-post',
                    '.post-item',
                    '.newsfeed-post',
                    '.wall-post',
                    '.assessment-item',
                    '.todo-item',
                    '[data-post-id]',
                    '[data-activity-id]',
                    '.post-content',
                    '.activity-content',
                    '[class*="post"]',
                    '[class*="activity"]',
                    '[class*="assignment"]',
                    '[class*="assessment"]',
                    '[class*="task"]',
                    '[class*="todo"]',
                    '.stream-item',
                ];
                let posts = [];
                const seenTexts = new Set();

                for (const sel of selectors) {
                    const elements = document.querySelectorAll(sel);
                    if (elements.length > 0) {
                        elements.forEach(el => {
                            const text = el.innerText?.trim() || '';
                            const shortText = text.substring(0, 100);
                            if (text.length > 20 && !seenTexts.has(shortText)) {
                                seenTexts.add(shortText);
                                posts.push({
                                    text: text.substring(0, 800),
                                    html_class: el.className?.substring(0, 100) || '',
                                    tag: el.tagName,
                                });
                            }
                        });
                        // Don't break — collect from ALL matching selectors
                    }
                }

                // Fallback 1: grab large content blocks
                if (posts.length === 0) {
                    const blocks = document.querySelectorAll(
                        'article, .card, [class*="card"], [class*="item"], .content-block'
                    );
                    blocks.forEach(el => {
                        const text = el.innerText?.trim() || '';
                        const shortText = text.substring(0, 100);
                        if (text.length > 30 && text.length < 2000 && !seenTexts.has(shortText)) {
                            seenTexts.add(shortText);
                            posts.push({
                                text: text.substring(0, 800),
                                html_class: el.className?.substring(0, 100) || '',
                                tag: el.tagName,
                            });
                        }
                    });
                }

                // Fallback 2: grab ALL divs with >50 chars that are 3+ levels deep
                if (posts.length === 0) {
                    const allDivs = document.querySelectorAll('div');
                    allDivs.forEach(el => {
                        let depth = 0;
                        let parent = el.parentElement;
                        while (parent && depth < 5) { depth++; parent = parent.parentElement; }
                        if (depth >= 3) {
                            const text = el.innerText?.trim() || '';
                            const shortText = text.substring(0, 100);
                            if (text.length > 50 && text.length < 2000 && !seenTexts.has(shortText)) {
                                seenTexts.add(shortText);
                                posts.push({
                                    text: text.substring(0, 800),
                                    html_class: el.className?.substring(0, 100) || '',
                                    tag: el.tagName,
                                });
                            }
                        }
                    });
                }

                // Fallback 3: split body text by double newlines
                if (posts.length === 0) {
                    const bodyText = document.body?.innerText || '';
                    const chunks = bodyText.split(/\\n\\s*\\n/).filter(c => c.trim().length > 50);
                    chunks.forEach(chunk => {
                        posts.push({
                            text: chunk.trim().substring(0, 800),
                            html_class: '_body_text_chunk',
                            tag: 'BODY',
                        });
                    });
                }

                return posts.slice(0, 50);
            }""")
        except Exception as e:
            logger.warning("get_feed_posts failed: %s", e)
            return []

    # ── Hybrid exploration (deterministic nav + Claude interpretation) ─

    async def explore(self, goal: str = "Extract all academic information") -> list[dict]:
        """Hybrid exploration: deterministic navigation + Claude for content parsing.

        Navigates programmatically (click each classroom, scroll through
        feeds) and uses Claude (text-only, Haiku) to INTERPRET the content.
        Claude extraction calls run in parallel across classrooms.
        """
        if not self.page:
            raise RuntimeError("Browser not started — call start() first")

        import time as _time
        _explore_start = _time.time()
        logger.info("Starting HYBRID exploration (goal: %s)", goal)

        # Brief SPA settle — domcontentloaded already fired, just let JS render
        await asyncio.sleep(1.5)
        logger.info("SPA settle done (%.1fs), URL: %s", _time.time() - _explore_start, self.page.url)

        try:
            # ── Phase 1: Dashboard — extract courses ──────────────────
            _phase1_start = _time.time()
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
                logger.info("Phase 1: Extracted %d courses (%.1fs)", len(courses), _time.time() - _phase1_start)
            else:
                logger.warning("Phase 1: Claude returned non-list for courses: %s (%.1fs)", type(courses), _time.time() - _phase1_start)

            # ── Phase 2: Find classroom links ─────────────────────────
            _phase2_start = _time.time()
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
                "Phase 2: Found %d unique classroom links (%.1fs): %s",
                len(classroom_links), _time.time() - _phase2_start,
                [l.get("text", "?")[:40] for l in classroom_links],
            )

            # ── Phase 3: Visit each classroom, collect text, then parallel Claude ─
            _phase3_start = _time.time()
            classroom_payloads: list[tuple[str, str, str]] = []  # (link_text, course_name, content)

            for i, link in enumerate(classroom_links):
                href = link.get("href", "")
                link_text = link.get("text", f"Classroom {i+1}")
                logger.info(
                    "Phase 3: Visiting classroom %d/%d: %s",
                    i + 1, len(classroom_links), link_text[:50],
                )

                try:
                    await self.page.goto(href, wait_until="domcontentloaded", timeout=15000)
                    await self._wait_for_stable()

                    # 2 scroll rounds with short pauses (was 3 rounds × 1.0s)
                    for _ in range(2):
                        await self.page.evaluate("window.scrollBy(0, 600)")
                        await asyncio.sleep(0.3)

                    posts = await self.get_feed_posts()
                    page_data = await self.get_page_data()
                    page_text = page_data.get("text", "")

                    if posts:
                        content = "\n---POST---\n".join(p.get("text", "") for p in posts[:20])
                    else:
                        content = page_text[:6000]

                    course_name = link_text.split("[")[0].strip()
                    if content.strip():
                        classroom_payloads.append((link_text, course_name, content))

                except Exception as e:
                    logger.warning("Failed to visit classroom '%s': %s", link_text[:30], str(e)[:200])
                    continue

            # ── Parallel Claude extraction for all classrooms ──────────
            if classroom_payloads:
                async def _extract_classroom(lt: str, cn: str, ct: str) -> tuple[str, list]:
                    items = await self._claude_extract_from_text(
                        page_text=ct,
                        instruction=(
                            f"This is content from the classroom '{lt}' on Teamie LMS. "
                            "Extract ALL assignments and graded items visible. "
                            "Return a JSON array of objects. Each object should have:\n"
                            '{"type":"assignment","title":"...","course":"' + cn + '",'
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
                    return (lt, items if isinstance(items, list) else [])

                results = await asyncio.gather(
                    *[_extract_classroom(lt, cn, ct) for lt, cn, ct in classroom_payloads],
                    return_exceptions=True,
                )
                for result in results:
                    if isinstance(result, Exception):
                        logger.warning("Classroom extraction failed: %s", result)
                        continue
                    lt, items = result
                    count = 0
                    for item in items:
                        if isinstance(item, dict) and item.get("title"):
                            self._add_extracted(item)
                            count += 1
                    logger.info("Classroom '%s': extracted %d items", lt[:30], count)

            logger.info("Phase 3 complete: %d classrooms (%.1fs)", len(classroom_links), _time.time() - _phase3_start)

            # ── Phase 4: Check overdue/todos (richest data source) ─────
            _phase4_start = _time.time()
            logger.info("Phase 4: Checking overdue/todos")
            try:
                # Navigate back to dashboard
                dashboard_url = self.page.url.split("#")[0] + "#/"
                await self.page.goto(dashboard_url, wait_until="domcontentloaded", timeout=15000)
                await self._wait_for_stable(sleep_s=1.0)  # dashboard needs a bit more time

                # Try to click "ToDos" or "OVERDUE"
                for text_to_try in ["OVERDUE", "ToDos", "To Do", "Upcoming", "Due", "Pending"]:
                    try:
                        loc = self.page.get_by_text(text_to_try, exact=False).first
                        if await loc.is_visible(timeout=2000):
                            await loc.click(timeout=3000)
                            await self._wait_for_stable(sleep_s=0.5)
                            logger.info("Clicked '%s' for overdue items", text_to_try)

                            # Scroll to load overdue items (3 rounds, short pauses)
                            for scroll_i in range(3):
                                await self.page.evaluate("window.scrollBy(0, 600)")
                                await asyncio.sleep(0.3)

                            # Get all content — use feed posts first, then page text
                            posts = await self.get_feed_posts()
                            page_data = await self.get_page_data()
                            overdue_text = page_data.get("text", "")

                            # Batch extraction — send more content for this critical section
                            content_to_parse = ""
                            if posts:
                                content_to_parse = "\n---ITEM---\n".join(
                                    p.get("text", "") for p in posts[:30]
                                )
                            if not content_to_parse.strip():
                                content_to_parse = overdue_text

                            if content_to_parse.strip():
                                overdue_items = await self._claude_extract_from_text(
                                    page_text=content_to_parse,
                                    instruction=(
                                        "This is the overdue/todo list from Teamie LMS. "
                                        "This is the MOST IMPORTANT data source — extract EVERYTHING. "
                                        "Extract ALL assignments/tasks visible. "
                                        "Return a JSON array of objects, each with:\n"
                                        '{"type":"assignment","title":"...","course":"...",'
                                        '"due_date":"YYYY-MM-DD or null","description":"...",'
                                        '"assignment_type":"task"}\n\n'
                                        "IMPORTANT date parsing rules:\n"
                                        "- 'Mar 15' or 'March 15' → '2026-03-15'\n"
                                        "- '3/15/26' → '2026-03-15'\n"
                                        "- '15 March 2026' → '2026-03-15'\n"
                                        "- 'yesterday' → calculate from today (2026-03-22)\n"
                                        "- '2 days ago' → calculate from today\n"
                                        "- 'Due: Mar 20' → '2026-03-20'\n"
                                        "- Today is 2026-03-22.\n\n"
                                        "Return ONLY the JSON array. If nothing found, return []."
                                    ),
                                )
                                if isinstance(overdue_items, list):
                                    new_count = 0
                                    for item in overdue_items:
                                        if isinstance(item, dict) and item.get("title"):
                                            self._add_extracted(item)
                                            new_count += 1
                                    logger.info("Overdue/todos: extracted %d items (%.1fs)", new_count, _time.time() - _phase4_start)
                            break
                    except Exception:
                        continue
            except Exception as e:
                logger.warning("Phase 4 (overdue check) failed: %s (%.1fs)", str(e)[:200], _time.time() - _phase4_start)

        except Exception as e:
            logger.error("Hybrid exploration failed: %s", str(e)[:300])
            return self.extracted  # return whatever we got before the error

        # Log results
        _total_time = _time.time() - _explore_start
        extracted_types = {}
        for item in self.extracted:
            t = item.get("type", "other")
            extracted_types[t] = extracted_types.get(t, 0) + 1

        logger.info(
            "Hybrid exploration finished: %d items extracted (%s) in %.1fs",
            len(self.extracted),
            json.dumps(extracted_types),
            _total_time,
        )

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

    @staticmethod
    def _clean_page_text(text: str) -> str:
        """Pre-clean raw page text before sending to Claude for extraction.

        Strips navigation noise, repeated whitespace, and common UI chrome.
        """
        # Strip common navigation/UI text
        nav_patterns = [
            r"^(Home|Dashboard|Settings|Profile|Logout|Notifications|"
            r"Sign Out|Sign In|Search|Menu|Navigation|Skip to content|"
            r"Copyright|All rights reserved|Terms|Privacy Policy|"
            r"Loading\.\.\.|Please wait)\s*$",
        ]
        lines = text.split("\n")
        cleaned_lines = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            skip = False
            for pattern in nav_patterns:
                if re.match(pattern, stripped, re.IGNORECASE):
                    skip = True
                    break
            if not skip:
                cleaned_lines.append(stripped)

        result = "\n".join(cleaned_lines)
        # Collapse multiple blank lines
        result = re.sub(r"\n{3,}", "\n\n", result)
        # Collapse repeated whitespace
        result = re.sub(r"[ \t]{3,}", "  ", result)
        return result.strip()

    async def _claude_extract_from_text(
        self,
        *,
        page_text: str,
        instruction: str,
        use_haiku: bool = True,
    ) -> list:
        """Send page text (no screenshot) to Claude and parse the JSON array response.

        Uses Haiku by default for extraction tasks (faster, cheaper).
        Set use_haiku=False for complex interpretation.
        """
        # Pre-clean the text
        cleaned_text = self._clean_page_text(page_text)
        # Truncate to 6000 chars
        cleaned_text = cleaned_text[:6000]

        if not cleaned_text.strip():
            logger.debug("Empty text after cleaning, skipping extraction")
            return []

        # Use Haiku for extraction (10x faster, cheaper), Sonnet for complex tasks
        model = "claude-haiku-4-5-20251001" if use_haiku else self.settings.claude_model

        try:
            response = await self.client.messages.create(
                model=model,
                max_tokens=4096,
                system=(
                    "You are a data extraction assistant. You extract structured data "
                    "from LMS page content. Return ONLY valid JSON — no markdown fences, "
                    "no explanation, no prose. Just the JSON array."
                ),
                messages=[
                    {
                        "role": "user",
                        "content": f"{instruction}\n\n---PAGE CONTENT---\n{cleaned_text}",
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

