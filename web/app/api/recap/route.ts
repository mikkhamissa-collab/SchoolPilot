import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

// GET — get latest weekly recap for user
export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 401 });

  const db = supabase();

  // Check for an undismissed recap
  const { data: recap } = await db
    .from("weekly_recaps")
    .select("*")
    .eq("user_id", userId)
    .eq("dismissed", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!recap) {
    return NextResponse.json({ recap: null });
  }

  return NextResponse.json({ recap });
}

// POST — dismiss the recap
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 401 });

  const body = await request.json();
  const { recap_id } = body;

  if (!recap_id) {
    return NextResponse.json({ error: "Missing recap_id" }, { status: 400 });
  }

  const db = supabase();
  await db
    .from("weekly_recaps")
    .update({ dismissed: true })
    .eq("id", recap_id)
    .eq("user_id", userId);

  return NextResponse.json({ status: "dismissed" });
}
