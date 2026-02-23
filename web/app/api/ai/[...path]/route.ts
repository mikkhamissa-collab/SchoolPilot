// Proxy API route — forwards requests to Flask backend with auth
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const FLASK_URL = process.env.FLASK_BACKEND_URL || "https://schoolpilot-obvu.onrender.com";
const FLASK_SECRET = process.env.FLASK_SECRET_KEY || "";

// Only allow these Flask endpoint prefixes — prevents open proxy abuse
// All valid Flask endpoint prefixes — anything not here gets 403
const ALLOWED_PATHS = [
  "/process",
  "/plan/",
  "/autopilot/",
  "/health",
  "/grades/",
  "/study/",
  "/study-guide/",
  "/chunk/",
  "/sprint/",
  "/practice-test/",
  "/weak-spot/",
  "/prioritize/",
  "/mastery/",
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  // Auth check via Supabase cookies
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only in API routes */ },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate the path against allowlist
  const flaskPath = "/" + path.join("/");
  const isAllowed = ALLOWED_PATHS.some((p) => flaskPath.startsWith(p));
  if (!isAllowed) {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 403 });
  }

  const body = await request.json();

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (FLASK_SECRET) {
      headers["X-Proxy-Secret"] = FLASK_SECRET;
    }

    const res = await fetch(`${FLASK_URL}${flaskPath}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000), // 60s timeout
    });

    let data;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Backend returned an invalid response" },
        { status: 502 }
      );
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error && err.name === "TimeoutError"
      ? "Backend timed out. Please try again."
      : "Cannot reach backend. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
