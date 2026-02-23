// Buddy status — get partner info and streaks
import { NextResponse } from "next/server";
import { authenticateRequest, isAuthError, createAdminClient } from "@/lib/auth";

export async function GET() {
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
    // Check for pending invite
    const { data: pending } = await db
      .from("accountability_partners")
      .select("invite_code")
      .eq("user_id", auth.userId)
      .eq("status", "pending")
      .limit(1)
      .single();

    return NextResponse.json({
      has_partner: false,
      pending_invite: pending?.invite_code || null,
    });
  }

  const partnerId =
    partnership.user_id === auth.userId
      ? partnership.partner_id
      : partnership.user_id;

  // Get partner name via admin API
  let partnerName = "Partner";
  const { data: partnerAuth, error: partnerErr } = await db.auth.admin.getUserById(partnerId);
  if (!partnerErr && partnerAuth?.user) {
    partnerName = partnerAuth.user.user_metadata?.full_name?.split(" ")[0] || "Partner";
  }

  // Get both streaks
  const { data: partnerStreak } = await db
    .from("user_streaks")
    .select("current_streak, last_completed_date")
    .eq("user_id", partnerId)
    .single();

  const { data: myStreak } = await db
    .from("user_streaks")
    .select("current_streak, last_completed_date")
    .eq("user_id", auth.userId)
    .single();

  const today = new Date().toISOString().split("T")[0];

  return NextResponse.json({
    has_partner: true,
    partner_name: partnerName,
    partner_streak: partnerStreak?.current_streak || 0,
    partner_completed_today: partnerStreak?.last_completed_date === today,
    my_streak: myStreak?.current_streak || 0,
    my_completed_today: myStreak?.last_completed_date === today,
  });
}
