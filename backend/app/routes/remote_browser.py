# remote_browser.py — WebSocket endpoint for interactive remote browser sessions.
# Students drive a real Playwright browser to log into their LMS (e.g. Google SSO),
# and we capture the session cookies for later replay.

from __future__ import annotations

import asyncio
import base64
import json
import logging
import uuid
from typing import Dict, Optional

from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.auth import get_current_user
from app.config import get_settings
from app.db import get_db

from playwright.async_api import (
    async_playwright,
    Browser,
    BrowserContext,
    Page,
    Playwright,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory session store: session_id -> {"user_id": str, "created_at": float}
_sessions: Dict[str, dict] = {}

# Max session lifetime in seconds
_SESSION_TIMEOUT = 180


class StartSessionResponse(BaseModel):
    session_id: str


@router.post("/remote-browser/start")
async def start_remote_browser(user_id: str = Depends(get_current_user)):
    """Create a new remote browser session. Returns a session_id for WebSocket connection."""
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "user_id": user_id,
        "created_at": asyncio.get_event_loop().time(),
    }
    # Clean up old sessions
    now = asyncio.get_event_loop().time()
    expired = [sid for sid, s in _sessions.items() if now - s["created_at"] > _SESSION_TIMEOUT * 2]
    for sid in expired:
        del _sessions[sid]

    return StartSessionResponse(session_id=session_id)


# Allowed URL domains for top-level navigation (document requests).
# Sub-resources (JS, CSS, images, fonts, XHR) are always allowed so pages
# render correctly — only full-page navigations are restricted.
_ALLOWED_NAV_DOMAINS = {
    "asl.org",
    "lms.asl.org",
    "teamie.com",
    "asl.teamie.com",
    "login.teamie.com",
    "google.com",
    "accounts.google.com",
    "googleapis.com",
    "gstatic.com",
    "googleusercontent.com",
}


def _is_nav_allowed(url: str) -> bool:
    """Check if a navigation URL targets an allowed domain."""
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").lower()
        for allowed in _ALLOWED_NAV_DOMAINS:
            if hostname == allowed or hostname.endswith("." + allowed):
                return True
        return False
    except Exception:
        return False


@router.websocket("/remote-browser/ws/{session_id}")
async def remote_browser_ws(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for driving a remote Playwright browser.

    Protocol:
    - Client sends: {"type": "click", "x": int, "y": int}
    - Client sends: {"type": "type", "text": str}
    - Client sends: {"type": "key", "key": str}
    - Client sends: {"type": "scroll", "direction": "down"|"up", "amount": int}
    - Client sends: {"type": "done"} — capture cookies and save
    - Server sends: {"type": "screenshot", "data": base64_jpeg, "url": str}
    - Server sends: {"type": "status", "message": str}
    - Server sends: {"type": "done", "success": bool}
    - Server sends: {"type": "error", "message": str}

    Security: Requires valid JWT token as ?token= query param.
    Navigation restricted to allowed domains only.
    """
    # Validate session
    session = _sessions.get(session_id)
    if not session:
        await websocket.close(code=4001, reason="Invalid or expired session")
        return

    # Validate JWT token from query param
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4003, reason="Missing authentication token")
        return

    try:
        from app.auth import verify_jwt
        jwt_user_id = await verify_jwt(token)
        if jwt_user_id != session["user_id"]:
            await websocket.close(code=4003, reason="Token does not match session")
            return
    except Exception:
        await websocket.close(code=4003, reason="Invalid authentication token")
        return

    user_id = session["user_id"]
    await websocket.accept()

    pw: Optional[Playwright] = None
    browser: Optional[Browser] = None
    context: Optional[BrowserContext] = None
    page: Optional[Page] = None

    async def send_json(data: dict):
        try:
            await websocket.send_json(data)
        except Exception:
            logger.debug("WebSocket send failed (client may have disconnected)")

    async def send_screenshot():
        if not page:
            return
        try:
            raw = await page.screenshot(type="jpeg", quality=50, full_page=False)
            b64 = base64.b64encode(raw).decode("ascii")
            await send_json({
                "type": "screenshot",
                "data": b64,
                "url": page.url,
            })
        except Exception as e:
            logger.debug("Screenshot failed: %s", e)

    try:
        await send_json({"type": "status", "message": "Starting secure browser..."})

        # Launch Playwright with anti-detection settings
        pw = await async_playwright().start()
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-software-rasterizer",
            ],
        )
        context = await browser.new_context(
            viewport={"width": 1024, "height": 768},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            java_script_enabled=True,
            ignore_https_errors=True,
        )

        # Remove webdriver indicator
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """)

        page = await context.new_page()

        # Only block top-level navigations to non-allowed domains.
        # Sub-resources (JS, CSS, images, fonts, XHR) must pass through
        # so pages render and function correctly.
        async def _handle_route(route):
            if route.request.resource_type in ("document", "subdocument"):
                url = route.request.url
                logger.info("[DEBUG-NAV] Navigation request: %s (allowed=%s)", url[:200], _is_nav_allowed(url))
                if not _is_nav_allowed(url):
                    logger.warning("[DEBUG-NAV] BLOCKED navigation to: %s", url[:200])
                    await send_json({"type": "status", "message": f"[DEBUG] Blocked nav to: {url[:120]}"})
                    await route.abort("blockedbyclient")
                    return
            await route.continue_()

        await context.route("**/*", _handle_route)

        # Get the user's LMS URL from credentials, or default to lms.asl.org
        db = get_db()
        creds = (
            db.table("lms_credentials")
            .select("lms_url")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        lms_url = "https://lms.asl.org"
        if creds.data and creds.data[0].get("lms_url"):
            lms_url = creds.data[0]["lms_url"]
        # Clean URL
        lms_url = lms_url.split("#")[0].rstrip("/")
        for suffix in ["/dash", "/dashboard", "/home"]:
            if lms_url.endswith(suffix):
                lms_url = lms_url[:-len(suffix)]
                break

        await send_json({"type": "status", "message": f"Navigating to {lms_url}..."})

        try:
            await page.goto(lms_url, wait_until="domcontentloaded", timeout=30000)
        except Exception:
            logger.warning("Initial navigation timed out — continuing")
        await asyncio.sleep(2)
        await send_screenshot()

        await send_json({"type": "status", "message": "Connected — log into your LMS below"})

        # Handle SSO popups: Google OAuth may open a new window.
        # When that happens, switch our active page to the popup so
        # screenshots and interactions target the login form.
        original_page = page

        async def _on_popup(popup_page: Page):
            nonlocal page
            logger.info("[DEBUG-POPUP] New page/popup detected! url=%s page_id=%s", popup_page.url[:200], id(popup_page))
            try:
                await popup_page.wait_for_load_state("domcontentloaded", timeout=10000)
                logger.info("[DEBUG-POPUP] Popup loaded: %s", popup_page.url[:200])
            except Exception as e:
                logger.warning("[DEBUG-POPUP] Popup load timed out: %s — url=%s", e, popup_page.url[:200])
            page = popup_page
            await send_json({"type": "status", "message": "Google login opened — continue below"})
            await send_screenshot()

            # When the popup closes (after SSO completes), switch back
            def _on_popup_close():
                nonlocal page
                page = original_page
                logger.info("[DEBUG-POPUP] Popup closed — switched back to main page (id=%s)", id(original_page))

            popup_page.on("close", _on_popup_close)

        context.on("page", _on_popup)
        logger.info("[DEBUG-POPUP] Popup handler registered on context")

        # Heartbeat task: send screenshots every 2 seconds
        heartbeat_active = True

        async def heartbeat():
            while heartbeat_active:
                await asyncio.sleep(1.5)
                if heartbeat_active and page:
                    await send_screenshot()

        heartbeat_task = asyncio.create_task(heartbeat())

        # Inactivity timeout
        last_activity = asyncio.get_event_loop().time()

        # Message loop
        while True:
            now = asyncio.get_event_loop().time()
            if now - last_activity > _SESSION_TIMEOUT:
                await send_json({"type": "error", "message": "Session timed out due to inactivity"})
                break

            try:
                raw_msg = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            except asyncio.TimeoutError:
                continue
            except WebSocketDisconnect:
                break

            last_activity = asyncio.get_event_loop().time()

            try:
                msg = json.loads(raw_msg)
            except json.JSONDecodeError:
                await send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = msg.get("type", "")

            if msg_type == "click":
                x = int(msg.get("x", 0))
                y = int(msg.get("y", 0))
                logger.info(
                    "[DEBUG-CLICK] user=%s coords=(%d,%d) page_url=%s page_id=%s",
                    user_id, x, y, page.url[:120], id(page),
                )
                try:
                    # Log what element is at these coordinates before clicking
                    elem_info = await page.evaluate(
                        """([x, y]) => {
                            const el = document.elementFromPoint(x, y);
                            if (!el) return 'NO_ELEMENT';
                            return `<${el.tagName.toLowerCase()}` +
                                (el.id ? ` id="${el.id}"` : '') +
                                (el.className ? ` class="${String(el.className).slice(0,60)}"` : '') +
                                (el.textContent ? ` text="${el.textContent.trim().slice(0,40)}"` : '') +
                                `>`;
                        }""",
                        [x, y],
                    )
                    logger.info("[DEBUG-CLICK] element_at_point: %s", elem_info)
                    await send_json({"type": "status", "message": f"[DEBUG] Clicked: {elem_info}"})
                except Exception as e:
                    logger.info("[DEBUG-CLICK] elementFromPoint failed: %s", e)
                try:
                    await page.mouse.click(x, y)
                    logger.info("[DEBUG-CLICK] mouse.click completed, new url=%s", page.url[:120])
                    await asyncio.sleep(0.8)
                    await send_screenshot()
                except Exception as e:
                    logger.warning("[DEBUG-CLICK] mouse.click FAILED: %s", e)
                    await send_screenshot()

            elif msg_type == "type":
                text = msg.get("text", "")
                try:
                    await page.keyboard.type(text, delay=50)
                    await asyncio.sleep(0.5)
                    await send_screenshot()
                except Exception as e:
                    logger.warning("Type failed: %s", e)

            elif msg_type == "key":
                key = msg.get("key", "Enter")
                try:
                    await page.keyboard.press(key)
                    await asyncio.sleep(1.0)
                    await send_screenshot()
                except Exception as e:
                    logger.warning("Key press failed: %s", e)

            elif msg_type == "scroll":
                direction = msg.get("direction", "down")
                amount = int(msg.get("amount", 300))
                delta = amount if direction == "down" else -amount
                try:
                    await page.evaluate(f"window.scrollBy(0, {delta})")
                    await asyncio.sleep(0.5)
                    await send_screenshot()
                except Exception as e:
                    logger.warning("Scroll failed: %s", e)

            elif msg_type == "done":
                # Student confirms they're logged in — capture cookies
                await send_json({"type": "status", "message": "Saving your session..."})
                heartbeat_active = False

                try:
                    cookies = await context.cookies()
                    if not cookies:
                        await send_json({"type": "error", "message": "No cookies found. Make sure you're logged in."})
                        heartbeat_active = True
                        continue

                    # Encrypt cookies
                    settings = get_settings()
                    fernet = Fernet(settings.credential_encryption_key.encode("utf-8"))
                    encrypted_cookies = fernet.encrypt(
                        json.dumps(cookies).encode("utf-8")
                    ).decode("utf-8")

                    # Get current page origin as lms_url
                    current_url = page.url
                    from urllib.parse import urlparse
                    parsed = urlparse(current_url)
                    origin = f"{parsed.scheme}://{parsed.netloc}"

                    # Upsert into lms_credentials
                    db = get_db()
                    db.table("lms_credentials").upsert(
                        {
                            "user_id": user_id,
                            "lms_type": "teamie",
                            "lms_url": origin,
                            "encrypted_cookies": encrypted_cookies,
                            "last_login_success": True,
                            "last_login_at": _utcnow(),
                            "sync_enabled": True,
                        },
                        on_conflict="user_id,lms_type",
                    ).execute()

                    await send_json({"type": "done", "success": True})
                    logger.info("Remote browser session saved cookies for user %s", user_id)

                except Exception as e:
                    logger.exception("Failed to save cookies for user %s", user_id)
                    await send_json({"type": "error", "message": f"Failed to save session: {str(e)}"})
                    heartbeat_active = True
                    continue

                break  # Session complete

            else:
                await send_json({"type": "error", "message": f"Unknown message type: {msg_type}"})

    except WebSocketDisconnect:
        logger.info("Remote browser WebSocket disconnected for user %s", user_id)
    except Exception as e:
        logger.exception("Remote browser session error for user %s", user_id)
        await send_json({"type": "error", "message": str(e)})
    finally:
        # Cleanup
        heartbeat_active = False
        try:
            heartbeat_task.cancel()  # type: ignore[possibly-undefined]
            await heartbeat_task  # type: ignore[possibly-undefined]
        except (asyncio.CancelledError, NameError, Exception):
            pass
        try:
            if context:
                await context.close()
            if browser:
                await browser.close()
            if pw:
                await pw.stop()
        except Exception:
            logger.debug("Swallowed error during remote browser teardown", exc_info=True)
        # Remove session
        _sessions.pop(session_id, None)
        logger.info("Remote browser session cleaned up for user %s", user_id)


def _utcnow() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
