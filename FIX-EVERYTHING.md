# FIX-EVERYTHING — Make SchoolPilot Actually Work

You are fixing SchoolPilot, an AI academic companion for high school students. The product has ~14,000 lines of code but the core value loop is broken. No student has ever completed a full cycle of: sign up → sync LMS → see grades → get a useful daily email → come back.

**Read CLAUDE.md first for full architecture context.**

This prompt has 12 fixes ordered by impact. Do them in order. Each fix includes the exact file, the exact problem, and the exact solution. No placeholders, no TODOs, no stubs.

---

## Fix 1: Grade Extraction — The Agent Never Navigates to Gradebooks

**File:** `backend/app/agent/browser.py` — the `explore()` method (starts ~line 625)

**Problem:** The hybrid exploration visits classroom feed pages and extracts assignments from feed text. But it NEVER navigates to gradebook/assessment pages within each classroom. Result: 0 grades synced in the entire history of the product. The `lms_grades` table has 0 rows.

**What to do:** After visiting each classroom feed (Phase 3 in the current code), add a Phase 3b that looks for gradebook links within the classroom. Teamie classrooms have a nav bar with sections like "Newsfeed", "Lessons", "Assessments", "Gradebook". The agent needs to:

1. After extracting assignments from a classroom feed, look for links/tabs containing words like "gradebook", "grades", "assessment", "marks", "results" in the classroom page
2. Click into the gradebook page
3. Take a screenshot and use Claude Vision to extract grade data
4. The extracted data should be structured as: `{"type": "grade", "course": "AP Statistics P8 DK [25-26]", "overall_grade": "A", "overall_percentage": 93.5, "categories": [{"name": "Tests", "weight": 40, "grade": 95}, ...]}`
5. Navigate back to the classroom or dashboard before moving to the next class

Add a `_claude_extract_grades_from_screenshot` method that sends a screenshot to Claude with this instruction:

```
You are looking at a gradebook/assessment page in a school LMS (Teamie). Extract ALL grade information visible.

Return a JSON array of grade objects:
[{
  "type": "grade",
  "course": "exact course name as shown",
  "overall_grade": "letter grade if visible (A, B+, etc.)",
  "overall_percentage": numeric percentage if visible (e.g., 93.5),
  "categories": [{"name": "category name", "weight": weight_number, "grade": percentage}]
}]

If you see individual assignment scores, extract them as:
[{
  "type": "assignment",
  "course": "course name",
  "title": "assignment title",
  "score": points_earned_number,
  "points": points_possible_number,
  "due_date": "YYYY-MM-DD if visible",
  "graded": true
}]

Return ONLY the JSON array. If no grades visible, return [].
```

Use Claude Vision (screenshot-based) for gradebooks, NOT text extraction — gradebook pages are often rendered as complex tables/grids that lose structure when converted to text.

---

## Fix 2: Stable ID Deduplication Bug

**File:** `backend/app/agent/explorer.py` — `_upsert_assignment()` method (line 278)

**Problem:** `_stable_id` hashes `(course, title, due_date)`. When the same assignment's due date changes between syncs, it creates a duplicate instead of updating. This is why you have 4 assignments but some are duplicates.

**Fix:** Remove `due_date` from the stable ID hash. The assignment is uniquely identified by (course, title):

```python
def _upsert_assignment(self, item: dict) -> None:
    lms_id = self._stable_id(
        item.get("course"),
        item.get("title"),
        # Removed: item.get("due_date") — due dates change, titles don't
    )
```

---

## Fix 3: Course Name Normalization (Duplicate Courses)

**File:** `backend/app/agent/explorer.py` — `_upsert_course()` method (line 332)

**Problem:** The same course gets stored with different names across syncs. Current data shows:
- "Advanced Journalism - S2" (without period/teacher/year)
- "Advanced Journalism - S2 P6 LA [25-26]" (with period/teacher/year)

These create two separate rows in `class_context` because the upsert key is `(user_id, class_name)`.

**Fix:** Add a `_normalize_course_name()` method that strips period codes, teacher initials, and year brackets, then use the normalized name for the upsert key while keeping the full name in a separate `full_name` column. OR (simpler): always use the LONGEST version of the name as the canonical one. Implement by querying existing class_context for fuzzy matches before inserting:

```python
def _upsert_course(self, item: dict) -> None:
    raw_name = item.get("name", "Unknown")
    # Check if a similar course already exists (match base name)
    base_name = re.sub(r'\s*P\d+\s+[A-Z]{1,3}\s*', '', raw_name)  # Strip "P6 LA"
    base_name = re.sub(r'\s*\[\d{2}-\d{2}\]\s*$', '', base_name)  # Strip "[25-26]"
    base_name = base_name.strip()

    # Look for existing course with this base name
    existing = (
        self.db.table("class_context")
        .select("class_name")
        .eq("user_id", self.user_id)
        .ilike("class_name", f"%{base_name}%")
        .execute()
    )

    # Use existing name if found, otherwise use the raw name
    canonical_name = existing.data[0]["class_name"] if existing.data else raw_name

    self.db.table("class_context").upsert(
        {
            "user_id": self.user_id,
            "class_name": canonical_name,
            "teacher_name": item.get("teacher"),
            "period": item.get("period"),
            "room": item.get("room"),
            "updated_at": _utcnow(),
        },
        on_conflict="user_id,class_name",
    ).execute()
```

---

## Fix 4: Study Guide Tool Returns a Stub

**File:** `backend/app/chat/engine.py` — `_tool_generate_study_guide()` method (line 956)

**Problem:** When a student asks the AI to generate a study guide in chat, the tool handler returns a canned message instead of actually generating content:
```python
return {
    "status": "ready",
    "message": f"I'll create a study guide for {topic} in {course}. You can also visit the Study page..."
}
```

The student asks "help me study for AP Psych chapter 5" and gets "I'll create a study guide" with zero actual content.

**Fix:** Actually call Claude to generate the study guide content, reusing the same prompts from `study_routes.py`:

```python
async def _tool_generate_study_guide(self, tool_input: dict) -> dict:
    course = tool_input.get("course", "").strip()
    topic = tool_input.get("topic", "").strip()

    if not course or not topic:
        return {"error": "Both course and topic are required."}

    from app.prompts.study import STUDY_GUIDE_PROMPT

    try:
        response = await self.client.messages.create(
            model=self.settings.claude_model,
            max_tokens=2048,
            system=STUDY_GUIDE_PROMPT,
            messages=[{"role": "user", "content": f"Course: {course}\nTopic: {topic}"}],
            timeout=30.0,
        )
        guide_text = response.content[0].text
        return {
            "status": "generated",
            "course": course,
            "topic": topic,
            "guide": guide_text,
        }
    except Exception as e:
        logger.exception("Study guide generation failed")
        return {"error": f"Failed to generate study guide: {str(e)}"}
```

---

## Fix 5: Grade Calculator Uses Wrong Math

**File:** `backend/app/chat/engine.py` — `_tool_calculate_grade()` method (line 908)

**Problem:** The what-if calculation is:
```python
new_pct = (current_pct + (score / total * 100)) / 2
```
This just averages the current grade with the new score, which is mathematically wrong. It ignores category weights, number of existing assignments, and total points.

The required_score calculation has the same issue:
```python
needed = 2 * target - current_pct
```

**Fix:** Since we don't have reliable category weight data yet (grades table is empty), be honest about the limitation and use a better approximation. At minimum, explain the math clearly:

```python
if scenario == "what_if":
    score = tool_input.get("hypothetical_score", 85)
    total = tool_input.get("hypothetical_total", 100)
    score_pct = (score / total * 100) if total > 0 else 0

    # Without knowing total points in gradebook, estimate impact
    # Assume new assignment is ~5% of total grade (conservative)
    weight = 0.05
    projected = current_pct * (1 - weight) + score_pct * weight

    return {
        "course": course_name,
        "current_grade": round(current_pct, 1),
        "hypothetical_score": f"{score}/{total} ({round(score_pct, 1)}%)",
        "projected_grade": round(projected, 1),
        "change": round(projected - current_pct, 1),
        "note": "Estimate assumes this assignment is ~5% of your total grade. Actual impact depends on category weights and total points in the gradebook.",
    }
elif scenario == "required_score":
    target = tool_input.get("target_grade", 90)
    gap = target - current_pct

    if gap <= 0:
        return {
            "course": course_name,
            "current_grade": round(current_pct, 1),
            "target_grade": target,
            "message": f"You're already at {round(current_pct, 1)}%, which meets your target of {target}%.",
        }

    # Estimate: how high would the score need to be if the assignment is ~5% of grade
    weight = 0.05
    needed_pct = (target - current_pct * (1 - weight)) / weight

    return {
        "course": course_name,
        "current_grade": round(current_pct, 1),
        "target_grade": target,
        "needed_score": round(min(100, max(0, needed_pct)), 1),
        "note": "Estimate assumes the next assignment is ~5% of your total grade.",
    }
```

---

## Fix 6: Auto-Title Conversations

**File:** `backend/app/chat/engine.py`

**Problem:** Every conversation is titled "New conversation" forever. The `create_conversation` method in MemoryStore hardcodes the title and it's never updated.

**Fix:** After the first assistant response in a conversation, generate a short title. Add this to the `stream_response` method, after the first turn completes:

```python
# After persisting the assistant message, check if conversation needs a title
try:
    conv = await self.memory.get_conversation(conversation_id)
    if conv and conv.get("title") in ("New conversation", None, ""):
        # Generate title from first user message
        title_response = await self.client.messages.create(
            model="claude-haiku-4-5-20251001",  # Use Haiku for speed/cost
            max_tokens=20,
            messages=[{
                "role": "user",
                "content": f"Generate a 3-5 word title for a conversation that starts with: {user_message[:200]}. Return ONLY the title, nothing else."
            }],
        )
        title = title_response.content[0].text.strip().strip('"')[:50]
        if title:
            self.db.table("conversations").update({"title": title}).eq("id", conversation_id).execute()
except Exception:
    logger.debug("Failed to auto-title conversation", exc_info=True)
```

Also add a `get_conversation` method to MemoryStore if it doesn't exist:
```python
async def get_conversation(self, conversation_id: str) -> dict | None:
    try:
        result = self.db.table("conversations").select("*").eq("id", conversation_id).eq("user_id", self.user_id).execute()
        return result.data[0] if result.data else None
    except Exception:
        return None
```

---

## Fix 7: Install PostHog SDK (Frontend)

**File:** `web/app/layout.tsx` (or create `web/app/providers.tsx`)

**Problem:** PostHog org exists but the JS SDK was never installed. Zero analytics on anything. You're flying blind.

**Fix:**

1. Add the package:
```bash
cd web && npm install posthog-js
```

2. Create `web/lib/posthog.ts`:
```typescript
import posthog from 'posthog-js'

export function initPostHog() {
  if (typeof window !== 'undefined' && !posthog.__loaded) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY || '', {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
    })
  }
  return posthog
}
```

3. Create `web/app/providers.tsx`:
```typescript
'use client'
import { useEffect } from 'react'
import { initPostHog } from '@/lib/posthog'

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog()
  }, [])
  return <>{children}</>
}
```

4. Wrap the app in `web/app/layout.tsx`:
```typescript
import { Providers } from './providers'
// ... in the body:
<Providers>{children}</Providers>
```

5. Add to `.env.local`:
```
NEXT_PUBLIC_POSTHOG_KEY=<the key from PostHog project settings>
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

6. Identify users after login. In the auth callback or after Supabase session is established:
```typescript
import posthog from 'posthog-js'
// After supabase.auth.getUser() succeeds:
posthog.identify(user.id, { email: user.email })
```

---

## Fix 8: Install Sentry SDK (Backend)

**File:** `backend/app/main.py`

**Problem:** Sentry org exists but SDK is not installed. Your Gmail account sync broke today and you had no way to know.

**Fix:**

1. Add to `requirements.txt`:
```
sentry-sdk[fastapi]
```

2. In `backend/app/main.py`, at the top before app creation:
```python
import sentry_sdk

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN", ""),
    traces_sample_rate=0.1,
    profiles_sample_rate=0.1,
    environment=os.getenv("ENVIRONMENT", "production"),
)
```

3. Add `SENTRY_DSN` to `.env.example` and your actual `.env`.

---

## Fix 9: Fix Landing Page False Claims

**File:** `web/app/page.tsx`

**Problem:** The landing page claims support for "Canvas, Blackboard, Google Classroom, Schoology" — none of which work. Only Teamie is supported. Lying to users before they even sign up destroys trust.

**Fix:** Remove ALL mentions of Canvas, Blackboard, Google Classroom, and Schoology from the landing page. Replace with honest copy:

- Instead of "Works with Canvas, Blackboard..." → "Connects to your school's LMS"
- Or even better: "Built for ASL students" (own your niche)
- Remove the multi-LMS grid/logos if they exist

Also fix the dark text on dark background bug below the fold. Search for any text with colors like `text-gray-900`, `text-black`, or `text-slate-900` and change them to light colors that work on the `#0a0a1a` background.

---

## Fix 10: Fix Middleware Onboarding State Drift

**File:** `web/middleware.ts` (line 69)

**Problem:** Middleware checks `user.user_metadata?.onboarding_completed` but the actual onboarding flow sets `student_profiles.onboarding_complete`. These can get out of sync — student finishes onboarding in the DB but the JWT metadata was never updated, so middleware keeps redirecting them to /onboarding forever.

**Fix:** The onboarding page must update BOTH when completing:

1. In the onboarding completion handler (wherever `onboarding_complete` is set to true in the DB), also call:
```typescript
await supabase.auth.updateUser({
  data: { onboarding_completed: true }
})
```

2. As a safety net, in middleware, if the user has been on /onboarding for too long or if `student_profiles.onboarding_complete` is true, trust the DB over the JWT. But since middleware can't easily query the DB (it's edge middleware), the simpler fix is to make sure the onboarding page always updates both.

Find the onboarding completion code and ensure it does both the profile update AND the auth metadata update in the same flow, with proper error handling if one fails.

---

## Fix 11: Daily Briefing Double-Filter Bug

**File:** `backend/app/scheduler.py` — `send_daily_briefings_job()` (line 130)

**Problem:** The query filters on BOTH `daily_briefing_enabled = true` AND `email_briefings = true`. Looking at the Supabase schema, `email_briefings` may not exist as a column (or may default to false/null). This means the briefing query returns 0 rows even when a user has `daily_briefing_enabled = true`. Result: daily briefings have NEVER been sent.

**Fix:** Check which columns actually exist. If `email_briefings` is a valid column, fine. If not, remove it from the query:

```python
profiles = (
    db.table("student_profiles")
    .select("user_id, display_name, personality_preset")
    .eq("daily_briefing_enabled", True)
    .execute()
)
```

Also: the briefing is hardcoded at 7 AM UTC. London (GMT/BST) is UTC+0 or UTC+1. For ASL students, 7 AM UTC is 7-8 AM local, which is fine for now. But add a TODO comment noting this should respect student timezone once you have users in other timezones.

---

## Fix 12: Clean Up Dead Schema

**File:** Supabase migration (create a new migration or run SQL directly)

**Problem:** 29 tables, but 8 of them are empty leftovers from v1/v2 that aren't referenced by any code:
- `courses` (0 rows — replaced by `class_context`)
- `grades` (0 rows — replaced by `lms_grades`)
- `plans` (0 rows — never implemented)
- `chunks` (0 rows — no RAG/vector features)
- `study_guides` (0 rows — replaced by `study_content`)
- `sprints` (0 rows — never implemented)
- `scraped_assignments` (0 rows — replaced by `lms_assignments`)

These create confusion about which tables are real.

**Fix:** Before dropping, verify none of these are referenced in the codebase. Search for each table name in `backend/` and `web/`. If unreferenced, drop them:

```sql
DROP TABLE IF EXISTS public.courses CASCADE;
DROP TABLE IF EXISTS public.grades CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;
DROP TABLE IF EXISTS public.chunks CASCADE;
DROP TABLE IF EXISTS public.study_guides CASCADE;
DROP TABLE IF EXISTS public.sprints CASCADE;
DROP TABLE IF EXISTS public.scraped_assignments CASCADE;
```

Also drop the empty analytics tables that were added but never instrumented:
- `sync_metrics` (0 rows)
- `grade_snapshots` (0 rows)
- `user_events` (0 rows)
- `anonymized_patterns` (0 rows)
- `calendar_tokens` (0 rows)
- `document_uploads` (0 rows)

Keep only tables that have data or are actively used by code.

---

## Order of Operations

1. **Fix 2** (stable_id) — 2 minutes, prevents future duplicates
2. **Fix 3** (course normalization) — 10 minutes, cleans up data pipeline
3. **Fix 1** (grade extraction) — 30-45 minutes, this is the big one
4. **Fix 4** (study guide stub) — 5 minutes, makes chat actually useful
5. **Fix 5** (grade calculator math) — 10 minutes
6. **Fix 6** (auto-title conversations) — 10 minutes
7. **Fix 7** (PostHog SDK) — 15 minutes
8. **Fix 8** (Sentry SDK) — 10 minutes
9. **Fix 9** (landing page lies) — 15 minutes
10. **Fix 10** (onboarding state drift) — 10 minutes
11. **Fix 11** (briefing double-filter) — 5 minutes
12. **Fix 12** (dead schema cleanup) — 10 minutes, do last

Total: ~2-3 hours of focused work. After this, a student can sign up, sync their LMS, see actual grades, chat with an AI that generates real study guides, get a daily email, and you'll have analytics on every step.

---

## After These Fixes: Verify

1. Create a fresh test account
2. Go through onboarding — does it complete without trapping you?
3. Trigger a manual sync — do grades appear in `lms_grades`?
4. Open chat, ask "what's my grade in AP Stats?" — does it answer with real data?
5. Ask "help me study for calculus derivatives" — does it generate actual content?
6. Check PostHog — are page views showing up?
7. Check Sentry — is the project receiving events?
8. Visit the landing page — is the copy honest? Is text visible below the fold?
9. Wait for 7 AM UTC — does the daily briefing email arrive?
