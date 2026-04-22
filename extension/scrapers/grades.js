// Scrape standards-based grades from /api/classroom/{gid}/objectives.json.
// ASL Teamie uses SBGR (no traditional gradebook), so "grades" here means a
// snapshot of each course's objective completion. We iterate the courses list.
// Output matches the backend's IngestGrade Pydantic model.

import { TEAMIE_ENDPOINTS } from "../lib/teamie.js";

export async function scrapeGrades({ tryEndpoints, courses }) {
  if (!Array.isArray(courses) || courses.length === 0) {
    console.error("[SchoolPilot] grades failed — no courses available");
    return { ok: false, error: "no courses to iterate" };
  }

  const out = [];
  const attempts = [];

  for (const c of courses) {
    const gid = c._gid || c.lms_id;
    if (!gid) continue;
    const r = await tryEndpoints(TEAMIE_ENDPOINTS.courseObjectives(gid), `grades:${c.name}`);
    attempts.push({ course: c.name, gid, ok: r.ok });
    if (!r.ok) {
      console.warn("[SchoolPilot] objectives failed for", c.name);
      continue;
    }
    const row = buildGradeRow(c, r.data);
    if (row) out.push(row);
  }

  if (out.length === 0) {
    console.error("[SchoolPilot] grades empty — no objectives payload succeeded", attempts);
    return { ok: false, error: "no objectives returned", attempts };
  }
  console.info("[SchoolPilot] grades fetched", out.length, "items");
  return { ok: true, data: out };
}

function buildGradeRow(course, raw) {
  const objectives = coerceObjectives(raw);
  const breakdown = {};

  // Aggregate progress per objective so the backend can display a per-course snapshot.
  let scoreSum = 0;
  let scoreCount = 0;
  for (const o of objectives) {
    const name = o.name || o.title || o.label || o.code || null;
    if (!name) continue;
    const progress = pickNumber(o.progress ?? o.percent ?? o.score ?? o.value);
    const level = o.level || o.mastery_level || o.grade || null;
    breakdown[name] = {
      level: level != null ? String(level) : null,
      progress: progress,
    };
    if (progress != null) {
      scoreSum += progress;
      scoreCount += 1;
    }
  }

  const avg = scoreCount > 0 ? scoreSum / scoreCount : null;
  // Prefer the course-level completion field from classroom.json when available.
  const overallPct = pickNumber(course._completion) ?? avg;

  return {
    // Backend IngestGrade schema:
    course_name: String(course.name || "Unknown course"),
    overall_grade: null, // SBGR: no letter grade at course level
    overall_percentage: overallPct,
    category_breakdown: breakdown,
  };
}

function coerceObjectives(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  for (const key of ["objectives", "results", "items", "data", "nodes"]) {
    if (Array.isArray(raw[key])) return raw[key];
  }
  // Numeric-keyed dicts (Teamie pattern).
  const numericKeys = Object.keys(raw).filter((k) => /^\d+$/.test(k));
  if (numericKeys.length > 0) {
    return numericKeys
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => raw[k])
      .filter((v) => v && typeof v === "object");
  }
  return [];
}

function pickNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
