"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { backendFetch } from "@/lib/api";

interface FocusStats {
  today_sessions: number;
  today_minutes: number;
  week_minutes: number;
  current_streak: number;
  longest_streak: number;
  total_active_days: number;
}

const PRESETS = [
  { label: "Pomodoro", minutes: 25, icon: "🍅" },
  { label: "Deep Work", minutes: 45, icon: "🧠" },
  { label: "Quick", minutes: 15, icon: "⚡" },
];

export default function FocusPage() {
  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [customMinutes, setCustomMinutes] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<FocusStats | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const loadStats = useCallback(async () => {
    try {
      const data = await backendFetch<FocusStats>("/api/focus/stats");
      setStats(data);
    } catch (err) {
      console.error("Failed to load focus stats:", err);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const completeSession = useCallback(async () => {
    // Calculate real elapsed time from when the timer started
    const elapsedMs = Date.now() - startTimeRef.current;
    const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));
    try {
      await backendFetch("/api/focus/session", {
        method: "POST",
        body: JSON.stringify({
          duration_minutes: elapsedMinutes,
          focus_type: PRESETS.find((p) => p.minutes === selectedMinutes)?.label.toLowerCase() || "custom",
        }),
      });
      loadStats();
    } catch (err) {
      console.error("Failed to log focus session:", err);
    }
  }, [selectedMinutes, loadStats]);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setIsRunning(false);
            completeSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, timeLeft, completeSession]);

  function startTimer() {
    const mins = customMinutes ? parseInt(customMinutes) : selectedMinutes;
    if (mins <= 0 || mins > 180) return;
    setSelectedMinutes(mins);
    setTimeLeft(mins * 60);
    setIsRunning(true);
    startTimeRef.current = Date.now();
  }

  function stopTimer() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
    setTimeLeft(0);
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = isRunning || timeLeft > 0
    ? ((selectedMinutes * 60 - timeLeft) / (selectedMinutes * 60)) * 100
    : 0;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Focus Timer</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-bg-card rounded-xl p-4 border border-border text-center">
            <p className="text-3xl font-bold text-accent">{stats.current_streak}</p>
            <p className="text-xs text-text-muted mt-1">Day Streak</p>
          </div>
          <div className="bg-bg-card rounded-xl p-4 border border-border text-center">
            <p className="text-3xl font-bold text-text-primary">{stats.today_minutes}</p>
            <p className="text-xs text-text-muted mt-1">Minutes Today</p>
          </div>
          <div className="bg-bg-card rounded-xl p-4 border border-border text-center">
            <p className="text-3xl font-bold text-text-primary">{Math.round(stats.week_minutes / 60)}h</p>
            <p className="text-xs text-text-muted mt-1">This Week</p>
          </div>
        </div>
      )}

      {/* Timer Display */}
      <div className="bg-bg-card rounded-2xl p-8 border border-border text-center mb-8">
        <div className="relative w-48 h-48 mx-auto mb-6">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#2a2a3e" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="45" fill="none" stroke="#7c3aed" strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 45}`}
              strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-4xl font-mono font-bold text-text-primary"
              role="timer"
              aria-live="off"
              aria-label={`${minutes} minutes ${seconds} seconds remaining`}
            >
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </span>
          </div>
        </div>

        {!isRunning && timeLeft === 0 ? (
          <>
            <div className="flex justify-center gap-3 mb-4">
              {PRESETS.map((p) => (
                <button
                  key={p.minutes}
                  onClick={() => { setSelectedMinutes(p.minutes); setCustomMinutes(""); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedMinutes === p.minutes && !customMinutes
                      ? "bg-accent text-white"
                      : "bg-bg-hover text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {p.icon} {p.label} ({p.minutes}m)
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2 mb-6">
              <label className="sr-only" htmlFor="custom-minutes">Custom minutes</label>
              <input
                id="custom-minutes"
                type="number"
                min="1"
                max="180"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                placeholder="Custom min"
                className="w-28 bg-bg-dark border border-border rounded-lg px-3 py-2 text-center text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent text-sm"
              />
            </div>
            <button
              onClick={startTimer}
              className="px-8 py-3 bg-accent hover:bg-accent-hover rounded-xl text-white font-semibold text-lg transition-colors"
            >
              Start Focus
            </button>
          </>
        ) : (
          <button
            onClick={stopTimer}
            className="px-8 py-3 bg-red-500/20 hover:bg-red-500/30 rounded-xl text-red-400 font-semibold text-lg transition-colors border border-red-500/30"
          >
            Stop
          </button>
        )}
      </div>

      {/* Session History */}
      {stats && stats.today_sessions > 0 && (
        <div className="bg-bg-card rounded-xl p-6 border border-border">
          <h3 className="text-sm font-medium text-text-secondary mb-2">Today&apos;s Sessions</h3>
          <p className="text-text-primary">
            {stats.today_sessions} session{stats.today_sessions !== 1 ? "s" : ""} · {stats.today_minutes} minutes focused
          </p>
        </div>
      )}
    </div>
  );
}
