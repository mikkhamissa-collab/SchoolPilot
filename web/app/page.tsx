"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// SchoolPilot Landing Page
// Full-featured marketing page with hero, how-it-works, features, personality
// showcase, CTA, and footer sections.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fade-in-on-scroll wrapper
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
      { threshold: 0.15 }
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
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG Icons (inline, no external deps)
// ---------------------------------------------------------------------------

function IconBot() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  );
}

function IconSync() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M21.015 4.356v4.992" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.732-3.558" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.856-2.07a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.782 8.82" />
    </svg>
  );
}

function IconCPU() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const features = [
  {
    icon: <IconSync />,
    title: "AI Browser Agent",
    description:
      "Our agent logs into your LMS and syncs assignments, grades, and syllabi automatically. No copy-pasting, no manual entry.",
  },
  {
    icon: <IconChat />,
    title: "Smart Chat Tutor",
    description:
      "Ask anything about your coursework. Get explanations, practice problems, and essay feedback from an AI that knows your classes.",
  },
  {
    icon: <IconChart />,
    title: "Grade Tracker",
    description:
      'See every grade in one place. Run what-if scenarios: "What do I need on the final to get an A?" Answered instantly.',
  },
  {
    icon: <IconMail />,
    title: "Daily Briefings",
    description:
      "Wake up to a personalized email with today's priorities, upcoming deadlines, and a study plan built around your schedule.",
  },
  {
    icon: <IconCalendar />,
    title: "Study Planning",
    description:
      "AI generates focused study sessions based on what's due, what you're struggling with, and how much time you have.",
  },
  {
    icon: <IconGlobe />,
    title: "Works With Any LMS",
    description:
      "Canvas, Blackboard, Teamie, Google Classroom, Schoology — if it runs in a browser, SchoolPilot can connect to it.",
  },
];

const personalities = [
  {
    emoji: "\u{1F3C6}",
    name: "Coach",
    tagline: "Firm but fair. Keeps you on track.",
    quote:
      "You have two assignments due tomorrow and you haven't started either. Let's fix that right now. Here's the plan.",
    color: "text-accent",
    bg: "bg-accent/10",
    border: "border-accent/20",
  },
  {
    emoji: "\u{1F91D}",
    name: "Friend",
    tagline: "Casual, supportive, zero judgment.",
    quote:
      "Hey! That calc homework looks rough but honestly you got this. Want to start with the easy problems to build momentum?",
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/20",
  },
  {
    emoji: "\u{1F9D1}\u200D\u{1F393}",
    name: "Mentor",
    tagline: "Wise, strategic, sees the big picture.",
    quote:
      "Focus on the essay first — it's 30% of your grade. The worksheet can wait. Invest your time where it compounds.",
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/20",
  },
  {
    emoji: "\u{1FABE}",
    name: "Drill Sergeant",
    tagline: "No excuses. Pure accountability.",
    quote:
      "Three overdue assignments. Zero progress. Close TikTok, open your textbook, and start writing. Move it.",
    color: "text-error",
    bg: "bg-error/10",
    border: "border-error/20",
  },
];

const steps = [
  {
    icon: <IconLink />,
    number: "01",
    title: "Connect Your LMS",
    description:
      "Log into your school's learning management system. Our browser agent handles the rest — no API keys or IT department needed.",
  },
  {
    icon: <IconCPU />,
    number: "02",
    title: "AI Syncs Everything",
    description:
      "Assignments, due dates, grades, syllabi — all pulled automatically and kept up to date every day.",
  },
  {
    icon: <IconHeart />,
    number: "03",
    title: "Get Personalized Help",
    description:
      "Daily plans, grade insights, study sessions, and an AI tutor that actually knows your coursework.",
  },
];

// ---------------------------------------------------------------------------
// Main Landing Page Component
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const howItWorksRef = useRef<HTMLElement>(null);

  const scrollToHowItWorks = () => {
    howItWorksRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-bg-dark overflow-x-hidden">
      {/* ----------------------------------------------------------------- */}
      {/* Navigation */}
      {/* ----------------------------------------------------------------- */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-bg-dark/80 border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <svg
                className="w-4.5 h-4.5 text-accent"
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
            className="px-5 py-2 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* ----------------------------------------------------------------- */}
      {/* Hero Section */}
      {/* ----------------------------------------------------------------- */}
      <section className="relative flex flex-col items-center justify-center min-h-[85vh] px-6 text-center">
        {/* Subtle gradient glow behind the hero */}
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07] pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)",
          }}
        />

        <FadeIn>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-bg-card/50 text-text-secondary text-sm mb-8">
            <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse" />
            Now in open beta
          </div>
        </FadeIn>

        <FadeIn delay={100}>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[1.1] mb-6 max-w-4xl">
            Your AI Study{" "}
            <span className="text-accent">Companion</span>
          </h1>
        </FadeIn>

        <FadeIn delay={200}>
          <p className="text-text-secondary text-lg sm:text-xl max-w-2xl leading-relaxed mb-10">
            SchoolPilot connects to your LMS, syncs your assignments and grades,
            and gives you a personal AI tutor that actually knows your coursework.
            Less stress. Better grades. More sleep.
          </p>
        </FadeIn>

        <FadeIn delay={300}>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Link
              href="/auth/login"
              className="px-8 py-4 rounded-full bg-accent hover:bg-accent-hover text-white text-base font-semibold transition-all hover:shadow-lg hover:shadow-accent/20 hover:-translate-y-0.5"
            >
              Get Started Free
            </Link>
            <button
              onClick={scrollToHowItWorks}
              className="px-8 py-4 rounded-full border border-border hover:border-text-muted text-text-secondary hover:text-white text-base font-medium transition-all cursor-pointer"
            >
              See How It Works
            </button>
          </div>
        </FadeIn>

        {/* LMS logos strip */}
        <FadeIn delay={450} className="mt-16">
          <p className="text-text-muted text-xs uppercase tracking-widest mb-4">
            Works with your school
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-text-muted text-sm">
            <span className="px-3 py-1 rounded-md bg-bg-card/50 border border-border/50">Canvas</span>
            <span className="px-3 py-1 rounded-md bg-bg-card/50 border border-border/50">Blackboard</span>
            <span className="px-3 py-1 rounded-md bg-bg-card/50 border border-border/50">Google Classroom</span>
            <span className="px-3 py-1 rounded-md bg-bg-card/50 border border-border/50">Teamie</span>
            <span className="px-3 py-1 rounded-md bg-bg-card/50 border border-border/50">Schoology</span>
          </div>
        </FadeIn>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 text-text-muted animate-bounce">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="m19 14-7 7m0 0-7-7m7 7V3"
            />
          </svg>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* How It Works */}
      {/* ----------------------------------------------------------------- */}
      <section
        ref={howItWorksRef}
        id="how-it-works"
        className="px-6 py-24 md:py-32 max-w-5xl mx-auto scroll-mt-20"
      >
        <FadeIn>
          <div className="text-center mb-16">
            <p className="text-accent text-sm font-medium tracking-wide uppercase mb-3">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Three steps. Zero friction.
            </h2>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <FadeIn key={step.number} delay={i * 120}>
              <div className="relative group p-8 rounded-2xl border border-border bg-bg-card/40 hover:bg-bg-card hover:border-accent/30 transition-all duration-300">
                <div className="text-accent mb-5 opacity-80 group-hover:opacity-100 transition-opacity">
                  {step.icon}
                </div>
                <div className="text-accent/40 text-xs font-mono tracking-wider mb-2">
                  {step.number}
                </div>
                <h3 className="text-white text-xl font-semibold mb-3">
                  {step.title}
                </h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Features Grid */}
      {/* ----------------------------------------------------------------- */}
      <section className="px-6 py-24 md:py-32 max-w-6xl mx-auto">
        <FadeIn>
          <div className="text-center mb-16">
            <p className="text-accent text-sm font-medium tracking-wide uppercase mb-3">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
              Everything you need to crush school
            </h2>
            <p className="text-text-secondary text-lg max-w-xl mx-auto">
              One app replaces five tabs, three sticky notes, and that group
              chat where nobody actually shares deadlines.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <FadeIn key={feature.title} delay={i * 80}>
              <div className="group p-6 rounded-2xl border border-border bg-bg-card/30 hover:bg-bg-card hover:border-accent/20 transition-all duration-300 h-full">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent mb-5 group-hover:bg-accent/20 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-white text-lg font-semibold mb-2">
                  {feature.title}
                </h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Personality Showcase */}
      {/* ----------------------------------------------------------------- */}
      <section className="px-6 py-24 md:py-32 max-w-5xl mx-auto">
        <FadeIn>
          <div className="text-center mb-16">
            <p className="text-accent text-sm font-medium tracking-wide uppercase mb-3">
              AI Personalities
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
              Pick the vibe that motivates you
            </h2>
            <p className="text-text-secondary text-lg max-w-xl mx-auto">
              Your AI tutor adapts to your style. Switch between personalities
              any time — or let it match your mood automatically.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {personalities.map((p, i) => (
            <FadeIn key={p.name} delay={i * 100}>
              <div
                className={`group p-6 rounded-2xl border ${p.border} ${p.bg} hover:scale-[1.02] transition-all duration-300`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl" role="img" aria-label={p.name}>
                    {p.emoji}
                  </span>
                  <div>
                    <h3 className={`text-lg font-semibold ${p.color}`}>
                      {p.name}
                    </h3>
                    <p className="text-text-muted text-xs">{p.tagline}</p>
                  </div>
                </div>
                <div className="bg-bg-dark/60 rounded-xl p-4 border border-border/30">
                  <p className="text-text-secondary text-sm leading-relaxed italic">
                    &ldquo;{p.quote}&rdquo;
                  </p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Final CTA */}
      {/* ----------------------------------------------------------------- */}
      <section className="px-6 py-24 md:py-32">
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
              Stop stressing.{" "}
              <span className="text-accent">Start SchoolPilot.</span>
            </h2>
            <p className="text-text-secondary text-lg mb-10 max-w-lg mx-auto">
              Join thousands of students who replaced anxiety with a plan. Free
              to start, no credit card required.
            </p>
            <Link
              href="/auth/login"
              className="inline-block px-10 py-4 rounded-full bg-accent hover:bg-accent-hover text-white text-lg font-semibold transition-all hover:shadow-lg hover:shadow-accent/25 hover:-translate-y-0.5"
            >
              Sign Up Free
            </Link>
          </div>
        </FadeIn>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Footer */}
      {/* ----------------------------------------------------------------- */}
      <footer className="px-6 py-10 border-t border-border/40">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <div className="w-5 h-5 rounded bg-accent/20 flex items-center justify-center">
              <svg
                className="w-3 h-3 text-accent"
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
          <p className="text-text-muted text-xs">
            Built for students, by students. &copy; {new Date().getFullYear()}{" "}
            SchoolPilot
          </p>
          <div className="flex items-center gap-4 text-text-muted text-xs">
            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
            >
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
