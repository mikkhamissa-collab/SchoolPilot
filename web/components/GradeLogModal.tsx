"use client";

import { useState, useEffect, useRef } from "react";

interface GradeLogModalProps {
  taskTitle: string;
  courseName: string;
  onSave: (score: number, maxScore: number) => void;
  onSkip: () => void;
}

export default function GradeLogModal({
  taskTitle,
  courseName,
  onSave,
  onSkip,
}: GradeLogModalProps) {
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape key to dismiss
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onSkip]);

  // Focus trap — focus the dialog on mount
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

  const handleSave = () => {
    const s = parseFloat(score);
    const m = parseFloat(maxScore) || 100;
    if (isNaN(s) || s < 0 || m <= 0) return;
    // Cap score at 2x max (sanity bound for extra credit)
    if (s > m * 2) return;
    onSave(s, m);
  };

  // Click outside to dismiss
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onSkip();
  };

  const pct = score ? ((parseFloat(score) / (parseFloat(maxScore) || 100)) * 100) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Log grade"
      onClick={handleBackdrop}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-sm bg-bg-card border border-border rounded-2xl p-6 space-y-5 outline-none"
      >
        <div className="text-center">
          <div className="text-3xl mb-2">📝</div>
          <h3 className="text-lg font-bold text-white">
            How&apos;d you do?
          </h3>
          <p className="text-text-muted text-sm mt-1">{taskTitle}</p>
          <p className="text-text-secondary text-xs">{courseName}</p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <div className="text-center">
            <label className="text-text-muted text-xs block mb-1">
              Your score
            </label>
            <input
              type="number"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="85"
              autoFocus
              min={0}
              className="w-24 px-3 py-3 rounded-xl bg-bg-dark border border-border text-white text-center text-xl font-bold placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>
          <span className="text-text-muted text-2xl mt-5">/</span>
          <div className="text-center">
            <label className="text-text-muted text-xs block mb-1">
              Max score
            </label>
            <input
              type="number"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              min={1}
              className="w-24 px-3 py-3 rounded-xl bg-bg-dark border border-border text-white text-center text-xl font-bold placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {pct !== null && !isNaN(pct) && isFinite(pct) && (
          <div className="text-center">
            <span className="text-2xl font-bold text-accent">
              {pct.toFixed(0)}%
            </span>
          </div>
        )}

        <div className="space-y-2">
          <button
            onClick={handleSave}
            disabled={!score || isNaN(parseFloat(score))}
            className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors disabled:opacity-40 cursor-pointer"
          >
            Save Grade
          </button>
          <button
            onClick={onSkip}
            className="w-full py-2 text-text-muted text-sm hover:text-white transition-colors cursor-pointer"
          >
            Skip — I&apos;ll add later
          </button>
        </div>
      </div>
    </div>
  );
}
