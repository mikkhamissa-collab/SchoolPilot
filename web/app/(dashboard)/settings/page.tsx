"use client";

import { createClient } from "@/lib/supabase-client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import RemoteBrowser from "@/components/RemoteBrowser";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ─── Types ─── */

interface StudentProfile {
  display_name: string | null;
  school_name: string | null;
  timezone: string | null;
  personality_preset: string;
  daily_briefing_enabled: boolean;
  briefing_time: string | null;
}

interface LMSCredential {
  id: string;
  lms_type: string;
  lms_url: string;
  last_login_success: boolean | null;
  last_sync_at: string | null;
  sync_enabled: boolean;
  last_error: string | null;
}

interface SyncStatus {
  last_sync_at: string | null;
  status: string | null;
  error: string | null;
}

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  text: string;
}

/* ─── Constants ─── */

const PERSONALITIES = [
  {
    id: "coach",
    label: "Coach",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
      </svg>
    ),
    desc: "Firm but encouraging. Keeps you on track with positive energy.",
    preview: "\"Let's crush it today! You've got 3 assignments due this week -- here's the plan to knock them out.\"",
  },
  {
    id: "friend",
    label: "Friend",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
      </svg>
    ),
    desc: "Casual and supportive. Like texting a smart friend.",
    preview: "\"Hey! So you've got that history essay due Thursday -- want me to help you outline it real quick?\"",
  },
  {
    id: "mentor",
    label: "Mentor",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
    desc: "Thoughtful and wise. Helps you see the bigger picture.",
    preview: "\"Consider prioritizing your calculus review -- building that foundation now will pay off on the final.\"",
  },
  {
    id: "drill_sergeant",
    label: "Drill Sergeant",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    desc: "No excuses. Maximum accountability and tough love.",
    preview: "\"You have 2 overdue assignments. Stop scrolling and start writing. No excuses. Go.\"",
  },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const BRIEFING_TIMES = [
  { value: "06:00", label: "6:00 AM" },
  { value: "06:30", label: "6:30 AM" },
  { value: "07:00", label: "7:00 AM" },
  { value: "07:30", label: "7:30 AM" },
  { value: "08:00", label: "8:00 AM" },
  { value: "08:30", label: "8:30 AM" },
  { value: "09:00", label: "9:00 AM" },
];

/* ─── Helpers ─── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ─── Component ─── */

export default function SettingsPage() {
  const router = useRouter();

  // Data
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [credentials, setCredentials] = useState<LMSCredential[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [token, setToken] = useState("");
  const [userEmail, setUserEmail] = useState("");

  // Loading states
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPersonality, setSavingPersonality] = useState(false);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editSchool, setEditSchool] = useState("");
  const [editTimezone, setEditTimezone] = useState("");
  const [editPersonality, setEditPersonality] = useState("coach");
  const [editBriefingEnabled, setEditBriefingEnabled] = useState(false);
  const [editBriefingTime, setEditBriefingTime] = useState("07:00");

  // UI state
  const [showRemoteBrowser, setShowRemoteBrowser] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  let toastCounter = 0;

  const toast = useCallback((type: Toast["type"], text: string) => {
    const id = Date.now() + (toastCounter++);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  /* ─── Load data ─── */

  const fetchCredentials = useCallback(async (accessToken: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/lms-credentials`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setCredentials(await res.json());
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      setToken(session.access_token);
      setUserEmail(session.user?.email || "");

      const headers = { Authorization: `Bearer ${session.access_token}` };

      try {
        const [profileRes, credsRes, syncRes] = await Promise.allSettled([
          fetch(`${API_URL}/api/profile/me`, { headers }),
          fetch(`${API_URL}/api/auth/lms-credentials`, { headers }),
          fetch(`${API_URL}/api/agent/sync-status`, { headers }),
        ]);

        if (profileRes.status === "fulfilled" && profileRes.value.ok) {
          const data = await profileRes.value.json();
          setProfile(data);
          setEditName(data.display_name || "");
          setEditSchool(data.school_name || "");
          setEditTimezone(
            data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"
          );
          setEditPersonality(data.personality_preset || "coach");
          setEditBriefingEnabled(data.daily_briefing_enabled ?? false);
          setEditBriefingTime(data.briefing_time || "07:00");
        }

        if (credsRes.status === "fulfilled" && credsRes.value.ok) {
          setCredentials(await credsRes.value.json());
        }

        if (syncRes.status === "fulfilled" && syncRes.value.ok) {
          setSyncStatus(await syncRes.value.json());
        }
      } catch {
        toast("error", "Failed to load settings.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [toast]);

  /* ─── Actions ─── */

  const saveProfile = async () => {
    if (!token) return;
    setSavingProfile(true);
    try {
      const res = await fetch(`${API_URL}/api/profile/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          display_name: editName.trim() || null,
          school_name: editSchool.trim() || null,
          timezone: editTimezone || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        toast("success", "Profile updated.");
      } else {
        const err = await res.json().catch(() => null);
        toast("error", err?.detail || "Failed to save profile.");
      }
    } catch {
      toast("error", "Network error. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const savePersonality = async (preset: string) => {
    setEditPersonality(preset);
    if (!token) return;
    setSavingPersonality(true);
    try {
      const res = await fetch(`${API_URL}/api/profile/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ personality_preset: preset }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        toast("success", "Personality updated.");
      } else {
        toast("error", "Failed to update personality.");
      }
    } catch {
      toast("error", "Network error.");
    } finally {
      setSavingPersonality(false);
    }
  };

  const saveEmailPreferences = async () => {
    if (!token) return;
    setSavingEmail(true);
    try {
      const res = await fetch(`${API_URL}/api/email/preferences`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          daily_briefing_enabled: editBriefingEnabled,
          briefing_time: editBriefingTime,
        }),
      });
      if (res.ok) {
        toast("success", "Email preferences saved.");
      } else {
        toast("error", "Failed to save email preferences.");
      }
    } catch {
      toast("error", "Network error.");
    } finally {
      setSavingEmail(false);
    }
  };

  const disconnectLMS = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/auth/lms-credentials/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCredentials((prev) => prev.filter((c) => c.id !== id));
        toast("success", "LMS disconnected.");
      } else {
        toast("error", "Failed to disconnect LMS.");
      }
    } catch {
      toast("error", "Network error.");
    } finally {
      setConfirmDisconnect(null);
    }
  };

  const deleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      try {
        localStorage.removeItem("schoolpilot_ext_token");
      } catch {
        /* ignore */
      }
      router.push("/auth/login");
    } catch {
      toast("error", "Failed to delete account.");
    } finally {
      setDeletingAccount(false);
      setConfirmDeleteAccount(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    try {
      localStorage.removeItem("schoolpilot_ext_token");
    } catch {
      /* ignore */
    }
    router.push("/auth/login");
  };

  /* ─── Loading skeleton ─── */

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-pulse">
        <div className="h-8 w-40 bg-bg-card rounded-lg" />
        <div className="h-4 w-64 bg-bg-card rounded" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-44 bg-bg-card rounded-xl" />
        ))}
      </div>
    );
  }

  /* ─── Render ─── */

  const hasConnected = credentials.length > 0;
  const activeCred = credentials[0];

  return (
    <>
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-3 rounded-lg text-sm font-medium shadow-lg transition-all animate-slide-in ${
              t.type === "success"
                ? "bg-success/15 text-success border border-success/20"
                : t.type === "error"
                ? "bg-error/15 text-error border border-error/20"
                : "bg-accent/15 text-accent border border-accent/20"
            }`}
          >
            <div className="flex items-center gap-2">
              {t.type === "success" && (
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {t.type === "error" && (
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {t.text}
            </div>
          </div>
        ))}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-text-secondary mt-1 text-sm">
            Manage your profile, LMS connection, and preferences.
          </p>
        </div>

        {/* ════════ 1. Profile ════════ */}
        <section className="bg-bg-card border border-border rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Profile</h2>
            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingProfile ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </span>
              ) : (
                "Save"
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Display Name */}
            <div>
              <label htmlFor="setting-name" className="block text-text-secondary text-sm mb-1.5">
                Display Name
              </label>
              <input
                id="setting-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm transition-colors"
                placeholder="Your name"
              />
            </div>

            {/* Email (read-only) */}
            <div>
              <label htmlFor="setting-email" className="block text-text-secondary text-sm mb-1.5">
                Email
              </label>
              <input
                id="setting-email"
                type="email"
                value={userEmail}
                disabled
                className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-text-muted text-sm cursor-not-allowed"
              />
            </div>

            {/* School */}
            <div>
              <label htmlFor="setting-school" className="block text-text-secondary text-sm mb-1.5">
                School
              </label>
              <input
                id="setting-school"
                type="text"
                value={editSchool}
                onChange={(e) => setEditSchool(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm transition-colors"
                placeholder="Your school"
              />
            </div>

            {/* Timezone */}
            <div>
              <label htmlFor="setting-tz" className="block text-text-secondary text-sm mb-1.5">
                Timezone
              </label>
              <select
                id="setting-tz"
                value={editTimezone}
                onChange={(e) => setEditTimezone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white text-sm focus:outline-none focus:border-accent transition-colors"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <p className="text-text-muted text-xs mt-1">
                Auto-detected: {Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ")}
              </p>
            </div>
          </div>
        </section>

        {/* ════════ 2. LMS Connection ════════ */}
        <section className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">LMS Connection</h2>
            {!showRemoteBrowser && (
              <button
                onClick={() => setShowRemoteBrowser(true)}
                className="px-4 py-2 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors cursor-pointer"
              >
                {hasConnected ? "Reconnect" : "Connect LMS"}
              </button>
            )}
          </div>

          {/* Connected credential card */}
          {hasConnected && activeCred && !showRemoteBrowser && (
            <div className="p-4 bg-bg-dark rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Status dot */}
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      activeCred.last_login_success === true
                        ? "bg-success"
                        : activeCred.last_login_success === false
                        ? "bg-error"
                        : "bg-warning"
                    }`}
                  />
                  <div>
                    <p className="text-white text-sm font-medium">
                      {activeCred.last_login_success === true
                        ? "Connected"
                        : activeCred.last_login_success === false
                        ? "Disconnected"
                        : "Unknown"}
                    </p>
                    <p className="text-text-muted text-xs capitalize">
                      {activeCred.lms_type} &middot; {activeCred.lms_url}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sync info */}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-secondary">
                {(activeCred.last_sync_at || syncStatus?.last_sync_at) && (
                  <span>
                    Last sync:{" "}
                    <span className="text-white">
                      {timeAgo(activeCred.last_sync_at || syncStatus?.last_sync_at || "")}
                    </span>
                  </span>
                )}
                {syncStatus?.status && (
                  <span>
                    Status:{" "}
                    <span
                      className={
                        syncStatus.status === "success"
                          ? "text-success"
                          : syncStatus.status === "error"
                          ? "text-error"
                          : "text-warning"
                      }
                    >
                      {syncStatus.status}
                    </span>
                  </span>
                )}
              </div>

              {/* Last error */}
              {(activeCred.last_error || syncStatus?.error) && (
                <div className="px-3 py-2 rounded-lg bg-error/5 border border-error/10">
                  <p className="text-error text-xs">
                    {activeCred.last_error || syncStatus?.error}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* No LMS connected */}
          {!hasConnected && !showRemoteBrowser && (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-bg-dark mx-auto flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
              </div>
              <p className="text-text-muted text-sm">No LMS connected.</p>
              <p className="text-text-muted text-xs mt-1">
                Connect your school LMS to sync assignments and grades automatically.
              </p>
            </div>
          )}

          {/* Remote browser */}
          {showRemoteBrowser && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-text-secondary text-sm">
                  Log into your LMS below. We will capture the session.
                </p>
                <button
                  onClick={() => setShowRemoteBrowser(false)}
                  className="text-text-muted text-sm hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              <div className="rounded-lg overflow-hidden border border-border">
                <RemoteBrowser
                  onComplete={() => {
                    setShowRemoteBrowser(false);
                    toast("success", "LMS connected successfully!");
                    if (token) fetchCredentials(token);
                  }}
                  onError={(msg) => toast("error", msg)}
                />
              </div>
            </div>
          )}
        </section>

        {/* ════════ 3. AI Personality ════════ */}
        <section className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">AI Personality</h2>
              <p className="text-text-muted text-xs mt-0.5">
                Choose how your AI assistant communicates.
              </p>
            </div>
            {savingPersonality && (
              <svg className="w-4 h-4 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PERSONALITIES.map((p) => {
              const isActive = editPersonality === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => savePersonality(p.id)}
                  className={`p-4 rounded-xl text-left transition-all cursor-pointer ${
                    isActive
                      ? "bg-accent/10 border-2 border-accent ring-1 ring-accent/20"
                      : "bg-bg-dark border border-border hover:border-accent/30"
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className={isActive ? "text-accent" : "text-text-secondary"}>
                      {p.icon}
                    </span>
                    <span className="text-white text-sm font-semibold">{p.label}</span>
                    {isActive && (
                      <span className="ml-auto flex items-center gap-1 text-accent text-xs font-medium">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-text-muted text-xs mb-2">{p.desc}</p>
                  <div className="px-3 py-2 rounded-lg bg-bg-dark/50 border border-border/50">
                    <p className="text-text-secondary text-xs italic leading-relaxed">
                      {p.preview}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ════════ 4. Email Preferences ════════ */}
        <section className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold text-white">Email Preferences</h2>

          {/* Briefing toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Daily Briefing</p>
              <p className="text-text-muted text-xs mt-0.5">
                Morning email with your plan, grade alerts, and priorities.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={editBriefingEnabled}
              onClick={() => setEditBriefingEnabled(!editBriefingEnabled)}
              className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative flex-shrink-0 ${
                editBriefingEnabled ? "bg-accent" : "bg-bg-dark border border-border"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  editBriefingEnabled ? "left-6" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Briefing time */}
          {editBriefingEnabled && (
            <div>
              <label htmlFor="setting-briefing-time" className="block text-text-secondary text-sm mb-1.5">
                Preferred Time
              </label>
              <select
                id="setting-briefing-time"
                value={editBriefingTime}
                onChange={(e) => setEditBriefingTime(e.target.value)}
                className="w-full sm:w-48 px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white text-sm focus:outline-none focus:border-accent transition-colors"
              >
                {BRIEFING_TIMES.map((bt) => (
                  <option key={bt.value} value={bt.value}>
                    {bt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={saveEmailPreferences}
            disabled={savingEmail}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingEmail ? "Saving..." : "Save Email Preferences"}
          </button>
        </section>

        {/* ════════ 5. Danger Zone ════════ */}
        <section className="bg-bg-card border border-error/20 rounded-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold text-error">Danger Zone</h2>

          {/* Disconnect LMS */}
          {hasConnected && activeCred && (
            <div className="flex items-center justify-between p-4 bg-bg-dark rounded-lg">
              <div>
                <p className="text-white text-sm font-medium">Disconnect LMS</p>
                <p className="text-text-muted text-xs mt-0.5">
                  Remove your LMS credentials. You will stop receiving synced data.
                </p>
              </div>
              {confirmDisconnect === activeCred.id ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => disconnectLMS(activeCred.id)}
                    className="px-3 py-1.5 rounded-lg bg-error text-white text-xs font-medium hover:bg-error/90 transition-colors cursor-pointer"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDisconnect(null)}
                    className="px-3 py-1.5 rounded-lg bg-bg-card text-text-secondary text-xs font-medium hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDisconnect(activeCred.id)}
                  className="px-4 py-2 rounded-lg border border-error/30 text-error text-sm font-medium hover:bg-error/10 transition-colors cursor-pointer flex-shrink-0"
                >
                  Disconnect
                </button>
              )}
            </div>
          )}

          {/* Delete Account */}
          <div className="flex items-center justify-between p-4 bg-bg-dark rounded-lg">
            <div>
              <p className="text-white text-sm font-medium">Delete Account</p>
              <p className="text-text-muted text-xs mt-0.5">
                Permanently delete your account and all associated data. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => setConfirmDeleteAccount(true)}
              className="px-4 py-2 rounded-lg border border-error/30 text-error text-sm font-medium hover:bg-error/10 transition-colors cursor-pointer flex-shrink-0"
            >
              Delete Account
            </button>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="w-full py-2.5 rounded-lg bg-bg-dark border border-border text-text-secondary text-sm font-medium hover:text-white hover:border-accent/30 transition-colors cursor-pointer"
          >
            Sign Out
          </button>
        </section>

        {/* Footer */}
        <div className="text-center text-text-muted text-xs pb-8">
          SchoolPilot v3.0
        </div>
      </div>

      {/* ════════ Delete Account Confirmation Modal ════════ */}
      {confirmDeleteAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmDeleteAccount(false)}
          />
          {/* Modal */}
          <div className="relative bg-bg-card border border-error/20 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold">Delete Account</h3>
                <p className="text-text-muted text-sm">This action is permanent.</p>
              </div>
            </div>

            <p className="text-text-secondary text-sm">
              All your data -- assignments, grades, study sessions, chat history -- will be permanently
              deleted. This cannot be undone.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmDeleteAccount(false)}
                className="flex-1 py-2.5 rounded-lg bg-bg-dark border border-border text-text-secondary text-sm font-medium hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={deletingAccount}
                className="flex-1 py-2.5 rounded-lg bg-error text-white text-sm font-medium hover:bg-error/90 transition-colors cursor-pointer disabled:opacity-50"
              >
                {deletingAccount ? "Deleting..." : "Yes, Delete My Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation keyframes */}
      <style jsx>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(16px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
