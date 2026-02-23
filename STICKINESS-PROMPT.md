# SchoolPilot Stickiness Features — Claude Code Prompt

## Context

SchoolPilot is a student productivity app. We need to add features that create daily habits and make students dependent on the app. The goal: students check SchoolPilot before they check Instagram.

## Features to Build

### 1. Daily Push Notification (Same Time Every Day)

**What:** Send a personalized push notification every morning at the user's chosen time (default 7:30 AM) showing their #1 priority task.

**Notification content:**
```
Standard:
"🛡️ Your focus today: [Task Title]. Your [Course] grade depends on it."

If grade at risk:
"⚠️ [Course] is at [X]%. Complete [Task Title] to protect your grade."

If streak active:
"🔥 Day [N] — Keep your streak alive. Focus: [Task Title]"
```

**Implementation:**

1. **User settings:** Add to settings page:
   - Toggle: "Daily reminder" (on/off)
   - Time picker: "Remind me at" (default 7:30 AM)
   - Store in user metadata: `notification_time`, `notifications_enabled`

2. **Backend cron job:** 
   - Create `/api/cron/daily-notifications` endpoint
   - Runs every 15 minutes, checks for users whose notification time has passed
   - Sends push notification via web push or email fallback
   - Track last notification sent to avoid duplicates

3. **Notification service:**
   - Set up web push notifications (use `web-push` npm package)
   - Store push subscription in Supabase `push_subscriptions` table
   - Fallback to email if no push subscription

**Database schema:**
```sql
-- Add to users or create new table
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  created_at timestamp with time zone default now()
);

-- Add to user metadata or profiles
-- notification_time: string (e.g., "07:30")
-- notifications_enabled: boolean
```

---

### 2. Streak Counter + Streak Freeze

**What:** Track consecutive days of completing the daily focus task. Show prominently. Allow one "freeze" per week to protect streak.

**UI on Today page:**
```
┌─────────────────────────────┐
│  🔥 12 day streak           │
│  Complete today's focus     │
│  to keep it alive           │
│                             │
│  [❄️ 1 freeze available]    │
└─────────────────────────────┘
```

**Streak rules:**
- Streak increments when user marks their #1 priority task as done
- Streak resets if no task completed by 11:59 PM local time
- One "freeze" per week — automatically used if they miss a day
- Freeze regenerates every Monday
- Weekend mode (optional): Streaks don't break on Sat/Sun

**Implementation:**

1. **Database schema:**
```sql
create table user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer default 0,
  longest_streak integer default 0,
  last_completed_date date,
  freeze_available boolean default true,
  freeze_used_date date,
  weekend_mode boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
```

2. **Streak logic (backend function or edge function):**
```typescript
async function updateStreak(userId: string, completedTask: boolean) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = // calculate yesterday's date
  
  const streak = await getStreak(userId);
  
  if (completedTask) {
    if (streak.last_completed_date === yesterday || streak.last_completed_date === today) {
      // Continue streak
      streak.current_streak += 1;
    } else if (streak.freeze_available && daysSince(streak.last_completed_date) <= 2) {
      // Use freeze, continue streak
      streak.freeze_available = false;
      streak.freeze_used_date = yesterday;
      streak.current_streak += 1;
    } else {
      // Streak broken, restart
      streak.current_streak = 1;
    }
    
    streak.last_completed_date = today;
    streak.longest_streak = Math.max(streak.longest_streak, streak.current_streak);
  }
  
  await saveStreak(userId, streak);
  return streak;
}
```

3. **Freeze regeneration:** Cron job runs Monday 12:00 AM, sets `freeze_available = true` for all users where `freeze_used_date` is not this week.

4. **UI components:**
   - `<StreakBadge />` — shows current streak with fire emoji
   - `<FreezeIndicator />` — shows if freeze is available
   - Streak milestone celebrations (7, 30, 100 days) with confetti

5. **Notifications:**
   - "🔥 You're on a 7-day streak! Don't break it."
   - "⚠️ Your streak is at risk! Complete your focus task before midnight."
   - "❄️ Freeze used! Your 15-day streak is safe."

---

### 3. Grade Logging After Tests

**What:** Prompt users to log their grade after completing an assignment/test. Build their grade history.

**Trigger:** After marking a task as done, if task type is "Assessment", "Test", "Quiz", or "Assignment", show a modal:

```
┌─────────────────────────────────────┐
│  How'd you do on [Task Title]?      │
│                                     │
│  Course: [Course Name]              │
│                                     │
│  Score: [___] / [___]               │
│         (your score) (max score)    │
│                                     │
│  [Save]  [Skip — I'll add later]    │
└─────────────────────────────────────┘
```

**Implementation:**

1. **Database schema:**
```sql
-- Extend existing grades table or create
create table grade_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  assignment_title text not null,
  score decimal not null,
  max_score decimal not null default 100,
  percentage decimal generated always as (score / max_score * 100) stored,
  assignment_type text, -- 'test', 'quiz', 'assignment', 'homework'
  completed_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

create index idx_grade_entries_user on grade_entries(user_id);
create index idx_grade_entries_course on grade_entries(course_id);
```

2. **UI flow:**
   - User marks task done → check if task.type contains grade-worthy keywords
   - If yes, show `<GradeLogModal />` 
   - Modal has: score input, max score input (default 100), save/skip buttons
   - On save: insert into `grade_entries`, update course grade calculation
   - On skip: dismiss, maybe remind later

3. **Grade history view:** (in Grades page)
```
┌─────────────────────────────────────┐
│  📊 Calculus Grade History          │
│                                     │
│  Current: 87.3%                     │
│                                     │
│  Recent:                            │
│  • Quiz 4: 92% ↑                    │
│  • Test 2: 84%                      │
│  • Quiz 3: 88%                      │
│  • Homework 6: 95% ↑                │
│                                     │
│  [View full history]                │
└─────────────────────────────────────┘
```

4. **Insights from logged grades:**
   - "Your quiz average (91%) is higher than your test average (82%). Focus on test prep."
   - "You've improved 5% in Physics over the last month."
   - Graph showing grade trend over time

---

### 4. Weekly Recap with Surprise Stats

**What:** Every Sunday evening, show a recap of the week with unexpected/delightful insights.

**Trigger:** 
- Push notification Sunday 6 PM: "Your week in review is ready 📊"
- Modal/page shows when they open the app after Sunday 6 PM (until they dismiss)

**Recap content:**
```
┌─────────────────────────────────────────┐
│  📊 Your Week: Feb 17-23                │
│                                         │
│  ✅ Tasks completed: 12                 │
│  🔥 Streak: 18 days                     │
│  📈 Grades logged: 4                    │
│                                         │
│  💡 SURPRISE INSIGHT:                   │
│  "You complete tasks 40% faster on      │
│   Tuesdays. We'll prioritize hard       │
│   tasks for next Tuesday."              │
│                                         │
│  🏆 THIS WEEK'S WIN:                    │
│  "Your Physics grade went from          │
│   78% → 82%. Nice work."                │
│                                         │
│  📅 NEXT WEEK PREVIEW:                  │
│  "3 tests coming up. Your busiest       │
│   day is Thursday."                     │
│                                         │
│  [Share my week] [Dismiss]              │
└─────────────────────────────────────────┘
```

**Implementation:**

1. **Data collection:** Track throughout the week:
   - Tasks completed (count, timestamps)
   - Grades logged
   - Time spent in app (optional)
   - Days of week tasks were completed
   - Grade changes

2. **Insight generator:** Create pool of insight templates, pick one that applies:
```typescript
const insights = [
  {
    condition: (data) => data.tuesdayCompletionRate > data.avgCompletionRate * 1.3,
    message: "You complete tasks {percent}% faster on Tuesdays. We'll prioritize hard tasks for next Tuesday."
  },
  {
    condition: (data) => data.morningTasks > data.eveningTasks * 1.5,
    message: "You're a morning person — {percent}% of your tasks are done before noon."
  },
  {
    condition: (data) => data.streakDays >= 7,
    message: "You've built a real habit. {days} days strong. Top 15% of students."
  },
  {
    condition: (data) => data.gradeImprovement > 0,
    message: "Your overall GPA trend is UP. Keep it going."
  },
  // Add 20+ more insights
];

function generateInsight(userData) {
  const applicable = insights.filter(i => i.condition(userData));
  return applicable[Math.floor(Math.random() * applicable.length)];
}
```

3. **Backend:**
   - Cron job runs Sunday 5:30 PM
   - Generates recap for each user, stores in `weekly_recaps` table
   - Sends push notification at 6 PM

4. **Database:**
```sql
create table weekly_recaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  tasks_completed integer,
  grades_logged integer,
  streak_days integer,
  insight_text text,
  win_text text,
  preview_text text,
  dismissed boolean default false,
  created_at timestamp with time zone default now()
);
```

5. **UI:**
   - `<WeeklyRecapModal />` — shows on app open if new recap exists and not dismissed
   - Share button generates image (like the shareable grade card from viral playbook)
   - Dismiss saves `dismissed = true`

---

### 5. Accountability Partner (Study Buddy)

**What:** Connect with a friend. See each other's streaks and task completion. Get notified when they complete their focus task.

**How it works:**

1. **Invite flow:**
```
Settings → Accountability Partner

"Study better together. Connect with a friend 
and keep each other accountable."

[Invite a friend]
  ↓
Generates unique invite link:
schoolpilot.co/buddy/abc123

When friend clicks → they sign up/login → partnership created
```

2. **Partner dashboard (widget on Today page):**
```
┌─────────────────────────────────────┐
│  👥 Study Buddy: Sarah              │
│                                     │
│  Sarah's streak: 🔥 23 days         │
│  Your streak: 🔥 18 days            │
│                                     │
│  Today:                             │
│  ✅ Sarah completed her focus task  │
│  ⏳ You haven't yet                 │
│                                     │
│  [Send nudge 👋]                    │
└─────────────────────────────────────┘
```

3. **Notifications:**
   - "Sarah just completed her focus task. Your turn! 🔥"
   - "You're 5 days behind Sarah's streak. Catch up!"
   - "Sarah sent you a nudge 👋"

4. **Implementation:**

**Database schema:**
```sql
create table accountability_partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  partner_id uuid references auth.users(id) on delete cascade,
  invite_code text unique,
  status text default 'pending', -- 'pending', 'active', 'declined'
  created_at timestamp with time zone default now(),
  
  -- Ensure no duplicate partnerships
  unique(user_id, partner_id)
);

create table nudges (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid references auth.users(id) on delete cascade,
  to_user_id uuid references auth.users(id) on delete cascade,
  sent_at timestamp with time zone default now()
);
```

**API endpoints:**
```
POST /api/buddy/invite
  → Creates invite code, returns link

GET /api/buddy/accept?code=abc123
  → Accepts invite, creates partnership

GET /api/buddy/status
  → Returns partner info, streaks, today's completion status

POST /api/buddy/nudge
  → Sends push notification to partner
```

**Backend logic:**
- When user completes focus task, check if they have a partner
- If yes, send push notification to partner: "[Name] just completed their focus task!"
- Rate limit nudges: max 3 per day

**UI components:**
- `<BuddyWidget />` — shows on Today page if partnership exists
- `<BuddyInvite />` — invite flow in Settings
- `<NudgeButton />` — sends nudge, shows cooldown if recently sent

---

## File Structure for New Features

```
web/
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   ├── daily-notifications/route.ts  # NEW
│   │   │   ├── weekly-recap/route.ts         # NEW
│   │   │   └── streak-check/route.ts         # NEW
│   │   ├── buddy/
│   │   │   ├── invite/route.ts               # NEW
│   │   │   ├── accept/route.ts               # NEW
│   │   │   ├── status/route.ts               # NEW
│   │   │   └── nudge/route.ts                # NEW
│   │   ├── streak/route.ts                   # NEW
│   │   ├── grades/log/route.ts               # NEW
│   │   └── recap/route.ts                    # NEW
│   └── (dashboard)/
│       ├── today/page.tsx                    # MODIFY - add streak, buddy widget
│       ├── grades/page.tsx                   # MODIFY - add grade history
│       └── settings/page.tsx                 # MODIFY - add notification settings, buddy invite
├── components/
│   ├── StreakBadge.tsx                       # NEW
│   ├── GradeLogModal.tsx                     # NEW
│   ├── WeeklyRecapModal.tsx                  # NEW
│   ├── BuddyWidget.tsx                       # NEW
│   └── BuddyInvite.tsx                       # NEW
├── lib/
│   ├── streak.ts                             # NEW - streak logic
│   ├── notifications.ts                      # NEW - push notification helpers
│   └── insights.ts                           # NEW - weekly insight generator
```

---

## Database Migrations Summary

Run these migrations in order:

```sql
-- 1. Push subscriptions for notifications
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  created_at timestamp with time zone default now()
);

-- 2. User streaks
create table user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer default 0,
  longest_streak integer default 0,
  last_completed_date date,
  freeze_available boolean default true,
  freeze_used_date date,
  weekend_mode boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 3. Grade entries (detailed logging)
create table grade_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  assignment_title text not null,
  score decimal not null,
  max_score decimal not null default 100,
  percentage decimal generated always as (score / max_score * 100) stored,
  assignment_type text,
  completed_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

-- 4. Weekly recaps
create table weekly_recaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  tasks_completed integer,
  grades_logged integer,
  streak_days integer,
  insight_text text,
  win_text text,
  preview_text text,
  dismissed boolean default false,
  created_at timestamp with time zone default now()
);

-- 5. Accountability partners
create table accountability_partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  partner_id uuid references auth.users(id) on delete cascade,
  invite_code text unique,
  status text default 'pending',
  created_at timestamp with time zone default now(),
  unique(user_id, partner_id)
);

-- 6. Nudges
create table nudges (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid references auth.users(id) on delete cascade,
  to_user_id uuid references auth.users(id) on delete cascade,
  sent_at timestamp with time zone default now()
);
```

---

## Priority Order

Build in this order:

1. **Streaks** (highest impact, lowest effort) — users see this immediately
2. **Grade logging modal** — captures data, increases investment
3. **Daily notifications** — brings them back every day
4. **Weekly recap** — delightful surprise, shareable
5. **Accountability partner** — highest effort but massive retention boost

---

## Definition of Done

- [ ] Streak counter visible on Today page
- [ ] Streak increments when focus task completed
- [ ] Freeze available and auto-applies
- [ ] Grade log modal appears after completing assessments
- [ ] Grade history visible in Grades page
- [ ] Daily notification sent at user's chosen time
- [ ] Weekly recap generated and shown Sunday evening
- [ ] Accountability partner invite flow works
- [ ] Partner widget shows on Today page
- [ ] Nudge sends push notification to partner

---

## Don't Touch

- Landing page
- Auth flow  
- Chrome extension
- Core sync functionality
- Existing API routes that work
