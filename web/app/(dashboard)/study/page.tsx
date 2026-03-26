"use client";

import { createClient } from "@/lib/supabase-client";
import { useState, useEffect, useRef, useCallback } from "react";

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
// SVG Icons (no emojis)
// ---------------------------------------------------------------------------

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function CardsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOOLS: { key: StudyTool; label: string; Icon: React.FC<{ className?: string }>; description: string }[] = [
  { key: "guide", label: "Study Guide", Icon: BookIcon, description: "Comprehensive study guide" },
  { key: "flashcards", label: "Flashcards", Icon: CardsIcon, description: "Flip-card review" },
  { key: "quiz", label: "Practice Quiz", Icon: ClipboardIcon, description: "Multiple choice quiz" },
  { key: "explain", label: "Explain", Icon: LightbulbIcon, description: "Concept breakdown" },
  { key: "summary", label: "Summary", Icon: DocumentIcon, description: "One-page summary" },
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
// ThinkingOrb + ThinkingDots
// ---------------------------------------------------------------------------

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-current"
          style={{
            animation: "pulse3 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </span>
  );
}

function ThinkingOrb() {
  return (
    <div
      className="w-8 h-8 rounded-full bg-accent/30 border border-accent/50"
      style={{ animation: "breathe 2s ease-in-out infinite" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Loading skeletons
// ---------------------------------------------------------------------------

function GeneratingLoader({ message }: { message: string }) {
  return (
    <div className="bg-surface rounded-xl p-8 border border-border flex flex-col items-center justify-center gap-4">
      <ThinkingOrb />
      <div className="flex items-center gap-2 text-text-secondary text-sm">
        <span>{message}</span>
        <ThinkingDots />
      </div>
    </div>
  );
}

function FlashcardSkeleton({ message }: { message: string }) {
  return (
    <div className="bg-surface rounded-xl p-8 border border-border flex flex-col items-center justify-center gap-4">
      <ThinkingOrb />
      <div className="flex items-center gap-2 text-text-secondary text-sm">
        <span>{message}</span>
        <ThinkingDots />
      </div>
    </div>
  );
}

function QuizSkeleton({ message }: { message: string }) {
  return (
    <div className="bg-surface rounded-xl p-8 border border-border flex flex-col items-center justify-center gap-4">
      <ThinkingOrb />
      <div className="flex items-center gap-2 text-text-secondary text-sm">
        <span>{message}</span>
        <ThinkingDots />
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
      <div className="bg-surface rounded-xl p-8 border border-border text-center">
        <h3 className="text-xl font-bold text-text mb-4">Session Complete</h3>
        <div className="flex justify-center gap-8 mb-6">
          <div>
            <p className="text-3xl font-bold font-mono text-green">{finalRight}</p>
            <p className="text-muted text-sm">Got it</p>
          </div>
          <div>
            <p className="text-3xl font-bold font-mono text-red">{finalWrong}</p>
            <p className="text-muted text-sm">Missed</p>
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
          className="px-6 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors cursor-pointer"
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
        <p className="text-muted text-sm">
          Card {index + 1} of {total}
        </p>
        <div className="flex gap-3 text-sm font-mono">
          <span className="text-green">{rights} right</span>
          <span className="text-red">{wrongs} wrong</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-bg rounded-full mb-6">
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
            className="absolute inset-0 bg-surface rounded-xl p-8 border border-border flex flex-col items-center justify-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-3">Question</p>
            <p className="text-text text-lg text-center leading-relaxed">{card?.front}</p>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 bg-surface rounded-xl p-8 border border-accent/40 flex flex-col items-center justify-center"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-accent mb-3">Answer</p>
            <p className="text-text text-lg text-center leading-relaxed">{card?.back}</p>
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
            className="px-6 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors cursor-pointer"
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
              className="px-6 py-2.5 bg-red/20 text-red border border-red/30 rounded-lg text-sm font-medium hover:bg-red/30 transition-colors cursor-pointer"
            >
              Missed It
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                markAndNext(true);
              }}
              className="px-6 py-2.5 bg-green/20 text-green border border-green/30 rounded-lg text-sm font-medium hover:bg-green/30 transition-colors cursor-pointer"
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
        <h2 className="text-lg font-bold text-text">Practice Quiz</h2>
        {!submitted ? (
          <div className="flex items-center gap-3">
            <span className="text-muted text-sm font-mono">
              {answered}/{total} answered
            </span>
            <button
              onClick={() => setSubmitted(true)}
              disabled={answered < total}
              className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Submit
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              Score:{" "}
              <span className={`font-mono ${score() >= total * 0.7 ? "text-green" : "text-red"}`}>
                {score()}/{total}
              </span>{" "}
              ({Math.round((score() / total) * 100)}%)
            </span>
            <button
              onClick={() => {
                setSelected({});
                setSubmitted(false);
              }}
              className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm hover:text-text transition-colors cursor-pointer"
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
            <div key={qi} className="bg-surface rounded-xl p-6 border border-border">
              <p className="text-text font-medium mb-4">
                {qi + 1}. {q.question}
              </p>
              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  let optionClasses =
                    "w-full text-left px-4 py-3 rounded-lg border transition-colors text-sm cursor-pointer ";

                  if (submitted) {
                    if (oi === q.correct_index) {
                      optionClasses += "border-green bg-green/10 text-green ";
                    } else if (oi === userChoice && !isCorrect) {
                      optionClasses += "border-red bg-red/10 text-red ";
                    } else {
                      optionClasses += "border-border text-muted ";
                    }
                  } else {
                    if (oi === userChoice) {
                      optionClasses += "border-accent bg-accent/10 text-text ";
                    } else {
                      optionClasses +=
                        "border-border text-text-secondary hover:border-border-light hover:text-text ";
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
                      <span className="font-medium mr-2 text-muted font-mono">
                        {String.fromCharCode(65 + oi)}.
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>

              {/* Explanation after submit */}
              {submitted && (
                <div className="mt-4 p-3 bg-bg rounded-lg">
                  <p className="text-sm">
                    <span className={isCorrect ? "text-green" : "text-red"}>
                      {isCorrect ? "Correct!" : "Incorrect."}
                    </span>{" "}
                    <span className="text-muted">{q.explanation}</span>
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
  const lines = text.split("\n");

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;
        if (trimmed.startsWith("### "))
          return (
            <h4 key={i} className="text-text font-semibold mt-4 mb-1">
              {trimmed.slice(4)}
            </h4>
          );
        if (trimmed.startsWith("## "))
          return (
            <h3 key={i} className="text-text font-bold text-lg mt-5 mb-2">
              {trimmed.slice(3)}
            </h3>
          );
        if (trimmed.startsWith("# "))
          return (
            <h2 key={i} className="text-text font-bold text-xl mt-6 mb-2">
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
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="text-text font-semibold">
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
    <div className="bg-surface rounded-xl p-4 border border-border mb-6">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">Saved Content</h3>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {items.map((item, i) => {
          const toolInfo = TOOLS.find((t) => t.key === item.tool);
          const ToolIcon = toolInfo?.Icon;
          return (
            <div
              key={i}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-bg transition-colors group"
            >
              <button
                onClick={() => onLoad(item)}
                className="flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors flex-1 text-left cursor-pointer"
              >
                {ToolIcon && <ToolIcon className="w-4 h-4 text-dim" />}
                <span className="truncate">
                  {item.course} &mdash; {item.topic}
                </span>
                <span className="text-muted text-xs">
                  ({toolInfo?.label})
                </span>
              </button>
              <button
                onClick={() => onDelete(i)}
                className="text-muted hover:text-red text-xs opacity-0 group-hover:opacity-100 transition-opacity ml-2 cursor-pointer"
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

      // Track study tool usage
      import("@/components/PostHogProvider").then(({ trackEvent }) => {
        trackEvent("study_tool_used", { tool, course, topic });
      }).catch(() => {});

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // 60-second timeout
      const timeout = setTimeout(() => controller.abort(), 60_000);

      setLoading(true);
      setError("");
      setActiveTool(tool);
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
      <h1 className="text-2xl font-bold tracking-tight text-text mb-6">Study Tools</h1>

      {/* Saved content */}
      <SavedPanel items={savedItems} onLoad={loadSavedItem} onDelete={deleteSaved} />

      {/* Course picker: horizontal pills */}
      {!coursesLoading && courses.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {courses.map((c) => (
            <button
              key={c.class_name}
              onClick={() => setCourse(c.class_name)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                course === c.class_name
                  ? "bg-accent text-text"
                  : "border border-border text-text-secondary hover:text-text hover:border-border-light"
              }`}
            >
              {c.class_name}
            </button>
          ))}
        </div>
      )}

      {/* Input Section */}
      <div className="bg-surface rounded-xl p-6 border border-border mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Course dropdown/input */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Course</label>
            {coursesLoading ? (
              <div className="w-full h-[42px] bg-bg border border-border rounded-lg" style={{ animation: "skeletonPulse 1.5s ease-in-out infinite" }} />
            ) : courses.length > 0 ? (
              <select
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-accent appearance-none cursor-pointer"
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
                className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-text placeholder:text-muted focus:outline-none focus:border-accent"
              />
            )}
          </div>

          {/* Topic input */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Cell Division, Chapter 5, Photosynthesis"
              className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-text placeholder:text-muted focus:outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter" && activeTool) generate(activeTool);
                else if (e.key === "Enter") generate("guide");
              }}
            />
          </div>
        </div>

        {/* Tool cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {TOOLS.map((t) => {
            const isActive = activeTool === t.key && !loading;
            return (
              <button
                key={t.key}
                onClick={() => generate(t.key)}
                disabled={loading}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-sm font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  isActive
                    ? "bg-accent/10 border-accent text-text shadow-[0_0_12px_rgba(124,58,237,0.15)]"
                    : "bg-bg border-border text-text-secondary hover:border-border-light hover:text-text hover:-translate-y-0.5"
                }`}
              >
                <t.Icon className={`w-5 h-5 ${isActive ? "text-accent" : "text-dim"}`} />
                <span>{t.label}</span>
                <span className="text-[11px] text-muted font-normal hidden sm:block">{t.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 text-red mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="text-red text-sm font-medium">Something went wrong</p>
            <p className="text-red/70 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Loading states */}
      {loading && activeTool === "flashcards" && (
        <FlashcardSkeleton message={LOADING_MESSAGES.flashcards} />
      )}
      {loading && activeTool === "quiz" && (
        <QuizSkeleton message={LOADING_MESSAGES.quiz} />
      )}
      {loading && activeTool && activeTool !== "flashcards" && activeTool !== "quiz" && (
        <GeneratingLoader message={LOADING_MESSAGES[activeTool]} />
      )}

      {/* Results */}
      {result && !loading && (
        <div>
          {/* Save button */}
          <div className="flex justify-end mb-3">
            <button
              onClick={saveResult}
              disabled={!!isSaved}
              className={`text-sm px-4 py-1.5 rounded-lg transition-colors cursor-pointer ${
                isSaved
                  ? "text-muted bg-bg cursor-default"
                  : "text-accent border border-accent/30 hover:bg-accent/10"
              }`}
            >
              {isSaved ? "Saved" : "Save for Later"}
            </button>
          </div>

          {/* Guide */}
          {activeTool === "guide" && result.content && (
            <div className="bg-surface rounded-xl p-6 border border-border">
              <h2 className="text-lg font-bold text-text mb-4">Study Guide</h2>
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
            <div className="bg-surface rounded-xl p-6 border border-border">
              <h2 className="text-lg font-bold text-text mb-4">Explanation</h2>
              <MarkdownContent text={result.content} />
            </div>
          )}

          {/* Summary */}
          {activeTool === "summary" && result.content && (
            <div className="bg-surface rounded-xl p-6 border border-border">
              <h2 className="text-lg font-bold text-text mb-4">Summary</h2>
              <MarkdownContent text={result.content} />
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="text-center py-16">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
            <BookIcon className="w-6 h-6 text-accent" />
          </div>
          <p className="text-text-secondary text-lg mb-2">Pick a course and topic</p>
          <p className="text-muted text-sm">
            Choose a study tool above to generate guides, flashcards, quizzes, and more.
          </p>
        </div>
      )}
    </div>
  );
}
