import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

// POST — create a buddy invite link
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 401 });

  const db = supabase();

  // Check for existing active partnership
  const { data: existing } = await db
    .from("accountability_partners")
    .select("*")
    .or(`user_id.eq.${userId},partner_id.eq.${userId}`)
    .eq("status", "active")
    .limit(1)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "You already have an active partner" },
      { status: 400 }
    );
  }

  // Generate invite code
  const code = Math.random().toString(36).substring(2, 8);

  const { data, error } = await db
    .from("accountability_partners")
    .insert({
      user_id: userId,
      invite_code: code,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://schoolpilot.co";
  const inviteLink = `${baseUrl}/auth/login?buddy=${code}`;

  return NextResponse.json({ invite_code: code, invite_link: inviteLink, id: data.id });
}
