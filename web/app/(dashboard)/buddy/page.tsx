"use client";

import { useState, useEffect, useCallback } from "react";
import { backendFetch } from "@/lib/api";
import { ThinkingDots } from "@/components/ui/Loading";

interface BuddyStatus {
  has_buddy: boolean;
  pair_id?: string;
  status?: string;
  buddy_name?: string;
  buddy_email?: string;
  streak_count?: number;
  last_activity_buddy?: string;
}

export default function BuddyPage() {
  const [buddyStatus, setBuddyStatus] = useState<BuddyStatus | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const data = await backendFetch<BuddyStatus>("/api/buddy/status");
      setBuddyStatus(data);
    } catch {
      setBuddyStatus({ has_buddy: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    setMessage("");
    try {
      const res = await backendFetch<{ status: string; message?: string }>("/api/buddy/invite", {
        method: "POST",
        body: JSON.stringify({ buddy_email: inviteEmail }),
      });
      setMessage(res.message || "Invite sent!");
      setInviteEmail("");
      loadStatus();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to send invite");
    }
  }

  async function acceptInvite() {
    try {
      await backendFetch("/api/buddy/accept", { method: "POST" });
      loadStatus();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to accept");
    }
  }

  async function nudgeBuddy() {
    try {
      await backendFetch("/api/buddy/nudge", { method: "POST" });
      setMessage("Nudge sent!");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to nudge");
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#7c3aed] border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-bold text-[#fafafa] mb-6">Study Buddy</h1>

      {message && (
        <div className="bg-[#7c3aed]/10 border border-[#7c3aed]/20 rounded-lg p-3 mb-4 text-[#a78bfa] text-sm">
          {message}
        </div>
      )}

      {!buddyStatus?.has_buddy ? (
        /* ── No buddy: invite form ── */
        <div className="flex flex-col items-center justify-center py-16">
          <h2 className="text-xl font-semibold text-[#fafafa] mb-2">Find a study partner</h2>
          <p className="text-[#a1a1aa] text-sm mb-8 text-center max-w-xs">
            Pair up with a friend. Keep each other accountable. Build a streak together.
          </p>
          <div className="flex gap-2 w-full max-w-sm">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Friend's email"
              className="flex-1 bg-[#09090b] border border-[#1e1e22] rounded-lg px-4 py-2.5 text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#7c3aed]/40"
            />
            <button
              onClick={sendInvite}
              className="px-6 py-2.5 bg-[#7c3aed] hover:bg-[#7c3aed]/90 rounded-lg text-white font-medium transition-colors"
            >
              Send invite
            </button>
          </div>
        </div>
      ) : buddyStatus.status === "pending" ? (
        /* ── Pending invite ── */
        <div className="flex flex-col items-center justify-center py-16">
          <h2 className="text-lg font-semibold text-[#fafafa] mb-2">Pending Invite</h2>
          <div className="flex items-center gap-2 text-[#a1a1aa] text-sm mb-6">
            <span>Waiting for {buddyStatus.buddy_email || "your buddy"}</span>
            <ThinkingDots />
          </div>
          <button
            onClick={acceptInvite}
            className="px-6 py-2.5 bg-[#7c3aed] hover:bg-[#7c3aed]/90 rounded-lg text-white font-medium transition-colors"
          >
            Accept Invite
          </button>
        </div>
      ) : (
        /* ── Paired: buddy info ── */
        <div className="space-y-4">
          {/* Streak */}
          <div className="bg-[#111113] rounded-xl p-6 border border-[#1e1e22] text-center">
            <p className="text-4xl font-bold text-[#7c3aed] mb-1">{buddyStatus.streak_count || 0}</p>
            <p className="text-[#71717a] text-sm">Day Streak Together</p>
          </div>

          {/* Buddy card */}
          <div className="bg-[#111113] rounded-xl p-5 border border-[#1e1e22]">
            <p className="text-[11px] uppercase tracking-wider text-[#71717a] font-medium mb-2">Your Buddy</p>
            <p className="text-lg font-semibold text-[#fafafa]">{buddyStatus.buddy_name}</p>
            {buddyStatus.last_activity_buddy && (
              <p className="text-[#a1a1aa] text-sm mt-1">
                Last active: {new Date(buddyStatus.last_activity_buddy).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Nudge button */}
          <button
            onClick={nudgeBuddy}
            className="w-full py-3 border border-[#27272a] hover:border-[#7c3aed]/30 hover:bg-[#18181b] rounded-xl text-[#a1a1aa] hover:text-[#fafafa] font-medium transition-colors"
          >
            Nudge {buddyStatus.buddy_name}
          </button>
        </div>
      )}
    </div>
  );
}
