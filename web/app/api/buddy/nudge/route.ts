import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

// POST — send a nudge to partner
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 401 });

  const db = supabase();

  // Find partner
  const { data: partnership } = await db
    .from("accountability_partners")
    .select("*")
    .or(`user_id.eq.${userId},partner_id.eq.${userId}`)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!partnership) {
    return NextResponse.json({ error: "No active partner" }, { status: 404 });
  }

  const partnerId =
    partnership.user_id === userId
      ? partnership.partner_id
      : partnership.user_id;

  // Rate limit: max 3 nudges per day
  const today = new Date().toISOString().split("T")[0];
  const { count } = await db
    .from("nudges")
    .select("*", { count: "exact", head: true })
    .eq("from_user_id", userId)
    .gte("sent_at", today + "T00:00:00");

  if ((count || 0) >= 3) {
    return NextResponse.json(
      { error: "Max 3 nudges per day" },
      { status: 429 }
    );
  }

  const { error } = await db.from("nudges").insert({
    from_user_id: userId,
    to_user_id: partnerId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "sent" });
}
