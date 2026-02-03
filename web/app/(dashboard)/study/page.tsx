"use client";

import { createClient } from "@/lib/supabase-client";
import { apiFetch } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";

// Types for deep-scraped materials
interface ScrapedUnit {
  number?: number;
  name: string;
  fullName?: string;
  description?: string;
  objectives?: string[];
}

interface ScrapedLesson {
  name: string;
  lessonId?: string;
  href?: string;
  pageCount?: number;
  unitNumber?: number;
}

interface ScrapedResource {
  type: string;
  name?: string;
  url?: string;
  fileId?: string;
  videoId?: string;
}

interface ScrapedAssignment {
  pageId?: string;
  lessonId?: string;
  title?: string;
  instructions?: string;
  dueDate?: string;
  resources?: ScrapedResource[];
}

interface CourseMaterial {
  id: string;
  course_id: string;
  course_name: string;
  units: ScrapedUnit[];
  lessons: ScrapedLesson[];
  resources: ScrapedResource[];
  assignments: ScrapedAssignment[];
  extracted_content: Array<{ source_id: string; title: string; preview?: string }>;
  last_sync: string;
}

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
}

interface SavedGuide {
  id: string;
  unit: string | null;
  guide: ComprehensiveGuide;
  created_at: string;
  course_id: string | null;
}

type ViewState = "course" | "materials" | "unit" | "generating" | "guide";
type GuideTab = "learn" | "examples" | "test";

export default function StudyPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [courseMaterial, setCourseMaterial] = useState<CourseMaterial | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<ScrapedUnit | null>(null);
  const [customNotes, setCustomNotes] = useState("");
  const [viewState, setViewState] = useState<ViewState>("course");
  const [activeTab, setActiveTab] = useState<GuideTab>("learn");

  const [guide, setGuide] = useState<ComprehensiveGuide | null>(null);
  const [history, setHistory] = useState<SavedGuide[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState("");

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
        supabase.from("courses").select("id, name").eq("user_id", user.id),
        supabase.from("study_guides").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      ]);
      if (coursesRes.data) setCourses(coursesRes.data);
      if (guidesRes.data) setHistory(guidesRes.data);
      setPageLoading(false);
    };
    load();
  }, []);

  const loadCourseMaterials = useCallback(async (course: Course) => {
    setSelectedCourse(course);
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      // Try to find materials by matching course name
      const { data } = await supabase
        .from("course_materials")
        .select("*")
        .ilike("course_name", `%${course.name.split(" ")[0]}%`)
        .order("last_sync", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setCourseMaterial(data[0]);
        setViewState("materials");
      } else {
        // No materials yet - show empty state
        setCourseMaterial(null);
        setViewState("materials");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load materials");
    } finally {
      setLoading(false);
    }
  }, []);

  const selectUnit = (unit: ScrapedUnit) => {
    setSelectedUnit(unit);
    setViewState("unit");
  };

  const generateGuide = async () => {
    if (!selectedCourse || !selectedUnit) {
      setError("Select a unit first");
      return;
    }

    setLoading(true);
    setError("");
    setViewState("generating");
    resetGuideState();

    try {
      // Gather ALL real content for this unit
      const unitNumber = selectedUnit.number;

      // Get assignments for this unit
      const unitAssignments = courseMaterial?.assignments?.filter(a => {
        // Match by lesson ID or by title containing unit info
        return a.title?.toLowerCase().includes(`unit ${unitNumber}`) ||
               a.title?.toLowerCase().includes(selectedUnit.name.toLowerCase());
      }) || [];

      // Get resources for this unit
      const unitResources = courseMaterial?.resources?.filter(r => {
        return r.name?.toLowerCase().includes(`unit ${unitNumber}`) ||
               r.name?.toLowerCase().includes(selectedUnit.name.toLowerCase());
      }) || [];

      // Get lessons for this unit
      const unitLessons = courseMaterial?.lessons?.filter(l =>
        l.unitNumber === unitNumber ||
        l.name?.toLowerCase().includes(`unit ${unitNumber}`) ||
        l.name?.toLowerCase().includes(selectedUnit.name.toLowerCase())
      ) || [];

      // Build the comprehensive request with REAL content
      const result = await apiFetch<ComprehensiveGuide>("study-guide/comprehensive", {
        course: selectedCourse.name,
        unit: selectedUnit.fullName || selectedUnit.name,
        notes: customNotes,
        // NEW: Send real scraped content
        unit_description: selectedUnit.description || "",
        unit_objectives: selectedUnit.objectives || [],
        assignment_instructions: unitAssignments.map(a => ({
          title: a.title,
          instructions: a.instructions,
          dueDate: a.dueDate,
        })),
        resources: [
          ...unitResources,
          ...(courseMaterial?.resources || []).slice(0, 10), // Include some general resources too
        ],
        materials: unitLessons.map(l => ({
          name: l.name,
          type: "lesson",
          pageCount: l.pageCount,
        })),
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
            unit: selectedUnit.fullName || selectedUnit.name,
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
    if (viewState === "materials") {
      setViewState("course");
      setSelectedCourse(null);
      setCourseMaterial(null);
    } else if (viewState === "unit") {
      setViewState("materials");
      setSelectedUnit(null);
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

      if (q.type === "multiple_choice") {
        const letterMatch = userAnswer.match(/^([a-d])/i);
        const correctLetter = correctAnswer.match(/^([a-d])/i);
        if (letterMatch && correctLetter && letterMatch[1] === correctLetter[1]) {
          correct++;
          points += q.points;
        }
      } else {
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
      <div className="max-w-4xl space-y-4">
        <div className="h-8 w-32 bg-bg-card rounded animate-pulse" />
        <div className="h-48 bg-bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="max-w-4xl space-y-6">
        <h2 className="text-2xl font-bold text-white">Study Guide Builder</h2>
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
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Study Guide Builder</h2>
          <p className="text-text-muted text-sm mt-1">
            AI-powered guides built from your actual course materials
          </p>
          {viewState !== "course" && selectedCourse && (
            <div className="flex items-center gap-2 text-sm text-text-muted mt-2">
              <button onClick={() => { setViewState("course"); setSelectedCourse(null); }} className="hover:text-accent cursor-pointer">
                Courses
              </button>
              <span>→</span>
              <span className="text-white">{selectedCourse.name}</span>
              {selectedUnit && viewState !== "materials" && (
                <>
                  <span>→</span>
                  <span className="text-accent">{selectedUnit.name}</span>
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

      {syncStatus && (
        <div className="p-3 rounded-lg bg-accent/10 text-accent text-sm">{syncStatus}</div>
      )}

      {/* Step 1: Select Course */}
      {viewState === "course" && (
        <div className="space-y-4">
          <p className="text-text-secondary">Choose a course to build a study guide:</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => loadCourseMaterials(c)}
                disabled={loading}
                className="p-4 rounded-xl bg-bg-card border border-border hover:border-accent/40 transition-colors text-left cursor-pointer disabled:opacity-50"
              >
                <span className="text-white font-medium">{c.name}</span>
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

      {/* Step 2: View Course Materials */}
      {viewState === "materials" && selectedCourse && (
        <div className="space-y-6">
          {/* Materials Overview */}
          {courseMaterial ? (
            <>
              {/* Stats Bar */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-accent/10 to-success/10 border border-accent/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-semibold">Course Materials Loaded</h3>
                    <p className="text-text-muted text-sm mt-1">
                      Last synced: {new Date(courseMaterial.last_sync).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-accent">{courseMaterial.units?.length || 0}</div>
                      <div className="text-xs text-text-muted">Units</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-success">{courseMaterial.assignments?.length || 0}</div>
                      <div className="text-xs text-text-muted">Assignments</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-warning">{courseMaterial.resources?.length || 0}</div>
                      <div className="text-xs text-text-muted">Resources</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Units List */}
              <div>
                <h4 className="text-sm font-semibold text-text-secondary mb-3">Select a Unit to Study</h4>
                <div className="grid gap-3">
                  {courseMaterial.units?.length > 0 ? (
                    courseMaterial.units.map((unit, i) => (
                      <button
                        key={i}
                        onClick={() => selectUnit(unit)}
                        className="p-4 rounded-xl bg-bg-card border border-border hover:border-accent/40 transition-all text-left cursor-pointer group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h5 className="text-white font-medium group-hover:text-accent transition-colors">
                              {unit.fullName || unit.name}
                            </h5>
                            {unit.description && (
                              <p className="text-text-muted text-sm mt-2 line-clamp-2">
                                {unit.description.substring(0, 200)}...
                              </p>
                            )}
                            {unit.objectives && unit.objectives.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {unit.objectives.slice(0, 3).map((obj, oi) => (
                                  <span key={oi} className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs">
                                    {obj.length > 30 ? obj.substring(0, 30) + "..." : obj}
                                  </span>
                                ))}
                                {unit.objectives.length > 3 && (
                                  <span className="text-text-muted text-xs">+{unit.objectives.length - 3} more</span>
                                )}
                              </div>
                            )}
                          </div>
                          <span className="text-text-muted group-hover:text-accent transition-colors">→</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 rounded-xl bg-bg-card border border-border text-center">
                      <p className="text-text-muted">No units found. Scrape the course materials page on Teamie first.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Resources Preview */}
              {courseMaterial.resources?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-text-secondary mb-3">Available Resources</h4>
                  <div className="flex flex-wrap gap-2">
                    {courseMaterial.resources.slice(0, 12).map((r, i) => (
                      <span
                        key={i}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                          r.type === "google_drive" ? "bg-blue-500/10 text-blue-400" :
                          r.type === "youtube" ? "bg-red-500/10 text-red-400" :
                          r.type === "khan_academy" ? "bg-green-500/10 text-green-400" :
                          "bg-bg-card text-text-muted border border-border"
                        }`}
                      >
                        {r.type === "youtube" && "▶ "}
                        {r.type === "google_drive" && "📄 "}
                        {r.name || r.type}
                      </span>
                    ))}
                    {courseMaterial.resources.length > 12 && (
                      <span className="px-3 py-1.5 text-text-muted text-xs">
                        +{courseMaterial.resources.length - 12} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 rounded-xl bg-bg-card border border-border text-center">
              <div className="text-4xl mb-4">📚</div>
              <h3 className="text-white font-semibold mb-2">No Course Materials Yet</h3>
              <p className="text-text-muted text-sm mb-4">
                To build accurate study guides, we need to scan your course materials from Teamie.
              </p>
              <div className="p-4 rounded-lg bg-bg-dark border border-border text-left max-w-md mx-auto">
                <p className="text-white text-sm font-medium mb-2">How to scan:</p>
                <ol className="text-text-muted text-sm space-y-1 list-decimal list-inside">
                  <li>Go to your course on Teamie</li>
                  <li>Navigate to the Course Materials section</li>
                  <li>Click &quot;Sync&quot; in the SchoolPilot extension</li>
                  <li>Return here to generate study guides</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Unit Details & Generate */}
      {viewState === "unit" && selectedUnit && (
        <div className="space-y-6">
          {/* Unit Header */}
          <div className="p-5 rounded-xl bg-gradient-to-br from-accent/10 to-bg-card border border-accent/20">
            <h3 className="text-xl font-bold text-white">{selectedUnit.fullName || selectedUnit.name}</h3>
            {selectedUnit.description && (
              <p className="text-text-secondary text-sm mt-2 leading-relaxed">
                {selectedUnit.description}
              </p>
            )}
          </div>

          {/* Learning Objectives */}
          {selectedUnit.objectives && selectedUnit.objectives.length > 0 && (
            <div className="p-4 rounded-xl bg-bg-card border border-border">
              <h4 className="text-sm font-semibold text-text-secondary mb-3">Learning Objectives</h4>
              <ul className="space-y-2">
                {selectedUnit.objectives.map((obj, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-success mt-0.5">✓</span>
                    <span className="text-white">{obj}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Related Assignments */}
          {courseMaterial?.assignments && courseMaterial.assignments.length > 0 && (
            <div className="p-4 rounded-xl bg-bg-card border border-border">
              <h4 className="text-sm font-semibold text-text-secondary mb-3">
                Related Assignments ({courseMaterial.assignments.length})
              </h4>
              <div className="space-y-2">
                {courseMaterial.assignments.slice(0, 5).map((a, i) => (
                  <div key={i} className="p-3 rounded-lg bg-bg-dark border border-border">
                    <p className="text-white text-sm font-medium">{a.title || "Untitled Assignment"}</p>
                    {a.dueDate && (
                      <p className="text-text-muted text-xs mt-1">Due: {a.dueDate}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Notes */}
          <div>
            <label className="text-text-secondary text-sm block mb-2">
              Any areas you&apos;re struggling with? (optional)
            </label>
            <textarea
              placeholder="e.g., I don't understand conditional probability, confused about when to use tree diagrams vs Venn diagrams..."
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              rows={3}
              className={`w-full ${inputClass} resize-none`}
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={generateGuide}
            disabled={loading}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent text-white font-semibold text-lg transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-accent/20"
          >
            Generate Comprehensive Study Guide
          </button>

          <p className="text-text-muted text-xs text-center">
            Built from your actual course materials: unit objectives, assignments, and resources
          </p>
        </div>
      )}

      {/* Generating State */}
      {viewState === "generating" && (
        <div className="p-12 rounded-xl bg-bg-card border border-border text-center">
          <div className="animate-spin w-12 h-12 border-4 border-accent border-t-transparent rounded-full mx-auto mb-4" />
          <h3 className="text-white font-semibold text-lg mb-2">Building Your Study Guide</h3>
          <p className="text-text-muted text-sm">
            Analyzing your course materials, unit objectives, and assignments...
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {["📚 Reading materials", "🎯 Mapping objectives", "✍️ Creating problems", "📝 Building test"].map((step, i) => (
              <span key={i} className="px-3 py-1 rounded-full bg-bg-dark text-text-muted text-xs">
                {step}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Display Guide */}
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

          {/* Learn Tab */}
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

          {/* Examples Tab */}
          {activeTab === "examples" && guide.worked_examples && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-text-secondary">Worked Examples</h4>
              <p className="text-text-muted text-xs">Click to expand, then reveal steps one at a time</p>

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

          {/* Test Tab */}
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
              onClick={() => { setViewState("materials"); setSelectedUnit(null); setGuide(null); }}
              className="flex-1 py-2.5 rounded-lg bg-bg-card border border-border text-white font-medium hover:border-accent/30 transition-colors cursor-pointer"
            >
              Different Unit
            </button>
            <button
              onClick={() => { setViewState("course"); setSelectedCourse(null); setGuide(null); setCourseMaterial(null); }}
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
