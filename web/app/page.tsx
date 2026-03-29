"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Fade-in-on-scroll wrapper (CSS transitions + IntersectionObserver)
// ---------------------------------------------------------------------------
function FadeIn({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

function IconPlan() {
  return (
    <svg
      className="w-8 h-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
      />
    </svg>
  );
}

function IconGrades() {
  return (
    <svg
      className="w-8 h-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
      />
    </svg>
  );
}

function IconFocus() {
  return (
    <svg
      className="w-8 h-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function IconLink() {
  return (
    <svg
      className="w-7 h-7"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.856-2.07a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.782 8.82"
      />
    </svg>
  );
}

function IconSync() {
  return (
    <svg
      className="w-7 h-7"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M21.015 4.356v4.992"
      />
    </svg>
  );
}

function IconRocket() {
  return (
    <svg
      className="w-7 h-7"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Live AI Chat Demo — ported from landing-page-final.jsx
// ---------------------------------------------------------------------------

const DEMO_CONVERSATIONS = [
  {
    question: "What do I need on Friday's calc test to keep my A?",
    answer:
      "You're at 91.3% in AP Calculus. With the test weighted at 25%, you need at least an 84% to stay above 90%. Score 90+ and you lock in a solid A going into finals.",
  },
  {
    question: "What should I work on tonight?",
    answer:
      "Three things, in order: 1) English essay draft due tomorrow (biggest grade impact \u2014 it's 15% of your grade). 2) Physics problem set (quick win, 30 min). 3) Review your history notes for Thursday's quiz.",
  },
  {
    question: "Am I at risk of dropping in any class?",
    answer:
      "Physics is tight \u2014 you're at 89.7%, right on the A/B border. One missed assignment would drop you. Everything else has healthy margins. I'd prioritize Physics submissions this week.",
  },
];

function ThinkingDots() {
  return (
    <div className="flex items-center gap-[5px]">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-[5px] h-[5px] rounded-full bg-[#a78bfa]"
          style={{ animation: `pulse3 1.4s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

function LiveChatDemo() {
  const [convoIndex, setConvoIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "typing" | "thinking" | "answering" | "done">("idle");
  const [displayedAnswer, setDisplayedAnswer] = useState("");
  const [inputValue, setInputValue] = useState("");
  const answerRef = useRef("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const convo = DEMO_CONVERSATIONS[convoIndex];

  const runDemo = useCallback((idx: number) => {
    const c = DEMO_CONVERSATIONS[idx];
    setPhase("idle");
    setDisplayedAnswer("");
    setInputValue("");
    answerRef.current = "";

    // Phase 1: type the question
    let qi = 0;
    setPhase("typing");
    const typeInterval = setInterval(() => {
      qi++;
      setInputValue(c.question.slice(0, qi));
      if (qi >= c.question.length) {
        clearInterval(typeInterval);
        // Phase 2: thinking
        setTimeout(() => {
          setPhase("thinking");
          // Phase 3: stream the answer
          setTimeout(() => {
            setPhase("answering");
            let ai = 0;
            intervalRef.current = setInterval(() => {
              ai++;
              answerRef.current = c.answer.slice(0, ai);
              setDisplayedAnswer(answerRef.current);
              if (ai >= c.answer.length) {
                if (intervalRef.current) clearInterval(intervalRef.current);
                setPhase("done");
                // Cycle to next conversation
                setTimeout(() => {
                  const next = (idx + 1) % DEMO_CONVERSATIONS.length;
                  setConvoIndex(next);
                  runDemo(next);
                }, 4000);
              }
            }, 18);
          }, 2000);
        }, 600);
      }
    }, 45);

    return () => {
      clearInterval(typeInterval);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    const cleanup = runDemo(0);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full max-w-[560px] rounded-2xl border border-[#1e1e22] bg-[#111113] overflow-hidden">
      {/* Window chrome */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e22]">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full shrink-0"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
              animation: "breathe 2s ease-in-out infinite",
            }}
          />
          <span className="text-[13px] font-semibold text-white">SchoolPilot</span>
        </div>
        <span className="text-[11px] text-[#52525b]">AI Assistant</span>
      </div>

      {/* Messages area */}
      <div className="p-5 min-h-[200px] flex flex-col gap-4">
        {/* User message */}
        {(phase === "thinking" || phase === "answering" || phase === "done") && (
          <div className="flex justify-end" style={{ animation: "fadeUp 0.3s ease" }}>
            <div className="bg-[#1c1c2e] text-white px-4 py-2.5 rounded-[14px_14px_4px_14px] text-sm leading-relaxed max-w-[85%]">
              {convo.question}
            </div>
          </div>
        )}

        {/* Thinking state */}
        {phase === "thinking" && (
          <div className="flex items-center gap-2.5" style={{ animation: "fadeUp 0.3s ease" }}>
            <div
              className="w-7 h-7 rounded-full shrink-0"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
                animation: "breathe 2s ease-in-out infinite",
              }}
            />
            <div className="flex flex-col gap-1.5">
              <ThinkingDots />
              <span className="text-[11px] text-[#52525b]">Looking at your grades...</span>
            </div>
          </div>
        )}

        {/* Streaming answer */}
        {(phase === "answering" || phase === "done") && (
          <div className="flex gap-2.5" style={{ animation: "fadeUp 0.3s ease" }}>
            <div
              className="w-7 h-7 rounded-full shrink-0 mt-0.5"
              style={{ background: "linear-gradient(135deg, #7c3aed, #a78bfa)" }}
            />
            <div className="text-[#a1a1aa] text-sm leading-[1.65]">
              {displayedAnswer}
              {phase === "answering" && (
                <span
                  className="inline-block w-[2px] h-4 bg-[#a78bfa] ml-[2px] align-text-bottom"
                  style={{ animation: "cursorBlink 0.8s step-end infinite" }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-t border-[#1e1e22]">
        <div
          className="flex-1 rounded-[10px] px-3.5 py-2.5 text-[13px] min-h-[20px] transition-colors duration-300"
          style={{
            background: "#09090b",
            border: `1px solid ${phase === "typing" ? "rgba(124,58,237,0.38)" : "#1e1e22"}`,
            color: phase === "idle" ? "#52525b" : "#fafafa",
          }}
        >
          {phase === "idle" && "Ask about your classes..."}
          {phase === "typing" && (
            <>
              {inputValue}
              <span
                className="inline-block w-[1px] h-3.5 bg-white ml-[1px] align-text-bottom"
                style={{ animation: "cursorBlink 0.6s step-end infinite" }}
              />
            </>
          )}
          {(phase === "thinking" || phase === "answering" || phase === "done") && convo.question}
        </div>
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center transition-colors duration-300"
          style={{ background: phase === "typing" ? "#fafafa" : "#1e1e22" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke={phase === "typing" ? "#09090b" : "#52525b"}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] overflow-x-hidden">
      {/* Keyframe animations for LiveChatDemo */}
      <style jsx global>{`
        @keyframes pulse3 {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes breathe {
          0%, 100% { box-shadow: 0 0 8px rgba(124,58,237,0.25); }
          50% { box-shadow: 0 0 24px rgba(124,58,237,0.5); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>

      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/80 border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#7c3aed]/20 flex items-center justify-center">
              <svg
                className="w-[18px] h-[18px] text-[#7c3aed]"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342"
                />
              </svg>
            </div>
            <span className="text-lg font-semibold text-white tracking-tight">
              SchoolPilot
            </span>
          </div>
          <Link
            href="/auth/login"
            className="px-5 py-2 rounded-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-medium transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* ------------------------------------------------------------------- */}
      {/* Hero */}
      {/* ------------------------------------------------------------------- */}
      <section className="relative flex flex-col items-center justify-center min-h-[80vh] px-5 pt-16 pb-20 text-center">
        {/* Gradient glow */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.08] pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, #7c3aed 0%, transparent 70%)",
          }}
        />

        <FadeIn>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-6 max-w-3xl">
            Your AI study assistant that{" "}
            <span className="text-[#7c3aed]">actually knows</span> your classes.
          </h1>
        </FadeIn>

        <FadeIn delay={120}>
          <p className="text-[#a1a1aa] text-lg sm:text-xl max-w-xl leading-relaxed mb-10">
            Connects to your school&apos;s LMS, tracks your grades, and builds a
            personalized daily plan so you can stop stressing and start studying.
          </p>
        </FadeIn>

        <FadeIn delay={240}>
          <Link
            href="/auth/login"
            className="inline-block px-10 py-4 rounded-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-lg font-semibold transition-all hover:shadow-lg hover:shadow-[#7c3aed]/25 hover:-translate-y-0.5 active:translate-y-0"
          >
            Get started free
          </Link>
        </FadeIn>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Live Chat Demo */}
      {/* ------------------------------------------------------------------- */}
      <section className="px-5 pb-24 md:pb-32 flex flex-col items-center">
        <FadeIn>
          <div className="text-center mb-10">
            <p className="text-[#7c3aed] text-sm font-medium tracking-wide uppercase mb-3">
              See It In Action
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              AI that knows your classes
            </h2>
          </div>
        </FadeIn>
        <FadeIn delay={150}>
          <LiveChatDemo />
        </FadeIn>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Feature Cards */}
      {/* ------------------------------------------------------------------- */}
      <section className="px-5 pb-24 md:pb-32 max-w-5xl mx-auto">
        <FadeIn>
          <div className="text-center mb-14">
            <p className="text-[#7c3aed] text-sm font-medium tracking-wide uppercase mb-3">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Everything you need in one place
            </h2>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Plan */}
          <FadeIn delay={0}>
            <div className="group p-7 rounded-2xl border border-[#1e1e22] bg-[#111113] hover:border-[#7c3aed]/30 transition-all duration-300 h-full">
              <div className="w-14 h-14 rounded-xl bg-[#7c3aed]/10 flex items-center justify-center text-[#7c3aed] mb-5 group-hover:bg-[#7c3aed]/20 transition-colors">
                <IconPlan />
              </div>
              <h3 className="text-white text-xl font-semibold mb-2">
                AI Daily Plan
              </h3>
              <p className="text-[#a1a1aa] text-sm leading-relaxed">
                Wake up to a prioritized list of what to work on today, built
                from your real assignments, due dates, and grade weights.
              </p>
            </div>
          </FadeIn>

          {/* Grades */}
          <FadeIn delay={100}>
            <div className="group p-7 rounded-2xl border border-[#1e1e22] bg-[#111113] hover:border-[#7c3aed]/30 transition-all duration-300 h-full">
              <div className="w-14 h-14 rounded-xl bg-[#7c3aed]/10 flex items-center justify-center text-[#7c3aed] mb-5 group-hover:bg-[#7c3aed]/20 transition-colors">
                <IconGrades />
              </div>
              <h3 className="text-white text-xl font-semibold mb-2">
                Real-Time Grades
              </h3>
              <p className="text-[#a1a1aa] text-sm leading-relaxed">
                See every grade in one place. Run what-if scenarios and find out
                exactly what you need on your next test to hit your target.
              </p>
            </div>
          </FadeIn>

          {/* Focus */}
          <FadeIn delay={200}>
            <div className="group p-7 rounded-2xl border border-[#1e1e22] bg-[#111113] hover:border-[#7c3aed]/30 transition-all duration-300 h-full">
              <div className="w-14 h-14 rounded-xl bg-[#7c3aed]/10 flex items-center justify-center text-[#7c3aed] mb-5 group-hover:bg-[#7c3aed]/20 transition-colors">
                <IconFocus />
              </div>
              <h3 className="text-white text-xl font-semibold mb-2">
                Study Timer
              </h3>
              <p className="text-[#a1a1aa] text-sm leading-relaxed">
                Built-in Pomodoro and deep work timers that track your study
                streaks. Stay focused and see your consistency grow over time.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* How It Works */}
      {/* ------------------------------------------------------------------- */}
      <section className="px-5 py-24 md:py-32 max-w-5xl mx-auto">
        <FadeIn>
          <div className="text-center mb-14">
            <p className="text-[#7c3aed] text-sm font-medium tracking-wide uppercase mb-3">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Three steps. That&apos;s it.
            </h2>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Step 1 */}
          <FadeIn delay={0}>
            <div className="relative p-7 rounded-2xl border border-[#1e1e22] bg-[#111113]/60">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#7c3aed]/15 flex items-center justify-center text-[#7c3aed] shrink-0">
                  <IconLink />
                </div>
                <span className="text-[#7c3aed]/50 text-xs font-mono tracking-wider">
                  01
                </span>
              </div>
              <h3 className="text-white text-lg font-semibold mb-2">
                Connect your LMS
              </h3>
              <p className="text-[#a1a1aa] text-sm leading-relaxed">
                Log into your school&apos;s learning platform through SchoolPilot.
                No API keys, no IT department needed.
              </p>
            </div>
          </FadeIn>

          {/* Step 2 */}
          <FadeIn delay={120}>
            <div className="relative p-7 rounded-2xl border border-[#1e1e22] bg-[#111113]/60">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#7c3aed]/15 flex items-center justify-center text-[#7c3aed] shrink-0">
                  <IconSync />
                </div>
                <span className="text-[#7c3aed]/50 text-xs font-mono tracking-wider">
                  02
                </span>
              </div>
              <h3 className="text-white text-lg font-semibold mb-2">
                AI syncs your classes
              </h3>
              <p className="text-[#a1a1aa] text-sm leading-relaxed">
                Assignments, due dates, and grades are pulled automatically and
                kept up to date every day.
              </p>
            </div>
          </FadeIn>

          {/* Step 3 */}
          <FadeIn delay={240}>
            <div className="relative p-7 rounded-2xl border border-[#1e1e22] bg-[#111113]/60">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#7c3aed]/15 flex items-center justify-center text-[#7c3aed] shrink-0">
                  <IconRocket />
                </div>
                <span className="text-[#7c3aed]/50 text-xs font-mono tracking-wider">
                  03
                </span>
              </div>
              <h3 className="text-white text-lg font-semibold mb-2">
                Get your daily plan
              </h3>
              <p className="text-[#a1a1aa] text-sm leading-relaxed">
                A personalized study plan lands in your inbox and dashboard every
                morning. Just follow it.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Social Proof */}
      {/* ------------------------------------------------------------------- */}
      <section className="px-5 py-20 md:py-28">
        <FadeIn>
          <div className="max-w-2xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-[#1e1e22] bg-[#111113]/50 text-[#a1a1aa] text-sm mb-8">
              <span className="inline-block w-2 h-2 rounded-full bg-[#22c55e]" />
              100% free. No catch.
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-5">
              Built for <span className="text-[#7c3aed]">ASL students</span>
            </h2>
            <p className="text-[#a1a1aa] text-lg leading-relaxed mb-10 max-w-lg mx-auto">
              SchoolPilot was built specifically for students at the American
              School of London. It connects directly to Teamie and understands
              your coursework. No cost, no ads, no strings attached.
            </p>
            <Link
              href="/auth/login"
              className="inline-block px-10 py-4 rounded-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-lg font-semibold transition-all hover:shadow-lg hover:shadow-[#7c3aed]/25 hover:-translate-y-0.5 active:translate-y-0"
            >
              Get started free
            </Link>
          </div>
        </FadeIn>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Footer */}
      {/* ------------------------------------------------------------------- */}
      <footer className="px-5 py-10 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[#71717a] text-sm">
            <div className="w-5 h-5 rounded bg-[#7c3aed]/20 flex items-center justify-center">
              <svg
                className="w-3 h-3 text-[#7c3aed]"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347"
                />
              </svg>
            </div>
            <span>SchoolPilot</span>
          </div>
          <p className="text-[#71717a] text-xs">
            &copy; {new Date().getFullYear()} SchoolPilot. Built for students,
            by students.
          </p>
          <div className="flex items-center gap-5 text-[#71717a] text-xs">
            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/auth/login"
              className="hover:text-white transition-colors"
            >
              Log In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
