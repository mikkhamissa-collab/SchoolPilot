"use client";

// Multi-step conversational onboarding flow for SchoolPilot.
// Collects student basics, AI personality preference, goals, and LMS credentials,
// then posts each step to the backend before redirecting to /today.

import { createClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Step = "welcome" | "basics" | "personality" | "goals" | "lms" | "confirm";

const STEPS: Step[] = ["welcome", "basics", "personality", "goals", "lms", "confirm"];

const GRADE_OPTIONS = [
  "9th Grade",
  "10th Grade",
  "11th Grade",
  "12th Grade",
  "College Freshman",
  "College Sophomore",
  "College Junior",
  "College Senior",
  "Other",
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Central Europe (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "China (CST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

interface PersonalityPreset {
  id: string;
  name: string;
  description: string;
  quote: string;
  emoji: string;
}

const PERSONALITIES: PersonalityPreset[] = [
  {
    id: "coach",
    name: "Coach",
    description: "Direct and motivating. Pushes you to be better without sugarcoating.",
    quote: "You bombed circuits last time and haven't touched it yet. Let's fix that tonight.",
    emoji: "\uD83C\uDFC8",
  },
  {
    id: "friend",
    name: "Friend",
    description: "Chill and supportive. Like texting a smart friend who gets it.",
    quote: "okay that essay is kinda a lot but ngl you got this. start with the intro tonight?",
    emoji: "\uD83E\uDD1D",
  },
  {
    id: "mentor",
    name: "Mentor",
    description: "Wise and thoughtful. Helps you see the bigger picture.",
    quote: "This physics grade matters for engineering programs, but more importantly you'll actually use this.",
    emoji: "\uD83E\uDDD1\u200D\uD83C\uDF93",
  },
  {
    id: "drill_sergeant",
    name: "Drill Sergeant",
    description: "No excuses. Maximum accountability. Results only.",
    quote: "You've been 'about to start' for three days. Open the doc. Now.",
    emoji: "\uD83C\uDF96\uFE0F",
  },
];

const GOAL_SUGGESTIONS = [
  "Maintain GPA above 3.5",
  "Get into a good CS program",
  "Never miss a deadline",
  "Improve my study habits",
  "Score 1500+ on SAT",
  "Get all A's this semester",
  "Better time management",
  "Stop procrastinating",
  "Understand math deeply",
  "Read more for English class",
];

const LMS_OPTIONS = [
  { value: "teamie", label: "Teamie" },
  { value: "canvas", label: "Canvas" },
  { value: "blackboard", label: "Blackboard" },
  { value: "google_classroom", label: "Google Classroom" },
  { value: "schoology", label: "Schoology" },
  { value: "moodle", label: "Moodle" },
];

// ---------------------------------------------------------------------------
// Helper: get auth token
// ---------------------------------------------------------------------------

async function getAuthToken(): Promise<string | null> {
  const supabase = createClient();
  // Use getSession first, but refresh if expired
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    // Check if token is about to expire (within 60 seconds)
    const expiresAt = session.expires_at ?? 0;
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt - now > 60) {
      return session.access_token;
    }
  }
  // Token missing or about to expire — refresh it
  const { data: { session: refreshed } } = await supabase.auth.refreshSession();
  return refreshed?.access_token ?? null;
}

async function authedFetch(path: string, body: Record<string, unknown>) {
  const token = await getAuthToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || err.error || `Error ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter();

  // Current step
  const [step, setStep] = useState<Step>("welcome");
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [animating, setAnimating] = useState(false);

  // Basics
  const [name, setName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");

  // Personality
  const [personality, setPersonality] = useState("coach");

  // Goals
  const [goals, setGoals] = useState<string[]>([]);
  const [customGoal, setCustomGoal] = useState("");

  // LMS
  const [lmsType, setLmsType] = useState("teamie");
  const [lmsUrl, setLmsUrl] = useState("");
  const [lmsUsername, setLmsUsername] = useState("");
  const [lmsPassword, setLmsPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // UI state
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Auth check
  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      // Pre-fill name from Supabase metadata if available
      const displayName = user.user_metadata?.full_name || user.user_metadata?.display_name || "";
      if (displayName) setName(displayName.split(" ")[0]);
    };
    check();
  }, [router]);

  // Step navigation with animation
  const goToStep = useCallback((target: Step, dir: "forward" | "backward") => {
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setStep(target);
      setAnimating(false);
      setError("");
    }, 200);
  }, []);

  const currentIndex = STEPS.indexOf(step);

  const goNext = useCallback(() => {
    if (currentIndex < STEPS.length - 1) {
      goToStep(STEPS[currentIndex + 1], "forward");
    }
  }, [currentIndex, goToStep]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      goToStep(STEPS[currentIndex - 1], "backward");
    }
  }, [currentIndex, goToStep]);

  // Save basics step to backend
  const saveBasics = async () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!gradeLevel) {
      setError("Please select your grade level.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await authedFetch("/api/profile/onboarding", {
        step: "basics",
        answers: {
          name: name.trim(),
          school: schoolName.trim(),
          grade: gradeLevel,
          timezone,
        },
      });
    } catch {
      // Backend save failed — continue anyway so user isn't stuck
    }
    setSaving(false);
    goNext();
  };

  // Save personality step
  const savePersonality = async () => {
    setSaving(true);
    setError("");
    try {
      await authedFetch("/api/profile/onboarding", {
        step: "personality",
        answers: { preset: personality },
      });
    } catch {
      // Continue even if backend fails
    }
    setSaving(false);
    goNext();
  };

  // Save goals step
  const saveGoals = async () => {
    const allGoals = [...goals];
    if (customGoal.trim() && !allGoals.includes(customGoal.trim())) {
      allGoals.push(customGoal.trim());
    }
    setSaving(true);
    setError("");
    try {
      await authedFetch("/api/profile/onboarding", {
        step: "goals",
        answers: { goals: allGoals },
      });
    } catch {
      // Continue even if backend fails
    }
    setSaving(false);
    goNext();
  };

  // Save LMS credentials
  const saveLms = async () => {
    if (!lmsUrl.trim()) {
      setError("Please enter your LMS URL.");
      return;
    }
    if (!lmsUsername.trim() || !lmsPassword.trim()) {
      setError("Please enter your LMS username and password.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await authedFetch("/api/auth/lms-credentials", {
        lms_type: lmsType,
        lms_url: lmsUrl.trim(),
        username: lmsUsername.trim(),
        password: lmsPassword,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save credentials.");
      setSaving(false);
      return;
    }

    try {
      await authedFetch("/api/profile/onboarding", {
        step: "lms",
        answers: { lms_type: lmsType, lms_url: lmsUrl.trim() },
      });
      goNext();
    } catch (e) {
      setError("Credentials saved, but we couldn't advance. Please click Connect again.");
    } finally {
      setSaving(false);
    }
  };

  // Skip LMS step
  const skipLms = () => {
    goNext();
  };

  // Finalize onboarding — always sets metadata even if backend call fails
  const completeOnboarding = async () => {
    setSaving(true);
    setError("");
    try {
      await authedFetch("/api/profile/onboarding", {
        step: "confirm",
        answers: {},
      });
    } catch {
      // Backend failed but we still mark onboarding complete so user isn't stuck
    }
    // Always mark in Supabase metadata — this is what the middleware checks
    const supabase = createClient();
    await supabase.auth.updateUser({
      data: { onboarding_completed: true },
    });
    setSaving(false);
    router.push("/today");
  };

  // Skip onboarding entirely — mark complete and go to dashboard
  const skipOnboarding = async () => {
    setSaving(true);
    const supabase = createClient();
    await supabase.auth.updateUser({
      data: { onboarding_completed: true },
    });
    router.push("/today");
  };

  // Toggle a goal chip
  const toggleGoal = (goal: string) => {
    setGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  // Progress bar width
  const progress = ((currentIndex) / (STEPS.length - 1)) * 100;

  // Animation class
  const contentClass = animating
    ? direction === "forward"
      ? "opacity-0 translate-x-8"
      : "opacity-0 -translate-x-8"
    : "opacity-100 translate-x-0";

  return (
    <div className="min-h-screen bg-bg-dark flex flex-col items-center justify-center p-6">
      {/* Progress bar */}
      <div className="w-full max-w-lg mb-8">
        <div className="h-1 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                i <= currentIndex ? "bg-accent" : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div
        className={`w-full max-w-lg transition-all duration-200 ease-out ${contentClass}`}
      >
        {/* ================================================================= */}
        {/* STEP 1: WELCOME */}
        {/* ================================================================= */}
        {step === "welcome" && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-accent/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-3">
                Hey! I&apos;m SchoolPilot
              </h1>
              <p className="text-text-secondary text-lg leading-relaxed">
                Your AI study companion. I&apos;ll help you stay on top of
                assignments, protect your grades, and actually know what to work on
                each day.
              </p>
            </div>
            <p className="text-text-muted text-sm">
              Let&apos;s get you set up in under 2 minutes. No fluff, I promise.
            </p>
            <button
              onClick={goNext}
              className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-lg transition-colors cursor-pointer"
            >
              Let&apos;s go
            </button>
            <button
              onClick={skipOnboarding}
              disabled={saving}
              className="w-full text-center text-text-muted text-sm hover:text-text-secondary transition-colors cursor-pointer disabled:opacity-50"
            >
              Skip setup &mdash; I&apos;ll do this later
            </button>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 2: BASICS */}
        {/* ================================================================= */}
        {step === "basics" && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white mb-2">
                The basics
              </h1>
              <p className="text-text-secondary">
                Tell me a bit about yourself so I can personalize your experience.
              </p>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="onb-name" className="block text-text-secondary text-sm mb-1.5">
                  Your first name
                </label>
                <input
                  id="onb-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                  autoFocus
                />
              </div>

              {/* School */}
              <div>
                <label htmlFor="onb-school" className="block text-text-secondary text-sm mb-1.5">
                  School name <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  id="onb-school"
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. American School of London"
                  className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {/* Grade Level */}
              <div>
                <label htmlFor="onb-grade" className="block text-text-secondary text-sm mb-1.5">
                  Grade level
                </label>
                <select
                  id="onb-grade"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-white focus:outline-none focus:border-accent transition-colors appearance-none cursor-pointer"
                >
                  <option value="" disabled>
                    Select your grade
                  </option>
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              {/* Timezone */}
              <div>
                <label htmlFor="onb-tz" className="block text-text-secondary text-sm mb-1.5">
                  Timezone
                </label>
                <select
                  id="onb-tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-white focus:outline-none focus:border-accent transition-colors appearance-none cursor-pointer"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="px-6 py-3 rounded-xl border border-border text-text-secondary hover:text-white hover:border-accent/50 transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={saveBasics}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving ? "Saving..." : "Continue"}
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 3: PERSONALITY */}
        {/* ================================================================= */}
        {step === "personality" && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white mb-2">
                Pick your AI vibe
              </h1>
              <p className="text-text-secondary">
                How should I talk to you? You can always change this later in Settings.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {PERSONALITIES.map((p) => {
                const selected = personality === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPersonality(p.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                      selected
                        ? "border-accent bg-accent/10"
                        : "border-border bg-bg-card hover:border-accent/30 hover:bg-bg-hover"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-0.5">{p.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-semibold">{p.name}</span>
                          {selected && (
                            <span className="px-1.5 py-0.5 rounded bg-accent/20 text-accent text-xs font-medium">
                              Selected
                            </span>
                          )}
                        </div>
                        <p className="text-text-secondary text-sm mb-2">
                          {p.description}
                        </p>
                        <p className="text-text-muted text-xs italic leading-relaxed">
                          &ldquo;{p.quote}&rdquo;
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="px-6 py-3 rounded-xl border border-border text-text-secondary hover:text-white hover:border-accent/50 transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={savePersonality}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving ? "Saving..." : "Continue"}
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 4: GOALS */}
        {/* ================================================================= */}
        {step === "goals" && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white mb-2">
                What are you aiming for?
              </h1>
              <p className="text-text-secondary">
                Pick a few goals or write your own. This helps me prioritize what matters to you.
              </p>
            </div>

            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-2">
              {GOAL_SUGGESTIONS.map((goal) => {
                const selected = goals.includes(goal);
                return (
                  <button
                    key={goal}
                    onClick={() => toggleGoal(goal)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                      selected
                        ? "bg-accent/20 border border-accent text-accent"
                        : "bg-bg-card border border-border text-text-secondary hover:border-accent/30 hover:text-white"
                    }`}
                  >
                    {selected && (
                      <span className="mr-1.5">&#10003;</span>
                    )}
                    {goal}
                  </button>
                );
              })}
            </div>

            {/* Custom goal input */}
            <div>
              <label htmlFor="onb-custom-goal" className="block text-text-secondary text-sm mb-1.5">
                Or write your own
              </label>
              <textarea
                id="onb-custom-goal"
                value={customGoal}
                onChange={(e) => setCustomGoal(e.target.value)}
                placeholder="e.g. Finish college applications by December..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
              />
            </div>

            {goals.length > 0 && (
              <p className="text-text-muted text-xs">
                {goals.length} goal{goals.length !== 1 ? "s" : ""} selected
              </p>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="px-6 py-3 rounded-xl border border-border text-text-secondary hover:text-white hover:border-accent/50 transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={saveGoals}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving ? "Saving..." : "Continue"}
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 5: LMS SETUP */}
        {/* ================================================================= */}
        {step === "lms" && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white mb-2">
                Connect your LMS
              </h1>
              <p className="text-text-secondary">
                I&apos;ll automatically sync your assignments. No more manual checking.
              </p>
            </div>

            <div className="space-y-4">
              {/* LMS Type */}
              <div>
                <label htmlFor="onb-lms-type" className="block text-text-secondary text-sm mb-1.5">
                  LMS platform
                </label>
                <select
                  id="onb-lms-type"
                  value={lmsType}
                  onChange={(e) => setLmsType(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-white focus:outline-none focus:border-accent transition-colors appearance-none cursor-pointer"
                >
                  {LMS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* LMS URL */}
              <div>
                <label htmlFor="onb-lms-url" className="block text-text-secondary text-sm mb-1.5">
                  LMS URL
                </label>
                <input
                  id="onb-lms-url"
                  type="url"
                  value={lmsUrl}
                  onChange={(e) => setLmsUrl(e.target.value)}
                  placeholder="e.g. https://lms.asl.org"
                  className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {/* Username */}
              <div>
                <label htmlFor="onb-lms-user" className="block text-text-secondary text-sm mb-1.5">
                  Username
                </label>
                <input
                  id="onb-lms-user"
                  type="text"
                  value={lmsUsername}
                  onChange={(e) => setLmsUsername(e.target.value)}
                  placeholder="Your LMS username or email"
                  autoComplete="username"
                  className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="onb-lms-pass" className="block text-text-secondary text-sm mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="onb-lms-pass"
                    type={showPassword ? "text" : "password"}
                    value={lmsPassword}
                    onChange={(e) => setLmsPassword(e.target.value)}
                    placeholder="Your LMS password"
                    autoComplete="current-password"
                    className="w-full px-4 py-3 pr-12 rounded-xl bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Security note */}
              <div className="flex items-start gap-2 p-3 rounded-xl bg-bg-card/50 border border-border/50">
                <svg className="w-4 h-4 text-accent shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <p className="text-text-muted text-xs leading-relaxed">
                  Your credentials are encrypted with AES-256 and stored securely.
                  We only use them to sync your assignments automatically.
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="px-6 py-3 rounded-xl border border-border text-text-secondary hover:text-white hover:border-accent/50 transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={saveLms}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving ? "Connecting..." : "Connect LMS"}
              </button>
            </div>

            <button
              onClick={skipLms}
              className="w-full text-center text-text-muted text-sm hover:text-text-secondary transition-colors cursor-pointer"
            >
              Skip for now &mdash; I&apos;ll connect my LMS later in Settings
            </button>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 6: CONFIRMATION */}
        {/* ================================================================= */}
        {step === "confirm" && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-success/20 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">
                Looking good, {name || "there"}!
              </h1>
              <p className="text-text-secondary">
                Here&apos;s a summary of your setup. Ready to roll?
              </p>
            </div>

            {/* Summary cards */}
            <div className="space-y-3">
              {/* Basics */}
              <div className="p-4 rounded-xl bg-bg-card border border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-medium text-sm">Profile</h3>
                  <button
                    onClick={() => goToStep("basics", "backward")}
                    className="text-accent text-xs hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                  <span className="text-text-muted">Name</span>
                  <span className="text-white text-right">{name || "Not set"}</span>
                  {schoolName && (
                    <>
                      <span className="text-text-muted">School</span>
                      <span className="text-white text-right">{schoolName}</span>
                    </>
                  )}
                  <span className="text-text-muted">Grade</span>
                  <span className="text-white text-right">{gradeLevel || "Not set"}</span>
                  <span className="text-text-muted">Timezone</span>
                  <span className="text-white text-right">
                    {TIMEZONES.find((t) => t.value === timezone)?.label || timezone}
                  </span>
                </div>
              </div>

              {/* Personality */}
              <div className="p-4 rounded-xl bg-bg-card border border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-medium text-sm">AI Personality</h3>
                  <button
                    onClick={() => goToStep("personality", "backward")}
                    className="text-accent text-xs hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {PERSONALITIES.find((p) => p.id === personality)?.emoji}
                  </span>
                  <span className="text-white text-sm font-medium">
                    {PERSONALITIES.find((p) => p.id === personality)?.name}
                  </span>
                  <span className="text-text-muted text-xs">
                    &mdash; {PERSONALITIES.find((p) => p.id === personality)?.description}
                  </span>
                </div>
              </div>

              {/* Goals */}
              <div className="p-4 rounded-xl bg-bg-card border border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-medium text-sm">Goals</h3>
                  <button
                    onClick={() => goToStep("goals", "backward")}
                    className="text-accent text-xs hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                {goals.length > 0 || customGoal.trim() ? (
                  <div className="flex flex-wrap gap-1.5">
                    {goals.map((g) => (
                      <span
                        key={g}
                        className="px-2 py-1 rounded-lg bg-accent/10 text-accent text-xs"
                      >
                        {g}
                      </span>
                    ))}
                    {customGoal.trim() && !goals.includes(customGoal.trim()) && (
                      <span className="px-2 py-1 rounded-lg bg-accent/10 text-accent text-xs">
                        {customGoal.trim()}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-text-muted text-sm">No goals set yet</p>
                )}
              </div>

              {/* LMS */}
              <div className="p-4 rounded-xl bg-bg-card border border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-medium text-sm">LMS Connection</h3>
                  <button
                    onClick={() => goToStep("lms", "backward")}
                    className="text-accent text-xs hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                {lmsUrl ? (
                  <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                    <span className="text-text-muted">Platform</span>
                    <span className="text-white text-right">
                      {LMS_OPTIONS.find((l) => l.value === lmsType)?.label || lmsType}
                    </span>
                    <span className="text-text-muted">URL</span>
                    <span className="text-white text-right truncate">{lmsUrl}</span>
                    <span className="text-text-muted">Username</span>
                    <span className="text-white text-right">{lmsUsername || "Set"}</span>
                  </div>
                ) : (
                  <p className="text-text-muted text-sm">
                    Not connected &mdash; you can connect your LMS later in Settings.
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="px-6 py-3 rounded-xl border border-border text-text-secondary hover:text-white hover:border-accent/50 transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={completeOnboarding}
                disabled={saving}
                className="flex-1 py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving ? "Setting up..." : "Looks good \u2014 let\u2019s go!"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
