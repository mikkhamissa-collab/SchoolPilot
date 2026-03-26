"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";
import { posthog } from "@/lib/posthog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FocusSession {
  id: string;
  duration_minutes: number;
  focus_type: string;
  assignment_id: string | null;
  completed_at: string;
}

interface FocusStats {
  today_minutes: number;
  week_minutes: number;
  current_streak: number;
  longest_streak: number;
  total_active_days: number;
  sessions_today: FocusSession[];
  daily_minutes?: number[]; // last 7 days, index 0 = 6 days ago, index 6 = today
}

interface Assignment {
  id: string;
  title: string;
  course_name?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const PRESETS = [
  { label: "Pomodoro", minutes: 25, type: "pomodoro" },
  { label: "Deep Work", minutes: 45, type: "deep_work" },
  { label: "Quick", minutes: 15, type: "quick" },
] as const;

const STORAGE_KEY = "schoolpilot_focus_timer";
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const expiresAt = session.expires_at ?? 0;
      if (expiresAt - Math.floor(Date.now() / 1000) > 60) {
        return session.access_token;
      }
    }
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    return refreshed?.access_token ?? null;
  } catch {
    return null;
  }
}

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    let msg = `API error: ${res.status}`;
    try {
      const err = await res.json();
      if (typeof err.detail === "string") msg = err.detail;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

function formatTime(totalSeconds: number): { mm: string; ss: string } {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return { mm: String(m).padStart(2, "0"), ss: String(s).padStart(2, "0") };
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.5);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch { /* Audio not available */ }
}

function getLast7DayLabels(): string[] {
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]);
  }
  return labels;
}

// ---------------------------------------------------------------------------
// Persisted timer state
// ---------------------------------------------------------------------------

interface PersistedTimer {
  startTime: number;       // Date.now() when started
  totalSeconds: number;    // total duration in seconds
  selectedMinutes: number; // preset used
  focusType: string;
  assignmentId: string | null;
}

function saveTimer(state: PersistedTimer) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadTimer(): PersistedTimer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedTimer;
  } catch {
    return null;
  }
}

function clearTimer() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Progress Ring Component
// ---------------------------------------------------------------------------

function ProgressRing({ progress, size = 220 }: { progress: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(progress, 1));

  return (
    <svg
      className="absolute inset-0 -rotate-90"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      {/* Background track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#1a1a2e"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#7c3aed"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-1000 ease-linear"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Celebration Modal
// ---------------------------------------------------------------------------

function CelebrationModal({
  minutes,
  onClose,
}: {
  minutes: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-2xl p-8 max-w-sm w-full mx-4 text-center animate-in fade-in zoom-in duration-300">
        <div className="text-5xl mb-4">&#127881;</div>
        <h2 className="text-2xl font-bold text-white mb-2">Session Complete!</h2>
        <p className="text-text-secondary mb-6">
          You focused for <span className="text-accent font-semibold">{minutes} minutes</span>.
          Great work — keep the streak going!
        </p>
        <button
          onClick={onClose}
          className="px-6 py-3 bg-accent hover:bg-accent/80 rounded-xl text-white font-semibold transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly Bar Chart
// ---------------------------------------------------------------------------

function WeeklyChart({ dailyMinutes }: { dailyMinutes: number[] }) {
  const labels = getLast7DayLabels();
  const max = Math.max(...dailyMinutes, 1);

  return (
    <div className="bg-bg-card rounded-xl p-5 border border-border">
      <h3 className="text-sm font-medium text-text-secondary mb-4">This Week</h3>
      <div className="flex items-end justify-between gap-2 h-32">
        {dailyMinutes.map((mins, i) => {
          const heightPct = (mins / max) * 100;
          return (
            <div key={i} className="flex flex-col items-center flex-1 h-full justify-end">
              {mins > 0 && (
                <span className="text-[10px] text-text-muted mb-1">{mins}m</span>
              )}
              <div
                className="w-full max-w-[32px] rounded-t-md transition-all duration-500"
                style={{
                  height: `${Math.max(heightPct, mins > 0 ? 4 : 0)}%`,
                  backgroundColor: i === 6 ? "#7c3aed" : "#3b3b5c",
                }}
              />
              <span className="text-[10px] text-text-muted mt-2">{labels[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function FocusPage() {
  // Timer state
  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");
  const [focusType, setFocusType] = useState("pomodoro");
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);

  // Data state
  const [stats, setStats] = useState<FocusStats | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [completedMinutes, setCompletedMinutes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const totalSecondsRef = useRef<number>(0);

  // ------ Data loading ------

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch<FocusStats>("/api/focus/stats");
      setStats(data);
    } catch (err) {
      console.error("Failed to load focus stats:", err);
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    try {
      const data = await apiFetch<Assignment[]>("/api/assignments");
      setAssignments(data);
    } catch {
      // Not critical — assignments list is optional
    }
  }, []);

  // ------ Timer persistence & restore ------

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const completeSession = useCallback(async (durationMs: number) => {
    stopInterval();
    clearTimer();
    setIsRunning(false);
    setTimeLeft(0);

    const elapsedMinutes = Math.max(1, Math.round(durationMs / 60000));
    setCompletedMinutes(elapsedMinutes);
    posthog.capture("focus_session_completed", { duration: elapsedMinutes, type: focusType });

    playChime();
    setShowCelebration(true);

    try {
      const body: Record<string, unknown> = {
        duration_minutes: elapsedMinutes,
        focus_type: focusType,
      };
      if (selectedAssignment) {
        body.assignment_id = selectedAssignment;
      }
      await apiFetch("/api/focus/session", {
        method: "POST",
        body: JSON.stringify(body),
      });
      loadStats();
    } catch (err) {
      console.error("Failed to log focus session:", err);
      setError("Session completed but failed to save. Check your connection.");
    }
  }, [focusType, selectedAssignment, loadStats, stopInterval]);

  // Tick function — recalculates from wall clock
  const tick = useCallback(() => {
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const remaining = totalSecondsRef.current - elapsed;
    if (remaining <= 0) {
      setTimeLeft(0);
      completeSession(Date.now() - startTimeRef.current);
    } else {
      setTimeLeft(remaining);
    }
  }, [completeSession]);

  const startInterval = useCallback(() => {
    stopInterval();
    intervalRef.current = setInterval(tick, 1000);
  }, [tick, stopInterval]);

  // Restore timer from localStorage on mount
  useEffect(() => {
    loadStats();
    loadAssignments();

    const saved = loadTimer();
    if (saved) {
      const elapsed = Math.floor((Date.now() - saved.startTime) / 1000);
      const remaining = saved.totalSeconds - elapsed;
      if (remaining > 0) {
        startTimeRef.current = saved.startTime;
        totalSecondsRef.current = saved.totalSeconds;
        setSelectedMinutes(saved.selectedMinutes);
        setFocusType(saved.focusType);
        setSelectedAssignment(saved.assignmentId);
        setTimeLeft(remaining);
        setIsRunning(true);
      } else {
        // Timer already expired while away
        clearTimer();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start/stop interval when isRunning changes
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      startInterval();
    } else {
      stopInterval();
    }
    return stopInterval;
  }, [isRunning, startInterval, stopInterval, timeLeft]);

  // ------ Actions ------

  function startTimer() {
    const mins = customMinutes ? parseInt(customMinutes, 10) : selectedMinutes;
    if (!mins || mins <= 0 || mins > 180) return;

    const totalSecs = mins * 60;
    const now = Date.now();
    const type = PRESETS.find((p) => p.minutes === mins)?.type || "custom";

    setSelectedMinutes(mins);
    setFocusType(type);
    setTimeLeft(totalSecs);
    setIsRunning(true);
    setError(null);
    posthog.capture("focus_session_started", { duration: mins, type });

    startTimeRef.current = now;
    totalSecondsRef.current = totalSecs;

    saveTimer({
      startTime: now,
      totalSeconds: totalSecs,
      selectedMinutes: mins,
      focusType: type,
      assignmentId: selectedAssignment,
    });
  }

  function stopTimer() {
    stopInterval();
    clearTimer();
    setIsRunning(false);
    setTimeLeft(0);
  }

  // ------ Derived values ------

  const { mm, ss } = formatTime(timeLeft);
  const totalSecs = selectedMinutes * 60;
  const progress = totalSecs > 0 ? (totalSecs - timeLeft) / totalSecs : 0;
  const dailyMinutes = stats?.daily_minutes ?? [0, 0, 0, 0, 0, 0, 0];
  const sessionsToday = stats?.sessions_today ?? [];

  // ------ Render ------

  return (
    <div className="max-w-2xl mx-auto p-6 pb-20">
      <h1 className="text-2xl font-bold text-white mb-6">Focus Timer</h1>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Streak & Stats Row */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-bg-card rounded-xl p-4 border border-border text-center">
            <p className="text-3xl font-bold text-accent">{stats.current_streak}</p>
            <p className="text-xs text-text-muted mt-1">Day Streak</p>
            {stats.longest_streak > 0 && (
              <p className="text-[10px] text-text-muted">Best: {stats.longest_streak}</p>
            )}
          </div>
          <div className="bg-bg-card rounded-xl p-4 border border-border text-center">
            <p className="text-3xl font-bold text-white">{stats.today_minutes}</p>
            <p className="text-xs text-text-muted mt-1">Minutes Today</p>
          </div>
          <div className="bg-bg-card rounded-xl p-4 border border-border text-center">
            <p className="text-3xl font-bold text-white">{Math.round(stats.week_minutes / 60)}h {stats.week_minutes % 60}m</p>
            <p className="text-xs text-text-muted mt-1">This Week</p>
          </div>
        </div>
      )}

      {/* Timer Card */}
      <div className="bg-bg-card rounded-2xl p-8 border border-border text-center mb-6">
        {/* Progress Ring + Countdown */}
        <div className="relative w-[220px] h-[220px] mx-auto mb-6">
          <ProgressRing progress={progress} size={220} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-5xl font-mono font-bold text-white tracking-wider"
              role="timer"
              aria-live="off"
              aria-label={`${mm} minutes ${ss} seconds remaining`}
            >
              {mm}:{ss}
            </span>
          </div>
        </div>

        {!isRunning && timeLeft === 0 ? (
          <>
            {/* Presets */}
            <div className="flex flex-wrap justify-center gap-3 mb-4">
              {PRESETS.map((p) => (
                <button
                  key={p.type}
                  onClick={() => {
                    setSelectedMinutes(p.minutes);
                    setCustomMinutes("");
                    setFocusType(p.type);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedMinutes === p.minutes && !customMinutes
                      ? "bg-accent text-white"
                      : "bg-bg-dark text-text-secondary hover:text-white border border-border"
                  }`}
                >
                  {p.label} ({p.minutes}m)
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="flex items-center justify-center gap-2 mb-5">
              <label className="sr-only" htmlFor="custom-minutes">Custom minutes</label>
              <input
                id="custom-minutes"
                type="number"
                min="1"
                max="180"
                value={customMinutes}
                onChange={(e) => {
                  setCustomMinutes(e.target.value);
                  if (e.target.value) {
                    setFocusType("custom");
                    setSelectedMinutes(parseInt(e.target.value, 10) || 25);
                  }
                }}
                placeholder="Custom min"
                className="w-28 bg-bg-dark border border-border rounded-lg px-3 py-2 text-center text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm"
              />
            </div>

            {/* Assignment picker */}
            {assignments.length > 0 && (
              <div className="mb-5">
                <label className="sr-only" htmlFor="assignment-select">Tag an assignment</label>
                <select
                  id="assignment-select"
                  value={selectedAssignment ?? ""}
                  onChange={(e) => setSelectedAssignment(e.target.value || null)}
                  className="w-64 max-w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent appearance-none cursor-pointer"
                >
                  <option value="">No assignment (general focus)</option>
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.course_name ? `${a.course_name}: ` : ""}{a.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Start button */}
            <button
              onClick={startTimer}
              className="px-8 py-3 bg-accent hover:bg-accent/80 rounded-xl text-white font-semibold text-lg transition-colors"
            >
              Start Focus
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-text-muted">
              {focusType === "pomodoro" ? "Pomodoro" : focusType === "deep_work" ? "Deep Work" : focusType === "quick" ? "Quick" : "Custom"} session
            </p>
            <button
              onClick={stopTimer}
              className="px-8 py-3 bg-red-500/20 hover:bg-red-500/30 rounded-xl text-red-400 font-semibold text-lg transition-colors border border-red-500/30"
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Weekly Chart */}
      <div className="mb-6">
        <WeeklyChart dailyMinutes={dailyMinutes} />
      </div>

      {/* Today's Sessions */}
      {sessionsToday.length > 0 && (
        <div className="bg-bg-card rounded-xl p-5 border border-border mb-6">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Today&apos;s Sessions</h3>
          <div className="space-y-2">
            {sessionsToday.map((session, idx) => {
              const time = new Date(session.completed_at);
              const hours = time.getHours();
              const minutes = time.getMinutes();
              const ampm = hours >= 12 ? "PM" : "AM";
              const h = hours % 12 || 12;
              const label =
                session.focus_type === "pomodoro"
                  ? "Pomodoro"
                  : session.focus_type === "deep_work"
                  ? "Deep Work"
                  : session.focus_type === "quick"
                  ? "Quick"
                  : "Custom";
              return (
                <div
                  key={session.id || idx}
                  className="flex items-center justify-between py-2 border-b border-border last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-accent" />
                    <span className="text-sm text-white">{label}</span>
                    <span className="text-xs text-text-muted">{session.duration_minutes}m</span>
                  </div>
                  <span className="text-xs text-text-muted">
                    {h}:{String(minutes).padStart(2, "0")} {ampm}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm">
            <span className="text-text-secondary">Total</span>
            <span className="text-white font-medium">
              {sessionsToday.reduce((s, x) => s + x.duration_minutes, 0)} minutes
            </span>
          </div>
        </div>
      )}

      {/* Active days note */}
      {stats && stats.total_active_days > 0 && (
        <p className="text-center text-xs text-text-muted">
          {stats.total_active_days} total active day{stats.total_active_days !== 1 ? "s" : ""}
        </p>
      )}

      {/* Celebration Modal */}
      {showCelebration && (
        <CelebrationModal
          minutes={completedMinutes}
          onClose={() => setShowCelebration(false)}
        />
      )}
    </div>
  );
}
