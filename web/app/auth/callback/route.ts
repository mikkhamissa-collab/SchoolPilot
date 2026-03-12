// OAuth callback handler — exchanges code for session, sets cookies
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  // Determine the correct redirect path before creating the response
  let redirectPath = "/today";

  // We need a temporary response to exchange the code (cookies must be captured)
  const cookieStore: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookieStore.push(...cookiesToSet);
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  // Check if user needs onboarding
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("student_profiles")
      .select("onboarding_complete")
      .eq("user_id", user.id)
      .single();

    const isOnboarded = profile?.onboarding_complete === true;
    if (!isOnboarded) {
      redirectPath = "/onboarding";
    }
  }

  // Build ONE redirect response with the correct path and all cookies
  const response = NextResponse.redirect(`${origin}${redirectPath}`);
  for (const { name, value, options } of cookieStore) {
    response.cookies.set(name, value, options);
  }

  return response;
}
