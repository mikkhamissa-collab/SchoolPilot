"use client";

import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";
import type { StreakData, BuddyData } from "@/lib/types";

interface Course {
  id: string;
  name: string;
  policies: { importance?: number; marzano?: boolean; units?: string[] } | null;
}

interface EditingUnits {
  courseId: string;
  units: string[];
}

export default function SettingsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingUnits, setEditingUnits] = useState<EditingUnits | null>(null);

  // Target grades per course
  const [targetGrades, setTargetGrades] = useState<Record<string, number>>({});
  const [savingTargets, setSavingTargets] = useState(false);

  // Autopilot settings
  const [autoEmailEnabled, setAutoEmailEnabled] = useState(false);
  const [autoEmailTime, setAutoEmailTime] = useState("6:30 AM");
  const [wakeTime, setWakeTime] = useState("7:00 AM");
  const [studyHours, setStudyHours] = useState(2);
  const [userEmail, setUserEmail] = useState("");

  // Stickiness settings
  const [userId, setUserId] = useState("");
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [buddy, setBuddy] = useState<BuddyData | null>(null);
  const [weekendMode, setWeekendMode] = useState(false);
  const [dailyReminder, setDailyReminder] = useState(true);
  const [reminderTime, setReminderTime] = useState("8:00 PM");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [acceptCode, setAcceptCode] = useState("");
  const [acceptLoading, setAcceptLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const uid = user.id;
      setUserId(uid);
      setUserEmail(user.email || "");

      // Load target grades from user metadata
      const savedTargets = user.user_metadata?.target_grades;
      if (savedTargets && typeof savedTargets === "object") {
        setTargetGrades(savedTargets);
      }

      const { data } = await supabase
        .from("courses")
        .select("id, name, policies")
        .eq("user_id", user.id)
        .order("name");
      if (data) setCourses(data);

      // Load autopilot preferences from localStorage
      try {
        const savedPrefs = localStorage.getItem("autopilot_prefs");
        if (savedPrefs) {
          const prefs = JSON.parse(savedPrefs);
          setWakeTime(prefs.wakeTime || "7:00 AM");
          setStudyHours(prefs.studyHours || 2);
          setAutoEmailEnabled(prefs.autoEmailEnabled || false);
          setAutoEmailTime(prefs.autoEmailTime || "6:30 AM");
        }
      } catch (err) {
        console.error("Failed to parse autopilot_prefs:", err);
        localStorage.removeItem("autopilot_prefs");
      }

      // Load stickiness preferences from localStorage
      try {
        const savedSticky = localStorage.getItem("stickiness_prefs");
        if (savedSticky) {
          const sPrefs = JSON.parse(savedSticky);
          setWeekendMode(sPrefs.weekendMode || false);
          setDailyReminder(sPrefs.dailyReminder !== false);
          setReminderTime(sPrefs.reminderTime || "8:00 PM");
        }
      } catch (err) {
        console.error("Failed to parse stickiness_prefs:", err);
        localStorage.removeItem("stickiness_prefs");
      }

      // Load streak and buddy in parallel (cookie auth)
      const [streakRes, buddyRes] = await Promise.allSettled([
        fetch("/api/streak"),
        fetch("/api/buddy/status"),
      ]);
      if (streakRes.status === "fulfilled" && streakRes.value.ok) {
        try { setStreak(await streakRes.value.json()); } catch { /* ignore parse errors */ }
      }
      if (buddyRes.status === "fulfilled" && buddyRes.value.ok) {
        try { setBuddy(await buddyRes.value.json()); } catch { /* ignore parse errors */ }
      }

      setLoading(false);
    };
    load();
  }, []);

  const saveStickyPrefs = (updates: Record<string, unknown>) => {
    const current = {
      weekendMode,
      dailyReminder,
      reminderTime,
      ...updates,
    };
    localStorage.setItem("stickiness_prefs", JSON.stringify(current));
  };

  const updateImportance = async (courseId: string, importance: number) => {
    setSaving(courseId);
    setMessage(null);

    const supabase = createClient();
    const course = courses.find((c) => c.id === courseId);
    const newPolicies = { ...(course?.policies || {}), importance };

    const { error } = await supabase
      .from("courses")
      .update({ policies: newPolicies })
      .eq("id", courseId);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setCourses(courses.map((c) =>
        c.id === courseId ? { ...c, policies: newPolicies } : c
      ));
      setMessage({ type: "success", text: "Saved!" });
      setTimeout(() => setMessage(null), 2000);
    }
    setSaving(null);
  };

  const toggleMarzano = async (courseId: string) => {
    setSaving(courseId);
    setMessage(null);

    const supabase = createClient();
    const course = courses.find((c) => c.id === courseId);
    const currentMarzano = course?.policies?.marzano || false;
    const newPolicies = { ...(course?.policies || {}), marzano: !currentMarzano };

    const { error } = await supabase
      .from("courses")
      .update({ policies: newPolicies })
      .eq("id", courseId);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setCourses(courses.map((c) =>
        c.id === courseId ? { ...c, policies: newPolicies } : c
      ));
    }
    setSaving(null);
  };

  const startEditingUnits = (course: Course) => {
    setEditingUnits({
      courseId: course.id,
      units: course.policies?.units || [""],
    });
  };

  const cancelEditingUnits = () => {
    setEditingUnits(null);
  };

  const updateUnit = (index: number, value: string) => {
    if (!editingUnits) return;
    const newUnits = [...editingUnits.units];
    newUnits[index] = value;
    setEditingUnits({ ...editingUnits, units: newUnits });
  };

  const addUnit = () => {
    if (!editingUnits) return;
    setEditingUnits({ ...editingUnits, units: [...editingUnits.units, ""] });
  };

  const removeUnit = (index: number) => {
    if (!editingUnits || editingUnits.units.length <= 1) return;
    const newUnits = editingUnits.units.filter((_, i) => i !== index);
    setEditingUnits({ ...editingUnits, units: newUnits });
  };

  const saveUnits = async () => {
    if (!editingUnits) return;
    setSaving(editingUnits.courseId);
    setMessage(null);

    const filteredUnits = editingUnits.units
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    const supabase = createClient();
    const course = courses.find((c) => c.id === editingUnits.courseId);
    const newPolicies = { ...(course?.policies || {}), units: filteredUnits };

    const { error } = await supabase
      .from("courses")
      .update({ policies: newPolicies })
      .eq("id", editingUnits.courseId);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setCourses(courses.map((c) =>
        c.id === editingUnits.courseId ? { ...c, policies: newPolicies } : c
      ));
      setMessage({ type: "success", text: "Units saved!" });
      setEditingUnits(null);
      setTimeout(() => setMessage(null), 2000);
    }
    setSaving(null);
  };

  const generateInvite = async () => {
    setInviteLoading(true);
    try {
      const res = await fetch("/api/buddy/invite", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setInviteLink(data.invite_link || "");
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: err.error || "Failed to generate invite" });
      }
    } catch (err) {
      console.error("Generate invite error:", err);
      setMessage({ type: "error", text: "Network error generating invite" });
    }
    setInviteLoading(false);
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  const acceptInvite = async () => {
    if (!acceptCode.trim()) return;
    setAcceptLoading(true);
    try {
      const res = await fetch("/api/buddy/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: acceptCode.trim() }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Partner connected!" });
        setAcceptCode("");
        // Refresh buddy status
        const buddyRes = await fetch("/api/buddy/status");
        if (buddyRes.ok) setBuddy(await buddyRes.json());
      } else {
        const errData = await res.json();
        setMessage({ type: "error", text: errData.error || "Invalid code" });
      }
    } catch (err) {
      console.error("Accept invite error:", err);
      setMessage({ type: "error", text: "Failed to connect" });
    }
    setAcceptLoading(false);
    setTimeout(() => setMessage(null), 3000);
  };

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="h-8 w-32 bg-bg-card rounded animate-pulse" />
        <div className="h-48 bg-bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  const importanceLevels = [
    { value: 1, label: "Low", color: "text-text-muted" },
    { value: 2, label: "Below Avg", color: "text-text-secondary" },
    { value: 3, label: "Normal", color: "text-white" },
    { value: 4, label: "Important", color: "text-warning" },
    { value: 5, label: "Critical", color: "text-error" },
  ];

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Settings ⚙️</h2>
        <p className="text-text-secondary mt-1">Make SchoolPilot work the way you do.</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 transition-all ${
          message.type === "success" ? "bg-success/10 text-success" : "bg-error/10 text-error"
        }`}>
          {message.type === "success" && <span>✓</span>}
          {message.type === "error" && <span>⚠️</span>}
          {message.text}
        </div>
      )}

      {/* ================================================================= */}
      {/* STREAK & MOTIVATION */}
      {/* ================================================================= */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">🔥 Streaks</h3>
          <p className="text-text-muted text-sm">
            Complete your #1 priority task each day to keep your streak alive.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-bg-card border border-border space-y-5">
          {/* Streak stats */}
          <div className="flex gap-4">
            <div className="flex-1 text-center p-3 rounded-lg bg-bg-dark">
              <div className="text-2xl font-bold text-warning">{streak?.current_streak || 0}</div>
              <div className="text-text-muted text-xs mt-0.5">Current Streak</div>
            </div>
            <div className="flex-1 text-center p-3 rounded-lg bg-bg-dark">
              <div className="text-2xl font-bold text-accent">{streak?.longest_streak || 0}</div>
              <div className="text-text-muted text-xs mt-0.5">Longest Streak</div>
            </div>
            <div className="flex-1 text-center p-3 rounded-lg bg-bg-dark">
              <div className="text-2xl font-bold text-white">
                {streak?.freeze_available ? "✓" : "✗"}
              </div>
              <div className="text-text-muted text-xs mt-0.5">Freeze Ready</div>
            </div>
          </div>

          {/* Weekend mode */}
          <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <div>
              <div className="text-white font-medium text-sm">Weekend Mode</div>
              <div className="text-text-muted text-xs">Weekends don&apos;t break your streak</div>
            </div>
            <button
              role="switch"
              aria-checked={weekendMode}
              onClick={() => {
                const next = !weekendMode;
                setWeekendMode(next);
                saveStickyPrefs({ weekendMode: next });
              }}
              className={`w-12 h-6 rounded-full transition-colors cursor-pointer relative ${
                weekendMode ? "bg-accent" : "bg-bg-dark border border-border"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  weekendMode ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* ACCOUNTABILITY PARTNER */}
      {/* ================================================================= */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">👥 Accountability Partner</h3>
          <p className="text-text-muted text-sm">
            Pair up with a friend. See each other&apos;s streaks and nudge them when they slack.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-bg-card border border-border space-y-4">
          {buddy?.has_partner ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🤝</span>
                <div>
                  <div className="text-white font-medium">{buddy.partner_name}</div>
                  <div className="text-text-muted text-xs">Your accountability partner</div>
                </div>
              </div>
              <div className="flex gap-3 text-sm">
                <div className="flex-1 p-2 rounded-lg bg-bg-dark text-center">
                  <div className="text-warning font-bold">🔥 {buddy.partner_streak || 0}</div>
                  <div className="text-text-muted text-xs">Their streak</div>
                </div>
                <div className="flex-1 p-2 rounded-lg bg-bg-dark text-center">
                  <div className="text-accent font-bold">🔥 {buddy.my_streak || 0}</div>
                  <div className="text-text-muted text-xs">Your streak</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Generate invite */}
              <div>
                <div className="text-white text-sm font-medium mb-2">Invite a friend</div>
                {inviteLink ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteLink}
                      className="flex-1 px-3 py-2 rounded-lg bg-bg-dark border border-border text-white text-sm truncate"
                    />
                    <button
                      onClick={copyInvite}
                      className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors cursor-pointer"
                    >
                      {inviteCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={generateInvite}
                    disabled={inviteLoading}
                    className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {inviteLoading ? "Generating..." : "Generate Invite Link"}
                  </button>
                )}
              </div>

              {/* Accept invite */}
              <div className="pt-3 border-t border-border/50">
                <div className="text-white text-sm font-medium mb-2">Have a code?</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Paste invite code"
                    value={acceptCode}
                    onChange={(e) => setAcceptCode(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted text-sm focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={acceptInvite}
                    disabled={acceptLoading || !acceptCode.trim()}
                    className="px-4 py-2 rounded-lg bg-success/20 text-success text-sm font-medium hover:bg-success/30 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {acceptLoading ? "..." : "Join"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* DAILY REMINDERS */}
      {/* ================================================================= */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">🔔 Daily Reminders</h3>
          <p className="text-text-muted text-sm">
            Get a nudge if you haven&apos;t completed your tasks for the day.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-medium text-sm">Evening Reminder</div>
              <div className="text-text-muted text-xs">Reminds you to finish your priority task</div>
            </div>
            <button
              role="switch"
              aria-checked={dailyReminder}
              onClick={() => {
                const next = !dailyReminder;
                setDailyReminder(next);
                saveStickyPrefs({ dailyReminder: next });
              }}
              className={`w-12 h-6 rounded-full transition-colors cursor-pointer relative ${
                dailyReminder ? "bg-accent" : "bg-bg-dark border border-border"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  dailyReminder ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          {dailyReminder && (
            <div className="pt-3 border-t border-border/50">
              <label className="text-text-secondary text-sm block mb-2">Reminder Time</label>
              <select
                value={reminderTime}
                onChange={(e) => {
                  setReminderTime(e.target.value);
                  saveStickyPrefs({ reminderTime: e.target.value });
                }}
                className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white text-sm focus:outline-none focus:border-accent"
              >
                {["5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM", "10:00 PM"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* CLASS IMPORTANCE */}
      {/* ================================================================= */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">Class Importance</h3>
          <p className="text-text-muted text-sm">
            Rank your classes by personal importance. Higher importance classes will be prioritized in &ldquo;Most Pressing&rdquo; and study recommendations.
          </p>
        </div>

        {courses.length === 0 ? (
          <div className="p-6 rounded-xl bg-bg-card border border-border text-center">
            <div className="text-3xl mb-3">📚</div>
            <p className="text-white font-medium mb-1">No courses yet</p>
            <p className="text-text-muted text-sm">
              Sync your assignments from Teamie and your courses will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((course) => {
              const currentImportance = course.policies?.importance || 3;
              const isSaving = saving === course.id;

              return (
                <div
                  key={course.id}
                  className="p-4 rounded-xl bg-bg-card border border-border"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-white font-medium truncate flex-1 mr-4">
                      {course.name}
                    </span>
                    {isSaving && (
                      <span className="text-accent text-xs flex items-center gap-1">
                        <span className="animate-spin">⏳</span> Saving...
                      </span>
                    )}
                  </div>

                  {/* Importance slider */}
                  <div className="flex items-center gap-2">
                    {importanceLevels.map((level) => (
                      <button
                        key={level.value}
                        onClick={() => updateImportance(course.id, level.value)}
                        disabled={isSaving}
                        className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                          currentImportance === level.value
                            ? `bg-accent/20 border-2 border-accent ${level.color}`
                            : "bg-bg-dark border border-border text-text-muted hover:border-accent/30"
                        }`}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>

                  {/* Marzano toggle */}
                  <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                    <div>
                      <span className="text-text-secondary text-sm">Marzano Grading</span>
                      <p className="text-text-muted text-xs">Uses 0-4 scale instead of percentages</p>
                    </div>
                    <button
                      onClick={() => toggleMarzano(course.id)}
                      disabled={isSaving}
                      className={`w-12 h-6 rounded-full transition-colors cursor-pointer relative ${
                        course.policies?.marzano
                          ? "bg-accent"
                          : "bg-bg-dark border border-border"
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                          course.policies?.marzano ? "left-7" : "left-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Units / Curriculum */}
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-text-secondary text-sm">Course Units</span>
                        <p className="text-text-muted text-xs">Define units for structured studying</p>
                      </div>
                      {editingUnits?.courseId !== course.id && (
                        <button
                          onClick={() => startEditingUnits(course)}
                          className="text-accent text-xs hover:underline cursor-pointer"
                        >
                          {course.policies?.units?.length ? "Edit" : "Add Units"}
                        </button>
                      )}
                    </div>

                    {editingUnits?.courseId === course.id ? (
                      <div className="space-y-2">
                        {editingUnits.units.map((unit, i) => (
                          <div key={i} className="flex gap-2">
                            <input
                              type="text"
                              placeholder={`Unit ${i + 1} (e.g., Chapter 5, Memory Systems)`}
                              value={unit}
                              onChange={(e) => updateUnit(i, e.target.value)}
                              className="flex-1 px-3 py-2 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm"
                            />
                            {editingUnits.units.length > 1 && (
                              <button
                                onClick={() => removeUnit(i)}
                                className="text-text-muted hover:text-error text-lg cursor-pointer px-1"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={addUnit}
                          className="text-accent text-xs hover:underline cursor-pointer"
                        >
                          + Add unit
                        </button>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={saveUnits}
                            disabled={isSaving}
                            className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEditingUnits}
                            className="px-3 py-1.5 rounded-lg bg-bg-dark border border-border text-text-secondary text-xs cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : course.policies?.units?.length ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {course.policies.units.map((unit, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 rounded-lg bg-bg-dark text-text-secondary text-xs"
                          >
                            {unit}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Target Grades */}
      {courses.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">🎯 Target Grades</h3>
            <p className="text-text-muted text-sm">
              Set your target grade per class. Grade Guardian will alert you when you&apos;re at risk of dropping below these targets.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-bg-card border border-border space-y-4">
            {courses.map((course) => {
              const currentTarget = targetGrades[course.name] || 90;
              return (
                <div key={course.id} className="flex items-center justify-between gap-4">
                  <span className="text-white text-sm font-medium truncate flex-1">{course.name}</span>
                  <div className="flex items-center gap-2">
                    {[90, 85, 80, 75, 70].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => {
                          setTargetGrades({ ...targetGrades, [course.name]: pct });
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                          currentTarget === pct
                            ? "bg-accent text-white"
                            : "bg-bg-dark border border-border text-text-muted hover:border-accent/30"
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            <button
              onClick={async () => {
                setSavingTargets(true);
                const supabase = createClient();
                const { error: updateError } = await supabase.auth.updateUser({
                  data: { target_grades: targetGrades },
                });
                if (updateError) {
                  setMessage({ type: "error", text: updateError.message });
                } else {
                  setMessage({ type: "success", text: "Target grades saved!" });
                  setTimeout(() => setMessage(null), 2000);
                }
                setSavingTargets(false);
              }}
              disabled={savingTargets}
              className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              {savingTargets ? "Saving..." : "Save Target Grades"}
            </button>
          </div>
        </div>
      )}

      {/* Daily Autopilot Settings */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">⚡ Daily Autopilot</h3>
          <p className="text-text-muted text-sm">
            Wake up to a personalized daily plan. No decision-making required - just follow the checklist.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-bg-card border border-border space-y-5">
          {/* Morning Email Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-medium">Daily Morning Email</div>
              <div className="text-text-muted text-sm">Send yourself a plan from the Today page (auto-scheduling coming soon)</div>
            </div>
            <button
              role="switch"
              aria-checked={autoEmailEnabled}
              onClick={() => {
                const newValue = !autoEmailEnabled;
                setAutoEmailEnabled(newValue);
                localStorage.setItem("autopilot_prefs", JSON.stringify({
                  wakeTime, studyHours, autoEmailEnabled: newValue, autoEmailTime
                }));
              }}
              className={`w-14 h-7 rounded-full transition-colors cursor-pointer relative ${
                autoEmailEnabled ? "bg-accent" : "bg-bg-dark border border-border"
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
                  autoEmailEnabled ? "left-8" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Email Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-text-secondary text-sm block mb-2">Email Send Time</label>
              <select
                value={autoEmailTime}
                onChange={(e) => {
                  setAutoEmailTime(e.target.value);
                  localStorage.setItem("autopilot_prefs", JSON.stringify({
                    wakeTime, studyHours, autoEmailEnabled, autoEmailTime: e.target.value
                  }));
                }}
                className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white text-sm focus:outline-none focus:border-accent"
              >
                {["5:00 AM", "5:30 AM", "6:00 AM", "6:30 AM", "7:00 AM", "7:30 AM", "8:00 AM"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-text-secondary text-sm block mb-2">Your Wake Time</label>
              <select
                value={wakeTime}
                onChange={(e) => {
                  setWakeTime(e.target.value);
                  localStorage.setItem("autopilot_prefs", JSON.stringify({
                    wakeTime: e.target.value, studyHours, autoEmailEnabled, autoEmailTime
                  }));
                }}
                className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white text-sm focus:outline-none focus:border-accent"
              >
                {["5:00 AM", "5:30 AM", "6:00 AM", "6:30 AM", "7:00 AM", "7:30 AM", "8:00 AM", "8:30 AM", "9:00 AM"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Study Hours */}
          <div>
            <label className="text-text-secondary text-sm block mb-2">Daily Study Hours Available</label>
            <div className="flex gap-2">
              {[1, 1.5, 2, 2.5, 3, 4, 5].map(h => (
                <button
                  key={h}
                  onClick={() => {
                    setStudyHours(h);
                    localStorage.setItem("autopilot_prefs", JSON.stringify({
                      wakeTime, studyHours: h, autoEmailEnabled, autoEmailTime
                    }));
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    studyHours === h
                      ? "bg-accent text-white"
                      : "bg-bg-dark border border-border text-text-muted hover:border-accent/30"
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>

          {/* Email recipient */}
          <div className="pt-3 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-text-secondary text-sm">Email recipient</div>
                <div className="text-white text-sm font-medium">{userEmail || "Not set"}</div>
              </div>
              <a
                href="/today"
                className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
              >
                Open Today&apos;s Plan →
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="p-5 rounded-xl bg-bg-card border border-border">
        <h3 className="text-sm font-semibold text-text-secondary mb-2">About SchoolPilot</h3>
        <p className="text-text-muted text-sm">
          Built by a student who got tired of staring at a messy todo list. SchoolPilot uses AI to turn chaos into clarity.
        </p>
        <div className="mt-4 flex items-center gap-4 text-xs text-text-muted">
          <a href="https://schoolpilot.co" className="hover:text-accent transition-colors">Website</a>
          <span>•</span>
          <span>v2.2.0</span>
        </div>
      </div>
    </div>
  );
}
