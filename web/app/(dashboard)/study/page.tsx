"use client";

import { createClient } from "@/lib/supabase-client";
import { useState, useEffect, useRef, useCallback } from "react";
import { posthog } from "@/lib/posthog";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StudyTool = "guide" | "flashcards" | "quiz" | "explain" | "summary";

interface CourseInfo {
  class_name: string;
  teacher_name: string | null;
  period: string | null;
}

interface Flashcard {
  front: string;
  back: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

interface StudyResult {
  content?: string;
  flashcards?: Flashcard[];
  questions?: QuizQuestion[];
}

interface SavedContent {
  tool: StudyTool;
  course: string;
  topic: string;
  result: StudyResult;
  savedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOOLS: { key: StudyTool; label: string; icon: string; description: string }[] = [
  { key: "guide", label: "Study Guide", icon: "📖", description: "Comprehensive study guide" },
  { key: "flashcards", label: "Flashcards", icon: "🗂️", description: "Flip-card review" },
  { key: "quiz", label: "Practice Quiz", icon: "📝", description: "Multiple choice quiz" },
  { key: "explain", label: "Explain", icon: "💡", description: "Concept breakdown" },
  { key: "summary", label: "Summary", icon: "📋", description: "One-page summary" },
];

const LOADING_MESSAGES: Record<StudyTool, string> = {
  guide: "Generating your study guide...",
  flashcards: "Creating flashcards...",
  quiz: "Building your practice quiz...",
  explain: "Preparing explanation...",
  summary: "Writing summary...",
};

const STORAGE_KEY = "schoolpilot_study_saved";

function loadSaved(): SavedContent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedContent[]) : [];
  } catch {
    return [];
  }
}

function saveToDisk(items: SavedContent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage full or unavailable
  }
}

async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const expiresAt = session.expires_at ?? 0;
      const now = Math.floor(Date.now() / 1000);
      if (expiresAt - now > 60) return session.access_token;
    }
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    return refreshed?.access_token ?? null;
  } catch {
    return null;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not signed in. Please log in and try again.");

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    if (res.status >= 500) throw new Error("Something went wrong on our end. Please try again.");
    let message = `Error: ${res.status}`;
    try {
      const err = await res.json();
      if (typeof err.detail === "string") message = err.detail;
      else if (typeof err.error === "string") message = err.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function SkeletonBlock({ lines, message }: { lines: number; message: string }) {
  return (
    <div className="bg-bg-card rounded-xl p-6 border border-border">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-text-secondary text-sm">{message}</p>
      </div>
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-4 bg-bg-dark rounded animate-pulse"
            style={{ width: `${70 + Math.random() * 30}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function FlashcardSkeleton({ message }: { message: string }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-text-secondary text-sm">{message}</p>
      </div>
      <div className="bg-bg-card rounded-xl p-10 border border-border flex items-center justify-center min-h-[220px]">
        <div className="space-y-3 w-full max-w-md">
          <div className="h-5 bg-bg-dark rounded animate-pulse w-3/4 mx-auto" />
          <div className="h-5 bg-bg-dark rounded animate-pulse w-1/2 mx-auto" />
        </div>
      </div>
    </div>
  );
}

function QuizSkeleton({ message }: { message: string }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-text-secondary text-sm">{message}</p>
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="bg-bg-card rounded-xl p-6 border border-border">
            <div className="h-5 bg-bg-dark rounded animate-pulse w-5/6 mb-4" />
            <div className="space-y-2">
              {[1, 2, 3, 4].map((o) => (
                <div key={o} className="h-10 bg-bg-dark rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flashcard viewer component
// ---------------------------------------------------------------------------

function FlashcardViewer({
  cards,
  onDone,
}: {
  cards: Flashcard[];
  onDone: (results: { right: number; wrong: number }) => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [rights, setRights] = useState(0);
  const [wrongs, setWrongs] = useState(0);
  const [finished, setFinished] = useState(false);

  const card = cards[index];
  const total = cards.length;

  function markAndNext(correct: boolean) {
    if (correct) setRights((r) => r + 1);
    else setWrongs((w) => w + 1);

    if (index + 1 >= total) {
      const finalRight = correct ? rights + 1 : rights;
      const finalWrong = correct ? wrongs : wrongs + 1;
      setFinished(true);
      onDone({ right: finalRight, wrong: finalWrong });
    } else {
      setFlipped(false);
      setIndex((i) => i + 1);
    }
  }

  if (finished) {
    const finalRight = rights;
    const finalWrong = wrongs;
    return (
      <div className="bg-bg-card rounded-xl p-8 border border-border text-center">
        <h3 className="text-xl font-bold text-white mb-4">Session Complete</h3>
        <div className="flex justify-center gap-8 mb-6">
          <div>
            <p className="text-3xl font-bold text-success">{finalRight}</p>
            <p className="text-text-muted text-sm">Got it</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-error">{finalWrong}</p>
            <p className="text-text-muted text-sm">Missed</p>
          </div>
        </div>
        <p className="text-text-secondary mb-6">
          {finalRight}/{total} cards correct ({total > 0 ? Math.round((finalRight / total) * 100) : 0}%)
        </p>
        <button
          onClick={() => {
            setIndex(0);
            setFlipped(false);
            setRights(0);
            setWrongs(0);
            setFinished(false);
          }}
          className="px-6 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors"
        >
          Restart
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Progress */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-text-muted text-sm">
          Card {index + 1} of {total}
        </p>
        <div className="flex gap-3 text-sm">
          <span className="text-success">{rights} right</span>
          <span className="text-error">{wrongs} wrong</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-bg-dark rounded-full mb-6">
        <div
          className="h-1 bg-accent rounded-full transition-all duration-300"
          style={{ width: `${((index) / total) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div
        className="relative w-full min-h-[220px] cursor-pointer"
        style={{ perspective: "1000px" }}
        onClick={() => setFlipped((f) => !f)}
      >
        <div
          className="w-full min-h-[220px] transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 bg-bg-card rounded-xl p-8 border border-border flex flex-col items-center justify-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <p className="text-xs text-text-muted mb-3 uppercase tracking-wide">Question</p>
            <p className="text-white text-lg text-center leading-relaxed">{card?.front}</p>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 bg-bg-card rounded-xl p-8 border border-accent/40 flex flex-col items-center justify-center"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="text-xs text-accent mb-3 uppercase tracking-wide">Answer</p>
            <p className="text-white text-lg text-center leading-relaxed">{card?.back}</p>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-center gap-3 mt-6">
        {!flipped ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFlipped(true);
            }}
            className="px-6 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors"
          >
            Flip Card
          </button>
        ) : (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                markAndNext(false);
              }}
              className="px-6 py-2.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
            >
              Missed It
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                markAndNext(true);
              }}
              className="px-6 py-2.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-sm font-medium hover:bg-green-500/30 transition-colors"
            >
              Got It
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiz component
// ---------------------------------------------------------------------------

function QuizViewer({ questions }: { questions: QuizQuestion[] }) {
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const answered = Object.keys(selected).length;
  const total = questions.length;

  function score(): number {
    let correct = 0;
    for (const [i, choice] of Object.entries(selected)) {
      if (questions[Number(i)]?.correct_index === choice) correct++;
    }
    return correct;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">Practice Quiz</h2>
        {!submitted ? (
          <div className="flex items-center gap-3">
            <span className="text-text-muted text-sm">
              {answered}/{total} answered
            </span>
            <button
              onClick={() => setSubmitted(true)}
              disabled={answered < total}
              className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Submit
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              Score:{" "}
              <span className={score() >= total * 0.7 ? "text-success" : "text-error"}>
                {score()}/{total}
              </span>{" "}
              ({Math.round((score() / total) * 100)}%)
            </span>
            <button
              onClick={() => {
                setSelected({});
                setSubmitted(false);
              }}
              className="px-4 py-2 bg-bg-dark border border-border text-text-secondary rounded-lg text-sm hover:text-white transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q, qi) => {
          const userChoice = selected[qi];
          const isCorrect = userChoice === q.correct_index;

          return (
            <div key={qi} className="bg-bg-card rounded-xl p-6 border border-border">
              <p className="text-white font-medium mb-4">
                {qi + 1}. {q.question}
              </p>
              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  let optionClasses =
                    "w-full text-left px-4 py-3 rounded-lg border transition-colors text-sm ";

                  if (submitted) {
                    if (oi === q.correct_index) {
                      optionClasses += "border-green-500 bg-green-500/10 text-green-400 ";
                    } else if (oi === userChoice && !isCorrect) {
                      optionClasses += "border-red-500 bg-red-500/10 text-red-400 ";
                    } else {
                      optionClasses += "border-border text-text-muted ";
                    }
                  } else {
                    if (oi === userChoice) {
                      optionClasses += "border-accent bg-accent/10 text-white ";
                    } else {
                      optionClasses +=
                        "border-border text-text-secondary hover:border-accent/50 hover:text-white ";
                    }
                  }

                  return (
                    <button
                      key={oi}
                      onClick={() => {
                        if (!submitted) setSelected((s) => ({ ...s, [qi]: oi }));
                      }}
                      disabled={submitted}
                      className={optionClasses}
                    >
                      <span className="font-medium mr-2 text-text-muted">
                        {String.fromCharCode(65 + oi)}.
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>

              {/* Explanation after submit */}
              {submitted && (
                <div className="mt-4 p-3 bg-bg-dark rounded-lg">
                  <p className="text-sm">
                    <span className={isCorrect ? "text-success" : "text-error"}>
                      {isCorrect ? "Correct!" : "Incorrect."}
                    </span>{" "}
                    <span className="text-text-muted">{q.explanation}</span>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown-ish renderer (basic)
// ---------------------------------------------------------------------------

function MarkdownContent({ text }: { text: string }) {
  // Split into lines, handle headers/bold/lists simply
  const lines = text.split("\n");

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;
        if (trimmed.startsWith("### "))
          return (
            <h4 key={i} className="text-white font-semibold mt-4 mb-1">
              {trimmed.slice(4)}
            </h4>
          );
        if (trimmed.startsWith("## "))
          return (
            <h3 key={i} className="text-white font-bold text-lg mt-5 mb-2">
              {trimmed.slice(3)}
            </h3>
          );
        if (trimmed.startsWith("# "))
          return (
            <h2 key={i} className="text-white font-bold text-xl mt-6 mb-2">
              {trimmed.slice(2)}
            </h2>
          );
        if (trimmed.startsWith("- ") || trimmed.startsWith("* "))
          return (
            <li key={i} className="text-text-secondary ml-4 list-disc">
              {renderInline(trimmed.slice(2))}
            </li>
          );
        if (/^\d+\.\s/.test(trimmed)) {
          const content = trimmed.replace(/^\d+\.\s/, "");
          return (
            <li key={i} className="text-text-secondary ml-4 list-decimal">
              {renderInline(content)}
            </li>
          );
        }
        return (
          <p key={i} className="text-text-secondary leading-relaxed">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold** inline
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="text-white font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

// ---------------------------------------------------------------------------
// Saved content panel
// ---------------------------------------------------------------------------

function SavedPanel({
  items,
  onLoad,
  onDelete,
}: {
  items: SavedContent[];
  onLoad: (item: SavedContent) => void;
  onDelete: (index: number) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="bg-bg-card rounded-xl p-4 border border-border mb-6">
      <h3 className="text-sm font-medium text-text-secondary mb-3">Saved Content</h3>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {items.map((item, i) => {
          const toolInfo = TOOLS.find((t) => t.key === item.tool);
          return (
            <div
              key={i}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-bg-dark transition-colors group"
            >
              <button
                onClick={() => onLoad(item)}
                className="flex items-center gap-2 text-sm text-text-secondary hover:text-white transition-colors flex-1 text-left"
              >
                <span>{toolInfo?.icon}</span>
                <span className="truncate">
                  {item.course} &mdash; {item.topic}
                </span>
                <span className="text-text-muted text-xs">
                  ({toolInfo?.label})
                </span>
              </button>
              <button
                onClick={() => onDelete(i)}
                className="text-text-muted hover:text-error text-xs opacity-0 group-hover:opacity-100 transition-opacity ml-2"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function StudyPage() {
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [course, setCourse] = useState("");
  const [topic, setTopic] = useState("");
  const [activeTool, setActiveTool] = useState<StudyTool | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StudyResult | null>(null);
  const [error, setError] = useState("");
  const [savedItems, setSavedItems] = useState<SavedContent[]>([]);
  const [flashcardResults, setFlashcardResults] = useState<{ right: number; wrong: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load courses on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchCourses() {
      try {
        const data = await apiFetch<CourseInfo[]>("/api/profile/classes");
        if (!cancelled && Array.isArray(data)) {
          setCourses(data);
          if (data.length > 0 && !course) {
            setCourse(data[0].class_name);
          }
        }
      } catch {
        // Silently fail — user can type manually
      } finally {
        if (!cancelled) setCoursesLoading(false);
      }
    }
    fetchCourses();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load saved content from localStorage
  useEffect(() => {
    setSavedItems(loadSaved());
  }, []);

  // Abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const generate = useCallback(
    async (tool: StudyTool) => {
      if (!course.trim() || !topic.trim()) {
        setError("Please enter both a course and a topic.");
        return;
      }

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // 60-second timeout
      const timeout = setTimeout(() => controller.abort(), 60_000);

      setLoading(true);
      setError("");
      setActiveTool(tool);
      posthog.capture("study_tool_used", { type: tool });
      setResult(null);
      setFlashcardResults(null);

      try {
        const data = await apiFetch<StudyResult>(`/api/study/${tool}`, {
          method: "POST",
          body: JSON.stringify({ course: course.trim(), topic: topic.trim() }),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setResult(data);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setError("Request timed out. Try a more specific topic or try again.");
        } else {
          setError(
            err instanceof Error ? err.message : "Failed to generate. Please try again."
          );
        }
      } finally {
        clearTimeout(timeout);
        if (!controller.signal.aborted) {
          setLoading(false);
        } else {
          setLoading(false);
        }
      }
    },
    [course, topic]
  );

  function saveResult() {
    if (!result || !activeTool) return;
    const item: SavedContent = {
      tool: activeTool,
      course: course.trim(),
      topic: topic.trim(),
      result,
      savedAt: new Date().toISOString(),
    };
    const updated = [item, ...savedItems].slice(0, 50); // max 50 saved
    setSavedItems(updated);
    saveToDisk(updated);
  }

  function deleteSaved(index: number) {
    const updated = savedItems.filter((_, i) => i !== index);
    setSavedItems(updated);
    saveToDisk(updated);
  }

  function loadSavedItem(item: SavedContent) {
    setCourse(item.course);
    setTopic(item.topic);
    setActiveTool(item.tool);
    setResult(item.result);
    setError("");
    setFlashcardResults(null);
  }

  const isSaved =
    result &&
    activeTool &&
    savedItems.some(
      (s) =>
        s.tool === activeTool &&
        s.course === course.trim() &&
        s.topic === topic.trim()
    );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Study Tools</h1>

      {/* Saved content */}
      <SavedPanel items={savedItems} onLoad={loadSavedItem} onDelete={deleteSaved} />

      {/* Input Section */}
      <div className="bg-bg-card rounded-xl p-6 border border-border mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Course dropdown/input */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">Course</label>
            {coursesLoading ? (
              <div className="w-full h-[42px] bg-bg-dark border border-border rounded-lg animate-pulse" />
            ) : courses.length > 0 ? (
              <select
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="w-full bg-bg-dark border border-border rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-accent appearance-none cursor-pointer"
              >
                <option value="" disabled>
                  Select a course
                </option>
                {courses.map((c) => (
                  <option key={c.class_name} value={c.class_name}>
                    {c.class_name}
                    {c.teacher_name ? ` (${c.teacher_name})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="e.g., AP Biology"
                className="w-full bg-bg-dark border border-border rounded-lg px-4 py-2.5 text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            )}
          </div>

          {/* Topic input */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Cell Division, Chapter 5, Photosynthesis"
              className="w-full bg-bg-dark border border-border rounded-lg px-4 py-2.5 text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter" && activeTool) generate(activeTool);
                else if (e.key === "Enter") generate("guide");
              }}
            />
          </div>
        </div>

        {/* Tool buttons */}
        <div className="flex flex-wrap gap-2">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              onClick={() => generate(t.key)}
              disabled={loading}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTool === t.key && !loading
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "bg-bg-dark text-text-secondary hover:text-white hover:bg-bg-dark/80"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 flex items-start gap-3">
          <span className="text-red-400 text-lg leading-none mt-0.5">!</span>
          <div>
            <p className="text-red-400 text-sm font-medium">Something went wrong</p>
            <p className="text-red-400/70 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && activeTool === "flashcards" && (
        <FlashcardSkeleton message={LOADING_MESSAGES.flashcards} />
      )}
      {loading && activeTool === "quiz" && (
        <QuizSkeleton message={LOADING_MESSAGES.quiz} />
      )}
      {loading && activeTool && activeTool !== "flashcards" && activeTool !== "quiz" && (
        <SkeletonBlock lines={8} message={LOADING_MESSAGES[activeTool]} />
      )}

      {/* Results */}
      {result && !loading && (
        <div>
          {/* Save button */}
          <div className="flex justify-end mb-3">
            <button
              onClick={saveResult}
              disabled={!!isSaved}
              className={`text-sm px-4 py-1.5 rounded-lg transition-colors ${
                isSaved
                  ? "text-text-muted bg-bg-dark cursor-default"
                  : "text-accent border border-accent/30 hover:bg-accent/10"
              }`}
            >
              {isSaved ? "Saved" : "Save for Later"}
            </button>
          </div>

          {/* Guide */}
          {activeTool === "guide" && result.content && (
            <div className="bg-bg-card rounded-xl p-6 border border-border">
              <h2 className="text-lg font-bold text-white mb-4">Study Guide</h2>
              <MarkdownContent text={result.content} />
            </div>
          )}

          {/* Flashcards */}
          {activeTool === "flashcards" && result.flashcards && result.flashcards.length > 0 && (
            <FlashcardViewer
              cards={result.flashcards}
              onDone={(res) => setFlashcardResults(res)}
            />
          )}

          {/* Quiz */}
          {activeTool === "quiz" && result.questions && result.questions.length > 0 && (
            <QuizViewer questions={result.questions} />
          )}

          {/* Explain */}
          {activeTool === "explain" && result.content && (
            <div className="bg-bg-card rounded-xl p-6 border border-border">
              <h2 className="text-lg font-bold text-white mb-4">Explanation</h2>
              <MarkdownContent text={result.content} />
            </div>
          )}

          {/* Summary */}
          {activeTool === "summary" && result.content && (
            <div className="bg-bg-card rounded-xl p-6 border border-border">
              <h2 className="text-lg font-bold text-white mb-4">Summary</h2>
              <MarkdownContent text={result.content} />
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">📚</p>
          <p className="text-text-secondary text-lg mb-2">Pick a course and topic</p>
          <p className="text-text-muted text-sm">
            Choose a study tool above to generate guides, flashcards, quizzes, and more.
          </p>
        </div>
      )}
    </div>
  );
}
