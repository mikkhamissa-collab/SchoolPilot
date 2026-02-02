"use client";

import { createClient } from "@/lib/supabase-client";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

interface SprintTask { task: string; minutes: number; type: "learn" | "review" | "practice"; topic: string; }
interface SprintDay { day: number; date: string; theme: string; tasks: SprintTask[]; total_minutes: number; }
interface Sprint {
  id: string;
  test_name: string;
  test_date: string;
  plan: { test_name: string; course?: string; days: SprintDay[]; tips: string[] };
  checked: Record<string, boolean[]>;
  completed: boolean;
  created_at: string;
}
interface Course { id: string; name: string; }

const TYPE_COLORS: Record<string, string> = {
  learn: "bg-blue-500/15 text-blue-400",
  review: "bg-yellow-500/15 text-yellow-400",
  practice: "bg-green-500/15 text-green-400",
};

export default function SprintPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeSprint, setActiveSprint] = useState<Sprint | null>(null);
  const [pastSprints, setPastSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Form
  const [testName, setTestName] = useState("");
  const [testDate, setTestDate] = useState("");
  const [sprintCourse, setSprintCourse] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState("2");
  const [topics, setTopics] = useState(["", "", ""]);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const [coursesRes, activeRes, pastRes] = await Promise.all([
        supabase.from("courses").select("id, name").eq("user_id", user.id),
        supabase.from("sprints").select("*").eq("user_id", user.id).eq("completed", false).order("created_at", { ascending: false }).limit(1),
        supabase.from("sprints").select("*").eq("user_id", user.id).eq("completed", true).order("created_at", { ascending: false }).limit(5),
      ]);
      if (coursesRes.data) {
        setCourses(coursesRes.data);
        if (coursesRes.data.length > 0) setSprintCourse(coursesRes.data[0].name);
      }
      if (activeRes.data?.[0]) setActiveSprint(activeRes.data[0]);
      if (pastRes.data) setPastSprints(pastRes.data);
      setPageLoading(false);
    };
    load();
  }, []);

  const handleCreate = async () => {
    const filteredTopics = topics.filter(t => t.trim());
    if (!testName.trim() || !testDate || filteredTopics.length === 0) {
      setError("Fill in test name, date, and at least one topic");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<Sprint["plan"]>("sprint/create", {
        test_name: testName.trim(),
        test_date: testDate,
        course: sprintCourse || undefined,
        topics: filteredTopics,
        available_hours_per_day: parseFloat(hoursPerDay) || 2,
      });

      const supabase = createClient();
      const course = courses.find(c => c.name === sprintCourse);
      const { data } = await supabase
        .from("sprints")
        .insert({
          user_id: userId,
          course_id: course?.id || null,
          test_name: testName.trim(),
          test_date: testDate,
          plan: result,
          checked: {},
          completed: false,
        })
        .select()
        .single();
      if (data) setActiveSprint(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (dayIdx: number, taskIdx: number) => {
    if (!activeSprint) return;
    const checked = { ...activeSprint.checked };
    if (!checked[dayIdx]) checked[dayIdx] = activeSprint.plan.days[dayIdx].tasks.map(() => false);
    checked[dayIdx] = [...checked[dayIdx]];
    checked[dayIdx][taskIdx] = !checked[dayIdx][taskIdx];

    setActiveSprint({ ...activeSprint, checked });
    const supabase = createClient();
    await supabase.from("sprints").update({ checked }).eq("id", activeSprint.id);
  };

  const endSprint = async () => {
    if (!activeSprint || !confirm("End this sprint?")) return;
    const supabase = createClient();
    await supabase.from("sprints").update({ completed: true }).eq("id", activeSprint.id);
    setPastSprints([{ ...activeSprint, completed: true }, ...pastSprints]);
    setActiveSprint(null);
  };

  if (pageLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="h-8 w-32 bg-bg-card rounded animate-pulse" />
        <div className="h-64 bg-bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  // Calculate progress
  const totalTasks = activeSprint?.plan.days.reduce((sum, d) => sum + d.tasks.length, 0) || 0;
  const doneTasks = activeSprint ? Object.values(activeSprint.checked).flat().filter(Boolean).length : 0;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const inputClass = "px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm";

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-white">Sprint Mode</h2>

      {/* Active Sprint */}
      {activeSprint ? (
        <div className="space-y-4">
          {/* Header */}
          <div className="p-5 rounded-xl bg-bg-card border border-border">
            <h3 className="text-xl font-bold text-white">{activeSprint.plan.test_name}</h3>
            <p className="text-text-muted text-sm mt-1">
              {activeSprint.plan.course && `${activeSprint.plan.course} · `}
              Test: {new Date(activeSprint.test_date).toLocaleDateString()}
            </p>
          </div>

          {/* Progress */}
          <div className="p-4 rounded-xl bg-bg-card border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-secondary">{doneTasks}/{totalTasks} tasks</span>
              <span className="text-sm font-semibold text-accent">{progress}%</span>
            </div>
            <div className="w-full h-2 bg-bg-dark rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Days */}
          {activeSprint.plan.days.map((day, dayIdx) => (
            <div key={dayIdx} className="p-4 rounded-xl bg-bg-card border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-white font-semibold">Day {day.day}</span>
                  <span className="text-text-muted text-sm ml-2">{day.date}</span>
                </div>
                <span className="text-text-muted text-xs">{day.total_minutes} min</span>
              </div>
              <p className="text-accent text-sm font-medium">{day.theme}</p>
              <div className="space-y-2">
                {day.tasks.map((task, taskIdx) => {
                  const done = activeSprint.checked?.[dayIdx]?.[taskIdx] || false;
                  return (
                    <div key={taskIdx} className={`flex items-center gap-3 ${done ? "opacity-60" : ""}`}>
                      <input
                        type="checkbox"
                        className="task-checkbox"
                        checked={done}
                        onChange={() => toggleTask(dayIdx, taskIdx)}
                      />
                      <span className={`flex-1 text-sm ${done ? "line-through text-text-muted" : "text-white"}`}>
                        {task.task}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[task.type] || "text-text-muted"}`}>
                        {task.type}
                      </span>
                      <span className="text-text-muted text-xs whitespace-nowrap">{task.minutes}m</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Tips */}
          {activeSprint.plan.tips?.length > 0 && (
            <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
              <h4 className="text-sm font-semibold text-accent mb-2">Tips</h4>
              <ul className="space-y-1">
                {activeSprint.plan.tips.map((tip, i) => (
                  <li key={i} className="text-text-secondary text-sm">• {tip}</li>
                ))}
              </ul>
            </div>
          )}

          {/* End Sprint */}
          <button
            onClick={endSprint}
            className="w-full py-2.5 rounded-lg bg-error/10 border border-error/20 text-error font-medium hover:bg-error/20 transition-colors cursor-pointer"
          >
            End Sprint
          </button>
        </div>
      ) : (
        /* Create form */
        <div className="p-5 rounded-xl bg-bg-card border border-border space-y-4">
          <input
            type="text"
            placeholder="Test / Assessment Name"
            value={testName}
            onChange={(e) => setTestName(e.target.value)}
            className={`w-full ${inputClass}`}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              className={inputClass}
            />
            <select
              value={sprintCourse}
              onChange={(e) => setSprintCourse(e.target.value)}
              className={inputClass}
            >
              <option value="">No course</option>
              {courses.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-text-secondary text-sm whitespace-nowrap">Hours/day</label>
            <input
              type="number"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(e.target.value)}
              min="0.5"
              max="8"
              step="0.5"
              className={`w-20 ${inputClass}`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-text-secondary text-sm">Topics to cover</label>
            {topics.map((t, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  placeholder={`Topic ${i + 1}`}
                  value={t}
                  onChange={(e) => {
                    const u = [...topics];
                    u[i] = e.target.value;
                    setTopics(u);
                  }}
                  className={`flex-1 ${inputClass}`}
                />
                {topics.length > 1 && (
                  <button
                    onClick={() => setTopics(topics.filter((_, j) => j !== i))}
                    className="text-text-muted hover:text-error text-lg cursor-pointer px-1"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setTopics([...topics, ""])}
              className="text-accent text-sm hover:underline cursor-pointer"
            >
              + Add topic
            </button>
          </div>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Creating Sprint..." : "Create Sprint Plan"}
          </button>
          {error && <p className="text-error text-sm">{error}</p>}
        </div>
      )}

      {/* Past Sprints */}
      {pastSprints.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Past Sprints</h3>
          <div className="space-y-2">
            {pastSprints.map((s) => (
              <div key={s.id} className="p-3 rounded-lg bg-bg-card border border-border">
                <p className="text-white text-sm font-medium">{s.plan.test_name}</p>
                <p className="text-text-muted text-xs mt-0.5">
                  {new Date(s.test_date).toLocaleDateString()} · {s.plan.days?.length || 0} days
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
