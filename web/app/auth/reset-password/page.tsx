"use client";

// Password reset page — reached after a user clicks the recovery link in their
// email. The /auth/callback route has already exchanged the recovery code for
// a live Supabase session, so we just need a form that calls updateUser with
// the new password and then redirects to /today (or /onboarding).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);

  // Verify a live session exists — if not, the recovery link already expired
  // or was consumed, and we need to send the user back to request a new one.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setSessionReady(Boolean(data.session));
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setSuccess("Password updated. Redirecting...");

      // Route post-reset: onboarded users go to /today, new users to /onboarding
      const { data: { user } } = await supabase.auth.getUser();
      let dest = "/today";
      if (user) {
        const { data: profile } = await supabase
          .from("student_profiles")
          .select("onboarding_complete")
          .eq("user_id", user.id)
          .single();
        if (!profile?.onboarding_complete) dest = "/onboarding";
      }
      setTimeout(() => router.replace(dest), 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (sessionReady === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-white">
        <p className="text-muted text-sm">Checking your reset link...</p>
      </div>
    );
  }

  if (sessionReady === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-white px-6">
        <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 text-center">
          <h1 className="text-xl font-semibold mb-3">Reset link expired</h1>
          <p className="text-muted text-sm mb-6">
            This password reset link has expired or already been used. Request a
            new one from the sign-in page.
          </p>
          <Link
            href="/auth/login"
            className="inline-block px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg text-white px-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-2">Set a new password</h1>
        <p className="text-muted text-sm mb-8">
          Choose a password you'll remember. At least 8 characters.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="block text-sm mb-2 text-text-secondary">
              New password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-white placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
              required
              minLength={8}
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm mb-2 text-text-secondary">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type your password again"
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-white placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
              required
              minLength={8}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-green-400 bg-green-950/40 border border-green-900/60 rounded-lg px-3 py-2">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-5 py-3 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Updating..." : "Update password"}
          </button>

          <div className="text-center pt-2">
            <Link href="/auth/login" className="text-sm text-muted hover:text-white transition-colors">
              Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
