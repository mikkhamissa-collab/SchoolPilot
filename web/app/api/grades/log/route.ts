// Log a grade after completing a task
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

  const { course_id, course_name, assignment_title, score, max_score, assignment_type } = body as {
    course_id?: string;
    course_name?: string;
    assignment_title?: string;
    score?: number | string;
    max_score?: number | string;
    assignment_type?: string;
  };

  if (!assignment_title || score === undefined || score === null) {
    return NextResponse.json({ error: "Missing required fields: assignment_title and score" }, { status: 400 });
  }

  const parsedScore = typeof score === "string" ? parseFloat(score) : score;
  const parsedMax = typeof max_score === "string" ? parseFloat(max_score) : (max_score || 100);

  if (isNaN(parsedScore) || isNaN(parsedMax)) {
    return NextResponse.json({ error: "Score and max_score must be valid numbers" }, { status: 400 });
  }

  if (parsedScore < 0 || parsedMax <= 0) {
    return NextResponse.json({ error: "Score must be >= 0 and max_score must be > 0" }, { status: 400 });
  }

  const db = createAdminClient();

  // Resolve course ID — verify it belongs to THIS user
  let courseId = course_id || null;
  if (courseId) {
    const { data: ownedCourse } = await db
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("user_id", auth.userId)
      .single();
    if (!ownedCourse) {
      return NextResponse.json({ error: "Course not found or not yours" }, { status: 404 });
    }
  } else if (course_name && typeof course_name === "string") {
    // Escape special SQL characters in the search term
    const safeName = course_name.replace(/%/g, "").replace(/_/g, "");
    const { data: course } = await db
      .from("courses")
      .select("id")
      .eq("user_id", auth.userId)
      .ilike("name", `%${safeName}%`)
      .limit(1)
      .single();
    courseId = course?.id || null;
  }

  const { data, error } = await db
    .from("grades")
    .insert({
      course_id: courseId,
      category: assignment_type || "Assignment",
      name: assignment_title,
      score: parsedScore,
      max_score: parsedMax,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: `Failed to log grade: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ grade: data });
}
