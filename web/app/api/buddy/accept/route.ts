// Buddy accept — accept an invite code to form partnership
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthError, createAdminClient } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest();
  if (isAuthError(auth)) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code } = body as { code?: string };
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Missing invite code" }, { status: 400 });
  }

  const db = createAdminClient();

  // Check if this user already has an active partner
  const { data: existingPartner } = await db
    .from("accountability_partners")
    .select("id")
    .or(`user_id.eq.${auth.userId},partner_id.eq.${auth.userId}`)
    .eq("status", "active")
    .limit(1)
    .single();

  if (existingPartner) {
    return NextResponse.json({ error: "You already have an active partner" }, { status: 400 });
  }

  // Find the pending invite
  const { data: invite } = await db
    .from("accountability_partners")
    .select("id, user_id")
    .eq("invite_code", code)
    .eq("status", "pending")
    .single();

  if (!invite) {
    return NextResponse.json({ error: "Invalid or expired invite code" }, { status: 404 });
  }

  if (invite.user_id === auth.userId) {
    return NextResponse.json({ error: "You can't partner with yourself" }, { status: 400 });
  }

  const { data, error } = await db
    .from("accountability_partners")
    .update({
      partner_id: auth.userId,
      status: "active",
    })
    .eq("id", invite.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: `Failed to accept invite: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ partnership: data });
}
