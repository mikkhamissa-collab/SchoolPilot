"use client";

import { createClient } from "@/lib/supabase-client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import RemoteBrowser from "@/components/RemoteBrowser";
import { posthog } from "@/lib/posthog";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Types
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

interface LMSGrade {
  course_name: string;
  overall_grade: string | null;
  overall_percentage: number | null;
  category_breakdown: Record<string, unknown>;
}

interface SyncStatus {
  last_sync: { completed_at: string; data_extracted: Record<string, number>; status?: string; error_message?: string } | null;
  is_syncing: boolean;
  running_job_id: string | null;
  credentials: { lms_type: string; last_login_success: boolean; sync_enabled: boolean }[];
}

interface CourseContext {
  class_name: string;
  teacher_name: string | null;
  period: string | null;
}

interface StudentProfile {
  display_name: string | null;
  personality_preset: string;
  onboarding_complete: boolean;
  goals: string[];
  daily_briefing_enabled: boolean;
}

interface StreakData {
  current_streak: number;
  longest_streak: number;
  total_active_days: number;
}

interface DailyPlan {
  plan: string;
  generated_at: string;
}

// Toast system
interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

let toastId = 0;

export default function TodayPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [grades, setGrades] = useState<LMSGrade[]>([]);
  const [courses, setCourses] = useState<CourseContext[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);
  const [token, setToken] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const safetyRef = useRef<NodeJS.Timeout | null>(null);

  // Toast helpers
  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // Cleanup poll/safety timers on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (safetyRef.current) clearTimeout(safetyRef.current);
    };
  }, []);

  // Get auth token
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
      }
    });
  }, []);

  // Stale-while-revalidate: load cached data immediately
  useEffect(() => {
    try {
      const cached = localStorage.getItem("sp_today_cache");
      if (cached) {
        const data = JSON.parse(cached);
        if (data.assignments) setAssignments(data.assignments);
        if (data.grades) setGrades(data.grades);
        if (data.courses) setCourses(data.courses);
        if (data.streak) setStreak(data.streak);
      }
    } catch {
      // ignore cache errors
    }
  }, []);

  // Fetch data once we have a token
  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");

    const headers = { Authorization: `Bearer ${token}` };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const [assignRes, gradeRes, syncRes, profileRes, coursesRes, streakRes, planRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/agent/assignments?upcoming_only=false&limit=50`, { headers, signal: controller.signal }),
        fetch(`${API_URL}/api/agent/grades`, { headers, signal: controller.signal }),
        fetch(`${API_URL}/api/agent/sync-status`, { headers, signal: controller.signal }),
        fetch(`${API_URL}/api/profile/me`, { headers, signal: controller.signal }),
        fetch(`${API_URL}/api/profile/classes`, { headers, signal: controller.signal }),
        fetch(`${API_URL}/api/focus/stats`, { headers, signal: controller.signal }),
        fetch(`${API_URL}/api/plan/today`, { headers, signal: controller.signal }),
      ]);

      const newAssignments: Assignment[] = [];
      const newGrades: LMSGrade[] = [];

      if (assignRes.status === "fulfilled" && assignRes.value.ok) {
        const json = await assignRes.value.json();
        const all: Assignment[] = Array.isArray(json) ? json : json.data || [];
        all.sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        });
        setAssignments(all);
        newAssignments.push(...all);
      }
      if (gradeRes.status === "fulfilled" && gradeRes.value.ok) {
        const json = await gradeRes.value.json();
        const g = Array.isArray(json) ? json : json.data || [];
        setGrades(g);
        newGrades.push(...g);
      }
      if (syncRes.status === "fulfilled" && syncRes.value.ok) {
        const data = await syncRes.value.json();
        setSyncStatus(data);
        setSyncing(data.is_syncing);
      }
      if (profileRes.status === "fulfilled" && profileRes.value.ok) {
        const data = await profileRes.value.json();
        setProfile(data);
      }
      let newCourses: CourseContext[] = [];
      if (coursesRes.status === "fulfilled" && coursesRes.value.ok) {
        const data = await coursesRes.value.json();
        newCourses = Array.isArray(data) ? data : [];
        setCourses(newCourses);
      }
      let newStreak: StreakData | null = null;
      if (streakRes.status === "fulfilled" && streakRes.value.ok) {
        const data = await streakRes.value.json();
        newStreak = { current_streak: data.current_streak || 0, longest_streak: data.longest_streak || 0, total_active_days: data.total_active_days || 0 };
        setStreak(newStreak);
      }
      if (planRes.status === "fulfilled" && planRes.value.ok) {
        const data = await planRes.value.json();
        if (data.plan) setDailyPlan(data);
      }

      // Cache for stale-while-revalidate
      try {
        localStorage.setItem("sp_today_cache", JSON.stringify({
          assignments: newAssignments, grades: newGrades, courses: newCourses, streak: newStreak,
        }));
      } catch { /* ignore */ }
    } catch {
      setError("Failed to load data. Is the backend running?");
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate daily plan
  const generatePlan = async () => {
    if (!token || planLoading) return;
    setPlanLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/plan/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setDailyPlan({ plan: data.plan || data.content || "Plan generated!", generated_at: new Date().toISOString() });
        addToast("Daily plan generated!", "success");
      } else {
        addToast("Failed to generate plan", "error");
      }
    } catch {
      addToast("Failed to generate plan", "error");
    } finally {
      setPlanLoading(false);
    }
  };

  // Trigger manual sync
  const handleSync = async () => {
    if (!token || syncing) return;
    setSyncing(true);
    setSyncProgress("Connecting to LMS...");
    posthog.capture("sync_triggered", { trigger: "manual" });
    try {
      const res = await fetch(`${API_URL}/api/agent/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ job_type: "full_sync" }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Sync failed");
        setSyncing(false);
        setSyncProgress("");
        return;
      }

      if (pollRef.current) clearInterval(pollRef.current);
      if (safetyRef.current) clearTimeout(safetyRef.current);

      let pollCount = 0;
      pollRef.current = setInterval(async () => {
        pollCount++;
        // Update progress message based on time elapsed
        if (pollCount < 5) setSyncProgress("Connecting to LMS...");
        else if (pollCount < 10) setSyncProgress(`Found ${courses.length} classes...`);
        else if (pollCount < 20) setSyncProgress("Extracting assignments...");
        else setSyncProgress("Still working...");

        try {
          const syncRes = await fetch(`${API_URL}/api/agent/sync-status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (syncRes.ok) {
            const data = await syncRes.json();
            if (!data.is_syncing) {
              if (pollRef.current) clearInterval(pollRef.current);
              if (safetyRef.current) clearTimeout(safetyRef.current);
              pollRef.current = null;
              safetyRef.current = null;
              setSyncing(false);
              setSyncProgress("");

              if (data.last_sync?.status === "failed") {
                const errMsg = data.last_sync.error_message || "";
                if (errMsg.includes("session_expired") || errMsg.toLowerCase().includes("session expired")) {
                  setSessionExpired(true);
                  setError("");
                } else {
                  setError(errMsg || "Sync failed. Check your LMS credentials in Settings.");
                }
              } else {
                const extracted = data.last_sync?.data_extracted;
                const total = extracted ? Object.values(extracted).reduce((a: number, b: unknown) => a + (b as number), 0) : 0;
                posthog.capture("sync_completed", { items: total, assignments: extracted?.assignments || 0, grades: extracted?.grades || 0 });
                addToast(`Sync complete! Found ${total} items.`, "success");
                fetchData();
              }
            }
          }
        } catch {
          // ignore poll errors
        }
      }, 3000);

      safetyRef.current = setTimeout(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        safetyRef.current = null;
        setSyncing(false);
        setSyncProgress("");
        setError("Sync timed out after 3 minutes. The backend may be stuck — try again.");
      }, 180000);
    } catch {
      setError("Failed to start sync");
      setSyncing(false);
      setSyncProgress("");
    }
  };

  // Helpers
  const formatDue = (dateStr: string | null) => {
    if (!dateStr) return "No due date";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffHours < 0) return "Overdue";
    if (diffHours < 24) return `${diffHours}h left`;
    if (diffDays < 7) return `${diffDays}d left`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const urgencyColor = (dateStr: string | null) => {
    if (!dateStr) return "text-muted";
    const diffMs = new Date(dateStr).getTime() - Date.now();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 0) return "text-error";
    if (diffHours < 24) return "text-error";
    if (diffHours < 72) return "text-warning";
    return "text-text-secondary";
  };

  const typeIcon = (type: string | null) => {
    switch (type?.toLowerCase()) {
      case "test": case "exam": return "\u{1F4DD}";
      case "quiz": return "\u{2753}";
      case "essay": case "paper": return "\u{270D}\u{FE0F}";
      case "lab": return "\u{1F52C}";
      case "project": return "\u{1F4C1}";
      case "homework": return "\u{1F4DA}";
      default: return "\u{1F4CB}";
    }
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  if (loading && assignments.length === 0 && courses.length === 0) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse space-y-6">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-surface rounded-xl" />)}
        </div>
        <div className="h-32 bg-surface rounded-xl" />
        <div className="h-64 bg-surface rounded-xl" />
      </div>
    );
  }

  const hasLMS = (syncStatus?.credentials?.length ?? 0) > 0;
  const hasSynced = !!syncStatus?.last_sync;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg transition-all animate-in fade-in slide-in-from-top-2 ${
              toast.type === "success" ? "bg-success/90 text-white" :
              toast.type === "error" ? "bg-error/90 text-white" :
              "bg-surface border border-border text-white"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Header with sticky sync button on mobile */}
      <div className="flex items-center justify-between sticky top-0 z-10 bg-bg/80 backdrop-blur-sm py-3 -mx-4 px-4 md:static md:bg-transparent md:backdrop-blur-none md:py-0 md:mx-0 md:px-0">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {greeting()}{profile?.display_name ? `, ${profile.display_name}` : ""}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing || !hasLMS}
          className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium transition-all cursor-pointer disabled:cursor-not-allowed ${
            syncing
              ? "bg-accent/80 sync-glow"
              : "bg-accent hover:bg-accent-hover disabled:opacity-50"
          }`}
          aria-label="Sync with LMS"
        >
          <svg className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M21.015 4.356v4.992" />
          </svg>
          {syncing ? "Syncing..." : "Sync LMS"}
        </button>
      </div>

      {/* Sync progress indicator */}
      {syncing && syncProgress && (
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-accent text-sm font-medium">{syncProgress}</p>
        </div>
      )}

      {sessionExpired && !showReconnect && (
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-warning font-medium text-sm">Your LMS session has expired</p>
            <p className="text-muted text-xs mt-1">Log in again to resume automatic syncing.</p>
          </div>
          <button
            onClick={() => setShowReconnect(true)}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors cursor-pointer shrink-0 ml-4"
          >
            Reconnect
          </button>
        </div>
      )}

      {showReconnect && (
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Reconnect to your LMS</h3>
            <button
              onClick={() => setShowReconnect(false)}
              className="text-muted hover:text-white text-sm cursor-pointer"
            >
              Cancel
            </button>
          </div>
          <RemoteBrowser
            onComplete={() => {
              setShowReconnect(false);
              setSessionExpired(false);
              setError("");
              fetchData();
            }}
            onError={(msg) => setError(msg)}
          />
        </div>
      )}

      {error && !sessionExpired && (
        <div className="bg-error/10 border border-error/20 text-error rounded-xl p-4 text-sm">{error}</div>
      )}

      {/* Smart empty states */}
      {!hasLMS && !loading && (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">{"\u{1F517}"}</div>
          <h2 className="text-lg font-semibold text-white mb-2">Connect your LMS to get started</h2>
          <p className="text-text-secondary text-sm mb-4">
            Link your Teamie account to automatically sync your classes, assignments, and grades.
          </p>
          <button
            onClick={() => router.push("/settings")}
            className="px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors cursor-pointer"
          >
            Connect LMS
          </button>
        </div>
      )}

      {hasLMS && !hasSynced && !syncing && !loading && (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">{"\u{2705}"}</div>
          <h2 className="text-lg font-semibold text-white mb-2">Your LMS is connected!</h2>
          <p className="text-text-secondary text-sm mb-4">
            Hit Sync to pull in your classes, assignments, and grades.
          </p>
          <button
            onClick={handleSync}
            className="px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors cursor-pointer"
          >
            Sync Now
          </button>
        </div>
      )}

      {/* Stats Cards — horizontal scroll on mobile */}
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 md:overflow-visible">
        {/* Assignments count */}
        <div className="bg-surface border border-border rounded-xl p-4 min-w-[140px] flex-shrink-0">
          <p className="text-muted text-xs uppercase tracking-wider mb-1">Assignments</p>
          <p className="text-3xl font-bold text-white">{assignments.length}</p>
          <p className="text-text-secondary text-sm">
            {(() => {
              const overdue = assignments.filter(a => a.due_date && new Date(a.due_date) < new Date()).length;
              return overdue > 0 ? `${overdue} overdue` : "tracked";
            })()}
          </p>
        </div>

        {/* Courses tracked */}
        <div className="bg-surface border border-border rounded-xl p-4 min-w-[140px] flex-shrink-0">
          <p className="text-muted text-xs uppercase tracking-wider mb-1">Courses</p>
          <p className="text-3xl font-bold text-white">{courses.length}</p>
          <p className="text-text-secondary text-sm">classes tracked</p>
        </div>

        {/* Streak counter */}
        <div className="bg-surface border border-border rounded-xl p-4 min-w-[140px] flex-shrink-0">
          <p className="text-muted text-xs uppercase tracking-wider mb-1">Streak</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl">{"\u{1F525}"}</span>
            <p className="text-3xl font-bold text-white">{streak?.current_streak ?? 0}</p>
          </div>
          <p className="text-text-secondary text-sm">
            {streak?.longest_streak ? `Best: ${streak.longest_streak}` : "days active"}
          </p>
        </div>

        {/* Last sync */}
        <div className="bg-surface border border-border rounded-xl p-4 min-w-[140px] flex-shrink-0">
          <p className="text-muted text-xs uppercase tracking-wider mb-1">Last Sync</p>
          <p className="text-lg font-bold text-white">
            {syncStatus?.last_sync?.completed_at
              ? new Date(syncStatus.last_sync.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
              : "Never"}
          </p>
          <p className="text-text-secondary text-sm">
            {!hasLMS
              ? "No LMS connected"
              : syncStatus?.last_sync
                ? `${Object.values(syncStatus.last_sync.data_extracted || {}).reduce((a, b) => a + (b as number), 0)} items extracted`
                : "Connect your LMS in settings"}
          </p>
        </div>
      </div>

      {/* Today's Plan */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Today&apos;s Plan</h2>
          <button
            onClick={generatePlan}
            disabled={planLoading}
            className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            {planLoading ? "Generating..." : dailyPlan ? "Regenerate" : "Generate Plan"}
          </button>
        </div>
        {planLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-bg rounded w-3/4" />
            <div className="h-4 bg-bg rounded w-1/2" />
            <div className="h-4 bg-bg rounded w-2/3" />
          </div>
        ) : dailyPlan?.plan ? (
          <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
            {dailyPlan.plan}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted text-sm mb-3">
              {assignments.length > 0
                ? "Get an AI-powered daily plan based on your assignments."
                : "Sync your LMS first, then generate a personalized daily plan."}
            </p>
            {assignments.length > 0 && (
              <button
                onClick={generatePlan}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Generate Plan
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grade Overview — always show courses */}
      {(courses.length > 0 || grades.length > 0) && (
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Grade Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {/* Show grades where available, otherwise show courses */}
            {courses.map((c) => {
              const grade = grades.find(g => g.course_name === c.class_name);
              const pct = grade?.overall_percentage ?? null;
              const color = pct === null ? "text-muted"
                : pct >= 90 ? "text-success"
                : pct >= 80 ? "text-accent"
                : pct >= 70 ? "text-warning"
                : "text-error";
              return (
                <div key={c.class_name} className="bg-bg rounded-lg p-3">
                  <p className="text-sm text-text-secondary truncate">{c.class_name}</p>
                  <p className={`text-xl font-bold ${color}`}>
                    {grade?.overall_grade || (pct !== null ? `${pct}%` : "No grade data")}
                  </p>
                  {c.teacher_name && (
                    <p className="text-xs text-muted truncate">{c.teacher_name}</p>
                  )}
                </div>
              );
            })}
            {/* Show any grades for courses not in class_context */}
            {grades
              .filter(g => !courses.find(c => c.class_name === g.course_name))
              .map(g => {
                const pct = g.overall_percentage;
                const color = pct === null ? "text-muted"
                  : pct >= 90 ? "text-success"
                  : pct >= 80 ? "text-accent"
                  : pct >= 70 ? "text-warning"
                  : "text-error";
                return (
                  <div key={g.course_name} className="bg-bg rounded-lg p-3">
                    <p className="text-sm text-text-secondary truncate">{g.course_name}</p>
                    <p className={`text-xl font-bold ${color}`}>
                      {g.overall_grade || (pct !== null ? `${pct}%` : "\u2014")}
                    </p>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {/* Assignments — split into overdue + upcoming */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Assignments</h2>
        {assignments.length === 0 ? (
          <p className="text-muted text-sm">
            {!hasLMS
              ? "Connect your LMS to see assignments here."
              : hasSynced
                ? "We couldn't find assignments. Try syncing again or check your LMS connection in Settings."
                : "Your LMS is connected! Hit Sync to pull in your classes."}
          </p>
        ) : (
          <div className="space-y-4">
            {(() => {
              const now = new Date();
              const overdue = assignments.filter(a => a.due_date && new Date(a.due_date) < now);
              const upcoming = assignments.filter(a => a.due_date && new Date(a.due_date) >= now);
              const noDate = assignments.filter(a => !a.due_date);

              return (
                <>
                  {overdue.length > 0 && (
                    <div>
                      <p className="text-error text-xs font-semibold uppercase tracking-wider mb-2">
                        Overdue ({overdue.length})
                      </p>
                      <div className="space-y-2">
                        {overdue.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center gap-3 p-3 md:p-3 bg-error/5 border border-error/10 rounded-lg min-h-[56px]"
                          >
                            <span className="text-lg">{typeIcon(a.assignment_type)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{a.title}</p>
                              <p className="text-xs text-muted">
                                {a.course_name}
                                {a.points_possible ? ` \u00B7 ${a.points_possible} pts` : ""}
                                {a.assignment_type ? ` \u00B7 ${a.assignment_type}` : ""}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium text-error">{formatDue(a.due_date)}</p>
                              {a.is_submitted && <span className="text-xs text-success">Submitted</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {upcoming.length > 0 && (
                    <div>
                      <p className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
                        Upcoming ({upcoming.length})
                      </p>
                      <div className="space-y-2">
                        {upcoming.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center gap-3 p-3 bg-bg rounded-lg hover:bg-surface-hover transition-colors min-h-[56px]"
                          >
                            <span className="text-lg">{typeIcon(a.assignment_type)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{a.title}</p>
                              <p className="text-xs text-muted">
                                {a.course_name}
                                {a.points_possible ? ` \u00B7 ${a.points_possible} pts` : ""}
                                {a.assignment_type ? ` \u00B7 ${a.assignment_type}` : ""}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-sm font-medium ${urgencyColor(a.due_date)}`}>
                                {formatDue(a.due_date)}
                              </p>
                              {a.is_submitted && <span className="text-xs text-success">Submitted</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {noDate.length > 0 && (
                    <div>
                      <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">
                        No Due Date ({noDate.length})
                      </p>
                      <div className="space-y-2">
                        {noDate.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center gap-3 p-3 bg-bg rounded-lg hover:bg-surface-hover transition-colors min-h-[56px]"
                          >
                            <span className="text-lg">{typeIcon(a.assignment_type)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{a.title}</p>
                              <p className="text-xs text-muted">
                                {a.course_name}
                                {a.points_possible ? ` \u00B7 ${a.points_possible} pts` : ""}
                                {a.assignment_type ? ` \u00B7 ${a.assignment_type}` : ""}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm text-muted">No date</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "What should I work on?", icon: "\u{1F3AF}" },
            { label: "Help me study", icon: "\u{1F4D6}" },
            { label: "Create a study plan", icon: "\u{1F4C5}" },
            { label: "What's due this week?", icon: "\u{1F4CB}" },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => {
                window.dispatchEvent(new CustomEvent("open-chat", { detail: { message: action.label } }));
              }}
              className="flex items-center gap-2 px-4 py-2 bg-bg hover:bg-surface-hover border border-border rounded-lg text-sm text-text-secondary hover:text-white transition-colors cursor-pointer"
            >
              <span>{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
