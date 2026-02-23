"use client";

import { useEffect, useRef } from "react";

interface WeeklyRecapData {
  weekLabel: string;
  tasksCompleted: number;
  streakDays: number;
  gradesLogged: number;
  insight: string;
  win: string;
  preview: string;
}

interface WeeklyRecapModalProps {
  data: WeeklyRecapData;
  onDismiss: () => void;
  onShare: () => void;
}

export default function WeeklyRecapModal({
  data,
  onDismiss,
  onShare,
}: WeeklyRecapModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape key to dismiss
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onDismiss]);

  // Focus on mount
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Focus trap — cycle Tab within the modal
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableEls = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusableEls[0];
    const last = focusableEls[focusableEls.length - 1];
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    dialog.addEventListener("keydown", trap);
    return () => dialog.removeEventListener("keydown", trap);
  }, []);

  // Click outside to dismiss
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onDismiss();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Weekly recap"
      onClick={handleBackdrop}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-sm bg-bg-card border border-border rounded-2xl p-6 space-y-5 outline-none"
      >
        <div className="text-center">
          <div className="text-3xl mb-2">📊</div>
          <h3 className="text-lg font-bold text-white">
            Your Week: {data.weekLabel}
          </h3>
        </div>

        {/* Stats row */}
        <div className="flex justify-around text-center">
          <div>
            <div className="text-2xl font-bold text-white">
              {data.tasksCompleted}
            </div>
            <div className="text-text-muted text-xs">Tasks done</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-warning">
              🔥 {data.streakDays}
            </div>
            <div className="text-text-muted text-xs">Streak</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-accent">
              {data.gradesLogged}
            </div>
            <div className="text-text-muted text-xs">Grades logged</div>
          </div>
        </div>

        {/* Win */}
        {data.win && (
          <div className="p-3 rounded-xl bg-success/10 border border-success/20">
            <div className="text-success text-xs font-bold uppercase tracking-wide mb-1">
              This Week&apos;s Win
            </div>
            <div className="text-white text-sm">{data.win}</div>
          </div>
        )}

        {/* Insight */}
        {data.insight && (
          <div className="p-3 rounded-xl bg-accent/10 border border-accent/20">
            <div className="text-accent text-xs font-bold uppercase tracking-wide mb-1">
              Insight
            </div>
            <div className="text-white text-sm">{data.insight}</div>
          </div>
        )}

        {/* Preview */}
        {data.preview && (
          <div className="p-3 rounded-xl bg-bg-dark">
            <div className="text-text-muted text-xs font-bold uppercase tracking-wide mb-1">
              Next Week
            </div>
            <div className="text-text-secondary text-sm">{data.preview}</div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onShare}
            className="flex-1 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-gray-100 transition-colors cursor-pointer"
          >
            Share My Week
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 py-3 rounded-xl bg-bg-hover text-text-secondary font-medium text-sm hover:text-white transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
