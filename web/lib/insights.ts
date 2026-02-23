// Weekly recap insight generator

export interface WeekData {
  tasksCompleted: number;
  tasksCompletedByDay: Record<string, number>;
  gradesLogged: number;
  streakDays: number;
  gradeChanges: Array<{ course: string; before: number; after: number }>;
  upcomingTests: number;
  busiestDay: string | null;
}

interface Insight {
  condition: (data: WeekData) => boolean;
  message: (data: WeekData) => string;
}

const insights: Insight[] = [
  {
    condition: (d) => {
      const days = Object.entries(d.tasksCompletedByDay);
      if (days.length < 2) return false;
      const avg = d.tasksCompleted / days.length;
      return days.some(([, count]) => count > avg * 1.3);
    },
    message: (d) => {
      const best = Object.entries(d.tasksCompletedByDay).sort(
        (a, b) => b[1] - a[1]
      )[0];
      return `You're most productive on ${best[0]}s. We'll queue harder tasks for next ${best[0]}.`;
    },
  },
  {
    condition: (d) => d.streakDays >= 7,
    message: (d) =>
      `${d.streakDays} days strong. You've built a real habit. Top 15% of students.`,
  },
  {
    condition: (d) =>
      d.gradeChanges.some((g) => g.after > g.before),
    message: (d) => {
      const improved = d.gradeChanges.filter((g) => g.after > g.before);
      if (improved.length === 0) return "";
      const best = improved.sort(
        (a, b) => b.after - b.before - (a.after - a.before)
      )[0];
      const change = (best.after - best.before).toFixed(1);
      return `${best.course} went up ${change}%. That work is paying off.`;
    },
  },
  {
    condition: (d) => d.tasksCompleted >= 10,
    message: (d) =>
      `${d.tasksCompleted} tasks in one week. That's not luck — that's discipline.`,
  },
  {
    condition: (d) => d.tasksCompleted >= 5 && d.tasksCompleted < 10,
    message: () =>
      "Consistent week. Small wins stack into big results.",
  },
  {
    condition: (d) => d.gradesLogged >= 3,
    message: (d) =>
      `${d.gradesLogged} grades logged. You're tracking better than 90% of students.`,
  },
  {
    condition: (d) => d.upcomingTests > 0,
    message: (d) =>
      `${d.upcomingTests} test${d.upcomingTests !== 1 ? "s" : ""} next week. ${d.busiestDay ? `Your busiest day is ${d.busiestDay}.` : "Spread the prep."}`,
  },
];

export function generateInsight(data: WeekData): string {
  const applicable = insights.filter((i) => i.condition(data));
  if (applicable.length === 0) return "Keep showing up. Consistency beats intensity.";
  const selected =
    applicable[Math.floor(Math.random() * applicable.length)];
  return selected.message(data);
}

export function generateWin(data: WeekData): string {
  if (data.gradeChanges.some((g) => g.after > g.before)) {
    const best = data.gradeChanges
      .filter((g) => g.after > g.before)
      .sort((a, b) => b.after - b.before - (a.after - a.before))[0];
    return `Your ${best.course} grade went from ${best.before.toFixed(0)}% to ${best.after.toFixed(0)}%.`;
  }
  if (data.tasksCompleted > 0) {
    return `You completed ${data.tasksCompleted} tasks this week.`;
  }
  return "You showed up. That matters.";
}
