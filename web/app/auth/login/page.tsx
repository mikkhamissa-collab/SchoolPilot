"use client";

// Login / Sign-up page for SchoolPilot.
// Supports email + password auth via Supabase. Redirects to /onboarding
// for new users or /today for returning users.

import { createClient } from "@/lib/supabase-client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Login form component
// ---------------------------------------------------------------------------

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState(urlError ? "Authentication failed. Please try again." : "");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  // Redirect if already authenticated
  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const onboarded = user.user_metadata?.onboarding_completed;
        router.push(onboarded ? "/today" : "/onboarding");
      }
    };
    check();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.user) {
        const onboarded = data.user.user_metadata?.onboarding_completed;
        router.push(onboarded ? "/today" : "/onboarding");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!displayName.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: displayName.trim(),
            display_name: displayName.trim(),
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      // Check if email confirmation is required
      if (data.user && !data.session) {
        setSuccess("Check your email for a confirmation link, then sign in.");
        setMode("login");
        return;
      }

      if (data.user && data.session) {
        router.push("/onboarding");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/auth/callback?type=recovery` }
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSuccess("Check your email for a password reset link.");
      setMode("login");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-dark p-6">
      <div className="w-full max-w-sm">
        {/* Logo and title */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-accent/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">SchoolPilot</h1>
          <p className="text-text-secondary text-sm">
            {mode === "forgot" ? "Reset your password" : "Your AI study assistant"}
          </p>
        </div>

        {/* Login / Sign Up tabs */}
        {mode !== "forgot" && (
          <div className="flex mb-6 bg-bg-card rounded-xl p-1 border border-border">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                mode === "login"
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                mode === "signup"
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-white"
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Success message */}
        {success && (
          <div className="mb-4 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm text-center">
            {success}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm text-center">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleForgotPassword} className="space-y-4">
          {/* Name field (signup only) */}
          {mode === "signup" && (
            <div>
              <label htmlFor="auth-name" className="block text-text-secondary text-sm mb-1.5">
                Name
              </label>
              <input
                id="auth-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your first name"
                autoComplete="name"
                className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                autoFocus
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label htmlFor="auth-email" className="block text-text-secondary text-sm mb-1.5">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              autoComplete="email"
              className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              autoFocus={mode === "login"}
            />
          </div>

          {/* Password (hidden in forgot mode) */}
          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="auth-password" className="text-text-secondary text-sm">
                  Password
                </label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setError("");
                      setSuccess("");
                    }}
                    className="text-accent hover:underline cursor-pointer text-xs font-medium"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          )}

          {/* Confirm Password (signup only) */}
          {mode === "signup" && (
            <div>
              <label htmlFor="auth-confirm" className="block text-text-secondary text-sm mb-1.5">
                Confirm password
              </label>
              <input
                id="auth-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Type your password again"
                autoComplete="new-password"
                className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-base transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading
              ? mode === "forgot"
                ? "Sending link..."
                : mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
              : mode === "forgot"
                ? "Send Reset Link"
                : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
          </button>
        </form>

        {/* Back to sign in (forgot mode only) */}
        {mode === "forgot" && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-text-muted text-xs">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <p className="text-center text-text-secondary text-sm">
              Remember your password?{" "}
              <button
                onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
                className="text-accent hover:underline cursor-pointer font-medium"
              >
                Sign in
              </button>
            </p>
          </>
        )}

        {/* Footer */}
        <p className="mt-8 text-center text-text-muted text-xs">
          By signing in, you agree to use SchoolPilot responsibly.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page wrapper with Suspense for useSearchParams
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-bg-dark">
          <div className="text-text-secondary">Loading...</div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
