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
          AI-powered study assistant
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
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold text-lg transition-colors"
          >
            Get Started
            <span aria-hidden="true">&rarr;</span>
          </Link>
          <a
            href="https://chromewebstore.google.com/detail/schoolpilot/biekgfmpoemjlhpmnanondelgappdpbc"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border hover:border-accent/50 text-text-secondary hover:text-white font-medium text-lg transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            Get Chrome Extension
          </a>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 pb-16 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-white text-center mb-8">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          <div>
            <div className="w-10 h-10 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center mx-auto mb-3">1</div>
            <h3 className="text-white font-semibold mb-1">Install the extension</h3>
            <p className="text-text-secondary text-sm">Add SchoolPilot to Chrome from the Web Store.</p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center mx-auto mb-3">2</div>
            <h3 className="text-white font-semibold mb-1">Scan your LMS</h3>
            <p className="text-text-secondary text-sm">Open Teamie, click Scan &amp; Send. AI reads your assignments.</p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center mx-auto mb-3">3</div>
            <h3 className="text-white font-semibold mb-1">Get your plan</h3>
            <p className="text-text-secondary text-sm">Receive an AI-prioritized daily plan via email, or view it on your dashboard.</p>
          </div>
        </div>
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
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <span>AI-powered study planning</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
