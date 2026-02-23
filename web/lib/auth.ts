// Shared server-side auth helper for API routes
// Uses Supabase cookie auth — no more spoofable x-user-id headers
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

interface AuthResult {
  userId: string;
  email: string | undefined;
}

interface AuthError {
  response: NextResponse;
}

/**
 * Authenticate the current request via Supabase cookies.
 * Returns the user ID or an error NextResponse.
 */
export async function authenticateRequest(): Promise<AuthResult | AuthError> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Read-only in API routes
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      response: NextResponse.json(
        { error: "Unauthorized — please sign in" },
        { status: 401 }
      ),
    };
  }

  return { userId: user.id, email: user.email };
}

/**
 * Check if the result is an auth error.
 */
export function isAuthError(result: AuthResult | AuthError): result is AuthError {
  return "response" in result;
}

/**
 * Create a Supabase admin client (for server-side writes).
 */
export function createAdminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_KEY")
  );
}

/**
 * Require an environment variable — fail fast with a clear message.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Check your .env.local file.`
    );
  }
  return value;
}
