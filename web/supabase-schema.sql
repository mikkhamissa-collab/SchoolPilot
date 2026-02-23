-- SchoolPilot Supabase Schema
-- Run this in Supabase SQL Editor to set up the database

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  categories JSONB NOT NULL DEFAULT '[]',
  policies JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  score NUMERIC NOT NULL,
  max_score NUMERIC NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assignments JSONB NOT NULL,
  ai_response TEXT,
  emailed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assignment JSONB NOT NULL,
  chunks JSONB NOT NULL,
  checked BOOLEAN[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE study_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  unit TEXT,
  guide JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  test_name TEXT NOT NULL,
  test_date DATE NOT NULL,
  plan JSONB NOT NULL,
  checked JSONB DEFAULT '{}',
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scraped_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assignments JSONB NOT NULL,
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deep scraped course materials for AI-powered study guides
CREATE TABLE course_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  course_url TEXT,
  -- Unit information
  units JSONB DEFAULT '[]',
  -- Lessons with links
  lessons JSONB DEFAULT '[]',
  -- All resources (Google Drive, YouTube, PDFs, etc.)
  resources JSONB DEFAULT '[]',
  -- Assignment page content (instructions, due dates)
  assignments JSONB DEFAULT '[]',
  -- Extracted text from PDFs/docs (the gold!)
  extracted_content JSONB DEFAULT '[]',
  -- Metadata
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);

-- Extracted document content for study guides
CREATE TABLE extracted_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES course_materials(id) ON DELETE CASCADE NOT NULL,
  source_type TEXT NOT NULL, -- 'google_drive', 'pdf', 'youtube_transcript'
  source_url TEXT,
  source_id TEXT, -- file ID or video ID
  title TEXT,
  extracted_text TEXT,
  metadata JSONB DEFAULT '{}',
  extracted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_courses_user ON courses(user_id);
CREATE INDEX idx_grades_course ON grades(course_id);
CREATE INDEX idx_plans_user ON plans(user_id, created_at DESC);
CREATE INDEX idx_chunks_user ON chunks(user_id, created_at DESC);
CREATE INDEX idx_sprints_user ON sprints(user_id, completed);
CREATE INDEX idx_scraped_user ON scraped_assignments(user_id, scraped_at DESC);
CREATE INDEX idx_materials_user ON course_materials(user_id);
CREATE INDEX idx_materials_course ON course_materials(user_id, course_id);
CREATE INDEX idx_extracted_material ON extracted_documents(material_id);

-- Row Level Security
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_data" ON courses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON plans FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON chunks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON study_guides FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON sprints FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON scraped_assignments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_grades" ON grades FOR ALL USING (
  course_id IN (SELECT id FROM courses WHERE user_id = auth.uid())
);
CREATE POLICY "own_materials" ON course_materials FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_extracted" ON extracted_documents FOR ALL USING (
  material_id IN (SELECT id FROM course_materials WHERE user_id = auth.uid())
);

-- =============================================================================
-- MASTERY TRACKING WITH SPACED REPETITION
-- =============================================================================

-- Individual concepts/skills that students are learning
CREATE TABLE study_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  course_name TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  concept_name TEXT NOT NULL,
  -- SM-2 algorithm fields
  ease_factor DECIMAL DEFAULT 2.5,      -- How easy the concept is (min 1.3)
  interval_days INTEGER DEFAULT 1,       -- Days until next review
  repetitions INTEGER DEFAULT 0,         -- Successful reviews in a row
  -- Review tracking
  next_review DATE DEFAULT CURRENT_DATE,
  last_reviewed TIMESTAMPTZ,
  -- Performance stats
  total_reviews INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,              -- Current correct streak
  best_streak INTEGER DEFAULT 0,
  -- Difficulty assessment
  difficulty_rating TEXT DEFAULT 'medium', -- 'easy', 'medium', 'hard'
  mastery_level INTEGER DEFAULT 0,        -- 0-100%
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, course_name, topic_name, concept_name)
);

-- Individual review sessions/attempts
CREATE TABLE concept_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID REFERENCES study_concepts(id) ON DELETE CASCADE NOT NULL,
  -- Review details
  quality INTEGER NOT NULL,              -- 0-5 (SM-2 quality rating)
  time_taken_seconds INTEGER,
  -- For questions
  question_type TEXT,                    -- 'multiple_choice', 'free_response', 'worked_problem'
  question_text TEXT,
  user_answer TEXT,
  correct_answer TEXT,
  was_correct BOOLEAN,
  -- Feedback
  hint_used BOOLEAN DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Practice test sessions
CREATE TABLE practice_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  course_name TEXT NOT NULL,
  topic_name TEXT,
  -- Test configuration
  difficulty_level TEXT DEFAULT 'adaptive', -- 'easy', 'medium', 'hard', 'adaptive'
  total_questions INTEGER NOT NULL,
  -- Results
  questions JSONB NOT NULL,               -- Array of questions with answers
  score INTEGER,
  time_taken_seconds INTEGER,
  completed BOOLEAN DEFAULT FALSE,
  -- Analysis
  weak_areas JSONB DEFAULT '[]',          -- Concepts that need work
  strong_areas JSONB DEFAULT '[]',        -- Concepts that are mastered
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Weak spots detected over time
CREATE TABLE weak_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  course_name TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  concept_name TEXT NOT NULL,
  -- Detection
  error_pattern TEXT,                     -- "You keep forgetting to..."
  common_mistakes JSONB DEFAULT '[]',     -- Array of common mistakes
  times_missed INTEGER DEFAULT 1,
  -- Resolution
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  -- Timestamps
  first_detected TIMESTAMPTZ DEFAULT NOW(),
  last_occurred TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for mastery system
CREATE INDEX idx_concepts_user ON study_concepts(user_id);
CREATE INDEX idx_concepts_review ON study_concepts(user_id, next_review);
CREATE INDEX idx_concepts_course ON study_concepts(user_id, course_name);
CREATE INDEX idx_reviews_concept ON concept_reviews(concept_id, reviewed_at DESC);
CREATE INDEX idx_tests_user ON practice_tests(user_id, completed_at DESC);
CREATE INDEX idx_weak_spots_user ON weak_spots(user_id, resolved);

-- RLS for mastery tables
ALTER TABLE study_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE weak_spots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_concepts" ON study_concepts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_reviews" ON concept_reviews FOR ALL USING (
  concept_id IN (SELECT id FROM study_concepts WHERE user_id = auth.uid())
);
CREATE POLICY "own_tests" ON practice_tests FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_weak_spots" ON weak_spots FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- STREAKS, ACCOUNTABILITY & WEEKLY RECAPS
-- =============================================================================

-- User streaks — tracks daily completion streaks and freeze logic
CREATE TABLE user_streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_completed_date DATE,
  freeze_available BOOLEAN DEFAULT TRUE,
  freeze_used_date DATE,
  weekend_mode BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accountability partners — buddy system for motivation
CREATE TABLE accountability_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  partner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(invite_code)
);

-- Nudges — messages sent between accountability partners
CREATE TABLE nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id UUID REFERENCES accountability_partners(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly recaps — AI-generated summaries of weekly progress
CREATE TABLE weekly_recaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  tasks_completed INTEGER DEFAULT 0,
  grades_logged INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  insight_text TEXT,
  win_text TEXT,
  preview_text TEXT,
  dismissed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for streaks, accountability & recaps
CREATE INDEX idx_streaks_last_date ON user_streaks(last_completed_date);
CREATE INDEX idx_partners_user ON accountability_partners(user_id);
CREATE INDEX idx_partners_partner ON accountability_partners(partner_id);
CREATE INDEX idx_partners_invite ON accountability_partners(invite_code);
CREATE INDEX idx_partners_status ON accountability_partners(status);
CREATE INDEX idx_nudges_partnership ON nudges(partnership_id, created_at DESC);
CREATE INDEX idx_nudges_sender ON nudges(sender_id);
CREATE INDEX idx_recaps_user ON weekly_recaps(user_id, week_start DESC);
CREATE INDEX idx_recaps_dismissed ON weekly_recaps(user_id, dismissed);

-- RLS for streaks, accountability & recaps
ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE accountability_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE nudges ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_recaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_streak" ON user_streaks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_partnerships" ON accountability_partners FOR ALL USING (
  auth.uid() = user_id OR auth.uid() = partner_id
);
CREATE POLICY "own_nudges" ON nudges FOR ALL USING (
  partnership_id IN (
    SELECT id FROM accountability_partners
    WHERE user_id = auth.uid() OR partner_id = auth.uid()
  )
);
CREATE POLICY "own_recaps" ON weekly_recaps FOR ALL USING (auth.uid() = user_id);
