"use client";

import { createClient } from "@/lib/supabase-client";
import { useEffect, useState, useCallback, useRef } from "react";
import { posthog } from "@/lib/posthog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Category {
  name: string;
  weight: number;
}

interface Grade {
  id: string;
  category: string;
  name: string;
  score: number;
  max_score: number;
  created_at?: string;
}

interface Course {
  id: string;
  name: string;
  categories: Category[];
  policies: { marzano?: boolean; importance?: number } | null;
}

interface ClassContext {
  id?: string;
  course_name: string;
  course_id?: string;
  teacher_name?: string;
  grade_percentage?: number;
  grade_letter?: string;
  previous_grade_percentage?: number | null;
}

interface GradeResult {
  overall: number;
  letter: string;
  categories: Record<
    string,
    { average: number; weight: number; assignments: number }
  >;
}

interface RequiredResult {
  needed_on_next_assignment: number;
  achievable: boolean;
  needed_average_in_category: number;
  target_percentage: number;
  target_category: string;
}

interface WhatIfResult {
  overall: number;
  letter: string;
  categories: Record<string, { average: number | null; weight: number }>;
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const FETCH_TIMEOUT = 10_000;

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMarzanoLabel(score: number): { label: string; color: string } {
  const rounded = Math.round(score * 2) / 2;
  return (
    MARZANO_LABELS[rounded] ||
    MARZANO_LABELS[Math.floor(score)] || { label: "", color: "text-text-muted" }
  );
}

/** Fetch with auth token + AbortController timeout. */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      let msg = `API error ${res.status}`;
      try {
        const body = await res.json();
        if (typeof body.detail === "string") msg = body.detail;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

function letterGrade(pct: number): string {
  if (pct >= 93) return "A";
  if (pct >= 90) return "A-";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B-";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C-";
  if (pct >= 67) return "D+";
  if (pct >= 60) return "D";
  return "F";
}

function gradeColor(pct: number): string {
  if (pct >= 90) return "text-success";
  if (pct >= 80) return "text-accent";
  if (pct >= 70) return "text-warning";
  return "text-error";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`bg-bg-card rounded-lg animate-pulse ${className || ""}`}
    />
  );
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg flex items-center justify-between gap-3 animate-slide-up ${
            t.type === "success"
              ? "bg-success/15 text-success border border-success/30"
              : "bg-error/15 text-error border border-error/30"
          }`}
        >
          <span>{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="opacity-60 hover:opacity-100 cursor-pointer shrink-0"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}

function TrendArrow({
  current,
  previous,
}: {
  current: number | undefined;
  previous: number | null | undefined;
}) {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.1) return null;
  if (diff > 0) {
    return (
      <span className="text-success text-xs ml-1" title={`+${diff.toFixed(1)}%`}>
        ▲ +{diff.toFixed(1)}
      </span>
    );
  }
  return (
    <span className="text-error text-xs ml-1" title={`${diff.toFixed(1)}%`}>
      ▼ {diff.toFixed(1)}
    </span>
  );
}

function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
}: {
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
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-bg-dark text-text-secondary hover:text-white text-sm transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-error hover:bg-error/80 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function LogGradeModal({
  isOpen,
  courses,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  courses: Course[];
  onClose: () => void;
  onSubmit: (data: {
    courseId: string;
    category: string;
    name: string;
    score: number;
    maxScore: number;
  }) => void;
}) {
  const [courseId, setCourseId] = useState("");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [validationError, setValidationError] = useState("");

  const selectedCourse = courses.find((c) => c.id === courseId);

  useEffect(() => {
    if (isOpen && courses.length > 0 && !courseId) {
      setCourseId(courses[0].id);
    }
  }, [isOpen, courses, courseId]);

  useEffect(() => {
    if (selectedCourse && selectedCourse.categories.length > 0) {
      setCategory(selectedCourse.categories[0].name);
    }
  }, [selectedCourse]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    setValidationError("");
    if (!courseId) {
      setValidationError("Select a course");
      return;
    }
    if (!name.trim()) {
      setValidationError("Enter an assignment name");
      return;
    }
    const s = parseFloat(score);
    const m = parseFloat(maxScore);
    if (isNaN(s) || isNaN(m) || m <= 0) {
      setValidationError("Enter valid score and max points");
      return;
    }
    onSubmit({ courseId, category, name: name.trim(), score: s, maxScore: m });
    // Reset
    setName("");
    setScore("");
    setMaxScore("100");
    setValidationError("");
  };

  const inputClass =
    "px-3 py-2 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm w-full";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
        <h3 className="text-lg font-semibold text-white">Log a Grade</h3>

        <div>
          <label className="text-text-secondary text-xs mb-1 block">
            Course
          </label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className={inputClass}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {selectedCourse && selectedCourse.categories.length > 0 && (
          <div>
            <label className="text-text-secondary text-xs mb-1 block">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
            >
              {selectedCourse.categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-text-secondary text-xs mb-1 block">
            Assignment Name
          </label>
          <input
            type="text"
            placeholder="e.g. Chapter 5 Test"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-text-secondary text-xs mb-1 block">
              Score
            </label>
            <input
              type="number"
              placeholder="85"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-text-secondary text-xs mb-1 block">
              Total Points
            </label>
            <input
              type="number"
              placeholder="100"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {validationError && (
          <p className="text-error text-xs">{validationError}</p>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-bg-dark border border-border text-text-secondary text-sm cursor-pointer hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/80 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            Save Grade
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function GradesPage() {
  // Data state
  const [courses, setCourses] = useState<Course[]>([]);
  const [classContexts, setClassContexts] = useState<ClassContext[]>([]);
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [activeClass, setActiveClass] = useState<ClassContext | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [lmsGrades, setLmsGrades] = useState<Grade[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [calcLoading, setCalcLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);

  // Add course form
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCategories, setNewCategories] = useState<
    { name: string; weight: string }[]
  >([
    { name: "Tests", weight: "40" },
    { name: "Quizzes", weight: "25" },
    { name: "Homework", weight: "20" },
    { name: "Participation", weight: "15" },
  ]);

  // Log grade modal
  const [showLogGrade, setShowLogGrade] = useState(false);

  // What-if calculator (inline per active course)
  const [whatifScore, setWhatifScore] = useState("");
  const [whatifMax, setWhatifMax] = useState("100");
  const [whatifCat, setWhatifCat] = useState("");
  const [whatifResult, setWhatifResult] = useState<WhatIfResult | null>(null);

  // Required score calculator
  const [reqTarget, setReqTarget] = useState("90");
  const [reqCat, setReqCat] = useState("");
  const [reqResult, setReqResult] = useState<RequiredResult | null>(null);
  const [reqLoading, setReqLoading] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{
    courseId: string;
    courseName: string;
  } | null>(null);

  // -----------------------------------------------------------------------
  // Toast helpers
  // -----------------------------------------------------------------------

  const addToast = useCallback(
    (message: string, type: "success" | "error") => {
      const id = ++toastCounter.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // Load local courses from Supabase
      const { data: courseData } = await supabase
        .from("courses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at");

      if (courseData) setCourses(courseData);

      // Load class_context from backend (all LMS classes)
      try {
        const classes = await apiFetch<ClassContext[]>(
          "/api/profile/classes"
        );
        if (Array.isArray(classes)) setClassContexts(classes);
      } catch {
        // Non-fatal — we still have local courses
      }

      // Load LMS grades from backend
      try {
        const lms = await apiFetch<Grade[]>("/api/agent/grades");
        if (Array.isArray(lms)) setLmsGrades(lms);
      } catch {
        // Non-fatal
      }

      // Select first course if available
      if (courseData && courseData.length > 0) {
        loadCourse(courseData[0]);
      }

      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Course / grade management
  // -----------------------------------------------------------------------

  const loadCourse = async (course: Course) => {
    setActiveCourse(course);
    setActiveClass(null);
    setGradeResult(null);
    setWhatifResult(null);
    setReqResult(null);
    setWhatifCat(course.categories[0]?.name || "");
    setReqCat(course.categories[0]?.name || "");

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

  const selectClass = (cls: ClassContext) => {
    setActiveClass(cls);
    setActiveCourse(null);
    setGrades([]);
    setGradeResult(null);
    setWhatifResult(null);
    setReqResult(null);
  };

  const calculateGrades = useCallback(
    async (course: Course, gradeList: Grade[]) => {
      if (gradeList.length === 0) {
        setGradeResult(null);
        return;
      }
      setCalcLoading(true);
      try {
        const result = await apiFetch<GradeResult>("/api/grades/calculate", {
          method: "POST",
          body: JSON.stringify({
            categories: course.categories,
            grades: gradeList.map((g) => ({
              category: g.category,
              name: g.name,
              score: g.score,
              max: g.max_score,
            })),
            policies: course.policies || {},
          }),
        });
        setGradeResult(result);
      } catch {
        addToast("Failed to calculate grades", "error");
      } finally {
        setCalcLoading(false);
      }
    },
    [addToast]
  );

  const handleAddCourse = async () => {
    if (!newCourseName.trim() || !userId) return;
    const cats = newCategories
      .filter((c) => c.name.trim() && parseFloat(c.weight) > 0)
      .map((c) => ({
        name: c.name.trim(),
        weight: parseFloat(c.weight) / 100,
      }));
    const weightSum = cats.reduce((s, c) => s + c.weight, 0);
    if (Math.abs(weightSum - 1) > 0.02) {
      addToast("Category weights must sum to 100%", "error");
      return;
    }

    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("courses")
      .insert({
        user_id: userId,
        name: newCourseName.trim(),
        categories: cats,
        policies: {},
      })
      .select()
      .single();
    if (err) {
      addToast(err.message, "error");
      return;
    }
    if (data) {
      setCourses((prev) => [...prev, data]);
      loadCourse(data);
      setShowAddCourse(false);
      setNewCourseName("");
      addToast(`Added ${data.name}`, "success");
    }
  };

  const handleDeleteCourse = (courseId: string, courseName: string) => {
    setDeleteConfirm({ courseId, courseName });
  };

  const confirmDeleteCourse = async () => {
    if (!deleteConfirm || !userId) return;
    const { courseId, courseName } = deleteConfirm;
    setDeleteConfirm(null);
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("courses")
      .delete()
      .eq("id", courseId)
      .eq("user_id", userId);
    if (delErr) {
      addToast(delErr.message, "error");
      return;
    }
    const remaining = courses.filter((c) => c.id !== courseId);
    setCourses(remaining);
    if (activeCourse?.id === courseId) {
      if (remaining.length > 0) loadCourse(remaining[0]);
      else {
        setActiveCourse(null);
        setGrades([]);
        setGradeResult(null);
      }
    }
    addToast(`Deleted ${courseName}`, "success");
  };

  const handleLogGrade = async (data: {
    courseId: string;
    category: string;
    name: string;
    score: number;
    maxScore: number;
  }) => {
    // Try backend endpoint first
    try {
      await apiFetch("/api/grades/log", {
        method: "POST",
        body: JSON.stringify({
          course_id: data.courseId,
          category: data.category,
          name: data.name,
          score: data.score,
          max_score: data.maxScore,
        }),
      });
    } catch {
      // Fall back to direct Supabase insert
      const supabase = createClient();
      const { error: err } = await supabase.from("grades").insert({
        course_id: data.courseId,
        category: data.category,
        name: data.name,
        score: data.score,
        max_score: data.maxScore,
      });
      if (err) {
        addToast(err.message, "error");
        return;
      }
    }

    addToast("Grade logged", "success");
    setShowLogGrade(false);

    // Reload active course grades if the logged grade is for it
    if (activeCourse && activeCourse.id === data.courseId) {
      loadCourse(activeCourse);
    }
  };

  // -----------------------------------------------------------------------
  // Calculators
  // -----------------------------------------------------------------------

  const handleWhatif = async () => {
    if (!activeCourse || !whatifScore) return;
    posthog.capture("grade_calculator_used", { type: "whatif" });
    try {
      const result = await apiFetch<WhatIfResult>("/api/grades/what-if", {
        method: "POST",
        body: JSON.stringify({
          categories: activeCourse.categories,
          grades: grades.map((g) => ({
            category: g.category,
            name: g.name,
            score: g.score,
            max: g.max_score,
          })),
          policies: activeCourse.policies || {},
          hypothetical_category: whatifCat,
          hypothetical_score: parseFloat(whatifScore),
          hypothetical_max: parseFloat(whatifMax) || 100,
        }),
      });
      setWhatifResult(result);
    } catch {
      addToast("What-if calculation failed", "error");
    }
  };

  const handleRequired = async () => {
    if (!activeCourse) return;
    setReqLoading(true);
    try {
      const result = await apiFetch<RequiredResult>(
        "/api/grades/required-score",
        {
          method: "POST",
          body: JSON.stringify({
            categories: activeCourse.categories,
            grades: grades.map((g) => ({
              category: g.category,
              name: g.name,
              score: g.score,
              max: g.max_score,
            })),
            policies: activeCourse.policies || {},
            target_percentage: parseFloat(reqTarget),
            target_category: reqCat,
          }),
        }
      );
      setReqResult(result);
    } catch {
      addToast("Required score calculation failed", "error");
    } finally {
      setReqLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Merge courses + class contexts for display
  // -----------------------------------------------------------------------

  // Class contexts that don't match any local course (by name)
  const courseNames = new Set(courses.map((c) => c.name.toLowerCase()));
  const unmatchedClasses = classContexts.filter(
    (cls) => !courseNames.has(cls.course_name.toLowerCase())
  );

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const inputClass =
    "px-3 py-2 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm";
  const btnClass =
    "px-4 py-2 rounded-lg bg-accent hover:bg-accent/80 text-white text-sm font-medium transition-colors cursor-pointer";
  const btnSecondary =
    "px-4 py-2 rounded-lg bg-bg-dark border border-border text-text-secondary text-sm cursor-pointer hover:text-white transition-colors";

  // -----------------------------------------------------------------------
  // Loading skeleton
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 space-y-6 py-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-72" />
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const hasNoCourses = courses.length === 0 && classContexts.length === 0;

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto px-4 space-y-6 py-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Grade Tracker</h2>
          <p className="text-text-secondary text-sm mt-1">
            Know exactly where you stand. No surprises.
          </p>
        </div>
        {courses.length > 0 && (
          <button onClick={() => setShowLogGrade(true)} className={btnClass}>
            + Log Grade
          </button>
        )}
      </div>

      {/* ---- Course chips ---- */}
      <div className="flex flex-wrap gap-2">
        {courses.map((c) => {
          const cls = classContexts.find(
            (cc) =>
              cc.course_name.toLowerCase() === c.name.toLowerCase()
          );
          return (
            <div key={c.id} className="relative group">
              <button
                onClick={() => loadCourse(c)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeCourse?.id === c.id
                    ? "bg-accent text-white"
                    : "bg-bg-card border border-border text-text-secondary hover:text-white"
                }`}
              >
                {c.name}
                {cls?.grade_percentage != null && (
                  <>
                    <span className="opacity-60">
                      {cls.grade_percentage.toFixed(0)}%
                    </span>
                    <TrendArrow
                      current={cls.grade_percentage}
                      previous={cls.previous_grade_percentage}
                    />
                  </>
                )}
              </button>
              <button
                onClick={() => handleDeleteCourse(c.id, c.name)}
                aria-label={`Delete ${c.name}`}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-error text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                x
              </button>
            </div>
          );
        })}

        {/* LMS-only classes (no local course) */}
        {unmatchedClasses.map((cls) => (
          <button
            key={cls.course_name}
            onClick={() => selectClass(cls)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeClass?.course_name === cls.course_name
                ? "bg-accent/60 text-white"
                : "bg-bg-card border border-border text-text-secondary hover:text-white border-dashed"
            }`}
          >
            {cls.course_name}
            {cls.grade_percentage != null && (
              <>
                <span className="opacity-60">
                  {cls.grade_percentage.toFixed(0)}%
                </span>
                <TrendArrow
                  current={cls.grade_percentage}
                  previous={cls.previous_grade_percentage}
                />
              </>
            )}
          </button>
        ))}

        <button
          onClick={() => setShowAddCourse(!showAddCourse)}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-bg-card border border-dashed border-border text-text-muted hover:text-accent hover:border-accent/30 transition-colors cursor-pointer"
        >
          + Add Course
        </button>
      </div>

      {/* ---- Modals ---- */}
      <ConfirmModal
        isOpen={deleteConfirm !== null}
        title="Delete Course"
        message={`Delete "${deleteConfirm?.courseName}" and all its grades? This cannot be undone.`}
        onConfirm={confirmDeleteCourse}
        onCancel={() => setDeleteConfirm(null)}
      />

      <LogGradeModal
        isOpen={showLogGrade}
        courses={courses}
        onClose={() => setShowLogGrade(false)}
        onSubmit={handleLogGrade}
      />

      {/* ---- Empty state ---- */}
      {hasNoCourses && !showAddCourse && (
        <div className="p-8 rounded-xl bg-bg-card border border-border text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">
            No courses yet
          </h3>
          <p className="text-text-muted text-sm mb-4 max-w-xs mx-auto">
            Add your courses to start tracking grades, or sync your LMS to
            import them automatically.
          </p>
          <button
            onClick={() => setShowAddCourse(true)}
            className={btnClass}
          >
            + Add Your First Course
          </button>
        </div>
      )}

      {/* ---- Add course form ---- */}
      {showAddCourse && (
        <div className="p-5 rounded-xl bg-bg-card border border-border space-y-4">
          <h3 className="text-white font-semibold">New Course</h3>
          <input
            type="text"
            placeholder="Course name (e.g. AP Chemistry)"
            value={newCourseName}
            onChange={(e) => setNewCourseName(e.target.value)}
            className={`w-full ${inputClass}`}
          />
          <div className="space-y-2">
            <label className="text-text-secondary text-sm">
              Categories (must total 100%)
            </label>
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
                    onClick={() =>
                      setNewCategories(
                        newCategories.filter((_, j) => j !== i)
                      )
                    }
                    aria-label="Remove category"
                    className="text-text-muted hover:text-error text-lg cursor-pointer"
                  >
                    x
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() =>
                setNewCategories([
                  ...newCategories,
                  { name: "", weight: "0" },
                ])
              }
              className="text-accent text-sm hover:underline cursor-pointer"
            >
              + Add category
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddCourse} className={btnClass}>
              Save Course
            </button>
            <button
              onClick={() => setShowAddCourse(false)}
              className={btnSecondary}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ---- Course Overview Grid (all classes at a glance) ---- */}
      {classContexts.length > 0 && !activeCourse && !activeClass && (
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-3">
            All Classes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {classContexts.map((cls) => {
              const pct = cls.grade_percentage;
              const letter = cls.grade_letter || (pct != null ? letterGrade(pct) : null);
              return (
                <button
                  key={cls.course_name}
                  onClick={() => {
                    const matched = courses.find(
                      (c) =>
                        c.name.toLowerCase() ===
                        cls.course_name.toLowerCase()
                    );
                    if (matched) loadCourse(matched);
                    else selectClass(cls);
                  }}
                  className="p-4 rounded-xl bg-bg-card border border-border text-left hover:border-accent/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium text-sm truncate mr-2">
                      {cls.course_name}
                    </span>
                    {letter && (
                      <span
                        className={`text-lg font-bold ${
                          pct != null ? gradeColor(pct) : "text-text-muted"
                        }`}
                      >
                        {letter}
                      </span>
                    )}
                  </div>
                  {pct != null ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-bg-dark overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct >= 90
                              ? "bg-success"
                              : pct >= 80
                              ? "bg-accent"
                              : pct >= 70
                              ? "bg-warning"
                              : "bg-error"
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-text-secondary text-xs font-medium w-12 text-right">
                        {pct.toFixed(1)}%
                      </span>
                      <TrendArrow
                        current={pct}
                        previous={cls.previous_grade_percentage}
                      />
                    </div>
                  ) : (
                    <p className="text-text-muted text-xs">No grade data yet</p>
                  )}
                  {cls.teacher_name && (
                    <p className="text-text-muted text-xs mt-2">
                      {cls.teacher_name}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- LMS-only class detail (no local course) ---- */}
      {activeClass && !activeCourse && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-bg-card border border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold text-lg">
                {activeClass.course_name}
              </h3>
              {activeClass.grade_letter && (
                <span
                  className={`text-2xl font-bold ${
                    activeClass.grade_percentage != null
                      ? gradeColor(activeClass.grade_percentage)
                      : "text-text-muted"
                  }`}
                >
                  {activeClass.grade_letter}
                </span>
              )}
            </div>
            {activeClass.grade_percentage != null ? (
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-white">
                  {activeClass.grade_percentage.toFixed(1)}%
                </span>
                <TrendArrow
                  current={activeClass.grade_percentage}
                  previous={activeClass.previous_grade_percentage}
                />
              </div>
            ) : (
              <p className="text-text-muted text-sm">
                No grade percentage synced yet. Trigger an LMS sync to import
                grades.
              </p>
            )}
            {activeClass.teacher_name && (
              <p className="text-text-muted text-sm mt-2">
                Teacher: {activeClass.teacher_name}
              </p>
            )}
          </div>

          <div className="p-5 rounded-xl bg-bg-card border border-border text-center">
            <p className="text-text-secondary text-sm mb-3">
              This class was imported from your LMS. Add it as a local course
              to log grades and use calculators.
            </p>
            <button
              onClick={() => {
                setNewCourseName(activeClass.course_name);
                setShowAddCourse(true);
                setActiveClass(null);
              }}
              className={btnClass}
            >
              Set Up Grade Tracking
            </button>
          </div>
        </div>
      )}

      {/* ---- Active course detail ---- */}
      {activeCourse && (
        <>
          {/* Grade summary card */}
          {calcLoading ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : gradeResult ? (
            <div className="p-5 rounded-xl bg-bg-card border border-border">
              {activeCourse.policies?.marzano ? (
                <>
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-4xl font-bold text-white">
                      {(gradeResult.overall / 25).toFixed(1)}
                    </span>
                    <span className="text-lg text-text-muted">/ 4.0</span>
                  </div>
                  <div
                    className={`text-lg font-semibold mb-4 ${
                      getMarzanoLabel(gradeResult.overall / 25).color
                    }`}
                  >
                    {getMarzanoLabel(gradeResult.overall / 25).label}
                  </div>
                  <div className="space-y-2">
                    {Object.entries(gradeResult.categories).map(
                      ([name, data]) => {
                        const marzanoScore = data.average / 25;
                        const marzanoInfo = getMarzanoLabel(marzanoScore);
                        return (
                          <div
                            key={name}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-text-secondary">
                              {name}{" "}
                              <span className="text-text-muted">
                                ({(data.weight * 100).toFixed(0)}%)
                              </span>
                            </span>
                            <div className="text-right">
                              <span className="text-white font-medium">
                                {marzanoScore.toFixed(1)}
                              </span>
                              <span
                                className={`ml-2 text-xs ${marzanoInfo.color}`}
                              >
                                {marzanoInfo.label}
                              </span>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className="text-4xl font-bold text-white">
                      {gradeResult.overall.toFixed(1)}%
                    </span>
                    <span
                      className={`text-2xl font-semibold ${gradeColor(
                        gradeResult.overall
                      )}`}
                    >
                      {gradeResult.letter}
                    </span>
                    {(() => {
                      const cls = classContexts.find(
                        (cc) =>
                          cc.course_name.toLowerCase() ===
                          activeCourse.name.toLowerCase()
                      );
                      if (cls) {
                        return (
                          <TrendArrow
                            current={cls.grade_percentage}
                            previous={cls.previous_grade_percentage}
                          />
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="space-y-2 mt-4">
                    {Object.entries(gradeResult.categories).map(
                      ([name, data]) => (
                        <div
                          key={name}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-text-secondary">
                            {name}{" "}
                            <span className="text-text-muted">
                              ({(data.weight * 100).toFixed(0)}%)
                            </span>
                          </span>
                          <span className="text-white font-medium">
                            {data.average.toFixed(1)}%
                            <span className="text-text-muted ml-1">
                              ({data.assignments})
                            </span>
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-bg-card border border-border text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-accent/10 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </div>
              <p className="text-white font-medium mb-1">
                No grades logged yet
              </p>
              <p className="text-text-muted text-sm">
                Use the &ldquo;Log Grade&rdquo; button to add your first grade
                for {activeCourse.name}.
              </p>
            </div>
          )}

          {/* ---- What Do I Need? (Required Score) ---- */}
          {activeCourse.categories.length > 0 && grades.length > 0 && (
            <div className="p-5 rounded-xl bg-bg-card border border-border space-y-3">
              <h3 className="text-sm font-semibold text-white">
                What Do I Need?
              </h3>
              <p className="text-text-muted text-xs">
                Find out what score you need on your next assignment to hit
                your target grade.
              </p>
              <div className="flex gap-3 items-center flex-wrap">
                <span className="text-text-muted text-sm">I want</span>
                <input
                  type="number"
                  value={reqTarget}
                  onChange={(e) => setReqTarget(e.target.value)}
                  aria-label="Target grade percentage"
                  className={`w-20 ${inputClass}`}
                />
                <span className="text-text-muted text-sm">% in</span>
                <select
                  value={reqCat}
                  onChange={(e) => setReqCat(e.target.value)}
                  aria-label="Target category"
                  className={inputClass}
                >
                  {activeCourse.categories.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleRequired}
                  disabled={reqLoading}
                  className={`${btnClass} ${
                    reqLoading ? "opacity-50 cursor-wait" : ""
                  }`}
                >
                  {reqLoading ? "..." : "Calculate"}
                </button>
              </div>
              {reqResult && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    reqResult.achievable
                      ? "bg-success/10 text-success"
                      : "bg-error/10 text-error"
                  }`}
                >
                  {reqResult.achievable
                    ? `You need ${reqResult.needed_on_next_assignment.toFixed(
                        1
                      )}% on your next ${
                        reqResult.target_category
                      } assignment to reach ${
                        reqResult.target_percentage
                      }% overall.`
                    : `Reaching ${
                        reqResult.target_percentage
                      }% would require ${reqResult.needed_on_next_assignment.toFixed(
                        1
                      )}% on your next assignment, which may not be achievable.`}
                </div>
              )}
            </div>
          )}

          {/* ---- What If? ---- */}
          {activeCourse.categories.length > 0 && grades.length > 0 && (
            <div className="p-5 rounded-xl bg-bg-card border border-border space-y-3">
              <h3 className="text-sm font-semibold text-white">
                What If I Get...
              </h3>
              <p className="text-text-muted text-xs">
                See how a hypothetical grade would affect your overall average.
              </p>
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
                  aria-label="Hypothetical max score"
                  className={`w-20 ${inputClass}`}
                />
                <span className="text-text-muted text-sm">in</span>
                <select
                  value={whatifCat}
                  onChange={(e) => setWhatifCat(e.target.value)}
                  aria-label="Hypothetical category"
                  className={inputClass}
                >
                  {activeCourse.categories.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button onClick={handleWhatif} className={btnClass}>
                  Project
                </button>
              </div>
              {whatifResult && (
                <div className="p-3 rounded-lg bg-bg-dark text-sm">
                  <span className="text-white font-medium">
                    {whatifResult.overall?.toFixed(1)}%
                  </span>
                  <span className="text-text-muted">
                    {" "}
                    ({whatifResult.letter})
                  </span>
                  {gradeResult && (
                    <span
                      className={`ml-2 font-medium ${
                        whatifResult.overall - gradeResult.overall >= 0
                          ? "text-success"
                          : "text-error"
                      }`}
                    >
                      {whatifResult.overall - gradeResult.overall >= 0
                        ? "+"
                        : ""}
                      {(whatifResult.overall - gradeResult.overall).toFixed(1)}%
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---- Grade History ---- */}
          {grades.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text-secondary mb-3">
                Logged Grades
              </h3>
              <div className="space-y-1">
                {grades.map((g) => {
                  const pct = (g.score / g.max_score) * 100;
                  const isMarzano = activeCourse?.policies?.marzano;
                  const marzanoScore = isMarzano ? g.score : null;
                  const marzanoInfo =
                    marzanoScore !== null
                      ? getMarzanoLabel(marzanoScore)
                      : null;

                  return (
                    <div
                      key={g.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-bg-card border border-border text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-white truncate block">
                          {g.name}
                        </span>
                        <span className="text-text-muted text-xs">
                          {g.category}
                        </span>
                      </div>
                      {isMarzano ? (
                        <div className="text-right shrink-0 ml-3">
                          <span className="text-white font-medium">
                            {g.score.toFixed(1)}
                          </span>
                          <span className="text-text-muted">/4</span>
                          {marzanoInfo && (
                            <span
                              className={`ml-2 text-xs ${marzanoInfo.color}`}
                            >
                              {marzanoInfo.label}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-white font-medium shrink-0 ml-3">
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

      {/* Slide-up animation for toasts */}
      <style jsx global>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
