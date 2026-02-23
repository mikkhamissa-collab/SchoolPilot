// Buddy invite — generate an invite code + link
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authenticateRequest, isAuthError, createAdminClient, requireEnv } from "@/lib/auth";

export async function POST() {
  const auth = await authenticateRequest();
  if (isAuthError(auth)) return auth.response;

  const db = createAdminClient();

  // Check for existing active partnership
  const { data: existing } = await db
    .from("accountability_partners")
    .select("id")
    .or(`user_id.eq.${auth.userId},partner_id.eq.${auth.userId}`)
    .eq("status", "active")
    .limit(1)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "You already have an active partner" },
      { status: 400 }
    );
  }

  // Generate cryptographically secure invite code
  const code = randomBytes(6).toString("hex");

  const { data, error } = await db
    .from("accountability_partners")
    .insert({
      user_id: auth.userId,
      invite_code: code,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: `Failed to create invite: ${error.message}` }, { status: 500 });
  }

  let baseUrl: string;
  try {
    baseUrl = requireEnv("NEXT_PUBLIC_APP_URL");
  } catch {
    baseUrl = "https://schoolpilot.co";
  }
  const inviteLink = `${baseUrl}/auth/login?buddy=${code}`;

  return NextResponse.json({ invite_code: code, invite_link: inviteLink, id: data.id });
}
