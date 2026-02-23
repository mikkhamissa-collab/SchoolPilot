// Shared types used across multiple components and pages

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
