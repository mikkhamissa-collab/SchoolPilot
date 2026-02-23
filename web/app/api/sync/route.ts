// Sync endpoint — receives deep-scraped data from extension and populates database
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Default grade categories for auto-created courses
const DEFAULT_CATEGORIES = [
  { name: "Assessments", weight: 0.4 },
  { name: "Assignments", weight: 0.35 },
  { name: "Participation", weight: 0.25 },
];

function cleanCourseName(raw: string): string {
  return raw.split("\n")[0].trim().replace(/\s+/g, " ");
}

interface ScrapedAssignment {
  title?: string;
  type?: string;
  due?: string;
  course?: string;
  date?: string;
  day?: string;
  isOverdue?: boolean;
  icon?: string;
}

interface ScrapedCourse {
  name: string;
  id?: string;
  href?: string;
}

function dedup(items: ScrapedAssignment[]): ScrapedAssignment[] {
  const seen = new Set<string>();
  return items.filter((a) => {
    const key = `${a.title || ""}|${a.course || ""}|${a.date || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await request.json();
  const {
    assignments = [],
    overdue = [],
    courses: scrapedCourses = [],
    newsfeed = [],
    stats = {},
    type,
  } = body;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_KEY ?? ""
  );

  // Deduplicate assignments and overdue separately
  const dedupedAssignments = dedup(assignments);
  const dedupedOverdue = dedup(overdue);
  const allItems = [...dedupedAssignments, ...dedupedOverdue];

  // 1. Save the full scraped data (assignments + overdue + newsfeed)
  const { error: scrapeError } = await admin.from("scraped_assignments").insert({
    user_id: user.id,
    assignments: {
      upcoming: dedupedAssignments,
      overdue: dedupedOverdue,
      newsfeed,
      stats,
    },
    scraped_at: new Date().toISOString(),
  });

  if (scrapeError) {
    return NextResponse.json({ error: scrapeError.message }, { status: 500 });
  }

  // 2. Collect ALL course names from scraped courses + assignment data
  const courseNames = new Set<string>();

  // From directly scraped course list (Classes section)
  if (Array.isArray(scrapedCourses)) {
    for (const c of scrapedCourses as ScrapedCourse[]) {
      const name = typeof c === "string" ? c : c?.name;
      if (name && typeof name === "string") {
        const cleaned = cleanCourseName(name);
        if (cleaned && cleaned.length > 2) courseNames.add(cleaned);
      }
    }
  }

  // From assignment + overdue course fields
  for (const a of allItems) {
    if (a.course && typeof a.course === "string") {
      const cleaned = cleanCourseName(a.course);
      if (cleaned) courseNames.add(cleaned);
    }
  }

  // From newsfeed course fields
  for (const n of newsfeed) {
    if (n.course && typeof n.course === "string") {
      const cleaned = cleanCourseName(n.course);
      if (cleaned) courseNames.add(cleaned);
    }
  }

  // Create courses that don't exist yet
  let coursesCreated = 0;
  if (courseNames.size > 0) {
    const { data: existingCourses } = await admin
      .from("courses")
      .select("name")
      .eq("user_id", user.id);

    const existingNames = new Set((existingCourses || []).map((c: { name: string }) => c.name));

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
      coursesCreated = newCourses.length;
    }
  }

  // 3. Save as a plan entry (upcoming only, not overdue)
  if (type === "assignments" && dedupedAssignments.length > 0) {
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
    overdue_count: dedupedOverdue.length,
    courses_created: coursesCreated,
    total_courses: courseNames.size,
  });
}
