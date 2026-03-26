"use client";

import { FlameIcon } from "@/components/icons";

interface StreakBadgeProps {
  streak: number;
  freezeAvailable: boolean;
  compact?: boolean;
}

export default function StreakBadge({
  streak,
  freezeAvailable,
  compact = false,
}: StreakBadgeProps) {
  if (streak === 0 && compact) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber/10 text-amber text-xs font-medium">
        <FlameIcon className="w-3 h-3" /> {streak}
      </span>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-surface border border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlameIcon className="w-5 h-5 text-amber" />
          <div>
            <div className="text-text font-bold text-lg">
              {streak} day{streak !== 1 ? "s" : ""}
            </div>
            <div className="text-muted text-xs">
              {streak === 0
                ? "Complete your focus task to start a streak"
                : "Complete today's focus to keep it alive"}
            </div>
          </div>
        </div>
        {freezeAvailable && streak > 0 && (
          <span
            className="text-xs px-2 py-1 rounded-lg bg-accent/10 text-accent-light"
            title="Miss a day and your streak is protected"
          >
            1 freeze
          </span>
        )}
      </div>
    </div>
  );
}
