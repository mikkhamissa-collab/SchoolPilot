"use client";

// STUDY SESSION PAGE — Guided chunks with timer, pre-session diagnostic,
// and confetti on completion. Same dark theme vibes as the rest of the app.

import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase-client";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import Confetti from "@/components/Confetti";

// =============================================================================
// TYPES
// =============================================================================

interface DiagnosticQuestion {
  id: string;
  topic: string;
  question: string;
  options: string[];
  correct: string;
  difficulty: string;
  what_it_tells_us: string;
}

interface DiagnosticData {
  course: string;
  assignment: string;
  questions: DiagnosticQuestion[];
  intro_message: string;
}

interface PracticeProblem {
  problem: string;
  hint: string;
  answer: string;
}

interface StudyChunk {
  step: number;
  title: string;
  focus: string;
  minutes: number;
  done_when: string;
  tip: string;
  type: string;
  explanation?: string;
  practice_problems?: PracticeProblem[];
}

interface SessionData {
  assignment: string;
  course: string;
  total_time_minutes: number;
  chunks: StudyChunk[];
  key_concepts?: string[];
  cheat_sheet?: string[];
  prediction: string;
  encouragement: string;
  student_profile?: {
    strong_topics: string[];
    weak_topics: string[];
    grade_context: string;
  };
}

type Phase = "loading" | "diagnostic" | "generating" | "session" | "complete";

// =============================================================================
// TIMER HOOK
// =============================================================================

function useTimer(targetMinutes: number, onComplete: () => void) {
  const [secondsLeft, setSecondsLeft] = useState(targetMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRunning && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setIsRunning(false);
            onComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, secondsLeft, onComplete]);

  const reset = (minutes: number) => {
    setSecondsLeft(minutes * 60);
    setIsRunning(false);
  };

  const toggle = () => setIsRunning(!isRunning);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const progress = targetMinutes > 0 ? 1 - secondsLeft / (targetMinutes * 60) : 0;

  return { display, isRunning, toggle, reset, progress, secondsLeft };
}

// =============================================================================
// INNER COMPONENT (uses useSearchParams)
// =============================================================================

function SessionInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const assignment = searchParams.get("assignment") || "";
  const course = searchParams.get("course") || "";
  const type = searchParams.get("type") || "assignment";
  const grade = searchParams.get("grade") || "";
  const target = searchParams.get("target") || "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [diagnostic, setDiagnostic] = useState<DiagnosticData | null>(null);
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<Record<string, string>>({});
  const [session, setSession] = useState<SessionData | null>(null);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [completedChunks, setCompletedChunks] = useState<Set<number>>(new Set());
  const [showConfetti, setShowConfetti] = useState(false);
  const [error, setError] = useState("");
  const [courseContent, setCourseContent] = useState("");
  const [showHint, setShowHint] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState<number | null>(null);

  const chunk = session?.chunks?.[currentChunk];
  const timer = useTimer(chunk?.minutes || 25, () => {
    // Timer completed — auto-advance prompt
  });

  // Load course materials if available
  useEffect(() => {
    const loadMaterials = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find course materials matching this course name
      const { data: courses } = await supabase
        .from("courses")
        .select("id, name")
        .eq("user_id", user.id)
        .ilike("name", `%${course}%`)
        .limit(1);

      if (courses && courses[0]) {
        const { data: materials } = await supabase
          .from("course_materials")
          .select("units, lessons, resources, assignments, extracted_content")
          .eq("user_id", user.id)
          .eq("course_id", courses[0].id)
          .single();

        if (materials) {
          // Build a text representation of the course content
          const parts: string[] = [];

          if (materials.units?.length) {
            parts.push("COURSE UNITS:");
            for (const u of materials.units) {
              parts.push(`  ${u.name}${u.description ? `: ${u.description}` : ""}`);
              if (u.objectives?.length) {
                parts.push(`    Objectives: ${u.objectives.join(", ")}`);
              }
            }
          }

          if (materials.lessons?.length) {
            parts.push("\nLESSONS:");
            for (const l of materials.lessons) {
              parts.push(`  ${l.name}`);
            }
          }

          if (materials.assignments?.length) {
            parts.push("\nASSIGNMENTS:");
            for (const a of materials.assignments) {
              parts.push(`  ${a.title || "Untitled"}${a.instructions ? `: ${a.instructions.substring(0, 300)}` : ""}`);
            }
          }

          if (materials.extracted_content?.length) {
            parts.push("\nEXTRACTED DOCUMENT CONTENT:");
            for (const ec of materials.extracted_content) {
              parts.push(`  [${ec.title}]: ${ec.preview || ""}`);
            }
          }

          setCourseContent(parts.join("\n"));
        }
      }
    };

    loadMaterials();
  }, [course]);

  // Load diagnostic questions
  useEffect(() => {
    if (!assignment || !course) return;

    const loadDiagnostic = async () => {
      try {
        const result = await apiFetch<DiagnosticData>("plan/study-session/diagnostic", {
          assignmentName: assignment,
          course,
          courseContent,
        });
        setDiagnostic(result);
        setPhase("diagnostic");
      } catch {
        // If diagnostic fails, skip to generating session directly
        generateSession({});
      }
    };

    // Wait a bit for course content to load
    const timeout = setTimeout(loadDiagnostic, 1500);
    return () => clearTimeout(timeout);
  }, [assignment, course, courseContent]);

  const generateSession = useCallback(async (profile: Record<string, unknown>) => {
    setPhase("generating");
    setError("");

    try {
      const result = await apiFetch<SessionData>("plan/study-session", {
        assignmentName: assignment,
        assignmentType: type,
        course,
        currentGrade: grade ? parseFloat(grade) : undefined,
        targetScore: target ? parseFloat(target) : undefined,
        courseContent,
        studentProfile: profile,
        availableMinutes: 120,
      });

      setSession(result);
      setCurrentChunk(0);
      setCompletedChunks(new Set());
      setPhase("session");
      timer.reset(result.chunks?.[0]?.minutes || 25);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate session");
      setPhase("loading");
    }
  }, [assignment, type, course, grade, target, courseContent, timer]);

  const submitDiagnostic = () => {
    if (!diagnostic) return;

    // Analyze answers to determine weak/strong topics
    const strong: string[] = [];
    const weak: string[] = [];
    const answers: Array<{ topic: string; wasCorrect: boolean }> = [];

    for (const q of diagnostic.questions) {
      const userAnswer = diagnosticAnswers[q.id];
      const isCorrect = userAnswer === q.correct;
      answers.push({ topic: q.topic, wasCorrect: isCorrect });
      if (isCorrect) {
        strong.push(q.topic);
      } else {
        weak.push(q.topic);
      }
    }

    generateSession({
      strong_topics: strong,
      weak_topics: weak,
      diagnostic_answers: answers,
    });
  };

  const completeChunk = () => {
    const newCompleted = new Set(completedChunks);
    newCompleted.add(currentChunk);
    setCompletedChunks(newCompleted);

    if (session && currentChunk < session.chunks.length - 1) {
      // Move to next chunk
      const next = currentChunk + 1;
      setCurrentChunk(next);
      timer.reset(session.chunks[next].minutes);
      setShowHint(null);
      setShowAnswer(null);
    } else {
      // All chunks done!
      setPhase("complete");
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 100);
    }
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  // Loading state
  if (phase === "loading") {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="text-center py-20">
          <div className="text-4xl mb-4 animate-pulse">📚</div>
          <h2 className="text-xl font-bold text-white mb-2">Preparing your study session...</h2>
          <p className="text-text-muted text-sm">Analyzing your course materials</p>
          {error && <p className="text-error text-sm mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  // Diagnostic phase
  if (phase === "diagnostic" && diagnostic) {
    const answeredAll = diagnostic.questions.every((q) => diagnosticAnswers[q.id]);

    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <header className="border-b border-border/50 pb-4">
          <button onClick={() => router.push("/today")} className="text-text-muted hover:text-white text-sm mb-3 flex items-center gap-1">
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-white">{assignment}</h1>
          <p className="text-text-secondary text-sm mt-1">{course} • Quick check before we start</p>
        </header>

        <div className="p-4 rounded-xl bg-bg-card border border-border">
          <p className="text-text-secondary text-sm">{diagnostic.intro_message}</p>
        </div>

        <div className="space-y-4">
          {diagnostic.questions.map((q, i) => (
            <div key={q.id} className="p-5 rounded-xl bg-bg-card border border-border space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-accent font-bold text-sm mt-0.5">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-white font-medium">{q.question}</p>
                  <p className="text-text-muted text-xs mt-1">{q.topic} • {q.difficulty}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 ml-6">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setDiagnosticAnswers({ ...diagnosticAnswers, [q.id]: opt })}
                    className={`text-left px-4 py-2.5 rounded-lg text-sm transition-all ${
                      diagnosticAnswers[q.id] === opt
                        ? "bg-accent/20 text-accent border border-accent/40"
                        : "bg-bg-hover text-text-secondary hover:text-white border border-transparent"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={submitDiagnostic}
          disabled={!answeredAll}
          className="w-full py-3 rounded-xl bg-white text-black font-medium hover:bg-gray-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {answeredAll ? "Generate My Study Plan" : `Answer all ${diagnostic.questions.length} questions to continue`}
        </button>
      </div>
    );
  }

  // Generating state
  if (phase === "generating") {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center py-20">
        <div className="text-4xl mb-4 animate-pulse">🧠</div>
        <h2 className="text-xl font-bold text-white mb-2">Building your personalized study plan...</h2>
        <p className="text-text-muted text-sm">Analyzing your course materials and weak spots</p>
      </div>
    );
  }

  // Completion state
  if (phase === "complete" && session) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <Confetti trigger={showConfetti} />

        <div className="text-center py-12 space-y-4">
          <div className="text-6xl">🎉</div>
          <h1 className="text-3xl font-bold text-white">Session Complete!</h1>
          <p className="text-text-secondary text-lg">{session.encouragement}</p>
        </div>

        {session.prediction && (
          <div className="p-5 rounded-xl bg-accent/10 border border-accent/20 text-center">
            <p className="text-accent font-medium text-sm uppercase tracking-wide mb-2">Grade Projection</p>
            <p className="text-white">{session.prediction}</p>
          </div>
        )}

        {session.cheat_sheet && session.cheat_sheet.length > 0 && (
          <div className="p-5 rounded-xl bg-bg-card border border-border">
            <h3 className="text-white font-medium mb-3">📋 Quick Reference Sheet</h3>
            <ul className="space-y-2">
              {session.cheat_sheet.map((item, i) => (
                <li key={i} className="text-text-secondary text-sm flex items-start gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  <span className="font-mono text-xs">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => router.push("/today")}
            className="flex-1 py-3 rounded-xl bg-bg-card border border-border text-text-secondary hover:text-white transition-colors"
          >
            Back to Dashboard
          </button>
          <button
            onClick={() => { setPhase("session"); setCurrentChunk(0); setCompletedChunks(new Set()); }}
            className="flex-1 py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent-hover transition-colors"
          >
            Study Again
          </button>
        </div>
      </div>
    );
  }

  // Main session view
  if (phase === "session" && session && chunk) {
    const totalChunks = session.chunks.length;
    const overallProgress = completedChunks.size / totalChunks;

    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <Confetti trigger={showConfetti} />

        {/* Header */}
        <header className="flex justify-between items-start">
          <div>
            <button onClick={() => router.push("/today")} className="text-text-muted hover:text-white text-sm mb-2 flex items-center gap-1">
              ← Back
            </button>
            <h1 className="text-xl font-bold text-white">{session.assignment}</h1>
            <p className="text-text-secondary text-sm">{session.course}</p>
          </div>
          <div className="text-right">
            <p className="text-text-muted text-xs">Step {currentChunk + 1} of {totalChunks}</p>
            <p className="text-text-muted text-xs">{session.total_time_minutes} min total</p>
          </div>
        </header>

        {/* Overall progress bar */}
        <div className="h-1.5 bg-bg-hover rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${overallProgress * 100}%` }}
          />
        </div>

        {/* Current chunk card */}
        <div className="p-6 rounded-xl bg-bg-card border border-border space-y-5">
          {/* Chunk header */}
          <div className="flex justify-between items-start">
            <div>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                chunk.type === "deep_review" ? "bg-accent/20 text-accent" :
                chunk.type === "practice" ? "bg-success/20 text-success" :
                chunk.type === "review" ? "bg-warning/20 text-warning" :
                "bg-bg-hover text-text-muted"
              }`}>
                {chunk.type === "deep_review" ? "Deep Review" :
                 chunk.type === "practice" ? "Practice" :
                 chunk.type === "review" ? "Review" : chunk.type}
              </span>
              <h2 className="text-lg font-bold text-white mt-2">{chunk.title}</h2>
              <p className="text-text-secondary text-sm mt-1">{chunk.focus}</p>
            </div>
          </div>

          {/* Explanation (tutor mode) */}
          {chunk.explanation && (
            <div className="p-4 rounded-lg bg-bg-dark/50 text-text-secondary text-sm leading-relaxed whitespace-pre-wrap">
              {chunk.explanation}
            </div>
          )}

          {/* Timer */}
          <div className="flex items-center justify-center gap-4 py-4">
            <button
              onClick={timer.toggle}
              className="w-16 h-16 rounded-full border-2 border-accent flex items-center justify-center text-accent hover:bg-accent/10 transition-colors"
            >
              {timer.isRunning ? "⏸" : "▶"}
            </button>
            <div className="text-center">
              <div className="text-3xl font-mono font-bold text-white">{timer.display}</div>
              <div className="text-text-muted text-xs mt-1">{chunk.minutes} min target</div>
            </div>
          </div>

          {/* Timer progress */}
          <div className="h-1 bg-bg-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-1000"
              style={{ width: `${timer.progress * 100}%` }}
            />
          </div>

          {/* Practice problems (tutor mode) */}
          {chunk.practice_problems && chunk.practice_problems.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-white font-medium text-sm">Practice Problems</h3>
              {chunk.practice_problems.map((p, i) => (
                <div key={i} className="p-3 rounded-lg bg-bg-dark/50 space-y-2">
                  <p className="text-white text-sm font-mono">{p.problem}</p>
                  {showHint === i && (
                    <p className="text-warning text-xs">💡 {p.hint}</p>
                  )}
                  {showAnswer === i && (
                    <p className="text-success text-xs font-mono">✅ {p.answer}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowHint(showHint === i ? null : i)}
                      className="text-xs text-text-muted hover:text-warning transition-colors"
                    >
                      {showHint === i ? "Hide hint" : "Show hint"}
                    </button>
                    <button
                      onClick={() => setShowAnswer(showAnswer === i ? null : i)}
                      className="text-xs text-text-muted hover:text-success transition-colors"
                    >
                      {showAnswer === i ? "Hide answer" : "Show answer"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tip */}
          {chunk.tip && (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-warning">💡</span>
              <p className="text-text-muted">{chunk.tip}</p>
            </div>
          )}

          {/* Done criteria */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-success/5 border border-success/10 text-sm">
            <span className="text-success mt-0.5">✓</span>
            <div>
              <span className="text-success font-medium">Done when: </span>
              <span className="text-text-secondary">{chunk.done_when}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {currentChunk > 0 && (
            <button
              onClick={() => {
                setCurrentChunk(currentChunk - 1);
                timer.reset(session.chunks[currentChunk - 1].minutes);
                setShowHint(null);
                setShowAnswer(null);
              }}
              className="px-6 py-3 rounded-xl bg-bg-card border border-border text-text-secondary hover:text-white transition-colors"
            >
              ← Previous
            </button>
          )}
          <button
            onClick={completeChunk}
            className="flex-1 py-3 rounded-xl bg-white text-black font-medium hover:bg-gray-200 transition-all"
          >
            {currentChunk < totalChunks - 1 ? "Done — Next Step →" : "Complete Session 🎉"}
          </button>
        </div>

        {/* Key concepts (if available) */}
        {session.key_concepts && session.key_concepts.length > 0 && (
          <div className="p-4 rounded-xl bg-bg-card border border-border">
            <p className="text-text-muted text-xs uppercase tracking-wide mb-2">Key Concepts</p>
            <div className="flex flex-wrap gap-2">
              {session.key_concepts.map((c, i) => (
                <span key={i} className="px-2 py-1 rounded bg-bg-hover text-text-secondary text-xs">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// =============================================================================
// MAIN EXPORT (wrapped in Suspense for useSearchParams)
// =============================================================================

export default function SessionPage() {
  return (
    <Suspense fallback={
      <div className="max-w-2xl mx-auto p-6 text-center py-20">
        <div className="text-4xl mb-4 animate-pulse">📚</div>
        <h2 className="text-xl font-bold text-white">Loading...</h2>
      </div>
    }>
      <SessionInner />
    </Suspense>
  );
}
