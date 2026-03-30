# Teamie Internal REST API — Reverse-Engineered

> Discovered 2026-03-30 by intercepting network requests from the Teamie SPA at `lms.asl.org`.
> These are internal endpoints used by Teamie's Backbone.js frontend. Not publicly documented.

## Authentication

- **Method:** Session cookies (Drupal `SSESS*` httpOnly cookie)
- **Login:** Google OAuth SSO only (no username/password at ASL)
- **Cookie capture:** Must be done via browser (Playwright) during onboarding
- **Cookie lifetime:** Unknown, but expires after some period of inactivity
- **User ID:** `uid=570` (Mik). Each student has a unique `uid` returned in `/api/profile/{uid}.json`

## Core Endpoints

### 1. User Profile
```
GET /api/profile/{uid}.json
```
Returns user details, settings, and permissions.

**Response keys:** `user`, `home-view`, `user-stats`, `personal`, `calendarx_todo_access`, `manage_parents_access`, `overall_mastery_access`, `cohort_access`, `dash_intro_tour_enabled`, `google_calendar_src`, `t_message_navbar_icon`, `allow_password_change`, `allow_profile_picture_change`, `other-info`, `learning_summary_access`

**Key fields in `user`:**
```json
{
  "name": "mikhaeel_khamissa@asl.org",
  "uid": "570",
  "mail": "mikhaeel_khamissa@asl.org",
  "real_name": "Mikhaeel Khamissa",
  "first_name": "Mikhaeel",
  "last_name": "Khamissa",
  "status": 1,
  "additional_data_fields": {
    "field_asl_veracross_id": { "field_value": "98139" },
    "field_asl_graduation_year": { "field_value": "2026" },
    "field_asl_school_level": { "field_value": "High School" }
  }
}
```

### 2. Classrooms List
```
GET /api/classroom.json
```
Returns ALL classrooms the user is enrolled in. No parameters needed.

**Response:** Array of classroom objects.

**Key fields per classroom:**
```json
{
  "nid": 1137589,         // classroom ID (use in other endpoints)
  "gid": 1580,            // group ID
  "type": 561,
  "name": "AP Statistics P8 DK [25-26]",
  "initials": "APS",
  "status": true,
  "image": { "href": "https://cloud-s3.asl.org/..." },
  "cover_image": { "href": "https://cloud-s3.asl.org/..." },
  "star": { "status": true, "weight": 0 },
  "completion": { "enabled": false }
}
```

**Mik's classrooms (10 total):**
| nid | name |
|---|---|
| 1137425 | Advanced Journalism - S2 P6 LA [25-26] |
| 1137573 | AP Psychology P5 MM [25-26] |
| 1137589 | AP Statistics P8 DK [25-26] |
| 1137709 | Calculus P4 DC [25-26] |
| 1137783 | Contemporary Global History S1 P6 TG [25-26] |
| 1138081 | Global Issues S2 P1 TG [25-26] |
| 1138285 | Literature and Art S1 P1 MM [25-26] |
| 1138293 | Literature and Film S2 P2 HN [25-26] |
| 1138395 | Organic Chemistry S1 P2 DL [25-26] |
| 1138697 | Software Engineering S1 P3 LP [25-26] |

### 3. Gradebook Summary (THE CRITICAL ONE)
```
GET /api/classroom/{nid}/gradebook_summary.json?uid={uid}
```
Returns all scored assessments for a student in a classroom.

**Parameters:**
- `nid` — classroom ID (from `/api/classroom.json`)
- `uid` — student user ID
- `semester_term` — (OPTIONAL) term ID. Defaults to current term if omitted.

**Response:**
```json
{
  "type": "gradebook",
  "scores": [
    {
      "qid": 36898,              // assessment ID
      "map_qid": 36898,
      "title": "AP Stats SA9: FR Confidence interval for p or µ (15 minutes) (Feb 26)",
      "score": 7.5,              // student's score
      "max_score": 12,           // maximum possible
      "assessment_type": "summative",  // "summative" or "formative"
      "type": "offline",         // "offline" or "assignment_clone"
      "is_published": true,
      "grade": "",               // letter grade (often empty)
      "feedback_published": true,
      "score_updated": 1772457331,  // unix timestamp
      "comments": null           // or { count, latest: { user, body } }
    }
  ]
}
```

**Confirmed working for:**
- AP Statistics (nid: 1137589) — 8 scores
- Calculus (nid: 1137709) — 4 scores

### 4. Events / Assignments (Upcoming, Past, Later)
```
GET /api/events.json?mode=category&category={category}&uid={uid}&items_per_page={n}&page={p}
```

**Categories:**
- `upcoming` — assignments due soon
- `past` — overdue/completed assignments
- `later` — future assignments

**Response:**
```json
{
  "count": 44,
  "todo_count": 5,
  "events": [
    {
      "ciid": 71358,
      "title": "CALC: Lesson 6.1",
      "type": "quiz_published",
      "created": 1773995252,
      "url": "https://lms.asl.org/quiz/24837",
      "calendar": {
        "cid": 1760,
        "title": "Calculus P4 DC [25-26] Calendar",
        "color": "#E6C3A6"
      },
      "group": {
        "nid": 1137709,      // classroom ID
        "title": "Calculus P4 DC [25-26]",
        "gid": 1640,
        "image_href": "..."
      },
      "entity": {
        "type": "quizng",
        "id": 24837,
        "bundle": "assignment_clone",
        "late_submission": null,
        "stats": {
          "submission_status": {
            "num_attempts": 0,
            "submission_access": 0,
            "score": null
          }
        }
      }
    }
  ]
}
```

### 5. Fresh Posts Count
```
GET /api/fresh-posts.json
```
Returns unread post counts per classroom (keyed by nid).

```json
{
  "1137425": 0,
  "1137573": 0,
  "1137589": 0,
  "1137709": 0,
  "1137783": 2,
  "1138081": 7
}
```

### 6. Thought/Task Count
```
GET /api/thought_count.json?type=task
GET /api/thought_count.json?type=announcement
```

### 7. Classroom Sections
```
GET /api/classroom/{nid}/sections.json
```
Returns course content sections (units, resources, etc.).

### 8. Thoughts Feed
```
GET /api/thought.json?items_per_page=6&num_comments=2&page=1&sort_comments=1
```
Social feed / announcements.

---

## Sync Strategy (NEW — Replace Playwright Scraping)

### Architecture Change
```
BEFORE (broken):
  Playwright → screenshot → Claude Vision → parse grades
  (slow, fragile, breaks on page changes, can't handle Google SSO)

AFTER (reliable):
  HTTP requests with session cookies → JSON responses → direct DB insert
  (fast, deterministic, no browser needed for syncing)
```

### Implementation Plan

**Onboarding (still needs Playwright — ONE TIME only):**
1. Student clicks "Connect LMS" during onboarding
2. Open Playwright browser, navigate to `lms.asl.org`
3. Student completes Google OAuth login (we show the browser UI)
4. After login, capture ALL cookies (especially `SSESS*` httpOnly cookie)
5. Store cookies encrypted in `lms_credentials` table
6. Close browser. Done. Never need browser again unless cookies expire.

**Daily Sync (pure HTTP — no browser):**
1. Load student's saved cookies from DB
2. `GET /api/classroom.json` → get all classroom nids
3. For each classroom: `GET /api/classroom/{nid}/gradebook_summary.json?uid={uid}` → get grades
4. `GET /api/events.json?mode=category&category=upcoming&uid={uid}&items_per_page=100&page=1` → get assignments
5. `GET /api/events.json?mode=category&category=past&uid={uid}&items_per_page=100&page=1` → get overdue
6. Store everything in Supabase
7. If any request returns 401/403 → cookies expired → email student to re-authenticate

**Benefits:**
- ~2 seconds per student sync instead of ~60 seconds
- No browser instances needed (saves RAM/CPU)
- No Claude Vision API calls (saves money)
- Deterministic — no screenshot parsing errors
- Can handle 100+ students on a single server
- No CAPTCHA issues

### Cookie Expiry Detection
Test cookie validity with a lightweight endpoint:
```
GET /api/fresh-posts.json
```
If it returns JSON → cookies valid. If 401/redirect → expired.

---

## Open Questions
- Exact cookie name for Drupal session (`SSESS*` pattern?)
- Cookie expiry duration (days? weeks?)
- Are there rate limits on the API?
- Does `/api/classroom/{nid}/gradebook.json` return category weights?
- Semester term IDs — do they change? Can we always omit `semester_term`?
