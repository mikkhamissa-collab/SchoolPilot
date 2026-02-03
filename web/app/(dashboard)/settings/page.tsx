"use client";

import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("courses")
        .select("id, name, policies")
        .eq("user_id", user.id)
        .order("name");
      if (data) setCourses(data);
      setLoading(false);
    };
    load();
  }, []);

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
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-text-secondary mt-1">Customize how SchoolPilot prioritizes your work.</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === "success" ? "bg-success/10 text-success" : "bg-error/10 text-error"
        }`}>
          {message.text}
        </div>
      )}

      {/* Class Importance Ranking */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">Class Importance</h3>
          <p className="text-text-muted text-sm">
            Rank your classes by personal importance. Higher importance classes will be prioritized in "Most Pressing" and study recommendations.
          </p>
        </div>

        {courses.length === 0 ? (
          <div className="p-6 rounded-xl bg-bg-card border border-border text-center">
            <p className="text-text-muted">
              No courses found. Sync your assignments from Teamie first.
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
                      <span className="text-text-muted text-xs">Saving...</span>
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

      {/* About */}
      <div className="p-5 rounded-xl bg-bg-card border border-border">
        <h3 className="text-sm font-semibold text-text-secondary mb-2">About SchoolPilot</h3>
        <p className="text-text-muted text-sm">
          SchoolPilot is your AI-powered executive function assistant. It helps you organize, prioritize, and tackle your schoolwork more effectively.
        </p>
        <div className="mt-4 flex items-center gap-4 text-xs text-text-muted">
          <a href="https://schoolpilot.co" className="hover:text-accent transition-colors">Website</a>
          <span>•</span>
          <span>v1.0.0</span>
        </div>
      </div>
    </div>
  );
}
