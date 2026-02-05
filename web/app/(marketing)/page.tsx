// Landing page — minimalist, calm, premium
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0F1419]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-4xl mx-auto">
        <span className="text-lg font-medium text-[#E7E9EA] tracking-tight">
          SchoolPilot
        </span>
        <Link
          href="/auth/login"
          className="px-5 py-2.5 rounded-full bg-[#6B8F71] hover:bg-[#5A7A60] text-white text-sm font-medium transition-colors"
        >
          Get Started
        </Link>
      </nav>

      {/* Hero - Full viewport height */}
      <section className="relative flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
        <h1 className="text-5xl sm:text-6xl font-light text-[#E7E9EA] tracking-tight leading-tight mb-6">
          Everything is handled.
        </h1>
        <p className="text-[#71767B] text-lg sm:text-xl max-w-md leading-relaxed mb-12">
          Your assignments. Your deadlines. Your plan.
          <br />
          All in one place.
        </p>
        <Link
          href="/auth/login"
          className="px-8 py-4 rounded-full bg-[#6B8F71] hover:bg-[#5A7A60] text-white text-base font-medium transition-all hover:shadow-lg hover:shadow-[#6B8F71]/20"
        >
          Get Started
        </Link>

        {/* Scroll indicator */}
        <div className="absolute bottom-12 text-[#71767B] animate-bounce">
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
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </div>
      </section>

      {/* How it works - Revealed on scroll */}
      <section className="px-6 py-24 max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-12 sm:gap-8 text-center sm:text-left">
          <div className="flex-1">
            <div className="text-[#6B8F71] text-sm font-medium tracking-wide mb-2">
              01
            </div>
            <h3 className="text-[#E7E9EA] text-lg font-medium mb-2">Sync</h3>
            <p className="text-[#71767B] text-sm leading-relaxed">
              Connect your LMS in one click
            </p>
          </div>
          <div className="hidden sm:block text-[#71767B]">→</div>
          <div className="flex-1">
            <div className="text-[#6B8F71] text-sm font-medium tracking-wide mb-2">
              02
            </div>
            <h3 className="text-[#E7E9EA] text-lg font-medium mb-2">Plan</h3>
            <p className="text-[#71767B] text-sm leading-relaxed">
              AI builds your daily game plan
            </p>
          </div>
          <div className="hidden sm:block text-[#71767B]">→</div>
          <div className="flex-1">
            <div className="text-[#6B8F71] text-sm font-medium tracking-wide mb-2">
              03
            </div>
            <h3 className="text-[#E7E9EA] text-lg font-medium mb-2">Do</h3>
            <p className="text-[#71767B] text-sm leading-relaxed">
              Check it off, feel good
            </p>
          </div>
        </div>
      </section>

      {/* Footer - Minimal */}
      <footer className="px-6 py-8 text-center">
        <div className="text-[#71767B] text-xs">
          <Link
            href="/privacy"
            className="hover:text-[#E7E9EA] transition-colors"
          >
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
