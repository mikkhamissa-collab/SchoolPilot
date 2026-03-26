"use client";

import { useState } from "react";
import { backendFetch } from "@/lib/api";
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
      await backendFetch("/api/buddy/nudge", { method: "POST" });
      setNudgeSent(true);
      setTimeout(() => setNudgeSent(false), 60000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      setNudgeError(message);
      setTimeout(() => setNudgeError(""), 3000);
    }
    setNudgeLoading(false);
  };

  return (
    <div className="p-4 rounded-xl bg-surface border border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </span>
          <span className="text-text font-medium text-sm">
            {data.partner_name}
          </span>
        </div>
        {!data.partner_completed_today && !nudgeSent && (
          <button
            onClick={sendNudge}
            disabled={nudgeLoading}
            className="px-2 py-1 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            {nudgeLoading ? "..." : "Nudge"}
          </button>
        )}
        {nudgeSent && (
          <span className="text-xs text-green">Nudge sent!</span>
        )}
        {nudgeError && (
          <span className="text-xs text-red">{nudgeError}</span>
        )}
      </div>

      <div className="flex gap-4 text-sm">
        <div className="flex-1">
          <div className="text-muted text-xs mb-0.5">
            {data.partner_name}
          </div>
          <div className="flex items-center gap-1.5">
            <span>{data.partner_streak || 0}</span>
            {data.partner_completed_today ? (
              <span className="text-green text-xs">✓ Done</span>
            ) : (
              <span className="text-muted text-xs">Pending</span>
            )}
          </div>
        </div>
        <div className="flex-1">
          <div className="text-muted text-xs mb-0.5">You</div>
          <div className="flex items-center gap-1.5">
            <span>{data.my_streak || 0}</span>
            {data.my_completed_today ? (
              <span className="text-green text-xs">✓ Done</span>
            ) : (
              <span className="text-muted text-xs">Pending</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
