// Shared TypeScript types for SchoolPilot frontend.
// Import from "@/lib/types" instead of defining inline types.

export interface Assignment {
  id: string;
  title: string;
  course_name: string;
  assignment_type: string | null;
  due_date: string | null;
  points_possible: number | null;
  is_submitted: boolean;
  is_graded: boolean;
  points_earned: number | null;
  description: string | null;
  lms_id: string | null;
}

export interface LMSGrade {
  id: string;
  course_name: string;
  overall_grade: string | null;
  overall_percentage: number | null;
  category_breakdown: CategoryBreakdown;
  extracted_at: string;
  previous_grade: string | null;
  grade_changed_at: string | null;
}

export interface CategoryBreakdown {
  [categoryName: string]: {
    weight: number;
    grade: number | null;
    assignments: number;
  };
}

export interface StudentProfile {
  user_id: string;
  display_name: string | null;
  school_name: string | null;
  grade_level: string | null;
  timezone: string;
  personality_preset: "coach" | "friend" | "mentor" | "drill_sergeant";
  onboarding_complete: boolean;
  onboarding_step: string;
  goals: string[];
  patterns: Record<string, string> | null;
  daily_briefing_enabled: boolean;
  email_briefings: boolean;
  briefing_time: string | null;
}

export interface SyncStatus {
  last_sync: {
    id: string;
    completed_at: string;
    data_extracted: Record<string, number>;
    status: string;
    error_message: string | null;
  } | null;
  is_syncing: boolean;
  running_job_id: string | null;
  credentials: LMSCredentialStatus[];
}

export interface LMSCredentialStatus {
  lms_type: string;
  last_login_success: boolean | null;
  sync_enabled: boolean;
  last_sync_at: string | null;
}

export interface FocusStats {
  today_sessions: number;
  today_minutes: number;
  week_minutes: number;
  current_streak: number;
  longest_streak: number;
  total_active_days: number;
}

export interface Conversation {
  id: string;
  title: string | null;
  last_message_at: string;
  message_count: number;
  summary: string | null;
  created_at: string;
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  rich_content?: Record<string, unknown> | null;
  actions_taken?: ToolCallAction[] | null;
  model_used?: string | null;
  tokens_used?: number | null;
}

export interface ToolCallAction {
  tool: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface BuddyStatus {
  has_buddy: boolean;
  pair_id?: string;
  status?: "pending" | "active" | "ended";
  buddy_name?: string;
  streak_count: number;
  last_activity_buddy?: string | null;
}

export interface LMSCredential {
  id: string;
  lms_type: string;
  lms_url: string;
  last_login_success: boolean | null;
  last_sync_at: string | null;
  sync_enabled: boolean;
  last_error: string | null;
}

export interface DailyPlan {
  headline: string;
  urgent_items: Array<{
    title: string;
    course: string;
    due: string;
    impact: string;
  }>;
  today_plan: Array<{
    time_block: string;
    task: string;
    duration: string;
  }>;
  grade_alerts: Array<{
    course: string;
    grade: string;
    risk: "safe" | "watch" | "danger";
  }>;
  motivation: string;
}

export interface StudyContent {
  guide?: string;
  cards?: Array<{ front: string; back: string }>;
  questions?: Array<{
    type: "multiple_choice" | "short_answer" | "true_false";
    question: string;
    options: string[] | null;
    correct_answer: string;
    explanation: string;
    difficulty: "easy" | "medium" | "hard";
  }>;
  explanation?: string;
  summary?: string;
  raw?: string;
}

// Legacy interfaces kept for backward compatibility

export interface StreakData {
  current_streak: number;
  longest_streak: number;
  freeze_available: boolean;
  last_completed_date: string | null;
}

export interface BuddyData {
  has_partner: boolean;
  partner_name?: string;
  partner_streak?: number;
  partner_completed_today?: boolean;
  my_streak?: number;
  my_completed_today?: boolean;
  pending_invite?: string | null;
}

export interface RecapData {
  id: string;
  week_start: string;
  week_end: string;
  tasks_completed: number;
  grades_logged: number;
  streak_days: number;
  insight_text: string;
  win_text: string;
  preview_text: string;
}
