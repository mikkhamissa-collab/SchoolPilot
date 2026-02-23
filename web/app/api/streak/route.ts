// Streak management — GET to fetch, POST to update on task completion
import { NextResponse } from "next/server";
import { authenticateRequest, isAuthError, createAdminClient } from "@/lib/auth";

export async function GET() {
  const auth = await authenticateRequest();
  if (isAuthError(auth)) return auth.response;

  const db = createAdminClient();
  const { data, error } = await db
    .from("user_streaks")
    .select("current_streak, longest_streak, last_completed_date, freeze_available, freeze_used_date, weekend_mode")
    .eq("user_id", auth.userId)
    .single();

  if (error || !data) {
    // Create default streak row
    const defaults = {
      user_id: auth.userId,
      current_streak: 0,
      longest_streak: 0,
      last_completed_date: null,
      freeze_available: true,
      freeze_used_date: null,
      weekend_mode: false,
    };
    const { error: insertErr } = await db.from("user_streaks").insert(defaults);
    if (insertErr) {
      return NextResponse.json({ error: `Failed to create streak: ${insertErr.message}` }, { status: 500 });
    }
    return NextResponse.json(defaults);
  }

  // Auto-refresh freeze on Mondays
  if (data.freeze_used_date) {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    if (new Date(data.freeze_used_date) < monday && !data.freeze_available) {
      const { error: updateErr } = await db
        .from("user_streaks")
        .update({ freeze_available: true })
        .eq("user_id", auth.userId);
      if (updateErr) {
        console.error("Failed to refresh freeze:", updateErr.message);
      }
      data.freeze_available = true;
    }
  }

  return NextResponse.json(data);
}

export async function POST() {
  const auth = await authenticateRequest();
  if (isAuthError(auth)) return auth.response;

  const db = createAdminClient();
  // Use US Eastern time (school timezone) for date comparison
  const eastern = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
  const today = eastern.format(new Date());
  const yesterday = eastern.format(new Date(Date.now() - 86400000));

  const { data: streak, error: fetchErr } = await db
    .from("user_streaks")
    .select("current_streak, longest_streak, last_completed_date, freeze_available, freeze_used_date")
    .eq("user_id", auth.userId)
    .single();

  if (fetchErr || !streak) {
    const { data: created, error: createErr } = await db
      .from("user_streaks")
      .insert({
        user_id: auth.userId,
        current_streak: 1,
        longest_streak: 1,
        last_completed_date: today,
        freeze_available: true,
      })
      .select()
      .single();
    if (createErr) {
      return NextResponse.json({ error: `Failed to create streak: ${createErr.message}` }, { status: 500 });
    }
    return NextResponse.json(created);
  }

  // Already completed today — return current state, no double-increment
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
    // Streak freeze — covers a 1-day gap
    newStreak += 1;
    freezeAvailable = false;
    freezeUsedDate = yesterday;
  } else {
    // Gap too large, reset
    newStreak = 1;
  }

  const longestStreak = Math.max(streak.longest_streak, newStreak);

  const { data: updated, error: updateErr } = await db
    .from("user_streaks")
    .update({
      current_streak: newStreak,
      longest_streak: longestStreak,
      last_completed_date: today,
      freeze_available: freezeAvailable,
      freeze_used_date: freezeUsedDate,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", auth.userId)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: `Failed to update streak: ${updateErr.message}` }, { status: 500 });
  }

  return NextResponse.json(updated);
}
