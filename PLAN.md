# SchoolPilot — Full Product Roadmap

## Current Status: MVP Complete ✅

```
┌─────────────────────────────────────────────────────────────┐
│                        MVP (DONE)                           │
│                                                             │
│   [Extension]  →  [Backend]  →  [Claude]  →  [Email]       │
│       ↓              ↓             ↓            ↓          │
│   Scrape        Flask API      Prioritize    Resend        │
│   Teamie        /process       assignments   daily plan    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**What works now:**
- Chrome extension scrapes Teamie dashboard
- Backend calls Claude for prioritization
- Email sent via Resend
- Rate limiting (10/day)

---

## Product Vision

> Turn Teamie's information dump into an actionable daily plan with grade awareness, study guides, and smart scheduling.

**Core principle:** Facts are traceable. Predictions are labeled. No hallucinated deadlines.

---

## Phased Roadmap

| Phase | Features | Effort | Value |
|-------|----------|--------|-------|
| **0** | MVP (daily email) | ✅ Done | Core loop |
| **1** | Grade Engine | 3-4 days | High — "what do I need on the test?" |
| **2** | Work Chunking | 2-3 days | Medium — break big tasks into blocks |
| **3** | Better Scraping | 2 days | Medium — gradebook + assessments |
| **4** | Study Guides | 3-4 days | Medium — AI summaries with citations |
| **5** | Sprint Mode | 2-3 days | Medium — 7-day test prep |
| **6** | Google Drive | 5+ days | Low priority — PDF extraction |
| **7** | Calendar Sync | 3 days | Nice-to-have |

---

## Phase 1: Grade Engine (Recommended Next)

**What it does:**
- Input your current grades + category weights
- Calculate: "What score do I need on the next test for an A?"
- What-if scenarios: "If I get 85% on this, my grade becomes..."

**Why first:** Deterministic (no AI hallucination), high anxiety-reduction, differentiated from Teamie.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      GRADE ENGINE                           │
│                                                             │
│   [Gradebook Data]  →  [Grade Calculator]  →  [Results]    │
│         ↓                     ↓                    ↓        │
│   Manual input         Pure math            Required score  │
│   (or scraped)         No AI needed         What-if table   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Data Model

```python
# Course grade structure
{
    "course": "AP Statistics",
    "categories": [
        {"name": "Tests", "weight": 0.40},
        {"name": "Quizzes", "weight": 0.25},
        {"name": "Homework", "weight": 0.20},
        {"name": "Participation", "weight": 0.15}
    ],
    "grades": [
        {"category": "Tests", "name": "Unit 1 Test", "score": 87, "max": 100},
        {"category": "Quizzes", "name": "Quiz 3", "score": 22, "max": 25},
        # ...
    ],
    "policies": {
        "drop_lowest": {"Quizzes": 1},  # optional
        "missing_penalty": 0  # or 50, etc.
    }
}
```

### Claude Code Session — Phase 1:

```
Add a grade engine to SchoolPilot. This is pure math, no AI.

Create backend/grades.py with:

1. GradeCalculator class that:
   - Takes course config (categories with weights, grades list)
   - Calculates current grade per category and overall
   - Handles "drop lowest N" policy if specified
   - Handles missing assignments (configurable penalty)

2. required_score(target_grade, upcoming_assessment) method:
   - Given target (e.g., 90 for A), calculate minimum score needed
   - Account for remaining category weight
   - Return {"required": 87, "achievable": true/false, "explanation": "..."}

3. what_if(hypothetical_scores) method:
   - Take list of {assessment, score} hypotheticals
   - Return projected final grade

Add Flask endpoints:
- POST /grades/calculate — input grades, get current + projections
- POST /grades/required — input target, get required score
- POST /grades/whatif — input hypotheticals, get projections

No database. Grades passed in request body. Keep it stateless.

Test with AP Stats example:
- Tests 40%, Quizzes 25%, Homework 20%, Participation 15%
- Current: Tests avg 87, Quizzes avg 92, HW 95, Participation 100
- Question: "What do I need on the next test for a 90 overall?"
```

**Done when:** POST test data → get "You need 85% on next test for an A"

### Extension UI Addition:

```
Add a "Grade Calculator" tab to the SchoolPilot popup:

1. Tab navigation: "Daily Plan" | "Grades"
2. Grades tab has:
   - Course dropdown (hardcoded list for now)
   - Current grade display
   - "What do I need?" section:
     - Target grade input (A/B/C or percentage)
     - Next assessment dropdown
     - Calculate button → shows required score
   - Simple what-if: "If I get ___% → grade becomes ___"

Keep the UI minimal. Dark theme matching existing popup.
Store grade configs in chrome.storage.local for persistence.
```

---

## Phase 2: Work Chunking

**What it does:**
- Break assignments into 25-45 min study blocks
- Each chunk has clear "done when" criteria
- Optional: Pomodoro timer integration

### Claude Code Session — Phase 2:

```
Add work chunking to SchoolPilot.

1. Backend: POST /chunk endpoint
   - Input: {assignment: {title, type, course, due}, context?: string}
   - Claude breaks it into 2-5 chunks:
     {
       "chunks": [
         {"step": 1, "task": "Read pages 45-52", "minutes": 25, "done_when": "Finished reading, noted key terms"},
         {"step": 2, "task": "Complete problems 1-10", "minutes": 30, "done_when": "All answers written"},
         {"step": 3, "task": "Review and self-check", "minutes": 15, "done_when": "Corrected any errors"}
       ],
       "total_minutes": 70
     }

2. Extension: "Break it down" button on each assignment
   - Shows chunk list with checkboxes
   - Optional: simple countdown timer per chunk
   - Stores completion state in chrome.storage.local

System prompt for Claude:
"Break this assignment into 2-5 actionable chunks. Each chunk should be:
- 15-45 minutes of focused work
- Have a clear 'done when' definition
- Be specific enough to start immediately
Prioritize the hardest/most important chunk for when energy is high."
```

---

## Phase 3: Better Scraping

**What it does:**
- Scrape gradebook (not just todos)
- Scrape upcoming assessments with dates
- Detect assignment weights if shown

### Teamie Gradebook Selectors (to discover):

```
You'll need to inspect these pages:
- https://lms.asl.org/dash/#/courses/{id}/gradebook
- https://lms.asl.org/dash/#/courses/{id}/assessments

Look for:
- Grade percentages
- Category names and weights
- Individual assignment scores
- Upcoming test dates
```

### Claude Code Session — Phase 3:

```
Expand SchoolPilot scraping to include gradebook and assessments.

1. New content scripts:
   - gradebook.js — scrapes grade data from course gradebook page
   - assessments.js — scrapes upcoming tests/quizzes

2. Update popup to add "Sync Grades" button that:
   - Opens gradebook pages in background tabs (or instructs user)
   - Scrapes and stores grade data
   - Feeds into grade engine

3. Store scraped data in chrome.storage.local with timestamps

Note: User must navigate to each course's gradebook for initial sync.
Future: could automate tab opening, but keep it simple for now.
```

---

## Phase 4: Study Guides

**What it does:**
- Generate unit summary from assignment titles + any scraped content
- List "high-likelihood topics" based on frequency/recency
- Every bullet cites source (which assignment/material it came from)

### Claude Code Session — Phase 4:

```
Add study guide generation to SchoolPilot.

1. Backend: POST /study-guide endpoint
   - Input: {course, unit, assignments: [...], notes?: string}
   - Claude generates:
     {
       "unit": "Confidence Intervals",
       "summary": "...",
       "key_concepts": [
         {"concept": "Margin of error", "source": "Lesson 4.2 assignment"},
         ...
       ],
       "high_likelihood_topics": [
         {"topic": "Calculating CI for proportions", "reason": "Appeared in 3 assignments", "sources": [...]}
       ],
       "practice_questions": [...]
     }

2. Extension: "Generate Study Guide" button per course
   - Uses stored assignment history for that course
   - Displays guide in popup or new tab
   - Cites sources for every claim

System prompt:
"Generate a study guide for this unit. Rules:
- Every concept must cite which assignment/material it came from
- High-likelihood topics = appeared multiple times or recently emphasized
- Be concise. Students skim these.
- Include 3-5 practice questions in the style of what they've seen."
```

---

## Phase 5: Sprint Mode

**What it does:**
- 7-day intensive prep before a test
- Spaced repetition schedule (review on day 2, 5, 7)
- Daily targets with progress tracking

### Claude Code Session — Phase 5:

```
Add sprint mode to SchoolPilot.

1. Backend: POST /sprint/create
   - Input: {test_name, test_date, course, topics: [...], available_hours_per_day}
   - Returns 7-day plan with:
     - Daily focus topics
     - Review sessions (spaced: +1, +3, +6 days after first learn)
     - Practice test on day 6
     - Light review on day 7

2. Extension: "Start Sprint" button when viewing upcoming assessment
   - Shows sprint calendar view
   - Daily checklist with completion tracking
   - Progress bar

3. Morning digest includes sprint status if active:
   "Sprint Day 3/7: Review confidence intervals (first learned Day 1)"
```

---

## Phase 6: Google Drive Integration (Low Priority)

**Complexity:** OAuth, file picker, PDF parsing, embeddings

**Only build if:** You frequently have worksheets/notes in Drive that aren't in Teamie.

### High-Level Approach:

1. Google OAuth with drive.file scope (minimal)
2. File picker UI — user selects specific files/folders
3. PDF extraction → text chunks
4. Store embeddings in local vector DB (or just SQLite with FTS)
5. Retrieval for study guide generation

**Recommendation:** Skip unless you validate the need. Most school materials are in Teamie already.

---

## Phase 7: Calendar Sync (Nice-to-Have)

**What it does:**
- Write study blocks to Google Calendar
- Read busy times to avoid conflicts

**Only build if:** You actually use Google Calendar for scheduling.

---

## File Structure (Full Vision)

```
SchoolPilot/
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── content.js          # Teamie todos scraper
│   ├── gradebook.js        # Phase 3: grade scraper
│   ├── assessments.js      # Phase 3: test scraper
│   └── styles.css
├── backend/
│   ├── server.py           # Main Flask app
│   ├── grades.py           # Phase 1: grade calculator
│   ├── chunker.py          # Phase 2: work breakdown
│   ├── study_guide.py      # Phase 4: guide generator
│   ├── sprint.py           # Phase 5: sprint planner
│   └── requirements.txt
├── .env
├── .gitignore
├── README.md
└── PLAN.md
```

---

## Immediate Next Steps

### Option A: Validate MVP First (Recommended)
1. Load extension in Chrome
2. Go to lms.asl.org/dash
3. Run backend: `cd backend && python server.py`
4. Click "Scan & Send"
5. Check email — is the prioritization useful?

### Option B: Jump to Phase 1 (Grade Engine)
If MVP is validated, paste the Phase 1 Claude Code prompt and build.

---

## Success Metrics (Personal)

Forget enterprise metrics. You'll know it's working if:

- [ ] You check SchoolPilot every morning
- [ ] You stopped missing deadlines
- [ ] "What do I need on the test?" is answered in 10 seconds
- [ ] You feel less anxious about grades

---

## Anti-Goals

Things we're NOT building:

- ❌ Multi-user auth system
- ❌ Database (stateless is fine for personal use)
- ❌ Parent dashboard
- ❌ School-wide deployment
- ❌ Mobile app (extension is enough)
- ❌ Automatic assignment submission

Keep it personal. Keep it simple. Add complexity only when you feel the pain.
