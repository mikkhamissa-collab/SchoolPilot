// Landing page — marketing page for visitors
import Link from "next/link";

const features = [
  {
    icon: "📋",
    title: "Smart Daily Plans",
    desc: "AI scans your Teamie assignments and emails you a prioritized daily action plan.",
  },
  {
    icon: "🎯",
    title: "Focus Mode",
    desc: "Break any assignment into 15-45 min chunks with clear done-when criteria.",
  },
  {
    icon: "📊",
    title: "Grade Tracker",
    desc: "Track grades by weighted category. Run what-if scenarios and see what you need.",
  },
  {
    icon: "📖",
    title: "AI Study Guides",
    desc: "Generate study guides with key concepts, high-likelihood topics, and practice questions.",
  },
  {
    icon: "🏃",
    title: "Sprint Mode",
    desc: "Create 7-day study sprints with spaced repetition for upcoming tests.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-dark">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-white">SchoolPilot</span>
        </div>
        <Link
          href="/auth/login"
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
        >
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-20 pb-16 max-w-3xl mx-auto text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium mb-6">
          Built for ASL students
        </div>
        <h1 className="text-5xl font-bold text-white leading-tight mb-6">
          Your AI-powered
          <br />
          <span className="text-accent">study assistant</span>
        </h1>
        <p className="text-text-secondary text-lg mb-8 max-w-xl mx-auto">
          SchoolPilot connects to Teamie LMS and uses AI to plan your day,
          track your grades, generate study guides, and keep you on track.
        </p>
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold text-lg transition-colors"
        >
          Get Started
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </section>

      {/* Features */}
      <section className="px-6 pb-24 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="p-6 rounded-xl bg-bg-card border border-border hover:border-accent/30 transition-colors"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-white font-semibold mb-2">{f.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-text-muted text-sm">
          <span>SchoolPilot</span>
          <span>Made for ASL students</span>
        </div>
      </footer>
    </div>
  );
}
