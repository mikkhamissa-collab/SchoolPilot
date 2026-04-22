// Scrape announcements from /api/bulletin-board.json.
// Backend stashes announcements in agent_jobs.data_extracted; no strict schema,
// so we normalize to a tidy list of title/body/author/posted_at rows.

import { TEAMIE_ENDPOINTS } from "../lib/teamie.js";

export async function scrapeAnnouncements({ tryEndpoints }) {
  const r = await tryEndpoints(TEAMIE_ENDPOINTS.announcements, "announcements");
  if (!r.ok) {
    console.error("[SchoolPilot] announcements failed", r);
    return { ok: false, error: "bulletin-board endpoint failed", attempts: r.attempts };
  }

  const list = coerceList(r.data);
  const posts = list
    .map(normalizePost)
    .filter((p) => p && (p.lms_id || p.title || p.body));

  console.info("[SchoolPilot] announcements fetched", posts.length, "items");
  return { ok: true, data: posts, source: r.url };
}

function coerceList(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  for (const key of ["bulletin", "bulletins", "posts", "announcements", "items", "results", "data", "nodes"]) {
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

function normalizePost(p) {
  if (!p || typeof p !== "object") return null;
  return {
    lms_id: p.nid != null ? String(p.nid) : p.id != null ? String(p.id) : null,
    title: stringOrNull(p.title || p.subject || p.name),
    body: stringOrNull(p.body || p.content || p.message || p.description),
    author: extractAuthor(p),
    posted_at: toIsoDate(p.created || p.created_at || p.posted_at || p.date),
    course_nid: p.classroom_nid != null ? String(p.classroom_nid) : null,
    course_name: stringOrNull(p.classroom_name || p.course_name),
    url: p.url || p.link || (p.nid ? `/node/${p.nid}` : null),
  };
}

function extractAuthor(p) {
  const a = p.author || p.created_by || p.user || p.poster;
  if (!a) return null;
  if (typeof a === "string") return a;
  if (typeof a === "object") return a.name || a.full_name || a.display_name || null;
  return null;
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
