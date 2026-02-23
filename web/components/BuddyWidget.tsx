"use client";

import { useState } from "react";

interface BuddyData {
  has_partner: boolean;
  partner_name?: string;
  partner_streak?: number;
  partner_completed_today?: boolean;
  my_streak?: number;
  my_completed_today?: boolean;
  pending_invite?: string | null;
}

interface BuddyWidgetProps {
  data: BuddyData;
  userId: string;
}

export default function BuddyWidget({ data, userId }: BuddyWidgetProps) {
  const [nudgeSent, setNudgeSent] = useState(false);
  const [nudgeLoading, setNudgeLoading] = useState(false);

  if (!data.has_partner) return null;

  const sendNudge = async () => {
    setNudgeLoading(true);
    try {
      await fetch("/api/buddy/nudge", {
        method: "POST",
        headers: { "x-user-id": userId },
      });
      setNudgeSent(true);
      setTimeout(() => setNudgeSent(false), 60000);
    } catch {
      // silently fail
    }
    setNudgeLoading(false);
  };

  return (
    <div className="p-4 rounded-xl bg-bg-card border border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">👥</span>
          <span className="text-white font-medium text-sm">
            {data.partner_name}
          </span>
        </div>
        {!data.partner_completed_today && !nudgeSent && (
          <button
            onClick={sendNudge}
            disabled={nudgeLoading}
            className="px-2 py-1 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            {nudgeLoading ? "..." : "Nudge 👋"}
          </button>
        )}
        {nudgeSent && (
          <span className="text-xs text-success">Nudge sent!</span>
        )}
      </div>

      <div className="flex gap-4 text-sm">
        <div className="flex-1">
          <div className="text-text-muted text-xs mb-0.5">
            {data.partner_name}
          </div>
          <div className="flex items-center gap-1.5">
            <span>🔥 {data.partner_streak || 0}</span>
            {data.partner_completed_today ? (
              <span className="text-success text-xs">✓ Done</span>
            ) : (
              <span className="text-text-muted text-xs">Pending</span>
            )}
          </div>
        </div>
        <div className="flex-1">
          <div className="text-text-muted text-xs mb-0.5">You</div>
          <div className="flex items-center gap-1.5">
            <span>🔥 {data.my_streak || 0}</span>
            {data.my_completed_today ? (
              <span className="text-success text-xs">✓ Done</span>
            ) : (
              <span className="text-text-muted text-xs">Pending</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
