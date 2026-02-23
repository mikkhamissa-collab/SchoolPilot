// OAuth callback handler — exchanges code for session, sets cookies
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    let redirectPath = "/today";

    // Create a single response — ALL cookies get written to THIS object.
    // We reuse it regardless of redirect path so cookies are never lost.
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
      // Check if user needs onboarding
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: scraped } = await supabase
          .from("scraped_assignments")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);

        const onboardingCompleted = user.user_metadata?.onboarding_completed;
        if ((!scraped || scraped.length === 0) && !onboardingCompleted) {
          redirectPath = "/onboarding";
        }
      }

      // Update redirect on the SAME response object (preserves cookies)
      if (redirectPath !== "/today") {
        response.headers.set("Location", new URL(`${origin}${redirectPath}`).toString());
      }

      return response;
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
