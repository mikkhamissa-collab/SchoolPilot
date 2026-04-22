// Scrape calendar events from /api/calendar.json?uid=...
// Backend stashes these in agent_jobs.data_extracted (no dedicated table yet),
// so we keep the shape flexible and just pass through a normalized feed.

import { TEAMIE_ENDPOINTS } from "../lib/teamie.js";

export async function scrapeCalendar({ tryEndpoints, uid }) {
  if (!uid) {
    console.error("[SchoolPilot] calendar failed — missing uid");
    return { ok: false, error: "uid required for /api/calendar.json" };
  }

  const r = await tryEndpoints(TEAMIE_ENDPOINTS.calendar(uid), "calendar");
  if (!r.ok) {
    console.error("[SchoolPilot] calendar failed", r);
    return { ok: false, error: "calendar endpoint failed", attempts: r.attempts };
  }

  const list = coerceList(r.data);
  const events = list
    .map(normalizeEvent)
    .filter((e) => e && (e.lms_id || e.title || e.start_at));

  console.info("[SchoolPilot] calendar fetched", events.length, "items");
  return { ok: true, data: events, source: r.url };
}

function coerceList(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  for (const key of ["events", "calendar", "items", "results", "data", "nodes"]) {
    if (Array.isArray(raw[key])) return raw[key];
  }
  const numeric = Object.keys(raw).filter((k) => /^\d+$/.test(k));
  if (numeric.length > 0) {
    return numeric
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => raw[k])
      .filter((v) => v && typeof v === "object");
  }
  return [];
}

function normalizeEvent(e) {
  if (!e || typeof e !== "object") return null;
  return {
    lms_id: e.nid != null ? String(e.nid) : e.id != null ? String(e.id) : null,
    title: stringOrNull(e.title || e.name || e.summary),
    description: stringOrNull(e.description || e.body),
    start_at: toIsoDate(e.start_date || e.start || e.starts_at || e.date),
    end_at: toIsoDate(e.end_date || e.end || e.ends_at),
    course_nid: e.classroom_nid != null ? String(e.classroom_nid) : null,
    course_name: stringOrNull(e.classroom_name || e.course_name),
    location: stringOrNull(e.location || e.room),
    type: stringOrNull(e.type || e.kind || e.category),
    url: e.url || e.link || null,
  };
}

function toIsoDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const ms = v > 1e12 ? v : v * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof v === "string") {
    if (/^\d+$/.test(v)) {
      const n = Number(v);
      const ms = n > 1e12 ? n : n * 1000;
      return new Date(ms).toISOString();
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function stringOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
