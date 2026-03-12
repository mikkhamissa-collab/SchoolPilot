"use client";

import { createClient } from "@/lib/supabase-client";
import { backendFetch } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";

interface Category { name: string; weight: number; }
interface Grade { id: string; category: string; name: string; score: number; max_score: number; }
interface Course { id: string; name: string; categories: Category[]; policies: { marzano?: boolean; importance?: number } | null; }
interface GradeResult { overall: number; letter: string; categories: Record<string, { average: number; weight: number; assignments: number }>; }

// Marzano grading scale labels
const MARZANO_LABELS: Record<number, { label: string; color: string }> = {
  4: { label: "Exceeding", color: "text-success" },
  3.5: { label: "Mastering", color: "text-accent" },
  3: { label: "Meeting", color: "text-accent" },
  2.5: { label: "Approaching", color: "text-warning" },
  2: { label: "Developing", color: "text-warning" },
  1.5: { label: "Beginning", color: "text-error" },
  1: { label: "Beginning", color: "text-error" },
  0: { label: "Not Yet", color: "text-error" },
};

function getMarzanoLabel(score: number): { label: string; color: string } {
  // Round to nearest 0.5
  const rounded = Math.round(score * 2) / 2;
  return MARZANO_LABELS[rounded] || MARZANO_LABELS[Math.floor(score)] || { label: "", color: "text-text-muted" };
}

function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }: {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-text-secondary text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-bg-hover text-text-secondary hover:text-white text-sm transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-error hover:bg-error/80 text-white text-sm font-medium transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GradesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Add course form
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCategories, setNewCategories] = useState<{ name: string; weight: string }[]>([
    { name: "Tests", weight: "40" },
    { name: "Quizzes", weight: "25" },
    { name: "Homework", weight: "20" },
    { name: "Participation", weight: "15" },
  ]);

  // Add grade form
  const [gradeCategory, setGradeCategory] = useState("");
  const [gradeName, setGradeName] = useState("");
  const [gradeScore, setGradeScore] = useState("");
  const [gradeMax, setGradeMax] = useState("100");

  // What-if
  const [whatifScore, setWhatifScore] = useState("");
  const [whatifMax, setWhatifMax] = useState("100");
  const [whatifCat, setWhatifCat] = useState("");
  const [whatifResult, setWhatifResult] = useState<{ overall: number; letter: string; categories: Record<string, { average: number | null; weight: number }> } | null>(null);

  // Required
  const [reqTarget, setReqTarget] = useState("90");
  const [reqCat, setReqCat] = useState("");
  const [reqResult, setReqResult] = useState<{ needed_on_next_assignment: number; achievable: boolean; needed_average_in_category: number; target_percentage: number; target_category: string } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{ courseId: string; courseName: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from("courses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at");
      if (data) {
        setCourses(data);
        if (data.length > 0) loadCourse(data[0]);
      }
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCourse = async (course: Course) => {
    setActiveCourse(course);
    setGradeCategory(course.categories[0]?.name || "");
    setWhatifCat(course.categories[0]?.name || "");
    setReqCat(course.categories[0]?.name || "");
    setGradeResult(null);
    setWhatifResult(null);
    setReqResult(null);

    const supabase = createClient();
    const { data } = await supabase
      .from("grades")
      .select("*")
      .eq("course_id", course.id)
      .order("created_at");
    if (data) {
      setGrades(data);
      if (data.length > 0) calculateGrades(course, data);
    } else {
      setGrades([]);
    }
  };

  const calculateGrades = useCallback(async (course: Course, gradeList: Grade[]) => {
    if (gradeList.length === 0) { setGradeResult(null); return; }
    try {
      const result = await backendFetch<GradeResult>("/api/grades/calculate", {
        method: "POST",
        body: JSON.stringify({
          categories: course.categories,
          grades: gradeList.map(g => ({ category: g.category, name: g.name, score: g.score, max: g.max_score })),
          policies: course.policies || {},
        }),
      });
      setGradeResult(result);
    } catch (err) {
      console.error("Grade calculation failed:", err);
      setError("Failed to calculate grades. Try again.");
    }
  }, []);

  const handleAddCourse = async () => {
    if (!newCourseName.trim() || !userId) return;
    const cats = newCategories
      .filter(c => c.name.trim() && parseFloat(c.weight) > 0)
      .map(c => ({ name: c.name.trim(), weight: parseFloat(c.weight) / 100 }));
    const weightSum = cats.reduce((s, c) => s + c.weight, 0);
    if (Math.abs(weightSum - 1) > 0.02) { setError("Weights must sum to 100%"); return; }

    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("courses")
      .insert({ user_id: userId, name: newCourseName.trim(), categories: cats, policies: {} })
      .select()
      .single();
    if (err) { setError(err.message); return; }
    if (data) {
      setCourses([...courses, data]);
      loadCourse(data);
      setShowAddCourse(false);
      setNewCourseName("");
      setError("");
    }
  };

  const handleDeleteCourse = (courseId: string, courseName: string) => {
    setDeleteConfirm({ courseId, courseName });
  };

  const confirmDeleteCourse = async () => {
    if (!deleteConfirm || !userId) return;
    const { courseId } = deleteConfirm;
    setDeleteConfirm(null);
    const supabase = createClient();
    const { error: delErr } = await supabase.from("courses").delete().eq("id", courseId).eq("user_id", userId);
    if (delErr) { setError(delErr.message); return; }
    const remaining = courses.filter(c => c.id !== courseId);
    setCourses(remaining);
    if (activeCourse?.id === courseId) {
      if (remaining.length > 0) loadCourse(remaining[0]);
      else { setActiveCourse(null); setGrades([]); setGradeResult(null); }
    }
  };

  const handleAddGrade = async () => {
    if (!activeCourse || !gradeName.trim() || !gradeScore) return;
    const parsedScore = parseFloat(gradeScore);
    const parsedMax = parseFloat(gradeMax) || 100;
    if (isNaN(parsedScore) || isNaN(parsedMax) || parsedMax <= 0) {
      setError("Please enter valid numeric scores.");
      return;
    }
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("grades")
      .insert({
        course_id: activeCourse.id,
        category: gradeCategory,
        name: gradeName.trim(),
        score: parsedScore,
        max_score: parsedMax,
      })
      .select()
      .single();
    if (err) { setError(err.message); return; }
    if (data) {
      const updated = [...grades, data];
      setGrades(updated);
      calculateGrades(activeCourse, updated);
      setGradeName("");
      setGradeScore("");
      setGradeMax("100");
    }
  };

  const handleWhatif = async () => {
    if (!activeCourse || !whatifScore) return;
    try {
      const result = await backendFetch<{ overall: number; letter: string; categories: Record<string, { average: number | null; weight: number }> }>("/api/grades/what-if", {
        method: "POST",
        body: JSON.stringify({
          categories: activeCourse.categories,
          grades: grades.map(g => ({ category: g.category, name: g.name, score: g.score, max: g.max_score })),
          policies: activeCourse.policies || {},
          hypothetical_category: whatifCat,
          hypothetical_score: parseFloat(whatifScore),
          hypothetical_max: parseFloat(whatifMax) || 100,
        }),
      });
      setWhatifResult(result);
    } catch (err) {
      console.error("What-if calculation failed:", err);
      setError("What-if calculation failed. Try again.");
    }
  };

  const handleRequired = async () => {
    if (!activeCourse) return;
    try {
      const result = await backendFetch<{ needed_on_next_assignment: number; achievable: boolean; needed_average_in_category: number; target_percentage: number; target_category: string }>("/api/grades/required-score", {
        method: "POST",
        body: JSON.stringify({
          categories: activeCourse.categories,
          grades: grades.map(g => ({ category: g.category, name: g.name, score: g.score, max: g.max_score })),
          policies: activeCourse.policies || {},
          target_percentage: parseFloat(reqTarget),
          target_category: reqCat,
        }),
      });
      setReqResult(result);
    } catch (err) {
      console.error("Required score calculation failed:", err);
      setError("Required score calculation failed. Try again.");
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="h-8 w-32 bg-bg-card rounded animate-pulse" />
        <div className="h-48 bg-bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  const inputClass = "px-3 py-2 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm";
  const btnClass = "px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors cursor-pointer";

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-white">Grade Tracker 📊</h2>
      <p className="text-text-secondary">Know exactly where you stand. No surprises.</p>

      {/* Course chips */}
      <div className="flex flex-wrap gap-2">
        {courses.map((c) => (
          <div key={c.id} className="relative group">
            <button
              onClick={() => loadCourse(c)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeCourse?.id === c.id
                  ? "bg-accent text-white"
                  : "bg-bg-card border border-border text-text-secondary hover:text-white"
              }`}
            >
              {c.name}
            </button>
            <button
              onClick={() => handleDeleteCourse(c.id, c.name)}
              aria-label={`Delete ${c.name}`}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-error text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => setShowAddCourse(!showAddCourse)}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-bg-card border border-dashed border-border text-text-muted hover:text-accent hover:border-accent/30 transition-colors cursor-pointer"
        >
          + Add Course
        </button>
      </div>

      <ConfirmModal
        isOpen={deleteConfirm !== null}
        title="Delete Course"
        message={`Delete "${deleteConfirm?.courseName}" and all its grades? This cannot be undone.`}
        onConfirm={confirmDeleteCourse}
        onCancel={() => setDeleteConfirm(null)}
      />

      {error && <p className="text-error text-sm">{error}</p>}

      {/* Add course form */}
      {showAddCourse && (
        <div className="p-5 rounded-xl bg-bg-card border border-border space-y-4">
          <input
            type="text"
            placeholder="Course name"
            value={newCourseName}
            onChange={(e) => setNewCourseName(e.target.value)}
            className={`w-full ${inputClass}`}
          />
          <div className="space-y-2">
            <label className="text-text-secondary text-sm">Categories (must total 100%)</label>
            {newCategories.map((cat, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Category name"
                  value={cat.name}
                  onChange={(e) => {
                    const u = [...newCategories];
                    u[i].name = e.target.value;
                    setNewCategories(u);
                  }}
                  className={`flex-1 ${inputClass}`}
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={cat.weight}
                    onChange={(e) => {
                      const u = [...newCategories];
                      u[i].weight = e.target.value;
                      setNewCategories(u);
                    }}
                    className={`w-20 ${inputClass}`}
                  />
                  <span className="text-text-muted text-sm">%</span>
                </div>
                {newCategories.length > 1 && (
                  <button
                    onClick={() => setNewCategories(newCategories.filter((_, j) => j !== i))}
                    aria-label="Remove category"
                    className="text-text-muted hover:text-error text-lg cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setNewCategories([...newCategories, { name: "", weight: "0" }])}
              className="text-accent text-sm hover:underline cursor-pointer"
            >
              + Add category
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddCourse} className={btnClass}>Save Course</button>
            <button
              onClick={() => setShowAddCourse(false)}
              className="px-4 py-2 rounded-lg bg-bg-dark border border-border text-text-secondary text-sm cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Grade display */}
      {activeCourse && (
        <>
          {gradeResult ? (
            <div className="p-5 rounded-xl bg-bg-card border border-border">
              {activeCourse.policies?.marzano ? (
                // Marzano display (0-4 scale)
                <>
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-4xl font-bold text-white">
                      {(gradeResult.overall / 25).toFixed(1)}
                    </span>
                    <span className="text-lg text-text-muted">/ 4.0</span>
                  </div>
                  <div className={`text-lg font-semibold mb-4 ${getMarzanoLabel(gradeResult.overall / 25).color}`}>
                    {getMarzanoLabel(gradeResult.overall / 25).label}
                  </div>
                  <div className="space-y-2">
                    {Object.entries(gradeResult.categories).map(([name, data]) => {
                      const marzanoScore = data.average / 25;
                      const marzanoInfo = getMarzanoLabel(marzanoScore);
                      return (
                        <div key={name} className="flex items-center justify-between text-sm">
                          <span className="text-text-secondary">
                            {name} <span className="text-text-muted">({(data.weight * 100).toFixed(0)}%)</span>
                          </span>
                          <div className="text-right">
                            <span className="text-white font-medium">{marzanoScore.toFixed(1)}</span>
                            <span className={`ml-2 text-xs ${marzanoInfo.color}`}>{marzanoInfo.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                // Standard percentage display
                <>
                  <div className="flex items-baseline gap-3 mb-4">
                    <span className="text-4xl font-bold text-white">{gradeResult.overall.toFixed(1)}%</span>
                    <span className="text-2xl font-semibold text-accent">{gradeResult.letter}</span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(gradeResult.categories).map(([name, data]) => (
                      <div key={name} className="flex items-center justify-between text-sm">
                        <span className="text-text-secondary">
                          {name} <span className="text-text-muted">({(data.weight * 100).toFixed(0)}%)</span>
                        </span>
                        <span className="text-white font-medium">
                          {data.average.toFixed(1)}%
                          <span className="text-text-muted ml-1">({data.assignments})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-bg-card border border-border text-center">
              <div className="text-3xl mb-3">📝</div>
              <p className="text-white font-medium mb-1">No grades logged yet</p>
              <p className="text-text-muted text-sm">Add your first grade below and watch your average come to life.</p>
            </div>
          )}

          {/* Log a grade */}
          <div className="p-5 rounded-xl bg-bg-card border border-border space-y-3">
            <h3 className="text-sm font-semibold text-text-secondary">📥 Log a Grade</h3>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={gradeCategory}
                onChange={(e) => setGradeCategory(e.target.value)}
                aria-label="Grade category"
                className={inputClass}
              >
                {activeCourse.categories.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Assignment name"
                value={gradeName}
                onChange={(e) => setGradeName(e.target.value)}
                aria-label="Assignment name"
                className={inputClass}
              />
            </div>
            <div className="flex gap-3 items-center">
              <input
                type="number"
                placeholder="Score"
                value={gradeScore}
                onChange={(e) => setGradeScore(e.target.value)}
                aria-label="Score"
                className={`w-24 ${inputClass}`}
              />
              <span className="text-text-muted">/</span>
              <input
                type="number"
                placeholder="Max"
                value={gradeMax}
                onChange={(e) => setGradeMax(e.target.value)}
                aria-label="Maximum score"
                className={`w-24 ${inputClass}`}
              />
              <button onClick={handleAddGrade} className={btnClass}>Add</button>
            </div>
          </div>

          {/* What Do I Need? */}
          <div className="p-5 rounded-xl bg-bg-card border border-border space-y-3">
            <h3 className="text-sm font-semibold text-text-secondary">🎯 What Do I Need?</h3>
            <p className="text-text-muted text-xs">Find out what score you need on your next assignment to hit your target.</p>
            <div className="flex gap-3 items-center flex-wrap">
              <span className="text-text-muted text-sm">Target</span>
              <input
                type="number"
                value={reqTarget}
                onChange={(e) => setReqTarget(e.target.value)}
                aria-label="Target grade percentage"
                className={`w-20 ${inputClass}`}
              />
              <span className="text-text-muted text-sm">% in</span>
              <select value={reqCat} onChange={(e) => setReqCat(e.target.value)} aria-label="Target category" className={inputClass}>
                {activeCourse.categories.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              <button onClick={handleRequired} className={btnClass}>Calculate</button>
            </div>
            {reqResult && (
              <div className={`p-3 rounded-lg text-sm ${reqResult.achievable ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>
                {reqResult.achievable
                  ? `You need ${reqResult.needed_on_next_assignment.toFixed(1)}% on your next ${reqResult.target_category} assignment to reach ${reqResult.target_percentage}% overall.`
                  : `Reaching ${reqResult.target_percentage}% would require ${reqResult.needed_on_next_assignment.toFixed(1)}% on your next assignment, which may not be achievable.`}
              </div>
            )}
          </div>

          {/* What If? */}
          <div className="p-5 rounded-xl bg-bg-card border border-border space-y-3">
            <h3 className="text-sm font-semibold text-text-secondary">🔮 What If I Get...</h3>
            <p className="text-text-muted text-xs">See how a hypothetical grade would affect your overall average.</p>
            <div className="flex gap-3 items-center flex-wrap">
              <input
                type="number"
                placeholder="Score"
                value={whatifScore}
                onChange={(e) => setWhatifScore(e.target.value)}
                aria-label="Hypothetical score"
                className={`w-20 ${inputClass}`}
              />
              <span className="text-text-muted">/</span>
              <input
                type="number"
                placeholder="Max"
                value={whatifMax}
                onChange={(e) => setWhatifMax(e.target.value)}
                aria-label="Hypothetical maximum score"
                className={`w-20 ${inputClass}`}
              />
              <span className="text-text-muted text-sm">in</span>
              <select value={whatifCat} onChange={(e) => setWhatifCat(e.target.value)} aria-label="Hypothetical category" className={inputClass}>
                {activeCourse.categories.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              <button onClick={handleWhatif} className={btnClass}>Project</button>
            </div>
            {whatifResult && (
              <div className="p-3 rounded-lg bg-bg-dark text-sm">
                <span className="text-white font-medium">{whatifResult.overall?.toFixed(1)}%</span>
                <span className="text-text-muted"> ({whatifResult.letter})</span>
                {gradeResult && (
                  <span className={`ml-2 font-medium ${whatifResult.overall - gradeResult.overall >= 0 ? "text-success" : "text-error"}`}>
                    {whatifResult.overall - gradeResult.overall >= 0 ? "+" : ""}{(whatifResult.overall - gradeResult.overall).toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Grade History */}
          {grades.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text-secondary mb-3">Logged Grades</h3>
              <div className="space-y-1">
                {grades.map((g) => {
                  const pct = (g.score / g.max_score) * 100;
                  const isMarzano = activeCourse?.policies?.marzano;
                  const marzanoScore = isMarzano ? g.score : null;
                  const marzanoInfo = marzanoScore !== null ? getMarzanoLabel(marzanoScore) : null;

                  return (
                    <div key={g.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-card border border-border text-sm">
                      <div>
                        <span className="text-white">{g.name}</span>
                        <span className="text-text-muted ml-2">{g.category}</span>
                      </div>
                      {isMarzano ? (
                        <div className="text-right">
                          <span className="text-white font-medium">{g.score.toFixed(1)}</span>
                          <span className="text-text-muted">/4</span>
                          {marzanoInfo && (
                            <span className={`ml-2 text-xs ${marzanoInfo.color}`}>{marzanoInfo.label}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-white font-medium">
                          {g.score}/{g.max_score}
                          <span className="text-text-muted ml-1">
                            ({pct.toFixed(0)}%)
                          </span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
