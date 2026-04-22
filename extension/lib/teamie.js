// Shared constants + fetch helper for Teamie scrapers.
// Content scripts import this at runtime via chrome.runtime.getURL + dynamic import.

export const TEAMIE_HOSTS = [
  /(^|\.)teamie\.com$/i,
  /^lms\.asl\.org$/i,
];

// Verified Teamie API endpoints (probed live against lms.asl.org on 2026-04-22).
// Entries are either a static array of candidate paths or a function returning one
// for endpoints that require a uid/gid. Scrapers hand the array to tryEndpoints().
export const TEAMIE_ENDPOINTS = {
  profile: [
    "/api/me",
  ],
  profileDetail: (uid) => [
    `/api/profile/${uid}.json`,
  ],
  courses: [
    "/api/classroom.json",
  ],
  assignments: (uid) => [
    `/api/events.json?mode=category&category=upcoming&uid=${uid}&items_per_page=100&page=1`,
  ],
  assignmentsPast: (uid) => [
    `/api/events.json?mode=category&category=past&uid=${uid}&items_per_page=100&page=1`,
  ],
  calendar: (uid) => [
    `/api/calendar.json?uid=${uid}`,
  ],
  announcements: [
    "/api/bulletin-board.json?items_per_page=-1",
  ],
  activity: [
    "/api/thought.json?items_per_page=20&num_comments=2&page=1",
  ],
  courseObjectives: (gid) => [
    `/api/classroom/${gid}/objectives.json`,
  ],
};

// Cheap JSON-or-bust fetch. Returns { ok, status, data, url, bodyText }.
export async function fetchJson(path, options = {}) {
  const url = path.startsWith("http") ? path : `${location.origin}${path}`;
  let res;
  try {
    res = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch (err) {
    return { ok: false, status: 0, data: null, url, error: err.message };
  }

  const ct = res.headers.get("content-type") || "";
  const bodyText = await res.text();

  if (!res.ok) {
    return { ok: false, status: res.status, data: null, url, bodyText };
  }
  if (!ct.toLowerCase().includes("application/json")) {
    return { ok: false, status: res.status, data: null, url, bodyText, error: "not-json" };
  }

  try {
    return { ok: true, status: res.status, data: JSON.parse(bodyText), url };
  } catch (err) {
    return { ok: false, status: res.status, data: null, url, bodyText, error: `parse: ${err.message}` };
  }
}

// Try endpoints in order, return first JSON success or an aggregate failure.
export async function tryEndpoints(paths, label) {
  const attempts = [];
  for (const p of paths) {
    const r = await fetchJson(p);
    attempts.push({ url: r.url, status: r.status, error: r.error });
    console.info("[SchoolPilot]", label, "try", r.url, "->", r.status, r.ok ? "ok" : r.error || "");
    if (r.ok) return { ok: true, data: r.data, url: r.url, attempts };
  }
  return { ok: false, attempts };
}

export function isTeamieHost(hostname = location.hostname) {
  return TEAMIE_HOSTS.some((re) => re.test(hostname));
}

// Many Teamie flavours mount dashboards at /dash/#/. Detect if the student is logged in.
export function looksLoggedIn() {
  const text = document.body ? document.body.innerText || "" : "";
  if (/log\s*in|sign\s*in/i.test(document.title || "") && !/dashboard|home/i.test(document.title || "")) {
    // Title says log in — probably not authenticated.
    return false;
  }
  // Heuristics: user menu, logout link, avatar with data-user.
  const markers = [
    'a[href*="logout" i]',
    'a[href*="/logout"]',
    'button[aria-label*="user" i]',
    '[data-user-id]',
    '[class*="avatar" i]',
    '[class*="user-menu" i]',
  ];
  for (const sel of markers) {
    if (document.querySelector(sel)) return true;
  }
  // Fallback: inner text mentions "logout" somewhere.
  return /logout|sign\s*out/i.test(text);
}
