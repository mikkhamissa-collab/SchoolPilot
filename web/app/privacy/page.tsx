// Privacy policy page
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
        <p className="text-text-muted text-sm mb-8">Last updated: March 9, 2026</p>

        <div className="space-y-8 text-text-secondary text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">What SchoolPilot Does</h2>
            <p>
              SchoolPilot is a web app that helps students organize their schoolwork.
              It connects to your Teamie LMS via a server-side agent to sync assignments
              and grades, and uses AI to create study plans, track grades, and generate
              study materials.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Data We Collect</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <span className="text-white font-medium">LMS credentials:</span> your
                Teamie username and password, encrypted at rest (AES-256), used only to
                sync your academic data.
              </li>
              <li>
                <span className="text-white font-medium">Assignment and grade data:</span> titles,
                due dates, course names, scores, and categories synced from your LMS.
              </li>
              <li>
                <span className="text-white font-medium">Email address:</span> used for
                account authentication and optional daily study plan emails.
              </li>
              <li>
                <span className="text-white font-medium">Usage data:</span> focus sessions,
                study buddy activity, and chat messages to power your personalized experience.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Academic data is processed by the Anthropic (Claude) API to generate AI-powered study plans and chat responses.</li>
              <li>Daily briefing emails are sent via Resend (email delivery service).</li>
              <li>Your data is stored in Supabase (database) with row-level security.</li>
              <li>We do not sell, share, or use your data for advertising.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Third-Party Services</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="text-white font-medium">Anthropic (Claude AI):</span> processes academic data to generate study plans and chat responses.</li>
              <li><span className="text-white font-medium">Resend:</span> delivers emails.</li>
              <li><span className="text-white font-medium">Supabase:</span> stores account and academic data with encryption at rest.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Data Security</h2>
            <p>
              LMS credentials are encrypted using Fernet (AES-256-CBC) before storage.
              All database tables use row-level security (RLS) policies so users can only
              access their own data. API endpoints require authenticated JWT tokens.
              All communication uses HTTPS/TLS encryption in transit.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Data Retention</h2>
            <p>
              Your data is retained in your account as long as you use SchoolPilot.
              You can request deletion of your data at any time by contacting us or
              using the &quot;Delete Account&quot; option in Settings. Upon deletion,
              all personal data including LMS credentials, assignments, grades, chat
              messages, and study content will be permanently removed within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Users Under 18 (COPPA/Student Privacy)</h2>
            <p>
              SchoolPilot is designed for high school students, many of whom are under 18.
              We collect only the minimum data necessary to provide the service. We do not
              knowingly collect personal information from children under 13 without parental
              consent. If you are under 13, please do not use SchoolPilot without a parent
              or guardian&apos;s permission. Parents or guardians may contact us to review,
              delete, or stop the collection of their child&apos;s personal information.
              We comply with applicable student data privacy laws including FERPA and COPPA.
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
