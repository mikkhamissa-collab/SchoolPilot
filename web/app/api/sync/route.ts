// Sync endpoint — receives scraped data from extension
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const token = authHeader.slice(7);

  // Verify user with Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await request.json();
  const { assignments, type } = body;

  if (!assignments || !Array.isArray(assignments)) {
    return NextResponse.json({ error: "Missing assignments array" }, { status: 400 });
  }

  // Use service role for insert (bypasses RLS)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  if (type === "assignments") {
    const { error } = await admin.from("scraped_assignments").insert({
      user_id: user.id,
      assignments,
      scraped_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ status: "synced", count: assignments.length });
}
