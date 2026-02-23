// Buddy nudge — send a nudge to partner (rate limited 3/day)
import { NextResponse } from "next/server";
import { authenticateRequest, isAuthError, createAdminClient } from "@/lib/auth";

export async function POST() {
  const auth = await authenticateRequest();
  if (isAuthError(auth)) return auth.response;

  const db = createAdminClient();

  // Find active partnership
  const { data: partnership } = await db
    .from("accountability_partners")
    .select("user_id, partner_id")
    .or(`user_id.eq.${auth.userId},partner_id.eq.${auth.userId}`)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!partnership) {
    return NextResponse.json({ error: "No active partner" }, { status: 404 });
  }

  const partnerId =
    partnership.user_id === auth.userId
      ? partnership.partner_id
      : partnership.user_id;

  // Rate limit: max 3 nudges per day
  const today = new Date().toISOString().split("T")[0];
  const { count, error: countErr } = await db
    .from("nudges")
    .select("*", { count: "exact", head: true })
    .eq("from_user_id", auth.userId)
    .gte("sent_at", today + "T00:00:00");

  if (countErr) {
    return NextResponse.json({ error: `Rate limit check failed: ${countErr.message}` }, { status: 500 });
  }

  if ((count || 0) >= 3) {
    return NextResponse.json({ error: "Max 3 nudges per day" }, { status: 429 });
  }

  const { error: insertErr } = await db.from("nudges").insert({
    from_user_id: auth.userId,
    to_user_id: partnerId,
  });

  if (insertErr) {
    return NextResponse.json({ error: `Failed to send nudge: ${insertErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ status: "sent" });
}
