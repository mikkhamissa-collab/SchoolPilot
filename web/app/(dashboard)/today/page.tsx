"use client";

import { createClient } from "@/lib/supabase-client";
import { apiFetch } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Confetti from "@/components/Confetti";
import ShareCard from "@/components/ShareCard";
import StreakBadge from "@/components/StreakBadge";
import GradeLogModal from "@/components/GradeLogModal";
import WeeklyRecapModal from "@/components/WeeklyRecapModal";
import BuddyWidget from "@/components/BuddyWidget";
import { getStreakMilestone } from "@/lib/streak";

// =============================================================================
// TYPES
// =============================================================================

interface ActionRequired {
  title: string;
  course: string;
  type: string;
  due_in: string;
  current_grade: number;
  target_grade: number;
  buffer: number;
  risk_level: string;
  danger_score: string;
  safe_score: string;
  time_needed: string;
  why_urgent: string;
}

interface OtherPriority {
  title: string;
  course: string;
  due_in: string;
  time_needed: string;
  urgency: "high" | "medium" | "low";
}

interface GradeAlert {
  course: string;
  current: number;
  threshold: number;
  thresholdName: string;
  buffer: number;
  risk: "safe" | "watch" | "danger";
}

interface GuardianData {
  action_required: ActionRequired | null;
  other_priorities: OtherPriority[];
  on_track: Array<{ course: string; grade: number; target: number; status: string }>;
  headline: string;
  motivation: string;
  gradeAlerts?: GradeAlert[];
}

interface Assignment {
  title?: string;
  type?: string;
  due?: string;
  course?: string;
  date?: string;
  day?: string;
  isOverdue?: boolean;
}

interface CourseGrade {
  course: string;
  current: number;
}

interface StreakData {
  current_streak: number;
  longest_streak: number;
  freeze_available: boolean;
  last_completed_date: string | null;
}

interface BuddyData {
  has_partner: boolean;
  partner_name?: string;
  partner_streak?: number;
  partner_completed_today?: boolean;
  my_streak?: number;
  my_completed_today?: boolean;
  pending_invite?: string | null;
}

interface RecapData {
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

// =============================================================================
// GRADE KEYWORDS — triggers the "log your grade" modal
// =============================================================================

const GRADE_KEYWORDS = [
  "assessment",
  "test",
  "quiz",
  "exam",
  "assignment",
  "project",
  "paper",
  "essay",
  "lab report",
];

function isGradeWorthy(type?: string, title?: string): boolean {
  const text = `${type || ""} ${title || ""}`.toLowerCase();
  return GRADE_KEYWORDS.some((kw) => text.includes(kw));
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function TodayPage() {
  const router = useRouter();
  const [guardian, setGuardian] = useState<GuardianData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [overdue, setOverdue] = useState<Assignment[]>([]);
  const [grades, setGrades] = useState<CourseGrade[]>([]);
  const [targetGrades, setTargetGrades] = useState<Record<string, number>>({});
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [showOtherTasks, setShowOtherTasks] = useState(false);

  // Stickiness features
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [streakMilestone, setStreakMilestone] = useState<string | null>(null);
  const [gradeLogTask, setGradeLogTask] = useState<{
    title: string;
    course: string;
    courseId: string;
    type: string;
  } | null>(null);
  const [buddy, setBuddy] = useState<BuddyData | null>(null);
  const [recap, setRecap] = useState<RecapData | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const uid = user.id;
      setUserId(uid);
      setUserName(user.user_metadata?.full_name?.split(" ")[0] || "");

      const savedTargets = user.user_metadata?.target_grades;
      if (savedTargets && typeof savedTargets === "object") {
        setTargetGrades(savedTargets);
      }

      // Load assignments
      const { data: scraped } = await supabase
        .from("scraped_assignments")
        .select("assignments")
        .eq("user_id", uid)
        .order("scraped_at", { ascending: false })
        .limit(1)
        .single();

      if (scraped?.assignments) {
        const data = scraped.assignments as {
          upcoming: Assignment[];
          overdue: Assignment[];
        };
        setAssignments(data.upcoming || []);
        setOverdue(data.overdue || []);
      }

      // Load grades
      const { data: courses } = await supabase
        .from("courses")
        .select("id, name")
        .eq("user_id", uid);

      if (courses && courses.length > 0) {
        const { data: gradeEntries } = await supabase
          .from("grades")
          .select("course_id, score, max_score")
          .in("course_id", courses.map((c) => c.id));

        if (gradeEntries && gradeEntries.length > 0) {
          const courseGrades: CourseGrade[] = [];
          for (const course of courses) {
            const entries = gradeEntries.filter((g) => g.course_id === course.id);
            if (entries.length > 0) {
              const totalScore = entries.reduce((s, g) => s + (g.score || 0), 0);
              const totalMax = entries.reduce((s, g) => s + (g.max_score || 100), 0);
              const pct = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
              courseGrades.push({ course: course.name, current: Math.round(pct * 10) / 10 });
            }
          }
          setGrades(courseGrades);
        }
      }

      // Load streak (cookie auth — no headers needed)
      try {
        const streakRes = await fetch("/api/streak");
        if (streakRes.ok) setStreak(await streakRes.json());
      } catch (err) {
        console.error("Failed to load streak:", err);
      }

      // Load buddy
      try {
        const buddyRes = await fetch("/api/buddy/status");
        if (buddyRes.ok) setBuddy(await buddyRes.json());
      } catch (err) {
        console.error("Failed to load buddy:", err);
      }

      // Load weekly recap
      try {
        const recapRes = await fetch("/api/recap");
        if (recapRes.ok) {
          const recapData = await recapRes.json();
          if (recapData.recap) setRecap(recapData.recap);
        }
      } catch (err) {
        console.error("Failed to load recap:", err);
      }

      // Load cached guardian from localStorage
      try {
        const savedGuardian = localStorage.getItem("guardian_data");
        const savedGuardianDate = localStorage.getItem("guardian_data_date");
        const today = new Date().toDateString();
        if (savedGuardian && savedGuardianDate === today) {
          setGuardian(JSON.parse(savedGuardian));
          const savedCompleted = localStorage.getItem("today_completed_v2");
          if (savedCompleted) setCompletedTasks(new Set(JSON.parse(savedCompleted)));
        }
      } catch (err) {
        console.error("Failed to load cached data:", err);
      }

      setPageLoading(false);
    };
    load();
  }, []);

  const generatePlan = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<GuardianData>("plan/analyze", {
        assignments, overdue, grades, targetGrades, name: userName,
      });
      setGuardian(result);
      setCompletedTasks(new Set());
      const today = new Date().toDateString();
      localStorage.setItem("guardian_data", JSON.stringify(result));
      localStorage.setItem("guardian_data_date", today);
      localStorage.setItem("today_completed_v2", JSON.stringify([]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  }, [assignments, overdue, grades, targetGrades, userName]);

  const toggleTask = async (taskId: string, taskInfo?: { title: string; course: string; type: string }) => {
    const next = new Set(completedTasks);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);

      // Priority task completed — update streak
      if (taskId === "priority") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 100);

        // Update streak on server (cookie auth)
        try {
          const res = await fetch("/api/streak", { method: "POST" });
          if (res.ok) {
            const updated = await res.json();
            setStreak(updated);
            const milestone = getStreakMilestone(updated.current_streak);
            if (milestone) {
              setStreakMilestone(milestone.message);
              setTimeout(() => setStreakMilestone(null), 4000);
            }
          } else {
            console.error("Streak update failed:", res.status);
          }
        } catch (err) {
          console.error("Streak update error:", err);
        }

        // Check if task is grade-worthy → show grade log modal
        if (taskInfo && isGradeWorthy(taskInfo.type, taskInfo.title)) {
          setTimeout(() => {
            setGradeLogTask({
              title: taskInfo.title,
              course: taskInfo.course,
              courseId: "", // course_name is used for lookup on the server
              type: taskInfo.type,
            });
          }, 1500);
        }
      }
    }
    setCompletedTasks(next);
    localStorage.setItem("today_completed_v2", JSON.stringify([...next]));
  };

  const handleGradeLog = async (score: number, maxScore: number) => {
    if (!gradeLogTask) return;
    try {
      const res = await fetch("/api/grades/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_name: gradeLogTask.course,
          assignment_title: gradeLogTask.title,
          score,
          max_score: maxScore,
          assignment_type: gradeLogTask.type,
        }),
      });
      if (!res.ok) {
        console.error("Grade log failed:", res.status, await res.text());
      }
    } catch (err) {
      console.error("Grade log error:", err);
    }
    setGradeLogTask(null);
  };

  const dismissRecap = async () => {
    if (!recap) return;
    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recap_id: recap.id }),
      });
      if (!res.ok) {
        console.error("Recap dismiss failed:", res.status);
      }
    } catch (err) {
      console.error("Recap dismiss error:", err);
    }
    setRecap(null);
  };

  const startStudySession = (action: ActionRequired) => {
    const params = new URLSearchParams({
      assignment: action.title,
      course: action.course,
      type: action.type,
      grade: String(action.current_grade),
      target: String(action.target_grade),
    });
    router.push(`/session?${params.toString()}`);
  };

  const gradeAlerts = guardian?.gradeAlerts || [];
  const dangerGrades = gradeAlerts.filter((g) => g.risk === "danger");
  const topGrade = grades.length > 0
    ? [...grades].sort((a, b) => b.current - a.current)[0]
    : null;

  // =========================================================================
  // LOADING
  // =========================================================================

  if (pageLoading) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-6">
        <div className="h-8 w-48 bg-bg-card rounded-lg animate-pulse" />
        <div className="h-64 bg-bg-card rounded-2xl animate-pulse" />
        <div className="h-12 bg-bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  // =========================================================================
  // EMPTY STATE
  // =========================================================================

  if (!guardian && assignments.length === 0 && overdue.length === 0) {
    return (
      <div className="max-w-lg mx-auto p-6 pt-12 text-center space-y-6">
        <div className="text-5xl">🛡️</div>
        <h1 className="text-2xl font-bold text-white">No Assignments Yet</h1>
        <p className="text-text-muted text-sm leading-relaxed">
          Sync your assignments from Teamie using the SchoolPilot extension,
          then come back here.
        </p>
      </div>
    );
  }

  // =========================================================================
  // MAIN VIEW
  // =========================================================================

  return (
    <div className="max-w-lg mx-auto p-6 space-y-5">
      <Confetti trigger={showConfetti} />

      {/* Grade Log Modal */}
      {gradeLogTask && (
        <GradeLogModal
          taskTitle={gradeLogTask.title}
          courseName={gradeLogTask.course}
          courseId={gradeLogTask.courseId}
          onSave={handleGradeLog}
          onSkip={() => setGradeLogTask(null)}
        />
      )}

      {/* Weekly Recap Modal */}
      {recap && (
        <WeeklyRecapModal
          data={{
            weekLabel: `${new Date(recap.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${new Date(recap.week_end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
            tasksCompleted: recap.tasks_completed,
            streakDays: recap.streak_days,
            gradesLogged: recap.grades_logged,
            insight: recap.insight_text,
            win: recap.win_text,
            preview: recap.preview_text,
          }}
          onDismiss={dismissRecap}
          onShare={() => {
            dismissRecap();
          }}
        />
      )}

      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {userName ? `Hey ${userName}.` : "Today"}
          </h1>
          <p className="text-text-muted text-sm mt-0.5">
            {guardian?.headline || "Here\u2019s what matters today."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {streak && streak.current_streak > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-xs font-medium">
              🔥 {streak.current_streak}
            </span>
          )}
          {completedTasks.size > 0 && (
            <ShareCard
              userName={userName}
              tasksCompleted={completedTasks.size}
              streak={streak?.current_streak}
              topCourse={topGrade?.course}
              grade={topGrade ? Math.round(topGrade.current) : undefined}
            />
          )}
          <button
            onClick={generatePlan}
            disabled={loading}
            className="p-2 rounded-lg text-text-muted hover:text-white hover:bg-bg-card transition-colors"
            title="Refresh"
          >
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </header>

      {/* Streak milestone toast */}
      {streakMilestone && (
        <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-center text-sm text-white font-medium animate-pulse">
          🔥 {streakMilestone}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-error/10 text-error text-sm">{error}</div>
      )}

      {/* Streak badge (full, shown when no guardian yet) */}
      {streak && !guardian && streak.current_streak > 0 && (
        <StreakBadge
          streak={streak.current_streak}
          freezeAvailable={streak.freeze_available}
        />
      )}

      {/* Pre-analysis stats */}
      {!guardian && (
        <div className="space-y-4">
          <div className="flex gap-3 text-center">
            <div className="flex-1 p-3 rounded-xl bg-bg-card border border-border">
              <div className="text-xl font-bold text-error">{overdue.length}</div>
              <div className="text-text-muted text-xs">Overdue</div>
            </div>
            <div className="flex-1 p-3 rounded-xl bg-bg-card border border-border">
              <div className="text-xl font-bold text-accent">{assignments.length}</div>
              <div className="text-text-muted text-xs">Upcoming</div>
            </div>
          </div>
          <button
            onClick={generatePlan}
            disabled={loading}
            className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Analyze My Grades"}
          </button>
        </div>
      )}

      {/* FOCUS CARD */}
      {guardian?.action_required && (
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-accent to-accent-hover rounded-2xl opacity-60 group-hover:opacity-100 transition duration-500 blur" />
          <div className="relative p-6 bg-bg-card rounded-2xl border border-border space-y-4">
            <div className="flex justify-between items-start">
              <span className="px-2 py-0.5 rounded bg-error/20 text-error text-xs font-bold uppercase tracking-wider">
                {guardian.action_required.risk_level === "critical" ? "Critical" : "Focus"}
              </span>
              <span className="text-text-muted text-sm">{guardian.action_required.due_in}</span>
            </div>

            <div>
              <h2 className={`text-xl font-bold text-white ${completedTasks.has("priority") ? "line-through opacity-50" : ""}`}>
                {guardian.action_required.title}
              </h2>
              <p className="text-text-secondary text-sm mt-1">{guardian.action_required.course}</p>
            </div>

            {/* Grade context */}
            <div className="space-y-2 p-3 rounded-xl bg-bg-dark/50">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Your grade</span>
                <span className="text-white font-medium">
                  {guardian.action_required.current_grade}%
                  {guardian.action_required.buffer < 0 && (
                    <span className="text-error ml-1">({guardian.action_required.buffer}%)</span>
                  )}
                </span>
              </div>
              {guardian.action_required.danger_score && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-error shrink-0">!</span>
                  <span className="text-error/80">{guardian.action_required.danger_score}</span>
                </div>
              )}
              {guardian.action_required.safe_score && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-success shrink-0">✓</span>
                  <span className="text-success/80">{guardian.action_required.safe_score}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              {!completedTasks.has("priority") && (
                <button
                  onClick={() => startStudySession(guardian.action_required!)}
                  className="w-full py-3 rounded-xl font-semibold bg-white text-black hover:bg-gray-100 transition-colors"
                >
                  Start Studying
                </button>
              )}
              <button
                onClick={() =>
                  toggleTask("priority", {
                    title: guardian.action_required!.title,
                    course: guardian.action_required!.course,
                    type: guardian.action_required!.type,
                  })
                }
                className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  completedTasks.has("priority")
                    ? "bg-success/20 text-success"
                    : "bg-bg-hover text-text-secondary hover:text-white"
                }`}
              >
                {completedTasks.has("priority") ? "✓ Done" : "Mark as Done"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Streak (compact, after focus card) */}
      {streak && guardian && streak.current_streak > 0 && (
        <StreakBadge
          streak={streak.current_streak}
          freezeAvailable={streak.freeze_available}
        />
      )}

      {/* Grade alerts */}
      {dangerGrades.length > 0 && (
        <div className="p-4 bg-error/10 border border-error/20 rounded-xl space-y-2">
          <h3 className="text-error font-medium text-xs uppercase tracking-wide">Grade Alert</h3>
          {dangerGrades.map((g, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-white">{g.course}</span>
              <span className="text-error font-medium">{g.current}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Buddy widget */}
      {buddy && buddy.has_partner && (
        <BuddyWidget data={buddy} />
      )}

      {/* Other tasks — collapsed by default */}
      {guardian?.other_priorities && guardian.other_priorities.length > 0 && (
        <div>
          <button
            onClick={() => setShowOtherTasks(!showOtherTasks)}
            className="w-full flex items-center justify-between py-3 text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            <span>
              {guardian.other_priorities.length} more task
              {guardian.other_priorities.length !== 1 ? "s" : ""} today
            </span>
            <svg className={`w-4 h-4 transition-transform ${showOtherTasks ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showOtherTasks && (
            <div className="bg-bg-card rounded-xl border border-border overflow-hidden divide-y divide-border">
              {guardian.other_priorities.map((task, i) => {
                const taskId = `task-${i}`;
                const done = completedTasks.has(taskId);
                return (
                  <div
                    key={i}
                    onClick={() => toggleTask(taskId)}
                    className={`p-4 flex items-center gap-3 cursor-pointer hover:bg-bg-hover transition-colors ${done ? "opacity-50" : ""}`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${done ? "bg-success border-success text-white" : "border-text-muted"}`}>
                      {done && <span className="text-xs">✓</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`font-medium text-white text-sm ${done ? "line-through" : ""}`}>{task.title}</div>
                      <div className="text-text-muted text-xs">{task.course} &middot; {task.due_in}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${
                      task.urgency === "high" ? "bg-error/10 text-error"
                        : task.urgency === "medium" ? "bg-warning/10 text-warning"
                          : "bg-bg-hover text-text-muted"
                    }`}>
                      {task.time_needed}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Motivation */}
      {guardian?.motivation && (
        <p className="text-sm text-text-muted italic text-center pt-2">
          &ldquo;{guardian.motivation}&rdquo;
        </p>
      )}
    </div>
  );
}
