"use client";

// SPRINT MODE — Timed challenge/quiz mode for quick study bursts. Choose a
// subject, difficulty, and duration, then answer AI-generated practice questions
// with score tracking, history, and daily streak counter.

import { useState, useEffect, useRef, useCallback } from "react";

// =============================================================================
// TYPES
// =============================================================================

type Difficulty = "easy" | "medium" | "hard";
type SprintPhase = "setup" | "active" | "review";

interface SprintQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface SprintResult {
  id: string;
  topic: string;
  difficulty: Difficulty;
  durationMinutes: number;
  questionsAnswered: number;
  correctAnswers: number;
  score: number; // percentage
  completedAt: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SCORES_STORAGE_KEY = "schoolpilot_sprint_scores";
const STREAK_STORAGE_KEY = "schoolpilot_sprint_streak";

const DURATION_OPTIONS = [
  { minutes: 5, label: "5 min", description: "Quick review" },
  { minutes: 10, label: "10 min", description: "Solid practice" },
  { minutes: 15, label: "15 min", description: "Deep dive" },
];

const DIFFICULTY_OPTIONS: { key: Difficulty; label: string; description: string; color: string }[] = [
  { key: "easy", label: "Easy", description: "Recall & basics", color: "text-emerald-400 bg-emerald-500/20 border-emerald-500/40" },
  { key: "medium", label: "Medium", description: "Apply concepts", color: "text-yellow-400 bg-yellow-500/20 border-yellow-500/40" },
  { key: "hard", label: "Hard", description: "Analyze & create", color: "text-red-400 bg-red-500/20 border-red-500/40" },
];

const SUGGESTED_TOPICS = [
  "Algebra",
  "Biology",
  "Chemistry",
  "Physics",
  "US History",
  "World History",
  "English Literature",
  "Spanish",
  "AP Calculus",
  "AP Psychology",
  "Computer Science",
  "Economics",
];

// Sample questions used when the student hasn't connected to AI yet.
// The main flow sends the topic to the AI chat sidebar for real questions.
const SAMPLE_QUESTIONS: Record<string, SprintQuestion[]> = {
  default: [
    {
      id: "s1",
      question: "This sprint uses AI-generated questions. Click 'Ask AI for Questions' to get personalized practice questions for your topic.",
      options: ["Got it!", "I understand", "Let's go", "Okay"],
      correctIndex: 0,
      explanation: "Use the 'Ask AI' button below the timer to generate real questions for your subject.",
    },
  ],
};

// =============================================================================
// HELPERS
// =============================================================================

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadScores(): SprintResult[] {
  try {
    const raw = localStorage.getItem(SCORES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveScores(scores: SprintResult[]): void {
  try {
    localStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // ignore
  }
}

function loadStreak(): { lastDate: string; count: number } {
  try {
    const raw = localStorage.getItem(STREAK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : { lastDate: "", count: 0 };
  } catch {
    return { lastDate: "", count: 0 };
  }
}

function saveStreak(streak: { lastDate: string; count: number }): void {
  try {
    localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(streak));
  } catch {
    // ignore
  }
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function scoreGrade(pct: number): { label: string; color: string } {
  if (pct >= 90) return { label: "Excellent", color: "text-emerald-400" };
  if (pct >= 75) return { label: "Great", color: "text-accent" };
  if (pct >= 60) return { label: "Good", color: "text-yellow-400" };
  if (pct >= 40) return { label: "Keep Going", color: "text-orange-400" };
  return { label: "Needs Practice", color: "text-red-400" };
}

// =============================================================================
// PROGRESS RING (reused from focus page pattern)
// =============================================================================

function TimerRing({
  progress,
  size = 180,
  strokeWidth = 6,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  // Color changes as time runs out
  const getColor = () => {
    if (progress > 0.75) return "stroke-red-500";
    if (progress > 0.5) return "stroke-yellow-500";
    return "stroke-[var(--color-accent)]";
  };

  return (
    <svg
      width={size}
      height={size}
      className="transform -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-white/5"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className={getColor()}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
    </svg>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function SprintPage() {
  // Setup state
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [durationMinutes, setDurationMinutes] = useState(10);

  // Sprint state
  const [phase, setPhase] = useState<SprintPhase>("setup");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Questions state
  const [questions, setQuestions] = useState<SprintQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [answers, setAnswers] = useState<{ questionId: string; selectedIndex: number; correct: boolean }[]>([]);

  // History state
  const [scores, setScores] = useState<SprintResult[]>([]);
  const [streak, setStreak] = useState({ lastDate: "", count: 0 });

  // Load from localStorage on mount
  useEffect(() => {
    setScores(loadScores());
    setStreak(loadStreak());
  }, []);

  // Today's scores
  const todayKey = getTodayKey();
  const todayScores = scores.filter(
    (s) => s.completedAt.slice(0, 10) === todayKey
  );
  const totalQuestionsToday = todayScores.reduce(
    (sum, s) => sum + s.questionsAnswered,
    0
  );
  // Timer progress
  const totalSeconds = durationMinutes * 60;
  const timerProgress = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 0;

  // Current question
  const currentQuestion = questions[currentQuestionIndex] || null;

  // ---------------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------------

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const endSprint = useCallback(() => {
    stopInterval();
    setIsRunning(false);

    // Record result
    const correct = answers.filter((a) => a.correct).length;
    const total = answers.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    const result: SprintResult = {
      id: generateId(),
      topic: topic || customTopic || "General",
      difficulty,
      durationMinutes,
      questionsAnswered: total,
      correctAnswers: correct,
      score: pct,
      completedAt: new Date().toISOString(),
    };

    const updated = [result, ...loadScores()].slice(0, 200);
    saveScores(updated);
    setScores(updated);

    // Update streak
    const today = getTodayKey();
    const current = loadStreak();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);

    let newCount = 1;
    if (current.lastDate === today) {
      newCount = current.count;
    } else if (current.lastDate === yesterdayKey) {
      newCount = current.count + 1;
    }
    const newStreak = { lastDate: today, count: newCount };
    saveStreak(newStreak);
    setStreak(newStreak);

    setPhase("review");
  }, [answers, topic, customTopic, difficulty, durationMinutes, stopInterval]);

  // Interval effect
  useEffect(() => {
    if (isRunning && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => stopInterval();
  }, [isRunning, stopInterval]);

  // Watch for zero
  useEffect(() => {
    if (secondsLeft === 0 && phase === "active" && isRunning) {
      endSprint();
    }
  }, [secondsLeft, phase, isRunning, endSprint]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const startSprint = () => {
    const activeTopic = topic || customTopic;
    if (!activeTopic.trim()) return;

    // Set up sample questions (the real flow uses AI via chat)
    setQuestions(SAMPLE_QUESTIONS.default);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setAnswers([]);
    setSecondsLeft(durationMinutes * 60);
    setIsRunning(true);
    setPhase("active");
  };

  const submitAnswer = () => {
    if (selectedAnswer === null || !currentQuestion) return;

    const isCorrect = selectedAnswer === currentQuestion.correctIndex;
    setAnswers((prev) => [
      ...prev,
      {
        questionId: currentQuestion.id,
        selectedIndex: selectedAnswer,
        correct: isCorrect,
      },
    ]);
    setShowExplanation(true);
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      // Loop back or end
      setCurrentQuestionIndex(0);
    }
    setSelectedAnswer(null);
    setShowExplanation(false);
  };

  const askAIForQuestions = () => {
    const activeTopic = topic || customTopic || "general knowledge";
    const msg = `Generate 10 ${difficulty} difficulty practice questions for ${activeTopic}. Format each as a multiple choice question with 4 options. Include the correct answer and a brief explanation for each. Make them progressively harder.`;
    window.dispatchEvent(
      new CustomEvent("open-chat", { detail: { message: msg } })
    );
  };

  const resetSprint = () => {
    stopInterval();
    setIsRunning(false);
    setPhase("setup");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setAnswers([]);
  };

  // ---------------------------------------------------------------------------
  // RENDER: SETUP PHASE
  // ---------------------------------------------------------------------------

  if (phase === "setup") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-white">Sprint Mode</h2>
          <p className="text-text-secondary text-sm mt-1">
            Quick timed challenges to sharpen your skills
          </p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-surface border border-border text-center">
            <p className="text-2xl font-bold text-white">{todayScores.length}</p>
            <p className="text-muted text-xs mt-1">Sprints Today</p>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border text-center">
            <p className="text-2xl font-bold text-white">{totalQuestionsToday}</p>
            <p className="text-muted text-xs mt-1">Questions</p>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border text-center">
            <p className="text-2xl font-bold text-accent">{streak.count}</p>
            <p className="text-muted text-xs mt-1">Day Streak</p>
          </div>
        </div>

        {/* Topic selection */}
        <div className="p-5 rounded-xl bg-surface border border-border space-y-4">
          <h3 className="text-white font-medium text-sm">Choose a Topic</h3>

          <div className="flex flex-wrap gap-2">
            {SUGGESTED_TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTopic(t);
                  setCustomTopic("");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  topic === t
                    ? "bg-accent/20 text-accent border-accent/40"
                    : "bg-surface-hover text-text-secondary hover:text-white border-transparent"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="relative">
            <input
              type="text"
              value={customTopic}
              onChange={(e) => {
                setCustomTopic(e.target.value);
                setTopic("");
              }}
              placeholder="Or type a custom topic..."
              className="w-full px-4 py-2.5 rounded-lg bg-bg border border-border text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        {/* Difficulty */}
        <div className="p-5 rounded-xl bg-surface border border-border space-y-4">
          <h3 className="text-white font-medium text-sm">Difficulty</h3>
          <div className="grid grid-cols-3 gap-3">
            {DIFFICULTY_OPTIONS.map((d) => (
              <button
                key={d.key}
                onClick={() => setDifficulty(d.key)}
                className={`p-3 rounded-xl text-center transition-all border ${
                  difficulty === d.key
                    ? d.color
                    : "bg-surface-hover text-text-secondary border-transparent hover:text-white"
                }`}
              >
                <span className="text-sm font-medium block">{d.label}</span>
                <span className="text-muted text-xs block mt-0.5">
                  {d.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="p-5 rounded-xl bg-surface border border-border space-y-4">
          <h3 className="text-white font-medium text-sm">Duration</h3>
          <div className="grid grid-cols-3 gap-3">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d.minutes}
                onClick={() => setDurationMinutes(d.minutes)}
                className={`p-3 rounded-xl text-center transition-all border ${
                  durationMinutes === d.minutes
                    ? "bg-accent/20 text-accent border-accent/40"
                    : "bg-surface-hover text-text-secondary border-transparent hover:text-white"
                }`}
              >
                <span className="text-lg font-bold block">{d.label}</span>
                <span className="text-muted text-xs block mt-0.5">
                  {d.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={startSprint}
          disabled={!topic && !customTopic.trim()}
          className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
        >
          {topic || customTopic.trim()
            ? `Start ${durationMinutes}-Minute Sprint`
            : "Choose a topic to begin"}
        </button>

        {/* Recent scores */}
        {scores.length > 0 && (
          <div className="p-5 rounded-xl bg-surface border border-border">
            <h3 className="text-white font-medium text-sm mb-4">
              Recent Sprints
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {scores.slice(0, 10).map((s) => {
                const grade = scoreGrade(s.score);
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-bg/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                          s.score >= 75
                            ? "bg-emerald-500/20 text-emerald-400"
                            : s.score >= 50
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {s.score}%
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-sm truncate">
                          {s.topic}
                        </p>
                        <p className="text-muted text-xs">
                          {s.difficulty} | {s.durationMinutes}m |{" "}
                          {s.correctAnswers}/{s.questionsAnswered} correct
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className={`text-xs font-medium ${grade.color}`}>
                        {grade.label}
                      </p>
                      <p className="text-muted text-xs">
                        {new Date(s.completedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: ACTIVE PHASE
  // ---------------------------------------------------------------------------

  if (phase === "active") {
    const correctSoFar = answers.filter((a) => a.correct).length;
    const totalAnswered = answers.length;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">
              {topic || customTopic}
            </h2>
            <p className="text-muted text-xs">
              {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} |{" "}
              {totalAnswered} answered | {correctSoFar} correct
            </p>
          </div>
          <button
            onClick={endSprint}
            className="px-4 py-2 rounded-xl bg-surface border border-border text-text-secondary hover:text-white text-xs transition-colors"
          >
            End Sprint
          </button>
        </div>

        {/* Timer */}
        <div className="flex justify-center">
          <div className="relative">
            <TimerRing progress={timerProgress} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-mono font-bold text-white">
                {formatTime(secondsLeft)}
              </span>
              <span className="text-muted text-xs mt-1">remaining</span>
            </div>
          </div>
        </div>

        {/* Score bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-surface-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{
                width: `${totalAnswered > 0 ? (correctSoFar / totalAnswered) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-muted text-xs shrink-0">
            {totalAnswered > 0
              ? `${Math.round((correctSoFar / totalAnswered) * 100)}%`
              : "0%"}
          </span>
        </div>

        {/* Question card */}
        {currentQuestion ? (
          <div className="p-6 rounded-xl bg-surface border border-border space-y-5">
            <div>
              <span className="text-muted text-xs">
                Question {totalAnswered + (showExplanation ? 0 : 1)}
              </span>
              <p className="text-white font-medium mt-2 leading-relaxed">
                {currentQuestion.question}
              </p>
            </div>

            {/* Options */}
            <div className="space-y-2">
              {currentQuestion.options.map((opt, idx) => {
                let optionClass =
                  "bg-surface-hover text-text-secondary hover:text-white border-transparent";

                if (showExplanation) {
                  if (idx === currentQuestion.correctIndex) {
                    optionClass =
                      "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
                  } else if (
                    idx === selectedAnswer &&
                    idx !== currentQuestion.correctIndex
                  ) {
                    optionClass =
                      "bg-red-500/20 text-red-400 border-red-500/40";
                  } else {
                    optionClass =
                      "bg-surface-hover text-muted border-transparent opacity-50";
                  }
                } else if (selectedAnswer === idx) {
                  optionClass =
                    "bg-accent/20 text-accent border-accent/40";
                }

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (!showExplanation) setSelectedAnswer(idx);
                    }}
                    disabled={showExplanation}
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all border ${optionClass}`}
                  >
                    <span className="font-medium mr-2 text-muted">
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>

            {/* Explanation */}
            {showExplanation && (
              <div className="p-4 rounded-lg bg-bg/50 text-text-secondary text-sm">
                {currentQuestion.explanation}
              </div>
            )}

            {/* Action button */}
            {showExplanation ? (
              <button
                onClick={nextQuestion}
                className="w-full py-3 rounded-xl bg-white text-black font-medium hover:bg-gray-200 transition-all text-sm"
              >
                Next Question
              </button>
            ) : (
              <button
                onClick={submitAnswer}
                disabled={selectedAnswer === null}
                className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
              >
                Submit Answer
              </button>
            )}
          </div>
        ) : (
          <div className="p-8 rounded-xl bg-surface border border-border text-center space-y-4">
            <p className="text-white font-medium">
              No questions loaded yet
            </p>
            <p className="text-muted text-sm">
              Ask the AI to generate practice questions for your topic
            </p>
          </div>
        )}

        {/* AI button */}
        <button
          onClick={askAIForQuestions}
          className="w-full py-3 rounded-xl bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors border border-accent/20"
        >
          Ask AI for Questions
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: REVIEW PHASE
  // ---------------------------------------------------------------------------

  if (phase === "review") {
    const correct = answers.filter((a) => a.correct).length;
    const total = answers.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const grade = scoreGrade(pct);

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center py-8 space-y-4">
          <div
            className={`inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-bold ${
              pct >= 75
                ? "bg-emerald-500/20 text-emerald-400"
                : pct >= 50
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-red-500/20 text-red-400"
            }`}
          >
            {pct}%
          </div>
          <h2 className="text-2xl font-bold text-white">Sprint Complete!</h2>
          <p className={`text-lg font-medium ${grade.color}`}>{grade.label}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-surface border border-border text-center">
            <p className="text-xl font-bold text-white">{total}</p>
            <p className="text-muted text-xs mt-1">Questions</p>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border text-center">
            <p className="text-xl font-bold text-emerald-400">{correct}</p>
            <p className="text-muted text-xs mt-1">Correct</p>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border text-center">
            <p className="text-xl font-bold text-red-400">{total - correct}</p>
            <p className="text-muted text-xs mt-1">Wrong</p>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border text-center">
            <p className="text-xl font-bold text-accent">{streak.count}</p>
            <p className="text-muted text-xs mt-1">Day Streak</p>
          </div>
        </div>

        {/* Topic info */}
        <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-medium">
              {topic || customTopic}
            </p>
            <p className="text-muted text-xs">
              {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} |{" "}
              {durationMinutes} minutes
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted text-xs">Score</p>
            <p className={`text-lg font-bold ${grade.color}`}>{pct}%</p>
          </div>
        </div>

        {/* Answer breakdown */}
        {answers.length > 0 && (
          <div className="p-5 rounded-xl bg-surface border border-border">
            <h3 className="text-white font-medium text-sm mb-3">
              Answer Breakdown
            </h3>
            <div className="flex gap-1.5 flex-wrap">
              {answers.map((a, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium ${
                    a.correct
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={resetSprint}
            className="flex-1 py-3 rounded-xl bg-surface border border-border text-text-secondary hover:text-white transition-colors text-sm"
          >
            New Sprint
          </button>
          <button
            onClick={() => {
              // Retry same topic
              setPhase("setup");
            }}
            className="flex-1 py-3 rounded-xl bg-white text-black font-medium hover:bg-gray-200 transition-all text-sm"
          >
            Try Again
          </button>
        </div>

        {/* AI follow-up */}
        <button
          onClick={() => {
            const activeTopic = topic || customTopic || "general";
            const msg = `I just finished a ${difficulty} ${durationMinutes}-minute sprint on ${activeTopic} and scored ${pct}% (${correct}/${total}). What topics should I review and how can I improve?`;
            window.dispatchEvent(
              new CustomEvent("open-chat", { detail: { message: msg } })
            );
          }}
          className="w-full py-3 rounded-xl bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors border border-accent/20"
        >
          Ask AI for Improvement Tips
        </button>
      </div>
    );
  }

  return null;
}
