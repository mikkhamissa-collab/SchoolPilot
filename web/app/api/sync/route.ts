// Sync endpoint — receives scraped data from extension and auto-creates courses
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Default grade categories for auto-created courses
const DEFAULT_CATEGORIES = [
  { name: "Assessments", weight: 0.4 },
  { name: "Assignments", weight: 0.35 },
  { name: "Participation", weight: 0.25 },
];

// Clean course name (Teamie often includes teacher name on next line)
function cleanCourseName(raw: string): string {
  // Take only the first line, trim whitespace
  const firstLine = raw.split("\n")[0].trim();
  // Remove trailing teacher names like "Mr. Smith" or "Ms. Jones"
  return firstLine;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const token = authHeader.slice(7);

  // Verify user with Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await request.json();
  const { assignments, type } = body;

  if (!assignments || !Array.isArray(assignments)) {
    return NextResponse.json({ error: "Missing assignments array" }, { status: 400 });
  }

  // Use service role for inserts (bypasses RLS)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Deduplicate assignments by title + course + date
  const seen = new Set<string>();
  const dedupedAssignments = assignments.filter((a: { title?: string; course?: string; date?: string }) => {
    const key = `${a.title || ""}|${a.course || ""}|${a.date || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 1. Save the deduplicated scraped assignments
  const { error: scrapeError } = await admin.from("scraped_assignments").insert({
    user_id: user.id,
    assignments: dedupedAssignments,
    scraped_at: new Date().toISOString(),
  });

  if (scrapeError) {
    return NextResponse.json({ error: scrapeError.message }, { status: 500 });
  }

  // 2. Auto-create courses from assignment data
  const courseNames = new Set<string>();
  for (const a of dedupedAssignments) {
    if (a.course && typeof a.course === "string") {
      const cleaned = cleanCourseName(a.course);
      if (cleaned) courseNames.add(cleaned);
    }
  }

  if (courseNames.size > 0) {
    // Get existing courses for this user
    const { data: existingCourses } = await admin
      .from("courses")
      .select("name")
      .eq("user_id", user.id);

    const existingNames = new Set((existingCourses || []).map((c: { name: string }) => c.name));

    // Create courses that don't exist yet
    const newCourses = [...courseNames]
      .filter((name) => !existingNames.has(name))
      .map((name) => ({
        user_id: user.id,
        name,
        categories: DEFAULT_CATEGORIES,
        policies: {},
      }));

    if (newCourses.length > 0) {
      await admin.from("courses").insert(newCourses);
    }
  }

  // 3. Also save as a plan entry so it shows on the Plan page
  if (type === "assignments") {
    await admin.from("plans").insert({
      user_id: user.id,
      assignments: dedupedAssignments,
      ai_response: null,
      emailed: false,
    });
  }

  return NextResponse.json({
    status: "synced",
    count: dedupedAssignments.length,
    courses_created: courseNames.size,
  });
}
