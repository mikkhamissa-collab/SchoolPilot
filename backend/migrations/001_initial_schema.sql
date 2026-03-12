-- SchoolPilot Database Schema
-- Run this against your Supabase project's SQL editor.

-- ════════════════════════════════════════════════════════════════════
-- 1. student_profiles
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  school_name text,
  grade_level text,
  timezone text default 'America/New_York',
  goals jsonb default '[]'::jsonb,
  patterns jsonb default '{}'::jsonb,
  personality_preset text default 'coach',
  daily_briefing_enabled boolean default false,
  briefing_time text default '07:00',
  email_briefings boolean default false,
  onboarding_complete boolean default false,
  onboarding_step text default 'welcome',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.student_profiles enable row level security;
create policy "Users can read own profile"   on public.student_profiles for select using (auth.uid() = user_id);
create policy "Users can insert own profile" on public.student_profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile" on public.student_profiles for update using (auth.uid() = user_id);
create policy "Service role full access to student_profiles" on public.student_profiles for all using (auth.role() = 'service_role');

-- ════════════════════════════════════════════════════════════════════
-- 2. class_context
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.class_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_name text not null,
  teacher_name text,
  teacher_style text,
  difficulty_rating text,
  student_goal text,
  weak_areas jsonb default '[]'::jsonb,
  strong_areas jsonb default '[]'::jsonb,
  notes jsonb default '[]'::jsonb,
  period text,
  room text,
  current_grade text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, class_name)
);

alter table public.class_context enable row level security;
create policy "Users can read own classes"   on public.class_context for select using (auth.uid() = user_id);
create policy "Users can insert own classes" on public.class_context for insert with check (auth.uid() = user_id);
create policy "Users can update own classes" on public.class_context for update using (auth.uid() = user_id);
create policy "Users can delete own classes" on public.class_context for delete using (auth.uid() = user_id);
create policy "Service role full access to class_context" on public.class_context for all using (auth.role() = 'service_role');

-- ════════════════════════════════════════════════════════════════════
-- 3. lms_credentials
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.lms_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lms_type text not null,
  lms_url text not null,
  encrypted_username text not null,
  encrypted_password text not null,
  sync_enabled boolean default true,
  last_login_success boolean,
  last_login_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  unique(user_id, lms_type)
);

alter table public.lms_credentials enable row level security;
create policy "Users can read own credentials"   on public.lms_credentials for select using (auth.uid() = user_id);
create policy "Users can insert own credentials" on public.lms_credentials for insert with check (auth.uid() = user_id);
create policy "Users can update own credentials" on public.lms_credentials for update using (auth.uid() = user_id);
create policy "Users can delete own credentials" on public.lms_credentials for delete using (auth.uid() = user_id);
create policy "Service role full access to lms_credentials" on public.lms_credentials for all using (auth.role() = 'service_role');

-- ════════════════════════════════════════════════════════════════════
-- 4. lms_assignments
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.lms_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lms_id text not null,
  title text not null,
  description text,
  course_name text,
  assignment_type text,
  due_date timestamptz,
  points_possible float,
  is_submitted boolean default false,
  is_graded boolean default false,
  points_earned float,
  lms_url text,
  job_id uuid,
  extracted_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(user_id, lms_id)
);

create index if not exists idx_lms_assignments_user_due on public.lms_assignments(user_id, due_date);

alter table public.lms_assignments enable row level security;
create policy "Users can read own assignments"   on public.lms_assignments for select using (auth.uid() = user_id);
create policy "Users can insert own assignments" on public.lms_assignments for insert with check (auth.uid() = user_id);
create policy "Users can update own assignments" on public.lms_assignments for update using (auth.uid() = user_id);
create policy "Service role full access to lms_assignments" on public.lms_assignments for all using (auth.role() = 'service_role');

-- ════════════════════════════════════════════════════════════════════
-- 5. lms_grades
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.lms_grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_name text not null,
  overall_grade text,
  overall_percentage float,
  category_breakdown jsonb default '{}'::jsonb,
  job_id uuid,
  extracted_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(user_id, course_name)
);

alter table public.lms_grades enable row level security;
create policy "Users can read own grades"   on public.lms_grades for select using (auth.uid() = user_id);
create policy "Users can insert own grades" on public.lms_grades for insert with check (auth.uid() = user_id);
create policy "Users can update own grades" on public.lms_grades for update using (auth.uid() = user_id);
create policy "Service role full access to lms_grades" on public.lms_grades for all using (auth.role() = 'service_role');

-- ════════════════════════════════════════════════════════════════════
-- 6. conversations
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text default 'New conversation',
  message_count integer default 0,
  last_message_at timestamptz default now(),
  summary text,
  summary_updated_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_conversations_user on public.conversations(user_id, last_message_at desc);

alter table public.conversations enable row level security;
create policy "Users can read own conversations"   on public.conversations for select using (auth.uid() = user_id);
create policy "Users can insert own conversations" on public.conversations for insert with check (auth.uid() = user_id);
create policy "Users can update own conversations" on public.conversations for update using (auth.uid() = user_id);
create policy "Users can delete own conversations" on public.conversations for delete using (auth.uid() = user_id);
create policy "Service role full access to conversations" on public.conversations for all using (auth.role() = 'service_role');

-- ════════════════════════════════════════════════════════════════════
-- 7. messages
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  rich_content jsonb,
  actions_taken jsonb,
  model_used text,
  tokens_used integer,
  created_at timestamptz default now()
);

create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);

alter table public.messages enable row level security;
create policy "Users can read own messages"   on public.messages for select using (auth.uid() = user_id);
create policy "Users can insert own messages" on public.messages for insert with check (auth.uid() = user_id);
create policy "Service role full access to messages" on public.messages for all using (auth.role() = 'service_role');

-- ════════════════════════════════════════════════════════════════════
-- 8. agent_jobs
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null,
  status text not null default 'pending',
  pages_visited integer default 0,
  data_extracted jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_agent_jobs_user on public.agent_jobs(user_id, created_at desc);

alter table public.agent_jobs enable row level security;
create policy "Users can read own jobs"   on public.agent_jobs for select using (auth.uid() = user_id);
create policy "Users can insert own jobs" on public.agent_jobs for insert with check (auth.uid() = user_id);
create policy "Users can update own jobs" on public.agent_jobs for update using (auth.uid() = user_id);
create policy "Service role full access to agent_jobs" on public.agent_jobs for all using (auth.role() = 'service_role');

-- ════════════════════════════════════════════════════════════════════
-- 9. reminders
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  remind_at timestamptz not null,
  assignment_id uuid,
  status text default 'pending',
  sent boolean default false,
  dismissed boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_reminders_due on public.reminders(sent, dismissed, remind_at);

alter table public.reminders enable row level security;
create policy "Users can read own reminders"   on public.reminders for select using (auth.uid() = user_id);
create policy "Users can insert own reminders" on public.reminders for insert with check (auth.uid() = user_id);
create policy "Users can update own reminders" on public.reminders for update using (auth.uid() = user_id);
create policy "Users can delete own reminders" on public.reminders for delete using (auth.uid() = user_id);
create policy "Service role full access to reminders" on public.reminders for all using (auth.role() = 'service_role');

-- ════════════════════════════════════════════════════════════════════
-- 10. lms_announcements
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.lms_announcements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lms_id text not null,
  title text not null,
  course_name text,
  content text,
  posted_date timestamptz,
  job_id uuid,
  extracted_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(user_id, lms_id)
);

alter table public.lms_announcements enable row level security;
create policy "Users can read own announcements"   on public.lms_announcements for select using (auth.uid() = user_id);
create policy "Users can insert own announcements" on public.lms_announcements for insert with check (auth.uid() = user_id);
create policy "Users can update own announcements" on public.lms_announcements for update using (auth.uid() = user_id);
create policy "Service role full access to lms_announcements" on public.lms_announcements for all using (auth.role() = 'service_role');

-- ════════════════════════════════════════════════════════════════════
-- 11. lms_calendar_events
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.lms_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lms_id text not null,
  title text not null,
  course_name text,
  event_date timestamptz,
  details text,
  job_id uuid,
  extracted_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(user_id, lms_id)
);

alter table public.lms_calendar_events enable row level security;
create policy "Users can read own calendar events"   on public.lms_calendar_events for select using (auth.uid() = user_id);
create policy "Users can insert own calendar events" on public.lms_calendar_events for insert with check (auth.uid() = user_id);
create policy "Users can update own calendar events" on public.lms_calendar_events for update using (auth.uid() = user_id);
create policy "Service role full access to lms_calendar_events" on public.lms_calendar_events for all using (auth.role() = 'service_role');
