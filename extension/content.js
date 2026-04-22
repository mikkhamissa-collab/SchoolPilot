// Content script: runs inside *.teamie.com and lms.asl.org.
// Dynamically imports scraper modules (web_accessible_resources),
// runs them against the student's authenticated session, and posts results to the background.

(async () => {
  try {
    await main();
  } catch (err) {
    console.error("[SchoolPilot] content fatal", err);
  }
})();

async function main() {
  const teamieUrl = chrome.runtime.getURL("lib/teamie.js");
  const teamie = await import(teamieUrl);

  if (!teamie.isTeamieHost()) {
    console.info("[SchoolPilot] not a Teamie host, skipping", location.hostname);
    return;
  }

  console.info("[SchoolPilot] content ready on", location.hostname);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "RUN_SCRAPE") {
      runScrape().then((r) => sendResponse(r)).catch((err) => {
        console.error("[SchoolPilot] scrape error", err);
        sendResponse({ ok: false, error: err.message || String(err) });
      });
      return true;
    }
  });

  // Auto-run once per page load, after a short delay to let SPA routing settle.
  // Only fire if the student has actually onboarded — otherwise we create a
  // confusing "no jwt" error state on their very first visit to Teamie. If the
  // JWT shows up later (they complete onboarding in another tab), storage
  // change listener picks it up and fires the scrape exactly once.
  setTimeout(() => {
    autoFireScrapeWhenReady().catch((err) =>
      console.error("[SchoolPilot] auto scrape gate error", err),
    );
  }, 2500);
}

async function autoFireScrapeWhenReady() {
  const { jwt, userId } = await chrome.storage.local.get(["jwt", "userId"]);
  if (jwt && userId) {
    await runScrape().catch((err) =>
      console.error("[SchoolPilot] auto scrape error", err),
    );
    return;
  }

  console.info(
    "[SchoolPilot] auto scrape deferred — no jwt yet, will retry when onboarding completes",
  );

  // Wait for the JWT to appear, then fire once.
  let fired = false;
  const handler = (changes, area) => {
    if (area !== "local" || fired) return;
    const jwtNow = changes.jwt && changes.jwt.newValue;
    if (!jwtNow) return;
    fired = true;
    chrome.storage.onChanged.removeListener(handler);
    console.info("[SchoolPilot] jwt arrived — firing deferred scrape");
    runScrape().catch((err) =>
      console.error("[SchoolPilot] deferred scrape error", err),
    );
  };
  chrome.storage.onChanged.addListener(handler);
}

async function runScrape() {
  console.info("[SchoolPilot] scraping started", location.href);

  const teamie = await import(chrome.runtime.getURL("lib/teamie.js"));
  if (!teamie.looksLoggedIn()) {
    console.warn("[SchoolPilot] student does not appear to be logged in — skipping scrape");
    return { ok: false, error: "not-logged-in" };
  }

  const mods = await loadScrapers();
  const baseCtx = { fetchJson: teamie.fetchJson, tryEndpoints: teamie.tryEndpoints, dom: document };

  // Resolve the student's uid from /api/me — most endpoints need it as a query arg.
  const uid = await resolveUid(teamie);
  if (!uid) {
    console.warn("[SchoolPilot] could not resolve uid from /api/me — assignments/calendar will be skipped");
  } else {
    console.info("[SchoolPilot] resolved uid", uid);
  }

  // Courses must run first: assignments + grades depend on course metadata.
  const courses = await safeRun("courses", mods.courses.scrapeCourses(baseCtx));
  const courseData = courses.ok ? courses.data : [];

  const ctx = { ...baseCtx, uid, courses: courseData };

  const [assignments, grades, announcements, calendar] = await Promise.all([
    safeRun("assignments", mods.assignments.scrapeAssignments(ctx)),
    safeRun("grades", mods.grades.scrapeGrades(ctx)),
    safeRun("announcements", mods.announcements.scrapeAnnouncements(ctx)),
    safeRun("calendar", mods.calendar.scrapeCalendar(ctx)),
  ]);

  // Attachments depend on assignments — fetch after.
  const assignmentData = assignments.ok ? assignments.data : [];
  const attachments = await safeRun(
    "attachments",
    mods.attachments.scrapeAttachments({ ...ctx, assignments: assignmentData }),
  );

  const payload = {
    source: "extension",
    captured_at: new Date().toISOString(),
    origin: location.origin,
    href: location.href,
    uid,
    courses: courseData,
    assignments: assignments.ok ? assignments.data : [],
    grades: grades.ok ? grades.data : [],
    announcements: announcements.ok ? announcements.data : [],
    calendar: calendar.ok ? calendar.data : [],
    attachments: attachments.ok ? attachments.data : [],
    errors: collectErrors({ courses, assignments, grades, announcements, calendar, attachments }),
  };

  console.info("[SchoolPilot] scrape complete", {
    courses: payload.courses.length,
    assignments: payload.assignments.length,
    grades: payload.grades.length,
    announcements: payload.announcements.length,
    calendar: payload.calendar.length,
    attachments: payload.attachments.length,
    errors: payload.errors.length,
  });

  const resp = await chrome.runtime.sendMessage({ type: "SCRAPE_COMPLETE", payload });
  return { ok: true, sent: resp };
}

async function resolveUid(teamie) {
  try {
    const r = await teamie.fetchJson("/api/me");
    if (!r.ok || !r.data) {
      console.warn("[SchoolPilot] /api/me failed", r.status, r.error || "");
      return null;
    }
    // Teamie /api/me returns { nid, uid, name, mail, ... } — uid is the canonical id.
    const uid = r.data.uid || r.data.nid || r.data.id;
    return uid != null ? String(uid) : null;
  } catch (err) {
    console.warn("[SchoolPilot] resolveUid threw", err);
    return null;
  }
}

async function loadScrapers() {
  const names = ["courses", "assignments", "grades", "attachments", "announcements", "calendar"];
  const out = {};
  for (const n of names) {
    const url = chrome.runtime.getURL(`scrapers/${n}.js`);
    out[n] = await import(url);
  }
  return out;
}

async function safeRun(label, promise) {
  try {
    const res = await promise;
    if (!res || typeof res !== "object") {
      return { ok: false, error: `${label} returned non-object` };
    }
    if (res.ok) {
      console.info("[SchoolPilot]", label, "ok:", Array.isArray(res.data) ? res.data.length : "object");
    } else {
      console.warn("[SchoolPilot]", label, "failed:", res.error);
    }
    return res;
  } catch (err) {
    console.error("[SchoolPilot]", label, "threw", err);
    return { ok: false, error: err.message || String(err) };
  }
}

function collectErrors(results) {
  const errs = [];
  for (const [k, r] of Object.entries(results)) {
    if (!r.ok) errs.push({ scraper: k, error: r.error });
  }
  return errs;
}
