"use client";

import { createClient } from "@/lib/supabase-client";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

// Types for the comprehensive study guide
interface LearningStep {
  order: number;
  topic: string;
  description: string;
  prerequisites: string[];
  youtube_search: string;
  khan_academy_topic: string;
  estimated_minutes: number;
}

interface SolutionStep {
  step: number;
  action: string;
  explanation: string;
}

interface WorkedExample {
  topic: string;
  problem: string;
  difficulty: "easy" | "medium" | "hard";
  solution_steps: SolutionStep[];
  final_answer: string;
}

interface TestQuestion {
  number: number;
  type: "multiple_choice" | "free_response" | "calculation";
  question: string;
  options?: string[];
  correct_answer: string;
  explanation: string;
  points: number;
  topic?: string;
}

interface PracticeTest {
  title: string;
  time_limit_minutes: number;
  instructions: string;
  questions: TestQuestion[];
}

interface ComprehensiveGuide {
  course: string;
  unit: string;
  overview: string;
  learning_path: LearningStep[];
  worked_examples: WorkedExample[];
  practice_test: PracticeTest;
  study_tips: string[];
}

interface Course {
  id: string;
  name: string;
  policies: { units?: string[]; } | null;
}

interface SavedGuide {
  id: string;
  unit: string | null;
  guide: ComprehensiveGuide;
  created_at: string;
  course_id: string | null;
}

type ViewState = "course" | "unit" | "generating" | "guide";
type GuideTab = "learn" | "examples" | "test";

export default function StudyPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [units, setUnits] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>("");
  const [customUnit, setCustomUnit] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [viewState, setViewState] = useState<ViewState>("course");
  const [activeTab, setActiveTab] = useState<GuideTab>("learn");

  const [guide, setGuide] = useState<ComprehensiveGuide | null>(null);
  const [history, setHistory] = useState<SavedGuide[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");

  // Learning path progress
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Worked examples state
  const [expandedExamples, setExpandedExamples] = useState<Set<number>>(new Set());
  const [revealedSteps, setRevealedSteps] = useState<Record<number, number>>({});

  // Practice test state
  const [testMode, setTestMode] = useState<"not_started" | "in_progress" | "submitted">("not_started");
  const [testAnswers, setTestAnswers] = useState<Record<number, string>>({});
  const [testScore, setTestScore] = useState<{ correct: number; total: number; points: number; maxPoints: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [coursesRes, guidesRes] = await Promise.all([
        supabase.from("courses").select("id, name, policies").eq("user_id", user.id),
        supabase.from("study_guides").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      ]);
      if (coursesRes.data) setCourses(coursesRes.data);
      if (guidesRes.data) setHistory(guidesRes.data);
      setPageLoading(false);
    };
    load();
  }, []);

  const selectCourse = (course: Course) => {
    setSelectedCourse(course);
    setUnits(course.policies?.units || []);
    setSelectedUnit("");
    setCustomUnit("");
    setViewState("unit");
  };

  const generateGuide = async () => {
    const unitToUse = selectedUnit || customUnit.trim();
    if (!selectedCourse || !unitToUse) {
      setError("Select or enter a unit/topic");
      return;
    }

    setLoading(true);
    setError("");
    setViewState("generating");
    resetGuideState();

    try {
      const result = await apiFetch<ComprehensiveGuide>("study-guide/comprehensive", {
        course: selectedCourse.name,
        unit: unitToUse,
        notes: customNotes,
      });

      // Save to DB
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("study_guides")
          .insert({
            user_id: user.id,
            course_id: selectedCourse.id,
            unit: unitToUse,
            guide: result,
          })
          .select()
          .single();
        if (data) {
          setHistory([data, ...history.slice(0, 9)]);
        }
      }

      setGuide(result);
      setViewState("guide");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setViewState("unit");
    } finally {
      setLoading(false);
    }
  };

  const resetGuideState = () => {
    setCompletedSteps(new Set());
    setExpandedExamples(new Set());
    setRevealedSteps({});
    setTestMode("not_started");
    setTestAnswers({});
    setTestScore(null);
    setActiveTab("learn");
  };

  const goBack = () => {
    if (viewState === "unit") {
      setViewState("course");
      setSelectedCourse(null);
    } else if (viewState === "guide") {
      setViewState("unit");
      setGuide(null);
    }
  };

  const loadFromHistory = (h: SavedGuide) => {
    setGuide(h.guide);
    setViewState("guide");
    resetGuideState();
    const course = courses.find(c => c.id === h.course_id);
    if (course) setSelectedCourse(course);
    setSelectedUnit(h.unit || "");
  };

  const toggleStep = (order: number) => {
    const s = new Set(completedSteps);
    if (s.has(order)) s.delete(order); else s.add(order);
    setCompletedSteps(s);
  };

  const toggleExample = (i: number) => {
    const s = new Set(expandedExamples);
    if (s.has(i)) s.delete(i); else s.add(i);
    setExpandedExamples(s);
  };

  const revealNextStep = (exampleIndex: number, totalSteps: number) => {
    const current = revealedSteps[exampleIndex] || 0;
    if (current < totalSteps) {
      setRevealedSteps({ ...revealedSteps, [exampleIndex]: current + 1 });
    }
  };

  const submitTest = () => {
    if (!guide?.practice_test) return;

    let correct = 0;
    let points = 0;
    const maxPoints = guide.practice_test.questions.reduce((sum, q) => sum + q.points, 0);

    guide.practice_test.questions.forEach((q) => {
      const userAnswer = (testAnswers[q.number] || "").trim().toLowerCase();
      const correctAnswer = q.correct_answer.toLowerCase();

      // For multiple choice, check if they selected the right letter
      if (q.type === "multiple_choice") {
        const letterMatch = userAnswer.match(/^([a-d])/i);
        const correctLetter = correctAnswer.match(/^([a-d])/i);
        if (letterMatch && correctLetter && letterMatch[1] === correctLetter[1]) {
          correct++;
          points += q.points;
        }
      } else {
        // For other types, check if answer contains key parts
        if (userAnswer && correctAnswer.includes(userAnswer.substring(0, 20))) {
          correct++;
          points += q.points;
        }
      }
    });

    setTestScore({ correct, total: guide.practice_test.questions.length, points, maxPoints });
    setTestMode("submitted");
  };

  if (pageLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-8 w-32 bg-bg-card rounded animate-pulse" />
        <div className="h-48 bg-bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="max-w-3xl space-y-6">
        <h2 className="text-2xl font-bold text-white">Study</h2>
        <div className="p-8 rounded-xl bg-bg-card border border-border text-center">
          <p className="text-text-muted">
            Sync your assignments from Teamie first to see your courses here.
          </p>
        </div>
      </div>
    );
  }

  const inputClass = "px-3 py-2.5 rounded-lg bg-bg-dark border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm";

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Study Guide Builder</h2>
          {viewState !== "course" && selectedCourse && (
            <div className="flex items-center gap-2 text-sm text-text-muted mt-1">
              <button onClick={() => { setViewState("course"); setSelectedCourse(null); }} className="hover:text-accent cursor-pointer">
                Courses
              </button>
              <span>→</span>
              <span className="text-white">{selectedCourse.name}</span>
              {(selectedUnit || customUnit) && viewState === "guide" && (
                <>
                  <span>→</span>
                  <span className="text-accent">{selectedUnit || customUnit}</span>
                </>
              )}
            </div>
          )}
        </div>
        {viewState !== "course" && viewState !== "generating" && (
          <button
            onClick={goBack}
            className="px-3 py-1.5 rounded-lg bg-bg-card border border-border text-text-secondary text-sm hover:text-white transition-colors cursor-pointer"
          >
            ← Back
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-error/10 text-error text-sm">{error}</div>
      )}

      {/* Step 1: Select Course */}
      {viewState === "course" && (
        <div className="space-y-4">
          <p className="text-text-secondary">Choose a course to create a comprehensive study guide:</p>
          <div className="grid gap-3">
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCourse(c)}
                className="p-4 rounded-xl bg-bg-card border border-border hover:border-accent/40 transition-colors text-left cursor-pointer"
              >
                <span className="text-white font-medium">{c.name}</span>
                {c.policies?.units && c.policies.units.length > 0 && (
                  <p className="text-text-muted text-xs mt-1">
                    {c.policies.units.length} units available
                  </p>
                )}
              </button>
            ))}
          </div>

          {history.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-text-secondary mb-3">Recent Study Guides</h3>
              <div className="space-y-2">
                {history.slice(0, 5).map((h) => (
                  <button
                    key={h.id}
                    onClick={() => loadFromHistory(h)}
                    className="w-full text-left p-3 rounded-lg bg-bg-card border border-border hover:border-accent/20 transition-colors cursor-pointer"
                  >
                    <p className="text-white text-sm font-medium truncate">{h.guide?.unit || h.unit || "General"}</p>
                    <p className="text-text-muted text-xs mt-0.5">
                      {new Date(h.created_at).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Select Unit & Generate */}
      {viewState === "unit" && selectedCourse && (
        <div className="space-y-4">
          <p className="text-text-secondary">What topic or unit do you want to master?</p>

          {units.length > 0 && (
            <div className="grid gap-2">
              {units.map((u, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedUnit(u)}
                  className={`p-3 rounded-lg border transition-colors text-left cursor-pointer ${
                    selectedUnit === u
                      ? "bg-accent/10 border-accent/40 text-accent"
                      : "bg-bg-card border-border hover:border-accent/20 text-white"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          )}

          <div className="pt-2">
            <label className="text-text-secondary text-sm block mb-2">Or enter a custom topic:</label>
            <input
              type="text"
              placeholder="e.g., Unit 1: One Variable Statistics"
              value={customUnit}
              onChange={(e) => { setCustomUnit(e.target.value); setSelectedUnit(""); }}
              className={`w-full ${inputClass}`}
            />
          </div>

          <div className="pt-2">
            <label className="text-text-secondary text-sm block mb-2">Any areas you&apos;re struggling with? (optional)</label>
            <textarea
              placeholder="e.g., I don't understand standard deviation, confused about when to use mean vs median..."
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              rows={3}
              className={`w-full ${inputClass} resize-none`}
            />
          </div>

          <button
            onClick={generateGuide}
            disabled={loading || (!selectedUnit && !customUnit.trim())}
            className="w-full py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            Generate Comprehensive Study Guide
          </button>

          <p className="text-text-muted text-xs text-center">
            Includes: Learning path with videos, worked examples, and a practice test
          </p>
        </div>
      )}

      {/* Generating State */}
      {viewState === "generating" && (
        <div className="p-12 rounded-xl bg-bg-card border border-border text-center">
          <div className="animate-spin w-12 h-12 border-4 border-accent border-t-transparent rounded-full mx-auto mb-4" />
          <h3 className="text-white font-semibold text-lg mb-2">Building Your Study Guide</h3>
          <p className="text-text-muted text-sm">
            Creating learning path, worked examples, and practice test...
          </p>
        </div>
      )}

      {/* Step 3: Display Guide */}
      {viewState === "guide" && guide && (
        <div className="space-y-5">
          {/* Overview Card */}
          <div className="p-5 rounded-xl bg-gradient-to-br from-accent/10 to-bg-card border border-accent/20">
            <h3 className="text-xl font-bold text-white mb-2">{guide.unit}</h3>
            <p className="text-text-secondary text-sm leading-relaxed">{guide.overview}</p>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-border">
            {[
              { id: "learn" as const, label: "Learn", icon: "📚", count: guide.learning_path?.length },
              { id: "examples" as const, label: "Practice", icon: "✍️", count: guide.worked_examples?.length },
              { id: "test" as const, label: "Test", icon: "📝", count: guide.practice_test?.questions?.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? "text-accent border-b-2 border-accent"
                    : "text-text-muted hover:text-white"
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
                {tab.count && <span className="ml-1 text-xs">({tab.count})</span>}
              </button>
            ))}
          </div>

          {/* Learn Tab - Learning Path */}
          {activeTab === "learn" && guide.learning_path && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-text-secondary">Learning Path</h4>
                <span className="text-xs text-text-muted">
                  {completedSteps.size}/{guide.learning_path.length} completed
                </span>
              </div>

              <div className="space-y-3">
                {guide.learning_path.map((step, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-xl border transition-all ${
                      completedSteps.has(step.order)
                        ? "bg-success/5 border-success/30"
                        : "bg-bg-card border-border"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => toggleStep(step.order)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 cursor-pointer ${
                          completedSteps.has(step.order)
                            ? "bg-success border-success text-white"
                            : "border-border hover:border-accent"
                        }`}
                      >
                        {completedSteps.has(step.order) && "✓"}
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-accent font-medium">Step {step.order}</span>
                          <span className="text-xs text-text-muted">• {step.estimated_minutes} min</span>
                        </div>
                        <h5 className="text-white font-medium">{step.topic}</h5>
                        <p className="text-text-secondary text-sm mt-1">{step.description}</p>

                        {/* Resource Links */}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {step.youtube_search && (
                            <a
                              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(step.youtube_search)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors"
                            >
                              <span>▶</span> YouTube
                            </a>
                          )}
                          {step.khan_academy_topic && (
                            <a
                              href={`https://www.khanacademy.org/search?search_again=1&page_search_query=${encodeURIComponent(step.khan_academy_topic)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors"
                            >
                              <span>🎓</span> Khan Academy
                            </a>
                          )}
                        </div>

                        {step.prerequisites.length > 0 && (
                          <p className="text-text-muted text-xs mt-2">
                            Prerequisites: {step.prerequisites.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Study Tips */}
              {guide.study_tips && guide.study_tips.length > 0 && (
                <div className="p-4 rounded-xl bg-bg-card border border-border mt-4">
                  <h5 className="text-sm font-semibold text-text-secondary mb-2">Study Tips</h5>
                  <ul className="space-y-1">
                    {guide.study_tips.map((tip, i) => (
                      <li key={i} className="text-text-muted text-sm flex items-start gap-2">
                        <span className="text-accent">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Examples Tab - Worked Examples */}
          {activeTab === "examples" && guide.worked_examples && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-text-secondary">Worked Examples</h4>
              <p className="text-text-muted text-xs">Click to expand each problem, then reveal steps one at a time</p>

              <div className="space-y-3">
                {guide.worked_examples.map((ex, i) => (
                  <div key={i} className="rounded-xl border border-border overflow-hidden">
                    <button
                      onClick={() => toggleExample(i)}
                      className="w-full p-4 bg-bg-card text-left flex items-center justify-between cursor-pointer hover:bg-bg-card/80 transition-colors"
                    >
                      <div>
                        <span className={`text-xs px-2 py-0.5 rounded mr-2 ${
                          ex.difficulty === "easy" ? "bg-green-500/20 text-green-400" :
                          ex.difficulty === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-red-500/20 text-red-400"
                        }`}>
                          {ex.difficulty}
                        </span>
                        <span className="text-text-muted text-xs">{ex.topic}</span>
                        <p className="text-white text-sm mt-1">{ex.problem}</p>
                      </div>
                      <span className="text-text-muted">{expandedExamples.has(i) ? "▼" : "▶"}</span>
                    </button>

                    {expandedExamples.has(i) && (
                      <div className="p-4 bg-bg-dark border-t border-border">
                        <div className="space-y-3">
                          {ex.solution_steps.slice(0, revealedSteps[i] || 0).map((step, si) => (
                            <div key={si} className="p-3 rounded-lg bg-bg-card border border-border">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-medium">
                                  {step.step}
                                </span>
                                <span className="text-white text-sm font-medium">{step.action}</span>
                              </div>
                              <p className="text-text-secondary text-sm ml-8">{step.explanation}</p>
                            </div>
                          ))}

                          {(revealedSteps[i] || 0) < ex.solution_steps.length ? (
                            <button
                              onClick={() => revealNextStep(i, ex.solution_steps.length)}
                              className="w-full py-2 rounded-lg border border-accent/30 text-accent text-sm font-medium hover:bg-accent/10 transition-colors cursor-pointer"
                            >
                              Reveal Step {(revealedSteps[i] || 0) + 1}
                            </button>
                          ) : (
                            <div className="p-3 rounded-lg bg-success/10 border border-success/30">
                              <span className="text-success text-sm font-medium">Final Answer: </span>
                              <span className="text-white text-sm">{ex.final_answer}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test Tab - Practice Test */}
          {activeTab === "test" && guide.practice_test && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-bg-card border border-border">
                <h4 className="text-white font-semibold">{guide.practice_test.title}</h4>
                <p className="text-text-muted text-sm mt-1">{guide.practice_test.instructions}</p>
                <div className="flex gap-4 mt-2 text-xs text-text-secondary">
                  <span>⏱ {guide.practice_test.time_limit_minutes} minutes</span>
                  <span>📝 {guide.practice_test.questions.length} questions</span>
                </div>
              </div>

              {testMode === "not_started" && (
                <button
                  onClick={() => setTestMode("in_progress")}
                  className="w-full py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold transition-colors cursor-pointer"
                >
                  Start Practice Test
                </button>
              )}

              {testMode === "submitted" && testScore && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-accent/20 to-success/20 border border-accent/30">
                  <h4 className="text-white font-semibold text-lg">Test Complete!</h4>
                  <div className="flex gap-6 mt-2">
                    <div>
                      <span className="text-3xl font-bold text-accent">{testScore.correct}</span>
                      <span className="text-text-muted">/{testScore.total} correct</span>
                    </div>
                    <div>
                      <span className="text-3xl font-bold text-success">{testScore.points}</span>
                      <span className="text-text-muted">/{testScore.maxPoints} points</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setTestMode("not_started"); setTestAnswers({}); setTestScore(null); }}
                    className="mt-3 px-4 py-2 rounded-lg bg-bg-dark border border-border text-text-secondary text-sm hover:text-white transition-colors cursor-pointer"
                  >
                    Retake Test
                  </button>
                </div>
              )}

              {(testMode === "in_progress" || testMode === "submitted") && (
                <div className="space-y-4">
                  {guide.practice_test.questions.map((q) => (
                    <div
                      key={q.number}
                      className={`p-4 rounded-xl border ${
                        testMode === "submitted"
                          ? testAnswers[q.number]?.toLowerCase().startsWith(q.correct_answer.charAt(0).toLowerCase())
                            ? "bg-success/5 border-success/30"
                            : "bg-error/5 border-error/30"
                          : "bg-bg-card border-border"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-text-muted text-sm font-medium">{q.number}.</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs px-2 py-0.5 rounded bg-bg-dark text-text-muted">
                              {q.type.replace("_", " ")}
                            </span>
                            <span className="text-xs text-text-muted">{q.points} pts</span>
                          </div>
                          <p className="text-white text-sm mb-3">{q.question}</p>

                          {q.type === "multiple_choice" && q.options && (
                            <div className="space-y-2">
                              {q.options.map((opt, oi) => (
                                <label
                                  key={oi}
                                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                                    testMode === "submitted"
                                      ? opt.charAt(0).toLowerCase() === q.correct_answer.charAt(0).toLowerCase()
                                        ? "bg-success/20 border border-success/40"
                                        : testAnswers[q.number] === opt.charAt(0)
                                          ? "bg-error/20 border border-error/40"
                                          : "bg-bg-dark"
                                      : testAnswers[q.number] === opt.charAt(0)
                                        ? "bg-accent/20 border border-accent/40"
                                        : "bg-bg-dark hover:bg-bg-dark/80"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`q-${q.number}`}
                                    value={opt.charAt(0)}
                                    checked={testAnswers[q.number] === opt.charAt(0)}
                                    onChange={(e) => setTestAnswers({ ...testAnswers, [q.number]: e.target.value })}
                                    disabled={testMode === "submitted"}
                                    className="accent-accent"
                                  />
                                  <span className="text-white text-sm">{opt}</span>
                                </label>
                              ))}
                            </div>
                          )}

                          {q.type !== "multiple_choice" && (
                            <textarea
                              placeholder="Your answer..."
                              value={testAnswers[q.number] || ""}
                              onChange={(e) => setTestAnswers({ ...testAnswers, [q.number]: e.target.value })}
                              disabled={testMode === "submitted"}
                              rows={2}
                              className={`w-full ${inputClass} resize-none`}
                            />
                          )}

                          {testMode === "submitted" && (
                            <div className="mt-3 p-3 rounded-lg bg-bg-dark">
                              <p className="text-success text-sm"><strong>Correct:</strong> {q.correct_answer}</p>
                              <p className="text-text-muted text-sm mt-1">{q.explanation}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {testMode === "in_progress" && (
                    <button
                      onClick={submitTest}
                      className="w-full py-3 rounded-lg bg-success hover:bg-success/80 text-white font-semibold transition-colors cursor-pointer"
                    >
                      Submit Test
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 border-t border-border flex gap-3">
            <button
              onClick={() => { setViewState("unit"); setGuide(null); }}
              className="flex-1 py-2.5 rounded-lg bg-bg-card border border-border text-white font-medium hover:border-accent/30 transition-colors cursor-pointer"
            >
              New Guide
            </button>
            <button
              onClick={() => { setViewState("course"); setSelectedCourse(null); setGuide(null); }}
              className="flex-1 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors cursor-pointer"
            >
              Different Course
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
