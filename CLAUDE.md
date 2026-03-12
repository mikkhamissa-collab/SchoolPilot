# SchoolPilot v3 — Complete Rebuild

## What SchoolPilot Is

An AI academic companion for high school students. It logs into their LMS (Teamie) via a server-side browser agent, extracts assignments/grades/courses, and provides an AI-powered daily plan, grade tracking, study tools, and a conversational AI that knows their school life. Students interact through a web app + daily email. Everything is free.

## Current State

The repo has legacy code from v1 and v2. Before building anything:

### Step 1: Delete These Files/Folders
```
rm -rf extension/                    # Chrome extension — killed
rm -rf backend/                      # Flask v1 — killed (backend_new/ is the real backend now)
rm COMPETITIVE_ANALYSIS.md           # Strategy doc, not needed in repo
rm PRICING_STRATEGY.md               # Strategy doc
rm VIRAL-PLAYBOOK.md                 # Strategy doc
rm STICKINESS-PROMPT.md              # Strategy doc
rm SIMPLIFY-PROMPT.md                # Strategy doc
rm CHROME_STORE_LISTING.md           # No more extension
rm AGENT-SPEC.md                     # Replaced by this file
rm store-screenshot-dashboard.png    # Extension screenshots
rm store-screenshot-popup.png        # Extension screenshots
rm deploy.sh                         # Old deploy script
```

### Step 2: Rename
```
mv backend_new/ backend/             # This is now THE backend
```

### Step 3: Keep for Reference (read-only)
- `School_Pilot_Architecture.pdf` — original architecture vision
- `School_Pilot_PRD.pdf` — product requirements
- `web/` — existing Next.js code (reference for features, then rebuild)

---

## Architecture

```
schoolpilot.co (Vercel)
     │
     ▼
┌─────────────────────────────┐
│   Next.js Web App           │
│   - Dashboard               │
│   - AI Chat                 │
│   - Grade Tracker           │
│   - Study Tools             │
│   - Focus Timer             │
│   - Study Buddy             │
└──────────┬──────────────────┘
           │ API calls
           ▼
┌─────────────────────────────┐
│   FastAPI Backend            │
│   - Auth (Supabase JWT)     │
│   - AI (Claude Sonnet)      │
│   - Email (Resend)          │
│   - Grades (pure math)      │
│   - Scheduler (APScheduler) │
│   ┌─────────────────────┐   │
│   │ Playwright Agent    │   │
│   │ - LMS Login         │   │
│   │ - Assignment Sync   │   │
│   │ - Grade Sync        │   │
│   └─────────────────────┘   │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│   Supabase                  │
│   - PostgreSQL + RLS        │
│   - Auth (email/password)   │
│   - Realtime (optional)     │
└─────────────────────────────┘
```

---

## Project Structure

```
SchoolPilot/
├── web/                          # Next.js frontend (REBUILD)
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── layout.tsx            # Root layout
│   │   ├── globals.css           # Tailwind + custom tokens
│   │   ├── auth/
│   │   │   ├── login/page.tsx    # Login
│   │   │   └── callback/route.ts # Auth callback
│   │   ├── onboarding/page.tsx   # Hybrid onboarding
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx        # Dashboard shell + sidebar
│   │   │   ├── today/page.tsx    # Daily plan (home)
│   │   │   ├── grades/page.tsx   # Grade tracker
│   │   │   ├── study/page.tsx    # Study tools (guides, flashcards, practice tests)
│   │   │   ├── focus/page.tsx    # Focus timer
│   │   │   ├── buddy/page.tsx    # Study buddy
│   │   │   └── settings/page.tsx # Settings
│   │   └── api/                  # Next.js API routes (proxy to backend)
│   │       ├── ai/[...path]/route.ts
│   │       └── sync/route.ts
│   ├── components/
│   │   ├── ChatSidebar.tsx       # Persistent AI chat
│   │   ├── Navbar.tsx            # Top nav
│   │   ├── Sidebar.tsx           # Side nav
│   │   └── [shared components]
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client
│   │   └── api.ts                # Backend API helper
│   ├── middleware.ts              # Auth protection
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── backend/                       # FastAPI backend (EVOLVE from backend_new/)
│   ├── app/
│   │   ├── main.py               # FastAPI app + lifespan
│   │   ├── config.py             # Pydantic settings
│   │   ├── db.py                 # Supabase client
│   │   ├── auth.py               # JWT verification
│   │   ├── scheduler.py          # APScheduler (daily sync + email)
│   │   ├── routes/
│   │   │   ├── chat_routes.py    # SSE streaming chat
│   │   │   ├── sync_routes.py    # LMS sync endpoints
│   │   │   ├── grades_routes.py  # Grade calculation
│   │   │   ├── study_routes.py   # Study tools (guides, flashcards, etc.)
│   │   │   ├── plan_routes.py    # Daily plan generation
│   │   │   ├── buddy_routes.py   # Study buddy
│   │   │   ├── profile_routes.py # Student profile
│   │   │   └── email_routes.py   # Email briefing
│   │   ├── chat/
│   │   │   └── engine.py         # Claude chat + tool use
│   │   ├── agent/
│   │   │   ├── browser.py        # Playwright vision agent
│   │   │   └── explorer.py       # LMS exploration orchestrator
│   │   ├── memory/
│   │   │   └── store.py          # Supabase queries
│   │   ├── services/
│   │   │   ├── grades.py         # Pure math grade calculator
│   │   │   └── email.py          # Resend email service
│   │   └── prompts/
│   │       ├── planner.py        # Daily plan prompts
│   │       ├── study.py          # Study tool prompts
│   │       ├── chat.py           # Chat personality prompts
│   │       └── personalities.py  # Personality presets
│   ├── schema.sql                # Supabase schema
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
├── .env.example
├── .gitignore
└── README.md
```

---

## Backend Spec

### Tech Stack
- **FastAPI** + **Uvicorn** (async)
- **Supabase** (PostgreSQL + Auth + RLS)
- **Anthropic Claude** (claude-sonnet-4-20250514)
- **Playwright** (headless Chromium, vision-based)
- **Resend** (email)
- **APScheduler** (background jobs)
- **Pydantic v2** (validation)

### Database Schema

Use the existing `schema.sql` from `backend/` as the starting point. It already has 11 tables with RLS. Key additions needed:

**Add to schema:**
```sql
-- Study buddy pairs
CREATE TABLE buddy_pairs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_a UUID REFERENCES auth.users NOT NULL,
    user_b UUID REFERENCES auth.users NOT NULL,
    status TEXT CHECK (status IN ('pending', 'active', 'ended')) DEFAULT 'pending',
    streak_count INTEGER DEFAULT 0,
    last_activity_a TIMESTAMPTZ,
    last_activity_b TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily streaks
CREATE TABLE streaks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_active_date DATE,
    total_active_days INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

-- Study sessions log
CREATE TABLE study_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    duration_minutes INTEGER NOT NULL,
    focus_type TEXT, -- 'pomodoro', 'deep_work', 'quick'
    assignment_id UUID REFERENCES lms_assignments,
    completed_at TIMESTAMPTZ DEFAULT now()
);
```

### Auth Flow
1. Student signs up on schoolpilot.co (Supabase email/password)
2. During onboarding, student logs into Teamie through our app
3. We capture the authenticated session cookies via Playwright
4. Store encrypted session data in `lms_credentials` table (Fernet AES-256)
5. Agent uses saved session to sync. If session expires, re-authenticate with stored creds as fallback

### LMS Sync Agent

The Playwright agent is the heart of SchoolPilot. It runs on the same server as the API.

**How it works:**
1. `APScheduler` triggers daily sync at 6:00 AM student's timezone
2. Agent launches headless Chromium
3. Loads saved session cookies for the student
4. Navigates to `lms.asl.org/dash/#/`
5. Uses Claude Vision to understand the page, extract assignments, grades
6. Stores extracted data in `lms_assignments` and `lms_grades` tables
7. After sync, generates daily plan via Claude
8. Sends email briefing via Resend
9. Browser closes. Total time: ~30-60 seconds per student.

**Concurrency:** Max 3 concurrent browser instances. Queue additional syncs. Timeout after 120 seconds.

**Session management:**
- Try session cookies first
- If session expired, fall back to username/password login (encrypted in DB)
- If login fails, mark credentials as invalid, notify student via email

### API Endpoints

**Auth:**
- `POST /api/auth/verify` — verify Supabase JWT

**Sync:**
- `POST /api/sync/trigger` — manual sync (student-initiated)
- `GET /api/sync/status` — last sync status + data freshness
- `POST /api/sync/credentials` — save/update LMS credentials (encrypted)

**Plan:**
- `GET /api/plan/today` — get today's AI-generated plan
- `POST /api/plan/generate` — regenerate plan on demand
- `POST /api/plan/email` — send plan as email

**Chat:**
- `POST /api/chat/send` — send message, get SSE stream response
- `GET /api/chat/conversations` — list conversations
- `POST /api/chat/conversations` — create new conversation
- `GET /api/chat/conversations/{id}/messages` — get messages
- `DELETE /api/chat/conversations/{id}` — delete conversation

**Grades:**
- `GET /api/grades` — get all synced grades
- `POST /api/grades/calculate` — weighted grade calculation
- `POST /api/grades/required` — score needed for target
- `POST /api/grades/whatif` — what-if projection
- `POST /api/grades/log` — manually log a grade

**Study:**
- `POST /api/study/guide` — generate study guide
- `POST /api/study/flashcards` — generate flashcards
- `POST /api/study/quiz` — generate practice quiz
- `POST /api/study/explain` — explain concept
- `POST /api/study/summary` — one-page summary

**Focus:**
- `POST /api/focus/session` — log completed focus session
- `GET /api/focus/stats` — get focus history + streaks

**Buddy:**
- `POST /api/buddy/invite` — invite study buddy (by email)
- `POST /api/buddy/accept` — accept invitation
- `GET /api/buddy/status` — get buddy pair + mutual streak
- `POST /api/buddy/nudge` — send nudge to buddy

**Profile:**
- `GET /api/profile` — get student profile
- `PUT /api/profile` — update profile
- `GET /api/profile/streak` — get streak data

**Email:**
- `POST /api/email/briefing` — send daily briefing now
- `PUT /api/email/preferences` — update email settings

### Claude Prompts

Port the prompts from the old Flask `prompts_v2.py`. They're good. Key philosophy:

> Students don't care about "productivity." They care about: not failing, not disappointing parents, getting into college, reducing anxiety of not knowing where they stand.

**Personality presets** (student picks during onboarding):
- `coach` — supportive, energetic
- `friend` — casual, empathetic
- `drill_sergeant` — tough love, no excuses
- `mentor` — wise, guiding

### Email Briefing Format

Send via Resend. From: `pilot@schoolpilot.co`. Subject: `Your plan for {Day, Month Date}`.

Content:
1. Grade snapshot (any at-risk grades flagged)
2. Today's priorities (sorted by urgency + grade impact)
3. Quick wins (things that take <30 min)
4. Streak count + buddy activity
5. One motivational line (not cheesy)

Format as clean HTML email. Mobile-friendly. Dark header with SchoolPilot branding.

---

## Frontend Spec

### Tech Stack
- **Next.js** (latest stable, App Router)
- **React 19**
- **Tailwind CSS 4**
- **Supabase JS** (auth + realtime)
- No other UI libraries. No shadcn, no Radix, no Material UI. Keep it simple.

### Design System
- **Dark theme only.** Background: `#0a0a1a`. Surface: `#141428`. Cards: `#1a1a2e`.
- **Accent:** Indigo/purple (`#7c3aed`).
- **Font:** Inter (Google Fonts) or system font stack.
- **Minimal.** No clutter. Lots of whitespace. Big type for important numbers.
- **Mobile-first.** Most students will use this on their phone.

### Pages

**Landing Page (`/`)**
- Hero: "Your AI study assistant that actually knows your classes"
- Three feature highlights (Plan, Grades, Focus)
- CTA: "Get started free"
- No pricing. No tiers. Just free.

**Login (`/auth/login`)**
- Email + password via Supabase
- "Sign up" / "Log in" toggle
- Clean, centered form

**Onboarding (`/onboarding`)** — Hybrid Flow
1. **Welcome** — "Let's set up your assistant" + personality picker (coach/friend/drill_sergeant/mentor)
2. **LMS Connect** — Student enters Teamie URL + credentials. We test login immediately via Playwright. Show real-time status ("Logging in... Exploring your courses... Found 6 classes!")
3. **Review** — Show what the agent found: courses, upcoming assignments, current grades. Student can correct anything.
4. **Preferences** — "When do you do your best work?" (morning/afternoon/night), daily email toggle, timezone auto-detect
5. **Done** — "You're all set. Here's your first daily plan." Redirect to /today.

**Today (`/today`)** — Home/Dashboard
- Today's AI-generated plan (generated from last sync)
- Grade risk alerts (any classes near a grade boundary)
- Streak counter (days in a row of activity)
- Buddy status (if paired)
- "Sync now" button (triggers manual LMS sync)
- Quick actions: "Start focus session", "Chat with AI", "Check grades"

**Grades (`/grades`)**
- All courses with current grade + letter grade
- Click into a course: category breakdown, what-if calculator, "what do I need?" calculator
- Grade logging: after an assessment, student can manually enter their score
- Trend indicators (up/down arrow if grade changed since last sync)

**Study (`/study`)**
- Pick a course → pick a topic/unit
- Generate: study guide, flashcards, practice quiz, concept explainer, summary
- Results render inline (no separate page)
- Save generated content for later review

**Focus (`/focus`)**
- Timer presets: 25 min (Pomodoro), 45 min (Deep Work), 15 min (Quick)
- Custom duration option
- Session history (today's sessions, total minutes this week)
- Streak display
- NO ambient sounds (removed — keep it simple)

**Buddy (`/buddy`)**
- If no buddy: invite form (enter friend's email)
- If paired: mutual streak counter, last activity, "nudge" button
- Buddy activity feed (e.g., "Alex completed a 25-min focus session")
- Simple, social, lightweight

**Settings (`/settings`)**
- Profile (name, school, timezone)
- LMS connection status + re-sync button
- Email preferences (daily briefing on/off, briefing time)
- Personality preset
- Danger zone: delete account, disconnect LMS

**Chat Sidebar** (persistent, on every dashboard page)
- Collapsible right sidebar
- SSE streaming responses
- AI knows student's courses, grades, assignments, patterns
- Tool use: can set reminders, update profile, run grade calculations mid-chat
- Conversation history

### Frontend Auth
- Supabase auth with cookies (middleware-protected)
- `/auth/callback` handles OAuth redirect
- `middleware.ts` redirects unauthenticated users to `/auth/login`
- Redirect to `/onboarding` if `onboarding_complete` is false

---

## Deployment

### Backend: Render or Railway
- Docker container (Python 3.11 + Playwright deps)
- Single service: API + Playwright agent + scheduler
- Environment variables: Supabase URL/keys, Anthropic key, Resend key, encryption key
- Health check: `GET /health`

### Frontend: Vercel
- Auto-deploy from `web/` directory on push
- Environment variables: Supabase URL/anon key, backend URL

### Supabase
- Hosted Supabase project (free tier works for now)
- Run `schema.sql` to set up tables + RLS policies

---

## What NOT to Build
- No Chrome extension
- No mobile app
- No multi-LMS support (Teamie only for now)
- No payment system (everything is free)
- No admin dashboard
- No parent dashboard
- No vector DB / RAG
- No ambient sounds
- No TypeScript strict mode on backend (Python only)
- No separate worker service (keep it simple — one container)

## Quality Standards
- Python: type hints, async/await, Pydantic models for all request/response
- TypeScript: strict mode, no `any` types
- Error handling: every endpoint has try/except, returns meaningful errors
- No console.log spam in frontend (use sparingly for real errors)
- Mobile-first responsive design
- Every AI call has a timeout (30 seconds)
- Every Playwright operation has a timeout (120 seconds max per sync)

## Build Order
1. Backend: config, auth, db, health endpoint → deploy to verify
2. Backend: Playwright agent (login + sync) → test against real Teamie
3. Backend: plan generation + email sending
4. Backend: grades calculator + study tools (port from old Flask code)
5. Backend: chat engine (SSE streaming + tool use)
6. Backend: scheduler (daily sync cron)
7. Backend: buddy routes + streak tracking
8. Frontend: auth flow (login/signup/callback/middleware)
9. Frontend: onboarding (hybrid flow with live Playwright feedback)
10. Frontend: today page (daily plan + grade alerts + streak)
11. Frontend: grades page (tracker + calculators)
12. Frontend: study page (all study tools)
13. Frontend: focus page (timer + sessions)
14. Frontend: buddy page (invite + pair + nudge)
15. Frontend: chat sidebar (SSE streaming)
16. Frontend: settings page
17. Frontend: landing page
18. Wire up daily email briefings
19. Test full flow end-to-end
20. Deploy everything

Build it all. No placeholders. No TODOs. No stubs. Production-ready code.
