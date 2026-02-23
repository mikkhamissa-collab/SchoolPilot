"use client";

import { createClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Step = "welcome" | "extension" | "sync" | "targets" | "ready";

interface OnboardingCourse {
  id: string;
  name: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [userName, setUserName] = useState("");
  const [checking, setChecking] = useState(false);
  const [hasAssignments, setHasAssignments] = useState(false);
  const [courses, setCourses] = useState<OnboardingCourse[]>([]);
  const [targetGrades, setTargetGrades] = useState<Record<string, number>>({});

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setUserName(user.user_metadata?.full_name?.split(" ")[0] || "there");

      // Check if they already have assignments (not a new user)
      const { data: scraped } = await supabase
        .from("scraped_assignments")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (scraped && scraped.length > 0) {
        // Already has data, redirect to dashboard
        router.push("/today");
        return;
      }
    };
    load();
  }, [router]);

  const checkForAssignments = async () => {
    setChecking(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: scraped } = await supabase
      .from("scraped_assignments")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (scraped && scraped.length > 0) {
      setHasAssignments(true);

      // Load courses for target grades step
      const { data: courseData } = await supabase
        .from("courses")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name");

      if (courseData && courseData.length > 0) {
        setCourses(courseData);
        // Default all targets to 90%
        const defaults: Record<string, number> = {};
        for (const c of courseData) defaults[c.name] = 90;
        setTargetGrades(defaults);
        setStep("targets");
      } else {
        setStep("ready");
      }
    } else {
      setChecking(false);
    }
  };

  const saveTargetGrades = async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: { target_grades: targetGrades }
      });
      if (error) {
        console.error("Failed to save target grades:", error.message);
        // Still advance — targets can be set later in Settings
      }
    } catch (err) {
      console.error("Save target grades error:", err);
    }
    setStep("ready");
  };

  const completeOnboarding = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.auth.updateUser({
          data: { onboarding_completed: true }
        });
        if (error) {
          console.error("Failed to mark onboarding complete:", error.message);
        }
      }
    } catch (err) {
      console.error("Complete onboarding error:", err);
    }
    router.push("/today");
  };

  return (
    <div className="min-h-screen bg-bg-dark flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {(["welcome", "extension", "sync", "targets", "ready"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${
                step === s ? "bg-accent" :
                (["welcome", "extension", "sync", "targets", "ready"].indexOf(step) > i ? "bg-accent/50" : "bg-border")
              }`}
            />
          ))}
        </div>

        {/* Step: Welcome */}
        {step === "welcome" && (
          <div className="text-center space-y-6">
            <div className="text-6xl">👋</div>
            <h1 className="text-3xl font-bold text-white">
              Hey {userName}!
            </h1>
            <p className="text-text-secondary text-lg">
              Welcome to SchoolPilot. Let&apos;s get you set up in under a minute.
            </p>
            <p className="text-text-muted text-sm">
              I&apos;ll sync with your Teamie LMS and tell you exactly what to work on each day. No more stress about what&apos;s due or where to start.
            </p>
            <button
              onClick={() => setStep("extension")}
              className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-lg transition-colors cursor-pointer"
            >
              Let&apos;s do it
            </button>
          </div>
        )}

        {/* Step: Extension */}
        {step === "extension" && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🧩</div>
            <h1 className="text-2xl font-bold text-white">
              Step 1: Get the Chrome Extension
            </h1>
            <p className="text-text-secondary">
              This is what reads your assignments from Teamie. Takes 30 seconds to install.
            </p>

            <a
              href="https://chromewebstore.google.com/detail/schoolpilot/biekgfmpoemjlhpmnanondelgappdpbc"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-4 rounded-xl bg-white text-black font-semibold text-lg hover:bg-gray-100 transition-colors"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Get Chrome Extension
              </span>
            </a>

            <button
              onClick={() => setStep("sync")}
              className="w-full py-3 rounded-xl border border-border text-text-secondary hover:text-white hover:border-accent/50 transition-colors cursor-pointer"
            >
              I&apos;ve got it installed →
            </button>
          </div>
        )}

        {/* Step: Sync */}
        {step === "sync" && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🔄</div>
            <h1 className="text-2xl font-bold text-white">
              Step 2: Sync Your Assignments
            </h1>
            <div className="text-left p-4 rounded-xl bg-bg-card border border-border space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
                <p className="text-text-secondary text-sm">
                  Go to <a href="https://lms.asl.org/dash/#/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">lms.asl.org/dash</a> and log in
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
                <p className="text-text-secondary text-sm">
                  Click the SchoolPilot extension icon in your toolbar
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
                <p className="text-text-secondary text-sm">
                  Hit <span className="text-accent font-medium">&quot;Sync Assignments&quot;</span>
                </p>
              </div>
            </div>

            <button
              onClick={checkForAssignments}
              disabled={checking}
              className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {checking ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span> Checking...
                </span>
              ) : (
                "I've synced my assignments"
              )}
            </button>

            {!checking && !hasAssignments && (
              <p className="text-text-muted text-xs">
                Don&apos;t see the extension? Make sure you&apos;re on lms.asl.org and the extension is pinned to your toolbar.
              </p>
            )}
          </div>
        )}

        {/* Step: Target Grades */}
        {step === "targets" && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🎯</div>
            <h1 className="text-2xl font-bold text-white">
              Set Your Grade Targets
            </h1>
            <p className="text-text-secondary">
              What grade are you aiming for in each class? Grade Guardian will watch these for you.
            </p>

            <div className="text-left space-y-3">
              {courses.map((course) => (
                <div key={course.id} className="p-4 rounded-xl bg-bg-card border border-border">
                  <div className="text-white text-sm font-medium mb-3">{course.name}</div>
                  <div className="flex gap-2">
                    {[90, 85, 80, 75, 70].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setTargetGrades({ ...targetGrades, [course.name]: pct })}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                          (targetGrades[course.name] || 90) === pct
                            ? "bg-accent text-white"
                            : "bg-bg-dark border border-border text-text-muted hover:border-accent/30"
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={saveTargetGrades}
              className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-lg transition-colors cursor-pointer"
            >
              Save & Continue →
            </button>
            <button
              onClick={() => setStep("ready")}
              className="text-text-muted text-sm hover:text-white transition-colors cursor-pointer"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* Step: Ready */}
        {step === "ready" && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🎉</div>
            <h1 className="text-2xl font-bold text-white">
              You&apos;re all set!
            </h1>
            <p className="text-text-secondary">
              Your assignments are synced. I&apos;ve built your first daily plan. Here&apos;s what you can do now:
            </p>

            <div className="text-left space-y-3">
              <div className="p-4 rounded-xl bg-bg-card border border-border">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🛡️</span>
                  <div>
                    <h3 className="text-white font-medium">Grade Guardian</h3>
                    <p className="text-text-muted text-sm">See exactly what to do next — one clear action</p>
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-bg-card border border-border">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📚</span>
                  <div>
                    <h3 className="text-white font-medium">Study Sessions</h3>
                    <p className="text-text-muted text-sm">AI tutor that reads your course materials</p>
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-bg-card border border-border">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📊</span>
                  <div>
                    <h3 className="text-white font-medium">Grade Tracking</h3>
                    <p className="text-text-muted text-sm">Know your scores and what you need</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={completeOnboarding}
              className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-lg transition-colors cursor-pointer"
            >
              Go to my dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
