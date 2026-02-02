# SchoolPilot — Build the Entire Project

Build a Chrome extension + Python backend called **SchoolPilot**. It scrapes assignments from Teamie LMS and emails me an AI-prioritized daily plan. Build everything in one pass. No placeholders, no TODOs, no stubs. Every file should be complete and production-ready.

## Project Structure

```
SchoolPilot/
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   └── content.js
├── backend/
│   ├── server.py
│   └── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

## Part 1: Chrome Extension (`extension/`)

### manifest.json
Manifest V3. Permissions: `activeTab`, `scripting`. Host permissions: `https://lms.asl.org/*`. Default popup is `popup.html`.

### content.js — DOM Scraper
This is the critical file. It reads the Teamie dashboard at `https://lms.asl.org/dash/#/`.

The page has a todos/events sidebar. Here are the **exact working selectors** from the real page:

```javascript
// Each event block
document.querySelectorAll('.event-wrapper')

// Within each .event-wrapper:
'.event-tile .title span'           // Title text
'.event-tile .meta'                 // Type — first .meta element, first line of textContent
'.sub-meta .text-primary span'      // Due time (e.g. "Due: 8:30 AM")
'.event-tile .meta:last-of-type'    // Course name
'.date-block .date'                 // Date number (e.g. "02")
'.date-block .day'                  // Day name (e.g. "Mon")
```

**Important scraping logic:**
- Not every `.event-wrapper` has its own `.date-block`. Date blocks appear once per day and apply to all events below them until the next date block. So you need to track the "current date" as you iterate and inherit it forward.
- Trim all text. Strip newlines. The `.meta` field has mixed content — split on newlines and take the first non-empty trimmed line as the type.
- If a field is missing, set it to `null`, don't crash.
- Return an array of objects: `{ title, type, due, course, date, day }`
- Wrap everything in an IIFE that returns the result so `chrome.scripting.executeScript` can capture it.

### popup.html — Minimal UI
Clean, minimal design. Dark-ish background (#1a1a2e or similar), accent color, no frameworks. Contains:
- An h1: "SchoolPilot"
- A subtitle: "AI Study Assistant"
- One big button: "Scan & Send" with an icon or emoji
- A status area below the button that shows progress messages
- Width ~320px, padded nicely

### popup.js — Orchestrator
When the button is clicked:
1. Show status: "Scanning Teamie..."
2. Use `chrome.tabs.query` to get the active tab
3. Use `chrome.scripting.executeScript` to inject `content.js` into the active tab
4. Get the results back (array of assignments)
5. If no assignments found, show "No assignments found. Are you on lms.asl.org/dash?"
6. Show status: "Found X assignments. Sending to AI..."
7. POST the assignments as JSON to `http://localhost:5000/process`
8. On success: show "✓ Email sent! Check your inbox."
9. On error: show the error message in red
10. Add a small "last scanned" timestamp below the button

**Handle edge cases:** tab not on Teamie, empty results, network error, backend down. Always show a human-readable status message.

## Part 2: Python Backend (`backend/`)

### requirements.txt
```
flask
flask-cors
anthropic
resend
python-dotenv
```

### server.py
One file. No database. No auth. Loads `.env` from parent directory.

**POST `/process`**
1. Receives JSON: `{ "assignments": [...] }`
2. Validates that assignments is a non-empty list
3. Formats the assignments into a clean text block for Claude
4. Calls Claude API (model: `claude-sonnet-4-20250514`) with this system prompt:

```
You are a sharp, no-BS academic planner for a high school student. You receive their upcoming assignments and create a focused daily action plan.

Rules:
- Today's date context will be provided. Prioritize by urgency (due soonest) and weight (assessments > assignments > tasks).
- Be concise. Use short punchy sentences. No fluff.
- Group by day. Bold the most urgent items.
- If something is due tomorrow morning, flag it as URGENT.
- End with one motivational line that isn't cheesy.
- Format for email readability (short paragraphs, clear headers).
```

   The user message should include today's date/day and the formatted assignment list.

5. Takes Claude's response and sends it as an email via Resend:
   - From: `SchoolPilot <onboarding@resend.dev>` (default Resend sender)
   - To: `EMAIL_TO` from env
   - Subject: `"SchoolPilot — Your Plan for {today's date}"`
   - Body: Claude's response (send as HTML, convert markdown to basic HTML — bold, headers, line breaks — or just send as plain text with `<pre>` wrapping)
6. Return `{ "status": "sent", "assignments_count": N }`

**Error handling:** If Claude API fails, return 502 with error. If Resend fails, return 502 with error. If no assignments in body, return 400. CORS enabled for all origins (dev tool, not public).

Add a simple **GET `/health`** endpoint that returns `{ "status": "ok" }`.

## Part 3: Config Files (project root)

### .env.example
```
ANTHROPIC_API_KEY=
RESEND_API_KEY=
EMAIL_TO=
```

### .gitignore
```
.env
__pycache__/
*.pyc
.DS_Store
node_modules/
data/
```

### README.md
Short, practical README with:
- One-line description
- Quick start steps (install deps, set env vars, load extension, run backend)
- How to use (go to Teamie, click button, check email)
- Troubleshooting section (common issues: not on Teamie page, backend not running, API key missing)

## Quality Standards
- All JS is clean vanilla ES6+. No var, use const/let. Use async/await.
- Python uses type hints. Has proper error handling with try/except.
- Every file has a brief comment at the top saying what it does.
- No console.log spam in production — use it sparingly for real errors only.
- The popup UI should look polished enough that you'd actually want to use it daily.

## Do NOT
- Do not use any JS frameworks or bundlers
- Do not add TypeScript
- Do not add a database
- Do not add user auth
- Do not add any features not described above
- Do not create test files
- Do not split server.py into multiple files

Build it all now. Every file, complete, ready to run.
