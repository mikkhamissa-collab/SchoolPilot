"use client";

// Settings page — profile, personality, LMS credentials, briefings, data export
import { createClient } from "@/lib/supabase-client";
import { backendFetch } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface StudentProfile {
  display_name: string | null;
  school_name: string | null;
  grade_level: string | null;
  timezone: string | null;
  personality_preset: string;
  goals: string[];
  daily_briefing_enabled: boolean;
  briefing_time: string | null;
  email_briefings: boolean;
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

const PERSONALITIES = [
  { id: "coach", name: "Coach", emoji: "🏋️", desc: "Firm but encouraging. Keeps you on track." },
  { id: "friend", name: "Friend", emoji: "😊", desc: "Casual and supportive. Like texting a smart friend." },
  { id: "mentor", name: "Mentor", emoji: "🎓", desc: "Thoughtful and wise. Helps you grow." },
  { id: "drill_sergeant", name: "Drill Sergeant", emoji: "🫡", desc: "No excuses. Maximum accountability." },
];

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "Europe/London",
  "Europe/Paris", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney",
];

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [credentials, setCredentials] = useState<LMSCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [token, setToken] = useState("");
  const [userEmail, setUserEmail] = useState("");

  // LMS credential form
  const [showAddLMS, setShowAddLMS] = useState(false);
  const [lmsType, setLmsType] = useState("teamie");
  const [lmsUrl, setLmsUrl] = useState("");
  const [lmsUser, setLmsUser] = useState("");
  const [lmsPass, setLmsPass] = useState("");
  const [lmsSaving, setLmsSaving] = useState(false);

  // Profile editing
  const [editName, setEditName] = useState("");
  const [editSchool, setEditSchool] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editTimezone, setEditTimezone] = useState("");
  const [editPersonality, setEditPersonality] = useState("coach");
  const [editBriefing, setEditBriefing] = useState(false);
  const [editGoals, setEditGoals] = useState<string[]>([]);
  const [newGoal, setNewGoal] = useState("");

  // Export
  const [exporting, setExporting] = useState(false);

  const showMsg = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      setToken(session.access_token);
      setUserEmail(session.user?.email || "");

      const headers = { Authorization: `Bearer ${session.access_token}` };

      try {
        const [profileRes, credsRes] = await Promise.allSettled([
          fetch(`${API_URL}/api/profile/me`, { headers }),
          fetch(`${API_URL}/api/auth/lms-credentials`, { headers }),
        ]);

        if (profileRes.status === "fulfilled" && profileRes.value.ok) {
          const data = await profileRes.value.json();
          setProfile(data);
          setEditName(data.display_name || "");
          setEditSchool(data.school_name || "");
          setEditGrade(data.grade_level || "");
          setEditTimezone(data.timezone || "America/New_York");
          setEditPersonality(data.personality_preset || "coach");
          setEditBriefing(data.daily_briefing_enabled || false);
          setEditGoals(data.goals || []);
        }

        if (credsRes.status === "fulfilled" && credsRes.value.ok) {
          setCredentials(await credsRes.value.json());
        }
      } catch {
        showMsg("error", "Failed to load settings.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [showMsg]);

  const saveProfile = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/profile/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          display_name: editName || null,
          school_name: editSchool || null,
          grade_level: editGrade || null,
          timezone: editTimezone || null,
          personality_preset: editPersonality,
          daily_briefing_enabled: editBriefing,
          goals: editGoals,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        showMsg("success", "Profile saved!");
      } else {
        showMsg("error", "Failed to save profile.");
      }
    } catch {
      showMsg("error", "Network error saving profile.");
    } finally {
      setSaving(false);
    }
  };

  const saveLMSCredential = async () => {
    if (!token || !lmsUrl.trim() || !lmsUser.trim() || !lmsPass) return;
    setLmsSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/lms-credentials`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lms_type: lmsType,
          lms_url: lmsUrl.trim(),
          username: lmsUser.trim(),
          password: lmsPass,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCredentials((prev) => {
          const existing = prev.findIndex((c) => c.id === data.id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = data;
            return updated;
          }
          return [...prev, data];
        });
        setShowAddLMS(false);
        setLmsUrl("");
        setLmsUser("");
        setLmsPass("");
        showMsg("success", "LMS credentials saved!");
      } else {
        const err = await res.json();
        showMsg("error", err.detail || "Failed to save credentials.");
      }
    } catch {
      showMsg("error", "Network error saving credentials.");
    } finally {
      setLmsSaving(false);
    }
  };

  const deleteLMSCredential = async (id: string) => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/auth/lms-credentials/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setCredentials((prev) => prev.filter((c) => c.id !== id));
      showMsg("success", "Credential deleted.");
    } catch {
      showMsg("error", "Failed to delete credential.");
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await backendFetch<Record<string, unknown>>("/api/profile/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `schoolpilot-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMsg("success", "Data exported!");
    } catch {
      showMsg("error", "Failed to export data.");
    } finally {
      setExporting(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    try { localStorage.removeItem("schoolpilot_ext_token"); } catch { /* ignore */ }
    router.push("/auth/login");
  };

  const addGoal = () => {
    const trimmed = newGoal.trim();
    if (trimmed && !editGoals.includes(trimmed)) {
      setEditGoals([...editGoals, trimmed]);
      setNewGoal("");
    }
  };

  const removeGoal = (goal: string) => {
    setEditGoals(editGoals.filter((g) => g !== goal));
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 w-32 bg-bg-card rounded" />
        <div className="h-48 bg-bg-card rounded-xl" />
        <div className="h-48 bg-bg-card rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-text-secondary mt-1">Manage your profile, LMS connections, and preferences.</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === "success" ? "bg-success/10 text-success" : "bg-error/10 text-error"
        }`}>
          {message.text}
        </div>
      )}

      {/* ====== Profile ====== */}
      <section className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-lg font-semibold text-white">Profile</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="settings-name" className="block text-text-secondary text-sm mb-1.5">Name</label>
            <input
              id="settings-name"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm"
              placeholder="Your name"
            />
          </div>
          <div>
            <label htmlFor="settings-email" className="block text-text-secondary text-sm mb-1.5">Email</label>
            <input
              id="settings-email"
              type="email"
              value={userEmail}
              disabled
              className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-text-muted text-sm cursor-not-allowed"
            />
          </div>
          <div>
            <label htmlFor="settings-school" className="block text-text-secondary text-sm mb-1.5">School</label>
            <input
              id="settings-school"
              type="text"
              value={editSchool}
              onChange={(e) => setEditSchool(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm"
              placeholder="Your school"
            />
          </div>
          <div>
            <label htmlFor="settings-grade" className="block text-text-secondary text-sm mb-1.5">Grade Level</label>
            <select
              id="settings-grade"
              value={editGrade}
              onChange={(e) => setEditGrade(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Select...</option>
              {["9th Grade", "10th Grade", "11th Grade", "12th Grade", "College Freshman", "College Sophomore", "College Junior", "College Senior", "Other"].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="settings-tz" className="block text-text-secondary text-sm mb-1.5">Timezone</label>
            <select
              id="settings-tz"
              value={editTimezone}
              onChange={(e) => setEditTimezone(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white text-sm focus:outline-none focus:border-accent"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ====== AI Personality ====== */}
      <section className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-lg font-semibold text-white">AI Personality</h3>
        <div className="grid grid-cols-2 gap-3">
          {PERSONALITIES.map((p) => (
            <button
              key={p.id}
              onClick={() => setEditPersonality(p.id)}
              className={`p-3 rounded-xl text-left transition-all cursor-pointer ${
                editPersonality === p.id
                  ? "bg-accent/10 border-2 border-accent"
                  : "bg-bg-dark border border-border hover:border-accent/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{p.emoji}</span>
                <span className="text-white text-sm font-medium">{p.name}</span>
                {editPersonality === p.id && (
                  <span className="ml-auto text-accent text-xs">Active</span>
                )}
              </div>
              <p className="text-text-muted text-xs">{p.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ====== Goals ====== */}
      <section className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-lg font-semibold text-white">Goals</h3>
        <div className="flex flex-wrap gap-2">
          {editGoals.map((goal) => (
            <span
              key={goal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm"
            >
              {goal}
              <button
                onClick={() => removeGoal(goal)}
                className="hover:text-error transition-colors cursor-pointer"
                aria-label={`Remove goal: ${goal}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGoal(); } }}
            placeholder="Add a goal..."
            className="flex-1 px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm"
          />
          <button
            onClick={addGoal}
            disabled={!newGoal.trim()}
            className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </section>

      {/* ====== Daily Briefing ====== */}
      <section className="bg-bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Daily Email Briefing</h3>
            <p className="text-text-muted text-sm mt-0.5">Get a morning email with your plan for the day.</p>
          </div>
          <button
            role="switch"
            aria-checked={editBriefing}
            onClick={() => setEditBriefing(!editBriefing)}
            className={`w-12 h-6 rounded-full transition-colors cursor-pointer relative ${
              editBriefing ? "bg-accent" : "bg-bg-dark border border-border"
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
              editBriefing ? "left-7" : "left-1"
            }`} />
          </button>
        </div>
      </section>

      {/* Save profile button */}
      <button
        onClick={saveProfile}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors cursor-pointer disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Profile"}
      </button>

      {/* ====== LMS Connections ====== */}
      <section className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">LMS Connections</h3>
          <button
            onClick={() => setShowAddLMS(!showAddLMS)}
            className="text-accent text-sm font-medium hover:underline cursor-pointer"
          >
            {showAddLMS ? "Cancel" : "+ Add LMS"}
          </button>
        </div>

        {credentials.length === 0 && !showAddLMS && (
          <div className="text-center py-6">
            <p className="text-text-muted text-sm">No LMS connected yet.</p>
            <button
              onClick={() => setShowAddLMS(true)}
              className="mt-2 text-accent text-sm hover:underline cursor-pointer"
            >
              Connect your LMS
            </button>
          </div>
        )}

        {credentials.map((cred) => (
          <div key={cred.id} className="flex items-center gap-3 p-3 bg-bg-dark rounded-lg">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent text-lg">
              {cred.lms_type === "teamie" ? "T" : cred.lms_type === "canvas" ? "C" : cred.lms_type === "blackboard" ? "B" : "G"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium capitalize">{cred.lms_type}</p>
              <p className="text-text-muted text-xs truncate">{cred.lms_url}</p>
              {cred.last_sync_at && (
                <p className="text-text-muted text-xs">
                  Last sync: {new Date(cred.last_sync_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                cred.last_login_success === true ? "bg-success" :
                cred.last_login_success === false ? "bg-error" : "bg-text-muted"
              }`} />
              <button
                onClick={() => deleteLMSCredential(cred.id)}
                className="p-1.5 rounded-lg hover:bg-error/10 text-text-muted hover:text-error transition-colors cursor-pointer"
                aria-label="Delete credential"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {showAddLMS && (
          <div className="space-y-3 p-4 bg-bg-dark rounded-lg">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="lms-type" className="block text-text-secondary text-sm mb-1.5">LMS Type</label>
                <select
                  id="lms-type"
                  value={lmsType}
                  onChange={(e) => setLmsType(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-card border border-border text-white text-sm focus:outline-none focus:border-accent"
                >
                  <option value="teamie">Teamie</option>
                  <option value="canvas">Canvas</option>
                  <option value="blackboard">Blackboard</option>
                  <option value="google_classroom">Google Classroom</option>
                  <option value="schoology">Schoology</option>
                  <option value="moodle">Moodle</option>
                </select>
              </div>
              <div>
                <label htmlFor="lms-url" className="block text-text-secondary text-sm mb-1.5">LMS URL</label>
                <input
                  id="lms-url"
                  type="url"
                  value={lmsUrl}
                  onChange={(e) => setLmsUrl(e.target.value)}
                  placeholder="https://lms.school.edu"
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="lms-user" className="block text-text-secondary text-sm mb-1.5">Username</label>
                <input
                  id="lms-user"
                  type="text"
                  value={lmsUser}
                  onChange={(e) => setLmsUser(e.target.value)}
                  placeholder="Your LMS username"
                  autoComplete="username"
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm"
                />
              </div>
              <div>
                <label htmlFor="lms-pass" className="block text-text-secondary text-sm mb-1.5">Password</label>
                <input
                  id="lms-pass"
                  type="password"
                  value={lmsPass}
                  onChange={(e) => setLmsPass(e.target.value)}
                  placeholder="Your LMS password"
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-text-muted text-xs">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Credentials are encrypted and stored securely.
            </div>
            <button
              onClick={saveLMSCredential}
              disabled={lmsSaving || !lmsUrl.trim() || !lmsUser.trim() || !lmsPass}
              className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              {lmsSaving ? "Saving..." : "Save Credentials"}
            </button>
          </div>
        )}
      </section>

      {/* ====== Data & Account ====== */}
      <section className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-lg font-semibold text-white">Data & Account</h3>

        <div className="flex gap-3">
          <button
            onClick={exportData}
            disabled={exporting}
            className="flex-1 py-2.5 rounded-lg bg-bg-dark border border-border text-text-secondary text-sm font-medium hover:text-white hover:border-accent/30 transition-colors cursor-pointer disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "Export All Data"}
          </button>
          <button
            onClick={handleSignOut}
            className="flex-1 py-2.5 rounded-lg bg-error/10 border border-error/20 text-error text-sm font-medium hover:bg-error/20 transition-colors cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </section>

      {/* Footer */}
      <div className="text-center text-text-muted text-xs pb-8">
        SchoolPilot v3.0 &middot; Built for students, by students.
      </div>
    </div>
  );
}
