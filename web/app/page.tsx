"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

// ─── HOOKS ──────────────────────────────────────────────────────

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const h = () => setY(window.scrollY);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return y;
}

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible] as const;
}

// ─── SMALL COMPONENTS ───────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center gap-[5px]">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-[5px] h-[5px] rounded-full bg-accent-light"
          style={{ animation: `pulse3 1.4s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

function ThinkingOrb({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
        animation: "breathe 2s ease-in-out infinite",
      }}
    />
  );
}

function GlowDivider() {
  return <div className="glow-divider" />;
}

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide"
      style={{
        background: `${color}18`,
        color: color,
      }}
    >
      {children}
    </span>
  );
}

// ─── LIVE AI CHAT DEMO ──────────────────────────────────────────

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

    let qi = 0;
    setPhase("typing");
    const typeInterval = setInterval(() => {
      qi++;
      setInputValue(c.question.slice(0, qi));
      if (qi >= c.question.length) {
        clearInterval(typeInterval);
        setTimeout(() => {
          setPhase("thinking");
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-surface border border-border rounded-2xl w-full max-w-[560px] overflow-hidden">
      {/* Window chrome */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ThinkingOrb />
          <span className="text-[13px] font-semibold text-text">SchoolPilot</span>
        </div>
        <span className="text-[11px] text-dim">AI Assistant</span>
      </div>

      {/* Messages */}
      <div className="p-5 min-h-[200px] flex flex-col gap-4">
        {(phase === "thinking" || phase === "answering" || phase === "done") && (
          <div className="flex justify-end" style={{ animation: "fadeUp 0.3s ease" }}>
            <div className="bg-[#1c1c2e] text-text px-4 py-2.5 rounded-[14px_14px_4px_14px] text-sm leading-relaxed max-w-[85%]">
              {convo.question}
            </div>
          </div>
        )}

        {phase === "thinking" && (
          <div className="flex items-center gap-2.5" style={{ animation: "fadeUp 0.3s ease" }}>
            <ThinkingOrb />
            <div className="flex flex-col gap-1.5">
              <ThinkingDots />
              <span className="text-[11px] text-dim">Looking at your grades...</span>
            </div>
          </div>
        )}

        {(phase === "answering" || phase === "done") && (
          <div className="flex gap-2.5" style={{ animation: "fadeUp 0.3s ease" }}>
            <div className="mt-0.5">
              <ThinkingOrb />
            </div>
            <div className="text-text-secondary text-sm leading-[1.65]">
              {displayedAnswer}
              {phase === "answering" && (
                <span
                  className="inline-block w-0.5 h-4 bg-accent-light ml-0.5 align-text-bottom"
                  style={{ animation: "cursorBlink 0.8s step-end infinite" }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="px-4 py-3 border-t border-border flex items-center gap-2.5">
        <div
          className="flex-1 bg-bg rounded-[10px] px-3.5 py-2.5 text-[13px] min-h-5 transition-colors duration-300"
          style={{
            border: `1px solid ${phase === "typing" ? "rgba(124,58,237,0.4)" : "#1e1e22"}`,
            color: phase !== "idle" ? "#fafafa" : "#52525b",
          }}
        >
          {phase === "idle" && "Ask about your classes..."}
          {phase === "typing" && (
            <>
              {inputValue}
              <span
                className="inline-block w-px h-3.5 bg-text ml-px align-text-bottom"
                style={{ animation: "cursorBlink 0.6s step-end infinite" }}
              />
            </>
          )}
          {(phase === "thinking" || phase === "answering" || phase === "done") &&
            convo.question}
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

// ─── ANIMATED DASHBOARD ─────────────────────────────────────────

const MOCK_CLASSES = [
  { name: "AP Calculus BC", grade: 91.3, letter: "A", trend: "up" as const },
  { name: "English Literature", grade: 87.1, letter: "B+", trend: "up" as const },
  { name: "Physics", grade: 89.7, letter: "B+", trend: "down" as const },
  { name: "US History", grade: 94.2, letter: "A", trend: "stable" as const },
  { name: "Advanced Journalism", grade: 96.8, letter: "A", trend: "up" as const },
];

const MOCK_PLAN = [
  { time: "4:00 PM", task: "English essay draft", tag: "Due tomorrow", priority: "high" as const },
  { time: "5:30 PM", task: "Physics problem set 12", tag: "Quick win", priority: "medium" as const },
  { time: "7:00 PM", task: "Review history Ch. 14 notes", tag: "Quiz Thursday", priority: "medium" as const },
];

function AnimatedDashboard() {
  const [ref, visible] = useInView(0.2);
  const [revealStep, setRevealStep] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const timers = [
      setTimeout(() => setRevealStep(1), 200),
      setTimeout(() => setRevealStep(2), 600),
      setTimeout(() => setRevealStep(3), 1000),
      setTimeout(() => setRevealStep(4), 1400),
      setTimeout(() => setRevealStep(5), 1800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  const trendIcon = (t: string) => {
    if (t === "up") return <span className="text-green text-xs">+</span>;
    if (t === "down") return <span className="text-red text-xs">-</span>;
    return <span className="text-dim text-xs">=</span>;
  };

  return (
    <div
      ref={ref}
      className="bg-surface border border-border rounded-2xl w-full max-w-[700px] overflow-hidden"
    >
      {/* Dashboard top bar */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-[13px] font-semibold text-text">Today</span>
          <span className="text-[13px] text-dim">Grades</span>
          <span className="text-[13px] text-dim">Study</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green" />
          <span className="text-[11px] text-muted">Synced 2 min ago</span>
        </div>
      </div>

      <div className="flex flex-col">
        {/* Stat cards */}
        <div
          className="p-5 pb-4 flex gap-4 flex-wrap transition-all duration-500"
          style={{
            opacity: revealStep >= 1 ? 1 : 0,
            transform: revealStep >= 1 ? "translateY(0)" : "translateY(12px)",
          }}
        >
          {[
            { label: "GPA", value: "3.72", sub: "Weighted" },
            { label: "Streak", value: "12 days", sub: "Personal best" },
            { label: "Due this week", value: "7", sub: "3 done" },
          ].map((stat, i) => (
            <div
              key={i}
              className="flex-1 min-w-[120px] p-3.5 bg-bg rounded-[10px] border border-border"
            >
              <div className="text-[11px] text-muted mb-1.5 uppercase tracking-[0.05em]">
                {stat.label}
              </div>
              <div className="text-[22px] font-bold text-text tracking-tight">
                {stat.value}
              </div>
              <div className="text-[11px] text-dim mt-0.5">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Today's plan */}
        <div
          className="px-5 pb-4 transition-all duration-500"
          style={{
            opacity: revealStep >= 2 ? 1 : 0,
            transform: revealStep >= 2 ? "translateY(0)" : "translateY(12px)",
          }}
        >
          <div className="text-[12px] text-muted font-semibold uppercase tracking-[0.05em] mb-2.5">
            Your plan for tonight
          </div>
          {MOCK_PLAN.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg mb-1 transition-all duration-400"
              style={{
                background: i === 0 ? "rgba(124,58,237,0.03)" : "transparent",
                border: i === 0 ? "1px solid rgba(124,58,237,0.12)" : "1px solid transparent",
                opacity: revealStep >= 2 + i * 0.5 ? 1 : 0,
                transform: revealStep >= 2 + i * 0.5 ? "translateX(0)" : "translateX(-10px)",
                transitionDelay: `${i * 0.15}s`,
              }}
            >
              <span className="text-xs text-dim font-mono min-w-14">{item.time}</span>
              <span className="text-[13px] text-text flex-1">{item.task}</span>
              <Badge color={item.priority === "high" ? "#7c3aed" : "#71717a"}>
                {item.tag}
              </Badge>
            </div>
          ))}
        </div>

        {/* Grade cards */}
        <div className="px-5 pb-5">
          <div
            className="text-[12px] text-muted font-semibold uppercase tracking-[0.05em] mb-2.5 transition-opacity duration-400"
            style={{ opacity: revealStep >= 3 ? 1 : 0 }}
          >
            Grade snapshot
          </div>
          {MOCK_CLASSES.map((cls, i) => (
            <div
              key={i}
              className="flex items-center px-3.5 py-2.5 rounded-lg mb-0.5 transition-all duration-400"
              style={{
                opacity: revealStep >= 4 ? 1 : 0,
                transform: revealStep >= 4 ? "translateY(0)" : "translateY(8px)",
                transitionDelay: `${i * 0.1}s`,
              }}
            >
              <span className="text-[13px] text-text flex-1">{cls.name}</span>
              <div className="flex items-center gap-2">
                {cls.trend === "down" && cls.grade < 90 && (
                  <Badge color="#f59e0b">At risk</Badge>
                )}
                {trendIcon(cls.trend)}
                <span
                  className="text-sm font-semibold font-mono min-w-12 text-right"
                  style={{
                    color: cls.grade >= 90 ? "#22c55e" : cls.grade >= 80 ? "#fafafa" : "#f59e0b",
                  }}
                >
                  {cls.grade}%
                </span>
                <span className="text-xs text-dim font-medium min-w-6 text-right">
                  {cls.letter}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── FEATURE BLOCK ──────────────────────────────────────────────

function FeatureBlock({
  number,
  title,
  desc,
  delay,
}: {
  number: string;
  title: string;
  desc: string;
  delay: number;
}) {
  const [ref, visible] = useInView(0.2);
  return (
    <div
      ref={ref}
      className="flex gap-5 py-7 border-b border-border transition-all duration-500"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transitionDelay: `${delay}s`,
      }}
    >
      <span className="text-5xl font-bold text-accent/[0.08] leading-none min-w-[50px] font-mono">
        {number}
      </span>
      <div>
        <div className="text-base font-semibold text-text mb-1.5">{title}</div>
        <div className="text-sm text-muted leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

// ─── SOCIAL PROOF ───────────────────────────────────────────────

function SocialProof() {
  const [ref, visible] = useInView(0.3);
  return (
    <div
      ref={ref}
      className="flex justify-center gap-12 flex-wrap transition-all duration-600"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
      }}
    >
      {[
        { value: "5", label: "Students in beta" },
        { value: "127", label: "Assignments tracked" },
        { value: "12", label: "Day longest streak" },
      ].map((s, i) => (
        <div key={i} className="text-center">
          <div className="text-3xl font-bold text-text tracking-tight">{s.value}</div>
          <div className="text-xs text-dim mt-1">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────────────

export default function LandingPage() {
  const scrollY = useScrollY();

  return (
    <div className="min-h-screen bg-bg text-text font-sans overflow-x-hidden">
      {/* ─── NAV ─── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 px-6 h-14 flex items-center justify-between transition-all duration-300"
        style={{
          background: scrollY > 30 ? "rgba(9,9,11,0.93)" : "transparent",
          backdropFilter: scrollY > 30 ? "blur(16px) saturate(1.2)" : "none",
          borderBottom: scrollY > 30 ? "1px solid #1e1e22" : "1px solid transparent",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-[22px] h-[22px] rounded-[6px]"
            style={{ background: "linear-gradient(135deg, #7c3aed, #a78bfa)" }}
          />
          <span className="font-semibold text-[15px] tracking-tight">SchoolPilot</span>
        </div>
        <Link
          href="/auth/login"
          className="bg-text text-bg px-5 py-2 rounded-lg text-[13px] font-semibold hover:opacity-85 transition-opacity"
        >
          Get started
        </Link>
      </nav>

      {/* ─── HERO ─── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative">
        {/* Background glow */}
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse, rgba(124,58,237,0.15), transparent 70%)",
          }}
        />

        {/* Beta pill */}
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full border border-border text-xs text-muted mb-9">
          <div className="w-1.5 h-1.5 rounded-full bg-green" />
          Now in beta &mdash; free for all students
        </div>

        <h1 className="text-[clamp(34px,6vw,60px)] font-bold leading-[1.08] tracking-[-0.04em] mb-6 max-w-[640px]">
          Stop studying the wrong thing.
        </h1>
        <p className="text-text-secondary text-[clamp(15px,2vw,17px)] leading-[1.65] max-w-[460px] mb-10">
          SchoolPilot syncs with your LMS, knows every assignment and grade, and
          tells you exactly what to work on &mdash; so nothing falls through the
          cracks.
        </p>
        <div className="flex gap-3 flex-wrap justify-center">
          <Link
            href="/auth/login"
            className="bg-text text-bg px-8 py-3.5 rounded-[10px] text-sm font-semibold hover:opacity-85 transition-opacity"
          >
            Get started free
          </Link>
          <a
            href="#chat-demo"
            className="border border-border text-text-secondary px-8 py-3.5 rounded-[10px] text-sm font-medium hover:border-border-light hover:text-text transition-all"
          >
            See how it works
          </a>
        </div>

        {/* Scroll indicator */}
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 transition-opacity duration-300"
          style={{ opacity: scrollY > 50 ? 0 : 0.4 }}
        >
          <div className="text-[11px] text-dim tracking-[0.05em]">Scroll</div>
          <div
            className="w-px h-6"
            style={{ background: "linear-gradient(to bottom, #52525b, transparent)" }}
          />
        </div>
      </section>

      <GlowDivider />

      {/* ─── CHAT DEMO ─── */}
      <section
        id="chat-demo"
        className="py-24 px-6 flex flex-col items-center gap-12"
      >
        <div className="text-center max-w-[420px]">
          <p className="text-section-label mb-3">AI that knows your classes</p>
          <h2 className="text-[clamp(24px,4vw,32px)] font-bold tracking-[-0.03em] mb-2">
            Ask anything about your grades
          </h2>
          <p className="text-muted text-sm leading-relaxed">
            It has context on every assignment, every grade, every deadline. Not
            a generic chatbot.
          </p>
        </div>
        <LiveChatDemo />
      </section>

      <GlowDivider />

      {/* ─── DASHBOARD DEMO ─── */}
      <section className="py-24 px-6 flex flex-col items-center gap-12">
        <div className="text-center max-w-[420px]">
          <p className="text-section-label mb-3">Everything in one place</p>
          <h2 className="text-[clamp(24px,4vw,32px)] font-bold tracking-[-0.03em] mb-2">
            Your grades, your plan, your week
          </h2>
          <p className="text-muted text-sm leading-relaxed">
            Syncs with Teamie automatically. No manual entry. Always up to date.
          </p>
        </div>
        <AnimatedDashboard />
      </section>

      <GlowDivider />

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-20 px-6 max-w-[540px] mx-auto">
        <p className="text-section-label mb-10">How it works</p>
        <FeatureBlock
          number="01"
          title="Connect your LMS"
          desc="Sign in with your Teamie credentials. SchoolPilot securely syncs your courses, assignments, and grades."
          delay={0}
        />
        <FeatureBlock
          number="02"
          title="Get your daily plan"
          desc="Every morning, an AI-generated plan tells you what to work on \u2014 prioritized by deadlines and grade impact."
          delay={0.1}
        />
        <FeatureBlock
          number="03"
          title="Track your grades live"
          desc="See exactly where you stand in every class. Know what you need on the next test before you walk in."
          delay={0.2}
        />
        <FeatureBlock
          number="04"
          title="Study smarter"
          desc="Generate study guides, flashcards, and practice quizzes from your actual course material. Focus on what matters."
          delay={0.3}
        />
        <FeatureBlock
          number="05"
          title="Never miss a deadline"
          desc="Daily email briefings, grade alerts, and a focus timer to keep you on track without the stress."
          delay={0.4}
        />
      </section>

      <GlowDivider />

      {/* ─── SOCIAL PROOF ─── */}
      <section className="py-20 px-6">
        <SocialProof />
      </section>

      <GlowDivider />

      {/* ─── FINAL CTA ─── */}
      <section className="py-24 pb-28 text-center px-6">
        <h2 className="text-[clamp(28px,4vw,40px)] font-bold tracking-[-0.03em] mb-4 max-w-[480px] mx-auto">
          Know exactly where you stand.
        </h2>
        <p className="text-muted text-[15px] mb-9 leading-relaxed max-w-[360px] mx-auto">
          Free for all students. No credit card.
          <br />
          Takes two minutes to set up.
        </p>
        <Link
          href="/auth/login"
          className="inline-block bg-text text-bg px-9 py-3.5 rounded-[10px] text-[15px] font-semibold hover:opacity-85 transition-opacity"
        >
          Get started
        </Link>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-border px-6 py-7 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded"
            style={{ background: "linear-gradient(135deg, #7c3aed, #a78bfa)" }}
          />
          <span className="text-[13px] font-medium text-muted">SchoolPilot</span>
        </div>
        <span className="text-xs text-dim">
          Built by a student, for students.
        </span>
      </footer>
    </div>
  );
}
