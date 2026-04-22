# SchoolPilot Extension

Chrome Manifest V3 extension that captures Teamie session cookies + scrapes live course/assignment/grade data from the student's authenticated browser, then posts everything to the SchoolPilot backend.

Why an extension: server-side Playwright trips Google bot-detection. The extension runs in the student's real browser where the session is trusted.

## Sideload

1. Regenerate icons if missing:
   ```sh
   node scripts/make-icons.mjs
   ```
   This writes `icons/16.png`, `icons/48.png`, `icons/128.png`. No npm deps needed.

2. Open Chrome → `chrome://extensions`.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** → select `/Users/mikstartups/Desktop/SchoolPilot/extension/`.
5. You should see "SchoolPilot" 0.1.0 load with zero errors.

### Finding the extension ID

On `chrome://extensions`, each extension card shows its ID (a 32-char lowercase hex string). Copy it — `schoolpilot.co` will need it in a later step to send `SET_JWT` via `chrome.runtime.sendMessage(EXTENSION_ID, ...)`.

## Debugging

### Service worker logs

`chrome://extensions` → find SchoolPilot → click **Inspect views: service worker**. All `[SchoolPilot]` logs from `background.js` appear there.

### Content script logs

Open DevTools on any `lms.asl.org` or `*.teamie.com` tab. Look for `[SchoolPilot]` entries in the page console.

### Popup logs

Right-click the extension icon → **Inspect popup** for the popup's DevTools.

### Clear stored state

From the service worker console:
```js
chrome.storage.local.clear()
```
Re-open the popup — it'll show "Not connected" and "Never synced".

### Override backend URL (for local dev)

From the service worker console:
```js
chrome.storage.local.set({ backendUrl: "http://localhost:8000" })
```
The popup and all POSTs will use it until cleared.

## Testing from schoolpilot.co

Open the site in Chrome, open DevTools on any schoolpilot.co page, run:
```js
chrome.runtime.sendMessage("YOUR_EXTENSION_ID", { type: "PING" }, console.log)
```
Expect `{ ok: true, version: "0.1.0" }`.

To authenticate the extension:
```js
chrome.runtime.sendMessage(
  "YOUR_EXTENSION_ID",
  { type: "SET_JWT", jwt: supabaseAccessToken, userId: supabaseUserId },
  console.log
)
```
Expect `{ ok: true }`. The SchoolPilot web app will do this automatically once CC-PROMPT-3 ships.

## What the scrapers do

- **courses** — tries `/api/v2/courses/my`, `/api/courses/mine`, `/api/v1/courses?enrolled=true`; falls back to DOM (course cards on the dashboard).
- **assignments** — `/api/v2/assignments/upcoming`, falls back to DOM cards/rows.
- **grades** — `/api/v2/gradebook/summary`, falls back to gradebook table rows.
- **announcements** — `/api/v2/announcements`, falls back to stream-post nodes.
- **calendar** — `/api/v2/calendar/events`, falls back to `.fc-event` / `[data-event-id]` nodes.
- **attachments** — fetches every assignment attachment URL with `credentials: "include"`, base64-encodes files under 10 MB, 50 MB budget per scrape.

Every attempt logs to `[SchoolPilot]` so you can see what worked and what didn't.

**No mock data.** If a scraper finds nothing, the scrape returns `{ ok: false, error }` for that source — no invented fields.

## Scrape / cookie timing

- Content script auto-runs 2.5s after a Teamie page finishes loading.
- Popup "Sync now" triggers the scrape manually (requires a Teamie tab open).
- Cookies are captured on every Teamie tab completion and on a 6-hour alarm, debounced to at most once per 15 min unless cookies changed.

## Backend endpoints (POST)

- `POST /api/auth/lms-cookies` — `{ lms_type, lms_url, cookies }`
- `POST /api/sync/ingest` — `{ courses, assignments, grades, announcements, calendar, attachments }`

Both require `Authorization: Bearer <supabase_jwt>`. These do not exist yet (CC-PROMPT-2 builds them). Current behaviour: 404 is logged and surfaced in the popup as "Backend not ready yet", no crash.

## Chrome storage schema

| Key | Type | Purpose |
|---|---|---|
| `jwt` | string | Supabase access token from schoolpilot.co |
| `userId` | string | Supabase `auth.uid()` |
| `backendUrl` | string? | Dev override (default: Render prod URL) |
| `lastCookieHash` | string | SHA-256 of sorted cookies (debounce) |
| `lastCookiePostAt` | number | epoch ms of last cookie POST |
| `lastSyncAt` | number | epoch ms of last scrape completion |
| `lastSyncResult` | object | `{ ok, summary?, error? }` |
