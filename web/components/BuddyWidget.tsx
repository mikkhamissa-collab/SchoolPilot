"use client";

import { useState } from "react";
import type { BuddyData } from "@/lib/types";

interface BuddyWidgetProps {
  data: BuddyData;
}

export default function BuddyWidget({ data }: BuddyWidgetProps) {
  const [nudgeSent, setNudgeSent] = useState(false);
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const [nudgeError, setNudgeError] = useState("");

  if (!data.has_partner) return null;

  const sendNudge = async () => {
    setNudgeLoading(true);
    setNudgeError("");
    try {
      const res = await fetch("/api/buddy/nudge", { method: "POST" });
      if (res.ok) {
        setNudgeSent(true);
        setTimeout(() => setNudgeSent(false), 60000);
      } else {
        const err = await res.json();
        setNudgeError(err.error || "Failed");
        setTimeout(() => setNudgeError(""), 3000);
      }
    } catch (err) {
      console.error("Nudge error:", err);
      setNudgeError("Network error");
      setTimeout(() => setNudgeError(""), 3000);
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
        {nudgeError && (
          <span className="text-xs text-error">{nudgeError}</span>
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
