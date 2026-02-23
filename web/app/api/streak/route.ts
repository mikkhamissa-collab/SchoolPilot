import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

// GET — fetch user streak
export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 401 });

  const db = supabase();
  const { data } = await db
    .from("user_streaks")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!data) {
    // Create default streak row
    const defaults = {
      user_id: userId,
      current_streak: 0,
      longest_streak: 0,
      last_completed_date: null,
      freeze_available: true,
      freeze_used_date: null,
      weekend_mode: false,
    };
    await db.from("user_streaks").insert(defaults);
    return NextResponse.json(defaults);
  }

  // Auto-refresh freeze on Mondays
  if (data.freeze_used_date) {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    if (new Date(data.freeze_used_date) < monday && !data.freeze_available) {
      await db
        .from("user_streaks")
        .update({ freeze_available: true })
        .eq("user_id", userId);
      data.freeze_available = true;
    }
  }

  return NextResponse.json(data);
}

// POST — update streak after task completion
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 401 });

  const db = supabase();
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  let { data: streak } = await db
    .from("user_streaks")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!streak) {
    const { data: created } = await db
      .from("user_streaks")
      .insert({
        user_id: userId,
        current_streak: 1,
        longest_streak: 1,
        last_completed_date: today,
        freeze_available: true,
      })
      .select()
      .single();
    return NextResponse.json(created);
  }

  // Already completed today
  if (streak.last_completed_date === today) {
    return NextResponse.json(streak);
  }

  const lastDate = streak.last_completed_date;
  let gap = 999;
  if (lastDate) {
    gap = Math.round(
      (new Date(today).getTime() - new Date(lastDate).getTime()) / 86400000
    );
  }

  let newStreak = streak.current_streak;
  let freezeAvailable = streak.freeze_available;
  let freezeUsedDate = streak.freeze_used_date;

  if (gap === 1) {
    newStreak += 1;
  } else if (gap === 2 && freezeAvailable) {
    newStreak += 1;
    freezeAvailable = false;
    freezeUsedDate = yesterday;
  } else {
    newStreak = 1;
  }

  const longestStreak = Math.max(streak.longest_streak, newStreak);

  const { data: updated } = await db
    .from("user_streaks")
    .update({
      current_streak: newStreak,
      longest_streak: longestStreak,
      last_completed_date: today,
      freeze_available: freezeAvailable,
      freeze_used_date: freezeUsedDate,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select()
    .single();

  return NextResponse.json(updated);
}
