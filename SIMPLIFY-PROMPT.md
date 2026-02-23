# SchoolPilot Simplification — Claude Code Prompt

## Context

SchoolPilot is a student productivity app with a Chrome extension that syncs assignments from Teamie LMS, and a Next.js web app that shows AI-prioritized tasks with grade context.

**Problem:** The app has too many features and pages. Students open it and don't know where to click. We need to cut it down to the core.

## Current State (What Exists)

**Navigation (8 items — too many):**
- Guardian (today) — grade-aware daily priorities
- Study — study session timer
- Dashboard — overview
- Grades — grade tracking + projections
- Focus — break tasks into chunks
- Plan — daily plan generation
- Sprint — 7-day study plans
- Settings — user config

**The Today/Guardian page** is 550+ lines showing:
- Grade Guardian headline
- Action Required card (with grade context, danger/safe scores)
- Other Priorities list
- Tests & Grades column
- Homework checklist
- On Track courses
- Week forecast
- Study session launcher

This is cognitive overload.

## Target State (What We Want)

**Navigation (3 items):**
```
🛡️ Today     — Your one focus. Grade context. Do it.
📊 Grades    — Track grades, see projections
⚙️ Settings  — Email, preferences, sign out
```

**The Today page should be radically simple:**

```
┌────────────────────────────────────────┐
│  Good morning, [Name].                 │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  🎯 YOUR FOCUS                   │  │
│  │                                  │  │
│  │  [Assignment Title]              │  │
│  │  [Course] • [Due time]           │  │
│  │                                  │  │
│  │  Your grade: 87% → need 85%      │  │
│  │  to keep your A-                 │  │
│  │                                  │  │
│  │  [ Start Studying ]  [ Done ✓ ]  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ↓ 3 more tasks today (expandable)     │
│                                        │
└────────────────────────────────────────┘
```

**Core principles:**
1. ONE primary focus, not a list
2. Grade context on that one thing (why it matters)
3. Two actions: Start studying, Mark done
4. Other tasks hidden by default, expandable
5. Mobile-first design (works on phone, scales up to desktop)

## Tasks

### 1. Delete These Pages
- `/dashboard` — redundant with Today
- `/focus` — nice-to-have, not core
- `/plan` — redundant with Today
- `/sprint` — save for v2
- `/study` or `/session` — merge functionality into Today page

### 2. Update Sidebar (`components/Sidebar.tsx`)
Reduce to 3 nav items:
```tsx
const navItems = [
  { href: "/today", label: "Today", icon: "🛡️" },
  { href: "/grades", label: "Grades", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];
```

### 3. Update Mobile Nav (`components/MobileNav.tsx`)
Same 3 items. This is the primary nav for students (they're on phones).

### 4. Simplify Today Page (`app/(dashboard)/today/page.tsx`)

**Remove:**
- 3-column layout
- Week forecast section
- "On Track" courses section
- "Other Priorities" as a visible section
- Motivation quotes
- Stakes banner

**Keep but simplify:**
- One "Focus" card showing THE most important task
- Grade context on that task (current grade, what they need)
- "Start Studying" button (opens inline timer/focus mode, not separate page)
- "Mark Done" button with confetti
- Collapsed "X more tasks" that expands on tap

**New structure:**
```tsx
// Simplified Today page structure
export default function TodayPage() {
  return (
    <div className="max-w-lg mx-auto p-6">
      {/* Greeting */}
      <h1>Good morning, {name}.</h1>

      {/* Single Focus Card */}
      <FocusCard
        task={priorityTask}
        onStartStudying={...}
        onMarkDone={...}
      />

      {/* Expandable other tasks */}
      <CollapsibleTaskList tasks={otherTasks} />
    </div>
  );
}
```

### 5. Grades Page — Keep As Is (Mostly)
The grades page is good. Maybe clean up styling to match the simpler Today page, but functionality is solid.

### 6. Settings Page — Keep As Is
Necessary for config. No changes needed.

### 7. Update API Calls
If any deleted pages had their own API routes that aren't used elsewhere, clean those up. But don't break the core `/api/sync` and grade-related endpoints.

## Design Guidelines

- **Max width:** 512px for main content (mobile-first)
- **Colors:** Keep current dark theme with sage green accent
- **Typography:** Larger text for the focus card (it's THE thing)
- **Whitespace:** More breathing room, less density
- **Animations:** Keep confetti on task completion, remove other animations

## Definition of Done

1. App has 3 nav items (Today, Grades, Settings)
2. Today page shows ONE focus card by default
3. Other tasks are hidden behind "X more" collapse
4. No broken links or 404s
5. Mobile experience feels native and simple
6. A student can open the app, see what to do, and close it in <10 seconds

## Files to Modify

```
web/
├── components/
│   ├── Sidebar.tsx          # Reduce to 3 items
│   └── MobileNav.tsx        # Reduce to 3 items
├── app/(dashboard)/
│   ├── today/page.tsx       # Simplify radically
│   ├── grades/page.tsx      # Keep, minor cleanup
│   ├── settings/page.tsx    # Keep as is
│   ├── dashboard/           # DELETE
│   ├── focus/               # DELETE
│   ├── plan/                # DELETE
│   ├── sprint/              # DELETE
│   └── session/             # DELETE (merge into today)
```

## Don't Touch

- Landing page (`app/(marketing)/page.tsx`) — it's good
- Auth flow — working fine
- Chrome extension — working fine
- Backend API routes that power grades and sync
- Supabase schema

---

Start with the navigation (Sidebar + MobileNav), then delete the pages, then simplify Today. Test on mobile viewport throughout.

---
---

# Chrome Extension Scraper — Complete Technical Reference

This section is the deep-dive into the entire scraping system: how data flows from Teamie LMS into SchoolPilot, every selector, every fallback, every edge case.

## Architecture Overview

SchoolPilot uses a **two-scraper, two-sync-path** architecture:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  CHROME EXTENSION (Manifest V3)                                          │
│                                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                │
│  │  popup.js    │   │ background.js│   │  web-auth.js │                │
│  │  (user click)│   │ (auto-sync   │   │ (grabs auth  │                │
│  │              │   │  every 4hrs) │   │  token from  │                │
│  │  Injects:    │   │  Injects:    │   │  localStorage│                │
│  │  content.js  │   │  content.js  │   │  on website) │                │
│  └──────┬───────┘   └──────┬───────┘   └──────────────┘                │
│         │                  │                                             │
│         ▼                  ▼                                             │
│  ┌──────────────────────────────┐   ┌──────────────────────────────┐   │
│  │  SCRAPER 1: content.js       │   │  SCRAPER 2: content-deep.js  │   │
│  │  Runs on: Dashboard          │   │  Runs on: Course pages       │   │
│  │  URL: lms.asl.org/dash/#/    │   │  URL: lms.asl.org/classroom/*│   │
│  │                              │   │                              │   │
│  │  Extracts:                   │   │  Extracts:                   │   │
│  │  • All courses (sidebar)     │   │  • Course info & structure   │   │
│  │  • Upcoming assignments      │   │  • Units / modules           │   │
│  │  • Overdue assignments       │   │  • Lesson links              │   │
│  │  • Newsfeed posts            │   │  • Page body text            │   │
│  │  • Due dates & times         │   │  • Assignment instructions   │   │
│  │  • Assignment types          │   │  • Embedded resources        │   │
│  └──────────┬───────────────────┘   │    (Drive, PDF, YouTube,     │   │
│             │                       │     attachments, images)      │   │
│             │                       │  • Course posts               │   │
│             │                       └──────────┬───────────────────┘   │
│             │                                  │                       │
└─────────────┼──────────────────────────────────┼───────────────────────┘
              │                                  │
              ▼                                  ▼
   ┌──────────────────────┐           ┌──────────────────────┐
   │  POST /api/sync      │           │  POST /api/materials/ │
   │                      │           │       sync            │
   │  Stores in:          │           │                      │
   │  • scraped_assignments│          │  Stores in:          │
   │  • courses (auto)    │           │  • course_materials  │
   │  • plans             │           │  Merges with existing│
   └──────────┬───────────┘           └──────────┬───────────┘
              │                                  │
              ▼                                  ▼
   ┌──────────────────────┐           ┌──────────────────────┐
   │  AI: Grade Guardian  │           │  AI: Tutor Sessions  │
   │  /plan/analyze       │           │  /plan/study-session  │
   │  /plan/generate-v2   │           │  /plan/study-session/ │
   │                      │           │       diagnostic      │
   │  Uses: assignments + │           │                      │
   │  grades + targets    │           │  Uses: course content│
   │  → ONE priority action│          │  + student profile   │
   └──────────────────────┘           │  → Personalized tutor│
                                      └──────────────────────┘
```

## Extension Manifest (manifest.json)

```json
{
  "manifest_version": 3,
  "name": "SchoolPilot",
  "version": "2.1.0",
  "permissions": ["activeTab", "scripting", "storage", "alarms", "notifications"],
  "host_permissions": ["https://lms.asl.org/*", "https://schoolpilot.co/*"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["https://schoolpilot.co/*", "https://school-pilot.vercel.app/*"],
    "js": ["web-auth.js"],
    "run_at": "document_idle"
  }]
}
```

**Key permissions:**
- `activeTab` — access the current tab's content
- `scripting` — inject content scripts programmatically
- `storage` — persist auth tokens, sync timestamps, last-scraped data
- `alarms` — schedule auto-sync every 4 hours
- `notifications` — alert student about new/overdue assignments

**Host permissions:**
- `lms.asl.org/*` — the Teamie LMS (scraping target)
- `schoolpilot.co/*` — the web app (sync target + auth token extraction)

---

## SCRAPER 1: content.js — Dashboard Scraper

### What It Does
Scrapes the Teamie LMS dashboard at `https://lms.asl.org/dash/#/`. This is the main overview page students see when they log in. It contains a sidebar with courses, an events panel with upcoming/overdue assignments, and a newsfeed with teacher posts.

### When It Runs
- **Manual trigger:** User clicks "Sync Assignments" in the extension popup → `popup.js` injects `content.js` via `chrome.scripting.executeScript()`
- **Auto-sync:** `background.js` alarm fires every 4 hours → finds an open Teamie tab → injects `content.js`

### Execution Model
The entire scraper is wrapped in an IIFE (Immediately Invoked Function Expression) that `return`s data. This is critical — `chrome.scripting.executeScript` captures the return value of the last expression. The IIFE pattern:

```javascript
(() => {
  const data = { ... };
  // ... scraping logic ...
  return data;
})();
```

### Teamie Dashboard DOM Structure

Teamie is an AngularJS Single Page Application. The dashboard at `lms.asl.org/dash/#/` uses Angular's hash-based routing. The DOM looks approximately like this:

```
body
├── .left-sidebar
│   ├── .classrooms-list
│   │   ├── .btn.toggle-all              ← "View all X Classes" button
│   │   └── a.classroom.list-group-item  ← Course links (one per class)
│   │       └── textContent = "AP Physics C"
│   └── .user-events-container
│       └── .panel.event-category         ← "Overdue 29" / "Next 7 Days 7"
│           ├── .panel-heading            ← Category heading with count
│           └── .event-wrapper            ← One per assignment
│               ├── .date-block           ← Only appears on first event of each day
│               │   ├── .date             ← "02"
│               │   └── .day              ← "Mon"
│               └── .event-tile
│                   ├── .event-icons .mdi ← Icon class indicates type
│                   ├── .title span       ← "Chapter 5 Test"
│                   ├── .meta             ← Type (first line after split on \n)
│                   ├── .sub-meta .text-primary span  ← "Due: 8:30 AM"
│                   └── .meta:last-of-type            ← Course name
│
├── .main-content
│   └── .newsfeed
│       └── .node-post                    ← Teacher posts
│           ├── .post-header
│           │   └── a[href*="classroom"]  ← Course link
│           ├── .field-post-title a       ← Author name
│           ├── p (multiple)              ← Post body text
│           └── textContent matches:
│               "Due on: Feb 3 at 8:30 AM"
│               "Mark as Done"
```

### Section 1: Course Extraction

**Primary selector:** `a.classroom.list-group-item`

**Pre-step:** Clicks `document.querySelector('.btn.toggle-all')` if it says "View all" — Teamie defaults to showing only "starred" courses. Clicking this expands to show ALL enrolled courses.

**Extraction logic:**
```javascript
const classroomLinks = document.querySelectorAll('a.classroom.list-group-item');
for (const link of classroomLinks) {
  const name = link.textContent.trim().replace(/\s+/g, ' ');
  const idMatch = link.href && link.href.match(/classroom\/(\d+)/);
  const id = idMatch ? idMatch[1] : null;
  // Dedup by name, skip if < 3 chars
  data.courses.push({ name, id, href: link.href || '' });
}
```

**Fallback:** If no `a.classroom.list-group-item` found (DOM structure changed), falls back to `a[href*="classroom/"]` with filters to exclude "Catalogue" and "View all" links.

**Output per course:**
```typescript
{
  name: string;      // "AP Physics C"
  id: string | null; // "12345" (from URL /classroom/12345)
  href: string;      // Full URL to course page
}
```

### Section 2: Sidebar Events (Assignments)

This is the most complex section due to Teamie's **date inheritance pattern**.

**The date inheritance problem:**
Teamie groups events by date, but the date block (`.date-block`) only appears on the FIRST event of each day. Subsequent events on the same day have no date block — they inherit from the one above. So we must track `currentDate` and `currentDay` as state while iterating:

```
┌──────────────────────────────┐
│  .event-category "Next 7 Days 7"  │
│                              │
│  .event-wrapper              │
│    .date-block               │
│      .date = "03"            │  ← currentDate = "03"
│      .day  = "Mon"           │  ← currentDay  = "Mon"
│    .event-tile               │
│      title = "Chapter 5 HW"  │  → date: "03", day: "Mon"
│                              │
│  .event-wrapper              │
│    (no .date-block!)         │  ← inherits "03" / "Mon"
│    .event-tile               │
│      title = "Lab Report"    │  → date: "03", day: "Mon"
│                              │
│  .event-wrapper              │
│    .date-block               │
│      .date = "04"            │  ← currentDate = "04"
│      .day  = "Tue"           │  ← currentDay  = "Tue"
│    .event-tile               │
│      title = "Reading Quiz"  │  → date: "04", day: "Tue"
└──────────────────────────────┘
```

**Primary path:** Iterates through `document.querySelectorAll('.panel.event-category')`:

1. Each `.panel.event-category` has a `.panel-heading` with text like "Overdue 29" or "Next 7 Days 7"
2. Checks if heading contains "overdue" (case-insensitive) → routes to `data.overdue` vs `data.assignments`
3. Within each category, iterates `.event-wrapper` elements with date tracking

**Selectors used per event:**

| Data | Selector | Notes |
|------|----------|-------|
| Date | `.date-block .date` | Numeric day "02", "15" etc. Only present on first event of each day |
| Day | `.date-block .day` | "Mon", "Tue" etc. Same caveat |
| Title | `.title span` then `.title` | Fallback chain: try `span` inside `.title` first |
| Type | `.meta` (first element) | Split on `\n`, take first non-empty trimmed line. Values: "Assignment", "Assessment", "Task" |
| Due | `.text-primary span` then `.text-primary` | "Due: 8:30 AM" or "Due: 11:59 PM" |
| Course | `.meta:last-of-type` | Full course name, may contain newlines — cleaned |
| Icon | `.event-icons .mdi` className | `mdi-home` = task, `mdi-file` = assignment, etc. |

**Deduplication:** Uses a Set with key `${title}|${course}|${date}` to prevent duplicate entries.

**Fallback strategies (3 levels):**
1. **Primary:** `.panel.event-category` → `.event-wrapper` (most structured)
2. **Fallback 1:** `.user-events-container` → `.event-wrapper` (if categories not found)
3. **Fallback 2:** `.panel-group.event-list .event-wrapper` (top-level events outside containers)

All three use the same date-inheritance and extraction logic.

**Output per assignment:**
```typescript
{
  title: string;          // "Chapter 5 Test"
  type: string | null;    // "Assessment" | "Assignment" | "Task"
  due: string | null;     // "Due: 8:30 AM"
  course: string | null;  // "AP Physics C"
  date: string | null;    // "03" (inherited from nearest date-block above)
  day: string | null;     // "Mon" (inherited)
  isOverdue: boolean;     // true if in "Overdue" category
  icon: string;           // CSS class like "mdi mdi-home"
}
```

### Section 3: Newsfeed Posts

**Selector:** `document.querySelectorAll('.node-post')`

Newsfeed posts are teacher announcements, tasks, and updates that appear in the main content area. They're important because teachers often post due dates and instructions here that don't show up in the sidebar.

**Extraction per post:**
```javascript
// Course info from embedded classroom link
const courseLink = post.querySelector('a[href*="classroom"]');
const courseName = courseLink ? courseLink.textContent.trim() : null;
const courseId = courseLink?.href.match(/classroom\/(\d+)/)?.[1] || null;

// Body text: all <p> tags, skip short ones, cap at 500 chars total
const allP = post.querySelectorAll('p');
// ... join non-trivial paragraphs ...

// Due date: regex match "Due on: Feb 3 at 8:30 AM"
const dueMatch = fullText.match(/Due on:\s*(.+?)(?:\n|Mark)/);

// Is it a task? Look for "Mark as Done" button text
const isTask = fullText.includes('Mark as Done');

// Post type: from CSS class (announcement, thought, task)
```

**Output per post:**
```typescript
{
  author: string | null;   // "Mr. Smith"
  course: string | null;   // "AP Physics C"
  courseId: string | null;  // "12345"
  body: string;            // First 500 chars of post text
  dueDate: string | null;  // "Feb 3 at 8:30 AM"
  isTask: boolean;         // Has "Mark as Done"
  postType: string;        // "post" | "announcement" | "thought" | "task"
}
```

### Section 4: Stats

Computed summary of what was scraped:

```typescript
{
  totalCourses: number;
  totalAssignments: number;
  totalOverdue: number;
  overdueReported: number | null;  // From "Overdue 29" heading badge
  todosCount: number | null;       // From .user-todo-count element
  newsfeedPosts: number;
  scrapedAt: string;               // ISO timestamp
}
```

### Complete content.js Output Schema

```typescript
interface DashboardScrapeResult {
  courses: Array<{
    name: string;
    id: string | null;
    href: string;
  }>;
  assignments: Array<{
    title: string;
    type: string | null;
    due: string | null;
    course: string | null;
    date: string | null;
    day: string | null;
    isOverdue: boolean;
    icon: string;
  }>;
  overdue: Array<{
    title: string;
    type: string | null;
    due: string | null;
    course: string | null;
    date: string | null;
    day: string | null;
    isOverdue: true;
    icon: string;
  }>;
  newsfeed: Array<{
    author: string | null;
    course: string | null;
    courseId: string | null;
    body: string;
    dueDate: string | null;
    isTask: boolean;
    postType: string;
  }>;
  stats: {
    totalCourses: number;
    totalAssignments: number;
    totalOverdue: number;
    overdueReported: number | null;
    todosCount: number | null;
    newsfeedPosts: number;
    scrapedAt: string;
  };
}
```

---

## SCRAPER 2: content-deep.js — Course Page Scraper

### What It Does
Deep-scrapes an individual course page at `lms.asl.org/classroom/{id}`. Extracts the full course structure: units, lessons, embedded documents (Google Drive, PDFs, YouTube), assignment instructions, and page body text. This is what powers the AI tutor — it gives SchoolPilot access to the actual teaching materials.

### When It Runs
Manually invoked when a student navigates to a specific course page and triggers a deep scrape. Unlike `content.js`, this is NOT auto-synced — it requires the user to be on a course page.

### Execution Model
Same IIFE pattern as content.js. Returns data synchronously. Cannot follow links or navigate — it only reads what's currently rendered in the DOM.

### Teamie Course Page DOM Structure

```
body
├── .classroom-header
│   └── .name                    ← Course name
├── .breadcrumb
│   └── li:last-child a          ← Course name (fallback)
│
├── .main-content / #content / main
│   ├── .unit-item / .lesson-group / .module-item
│   │   ├── .unit-name / .unit-title / h3 / h4   ← "Unit 3: Waves"
│   │   ├── .unit-description / .description / p  ← Description
│   │   └── li / .objective                        ← Learning objectives
│   │
│   ├── a[href*="/lesson/"] / a[href*="/page/"]   ← Lesson links
│   │
│   ├── (If on a lesson/assignment page:)
│   │   ├── .page-title / .lesson-title / h1       ← Page title
│   │   ├── .page-content / .lesson-content / .post-body  ← Body content
│   │   │   ├── h1-h6                              ← Headings
│   │   │   ├── p, div                             ← Text
│   │   │   ├── li                                 ← List items
│   │   │   ├── a[href*="drive.google.com"]        ← Google Drive files
│   │   │   ├── a[href$=".pdf"]                    ← PDF links
│   │   │   ├── iframe[src*="youtube.com"]         ← YouTube embeds
│   │   │   ├── a[href*="/file/"]                  ← Teamie attachments
│   │   │   └── img                                ← Content images
│   │   ├── .assignment-instructions               ← Teacher instructions
│   │   ├── .due-date / .deadline / [class*="due"] ← Due date
│   │   └── .page-nav / .lesson-nav / .sub-pages   ← Sub-page links
│   │
│   └── .node-post / .post-item / .feed-item       ← Course posts
│       └── .post-body / .node-body / p            ← Post text
```

### Helper Functions

**`cleanText(el)`**
Safely extracts and normalizes text from a DOM element:
```javascript
function cleanText(el) {
  if (!el) return null;
  return el.textContent.trim().replace(/\s+/g, ' ');
}
```

**`extractStructuredText(el)`**
Converts HTML content into a markdown-like structured text format, preserving document hierarchy. This is key for the AI tutor — it can understand headings, lists, and paragraphs.

```javascript
// Headings → "## heading text"
// List items → "• item text"
// Paragraphs → plain text
// Result capped at 10,000 characters
```

Logic:
1. Queries for all structural elements: `h1-h6, p, li, div, br, span, td, th`
2. If no structural children found, falls back to raw `textContent`
3. For each child, converts based on tag:
   - `h1`-`h6` → `\n## text\n`
   - `li` → `• text`
   - `p`, `div`, `td`, `th` → plain text (only if leaf node or contains inline elements)
4. Joins with newlines, trims, caps at 10k chars

**`extractResourcesFromEl(container)`**
Scans a DOM subtree for embedded resources. Uses a `seenResources` Set for deduplication.

| Resource Type | Selectors | Extracted Fields |
|--------------|-----------|-----------------|
| Google Drive | `a[href*="drive.google.com"]`, `a[href*="docs.google.com"]` | `type`, `name`, `url`, `fileId` (from `/d/{id}` in URL) |
| PDF | `a[href$=".pdf"]`, `a[href*=".pdf?"]` | `type`, `name`, `url` |
| YouTube (embed) | `iframe[src*="youtube.com"]`, `iframe[src*="youtu.be"]` | `type`, `name`, `videoId`, `src` |
| YouTube (link) | `a[href*="youtube.com/watch"]`, `a[href*="youtu.be/"]` | `type`, `name`, `url`, `videoId` |
| Attachment | `a[href*="/file/"]`, `a.attachment-link`, `.attachment a` | `type`, `name`, `url` |
| Image | `img` (filtered: not avatar, not icon, not tiny, URL > 50 chars) | `type`, `name` (from alt), `url` |

**Google Drive fileId extraction regex:** `/\/d\/([a-zA-Z0-9_-]+)/`
- Matches: `drive.google.com/file/d/ABC123/view` → `ABC123`
- Matches: `docs.google.com/document/d/ABC123/edit` → `ABC123`

**YouTube videoId extraction regex:** `/(?:embed\/|v=)([a-zA-Z0-9_-]{11})/`
- Matches: `youtube.com/embed/dQw4w9WgXcQ` → `dQw4w9WgXcQ`
- Matches: `youtube.com/watch?v=dQw4w9WgXcQ` → `dQw4w9WgXcQ`

### Section 1: Course Info

**Course ID:** Extracted from URL via `window.location.href.match(/classroom\/(\d+)/)`.

**Course Name:** 6-level fallback chain:
1. `.classroom-header .name`
2. `.course-name`
3. `h1.classroom-name`
4. `.breadcrumb li:last-child a`
5. `.page-title`
6. `document.title.split('|')[0]` (last resort)

### Section 2: Units / Modules

**Selectors:** `.unit-item`, `.lesson-group`, `.module-item`, `[class*="unit"]`

For each unit:
- Name from `.unit-name`, `.unit-title`, `h3`, `h4`, or `.name`
- Description from `.unit-description`, `.description`, or `p`
- Unit number parsed from name via regex: `/^(?:Unit|Module)\s+(\d+)/i`
- Learning objectives from `li` and `.objective` elements (filtered: 5-200 chars)

### Section 3: Lessons

**Selectors:** `a[href*="/lesson/"]`, `a[href*="/page/"]`, `.lesson-item a`, `.lesson-link`, `.page-link`

Extracts lesson name, ID (from URL), and href. Deduplicated by `lessonId || name`.

### Section 4: Page Content (Lesson/Assignment Pages)

**Condition:** Only runs if URL matches `/(lesson|page)/\d+/` OR page contains `.assignment-view`, `.submission-form`, or `[class*="assignment"]`.

This is the most valuable extraction — it captures the actual content of a lesson or assignment page:

```typescript
{
  type: 'assignment' | 'lesson';
  pageId: string | null;
  lessonId: string | null;
  title: string | null;           // From .page-title, .lesson-title, h1, .post-title
  body: string | null;            // extractStructuredText() of main content (up to 10k chars)
  instructions: string | null;    // extractStructuredText() of .assignment-instructions
  dueDate: string | null;         // From .due-date element OR regex on page text
  resources: Resource[];           // All embedded resources from the page body
  pages: Array<{name, pageId, href}>;  // Sub-page navigation links
}
```

**Due date extraction has 2 strategies:**
1. DOM: `.due-date`, `.deadline`, `[class*="due"]`
2. Regex fallback: `/Due(?:\s+(?:on|by|date))?\s*:\s*(.+?)(?:\n|$)/i` on full page text

### Section 5: Global Resources

After section-specific extraction, runs `extractResourcesFromEl()` on the main content container (`.main-content`, `#content`, `main`, `.page-content`, or `document.body`) to catch any resources not already found.

### Section 6: Course Posts

**Selectors:** `.node-post`, `.post-item`, `.feed-item`

Extracts text from course-specific posts/announcements. Capped at 1000 chars per post.

### Complete content-deep.js Output Schema

```typescript
interface DeepScrapeResult {
  course: {
    id: string | null;        // "12345" from URL
    name: string | null;      // "AP Physics C"
    url: string;              // Full current URL
  };
  units: Array<{
    number: number | null;    // Parsed from "Unit 3" → 3
    name: string;             // "Unit 3: Waves"
    fullName: string;         // From h2/h3/.full-name or same as name
    description: string | null;
    objectives?: string[];    // Learning objectives
  }>;
  lessons: Array<{
    name: string;             // "3.1 Wave Properties"
    lessonId: string | null;  // From URL
    href: string;             // Full URL to lesson
  }>;
  resources: Array<{
    type: 'google_drive' | 'pdf' | 'youtube' | 'attachment' | 'image';
    name: string;
    url?: string;
    fileId?: string;          // Google Drive only
    videoId?: string;         // YouTube only
    src?: string;             // YouTube iframe only
  }>;
  pageContent: {              // Only present on lesson/assignment pages
    type: 'assignment' | 'lesson';
    pageId: string | null;
    lessonId: string | null;
    title: string | null;
    body: string | null;      // Structured text, up to 10k chars
    instructions: string | null;
    dueDate: string | null;
    resources: Resource[];
    pages: Array<{name: string; pageId: string | null; href: string}>;
  } | null;
  coursePostContent: string[]; // Post texts, each up to 1k chars
  scrapedAt: string;          // ISO timestamp
}
```

---

## Sync Pipeline: Extension → Database → AI

### Step 1: Dashboard Sync (content.js → /api/sync)

```
Extension popup.js  ──POST──▶  /api/sync (Next.js)
                                   │
                                   ├─▶ scraped_assignments table (full raw dump)
                                   │     { user_id, assignments: { upcoming, overdue, newsfeed, stats } }
                                   │
                                   ├─▶ courses table (auto-create new courses)
                                   │     { user_id, name, categories: DEFAULT_CATEGORIES }
                                   │     Deduped by name. Default weights: Assessments 40%, Assignments 35%, Participation 25%
                                   │
                                   └─▶ plans table (raw assignment list for AI processing)
                                         { user_id, assignments, ai_response: null }
```

**Request body:**
```json
{
  "assignments": [...],
  "overdue": [...],
  "courses": [...],
  "newsfeed": [...],
  "stats": {...},
  "type": "assignments"
}
```

**Response:**
```json
{
  "status": "synced",
  "count": 15,
  "overdue_count": 3,
  "courses_created": 2,
  "total_courses": 8
}
```

### Step 2: Deep Material Sync (content-deep.js → /api/materials/sync)

```
Extension  ──POST──▶  /api/materials/sync (Next.js)
                           │
                           ├─▶ course_materials table (upsert per course)
                           │     { user_id, course_id, course_name, course_url,
                           │       units, lessons, resources, assignments,
                           │       extracted_content, scraped_at, last_sync }
                           │
                           └─▶ If existing record: MERGES arrays by key
                                 units merged by "name"
                                 lessons merged by "lessonId"
                                 resources merged by "url"
                                 assignments merged by "pageId"
```

The merge logic uses a `Map` keyed by the specified field — newer data overwrites older for the same key, new items are appended.

### Step 3: Content Extraction (/api/materials/extract)

```
Client  ──POST──▶  /api/materials/extract
                       │
                       ├─▶ For each resource:
                       │     Google Drive → fetch export URL → extract text
                       │     YouTube → fetch oEmbed metadata
                       │     PDF → placeholder (needs PDF parsing service)
                       │
                       └─▶ extracted_documents table
                             { material_id, source_type, source_url, source_id,
                               title, extracted_text, metadata, extracted_at }

                           Also updates course_materials.extracted_content with previews
```

**Google Drive extraction strategies:**
1. Direct download: `https://drive.google.com/uc?export=download&id={fileId}`
2. Docs export: `https://docs.google.com/document/d/{fileId}/export?format=txt`
3. If file is not text-based (image/video), returns type placeholder

**YouTube extraction:**
Uses oEmbed endpoint: `https://www.youtube.com/oembed?url=...&format=json`
Returns video title and author. Full transcript extraction requires a third-party service.

### Step 4: AI Tutor Generation (/plan/study-session)

```
Web app  ──POST──▶  Flask /plan/study-session
                       │
                       ├─▶ If courseContent provided:
                       │     Uses TUTOR_SESSION_PROMPT
                       │     References actual documents, creates practice problems
                       │     matching teacher's style
                       │
                       └─▶ If no courseContent:
                             Uses STUDY_SESSION_PROMPT (generic)
                             Creates general study chunks based on assignment info
```

---

## Background Auto-Sync (background.js)

### Alarm Setup
- Created on extension install via `chrome.runtime.onInstalled`
- Default interval: every 4 hours (`DEFAULT_SYNC_INTERVAL_HOURS = 4`)
- First sync: 5 minutes after install (`delayInMinutes: 5`)
- Stored in `chrome.storage.local`: `autoSyncEnabled`, `syncIntervalHours`

### Auto-Sync Process
1. `chrome.tabs.query({ url: 'https://lms.asl.org/*' })` — find an open Teamie tab
2. If no tab open → send notification "Open Teamie to keep your assignments synced"
3. If tab found → inject `content.js` → POST to `/api/sync`
4. Compares scraped data with `lastScanData` in `chrome.storage.local`
5. Detects new assignments and newly overdue items
6. Sends Chrome notification if new overdue or new assignments found

### Message Handlers
`background.js` listens for messages from the popup or web app:
- `enableAutoSync` — set up alarm with custom interval
- `disableAutoSync` — clear alarm
- `syncNow` — trigger immediate sync

---

## Auth Flow (web-auth.js)

### Problem
The Chrome extension needs a Supabase auth token to call `/api/sync`, but the user logs in on the web app (schoolpilot.co), not the extension. We need to bridge the auth token from the website to `chrome.storage.local`.

### Solution
`web-auth.js` is a content script that runs automatically on `schoolpilot.co/*` and `school-pilot.vercel.app/*` (declared in `manifest.json` `content_scripts`). It reads the auth token from the website's `localStorage` and stores it in `chrome.storage.local`.

### Token Extraction Strategy (3 sources, priority order):

1. **Explicit extension token:** `localStorage.getItem('schoolpilot_ext_token')`
   - Written by the Sidebar component specifically for the extension
   - Starts with `eyJ` (JWT prefix)

2. **Supabase auth token:** Any `localStorage` key containing `auth-token`
   - Pattern: `sb-{project-ref}-auth-token`
   - Parses JSON, extracts `access_token`
   - Fallback: treats raw string as token if it starts with `eyJ`

3. **Storage event listener:** Watches for `schoolpilot_ext_token` being written
   - Catches the case where the Sidebar component writes the token after page load

### Timing
Because Next.js hydration can delay `localStorage` writes:
- Runs immediately on `document_idle`
- Retries at 1s, 2.5s, 5s, 8s intervals
- MutationObserver watches DOM changes for 15 seconds (catches SPA navigation)
- Once token found, sets `found = true` and stops retrying

---

## Known Limitations & Edge Cases

### 1. Teamie SPA Routing
Teamie uses AngularJS with hash-based routing (`/#/`). The DOM may not be fully rendered when the content script runs. The current scrapers run synchronously — they read whatever's in the DOM at injection time. If Angular hasn't rendered yet, elements will be missing.

**Mitigation:** The auto-sync only targets already-open Teamie tabs (which should be fully loaded). The manual sync from popup is triggered by the user who can see the page is loaded.

### 2. Date Inheritance Bugs
If Teamie changes its DOM structure to put date blocks inside events rather than as siblings, the date inheritance logic will break. The current logic assumes date blocks appear as the first child of `.event-wrapper` elements, with subsequent events inheriting.

### 3. Google Drive Permissions
The extraction endpoint tries to download Google Drive files via public export URLs. This only works for files with "Anyone with the link" sharing. School-restricted files will return permission errors. There's no OAuth flow to access restricted files.

### 4. PDF Content is a Placeholder
The `extractGoogleDriveContent` function can fetch text files and Google Docs, but actual PDF parsing returns `[PDF content from filename]`. A proper PDF extraction service (like pdf.js, Apache Tika, or a cloud service) is needed.

### 5. YouTube Transcripts Not Available
The YouTube extraction only gets video metadata (title, author) from the oEmbed API. Actual transcript extraction would require the YouTube Data API v3 or a transcript scraping service.

### 6. Content Cap at 10K Characters
`extractStructuredText()` caps output at 10,000 characters. Long documents (textbooks, multi-page assignments) will be truncated. This could cause the AI tutor to miss content at the end of long documents.

### 7. Token Expiry
The Supabase JWT stored in `chrome.storage.local` expires (typically 1 hour). If the user hasn't visited the web app recently, the auto-sync will get 401 errors. The extension handles this by showing "Session expired" but doesn't auto-refresh the token.

### 8. No Cross-Page Navigation
`content-deep.js` only scrapes the currently visible page. It cannot follow links to lesson sub-pages or click through to assignment details. A full course scrape would require a multi-page injection strategy (inject into each lesson page in sequence).

### 9. Newsfeed Pagination
The newsfeed scraping only gets posts currently rendered in the DOM. Teamie likely paginates or lazy-loads older posts. The scraper doesn't scroll down or trigger pagination.

---

## Supabase Tables Reference

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `scraped_assignments` | Raw dashboard scrape dumps | `user_id`, `assignments` (JSON), `scraped_at` |
| `courses` | User's enrolled courses | `user_id`, `name`, `categories` (JSON), `policies` (JSON) |
| `course_materials` | Deep-scraped course content | `user_id`, `course_id`, `course_name`, `units` (JSON), `lessons` (JSON), `resources` (JSON), `assignments` (JSON), `extracted_content` (JSON) |
| `extracted_documents` | Text extracted from resources | `material_id`, `source_type`, `source_id`, `extracted_text`, `title` |
| `grades` | Student grade entries | `user_id`, `course_id`, `category`, `name`, `score`, `max_score` |
| `plans` | Generated AI plans | `user_id`, `assignments` (JSON), `ai_response`, `emailed` |

### User Metadata (Supabase Auth)
Stored via `supabase.auth.updateUser({ data: {...} })`:
- `target_grades`: `Record<string, number>` — e.g. `{ "AP Physics C": 90, "English 11": 85 }`
- `onboarding_completed`: `boolean`
- `full_name`: `string` (from OAuth provider)

---

## Development Quick Reference

### Running the Extension Locally
1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select the `extension/` folder
4. Navigate to `lms.asl.org/dash/#/`
5. Click the SchoolPilot extension icon → "Sync Assignments"

### Testing Scrapers in DevTools
You can paste `content.js` or `content-deep.js` directly into the browser console while on the appropriate Teamie page to test extraction:

```javascript
// Paste the entire content.js or content-deep.js IIFE
// The return value will be the scraped data object
```

### Debugging Sync Issues
1. Check `chrome.storage.local` for `webAuthToken`:
   ```javascript
   chrome.storage.local.get(['webAuthToken'], console.log)
   ```
2. Check last sync data:
   ```javascript
   chrome.storage.local.get(['lastSyncTime', 'lastSyncStats'], console.log)
   ```
3. Check the Supabase dashboard for `scraped_assignments` table entries
