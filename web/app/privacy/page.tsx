// Privacy policy page — required for Chrome Web Store listing
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — SchoolPilot",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-bg-dark">
      <nav className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto">
        <Link href="/" className="text-xl font-bold text-white">
          SchoolPilot
        </Link>
        <Link
          href="/auth/login"
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
        >
          Sign In
        </Link>
      </nav>

      <main className="px-6 py-12 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Privacy Policy</h1>
        <p className="text-text-muted text-sm mb-8">Last updated: February 4, 2026</p>

        <div className="space-y-8 text-text-secondary text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">What SchoolPilot Does</h2>
            <p>
              SchoolPilot is a Chrome extension and web app that helps students organize
              their schoolwork. It reads assignment data from your Teamie LMS dashboard
              and uses AI to create study plans, track grades, and generate study materials.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Data We Collect</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <span className="text-white font-medium">Assignment data from Teamie:</span> titles,
                due dates, course names, and assignment types. This is scraped from your Teamie
                dashboard only when you click &quot;Scan &amp; Send&quot; or &quot;Sync.&quot;
              </li>
              <li>
                <span className="text-white font-medium">Email address:</span> used to send you
                daily study plans and for account authentication via Google Sign-In.
              </li>
              <li>
                <span className="text-white font-medium">Grade data:</span> grades you manually
                enter or sync from Teamie, stored in your account for grade calculations.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Assignment data is sent to our backend server to generate AI-powered study plans via the Anthropic (Claude) API.</li>
              <li>Study plan emails are sent via Resend (email delivery service).</li>
              <li>Your data is stored in Supabase (database) to power the web dashboard.</li>
              <li>We do not sell, share, or use your data for advertising.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Third-Party Services</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="text-white font-medium">Anthropic (Claude AI):</span> processes assignment data to generate study plans. Subject to Anthropic&apos;s privacy policy.</li>
              <li><span className="text-white font-medium">Resend:</span> delivers emails. Subject to Resend&apos;s privacy policy.</li>
              <li><span className="text-white font-medium">Supabase:</span> stores account and assignment data. Subject to Supabase&apos;s privacy policy.</li>
              <li><span className="text-white font-medium">Google:</span> provides authentication via Google Sign-In. Subject to Google&apos;s privacy policy.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Chrome Extension Permissions</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="text-white font-medium">activeTab:</span> reads assignment data from the currently open Teamie page when you click the extension.</li>
              <li><span className="text-white font-medium">scripting:</span> injects the scraping script into the Teamie page to extract assignments.</li>
              <li><span className="text-white font-medium">storage:</span> saves your settings and grade data locally in Chrome.</li>
              <li><span className="text-white font-medium">alarms &amp; notifications:</span> powers optional background scanning and reminders.</li>
              <li><span className="text-white font-medium">Host permission (lms.asl.org):</span> allows reading your Teamie dashboard. No other websites are accessed.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Data Retention</h2>
            <p>
              Your data is retained in your account as long as you use SchoolPilot.
              You can request deletion of your data at any time by contacting us.
              Local Chrome extension data can be cleared by removing the extension.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Contact</h2>
            <p>
              For questions about this privacy policy or to request data deletion,
              reach out via the SchoolPilot GitHub repository or contact the developer directly.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-6 mt-12">
        <div className="max-w-3xl mx-auto flex items-center justify-between text-text-muted text-sm">
          <span>SchoolPilot</span>
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
        </div>
      </footer>
    </div>
  );
}
