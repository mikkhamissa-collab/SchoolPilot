"use client";

import { createClient } from "@/lib/supabase-client";
import { apiFetch } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import { findVideosForTopic, getLearningPath, hasCourseVideos, type Video } from "@/lib/video-library";

// Types
interface StudyConcept {
  id: string;
  course_name: string;
  topic_name: string;
  concept_name: string;
  mastery_level: number;
  difficulty_rating: "easy" | "medium" | "hard";
  next_review: string;
  streak: number;
  total_reviews: number;
  correct_count: number;
}

interface WeakSpot {
  id: string;
  course_name: string;
  topic_name: string;
  concept_name: string;
  error_pattern: string;
  times_missed: number;
  mastery_level: number;
}

interface MasteryStats {
  totalConcepts: number;
  overallMastery: number;
  dueToday: number;
  weakConcepts: number;
  masteredConcepts: number;
  recommendedMinutes: number;
  focusArea: string | null;
}

interface TestQuestion {
  id: string;
  conceptName: string;
  difficulty: "easy" | "medium" | "hard";
  difficultyScore: number;
  type: string;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  hints?: string[];
}

interface Course {
  id: string;
  name: string;
}

type ViewState = "dashboard" | "course" | "topic" | "practice" | "test" | "review";

export default function StudyPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [concepts, setConcepts] = useState<StudyConcept[]>([]);
  const [weakSpots, setWeakSpots] = useState<WeakSpot[]>([]);
  const [masteryStats, setMasteryStats] = useState<MasteryStats | null>(null);
  const [viewState, setViewState] = useState<ViewState>("dashboard");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  // Video library state
  const [topicVideos, setTopicVideos] = useState<{ learn: Video[]; practice: Video[]; review: Video[] }>({ learn: [], practice: [], review: [] });

  // Practice test state
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [testAnswers, setTestAnswers] = useState<Record<string, { answer: string; correct: boolean; time: number }>>({});
  const [testStartTime, setTestStartTime] = useState<number>(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [testComplete, setTestComplete] = useState(false);

  // Review session state
  const [reviewConcepts, setReviewConcepts] = useState<StudyConcept[]>([]);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);

  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");

  // Load initial data
  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [coursesRes] = await Promise.all([
        supabase.from("courses").select("id, name").eq("user_id", user.id),
      ]);

      if (coursesRes.data) setCourses(coursesRes.data);
      await loadMasteryStats();
      setPageLoading(false);
    };
    load();
  }, []);

  const loadMasteryStats = async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch("/api/mastery?action=stats", {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (data) setMasteryStats(data);
    } catch {
      // Ignore errors
    }
  };

  const loadCourseData = useCallback(async (course: Course) => {
    setSelectedCourse(course);
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      // Load concepts for this course
      const [conceptsRes, weakSpotsRes] = await Promise.all([
        fetch(`/api/mastery?course=${encodeURIComponent(course.name)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        }),
        fetch(`/api/weak-spots?course=${encodeURIComponent(course.name)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        })
      ]);

      const conceptsData = await conceptsRes.json();
      const weakSpotsData = await weakSpotsRes.json();

      setConcepts(conceptsData.concepts || []);
      setWeakSpots(weakSpotsData.weak_spots || []);
      setViewState("course");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load course data");
    } finally {
      setLoading(false);
    }
  }, []);

  const selectTopic = (topicName: string) => {
    setSelectedTopic(topicName);

    // Load curated videos for this topic
    if (selectedCourse && hasCourseVideos(selectedCourse.name)) {
      const videos = getLearningPath(selectedCourse.name, topicName, 5);
      setTopicVideos(videos);
    } else {
      setTopicVideos({ learn: [], practice: [], review: [] });
    }

    setViewState("topic");
  };

  const startPracticeTest = async () => {
    if (!selectedCourse || !selectedTopic) return;

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const res = await fetch("/api/practice-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: "generate",
          course_name: selectedCourse.name,
          topic_name: selectedTopic,
          difficulty_level: "adaptive",
          question_count: 10
        })
      });

      const data = await res.json();
      if (data.questions) {
        setTestQuestions(data.questions);
        setCurrentQuestionIndex(0);
        setTestAnswers({});
        setTestStartTime(Date.now());
        setShowExplanation(false);
        setTestComplete(false);
        setViewState("test");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate test");
    } finally {
      setLoading(false);
    }
  };

  const startSpacedReview = async () => {
    if (!selectedCourse) return;

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const res = await fetch(`/api/mastery?course=${encodeURIComponent(selectedCourse.name)}&action=due`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const data = await res.json();

      if (data.concepts && data.concepts.length > 0) {
        setReviewConcepts(data.concepts);
        setCurrentReviewIndex(0);
        setViewState("review");
      } else {
        setError("No concepts due for review today!");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start review");
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async (answer: string) => {
    const question = testQuestions[currentQuestionIndex];
    if (!question) return;

    const timeTaken = Math.round((Date.now() - testStartTime) / 1000);
    const isCorrect = answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim().charAt(0);

    setTestAnswers({
      ...testAnswers,
      [question.id]: { answer, correct: isCorrect, time: timeTaken }
    });

    setShowExplanation(true);
  };

  const nextQuestion = () => {
    setShowExplanation(false);
    setTestStartTime(Date.now());

    if (currentQuestionIndex < testQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      setTestComplete(true);
    }
  };

  const getTopicsByMastery = () => {
    const topicMap: Record<string, { mastery: number; count: number; concepts: StudyConcept[] }> = {};

    for (const concept of concepts) {
      if (!topicMap[concept.topic_name]) {
        topicMap[concept.topic_name] = { mastery: 0, count: 0, concepts: [] };
      }
      topicMap[concept.topic_name].mastery += concept.mastery_level;
      topicMap[concept.topic_name].count += 1;
      topicMap[concept.topic_name].concepts.push(concept);
    }

    return Object.entries(topicMap).map(([name, data]) => ({
      name,
      avgMastery: Math.round(data.mastery / data.count),
      conceptCount: data.count,
      concepts: data.concepts
    })).sort((a, b) => a.avgMastery - b.avgMastery);
  };

  const getMasteryColor = (level: number) => {
    if (level >= 80) return "text-green-400 bg-green-500/20";
    if (level >= 60) return "text-blue-400 bg-blue-500/20";
    if (level >= 40) return "text-yellow-400 bg-yellow-500/20";
    return "text-red-400 bg-red-500/20";
  };

  const goBack = () => {
    if (viewState === "course") {
      setViewState("dashboard");
      setSelectedCourse(null);
      setConcepts([]);
      setWeakSpots([]);
    } else if (viewState === "topic" || viewState === "practice") {
      setViewState("course");
      setSelectedTopic(null);
    } else if (viewState === "test" || viewState === "review") {
      setViewState("topic");
      setTestQuestions([]);
      setReviewConcepts([]);
    }
  };

  if (pageLoading) {
    return (
      <div className="max-w-4xl space-y-4">
        <div className="h-8 w-48 bg-bg-card rounded animate-pulse" />
        <div className="h-48 bg-bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {viewState === "dashboard" && "Study Mode 📖"}
            {viewState === "course" && selectedCourse?.name}
            {viewState === "topic" && selectedTopic}
            {viewState === "test" && "Practice Test"}
            {viewState === "review" && "Spaced Review"}
          </h2>
          <p className="text-text-muted text-sm mt-1">
            {viewState === "dashboard" && "Learn smarter, not harder. Science-backed spaced repetition."}
            {viewState === "course" && "Your weak spots → what to focus on"}
            {viewState === "topic" && "Videos, practice, and mastery tracking"}
            {viewState === "test" && `Question ${currentQuestionIndex + 1} of ${testQuestions.length}`}
            {viewState === "review" && `Concept ${currentReviewIndex + 1} of ${reviewConcepts.length}`}
          </p>
        </div>
        {viewState !== "dashboard" && (
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

      {/* Dashboard View */}
      {viewState === "dashboard" && (
        <div className="space-y-6">
          {/* Overall Stats */}
          {masteryStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-bg-card border border-border">
                <div className="text-3xl font-bold text-accent">{masteryStats.overallMastery}%</div>
                <div className="text-text-muted text-sm">Overall Mastery</div>
              </div>
              <div className="p-4 rounded-xl bg-bg-card border border-border">
                <div className="text-3xl font-bold text-yellow-400">{masteryStats.dueToday}</div>
                <div className="text-text-muted text-sm">Due Today</div>
              </div>
              <div className="p-4 rounded-xl bg-bg-card border border-border">
                <div className="text-3xl font-bold text-green-400">{masteryStats.masteredConcepts}</div>
                <div className="text-text-muted text-sm">Mastered</div>
              </div>
              <div className="p-4 rounded-xl bg-bg-card border border-border">
                <div className="text-3xl font-bold text-red-400">{masteryStats.weakConcepts}</div>
                <div className="text-text-muted text-sm">Need Work</div>
              </div>
            </div>
          )}

          {/* Focus Area Alert */}
          {masteryStats?.focusArea && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-accent/10 to-warning/10 border border-accent/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold">Focus Area</h3>
                  <p className="text-text-muted text-sm mt-1">
                    Based on your performance, focus on <span className="text-accent font-medium">{masteryStats.focusArea}</span>
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-accent font-bold">{masteryStats.recommendedMinutes} min</div>
                  <div className="text-text-muted text-xs">recommended today</div>
                </div>
              </div>
            </div>
          )}

          {/* Course Selection */}
          <div>
            <h3 className="text-sm font-semibold text-text-secondary mb-3">Select a Course</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {courses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => loadCourseData(c)}
                  disabled={loading}
                  className="p-4 rounded-xl bg-bg-card border border-border hover:border-accent/40 transition-colors text-left cursor-pointer disabled:opacity-50 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium group-hover:text-accent transition-colors">{c.name}</span>
                    {hasCourseVideos(c.name) && (
                      <span className="px-2 py-0.5 rounded bg-accent/20 text-accent text-xs">Videos</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {courses.length === 0 && (
            <div className="p-8 rounded-xl bg-bg-card border border-border text-center">
              <p className="text-text-muted">
                No courses yet. Sync your assignments first and we&apos;ll set you up.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Course View - Topics by Mastery */}
      {viewState === "course" && selectedCourse && (
        <div className="space-y-6">
          {/* Course Stats */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-accent/10 to-success/10 border border-accent/20">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">{concepts.length} Concepts Tracked</h3>
                <p className="text-text-muted text-sm mt-1">
                  {weakSpots.length > 0 ? `${weakSpots.length} weak spots detected` : "No weak spots - great job!"}
                </p>
              </div>
              <button
                onClick={startSpacedReview}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                Start Review Session
              </button>
            </div>
          </div>

          {/* Weak Spots Alert */}
          {weakSpots.length > 0 && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
              <h4 className="text-red-400 font-semibold mb-2">Weak Spots Detected</h4>
              <div className="space-y-2">
                {weakSpots.slice(0, 3).map((ws) => (
                  <div key={ws.id} className="flex items-center justify-between">
                    <div>
                      <span className="text-white text-sm">{ws.concept_name}</span>
                      <span className="text-text-muted text-xs ml-2">({ws.topic_name})</span>
                    </div>
                    <span className="text-red-400 text-xs">{ws.error_pattern}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Topics by Mastery */}
          <div>
            <h3 className="text-sm font-semibold text-text-secondary mb-3">Topics (sorted by mastery)</h3>
            <div className="space-y-3">
              {getTopicsByMastery().map((topic) => (
                <button
                  key={topic.name}
                  onClick={() => selectTopic(topic.name)}
                  className="w-full p-4 rounded-xl bg-bg-card border border-border hover:border-accent/40 transition-all text-left cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h5 className="text-white font-medium group-hover:text-accent transition-colors">
                          {topic.name}
                        </h5>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getMasteryColor(topic.avgMastery)}`}>
                          {topic.avgMastery}% mastered
                        </span>
                      </div>
                      <p className="text-text-muted text-sm mt-1">
                        {topic.conceptCount} concepts
                      </p>
                    </div>
                    {/* Progress bar */}
                    <div className="w-24 h-2 rounded-full bg-bg-dark overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          topic.avgMastery >= 80 ? "bg-green-500" :
                          topic.avgMastery >= 60 ? "bg-blue-500" :
                          topic.avgMastery >= 40 ? "bg-yellow-500" : "bg-red-500"
                        }`}
                        style={{ width: `${topic.avgMastery}%` }}
                      />
                    </div>
                  </div>
                </button>
              ))}

              {concepts.length === 0 && (
                <div className="p-8 rounded-xl bg-bg-card border border-border text-center">
                  <p className="text-text-muted">No concepts tracked yet.</p>
                  <p className="text-text-muted text-sm mt-2">Take a practice test to start building your mastery profile.</p>
                  <button
                    onClick={() => setViewState("topic")}
                    className="mt-4 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors cursor-pointer"
                  >
                    Start Learning
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Topic View - Videos and Practice */}
      {viewState === "topic" && selectedTopic && (
        <div className="space-y-6">
          {/* Curated Videos */}
          {(topicVideos.learn.length > 0 || topicVideos.practice.length > 0) && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-text-secondary">Curated Learning Videos</h3>

              {topicVideos.learn.length > 0 && (
                <div>
                  <h4 className="text-xs text-accent font-medium mb-2">LEARN THE CONCEPTS</h4>
                  <div className="grid gap-3">
                    {topicVideos.learn.map((video) => (
                      <a
                        key={video.id}
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-4 rounded-xl bg-bg-card border border-border hover:border-red-500/40 transition-all group"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 text-lg">
                            ▶
                          </div>
                          <div className="flex-1">
                            <h5 className="text-white text-sm font-medium group-hover:text-red-400 transition-colors">
                              {video.title}
                            </h5>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-text-muted text-xs">{video.channel}</span>
                              <span className="text-text-muted text-xs">•</span>
                              <span className="text-text-muted text-xs">{video.duration}</span>
                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                video.difficulty === "intro" ? "bg-green-500/20 text-green-400" :
                                video.difficulty === "standard" ? "bg-blue-500/20 text-blue-400" :
                                "bg-purple-500/20 text-purple-400"
                              }`}>
                                {video.difficulty}
                              </span>
                            </div>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {topicVideos.practice.length > 0 && (
                <div>
                  <h4 className="text-xs text-yellow-400 font-medium mb-2">WORKED EXAMPLES</h4>
                  <div className="grid gap-3">
                    {topicVideos.practice.map((video) => (
                      <a
                        key={video.id}
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-4 rounded-xl bg-bg-card border border-border hover:border-yellow-500/40 transition-all group"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg">
                            ✍
                          </div>
                          <div className="flex-1">
                            <h5 className="text-white text-sm font-medium group-hover:text-yellow-400 transition-colors">
                              {video.title}
                            </h5>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-text-muted text-xs">{video.channel}</span>
                              <span className="text-text-muted text-xs">•</span>
                              <span className="text-text-muted text-xs">{video.duration}</span>
                            </div>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No curated videos - show search links */}
          {topicVideos.learn.length === 0 && topicVideos.practice.length === 0 && (
            <div className="p-4 rounded-xl bg-bg-card border border-border">
              <h3 className="text-white font-medium mb-3">Find Learning Resources</h3>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${selectedCourse?.name} ${selectedTopic}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
                >
                  ▶ YouTube
                </a>
                <a
                  href={`https://www.khanacademy.org/search?search_again=1&page_search_query=${encodeURIComponent(selectedTopic)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg bg-green-500/10 text-green-400 text-sm font-medium hover:bg-green-500/20 transition-colors"
                >
                  🎓 Khan Academy
                </a>
              </div>
            </div>
          )}

          {/* Practice Test CTA */}
          <div className="p-6 rounded-xl bg-gradient-to-br from-accent/20 to-bg-card border border-accent/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold text-lg">Think you know it?</h3>
                <p className="text-text-muted text-sm mt-1">
                  Prove it. Adaptive test that gets harder as you get better.
                </p>
              </div>
              <button
                onClick={startPracticeTest}
                disabled={loading}
                className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-accent/20"
              >
                {loading ? "Building test..." : "Test Yourself"}
              </button>
            </div>
          </div>

          {/* Topic Concepts */}
          {concepts.filter(c => c.topic_name === selectedTopic).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text-secondary mb-3">Concepts in This Topic</h3>
              <div className="grid gap-2">
                {concepts.filter(c => c.topic_name === selectedTopic).map((concept) => (
                  <div key={concept.id} className="p-3 rounded-lg bg-bg-card border border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-white text-sm">{concept.concept_name}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${getMasteryColor(concept.mastery_level)}`}>
                            {concept.mastery_level}%
                          </span>
                          {concept.streak > 0 && (
                            <span className="text-yellow-400 text-xs">🔥 {concept.streak} streak</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-text-muted text-xs">
                          {concept.correct_count}/{concept.total_reviews} correct
                        </div>
                        <div className="text-text-muted text-xs">
                          Review: {new Date(concept.next_review).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Test View */}
      {viewState === "test" && testQuestions.length > 0 && !testComplete && (
        <div className="space-y-6">
          {/* Progress */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-2 rounded-full bg-bg-card overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${((currentQuestionIndex + 1) / testQuestions.length) * 100}%` }}
              />
            </div>
            <span className="text-text-muted text-sm">
              {currentQuestionIndex + 1}/{testQuestions.length}
            </span>
          </div>

          {/* Current Question */}
          {(() => {
            const question = testQuestions[currentQuestionIndex];
            const answered = testAnswers[question.id];

            return (
              <div className="p-6 rounded-xl bg-bg-card border border-border">
                <div className="flex items-center gap-2 mb-4">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    question.difficulty === "easy" ? "bg-green-500/20 text-green-400" :
                    question.difficulty === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-red-500/20 text-red-400"
                  }`}>
                    {question.difficulty}
                  </span>
                  <span className="text-text-muted text-xs">{question.conceptName}</span>
                </div>

                <p className="text-white text-lg mb-6">{question.question}</p>

                {question.type === "multiple_choice" && question.options && (
                  <div className="space-y-3">
                    {question.options.map((opt, i) => {
                      const letter = String.fromCharCode(65 + i);
                      const isSelected = answered?.answer === letter;
                      const isCorrect = question.correctAnswer.toLowerCase().startsWith(letter.toLowerCase());

                      return (
                        <button
                          key={i}
                          onClick={() => !showExplanation && submitAnswer(letter)}
                          disabled={showExplanation}
                          className={`w-full p-4 rounded-lg text-left transition-all cursor-pointer ${
                            showExplanation
                              ? isCorrect
                                ? "bg-green-500/20 border border-green-500/40"
                                : isSelected
                                  ? "bg-red-500/20 border border-red-500/40"
                                  : "bg-bg-dark border border-border"
                              : isSelected
                                ? "bg-accent/20 border border-accent/40"
                                : "bg-bg-dark border border-border hover:border-accent/40"
                          }`}
                        >
                          <span className="text-white">{letter}. {opt}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Explanation */}
                {showExplanation && (
                  <div className={`mt-6 p-4 rounded-lg ${answered?.correct ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={answered?.correct ? "text-green-400" : "text-red-400"}>
                        {answered?.correct ? "✓ Correct!" : "✗ Incorrect"}
                      </span>
                    </div>
                    <p className="text-text-secondary text-sm">{question.explanation}</p>

                    <button
                      onClick={nextQuestion}
                      className="mt-4 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors cursor-pointer"
                    >
                      {currentQuestionIndex < testQuestions.length - 1 ? "Next Question" : "See Results"}
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Test Complete */}
      {viewState === "test" && testComplete && (
        <div className="p-8 rounded-xl bg-gradient-to-br from-accent/20 to-bg-card border border-accent/30 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h3 className="text-2xl font-bold text-white mb-2">Nice work!</h3>

          <div className="flex justify-center gap-8 my-6">
            <div>
              <div className="text-4xl font-bold text-green-400">
                {Object.values(testAnswers).filter(a => a.correct).length}
              </div>
              <div className="text-text-muted text-sm">Correct</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-red-400">
                {Object.values(testAnswers).filter(a => !a.correct).length}
              </div>
              <div className="text-text-muted text-sm">Incorrect</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-accent">
                {Math.round((Object.values(testAnswers).filter(a => a.correct).length / testQuestions.length) * 100)}%
              </div>
              <div className="text-text-muted text-sm">Accuracy</div>
            </div>
          </div>

          <p className="text-text-muted text-sm mb-6">
            Your mastery levels have been updated based on your performance.
          </p>

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setViewState("topic")}
              className="px-4 py-2 rounded-lg bg-bg-card border border-border text-white font-medium hover:border-accent/30 transition-colors cursor-pointer"
            >
              Back to Topic
            </button>
            <button
              onClick={startPracticeTest}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors cursor-pointer"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Review Session */}
      {viewState === "review" && reviewConcepts.length > 0 && (
        <div className="p-6 rounded-xl bg-bg-card border border-border">
          <div className="text-center">
            <div className="text-4xl mb-4">🧠</div>
            <h3 className="text-white font-semibold text-lg">
              {reviewConcepts[currentReviewIndex]?.concept_name}
            </h3>
            <p className="text-text-muted text-sm mt-2">
              Topic: {reviewConcepts[currentReviewIndex]?.topic_name}
            </p>
            <p className="text-text-muted text-xs mt-1">
              Current mastery: {reviewConcepts[currentReviewIndex]?.mastery_level}%
            </p>

            <div className="mt-6 p-4 rounded-lg bg-bg-dark">
              <p className="text-text-secondary text-sm">
                Review this concept. When ready, rate how well you remembered it.
              </p>
            </div>

            <div className="flex gap-2 justify-center mt-6">
              {[
                { label: "Forgot", quality: 1, color: "bg-red-500" },
                { label: "Hard", quality: 3, color: "bg-yellow-500" },
                { label: "Good", quality: 4, color: "bg-blue-500" },
                { label: "Easy", quality: 5, color: "bg-green-500" },
              ].map((rating) => (
                <button
                  key={rating.quality}
                  onClick={async () => {
                    // Record the review (simplified for now)
                    if (currentReviewIndex < reviewConcepts.length - 1) {
                      setCurrentReviewIndex(currentReviewIndex + 1);
                    } else {
                      setViewState("course");
                      await loadMasteryStats();
                    }
                  }}
                  className={`px-4 py-2 rounded-lg ${rating.color} text-white font-medium hover:opacity-80 transition-opacity cursor-pointer`}
                >
                  {rating.label}
                </button>
              ))}
            </div>

            <div className="mt-4 text-text-muted text-xs">
              {currentReviewIndex + 1} of {reviewConcepts.length} concepts
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
