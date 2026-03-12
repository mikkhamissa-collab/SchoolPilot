"use client";

import { useState } from "react";
import { backendFetch } from "@/lib/api";

type StudyTool = "guide" | "flashcards" | "quiz" | "explain" | "summary";

interface Flashcard {
  front: string;
  back: string;
}

interface QuizQuestion {
  type: string;
  question: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string;
  difficulty: string;
}

export default function StudyPage() {
  const [course, setCourse] = useState("");
  const [topic, setTopic] = useState("");
  const [activeTool, setActiveTool] = useState<StudyTool | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [showAnswers, setShowAnswers] = useState(false);

  const tools: { key: StudyTool; label: string; icon: string }[] = [
    { key: "guide", label: "Study Guide", icon: "📖" },
    { key: "flashcards", label: "Flashcards", icon: "🗂️" },
    { key: "quiz", label: "Practice Quiz", icon: "📝" },
    { key: "explain", label: "Explain", icon: "💡" },
    { key: "summary", label: "Summary", icon: "📋" },
  ];

  async function generate(tool: StudyTool) {
    if (!course.trim() || !topic.trim()) {
      setError("Please enter both a course and topic");
      return;
    }
    setLoading(true);
    setError("");
    setActiveTool(tool);
    setResult(null);
    setFlippedCards(new Set());
    setSelectedAnswers({});
    setShowAnswers(false);

    try {
      const data = await backendFetch<Record<string, unknown>>(`/api/study/${tool}`, {
        method: "POST",
        body: JSON.stringify({ course, topic }),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  function toggleCard(index: number) {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Study Tools</h1>

      {/* Input Section */}
      <div className="bg-bg-card rounded-xl p-6 border border-border mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Course</label>
            <input
              type="text"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g., AP Biology"
              className="w-full bg-bg-dark border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Cell Division"
              className="w-full bg-bg-dark border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tools.map((t) => (
            <button
              key={t.key}
              onClick={() => generate(t.key)}
              disabled={loading}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTool === t.key
                  ? "bg-accent text-white"
                  : "bg-bg-hover text-text-secondary hover:text-text-primary"
              } disabled:opacity-50`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="bg-bg-card rounded-xl p-12 border border-border text-center">
          <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-text-secondary">Generating {activeTool}...</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && activeTool === "guide" && (
        <div className="bg-bg-card rounded-xl p-6 border border-border prose prose-invert max-w-none">
          <h2 className="text-lg font-bold text-text-primary mb-4">Study Guide</h2>
          <div className="text-text-secondary whitespace-pre-wrap">{(result as Record<string, string>).guide}</div>
        </div>
      )}

      {result && !loading && activeTool === "flashcards" && (
        <div>
          <h2 className="text-lg font-bold text-text-primary mb-4">Flashcards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {((result as Record<string, Flashcard[]>).cards || []).map((card, i) => (
              <button
                key={i}
                onClick={() => toggleCard(i)}
                className="bg-bg-card rounded-xl p-6 border border-border text-left transition-all hover:border-accent min-h-[120px]"
              >
                <p className="text-xs text-text-muted mb-2">
                  {flippedCards.has(i) ? "Answer" : "Question"} · Card {i + 1}
                </p>
                <p className="text-text-primary">
                  {flippedCards.has(i) ? card.back : card.front}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {result && !loading && activeTool === "quiz" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-text-primary">Practice Quiz</h2>
            <button
              onClick={() => setShowAnswers(!showAnswers)}
              className="px-4 py-2 bg-accent rounded-lg text-sm text-white"
            >
              {showAnswers ? "Hide Answers" : "Check Answers"}
            </button>
          </div>
          <div className="space-y-4">
            {((result as Record<string, QuizQuestion[]>).questions || []).map((q, i) => (
              <div key={i} className="bg-bg-card rounded-xl p-6 border border-border">
                <p className="text-xs text-text-muted mb-2">
                  {q.difficulty} · {q.type.replace("_", " ")}
                </p>
                <p className="text-text-primary font-medium mb-3">{i + 1}. {q.question}</p>
                {q.options && (
                  <div className="space-y-2">
                    {q.options.map((opt, j) => (
                      <button
                        key={j}
                        onClick={() => setSelectedAnswers((prev) => ({ ...prev, [i]: opt }))}
                        className={`w-full text-left px-4 py-2 rounded-lg border transition-colors ${
                          selectedAnswers[i] === opt
                            ? showAnswers
                              ? opt === q.correct_answer
                                ? "border-green-500 bg-green-500/10"
                                : "border-red-500 bg-red-500/10"
                              : "border-accent bg-accent/10"
                            : "border-border hover:border-bg-hover"
                        } text-text-secondary`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
                {showAnswers && (
                  <div className="mt-3 p-3 bg-bg-dark rounded-lg">
                    <p className="text-green-400 text-sm font-medium">Answer: {q.correct_answer}</p>
                    <p className="text-text-muted text-sm mt-1">{q.explanation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {result && !loading && activeTool === "explain" && (
        <div className="bg-bg-card rounded-xl p-6 border border-border">
          <h2 className="text-lg font-bold text-text-primary mb-4">Explanation</h2>
          <div className="text-text-secondary whitespace-pre-wrap">{(result as Record<string, string>).explanation}</div>
        </div>
      )}

      {result && !loading && activeTool === "summary" && (
        <div className="bg-bg-card rounded-xl p-6 border border-border">
          <h2 className="text-lg font-bold text-text-primary mb-4">Summary</h2>
          <div className="text-text-secondary whitespace-pre-wrap">{(result as Record<string, string>).summary}</div>
        </div>
      )}
    </div>
  );
}
