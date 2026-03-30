# SchoolPilot Roadmap — March 27, 2026

## Current Reality (not what we want it to be — what it IS)

| Metric | Value | Target for Launch |
|--------|-------|-------------------|
| Real users (non-founder) | 0 | 10 |
| Grades synced | 0 | Working for all synced users |
| Study sessions logged | 0 | N/A (needs grades first) |
| Daily briefings sent | 0 ever | Working for opted-in users |
| PostHog installed | No | Yes |
| Sentry installed | No | Yes |
| FIX-EVERYTHING items done | 0/12 | 12/12 |

The product has never completed its core value loop for a single user: sign up → sync LMS → see grades → get daily plan → come back.

---

## Phase 0: STOP PLANNING, START FIXING (This Weekend — March 27-30)

Everything below is from FIX-EVERYTHING.md. These are not new ideas. They were identified days ago and none have been applied.

### 0A. Core Data Pipeline (4 hours)

1. **Fix stable_id dedup** — Remove `due_date` from the hash in `explorer.py:_upsert_assignment()`. 2 minutes.
2. **Fix course name normalization** — Strip period codes and year brackets, fuzzy-match existing courses. 10 minutes.
3. **Build grade extraction** — Add Phase 3b to `browser.py:explore()` that navigates to gradebook tabs within each classroom, screenshots, and uses Claude Vision to extract grade data. This is the single most important missing feature. 45 minutes.
4. **Fix briefing double-filter** — Remove the phantom `email_briefings` column check from `scheduler.py`. 5 minutes.
5. **Fix onboarding state drift** — Ensure onboarding completion updates both `student_profiles.onboarding_complete` AND `auth.user_metadata.onboarding_completed`. 10 minutes.

After this phase: A user who syncs should see actual grades in the database.

### 0B. Make the AI Actually Useful (2 hours)

6. **Fix study guide stub** — `chat/engine.py:_tool_generate_study_guide()` returns a canned message instead of generating content. Wire it to the actual Claude call with `STUDY_GUIDE_PROMPT`. 5 minutes.
7. **Fix grade calculator math** — The what-if calculation averages current grade with new score (wrong). Replace with weighted estimate. 10 minutes.
8. **Auto-title conversations** — Generate 3-5 word titles from first message using Haiku. 10 minutes.

### 0C. Observability (1 hour)

9. **Install PostHog SDK** — `npm install posthog-js`, create provider, identify users after login. Without this, you're guessing about everything. 15 minutes.
10. **Install Sentry SDK** — `pip install sentry-sdk[fastapi]`, init in `main.py`. Without this, you don't know when things break. 10 minutes.

### 0D. Honest Landing Page (30 minutes)

11. **Remove false LMS claims** — Delete all mentions of Canvas, Blackboard, Google Classroom, Schoology. Replace with "Built for ASL students" or "Connects to your school's LMS."
12. **Fix dark text on dark bg** — Find and fix any light-mode text colors below the fold.

### 0E. Clean Dead Schema (15 minutes)

13. Drop the 13 empty/unused tables: `courses`, `grades`, `plans`, `chunks`, `study_guides`, `sprints`, `scraped_assignments`, `sync_metrics`, `grade_snapshots`, `user_events`, `anonymized_patterns`, `calendar_tokens`, `document_uploads`.

**Phase 0 total: ~8 hours of focused work. Not a weekend of planning — a weekend of applying the fixes that already have exact code in FIX-EVERYTHING.md.**

---

## Phase 1: FIRST 10 REAL USERS (Week of March 30 — April 5)

### Prerequisites (from Phase 0)
- [ ] Grades actually sync
- [ ] PostHog shows page views
- [ ] Sentry is receiving events
- [ ] Landing page is honest
- [ ] Onboarding doesn't trap users

### 1A. Test the Full Loop Yourself
Before inviting anyone:
1. Create a fresh account (not your existing test accounts)
2. Complete onboarding with your real ASL credentials
3. Trigger sync — verify grades appear in `lms_grades`
4. Open chat — ask "what's my grade in [class]?" — verify it answers with real data
5. Ask "help me study for [topic]" — verify it generates real content
6. Check PostHog — confirm pageviews are flowing
7. Check Sentry — confirm it's receiving (or not receiving) errors
8. Wait for 7 AM UTC — verify daily briefing email arrives

### 1B. Recruit 10 ASL Students
- DM 10 classmates directly. Not a mass announcement. Personal ask.
- Message: "I built this thing that syncs with Teamie and tells you your grades + makes study guides. Can you try it for 5 minutes and tell me if it's useful?"
- Watch PostHog and Sentry like a hawk for the first 48 hours

### 1C. Fix What Breaks
- You WILL discover bugs when real users hit the app
- This is the entire point of Phase 1
- Prioritize: anything that blocks sign up → sync → see grades

---

## Phase 2: MAKE IT STICKY (April 6-19)

Only start this after 10 users have completed the full loop at least once.

### 2A. Daily Briefing Polish
- Verify emails are actually sending and arriving
- A/B test subject lines (PostHog)
- Add "reply to this email to chat with your AI" (if feasible)

### 2B. Merge the Redesign
- The worktree at `.claude/worktrees/busy-austin/` has PostHogProvider, UI components, custom icons
- Merge this work into main
- Apply the REDESIGN.md design tokens across all pages
- This is cosmetic — only do it AFTER the core loop works

### 2C. Study Tools That Work
- Flashcard generation (not just study guides)
- Practice quiz generation
- "Explain this concept" tool
- All via the chat engine, not separate pages

### 2D. Focus Timer + Streaks
- Make the focus timer actually log sessions to `study_sessions`
- Implement streak counting in `streaks` table
- Display streak on /today page

---

## Phase 3: GROWTH TO 100 USERS (April 20 — May 10)

### 3A. Buddy System
- Enable invite flow
- Mutual streak counter
- Nudge notifications
- This is the viral loop — one user invites one friend

### 3B. Word of Mouth Mechanics
- Share card component (already built, needs to work with real data)
- "X is using SchoolPilot" social proof
- Shareable grade improvement screenshots

### 3C. Expand Beyond ASL (Maybe)
- Only if ASL is saturated
- Would require testing against another Teamie instance
- Or pivoting the agent to support a second LMS

---

## Phase 4: 100 → 1000 USERS (May 10+)

This is too far out to plan in detail. What matters:
- You need the product working for 10 people before you think about 1000
- The viral coefficient from buddy system + share cards will determine whether this scales
- TikTok/marketing only works if the product delivers value. Right now it doesn't.

---

## Architecture: What's Right, What's Wrong

### What's Right
- **Stack choice is solid.** FastAPI + Supabase + Next.js + Playwright is the right call for this product.
- **Playwright agent approach is creative.** Vision-based LMS scraping is hard but it's the only way when there's no API.
- **Frontend is surprisingly complete.** 15 pages, all rendered. The code exists.
- **Schema is reasonable.** RLS is set up. Tables make sense.

### What's Wrong
- **The agent never extracts grades.** The most important data point for the product doesn't get collected.
- **No observability at all.** You're shipping blind.
- **Chat tools are stubs.** The AI "knows your school life" but can't actually do anything useful when asked.
- **Dead code everywhere.** 13 unused tables, legacy files, a worktree with unmerged improvements.
- **The product lies to users before they even sign up** (landing page claims).

### Architecture Decisions to Make Later (NOT NOW)
- Separate worker service for Playwright? (Not until >50 concurrent users)
- Redis for session management? (Not until you need it)
- Multi-LMS support? (Not until ASL is saturated)
- Payment/pricing? (Not until you have retention data)

---

## The One Thing That Matters

**The grade extraction in `browser.py` is the single blocker.** Everything else — study tools, daily plans, chat, streaks, buddy system — depends on having grade data. Without grades, SchoolPilot is just a fancy to-do list that doesn't even sync properly.

Fix the agent. Get grades flowing. Everything else follows.
