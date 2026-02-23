import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

// POST — accept a buddy invite
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 401 });

  const body = await request.json();
  const { code } = body;

  if (!code) {
    return NextResponse.json({ error: "Missing invite code" }, { status: 400 });
  }

  const db = supabase();

  const { data: invite } = await db
    .from("accountability_partners")
    .select("*")
    .eq("invite_code", code)
    .eq("status", "pending")
    .single();

  if (!invite) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
  }

  // Can't partner with yourself
  if (invite.user_id === userId) {
    return NextResponse.json({ error: "Can't partner with yourself" }, { status: 400 });
  }

  const { data, error } = await db
    .from("accountability_partners")
    .update({
      partner_id: userId,
      status: "active",
    })
    .eq("id", invite.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ partnership: data });
}
