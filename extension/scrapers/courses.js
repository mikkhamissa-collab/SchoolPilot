// Scrape enrolled classrooms from /api/classroom.json.
// Response shape: { "0": {nid, gid, name, initials, image, grade_book, completion,
//   learning_progression_enabled, ...}, "1": {...}, ... } — numeric-keyed object.
// Output shape matches the backend's IngestCourse Pydantic model.

import { TEAMIE_ENDPOINTS } from "../lib/teamie.js";

export async function scrapeCourses({ tryEndpoints }) {
  const r = await tryEndpoints(TEAMIE_ENDPOINTS.courses, "courses");
  if (!r.ok) {
    console.error("[SchoolPilot] courses failed", r);
    return { ok: false, error: "all endpoints failed", attempts: r.attempts };
  }

  const list = coerceList(r.data);
  const courses = list
    .filter((c) => c && (c.nid || c.gid))
    .map((c) => ({
      // Backend IngestCourse schema:
      lms_id: String(c.nid || c.gid),
      name: String(c.name || c.title || c.initials || "Untitled course"),
      code: c.initials ? String(c.initials) : null,
      term: c.term || c.semester || null,
      instructor: extractInstructor(c),
      url: c.nid ? `/classroom/${c.nid}` : null,
      // Stash raw fields the other scrapers need (gid, grade_book flags).
      _gid: c.gid != null ? String(c.gid) : null,
      _sbgr: !!c.learning_progression_enabled,
      _completion: c.completion ?? null,
    }));

  console.info("[SchoolPilot] courses fetched", courses.length, "items");
  return { ok: true, data: courses, source: r.url };
}

function coerceList(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  // classroom.json is keyed "0","1","2",… — pull numeric keys in order.
  const numericKeys = Object.keys(raw).filter((k) => /^\d+$/.test(k));
  if (numericKeys.length > 0) {
    return numericKeys
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => raw[k]);
  }
  // Fall back to any array-valued property.
  for (const v of Object.values(raw)) {
    if (Array.isArray(v)) return v;
  }
  return [];
}

function extractInstructor(c) {
  const t = c.teachers || c.instructors || c.faculty;
  if (!t) return null;
  if (Array.isArray(t)) {
    const names = t
      .map((x) => (typeof x === "string" ? x : x?.name || x?.full_name || x?.title || null))
      .filter(Boolean);
    return names.length ? names.join(", ") : null;
  }
  if (typeof t === "object") {
    return t.name || t.full_name || null;
  }
  return typeof t === "string" ? t : null;
}
