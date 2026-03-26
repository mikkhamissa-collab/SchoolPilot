// Auth middleware: protects dashboard routes, redirects unauthenticated users
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Fail fast if env vars are missing — prevents silent auth failures
function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const SUPABASE_URL = requireEnvVar("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");

// Routes that require authentication
const PROTECTED_PREFIXES = [
  "/today",
  "/grades",
  "/study",
  "/focus",
  "/buddy",
  "/settings",
  "/onboarding",
];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Check if current path is protected
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // Redirect unauthenticated users to login
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    // Check onboarding status from user metadata first, then fall back to DB.
    // user_metadata in the JWT can be stale if the token hasn't been refreshed
    // since onboarding completed, so we also check the student_profiles table.
    let onboardingDone = user.user_metadata?.onboarding_completed === true;

    if (!onboardingDone) {
      // JWT metadata might be stale — check the database as fallback
      const { data: profile } = await supabase
        .from("student_profiles")
        .select("onboarding_complete")
        .eq("user_id", user.id)
        .single();
      if (profile?.onboarding_complete === true) {
        onboardingDone = true;
      }
    }

    // Authenticated but hasn't finished onboarding → force to /onboarding
    // (but don't intercept /auth/callback — it handles its own redirect)
    if (!onboardingDone && pathname !== "/onboarding" && !pathname.startsWith("/auth/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // Finished onboarding but visiting /onboarding again → go to /today
    if (onboardingDone && pathname === "/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/today";
      return NextResponse.redirect(url);
    }

    // Authenticated on login/landing → go to /today
    if (onboardingDone && (pathname === "/" || pathname === "/auth/login")) {
      const url = request.nextUrl.clone();
      url.pathname = "/today";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
