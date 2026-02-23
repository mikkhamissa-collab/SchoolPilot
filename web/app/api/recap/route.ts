// Weekly recap — GET undismissed, POST to dismiss
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthError, createAdminClient } from "@/lib/auth";

export async function GET() {
  const auth = await authenticateRequest();
  if (isAuthError(auth)) return auth.response;

  const db = createAdminClient();
  const { data: recap, error } = await db
    .from("weekly_recaps")
    .select("id, week_start, week_end, tasks_completed, grades_logged, streak_days, insight_text, win_text, preview_text, dismissed")
    .eq("user_id", auth.userId)
    .eq("dismissed", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !recap) {
    return NextResponse.json({ recap: null });
  }

  return NextResponse.json({ recap });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest();
  if (isAuthError(auth)) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { recap_id } = body as { recap_id?: string };
  if (!recap_id || typeof recap_id !== "string") {
    return NextResponse.json({ error: "Missing recap_id" }, { status: 400 });
  }

  const db = createAdminClient();
  const { error, count } = await db
    .from("weekly_recaps")
    .update({ dismissed: true })
    .eq("id", recap_id)
    .eq("user_id", auth.userId);

  if (error) {
    return NextResponse.json({ error: `Failed to dismiss: ${error.message}` }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json({ error: "Recap not found or already dismissed" }, { status: 404 });
  }

  return NextResponse.json({ status: "dismissed" });
}
