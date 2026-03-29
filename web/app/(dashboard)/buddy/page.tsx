"use client";

import { useState, useEffect, useCallback } from "react";
import { backendFetch } from "@/lib/api";

interface BuddyStatus {
  has_buddy: boolean;
  pair_id?: string;
  status?: string;
  buddy_name?: string;
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
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-bold text-text mb-6">Study Buddy</h1>

      {message && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 mb-4 text-accent text-sm">
          {message}
        </div>
      )}

      {!buddyStatus?.has_buddy ? (
        <div className="bg-surface rounded-xl p-8 border border-border text-center">
          <div className="text-6xl mb-4">👥</div>
          <h2 className="text-xl font-bold text-text mb-2">Find a Study Buddy</h2>
          <p className="text-text-secondary mb-6">
            Pair up with a friend. Keep each other accountable. Build a streak together.
          </p>
          <div className="flex gap-2 max-w-sm mx-auto">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Friend's email"
              className="flex-1 bg-bg border border-border rounded-lg px-4 py-2.5 text-text placeholder:text-muted focus:outline-none focus:border-accent"
            />
            <button
              onClick={sendInvite}
              className="px-6 py-2.5 bg-accent hover:bg-accent-hover rounded-lg text-white font-medium transition-colors"
            >
              Invite
            </button>
          </div>
        </div>
      ) : buddyStatus.status === "pending" ? (
        <div className="bg-surface rounded-xl p-8 border border-border text-center">
          <div className="text-6xl mb-4">⏳</div>
          <h2 className="text-xl font-bold text-text mb-2">Pending Invite</h2>
          <p className="text-text-secondary mb-4">Waiting for your buddy to accept...</p>
          <button
            onClick={acceptInvite}
            className="px-6 py-2.5 bg-accent hover:bg-accent-hover rounded-lg text-white font-medium transition-colors"
          >
            Accept Invite
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-surface rounded-xl p-6 border border-border text-center">
            <div className="text-5xl mb-3">🔥</div>
            <p className="text-4xl font-bold text-accent mb-1">{buddyStatus.streak_count || 0}</p>
            <p className="text-muted text-sm">Day Streak Together</p>
          </div>

          <div className="bg-surface rounded-xl p-6 border border-border">
            <h3 className="text-sm text-muted mb-2">Your Buddy</h3>
            <p className="text-xl font-bold text-text">{buddyStatus.buddy_name}</p>
            {buddyStatus.last_activity_buddy && (
              <p className="text-text-secondary text-sm mt-1">
                Last active: {new Date(buddyStatus.last_activity_buddy).toLocaleDateString()}
              </p>
            )}
          </div>

          <button
            onClick={nudgeBuddy}
            className="w-full py-3 bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded-xl text-accent font-medium transition-colors"
          >
            👋 Nudge {buddyStatus.buddy_name}
          </button>
        </div>
      )}
    </div>
  );
}
