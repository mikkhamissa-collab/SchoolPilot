// OAuth callback handler — exchanges code for session
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    // Create response first (we'll update the redirect later)
    let redirectPath = "/today";

    const response = NextResponse.redirect(`${origin}/today`);
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Check if user is new (no scraped assignments = needs onboarding)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: scraped } = await supabase
          .from("scraped_assignments")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);

        // If no scraped data AND onboarding not completed, redirect to onboarding
        const onboardingCompleted = user.user_metadata?.onboarding_completed;
        if ((!scraped || scraped.length === 0) && !onboardingCompleted) {
          redirectPath = "/onboarding";
        }
      }

      return NextResponse.redirect(`${origin}${redirectPath}`);
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
