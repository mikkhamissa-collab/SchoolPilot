"use client";

// FOCUS MODE — Pomodoro timer with circular progress ring, session history,
// ambient sound selector, and AI study tip integration via chat sidebar.

import { useState, useEffect, useRef, useCallback } from "react";

// =============================================================================
// TYPES
// =============================================================================

interface FocusSession {
  id: string;
  subject: string;
  startedAt: string;
  durationMinutes: number;
  type: "focus" | "break";
  completed: boolean;
}

interface TimerConfig {
  focusMinutes: number;
  breakMinutes: number;
}

type TimerPhase = "idle" | "focus" | "break";
type AmbientSound = "silence" | "rain" | "lofi" | "nature";

// =============================================================================
// CONSTANTS
// =============================================================================

const PRESETS: { label: string; focus: number; break: number }[] = [
  { label: "Classic", focus: 25, break: 5 },
  { label: "Short", focus: 15, break: 3 },
  { label: "Deep Work", focus: 50, break: 10 },
  { label: "Sprint", focus: 10, break: 2 },
];

const AMBIENT_OPTIONS: { key: AmbientSound; label: string; icon: string }[] = [
  { key: "silence", label: "Silence", icon: "---" },
  { key: "rain", label: "Rain", icon: "~~" },
  { key: "lofi", label: "Lo-fi", icon: "##" },
  { key: "nature", label: "Nature", icon: "++" },
];

const STORAGE_KEY = "schoolpilot_focus_sessions";
const STREAK_KEY = "schoolpilot_focus_streak";

// =============================================================================
// HELPERS
// =============================================================================

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadSessions(): FocusSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: FocusSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // storage full or unavailable
  }
}

function loadStreak(): { lastDate: string; count: number } {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    return raw ? JSON.parse(raw) : { lastDate: "", count: 0 };
  } catch {
    return { lastDate: "", count: 0 };
  }
}

function saveStreak(streak: { lastDate: string; count: number }): void {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  } catch {
    // ignore
  }
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// =============================================================================
// SVG PROGRESS RING
// =============================================================================

function ProgressRing({
  progress,
  size = 260,
  strokeWidth = 8,
  phase,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  phase: TimerPhase;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  const colorClass =
    phase === "break" ? "stroke-emerald-400" : "stroke-[var(--color-accent)]";

  return (
    <svg
      width={size}
      height={size}
      className="transform -rotate-90"
      aria-hidden="true"
    >
      {/* Background track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-white/5"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className={colorClass}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
    </svg>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function FocusPage() {
  // Timer config
  const [config, setConfig] = useState<TimerConfig>({
    focusMinutes: 25,
    breakMinutes: 5,
  });

  // Timer state
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const [secondsLeft, setSecondsLeft] = useState(config.focusMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subject tracking
  const [subject, setSubject] = useState("");

  // Ambient sound
  const [ambient, setAmbient] = useState<AmbientSound>("silence");

  // Session history
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [streak, setStreak] = useState({ lastDate: "", count: 0 });

  // Settings panel
  const [showSettings, setShowSettings] = useState(false);

  // Completed sessions count for the cycle indicator
  const [cycleCount, setCycleCount] = useState(0);

  // Load from localStorage on mount
  useEffect(() => {
    setSessions(loadSessions());
    setStreak(loadStreak());
  }, []);

  // Total duration for current phase
  const totalSeconds =
    phase === "break"
      ? config.breakMinutes * 60
      : config.focusMinutes * 60;

  // Progress (0 to 1)
  const progress = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 0;

  // Today's sessions
  const todayKey = getTodayKey();
  const todaySessions = sessions.filter(
    (s) => s.startedAt.slice(0, 10) === todayKey && s.completed
  );
  const todayFocusSessions = todaySessions.filter((s) => s.type === "focus");
  const totalFocusMinutesToday = todayFocusSessions.reduce(
    (sum, s) => sum + s.durationMinutes,
    0
  );

  // ---------------------------------------------------------------------------
  // Timer logic
  // ---------------------------------------------------------------------------

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const recordSession = useCallback(
    (type: "focus" | "break", durationMinutes: number) => {
      const session: FocusSession = {
        id: generateId(),
        subject: subject || "Untitled",
        startedAt: new Date().toISOString(),
        durationMinutes,
        type,
        completed: true,
      };
      const updated = [session, ...loadSessions()].slice(0, 200);
      saveSessions(updated);
      setSessions(updated);

      // Update streak
      if (type === "focus") {
        const today = getTodayKey();
        const current = loadStreak();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().slice(0, 10);

        let newCount = 1;
        if (current.lastDate === today) {
          newCount = current.count; // already counted today
        } else if (current.lastDate === yesterdayKey) {
          newCount = current.count + 1;
        }

        const newStreak = { lastDate: today, count: newCount };
        saveStreak(newStreak);
        setStreak(newStreak);
      }
    },
    [subject]
  );

  const handleTimerComplete = useCallback(() => {
    stopInterval();
    setIsRunning(false);

    if (phase === "focus") {
      recordSession("focus", config.focusMinutes);
      setCycleCount((c) => c + 1);
      // Transition to break
      setPhase("break");
      setSecondsLeft(config.breakMinutes * 60);
    } else if (phase === "break") {
      recordSession("break", config.breakMinutes);
      // Back to idle, ready for next focus
      setPhase("idle");
      setSecondsLeft(config.focusMinutes * 60);
    }
  }, [phase, config, recordSession, stopInterval]);

  // Interval effect
  useEffect(() => {
    if (isRunning && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => stopInterval();
  }, [isRunning, stopInterval]);

  // Watch for timer hitting zero
  useEffect(() => {
    if (secondsLeft === 0 && (phase === "focus" || phase === "break")) {
      handleTimerComplete();
    }
  }, [secondsLeft, phase, handleTimerComplete]);

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  const startFocus = () => {
    setPhase("focus");
    setSecondsLeft(config.focusMinutes * 60);
    setIsRunning(true);
  };

  const togglePause = () => {
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    stopInterval();
    setIsRunning(false);
    setPhase("idle");
    setSecondsLeft(config.focusMinutes * 60);
  };

  const skipToBreak = () => {
    stopInterval();
    setIsRunning(false);
    setPhase("break");
    setSecondsLeft(config.breakMinutes * 60);
  };

  const skipBreak = () => {
    stopInterval();
    setIsRunning(false);
    setPhase("idle");
    setSecondsLeft(config.focusMinutes * 60);
  };

  const applyPreset = (focus: number, breakMins: number) => {
    setConfig({ focusMinutes: focus, breakMinutes: breakMins });
    if (phase === "idle") {
      setSecondsLeft(focus * 60);
    }
  };

  const askAIForTips = () => {
    const msg = subject
      ? `Give me study tips and strategies for ${subject}. Include techniques for focus and retention.`
      : "Give me general study tips and focus strategies for a high school student.";
    window.dispatchEvent(
      new CustomEvent("open-chat", { detail: { message: msg } })
    );
  };

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Focus Mode</h2>
          <p className="text-text-secondary text-sm mt-1">
            Pomodoro timer for deep, distraction-free study
          </p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2.5 rounded-xl bg-bg-card border border-border text-text-secondary hover:text-white transition-colors"
          aria-label="Timer settings"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-bg-card border border-border text-center">
          <p className="text-2xl font-bold text-white">{totalFocusMinutesToday}</p>
          <p className="text-text-muted text-xs mt-1">Minutes Today</p>
        </div>
        <div className="p-4 rounded-xl bg-bg-card border border-border text-center">
          <p className="text-2xl font-bold text-white">{todayFocusSessions.length}</p>
          <p className="text-text-muted text-xs mt-1">Sessions</p>
        </div>
        <div className="p-4 rounded-xl bg-bg-card border border-border text-center">
          <p className="text-2xl font-bold text-accent">{streak.count}</p>
          <p className="text-text-muted text-xs mt-1">Day Streak</p>
        </div>
      </div>

      {/* Settings panel (collapsible) */}
      {showSettings && (
        <div className="p-5 rounded-xl bg-bg-card border border-border space-y-4 animate-in fade-in slide-in-from-top-2">
          <h3 className="text-white font-medium text-sm">Timer Presets</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.focus, p.break)}
                className={`px-3 py-2.5 rounded-lg text-sm transition-all border ${
                  config.focusMinutes === p.focus &&
                  config.breakMinutes === p.break
                    ? "bg-accent/20 text-accent border-accent/40"
                    : "bg-bg-hover text-text-secondary hover:text-white border-transparent"
                }`}
              >
                <span className="font-medium">{p.label}</span>
                <span className="text-text-muted text-xs block">
                  {p.focus}/{p.break} min
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-text-muted text-xs block mb-1.5">
                Focus (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={config.focusMinutes}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(120, Number(e.target.value)));
                  setConfig((c) => ({ ...c, focusMinutes: val }));
                  if (phase === "idle") setSecondsLeft(val * 60);
                }}
                className="w-full px-3 py-2 rounded-lg bg-bg-dark border border-border text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-text-muted text-xs block mb-1.5">
                Break (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={config.breakMinutes}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(30, Number(e.target.value)));
                  setConfig((c) => ({ ...c, breakMinutes: val }));
                }}
                className="w-full px-3 py-2 rounded-lg bg-bg-dark border border-border text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        </div>
      )}

      {/* Subject input */}
      <div className="p-4 rounded-xl bg-bg-card border border-border">
        <label className="text-text-muted text-xs block mb-2">
          What are you working on?
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. AP Chemistry Ch. 12, English essay, Math problem set..."
          className="w-full px-4 py-2.5 rounded-lg bg-bg-dark border border-border text-white text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {/* Timer display */}
      <div className="p-8 rounded-xl bg-bg-card border border-border flex flex-col items-center space-y-6">
        {/* Phase label */}
        <div className="flex items-center gap-2">
          {phase === "break" ? (
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
              Break Time
            </span>
          ) : phase === "focus" ? (
            <span className="text-xs px-3 py-1 rounded-full bg-accent/20 text-accent font-medium">
              Focus Time
            </span>
          ) : (
            <span className="text-xs px-3 py-1 rounded-full bg-bg-hover text-text-muted font-medium">
              Ready
            </span>
          )}

          {/* Cycle indicator */}
          {cycleCount > 0 && (
            <span className="text-xs text-text-muted">
              Cycle {cycleCount}
            </span>
          )}
        </div>

        {/* SVG ring + time display */}
        <div className="relative">
          <ProgressRing progress={progress} phase={phase} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-mono font-bold text-white tracking-tight">
              {formatTime(secondsLeft)}
            </span>
            {phase !== "idle" && (
              <span className="text-text-muted text-xs mt-2">
                {phase === "focus"
                  ? `${config.focusMinutes} min focus`
                  : `${config.breakMinutes} min break`}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {phase === "idle" ? (
            <button
              onClick={startFocus}
              className="px-8 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-colors text-sm"
            >
              Start Focus
            </button>
          ) : (
            <>
              <button
                onClick={togglePause}
                className="px-6 py-3 rounded-xl bg-white text-black font-medium hover:bg-gray-200 transition-all text-sm"
              >
                {isRunning ? "Pause" : "Resume"}
              </button>
              {phase === "focus" ? (
                <button
                  onClick={skipToBreak}
                  className="px-5 py-3 rounded-xl bg-bg-hover border border-border text-text-secondary hover:text-white transition-colors text-sm"
                >
                  Skip to Break
                </button>
              ) : (
                <button
                  onClick={skipBreak}
                  className="px-5 py-3 rounded-xl bg-bg-hover border border-border text-text-secondary hover:text-white transition-colors text-sm"
                >
                  Skip Break
                </button>
              )}
              <button
                onClick={resetTimer}
                className="px-5 py-3 rounded-xl bg-bg-hover border border-border text-text-secondary hover:text-white transition-colors text-sm"
              >
                Reset
              </button>
            </>
          )}
        </div>
      </div>

      {/* Ambient sound + AI tips row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Ambient sound */}
        <div className="p-4 rounded-xl bg-bg-card border border-border">
          <p className="text-text-muted text-xs mb-3">Ambient Sound</p>
          <div className="flex gap-2">
            {AMBIENT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setAmbient(opt.key)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${
                  ambient === opt.key
                    ? "bg-accent/20 text-accent border-accent/40"
                    : "bg-bg-hover text-text-secondary hover:text-white border-transparent"
                }`}
              >
                <span className="block text-base mb-0.5">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
          {ambient !== "silence" && (
            <p className="text-text-muted text-xs mt-2 text-center italic">
              Audio playback coming soon
            </p>
          )}
        </div>

        {/* AI study tips */}
        <div className="p-4 rounded-xl bg-bg-card border border-border flex flex-col justify-between">
          <div>
            <p className="text-text-muted text-xs mb-1">Need help?</p>
            <p className="text-white text-sm font-medium">
              Ask AI for Study Tips
            </p>
            <p className="text-text-muted text-xs mt-1">
              {subject
                ? `Get personalized tips for "${subject}"`
                : "Get general focus and study strategies"}
            </p>
          </div>
          <button
            onClick={askAIForTips}
            className="mt-3 w-full py-2.5 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors border border-accent/20"
          >
            Open AI Chat
          </button>
        </div>
      </div>

      {/* Session history */}
      <div className="p-5 rounded-xl bg-bg-card border border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium text-sm">Today&apos;s Sessions</h3>
          {todayFocusSessions.length > 0 && (
            <span className="text-text-muted text-xs">
              {todayFocusSessions.length} focus session
              {todayFocusSessions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {todaySessions.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-text-muted text-sm">
              No sessions yet today. Start your first focus session!
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {todaySessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-bg-dark/50"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      s.type === "focus" ? "bg-accent" : "bg-emerald-400"
                    }`}
                  />
                  <div>
                    <p className="text-white text-sm">{s.subject}</p>
                    <p className="text-text-muted text-xs">
                      {new Date(s.startedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`text-sm font-medium ${
                      s.type === "focus" ? "text-accent" : "text-emerald-400"
                    }`}
                  >
                    {s.durationMinutes} min
                  </span>
                  <p className="text-text-muted text-xs capitalize">
                    {s.type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
