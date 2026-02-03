"use client";

import { createClient } from "@/lib/supabase-client";
import { apiFetch } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";

interface ScheduleTask {
  time: string;
  title: string;
  details: string;
  completed?: boolean;
}

interface UrgentTask {
  title: string;
  details: string;
  completed?: boolean;
}

interface AutopilotPlan {
  greeting: string;
  mission: string;
  urgent: UrgentTask[];
  schedule: ScheduleTask[];
  tip: string;
  done_when: string;
}

interface Assignment {
  title?: string;
  type?: string;
  due?: string;
  course?: string;
  date?: string;
  day?: string;
  isOverdue?: boolean;
}

interface ScrapedData {
  upcoming: Assignment[];
  overdue: Assignment[];
}

export default function TodayPage() {
  const [plan, setPlan] = useState<AutopilotPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [overdue, setOverdue] = useState<Assignment[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Settings
  const [wakeTime, setWakeTime] = useState("7:00 AM");
  const [studyHours, setStudyHours] = useState(2);
  const [autoEmailEnabled, setAutoEmailEnabled] = useState(false);
  const [autoEmailTime, setAutoEmailTime] = useState("6:30 AM");

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserEmail(user.email || "");
      setUserName(user.user_metadata?.full_name?.split(" ")[0] || "");

      // Get latest scraped assignments
      const { data: scraped } = await supabase
        .from("scraped_assignments")
        .select("assignments")
        .eq("user_id", user.id)
        .order("scraped_at", { ascending: false })
        .limit(1)
        .single();

      if (scraped?.assignments) {
        const data = scraped.assignments as ScrapedData;
        setAssignments(data.upcoming || []);
        setOverdue(data.overdue || []);
      }

      // Load saved preferences from localStorage
      const savedPrefs = localStorage.getItem("autopilot_prefs");
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);
        setWakeTime(prefs.wakeTime || "7:00 AM");
        setStudyHours(prefs.studyHours || 2);
        setAutoEmailEnabled(prefs.autoEmailEnabled || false);
        setAutoEmailTime(prefs.autoEmailTime || "6:30 AM");
      }

      // Load today's plan from localStorage if exists
      const savedPlan = localStorage.getItem("today_plan");
      const savedDate = localStorage.getItem("today_plan_date");
      const today = new Date().toDateString();
      if (savedPlan && savedDate === today) {
        setPlan(JSON.parse(savedPlan));
        const savedCompleted = localStorage.getItem("today_completed");
        if (savedCompleted) {
          setCompletedTasks(new Set(JSON.parse(savedCompleted)));
        }
      }

      setPageLoading(false);
    };
    load();
  }, []);

  const generatePlan = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await apiFetch<AutopilotPlan>("autopilot/generate", {
        assignments,
        overdue,
        available_study_hours: studyHours,
        wake_time: wakeTime,
        name: userName,
      });

      setPlan(result);
      setCompletedTasks(new Set());

      // Save to localStorage
      localStorage.setItem("today_plan", JSON.stringify(result));
      localStorage.setItem("today_plan_date", new Date().toDateString());
      localStorage.setItem("today_completed", JSON.stringify([]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  }, [assignments, overdue, studyHours, wakeTime, userName]);

  const toggleTask = (taskId: string) => {
    const newCompleted = new Set(completedTasks);
    if (newCompleted.has(taskId)) {
      newCompleted.delete(taskId);
    } else {
      newCompleted.add(taskId);
    }
    setCompletedTasks(newCompleted);
    localStorage.setItem("today_completed", JSON.stringify([...newCompleted]));
  };

  const sendEmailNow = async () => {
    if (!userEmail) {
      setError("No email found");
      return;
    }

    setSendingEmail(true);
    setError("");

    try {
      await apiFetch("autopilot/send", {
        email: userEmail,
        assignments,
        overdue,
        available_study_hours: studyHours,
        wake_time: wakeTime,
        name: userName,
      });
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  const savePreferences = () => {
    localStorage.setItem("autopilot_prefs", JSON.stringify({
      wakeTime,
      studyHours,
      autoEmailEnabled,
      autoEmailTime,
    }));
  };

  const totalTasks = (plan?.schedule?.length || 0) + (plan?.urgent?.length || 0);
  const completedCount = completedTasks.size;
  const progressPercent = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const todayStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (pageLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-8 w-48 bg-bg-card rounded animate-pulse" />
        <div className="h-64 bg-bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {greeting}{userName ? `, ${userName}` : ""}! 👋
          </h2>
          <p className="text-text-muted text-sm mt-1">{todayStr}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={sendEmailNow}
            disabled={sendingEmail || !plan}
            className="px-4 py-2 rounded-lg bg-bg-card border border-border text-text-secondary text-sm hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            {sendingEmail ? "Sending..." : emailSent ? "✓ Sent!" : "📧 Email Plan"}
          </button>
          <button
            onClick={generatePlan}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? "Generating..." : plan ? "🔄 Refresh" : "⚡ Generate Plan"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-error/10 text-error text-sm">{error}</div>
      )}

      {/* No assignments state */}
      {assignments.length === 0 && overdue.length === 0 && !plan && (
        <div className="p-8 rounded-xl bg-bg-card border border-border text-center">
          <div className="text-4xl mb-4">📚</div>
          <h3 className="text-white font-semibold mb-2">No Assignments Yet</h3>
          <p className="text-text-muted text-sm mb-4">
            Sync your assignments from Teamie to get your personalized daily plan.
          </p>
          <p className="text-text-muted text-xs">
            Go to Teamie → Click the SchoolPilot extension → Sync
          </p>
        </div>
      )}

      {/* Quick Stats */}
      {(assignments.length > 0 || overdue.length > 0) && !plan && (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-bg-card border border-border text-center">
            <div className="text-3xl font-bold text-error">{overdue.length}</div>
            <div className="text-text-muted text-xs mt-1">Overdue</div>
          </div>
          <div className="p-4 rounded-xl bg-bg-card border border-border text-center">
            <div className="text-3xl font-bold text-warning">{assignments.filter(a => a.date && parseInt(a.date) <= new Date().getDate() + 1).length}</div>
            <div className="text-text-muted text-xs mt-1">Due Soon</div>
          </div>
          <div className="p-4 rounded-xl bg-bg-card border border-border text-center">
            <div className="text-3xl font-bold text-accent">{assignments.length}</div>
            <div className="text-text-muted text-xs mt-1">Total Tasks</div>
          </div>
        </div>
      )}

      {/* Settings (collapsed) */}
      {!plan && (
        <details className="rounded-xl bg-bg-card border border-border overflow-hidden">
          <summary className="p-4 cursor-pointer text-text-secondary hover:text-white transition-colors">
            ⚙️ Plan Settings
          </summary>
          <div className="p-4 pt-0 border-t border-border space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-text-secondary text-sm block mb-2">Wake Time</label>
                <select
                  value={wakeTime}
                  onChange={(e) => { setWakeTime(e.target.value); savePreferences(); }}
                  className="w-full px-3 py-2 rounded-lg bg-bg-dark border border-border text-white text-sm"
                >
                  {["5:00 AM", "5:30 AM", "6:00 AM", "6:30 AM", "7:00 AM", "7:30 AM", "8:00 AM", "8:30 AM", "9:00 AM"].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-text-secondary text-sm block mb-2">Study Hours Today</label>
                <select
                  value={studyHours}
                  onChange={(e) => { setStudyHours(parseInt(e.target.value)); savePreferences(); }}
                  className="w-full px-3 py-2 rounded-lg bg-bg-dark border border-border text-white text-sm"
                >
                  {[1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6].map(h => (
                    <option key={h} value={h}>{h} hour{h !== 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-dark">
              <div>
                <div className="text-white text-sm font-medium">Daily Morning Email</div>
                <div className="text-text-muted text-xs">Get your plan emailed automatically</div>
              </div>
              <button
                onClick={() => { setAutoEmailEnabled(!autoEmailEnabled); savePreferences(); }}
                className={`w-12 h-6 rounded-full transition-colors ${autoEmailEnabled ? "bg-accent" : "bg-border"} relative`}
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${autoEmailEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>
        </details>
      )}

      {/* Generate Button (if no plan yet) */}
      {!plan && (assignments.length > 0 || overdue.length > 0) && (
        <button
          onClick={generatePlan}
          disabled={loading}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent text-white font-semibold text-lg transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-accent/20"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⚡</span> Building your plan...
            </span>
          ) : (
            "⚡ Generate Today's Plan"
          )}
        </button>
      )}

      {/* The Plan */}
      {plan && (
        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-accent/10 to-success/10 border border-accent/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium">Today&apos;s Progress</span>
              <span className="text-accent font-bold">{completedCount}/{totalTasks}</span>
            </div>
            <div className="h-3 bg-bg-dark rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-success transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {progressPercent === 100 && (
              <div className="text-center mt-3 text-success font-medium">
                🎉 You crushed it today!
              </div>
            )}
          </div>

          {/* Mission */}
          <div className="p-4 rounded-xl bg-bg-card border border-border">
            <div className="text-accent font-medium text-sm mb-1">⚡ TODAY&apos;S MISSION</div>
            <div className="text-white text-lg">{plan.mission}</div>
          </div>

          {/* Urgent Tasks */}
          {plan.urgent && plan.urgent.length > 0 && (
            <div className="p-4 rounded-xl bg-error/10 border border-error/30">
              <div className="text-error font-semibold mb-3">🚨 DO THESE FIRST</div>
              <div className="space-y-2">
                {plan.urgent.map((task, i) => {
                  const taskId = `urgent-${i}`;
                  const isCompleted = completedTasks.has(taskId);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleTask(taskId)}
                      className={`w-full text-left p-3 rounded-lg transition-all cursor-pointer flex items-start gap-3 ${
                        isCompleted ? "bg-success/10 border border-success/30" : "bg-bg-dark border border-border hover:border-error/30"
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isCompleted ? "bg-success border-success text-white" : "border-error/50"
                      }`}>
                        {isCompleted && "✓"}
                      </span>
                      <div className="flex-1">
                        <div className={`font-medium ${isCompleted ? "text-text-muted line-through" : "text-white"}`}>
                          {task.title}
                        </div>
                        {task.details && (
                          <div className={`text-sm mt-1 ${isCompleted ? "text-text-muted" : "text-text-secondary"}`}>
                            {task.details}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Schedule */}
          <div className="space-y-2">
            <div className="text-text-secondary text-sm font-medium px-1">📋 YOUR SCHEDULE</div>
            {plan.schedule?.map((task, i) => {
              const taskId = `schedule-${i}`;
              const isCompleted = completedTasks.has(taskId);
              return (
                <button
                  key={i}
                  onClick={() => toggleTask(taskId)}
                  className={`w-full text-left p-4 rounded-xl transition-all cursor-pointer flex items-start gap-4 ${
                    isCompleted
                      ? "bg-success/5 border border-success/20"
                      : "bg-bg-card border border-border hover:border-accent/30"
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isCompleted ? "bg-success border-success text-white" : "border-border"
                  }`}>
                    {isCompleted && "✓"}
                  </span>
                  <div className="min-w-[80px]">
                    <span className={`text-sm font-medium ${isCompleted ? "text-text-muted" : "text-accent"}`}>
                      {task.time}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className={`font-medium ${isCompleted ? "text-text-muted line-through" : "text-white"}`}>
                      {task.title}
                    </div>
                    {task.details && (
                      <div className={`text-sm mt-1 ${isCompleted ? "text-text-muted" : "text-text-secondary"}`}>
                        {task.details}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Pro Tip */}
          {plan.tip && (
            <div className="p-4 rounded-xl bg-success/10 border border-success/30">
              <div className="text-success font-medium text-sm mb-1">💡 PRO TIP</div>
              <div className="text-white text-sm">{plan.tip}</div>
            </div>
          )}

          {/* Done When */}
          <div className="p-4 rounded-xl bg-accent text-center">
            <div className="text-white/80 text-sm mb-1">🎯 YOU&apos;RE DONE WHEN</div>
            <div className="text-white font-medium">{plan.done_when}</div>
          </div>
        </div>
      )}
    </div>
  );
}
