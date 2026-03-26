"use client";

// Multi-step conversational onboarding flow for SchoolPilot.
// Collects student basics, AI personality preference, goals, and LMS credentials,
// then posts each step to the backend before redirecting to /today.

import { createClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import RemoteBrowser from "@/components/RemoteBrowser";

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
}

const PERSONALITIES: PersonalityPreset[] = [
  {
    id: "coach",
    name: "Coach",
    description: "Direct and motivating. Pushes you to be better without sugarcoating.",
    quote: "You bombed circuits last time and haven't touched it yet. Let's fix that tonight.",
  },
  {
    id: "friend",
    name: "Friend",
    description: "Chill and supportive. Like texting a smart friend who gets it.",
    quote: "okay that essay is kinda a lot but ngl you got this. start with the intro tonight?",
  },
  {
    id: "mentor",
    name: "Mentor",
    description: "Wise and thoughtful. Helps you see the bigger picture.",
    quote: "This physics grade matters for engineering programs, but more importantly you'll actually use this.",
  },
  {
    id: "drill_sergeant",
    name: "Drill Sergeant",
    description: "No excuses. Maximum accountability. Results only.",
    quote: "You've been 'about to start' for three days. Open the doc. Now.",
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
// Shared styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  backgroundColor: "#09090b",
  border: "1px solid #1e1e22",
};

const cardBg: React.CSSProperties = {
  backgroundColor: "#111113",
  border: "1px solid #1e1e22",
};

function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)";
}

function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "#1e1e22";
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

  // LMS — remote browser connection
  const [lmsConnected, setLmsConnected] = useState(false);

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

  // Handle LMS remote browser completion
  const handleLmsConnected = async () => {
    setLmsConnected(true);
    setSaving(true);
    try {
      await authedFetch("/api/profile/onboarding", {
        step: "lms",
        answers: { lms_type: "teamie", connected_via: "remote_browser" },
      });
    } catch {
      // Continue even if backend tracking fails
    }
    setSaving(false);
    goNext();
  };

  const handleLmsError = (msg: string) => {
    setError(msg);
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: "#09090b" }}>
      {/* Progress bar */}
      <div className="w-full max-w-lg mb-8">
        <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "#1e1e22" }}>
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%`, backgroundColor: "#7c3aed" }}
          />
        </div>
        <div className="flex justify-between mt-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className="w-2 h-2 rounded-full transition-colors duration-300"
              style={{ backgroundColor: i <= currentIndex ? "#7c3aed" : "#1e1e22" }}
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
            <div className="inline-flex items-center gap-2.5 mb-2">
              <div
                className="w-[22px] h-[22px] rounded-[6px]"
                style={{ background: "linear-gradient(135deg, #7c3aed, #a78bfa)" }}
              />
              <span className="text-[#fafafa] font-semibold text-base tracking-tight">SchoolPilot</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#fafafa] mb-3">
                Let&apos;s get you set up
              </h1>
              <p className="text-[#a1a1aa] text-lg leading-relaxed">
                Your AI study companion. I&apos;ll help you stay on top of
                assignments, protect your grades, and actually know what to work on
                each day.
              </p>
            </div>
            <p className="text-[#71717a] text-sm">
              This takes under 2 minutes.
            </p>
            <button
              onClick={goNext}
              className="w-full py-3.5 rounded-lg font-semibold text-base transition-opacity cursor-pointer"
              style={{ backgroundColor: "#fafafa", color: "#09090b" }}
            >
              Get started
            </button>
            <button
              onClick={skipOnboarding}
              disabled={saving}
              className="w-full text-center text-[#52525b] text-sm hover:text-[#a1a1aa] transition-colors cursor-pointer disabled:opacity-50"
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
              <h1 className="text-2xl font-bold text-[#fafafa] mb-2">
                The basics
              </h1>
              <p className="text-[#a1a1aa]">
                Tell me a bit about yourself so I can personalize your experience.
              </p>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="onb-name" className="block text-[#a1a1aa] text-sm mb-1.5">
                  Your first name
                </label>
                <input
                  id="onb-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full px-3.5 py-2.5 rounded-lg text-[#fafafa] text-sm placeholder:text-[#52525b] focus:outline-none transition-colors"
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                  autoFocus
                />
              </div>

              {/* School */}
              <div>
                <label htmlFor="onb-school" className="block text-[#a1a1aa] text-sm mb-1.5">
                  School name <span className="text-[#52525b]">(optional)</span>
                </label>
                <input
                  id="onb-school"
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. American School of London"
                  className="w-full px-3.5 py-2.5 rounded-lg text-[#fafafa] text-sm placeholder:text-[#52525b] focus:outline-none transition-colors"
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>

              {/* Grade Level */}
              <div>
                <label htmlFor="onb-grade" className="block text-[#a1a1aa] text-sm mb-1.5">
                  Grade level
                </label>
                <select
                  id="onb-grade"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg text-[#fafafa] text-sm focus:outline-none transition-colors appearance-none cursor-pointer"
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
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
                <label htmlFor="onb-tz" className="block text-[#a1a1aa] text-sm mb-1.5">
                  Timezone
                </label>
                <select
                  id="onb-tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg text-[#fafafa] text-sm focus:outline-none transition-colors appearance-none cursor-pointer"
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
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
              <div className="p-3 rounded-lg text-red-400 text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="px-6 py-2.5 rounded-lg text-[#a1a1aa] hover:text-[#fafafa] transition-colors cursor-pointer"
                style={{ border: "1px solid #1e1e22" }}
              >
                Back
              </button>
              <button
                onClick={saveBasics}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg font-semibold transition-opacity cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: "#fafafa", color: "#09090b" }}
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
              <h1 className="text-2xl font-bold text-[#fafafa] mb-2">
                Pick your AI style
              </h1>
              <p className="text-[#a1a1aa]">
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
                    className="text-left p-4 rounded-xl transition-all duration-200 cursor-pointer"
                    style={{
                      border: selected ? "2px solid #7c3aed" : "2px solid #1e1e22",
                      backgroundColor: selected ? "rgba(124,58,237,0.15)" : "#111113",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[#fafafa] font-semibold">{p.name}</span>
                        {selected && (
                          <span
                            className="px-1.5 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: "rgba(124,58,237,0.2)", color: "#a78bfa" }}
                          >
                            Selected
                          </span>
                        )}
                      </div>
                      <p className="text-[#a1a1aa] text-sm mb-2">
                        {p.description}
                      </p>
                      <p className="text-[#71717a] text-xs italic leading-relaxed">
                        &ldquo;{p.quote}&rdquo;
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="p-3 rounded-lg text-red-400 text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="px-6 py-2.5 rounded-lg text-[#a1a1aa] hover:text-[#fafafa] transition-colors cursor-pointer"
                style={{ border: "1px solid #1e1e22" }}
              >
                Back
              </button>
              <button
                onClick={savePersonality}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg font-semibold transition-opacity cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: "#fafafa", color: "#09090b" }}
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
              <h1 className="text-2xl font-bold text-[#fafafa] mb-2">
                What are you aiming for?
              </h1>
              <p className="text-[#a1a1aa]">
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
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                    style={{
                      backgroundColor: selected ? "rgba(124,58,237,0.15)" : "#111113",
                      border: selected ? "1px solid #7c3aed" : "1px solid #1e1e22",
                      color: selected ? "#a78bfa" : "#a1a1aa",
                    }}
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
              <label htmlFor="onb-custom-goal" className="block text-[#a1a1aa] text-sm mb-1.5">
                Or write your own
              </label>
              <textarea
                id="onb-custom-goal"
                value={customGoal}
                onChange={(e) => setCustomGoal(e.target.value)}
                placeholder="e.g. Finish college applications by December..."
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-lg text-[#fafafa] text-sm placeholder:text-[#52525b] focus:outline-none transition-colors resize-none"
                style={inputStyle}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>

            {goals.length > 0 && (
              <p className="text-[#71717a] text-xs">
                {goals.length} goal{goals.length !== 1 ? "s" : ""} selected
              </p>
            )}

            {error && (
              <div className="p-3 rounded-lg text-red-400 text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="px-6 py-2.5 rounded-lg text-[#a1a1aa] hover:text-[#fafafa] transition-colors cursor-pointer"
                style={{ border: "1px solid #1e1e22" }}
              >
                Back
              </button>
              <button
                onClick={saveGoals}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg font-semibold transition-opacity cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: "#fafafa", color: "#09090b" }}
              >
                {saving ? "Saving..." : "Continue"}
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 5: LMS SETUP (Remote Browser) */}
        {/* ================================================================= */}
        {step === "lms" && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-[#fafafa] mb-2">
                Connect your LMS
              </h1>
              <p className="text-[#a1a1aa]">
                Log into your school&apos;s learning management system below. We&apos;ll securely save your session.
              </p>
            </div>

            <RemoteBrowser
              onComplete={handleLmsConnected}
              onError={handleLmsError}
            />

            {error && (
              <div className="p-3 rounded-lg text-red-400 text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="px-6 py-2.5 rounded-lg text-[#a1a1aa] hover:text-[#fafafa] transition-colors cursor-pointer"
                style={{ border: "1px solid #1e1e22" }}
              >
                Back
              </button>
            </div>

            <button
              onClick={skipLms}
              className="w-full text-center text-[#52525b] text-sm hover:text-[#a1a1aa] transition-colors cursor-pointer"
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
              <div
                className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: "rgba(34,197,94,0.15)" }}
              >
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-[#fafafa] mb-2">
                You&apos;re all set{name ? `, ${name}` : ""}.
              </h1>
              <p className="text-[#a1a1aa]">
                Here&apos;s a summary of your setup.
              </p>
            </div>

            {/* Summary cards */}
            <div className="space-y-3">
              {/* Basics */}
              <div className="p-4 rounded-xl" style={cardBg}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[#fafafa] font-medium text-sm">Profile</h3>
                  <button
                    onClick={() => goToStep("basics", "backward")}
                    className="text-[#7c3aed] text-xs hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                  <span className="text-[#71717a]">Name</span>
                  <span className="text-[#fafafa] text-right">{name || "Not set"}</span>
                  {schoolName && (
                    <>
                      <span className="text-[#71717a]">School</span>
                      <span className="text-[#fafafa] text-right">{schoolName}</span>
                    </>
                  )}
                  <span className="text-[#71717a]">Grade</span>
                  <span className="text-[#fafafa] text-right">{gradeLevel || "Not set"}</span>
                  <span className="text-[#71717a]">Timezone</span>
                  <span className="text-[#fafafa] text-right">
                    {TIMEZONES.find((t) => t.value === timezone)?.label || timezone}
                  </span>
                </div>
              </div>

              {/* Personality */}
              <div className="p-4 rounded-xl" style={cardBg}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[#fafafa] font-medium text-sm">AI Personality</h3>
                  <button
                    onClick={() => goToStep("personality", "backward")}
                    className="text-[#7c3aed] text-xs hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[#fafafa] text-sm font-medium">
                    {PERSONALITIES.find((p) => p.id === personality)?.name}
                  </span>
                  <span className="text-[#71717a] text-xs">
                    &mdash; {PERSONALITIES.find((p) => p.id === personality)?.description}
                  </span>
                </div>
              </div>

              {/* Goals */}
              <div className="p-4 rounded-xl" style={cardBg}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[#fafafa] font-medium text-sm">Goals</h3>
                  <button
                    onClick={() => goToStep("goals", "backward")}
                    className="text-[#7c3aed] text-xs hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                {goals.length > 0 || customGoal.trim() ? (
                  <div className="flex flex-wrap gap-1.5">
                    {goals.map((g) => (
                      <span
                        key={g}
                        className="px-2 py-1 rounded-lg text-xs"
                        style={{ backgroundColor: "rgba(124,58,237,0.1)", color: "#a78bfa" }}
                      >
                        {g}
                      </span>
                    ))}
                    {customGoal.trim() && !goals.includes(customGoal.trim()) && (
                      <span
                        className="px-2 py-1 rounded-lg text-xs"
                        style={{ backgroundColor: "rgba(124,58,237,0.1)", color: "#a78bfa" }}
                      >
                        {customGoal.trim()}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-[#71717a] text-sm">No goals set yet</p>
                )}
              </div>

              {/* LMS */}
              <div className="p-4 rounded-xl" style={cardBg}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[#fafafa] font-medium text-sm">LMS Connection</h3>
                  <button
                    onClick={() => goToStep("lms", "backward")}
                    className="text-[#7c3aed] text-xs hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                {lmsConnected ? (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-[#fafafa] text-sm">Connected via browser session</span>
                  </div>
                ) : (
                  <p className="text-[#71717a] text-sm">
                    Not connected &mdash; you can connect your LMS later in Settings.
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg text-red-400 text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="px-6 py-2.5 rounded-lg text-[#a1a1aa] hover:text-[#fafafa] transition-colors cursor-pointer"
                style={{ border: "1px solid #1e1e22" }}
              >
                Back
              </button>
              <button
                onClick={completeOnboarding}
                disabled={saving}
                className="flex-1 py-3.5 rounded-lg font-bold text-base transition-opacity cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: "#fafafa", color: "#09090b" }}
              >
                {saving ? "Setting up..." : "Go to your dashboard"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
