// Streak calculation logic — runs client-side against Supabase data

export interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_completed_date: string | null;
  freeze_available: boolean;
  freeze_used_date: string | null;
  weekend_mode: boolean;
}

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a + "T00:00:00");
  const d2 = new Date(b + "T00:00:00");
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay() === 0 || d.getDay() === 6;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export function calculateStreakUpdate(
  streak: StreakData,
  completedTask: boolean
): StreakData {
  const today = getToday();
  const updated = { ...streak };

  if (!completedTask) return updated;

  // Already completed today — no change
  if (streak.last_completed_date === today) return updated;

  const yesterday = getYesterday();
  const gap = streak.last_completed_date
    ? daysBetween(streak.last_completed_date, today)
    : 999;

  if (gap === 1 || streak.last_completed_date === today) {
    // Consecutive day — continue streak
    updated.current_streak += 1;
  } else if (gap === 2 && streak.freeze_available) {
    // Missed one day — use freeze
    updated.freeze_available = false;
    updated.freeze_used_date = yesterday;
    updated.current_streak += 1;
  } else if (gap === 2 && streak.weekend_mode && isWeekend(yesterday)) {
    // Missed Saturday or Sunday with weekend mode
    updated.current_streak += 1;
  } else if (streak.current_streak === 0) {
    // First ever task
    updated.current_streak = 1;
  } else {
    // Streak broken
    updated.current_streak = 1;
  }

  updated.last_completed_date = today;
  updated.longest_streak = Math.max(
    updated.longest_streak,
    updated.current_streak
  );

  return updated;
}

export function getStreakMilestone(
  streak: number
): { emoji: string; message: string } | null {
  const milestones: Record<number, { emoji: string; message: string }> = {
    3: { emoji: "🔥", message: "3-day streak! Building the habit." },
    7: { emoji: "🔥🔥", message: "1 week streak! You're on fire." },
    14: { emoji: "💪", message: "2 weeks! This is who you are now." },
    30: { emoji: "🏆", message: "30 days! Unstoppable." },
    50: { emoji: "⭐", message: "50 days! Top 1% of students." },
    100: { emoji: "👑", message: "100 DAYS! Legendary." },
  };
  return milestones[streak] || null;
}

export function shouldRefreshFreeze(freezeUsedDate: string | null): boolean {
  if (!freezeUsedDate) return false;
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return new Date(freezeUsedDate + "T00:00:00") < monday;
}
