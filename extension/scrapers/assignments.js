// Scrape assignments from /api/events.json (category=upcoming + category=past).
// Each response is an object keyed by event id. Output matches the backend's
// IngestAssignment Pydantic model (lms_id, course_name, title, due_date, ...).

import { TEAMIE_ENDPOINTS } from "../lib/teamie.js";

export async function scrapeAssignments({ tryEndpoints, uid, courses }) {
  if (!uid) {
    console.error("[SchoolPilot] assignments failed — missing uid");
    return { ok: false, error: "uid required for /api/events.json" };
  }

  const nidToCourse = buildCourseIndex(courses);
  const attempts = [];
  const out = [];

  for (const [label, paths] of [
    ["assignments-upcoming", TEAMIE_ENDPOINTS.assignments(uid)],
    ["assignments-past", TEAMIE_ENDPOINTS.assignmentsPast(uid)],
  ]) {
    const r = await tryEndpoints(paths, label);
    attempts.push({ label, attempts: r.attempts });
    if (!r.ok) {
      console.warn("[SchoolPilot]", label, "failed");
      continue;
    }
    const list = coerceEvents(r.data);
    for (const e of list) {
      const row = normalizeEvent(e, nidToCourse);
      if (row) out.push(row);
    }
  }

  const deduped = dedupeById(out);
  if (deduped.length === 0) {
    console.error("[SchoolPilot] assignments empty", { attempts });
    return { ok: false, error: "no assignments returned", attempts };
  }
  console.info("[SchoolPilot] assignments fetched", deduped.length, "items");
  return { ok: true, data: deduped };
}

function buildCourseIndex(courses) {
  const idx = new Map();
  if (!Array.isArray(courses)) return idx;
  for (const c of courses) {
    if (c.lms_id) idx.set(String(c.lms_id), c);
    if (c._gid) idx.set(String(c._gid), c);
  }
  return idx;
}

function coerceEvents(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  // events.json wraps rows under numeric or id keys; filter out metadata scalars.
  const values = [];
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("_") || k === "meta" || k === "pager" || k === "pagination") continue;
    if (v && typeof v === "object") values.push(v);
  }
  return values;
}

function normalizeEvent(e, nidToCourse) {
  const lmsId = String(e.nid || e.id || e.event_id || e.uuid || "");
  const title = String(e.title || e.name || e.subject || "").trim();
  if (!lmsId && !title) return null;

  const courseNid = e.classroom_nid || e.course_nid || e.gid || e.cid || null;
  const matched = courseNid != null ? nidToCourse.get(String(courseNid)) : null;
  const courseName =
    (matched && matched.name) ||
    e.classroom_name ||
    e.course_name ||
    e.course_title ||
    "Unknown course";

  const dueDate = pickDueDate(e);
  const points = pickNumber(e.points_possible ?? e.max_score ?? e.max_points);
  const earned = pickNumber(e.points_earned ?? e.score ?? e.grade_value);

  return {
    // Backend IngestAssignment schema:
    lms_id: lmsId || `${courseName}:${title}`,
    course_name: String(courseName),
    title: title || "Untitled assignment",
    description: stringOrNull(e.description || e.body || e.details),
    assignment_type: stringOrNull(e.type || e.subtype || e.kind || e.category),
    due_date: dueDate,
    points_possible: points,
    points_earned: earned,
    grade_weight: stringOrNull(e.weight || e.grade_weight),
    is_graded: !!(e.graded || e.is_graded || earned != null),
    is_submitted: !!(e.submitted || e.is_submitted || e.submission_status === "submitted"),
    is_late: !!(e.late || e.is_late || e.overdue),
    lms_url: e.url || e.link || (lmsId ? `/node/${lmsId}` : null),
  };
}

function pickDueDate(e) {
  const raw = e.due_date || e.due || e.deadline || e.end_date || e.end || e.start_date || e.start;
  if (!raw) return null;
  // Teamie sometimes returns unix seconds; detect and convert.
  if (typeof raw === "number") {
    const ms = raw > 1e12 ? raw : raw * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof raw === "string") {
    // Pure-numeric string = unix timestamp.
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      const ms = n > 1e12 ? n : n * 1000;
      return new Date(ms).toISOString();
    }
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function pickNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function dedupeById(items) {
  const seen = new Map();
  for (const a of items) {
    const key = a.lms_id || `${a.course_name}|${a.title}|${a.due_date || ""}`;
    if (!seen.has(key)) seen.set(key, a);
  }
  return [...seen.values()];
}
