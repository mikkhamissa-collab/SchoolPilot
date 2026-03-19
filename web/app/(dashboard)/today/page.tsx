"use client";

import { createClient } from "@/lib/supabase-client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

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
  last_sync: { completed_at: string; data_extracted: Record<string, number> } | null;
  is_syncing: boolean;
  running_job_id: string | null;
  credentials: { lms_type: string; last_login_success: boolean; sync_enabled: boolean }[];
}

interface StudentProfile {
  display_name: string | null;
  personality_preset: string;
  onboarding_complete: boolean;
  goals: string[];
  daily_briefing_enabled: boolean;
}

export default function TodayPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [grades, setGrades] = useState<LMSGrade[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const safetyRef = useRef<NodeJS.Timeout | null>(null);

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

  // Fetch data once we have a token
  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");

    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [assignRes, gradeRes, syncRes, profileRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/agent/assignments?upcoming_only=true`, { headers }),
        fetch(`${API_URL}/api/agent/grades`, { headers }),
        fetch(`${API_URL}/api/agent/sync-status`, { headers }),
        fetch(`${API_URL}/api/profile/me`, { headers }),
      ]);

      if (assignRes.status === "fulfilled" && assignRes.value.ok) {
        const json = await assignRes.value.json();
        // Backend returns paginated {data: [...], total, limit, offset}
        setAssignments(Array.isArray(json) ? json : json.data || []);
      }
      if (gradeRes.status === "fulfilled" && gradeRes.value.ok) {
        const json = await gradeRes.value.json();
        setGrades(Array.isArray(json) ? json : json.data || []);
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
    } catch {
      setError("Failed to load data. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [token, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Trigger manual sync
  const handleSync = async () => {
    if (!token || syncing) return;
    setSyncing(true);
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
        return;
      }
      // Clear any existing poll
      if (pollRef.current) clearInterval(pollRef.current);
      if (safetyRef.current) clearTimeout(safetyRef.current);

      // Poll for completion
      pollRef.current = setInterval(async () => {
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
            // Check if the latest completed job actually failed
            if (data.last_sync?.status === "failed") {
              setError(data.last_sync.error_message || "Sync failed. Check your LMS credentials in Settings.");
            } else {
              fetchData();
            }
          }
        }
      }, 3000);

      // Safety timeout
      safetyRef.current = setTimeout(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        safetyRef.current = null;
        setSyncing(false);
      }, 120000);
    } catch {
      setError("Failed to start sync");
      setSyncing(false);
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
    if (!dateStr) return "text-text-muted";
    const diffMs = new Date(dateStr).getTime() - Date.now();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 0) return "text-error";
    if (diffHours < 24) return "text-error";
    if (diffHours < 72) return "text-warning";
    return "text-text-secondary";
  };

  const typeIcon = (type: string | null) => {
    switch (type?.toLowerCase()) {
      case "test": case "exam": return "📝";
      case "quiz": return "❓";
      case "essay": case "paper": return "✍️";
      case "lab": return "🔬";
      case "project": return "📁";
      case "homework": return "📚";
      default: return "📋";
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse space-y-6">
        <div className="h-8 w-48 bg-bg-card rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-bg-card rounded-xl" />)}
        </div>
        <div className="h-64 bg-bg-card rounded-xl" />
      </div>
    );
  }

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
          disabled={syncing || !syncStatus?.credentials?.length}
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

      {error && (
        <div className="bg-error/10 border border-error/20 text-error rounded-xl p-4 text-sm">{error}</div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Assignments due */}
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Due Soon</p>
          <p className="text-3xl font-bold text-white">{assignments.length}</p>
          <p className="text-text-secondary text-sm">upcoming assignments</p>
        </div>

        {/* Courses tracked */}
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Courses</p>
          <p className="text-3xl font-bold text-white">{grades.length}</p>
          <p className="text-text-secondary text-sm">classes tracked</p>
        </div>

        {/* Last sync */}
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Last Sync</p>
          <p className="text-lg font-bold text-white">
            {syncStatus?.last_sync?.completed_at
              ? new Date(syncStatus.last_sync.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
              : "Never"}
          </p>
          <p className="text-text-secondary text-sm">
            {!syncStatus?.credentials?.length
              ? "No LMS connected"
              : syncStatus?.last_sync
                ? `${Object.values(syncStatus.last_sync.data_extracted || {}).reduce((a, b) => a + b, 0)} items extracted`
                : "Connect your LMS in settings"}
          </p>
        </div>
      </div>

      {/* Grades Overview */}
      {grades.length > 0 && (
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Grade Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {grades.map((g) => {
              const pct = g.overall_percentage;
              const color = pct === null ? "text-text-muted"
                : pct >= 90 ? "text-success"
                : pct >= 80 ? "text-accent"
                : pct >= 70 ? "text-warning"
                : "text-error";
              return (
                <div key={g.course_name} className="bg-bg-dark rounded-lg p-3">
                  <p className="text-sm text-text-secondary truncate">{g.course_name}</p>
                  <p className={`text-xl font-bold ${color}`}>
                    {g.overall_grade || (pct !== null ? `${pct}%` : "—")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming Assignments */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Upcoming Assignments</h2>
        {assignments.length === 0 ? (
          <p className="text-text-muted text-sm">
            {syncStatus?.credentials?.length
              ? "No upcoming assignments found. Try syncing your LMS."
              : "Connect your LMS in settings to see assignments here."}
          </p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 p-3 bg-bg-dark rounded-lg hover:bg-bg-hover transition-colors"
              >
                <span className="text-lg">{typeIcon(a.assignment_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{a.title}</p>
                  <p className="text-xs text-text-muted">
                    {a.course_name}
                    {a.points_possible ? ` · ${a.points_possible} pts` : ""}
                    {a.assignment_type ? ` · ${a.assignment_type}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${urgencyColor(a.due_date)}`}>
                    {formatDue(a.due_date)}
                  </p>
                  {a.is_submitted && (
                    <span className="text-xs text-success">Submitted</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions — prompts the chat sidebar */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "What should I work on?", icon: "🎯" },
            { label: "Help me study", icon: "📖" },
            { label: "Create a study plan", icon: "📅" },
            { label: "What's due this week?", icon: "📋" },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => {
                // Dispatch event to open chat sidebar with this message
                window.dispatchEvent(new CustomEvent("open-chat", { detail: { message: action.label } }));
              }}
              className="flex items-center gap-2 px-4 py-2 bg-bg-dark hover:bg-bg-hover border border-border rounded-lg text-sm text-text-secondary hover:text-white transition-colors cursor-pointer"
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
