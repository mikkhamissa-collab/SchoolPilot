"use client";

import { useState } from "react";

interface GradeLogModalProps {
  taskTitle: string;
  courseName: string;
  courseId: string;
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

  const handleSave = () => {
    const s = parseFloat(score);
    const m = parseFloat(maxScore) || 100;
    if (isNaN(s) || s < 0) return;
    onSave(s, m);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-bg-card border border-border rounded-2xl p-6 space-y-5">
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
              className="w-24 px-3 py-3 rounded-xl bg-bg-dark border border-border text-white text-center text-xl font-bold placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {score && (
          <div className="text-center">
            <span className="text-2xl font-bold text-accent">
              {((parseFloat(score) / (parseFloat(maxScore) || 100)) * 100).toFixed(0)}%
            </span>
          </div>
        )}

        <div className="space-y-2">
          <button
            onClick={handleSave}
            disabled={!score || isNaN(parseFloat(score))}
            className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors disabled:opacity-40"
          >
            Save Grade
          </button>
          <button
            onClick={onSkip}
            className="w-full py-2 text-text-muted text-sm hover:text-white transition-colors"
          >
            Skip — I&apos;ll add later
          </button>
        </div>
      </div>
    </div>
  );
}
