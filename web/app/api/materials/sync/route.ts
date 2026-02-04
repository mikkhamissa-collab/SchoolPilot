// Sync endpoint for deep-scraped course materials
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

interface ScrapedUnit {
  number?: number;
  name: string;
  fullName?: string;
  description?: string;
  objectives?: string[];
}

interface ScrapedLesson {
  name: string;
  lessonId?: string;
  href?: string;
  pageCount?: number;
  unitNumber?: number;
}

interface ScrapedResource {
  type: string;
  name?: string;
  url?: string;
  fileId?: string;
  videoId?: string;
  src?: string;
}

interface ScrapedAssignment {
  pageId?: string;
  lessonId?: string;
  title?: string;
  instructions?: string;
  dueDate?: string;
  resources?: ScrapedResource[];
}

interface DeepScrapedData {
  course: {
    id: string | null;
    name: string | null;
    url: string;
  };
  units?: ScrapedUnit[];
  lessons?: ScrapedLesson[];
  resources?: ScrapedResource[];
  pageContent?: {
    type: string;
    pageId?: string;
    lessonId?: string;
    title?: string;
    instructions?: string;
    dueDate?: string;
    resources?: ScrapedResource[];
    pages?: Array<{ name: string; pageId: string; href: string }>;
  };
  scrapedAt?: string;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = (await request.json()) as DeepScrapedData;
  const { course, units, lessons, resources, pageContent } = body;

  if (!course?.id) {
    return NextResponse.json({ error: "Missing course ID" }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Check if we already have materials for this course
  const { data: existing } = await admin
    .from("course_materials")
    .select("*")
    .eq("user_id", user.id)
    .eq("course_id", course.id)
    .single();

  if (existing) {
    // Merge new data with existing
    const mergedUnits = mergeArrays(existing.units || [], units || [], "name");
    const mergedLessons = mergeArrays(
      existing.lessons || [],
      lessons || [],
      "lessonId"
    );
    const mergedResources = mergeArrays(
      existing.resources || [],
      resources || [],
      "url"
    );

    // If this is an assignment page, add it to assignments array
    let mergedAssignments = existing.assignments || [];
    if (pageContent?.type === "assignment" && pageContent.pageId) {
      const existingIdx = mergedAssignments.findIndex(
        (a: ScrapedAssignment) => a.pageId === pageContent.pageId
      );
      const assignmentData = {
        pageId: pageContent.pageId,
        lessonId: pageContent.lessonId,
        title: pageContent.title,
        instructions: pageContent.instructions,
        dueDate: pageContent.dueDate,
        resources: pageContent.resources || [],
      };
      if (existingIdx >= 0) {
        mergedAssignments[existingIdx] = assignmentData;
      } else {
        mergedAssignments.push(assignmentData);
      }
    }

    const { error: updateError } = await admin
      .from("course_materials")
      .update({
        course_name: course.name || existing.course_name,
        course_url: course.url || existing.course_url,
        units: mergedUnits,
        lessons: mergedLessons,
        resources: mergedResources,
        assignments: mergedAssignments,
        last_sync: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      status: "updated",
      material_id: existing.id,
      units_count: mergedUnits.length,
      lessons_count: mergedLessons.length,
      resources_count: mergedResources.length,
      assignments_count: mergedAssignments.length,
    });
  }

  // Create new materials entry
  const assignments: ScrapedAssignment[] = [];
  if (pageContent?.type === "assignment" && pageContent.pageId) {
    assignments.push({
      pageId: pageContent.pageId,
      lessonId: pageContent.lessonId,
      title: pageContent.title,
      instructions: pageContent.instructions,
      dueDate: pageContent.dueDate,
      resources: pageContent.resources || [],
    });
  }

  const { data: inserted, error: insertError } = await admin
    .from("course_materials")
    .insert({
      user_id: user.id,
      course_id: course.id,
      course_name: course.name,
      course_url: course.url,
      units: units || [],
      lessons: lessons || [],
      resources: resources || [],
      assignments,
      extracted_content: [],
      scraped_at: new Date().toISOString(),
      last_sync: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    status: "created",
    material_id: inserted.id,
    units_count: (units || []).length,
    lessons_count: (lessons || []).length,
    resources_count: (resources || []).length,
    assignments_count: assignments.length,
  });
}

// Helper to merge arrays by a key, preferring newer data
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeArrays<T extends Record<string, any>>(
  existing: T[],
  incoming: T[],
  key: string
): T[] {
  const map = new Map<unknown, T>();
  for (const item of existing) {
    const k = item[key];
    if (k !== undefined) map.set(k, item);
  }
  for (const item of incoming) {
    const k = item[key];
    if (k !== undefined) map.set(k, item);
  }
  return Array.from(map.values());
}

// GET endpoint to retrieve materials for a course
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get("course_id");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  if (courseId) {
    // Get specific course materials
    const { data, error } = await admin
      .from("course_materials")
      .select("*")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(data);
  }

  // Get all materials for user
  const { data, error } = await admin
    .from("course_materials")
    .select("id, course_id, course_name, units, lessons, resources, assignments, last_sync")
    .eq("user_id", user.id)
    .order("last_sync", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ materials: data });
}
