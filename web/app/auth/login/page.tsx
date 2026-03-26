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
        // Identify user in PostHog for analytics
        import("posthog-js").then((ph) => {
          ph.default.identify(data.user!.id, { email: data.user!.email });
        }).catch(() => {});
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
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
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
        { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback?type=recovery` }
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
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden" style={{ backgroundColor: "#09090b" }}>
      {/* Subtle background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 600px 400px at 50% 40%, rgba(124,58,237,0.15), transparent)",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo and title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <div
              className="w-[22px] h-[22px] rounded-[6px]"
              style={{ background: "linear-gradient(135deg, #7c3aed, #a78bfa)" }}
            />
            <span className="text-[#fafafa] font-semibold text-base tracking-tight">SchoolPilot</span>
          </div>
          <h1 className="text-2xl font-bold text-[#fafafa] mb-1">
            {mode === "forgot" ? "Reset your password" : "Welcome back"}
          </h1>
          <p className="text-[#a1a1aa] text-sm">
            {mode === "forgot"
              ? "Enter your email to receive a reset link"
              : "Your AI study assistant"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl p-6" style={{ backgroundColor: "#111113", border: "1px solid #1e1e22" }}>
          {/* Login / Sign Up text tabs */}
          {mode !== "forgot" && (
            <div className="flex mb-6 gap-1">
              <button
                type="button"
                onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
                className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer rounded-lg ${
                  mode === "login"
                    ? "text-[#fafafa]"
                    : "text-[#52525b] hover:text-[#a1a1aa]"
                }`}
                style={mode === "login" ? { backgroundColor: "#18181b" } : undefined}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}
                className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer rounded-lg ${
                  mode === "signup"
                    ? "text-[#fafafa]"
                    : "text-[#52525b] hover:text-[#a1a1aa]"
                }`}
                style={mode === "signup" ? { backgroundColor: "#18181b" } : undefined}
              >
                Sign up
              </button>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="mb-4 p-3 rounded-lg text-sm text-center text-green-400" style={{ backgroundColor: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
              {success}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm text-center text-red-400" style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleForgotPassword} className="space-y-4">
            {/* Name field (signup only) */}
            {mode === "signup" && (
              <div>
                <label htmlFor="auth-name" className="block text-[#a1a1aa] text-sm mb-1.5">
                  Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your first name"
                  autoComplete="name"
                  className="w-full px-3.5 py-2.5 rounded-lg text-[#fafafa] text-sm placeholder:text-[#52525b] focus:outline-none transition-colors"
                  style={{ backgroundColor: "#09090b", border: "1px solid #1e1e22" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#1e1e22"; }}
                  autoFocus
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="auth-email" className="block text-[#a1a1aa] text-sm mb-1.5">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@school.edu"
                autoComplete="email"
                className="w-full px-3.5 py-2.5 rounded-lg text-[#fafafa] text-sm placeholder:text-[#52525b] focus:outline-none transition-colors"
                style={{ backgroundColor: "#09090b", border: "1px solid #1e1e22" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#1e1e22"; }}
                autoFocus={mode === "login"}
              />
            </div>

            {/* Password (hidden in forgot mode) */}
            {mode !== "forgot" && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="auth-password" className="text-[#a1a1aa] text-sm">
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
                      className="text-[#7c3aed] hover:underline cursor-pointer text-xs font-medium"
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
                  className="w-full px-3.5 py-2.5 rounded-lg text-[#fafafa] text-sm placeholder:text-[#52525b] focus:outline-none transition-colors"
                  style={{ backgroundColor: "#09090b", border: "1px solid #1e1e22" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#1e1e22"; }}
                />
              </div>
            )}

            {/* Confirm Password (signup only) */}
            {mode === "signup" && (
              <div>
                <label htmlFor="auth-confirm" className="block text-[#a1a1aa] text-sm mb-1.5">
                  Confirm password
                </label>
                <input
                  id="auth-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Type your password again"
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 rounded-lg text-[#fafafa] text-sm placeholder:text-[#52525b] focus:outline-none transition-colors"
                  style={{ backgroundColor: "#09090b", border: "1px solid #1e1e22" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#1e1e22"; }}
                />
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-semibold text-sm transition-opacity cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "#fafafa", color: "#09090b" }}
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
                    ? "Log in"
                    : "Create Account"}
            </button>
          </form>
        </div>

        {/* Back to sign in (forgot mode only) */}
        {mode === "forgot" && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="flex-1 h-px" style={{ backgroundColor: "#1e1e22" }} />
              <span className="text-[#52525b] text-xs">or</span>
              <div className="flex-1 h-px" style={{ backgroundColor: "#1e1e22" }} />
            </div>
            <p className="text-center text-[#a1a1aa] text-sm">
              Remember your password?{" "}
              <button
                onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
                className="text-[#7c3aed] hover:underline cursor-pointer font-medium"
              >
                Sign in
              </button>
            </p>
          </>
        )}

        {/* Footer */}
        <p className="mt-6 text-center text-[#52525b] text-xs">
          Free for all students
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
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#09090b" }}>
          <div className="text-[#a1a1aa]">Loading...</div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
