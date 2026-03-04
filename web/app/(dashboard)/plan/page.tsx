"use client";

// AI STUDY PLANNER — Weekly view with assignment due dates, manual task adding,
// color-coded urgency, class filtering, and AI plan generation via chat sidebar.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";

// =============================================================================
// TYPES
// =============================================================================

interface Assignment {
  id: string;
  title: string;
  course_name: string;
  assignment_type: string | null;
  due_date: string | null;
  points_possible: number | null;
  is_submitted: boolean;
  is_graded: boolean;
  points_earned: number | null;
}

interface ManualTask {
  id: string;
  title: string;
  dayKey: string; // "YYYY-MM-DD"
  course: string;
  completed: boolean;
  createdAt: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TASKS_STORAGE_KEY = "schoolpilot_plan_tasks";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// =============================================================================
// HELPERS
// =============================================================================

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getWeekDays(): { key: string; dayName: string; date: Date; isToday: boolean }[] {
  const today = new Date();
  const currentDay = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((currentDay + 6) % 7)); // back to Monday
  monday.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const todayKey = today.toISOString().slice(0, 10);
    days.push({
      key,
      dayName: DAY_NAMES[d.getDay()],
      date: d,
      isToday: key === todayKey,
    });
  }
  return days;
}

function getUrgencyLevel(dueDate: string | null): "urgent" | "soon" | "normal" | "none" {
  if (!dueDate) return "none";
  const now = new Date();
  const due = new Date(dueDate);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 1) return "urgent";
  if (diffDays < 3) return "soon";
  return "normal";
}

function urgencyColor(level: "urgent" | "soon" | "normal" | "none"): string {
  switch (level) {
    case "urgent":
      return "border-l-red-500 bg-red-500/5";
    case "soon":
      return "border-l-yellow-500 bg-yellow-500/5";
    case "normal":
      return "border-l-emerald-500 bg-emerald-500/5";
    default:
      return "border-l-transparent";
  }
}

function urgencyBadge(level: "urgent" | "soon" | "normal" | "none"): { text: string; className: string } | null {
  switch (level) {
    case "urgent":
      return { text: "URGENT", className: "bg-red-500/20 text-red-400" };
    case "soon":
      return { text: "Soon", className: "bg-yellow-500/20 text-yellow-400" };
    default:
      return null;
  }
}

function loadManualTasks(): ManualTask[] {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveManualTasks(tasks: ManualTask[]): void {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // ignore
  }
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function PlanPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [manualTasks, setManualTasks] = useState<ManualTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [addingToDay, setAddingToDay] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskCourse, setNewTaskCourse] = useState("");
  const [movingTask, setMovingTask] = useState<{ type: "assignment" | "task"; id: string } | null>(null);

  const weekDays = getWeekDays();

  // Auth token
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
      }
    });
  }, []);

  // Load manual tasks from localStorage
  useEffect(() => {
    setManualTasks(loadManualTasks());
  }, []);

  // Fetch assignments
  const fetchAssignments = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `${API_URL}/api/agent/assignments?upcoming_only=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch assignments (${res.status})`);
      }

      const data: Assignment[] = await res.json();
      setAssignments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load assignments");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchAssignments();
  }, [token, fetchAssignments]);

  // ---------------------------------------------------------------------------
  // Derive data
  // ---------------------------------------------------------------------------

  // All unique courses
  const allCourses = Array.from(
    new Set([
      ...assignments.map((a) => a.course_name),
      ...manualTasks.map((t) => t.course).filter(Boolean),
    ])
  ).sort();

  // Filter assignments
  const filteredAssignments =
    courseFilter === "all"
      ? assignments
      : assignments.filter((a) => a.course_name === courseFilter);

  const filteredTasks =
    courseFilter === "all"
      ? manualTasks
      : manualTasks.filter((t) => t.course === courseFilter || !t.course);

  // Map assignments to day keys
  function assignmentsForDay(dayKey: string): Assignment[] {
    return filteredAssignments.filter((a) => {
      if (!a.due_date) return false;
      return a.due_date.slice(0, 10) === dayKey;
    });
  }

  function tasksForDay(dayKey: string): ManualTask[] {
    return filteredTasks.filter((t) => t.dayKey === dayKey);
  }

  // Stats
  const weekStart = weekDays[0].key;
  const weekEnd = weekDays[6].key;
  const assignmentsDueThisWeek = assignments.filter((a) => {
    if (!a.due_date) return false;
    const d = a.due_date.slice(0, 10);
    return d >= weekStart && d <= weekEnd;
  });
  const estimatedHours = Math.round(
    assignmentsDueThisWeek.reduce((sum, a) => {
      // Rough estimate: 45 min per assignment, more for assessments
      const type = (a.assignment_type || "").toLowerCase();
      if (type.includes("test") || type.includes("exam") || type.includes("assessment")) {
        return sum + 90;
      }
      return sum + 45;
    }, 0) / 60
  );

  // ---------------------------------------------------------------------------
  // Task management
  // ---------------------------------------------------------------------------

  const addTask = (dayKey: string) => {
    if (!newTaskTitle.trim()) return;
    const task: ManualTask = {
      id: generateId(),
      title: newTaskTitle.trim(),
      dayKey,
      course: newTaskCourse,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [...manualTasks, task];
    setManualTasks(updated);
    saveManualTasks(updated);
    setNewTaskTitle("");
    setNewTaskCourse("");
    setAddingToDay(null);
  };

  const toggleTask = (taskId: string) => {
    const updated = manualTasks.map((t) =>
      t.id === taskId ? { ...t, completed: !t.completed } : t
    );
    setManualTasks(updated);
    saveManualTasks(updated);
  };

  const deleteTask = (taskId: string) => {
    const updated = manualTasks.filter((t) => t.id !== taskId);
    setManualTasks(updated);
    saveManualTasks(updated);
  };

  const moveTaskToDay = (targetDayKey: string) => {
    if (!movingTask) return;
    if (movingTask.type === "task") {
      const updated = manualTasks.map((t) =>
        t.id === movingTask.id ? { ...t, dayKey: targetDayKey } : t
      );
      setManualTasks(updated);
      saveManualTasks(updated);
    }
    setMovingTask(null);
  };

  // ---------------------------------------------------------------------------
  // AI plan generation
  // ---------------------------------------------------------------------------

  const generateAIPlan = () => {
    const assignmentLines = assignmentsDueThisWeek
      .map(
        (a) =>
          `- ${a.title} (${a.course_name}) — due ${a.due_date ? new Date(a.due_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "no date"}${a.is_submitted ? " [submitted]" : ""}`
      )
      .join("\n");

    const taskLines = manualTasks
      .filter((t) => {
        return t.dayKey >= weekStart && t.dayKey <= weekEnd;
      })
      .map((t) => `- ${t.title}${t.course ? ` (${t.course})` : ""} — ${t.dayKey}`)
      .join("\n");

    const msg = `Create a detailed study plan for this week based on my assignments and tasks.\n\nAssignments due this week:\n${assignmentLines || "(none)"}\n\nManual tasks:\n${taskLines || "(none)"}\n\nPlease organize them by priority, suggest time blocks, and give me a realistic daily schedule. Consider assignment types and urgency.`;

    window.dispatchEvent(
      new CustomEvent("open-chat", { detail: { message: msg } })
    );
  };

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Weekly Plan</h2>
          <p className="text-text-secondary text-sm mt-1">
            {weekDays[0].date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}{" "}
            &mdash;{" "}
            {weekDays[6].date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={generateAIPlan}
            className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            Generate AI Plan
          </button>
          <button
            onClick={fetchAssignments}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-bg-card border border-border text-text-secondary hover:text-white text-sm transition-colors disabled:opacity-50"
          >
            {loading ? "Syncing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-bg-card border border-border text-center">
          <p className="text-2xl font-bold text-white">
            {assignmentsDueThisWeek.length}
          </p>
          <p className="text-text-muted text-xs mt-1">Due This Week</p>
        </div>
        <div className="p-4 rounded-xl bg-bg-card border border-border text-center">
          <p className="text-2xl font-bold text-white">
            {assignmentsDueThisWeek.filter((a) => a.is_submitted).length}
          </p>
          <p className="text-text-muted text-xs mt-1">Submitted</p>
        </div>
        <div className="p-4 rounded-xl bg-bg-card border border-border text-center">
          <p className="text-2xl font-bold text-warning">{estimatedHours}h</p>
          <p className="text-text-muted text-xs mt-1">Est. Study Time</p>
        </div>
        <div className="p-4 rounded-xl bg-bg-card border border-border text-center">
          <p className="text-2xl font-bold text-accent">{allCourses.length}</p>
          <p className="text-text-muted text-xs mt-1">Classes</p>
        </div>
      </div>

      {/* Course filter */}
      {allCourses.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-text-muted text-xs shrink-0">Filter:</span>
          <button
            onClick={() => setCourseFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border whitespace-nowrap ${
              courseFilter === "all"
                ? "bg-accent/20 text-accent border-accent/40"
                : "bg-bg-card text-text-secondary hover:text-white border-border"
            }`}
          >
            All Classes
          </button>
          {allCourses.map((c) => (
            <button
              key={c}
              onClick={() => setCourseFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border whitespace-nowrap ${
                courseFilter === c
                  ? "bg-accent/20 text-accent border-accent/40"
                  : "bg-bg-card text-text-secondary hover:text-white border-border"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Moving task banner */}
      {movingTask && (
        <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-accent text-sm flex items-center justify-between">
          <span>Click on a day to move this task there</span>
          <button
            onClick={() => setMovingTask(null)}
            className="text-xs px-3 py-1 rounded-lg bg-bg-card border border-border text-text-secondary hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Week grid */}
      {loading && assignments.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4 animate-pulse">...</div>
          <p className="text-text-muted text-sm">Loading assignments...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const dayAssignments = assignmentsForDay(day.key);
            const dayTasks = tasksForDay(day.key);
            const isEmpty = dayAssignments.length === 0 && dayTasks.length === 0;

            return (
              <div
                key={day.key}
                onClick={() => {
                  if (movingTask) {
                    moveTaskToDay(day.key);
                  }
                }}
                className={`rounded-xl border overflow-hidden flex flex-col ${
                  day.isToday
                    ? "border-accent/40 bg-bg-card"
                    : "border-border bg-bg-card/50"
                } ${movingTask ? "cursor-pointer hover:border-accent/60" : ""}`}
              >
                {/* Day header */}
                <div
                  className={`px-3 py-2.5 border-b ${
                    day.isToday
                      ? "border-accent/20 bg-accent/5"
                      : "border-border/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span
                        className={`text-xs font-medium ${
                          day.isToday ? "text-accent" : "text-text-muted"
                        }`}
                      >
                        {day.dayName}
                      </span>
                      <span
                        className={`ml-1.5 text-sm font-bold ${
                          day.isToday ? "text-white" : "text-text-secondary"
                        }`}
                      >
                        {day.date.getDate()}
                      </span>
                    </div>
                    {day.isToday && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">
                        Today
                      </span>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div className="p-2 flex-1 space-y-1.5 min-h-[80px]">
                  {/* Assignments */}
                  {dayAssignments.map((a) => {
                    const urgency = getUrgencyLevel(a.due_date);
                    const badge = urgencyBadge(urgency);

                    return (
                      <div
                        key={a.id}
                        className={`px-2.5 py-2 rounded-lg border-l-2 text-xs space-y-1 ${urgencyColor(
                          urgency
                        )} ${a.is_submitted ? "opacity-50" : ""}`}
                      >
                        <p
                          className={`font-medium leading-tight ${
                            a.is_submitted
                              ? "line-through text-text-muted"
                              : "text-white"
                          }`}
                        >
                          {a.title}
                        </p>
                        <p className="text-text-muted truncate">
                          {a.course_name}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {badge && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.className}`}
                            >
                              {badge.text}
                            </span>
                          )}
                          {a.assignment_type && (
                            <span className="text-text-muted text-[10px]">
                              {a.assignment_type}
                            </span>
                          )}
                          {a.is_submitted && (
                            <span className="text-emerald-400 text-[10px]">
                              Done
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Manual tasks */}
                  {dayTasks.map((t) => (
                    <div
                      key={t.id}
                      className="px-2.5 py-2 rounded-lg bg-bg-hover/50 text-xs group"
                    >
                      <div className="flex items-start gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTask(t.id);
                          }}
                          className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                            t.completed
                              ? "bg-accent border-accent text-white"
                              : "border-border hover:border-accent"
                          }`}
                          aria-label={
                            t.completed ? "Mark incomplete" : "Mark complete"
                          }
                        >
                          {t.completed && (
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 12 12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M2 6l3 3 5-5" />
                            </svg>
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`leading-tight ${
                              t.completed
                                ? "line-through text-text-muted"
                                : "text-white"
                            }`}
                          >
                            {t.title}
                          </p>
                          {t.course && (
                            <p className="text-text-muted text-[10px] mt-0.5">
                              {t.course}
                            </p>
                          )}
                        </div>
                        <div className="hidden group-hover:flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMovingTask({ type: "task", id: t.id });
                            }}
                            className="text-text-muted hover:text-accent text-[10px]"
                            title="Move to another day"
                          >
                            Move
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTask(t.id);
                            }}
                            className="text-text-muted hover:text-red-400 text-[10px]"
                            title="Delete task"
                          >
                            Del
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Empty state */}
                  {isEmpty && (
                    <p className="text-text-muted text-[10px] text-center py-3">
                      Nothing planned
                    </p>
                  )}
                </div>

                {/* Add task button */}
                <div className="px-2 pb-2">
                  {addingToDay === day.key ? (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Task name..."
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addTask(day.key);
                          if (e.key === "Escape") {
                            setAddingToDay(null);
                            setNewTaskTitle("");
                          }
                        }}
                        className="w-full px-2 py-1.5 rounded-lg bg-bg-dark border border-border text-white text-xs placeholder:text-text-muted focus:outline-none focus:border-accent"
                      />
                      <select
                        value={newTaskCourse}
                        onChange={(e) => setNewTaskCourse(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg bg-bg-dark border border-border text-text-secondary text-xs focus:outline-none focus:border-accent"
                      >
                        <option value="">No class</option>
                        {allCourses.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-1">
                        <button
                          onClick={() => addTask(day.key)}
                          disabled={!newTaskTitle.trim()}
                          className="flex-1 py-1 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-40"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => {
                            setAddingToDay(null);
                            setNewTaskTitle("");
                            setNewTaskCourse("");
                          }}
                          className="px-2 py-1 rounded-lg bg-bg-hover text-text-muted text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddingToDay(day.key);
                      }}
                      className="w-full py-1.5 rounded-lg text-text-muted hover:text-accent text-[10px] hover:bg-bg-hover/50 transition-colors"
                    >
                      + Add task
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unscheduled assignments (no due date or outside this week) */}
      {(() => {
        const weekStart = weekDays[0].key;
        const weekEnd = weekDays[6].key;
        const unscheduled = filteredAssignments.filter((a) => {
          if (!a.due_date) return true;
          const d = a.due_date.slice(0, 10);
          return d < weekStart || d > weekEnd;
        });

        if (unscheduled.length === 0) return null;

        return (
          <div className="p-5 rounded-xl bg-bg-card border border-border">
            <h3 className="text-white font-medium text-sm mb-3">
              Other Assignments
            </h3>
            <p className="text-text-muted text-xs mb-3">
              Due outside this week or no due date set
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {unscheduled.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-dark/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm truncate">{a.title}</p>
                    <p className="text-text-muted text-xs">{a.course_name}</p>
                  </div>
                  <span className="text-text-muted text-xs ml-3 shrink-0">
                    {a.due_date
                      ? new Date(a.due_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "No date"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Quick AI actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("open-chat", {
                detail: {
                  message:
                    "What should I prioritize today? Look at my upcoming assignments and help me decide what to work on first.",
                },
              })
            );
          }}
          className="p-4 rounded-xl bg-bg-card border border-border text-left hover:border-accent/40 transition-colors group"
        >
          <p className="text-white text-sm font-medium group-hover:text-accent transition-colors">
            What should I prioritize today?
          </p>
          <p className="text-text-muted text-xs mt-1">
            Ask AI to analyze your workload and suggest priorities
          </p>
        </button>
        <button
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("open-chat", {
                detail: {
                  message:
                    "Help me break down my biggest upcoming assignment into smaller steps I can spread across this week.",
                },
              })
            );
          }}
          className="p-4 rounded-xl bg-bg-card border border-border text-left hover:border-accent/40 transition-colors group"
        >
          <p className="text-white text-sm font-medium group-hover:text-accent transition-colors">
            Break down a big assignment
          </p>
          <p className="text-text-muted text-xs mt-1">
            Get step-by-step tasks you can schedule into your week
          </p>
        </button>
      </div>
    </div>
  );
}
