# SchoolPilot

AI-powered study assistant Chrome extension for ASL students. Scrapes assignments from Teamie LMS and provides daily plans, work chunking, grade tracking, study guides, and sprint planning — all powered by Claude.

## Features

| Tab | What it does |
|-----|-------------|
| **Plan** | Scans your Teamie dashboard, generates an AI-prioritized daily plan, and emails it to you |
| **Focus** | Breaks any assignment into 15-45 min actionable chunks with clear "done when" criteria |
| **Grades** | Tracks grades by weighted category, calculates "what do I need?" and "what if?" scenarios |
| **Study** | Generates a study guide for any course/unit with key concepts, high-likelihood topics, and practice questions |
| **Sprint** | Creates a 7-day study sprint with spaced repetition for upcoming tests |

## Quick Start (Local Development)

### 1. Clone and configure

```bash
git clone <repo-url> && cd SchoolPilot
cp .env.example .env
```

Fill in `.env`:
- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
- `RESEND_API_KEY` — from [resend.com](https://resend.com)
- `EMAIL_TO` — your email address
- `CLAUDE_MODEL` — (optional) defaults to `claude-sonnet-4-20250514`

### 2. Start the backend

```bash
cd backend
pip install -r requirements.txt
FLASK_DEBUG=true python server.py
```

The server runs at `http://localhost:5000`. Verify with:

```bash
curl http://localhost:5000/health
```

### 3. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` folder
4. Click the SchoolPilot icon — set your email and backend URL in Settings (gear icon)

### 4. Use it

1. Go to [lms.asl.org/dash](https://lms.asl.org/dash/#/) and log in
2. Click the SchoolPilot extension icon
3. **Plan tab**: Hit "Scan & Send" to get your daily plan emailed
4. **Focus tab**: Enter any assignment to break it into chunks
5. **Grades tab**: Add courses with weighted categories, log grades, run projections
6. **Study tab**: Pick a course and generate a study guide
7. **Sprint tab**: Set up a 7-day study sprint for an upcoming test

## Deploy to Render

### 1. Push to GitHub

```bash
git init && git add -A && git commit -m "Initial commit"
gh repo create SchoolPilot --public --source=. --push
```

### 2. Create Render Web Service

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repo (`SchoolPilot`)
3. Render auto-detects the `render.yaml` — accept the defaults
4. If configuring manually:
   - **Root directory:** `backend`
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `gunicorn server:app --bind 0.0.0.0:$PORT --timeout 120 --workers 2`

### 3. Set environment variables on Render

In the Render dashboard → your service → **Environment**:

| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `RESEND_API_KEY` | Your Resend API key |
| `EMAIL_TO` | Your email address |

### 4. Verify deployment

```bash
curl https://your-app.onrender.com/health
# → {"status": "ok"}
```

### 5. Update the extension

Open SchoolPilot → Settings (gear icon) → **Backend URL** → paste your Render URL (e.g. `https://schoolpilot-abc123.onrender.com`) → Save.

> **Note:** Render free tier spins down after 15 min of inactivity. First request after idle takes ~30s. Upgrade to a paid plan for always-on.

## Set Up Resend Email Domain

By default, emails send from `pilot@schoolpilot.co`. To avoid spam folders, verify your domain:

1. Go to [resend.com/domains](https://resend.com/domains) → **Add Domain** → enter `schoolpilot.co`
2. Resend shows 3 DNS records to add:

| Type | Name | Value |
|------|------|-------|
| **TXT** (SPF) | `schoolpilot.co` | `v=spf1 include:_spf.resend.com ~all` |
| **CNAME** (DKIM) | `resend._domainkey.schoolpilot.co` | *(provided by Resend)* |
| **TXT** (DMARC) | `_dmarc.schoolpilot.co` | `v=DMARC1; p=none;` |

3. Add these records in your domain registrar (Cloudflare, Namecheap, GoDaddy, etc.)
4. Back in Resend, click **Verify** — DNS propagation can take up to 48 hours
5. Once verified, emails from `pilot@schoolpilot.co` will land in inbox instead of spam

## Development

### Run tests

```bash
cd backend
pytest test_grades.py -v
```

### Project structure

```
SchoolPilot/
├── extension/
│   ├── manifest.json      # Chrome extension manifest v3
│   ├── popup.html         # Extension popup UI
│   ├── popup.js           # UI logic, API calls, DOM building
│   ├── styles.css         # All styles with CSS custom properties
│   └── content.js         # Teamie DOM scraper
├── backend/
│   ├── server.py          # Flask API (Claude + Resend + grades)
│   ├── grades.py          # Pure math grade calculator
│   ├── test_grades.py     # pytest suite
│   ├── requirements.txt   # Python dependencies
│   └── Procfile           # Gunicorn config for deployment
├── render.yaml            # Render.com deployment config
├── .env.example
├── .gitignore
└── README.md
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Not on Teamie" | Navigate to `lms.asl.org/dash` and log in first |
| "Cannot reach backend" | Run `python server.py` or check your Backend URL setting |
| Claude API error | Verify `ANTHROPIC_API_KEY` is set in `.env` (local) or Render environment |
| Email not arriving | Check `RESEND_API_KEY`, verify your domain on Resend, check spam folder |
| No assignments found | Wait for the Teamie dashboard to fully load, then retry |
| Rate limit exceeded | Max 10 scans per email per day — try again tomorrow |
| Slow first request on Render | Free tier spins down after inactivity — wait ~30s or upgrade to paid |
