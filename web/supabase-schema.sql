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

-- Indexes
CREATE INDEX idx_courses_user ON courses(user_id);
CREATE INDEX idx_grades_course ON grades(course_id);
CREATE INDEX idx_plans_user ON plans(user_id, created_at DESC);
CREATE INDEX idx_chunks_user ON chunks(user_id, created_at DESC);
CREATE INDEX idx_sprints_user ON sprints(user_id, completed);
CREATE INDEX idx_scraped_user ON scraped_assignments(user_id, scraped_at DESC);

-- Row Level Security
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_data" ON courses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON plans FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON chunks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON study_guides FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON sprints FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON scraped_assignments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_grades" ON grades FOR ALL USING (
  course_id IN (SELECT id FROM courses WHERE user_id = auth.uid())
);
