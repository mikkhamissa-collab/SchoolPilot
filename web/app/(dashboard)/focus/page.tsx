"use client";

import { createClient } from "@/lib/supabase-client";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Confetti from "@/components/Confetti";

interface Chunk {
  step: number;
  task: string;
  minutes: number;
  done_when: string;
}

interface SavedChunk {
  id: string;
  assignment: { title: string };
  chunks: Chunk[];
  checked: boolean[];
  created_at: string;
}

export default function FocusPage() {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [course, setCourse] = useState("");
  const [due, setDue] = useState("");
  const [context, setContext] = useState("");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [history, setHistory] = useState<SavedChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load history on mount
  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("chunks")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setHistory(data);
    };
    load();
  }, []);

  const handleSubmit = async () => {
    if (!title.trim()) { setError("Enter an assignment title"); return; }
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ chunks: Chunk[]; total_minutes: number }>("chunk", {
        assignment: {
          title: title.trim(),
          type: type.trim() || undefined,
          course: course.trim() || undefined,
          due: due.trim() || undefined,
        },
        context: context.trim() || undefined,
      });
      setChunks(result.chunks);
      const initialChecked = result.chunks.map(() => false);
      setChecked(initialChecked);

      // Save to DB
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("chunks")
          .insert({
            user_id: user.id,
            assignment: { title: title.trim(), type: type.trim(), course: course.trim(), due: due.trim() },
            chunks: result.chunks,
            checked: initialChecked,
          })
          .select("id")
          .single();
        if (data) setActiveId(data.id);
        // Refresh history
        const { data: hist } = await supabase
          .from("chunks")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);
        if (hist) setHistory(hist);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const toggleCheck = async (idx: number) => {
    const updated = [...checked];
    updated[idx] = !updated[idx];
    setChecked(updated);
    if (activeId) {
      const supabase = createClient();
      await supabase.from("chunks").update({ checked: updated }).eq("id", activeId);
    }
    // Trigger confetti when all chunks completed
    if (updated.every(Boolean) && chunks.length > 0) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 100);
    }
  };

  const loadSaved = (saved: SavedChunk) => {
    setChunks(saved.chunks);
    setChecked(saved.checked || saved.chunks.map(() => false));
    setActiveId(saved.id);
    setTitle(saved.assignment.title);
  };

  const doneCount = checked.filter(Boolean).length;
  const totalMins = chunks.reduce((sum, c) => sum + c.minutes, 0);
  const doneMins = chunks.reduce((sum, c, i) => sum + (checked[i] ? c.minutes : 0), 0);
  const progress = chunks.length > 0 ? Math.round((doneCount / chunks.length) * 100) : 0;

  return (
    <div className="max-w-2xl space-y-6">
      <Confetti trigger={showConfetti} />

      <h2 className="text-2xl font-bold text-white">Focus Mode 🎯</h2>
      <p className="text-text-secondary">That huge assignment? Let&apos;s break it into pieces you can actually start.</p>

      {/* Form */}
      <div className="p-5 rounded-xl bg-bg-card border border-border space-y-4">
        <input
          type="text"
          placeholder="What assignment is haunting you?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Type (optional)"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            placeholder="Course (optional)"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <input
          type="text"
          placeholder="Due (optional)"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <textarea
          placeholder="Extra context (optional)"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Chopping it up..." : "Make It Manageable"}
        </button>
        {error && <p className="text-error text-sm">{error}</p>}
      </div>

      {/* Results */}
      {chunks.length > 0 && (
        <div className="space-y-4">
          {/* Progress with celebration */}
          <div className={`p-4 rounded-xl border transition-all ${
            progress === 100
              ? "bg-gradient-to-r from-success/20 to-accent/20 border-success/30"
              : "bg-bg-card border-border"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-secondary">
                {doneCount}/{chunks.length} chunks · {doneMins}/{totalMins} min
              </span>
              <span className={`text-sm font-semibold ${progress === 100 ? "text-success" : "text-accent"}`}>
                {progress}%
              </span>
            </div>
            <div className="w-full h-2 bg-bg-dark rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${progress === 100 ? "bg-success" : "bg-accent"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {/* Celebration message */}
            {progress === 100 ? (
              <div className="mt-3 text-center">
                <span className="text-success font-medium">🎉 Assignment conquered! You did it.</span>
              </div>
            ) : progress >= 50 ? (
              <div className="mt-2 text-center text-text-muted text-xs">
                More than halfway! Keep pushing.
              </div>
            ) : doneCount > 0 ? (
              <div className="mt-2 text-center text-text-muted text-xs">
                Great start! One chunk at a time.
              </div>
            ) : null}
          </div>

          {/* Chunks */}
          {chunks.map((chunk, i) => (
            <div
              key={i}
              className={`p-4 rounded-xl bg-bg-card border border-border transition-opacity ${
                checked[i] ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="task-checkbox mt-1"
                  checked={checked[i] || false}
                  onChange={() => toggleCheck(i)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-medium ${checked[i] ? "line-through text-text-muted" : "text-white"}`}>
                      {chunk.task}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-medium whitespace-nowrap">
                      {chunk.minutes} min
                    </span>
                  </div>
                  <p className="text-text-secondary text-sm">{chunk.done_when}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Recent</h3>
          <div className="space-y-2">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => loadSaved(h)}
                className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                  activeId === h.id
                    ? "bg-accent/10 border-accent/30"
                    : "bg-bg-card border-border hover:border-accent/20"
                }`}
              >
                <p className="text-white text-sm font-medium truncate">{h.assignment.title}</p>
                <p className="text-text-muted text-xs mt-0.5">
                  {h.chunks.length} chunks · {new Date(h.created_at).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
