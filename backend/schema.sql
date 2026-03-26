-- SchoolPilot Agent — New tables for the agent system
-- Run AFTER the existing supabase-schema.sql

-- =============================================================================
-- STUDENT PROFILES — Deep context about each student
-- =============================================================================

CREATE TABLE student_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Basic info
  display_name TEXT,
  school_name TEXT,
  grade_level TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  -- Goals & preferences
  goals JSONB DEFAULT '[]',              -- ["Get into CS program", "Maintain 3.8+ GPA"]
  patterns JSONB DEFAULT '{}',           -- {"works_best": "morning", "struggles_with": "essays"}
  personality_preset TEXT DEFAULT 'coach', -- 'coach', 'friend', 'mentor', 'drill_sergeant'
  -- Onboarding
  onboarding_complete BOOLEAN DEFAULT FALSE,
  onboarding_step TEXT DEFAULT 'welcome',
  -- Settings
  daily_briefing_enabled BOOLEAN DEFAULT TRUE,
  briefing_time TIME DEFAULT '07:00',
  email_briefings BOOLEAN DEFAULT TRUE,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- CLASS CONTEXT — Per-class knowledge the agent builds over time
-- =============================================================================

CREATE TABLE class_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- NOTE: course_id FK to courses table was removed — that table doesn't
  -- exist and class_context is the canonical course record.
  -- Class info
  class_name TEXT NOT NULL,
  teacher_name TEXT,
  period TEXT,
  room TEXT,
  -- Grading info (agent-discovered or student-provided)
  grading_breakdown JSONB DEFAULT '{}',  -- {"Tests": 0.40, "Labs": 0.30, ...}
  teacher_style TEXT,                    -- "Strict on deadlines, gives partial credit"
  -- Student's relationship with this class
  current_grade TEXT,
  difficulty_rating TEXT,                -- 'easy', 'medium', 'hard', 'killer'
  student_goal TEXT,                     -- "Get to A- by end of semester"
  weak_areas JSONB DEFAULT '[]',        -- ["circuits", "magnetism"]
  strong_areas JSONB DEFAULT '[]',      -- ["kinematics", "energy"]
  -- Agent-accumulated notes
  notes JSONB DEFAULT '[]',             -- [{"date": "2026-02-20", "note": "Test format changing"}]
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, class_name)
);

-- =============================================================================
-- CONVERSATIONS — Full chat history with summarization
-- =============================================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT,                            -- Auto-generated conversation title
  -- Summary of older messages (for context compression)
  summary TEXT,
  summary_updated_at TIMESTAMPTZ,
  -- Metadata
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  -- Rich content: cards, charts, interactive elements rendered by frontend
  rich_content JSONB,                    -- [{"type": "grade_card", "data": {...}}, ...]
  -- Agent actions taken during this message
  actions_taken JSONB DEFAULT '[]',      -- [{"type": "set_reminder", "details": {...}}]
  -- For streaming: marks if message is complete
  is_complete BOOLEAN DEFAULT TRUE,
  -- Metadata
  model_used TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- LMS CREDENTIALS — Encrypted storage for server-side browser automation
-- =============================================================================

CREATE TABLE lms_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lms_type TEXT NOT NULL DEFAULT 'teamie', -- Only 'teamie' is supported currently
  lms_url TEXT NOT NULL,                 -- 'https://lms.asl.org'
  -- Encrypted credentials (AES-256 via Fernet)
  encrypted_username TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  encrypted_cookies TEXT,              -- Saved session cookies (cookie-first auth strategy)
  -- Session state
  last_login_success BOOLEAN,
  last_login_at TIMESTAMPTZ,
  last_error TEXT,
  -- Sync config
  sync_enabled BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, lms_type)
);

-- =============================================================================
-- AGENT JOBS — Track browser agent sync tasks
-- =============================================================================

CREATE TABLE agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- Job info
  job_type TEXT NOT NULL CHECK (job_type IN ('full_sync', 'partial_sync', 'grade_check', 'assignment_check')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  -- Results
  pages_visited INTEGER DEFAULT 0,
  data_extracted JSONB DEFAULT '{}',
  error_message TEXT,
  -- Screenshots for debugging
  screenshots JSONB DEFAULT '[]',        -- [{"url": "...", "step": "login", "storage_path": "..."}]
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- AGENT EXTRACTED DATA — Structured data from LMS exploration
-- =============================================================================

CREATE TABLE lms_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- Assignment info
  title TEXT NOT NULL,
  description TEXT,
  course_name TEXT,
  assignment_type TEXT,                  -- 'homework', 'test', 'quiz', 'lab', 'essay', 'project'
  due_date TIMESTAMPTZ,
  -- Grading
  points_possible NUMERIC,
  points_earned NUMERIC,
  grade_weight TEXT,                     -- Which category this falls into
  is_graded BOOLEAN DEFAULT FALSE,
  -- Status
  is_submitted BOOLEAN DEFAULT FALSE,
  is_late BOOLEAN DEFAULT FALSE,
  -- Source
  lms_url TEXT,                          -- Direct link to assignment on LMS
  lms_id TEXT,                           -- LMS-specific identifier for dedup
  -- Agent metadata
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  job_id UUID REFERENCES agent_jobs(id) ON DELETE SET NULL,
  UNIQUE(user_id, lms_id)
);

CREATE TABLE lms_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  course_name TEXT NOT NULL,
  -- Grade info
  overall_grade TEXT,                    -- "87%" or "B+"
  overall_percentage NUMERIC,
  category_breakdown JSONB DEFAULT '{}', -- {"Tests": {"average": 85, "weight": 0.40}, ...}
  -- Change tracking
  previous_grade TEXT,
  grade_changed_at TIMESTAMPTZ,
  -- Source
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  job_id UUID REFERENCES agent_jobs(id) ON DELETE SET NULL,
  UNIQUE(user_id, course_name)
);

-- =============================================================================
-- REMINDERS & SCHEDULED ACTIONS
-- =============================================================================

CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- Reminder info
  title TEXT NOT NULL,
  description TEXT,
  remind_at TIMESTAMPTZ NOT NULL,
  -- Link to relevant data
  assignment_id UUID REFERENCES lms_assignments(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  -- Status
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- DOCUMENT UPLOADS — Student-uploaded files for analysis
-- NOTE: Currently unused (v3 does not implement file uploads yet).
-- Kept for forward-compatibility; safe to DROP if not needed.
-- =============================================================================

CREATE TABLE document_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- File info
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,            -- Path in Supabase Storage
  -- Extracted content
  extracted_text TEXT,
  extraction_status TEXT DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'complete', 'failed')),
  -- Context
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  class_context_id UUID REFERENCES class_context(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- CROSS-STUDENT ANONYMIZED PATTERNS
-- NOTE: Currently unused in v3 (PatternDetector exists but is never called).
-- Kept for forward-compatibility; safe to DROP if not needed.
-- =============================================================================

CREATE TABLE anonymized_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Pattern info (no user identifiers)
  school_name TEXT,
  class_name TEXT,
  teacher_name TEXT,
  -- Aggregated insights
  pattern_type TEXT NOT NULL,            -- 'grading_style', 'common_struggle', 'test_format'
  pattern_data JSONB NOT NULL,           -- {"observation": "Tests harder than homework", "confidence": 0.85}
  sample_size INTEGER DEFAULT 1,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- GOOGLE CALENDAR TOKENS
-- NOTE: Currently unused (v3 does not implement Google Calendar integration).
-- Kept for forward-compatibility; safe to DROP if not needed.
-- =============================================================================

CREATE TABLE calendar_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_token JSONB NOT NULL,        -- Encrypted OAuth token
  calendar_id TEXT DEFAULT 'primary',
  sync_enabled BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- STUDY BUDDY PAIRS
-- =============================================================================

CREATE TABLE buddy_pairs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_a UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    user_b UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT CHECK (status IN ('pending', 'active', 'ended')) DEFAULT 'pending',
    streak_count INTEGER DEFAULT 0,
    last_activity_a TIMESTAMPTZ,
    last_activity_b TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- DAILY STREAKS
-- =============================================================================

CREATE TABLE streaks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_active_date DATE,
    total_active_days INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

-- =============================================================================
-- STUDY SESSIONS LOG
-- =============================================================================

CREATE TABLE study_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    focus_type TEXT,
    assignment_id UUID REFERENCES lms_assignments(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_class_context_user ON class_context(user_id);
CREATE INDEX idx_conversations_user ON conversations(user_id, last_message_at DESC);
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_user ON messages(user_id, created_at DESC);
CREATE INDEX idx_lms_creds_user ON lms_credentials(user_id);
CREATE INDEX idx_agent_jobs_user ON agent_jobs(user_id, created_at DESC);
CREATE INDEX idx_agent_jobs_status ON agent_jobs(status, created_at DESC);
CREATE INDEX idx_lms_assignments_user ON lms_assignments(user_id, due_date);
CREATE INDEX idx_lms_assignments_course ON lms_assignments(user_id, course_name);
CREATE INDEX idx_lms_assignments_due ON lms_assignments(user_id, due_date) WHERE due_date > NOW();
CREATE INDEX idx_lms_grades_user ON lms_grades(user_id);
CREATE INDEX idx_reminders_user ON reminders(user_id, remind_at) WHERE NOT sent;
CREATE INDEX idx_doc_uploads_user ON document_uploads(user_id, created_at DESC);
CREATE INDEX idx_anon_patterns_school ON anonymized_patterns(school_name, class_name);
CREATE INDEX idx_calendar_tokens_sync ON calendar_tokens(sync_enabled) WHERE sync_enabled = TRUE;
CREATE INDEX idx_buddy_pairs_users ON buddy_pairs(user_a, user_b);
CREATE INDEX idx_streaks_user ON streaks(user_id);
CREATE INDEX idx_study_sessions_user ON study_sessions(user_id, completed_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE anonymized_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_profile" ON student_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_class_context" ON class_context FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_conversations" ON conversations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_messages" ON messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_lms_creds" ON lms_credentials FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_agent_jobs" ON agent_jobs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_lms_assignments" ON lms_assignments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_lms_grades" ON lms_grades FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_reminders" ON reminders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_doc_uploads" ON document_uploads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "read_patterns" ON anonymized_patterns FOR SELECT USING (TRUE);
CREATE POLICY "own_calendar" ON calendar_tokens FOR ALL USING (auth.uid() = user_id);

ALTER TABLE buddy_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_buddy_pairs" ON buddy_pairs FOR ALL USING (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "own_streaks" ON streaks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_study_sessions" ON study_sessions FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Targeted user lookup by email (avoids iterating all users)
CREATE OR REPLACE FUNCTION get_user_id_by_email(target_email TEXT)
RETURNS UUID AS $$
    SELECT id FROM auth.users WHERE email = target_email LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Study content cache
CREATE TABLE study_content (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('guide', 'flashcards', 'quiz', 'explain', 'summary')),
    course TEXT NOT NULL,
    topic TEXT NOT NULL,
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days')
);
CREATE INDEX idx_study_content_user ON study_content(user_id, content_type, course, topic);
CREATE INDEX idx_study_content_expiry ON study_content(expires_at) WHERE expires_at < now();
ALTER TABLE study_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own study content" ON study_content FOR ALL USING (auth.uid() = user_id);
