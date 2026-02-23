import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

// GET — get buddy status
export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 401 });

  const db = supabase();

  // Find active partnership
  const { data: partnership } = await db
    .from("accountability_partners")
    .select("*")
    .or(`user_id.eq.${userId},partner_id.eq.${userId}`)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!partnership) {
    // Check for pending invite
    const { data: pending } = await db
      .from("accountability_partners")
      .select("invite_code")
      .eq("user_id", userId)
      .eq("status", "pending")
      .limit(1)
      .single();

    return NextResponse.json({
      has_partner: false,
      pending_invite: pending?.invite_code || null,
    });
  }

  const partnerId =
    partnership.user_id === userId
      ? partnership.partner_id
      : partnership.user_id;

  // Get partner info
  const { data: partnerAuth } = await db.auth.admin.getUserById(partnerId);
  const partnerName =
    partnerAuth?.user?.user_metadata?.full_name?.split(" ")[0] || "Partner";

  // Get partner streak
  const { data: partnerStreak } = await db
    .from("user_streaks")
    .select("current_streak, last_completed_date")
    .eq("user_id", partnerId)
    .single();

  // Get my streak
  const { data: myStreak } = await db
    .from("user_streaks")
    .select("current_streak, last_completed_date")
    .eq("user_id", userId)
    .single();

  const today = new Date().toISOString().split("T")[0];

  return NextResponse.json({
    has_partner: true,
    partner_name: partnerName,
    partner_streak: partnerStreak?.current_streak || 0,
    partner_completed_today:
      partnerStreak?.last_completed_date === today,
    my_streak: myStreak?.current_streak || 0,
    my_completed_today: myStreak?.last_completed_date === today,
  });
}
