"use client";

import { createClient } from "@/lib/supabase-client";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

interface Concept { concept: string; source: string; }
interface Topic { topic: string; reason: string; sources: string[]; }
interface Question { question: string; hint: string; }
interface StudyGuide {
  id: string;
  unit: string | null;
  guide: {
    unit: string;
    summary: string;
    key_concepts: Concept[];
    high_likelihood_topics: Topic[];
    practice_questions: Question[];
  };
  created_at: string;
  course_id: string | null;
}
interface Course { id: string; name: string; categories: Array<{ name: string }>; }

export default function StudyPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [guide, setGuide] = useState<StudyGuide | null>(null);
  const [history, setHistory] = useState<StudyGuide[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [expandedHints, setExpandedHints] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [coursesRes, guidesRes] = await Promise.all([
        supabase.from("courses").select("id, name, categories").eq("user_id", user.id),
        supabase.from("study_guides").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      ]);
      if (coursesRes.data) {
        setCourses(coursesRes.data);
        if (coursesRes.data.length > 0) setSelectedCourse(coursesRes.data[0].name);
      }
      if (guidesRes.data) setHistory(guidesRes.data);
      setPageLoading(false);
    };
    load();
  }, []);

  const handleGenerate = async () => {
    if (!selectedCourse) { setError("Select a course first"); return; }
    setLoading(true);
    setError("");
    try {
      const course = courses.find(c => c.name === selectedCourse);
      const result = await apiFetch<StudyGuide["guide"]>("study-guide", {
        course: selectedCourse,
        unit: unit.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      // Save to DB
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("study_guides")
          .insert({
            user_id: user.id,
            course_id: course?.id || null,
            unit: unit.trim() || null,
            guide: result,
          })
          .select()
          .single();
        if (data) {
          setGuide(data);
          setHistory([data, ...history.slice(0, 9)]);
        }
      }
      setExpandedHints(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const toggleHint = (i: number) => {
    const s = new Set(expandedHints);
    if (s.has(i)) s.delete(i); else s.add(i);
    setExpandedHints(s);
  };

  if (pageLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="h-8 w-32 bg-bg-card rounded animate-pulse" />
        <div className="h-48 bg-bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="max-w-2xl space-y-6">
        <h2 className="text-2xl font-bold text-white">Study Guides</h2>
        <div className="p-8 rounded-xl bg-bg-card border border-border text-center">
          <p className="text-text-muted">Add a course in the <a href="/grades" className="text-accent hover:underline">Grades</a> tab first, then come back to generate study guides.</p>
        </div>
      </div>
    );
  }

  const g = guide?.guide;
  const inputClass = "px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm";

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-white">Study Guides</h2>

      {/* Form */}
      <div className="p-5 rounded-xl bg-bg-card border border-border space-y-4">
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          className={`w-full ${inputClass}`}
        >
          {courses.map(c => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Unit / Topic (optional)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className={`w-full ${inputClass}`}
        />
        <textarea
          placeholder="Extra notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={`w-full ${inputClass} resize-none`}
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Generating..." : "Generate Guide"}
        </button>
        {error && <p className="text-error text-sm">{error}</p>}
      </div>

      {/* Guide display */}
      {g && (
        <div className="space-y-5">
          <div className="p-5 rounded-xl bg-bg-card border border-border">
            <h3 className="text-lg font-bold text-white mb-2">{g.unit}</h3>
            <p className="text-text-secondary text-sm leading-relaxed">{g.summary}</p>
          </div>

          {/* Key Concepts */}
          {g.key_concepts?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-text-secondary mb-3">Key Concepts</h4>
              <div className="grid gap-2">
                {g.key_concepts.map((c, i) => (
                  <div key={i} className="p-3 rounded-lg bg-bg-card border border-border">
                    <span className="text-white font-medium">{c.concept}</span>
                    {c.source && <span className="text-text-muted text-sm ml-2">({c.source})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* High-Likelihood Topics */}
          {g.high_likelihood_topics?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-text-secondary mb-3">High-Likelihood Topics</h4>
              <div className="grid gap-2">
                {g.high_likelihood_topics.map((t, i) => (
                  <div key={i} className="p-3 rounded-lg bg-bg-card border border-accent/20">
                    <p className="text-accent font-medium">{t.topic}</p>
                    <p className="text-text-secondary text-sm mt-1">{t.reason}</p>
                    {t.sources?.length > 0 && (
                      <p className="text-text-muted text-xs mt-1">Sources: {t.sources.join(", ")}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Practice Questions */}
          {g.practice_questions?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-text-secondary mb-3">Practice Questions</h4>
              <div className="grid gap-2">
                {g.practice_questions.map((q, i) => (
                  <div key={i} className="p-3 rounded-lg bg-bg-card border border-border">
                    <p className="text-white text-sm">{q.question}</p>
                    <button
                      onClick={() => toggleHint(i)}
                      className="text-accent text-xs mt-2 hover:underline cursor-pointer"
                    >
                      {expandedHints.has(i) ? "Hide hint" : "Show hint"}
                    </button>
                    {expandedHints.has(i) && (
                      <p className="text-text-muted text-sm mt-1">{q.hint}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Past Guides</h3>
          <div className="space-y-2">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => { setGuide(h); setExpandedHints(new Set()); }}
                className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                  guide?.id === h.id ? "bg-accent/10 border-accent/30" : "bg-bg-card border-border hover:border-accent/20"
                }`}
              >
                <p className="text-white text-sm font-medium truncate">{h.guide.unit || "General"}</p>
                <p className="text-text-muted text-xs mt-0.5">{new Date(h.created_at).toLocaleDateString()}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
