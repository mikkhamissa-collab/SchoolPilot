import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

// POST — log a grade after completing a task
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 401 });

  const body = await request.json();
  const { course_id, assignment_title, score, max_score, assignment_type } = body;

  if (!assignment_title || score === undefined) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const db = supabase();

  // If no course_id, try to find course by name
  let courseId = course_id;
  if (!courseId && body.course_name) {
    const { data: course } = await db
      .from("courses")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", `%${body.course_name}%`)
      .limit(1)
      .single();
    courseId = course?.id || null;
  }

  // Insert into grades table (existing table)
  const { data, error } = await db
    .from("grades")
    .insert({
      course_id: courseId,
      category: assignment_type || "Assignment",
      name: assignment_title,
      score: parseFloat(score),
      max_score: parseFloat(max_score) || 100,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ grade: data });
}
