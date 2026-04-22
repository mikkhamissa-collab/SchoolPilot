// SchoolPilot service worker (MV3, ES module).
// Responsibilities:
//  - receive SET_JWT / PING from schoolpilot.co
//  - capture teamie/asl.org cookies when tabs finish loading
//  - orchestrate ingestion posts to the SchoolPilot backend (debounced)
//  - relay scrape results from the content script

import {
  getAll as storageGetAll,
  get as storageGet,
  set as storageSet,
  getJwt,
  getBackendUrl,
  recordSync,
  recordCookiePost,
} from "./lib/storage.js";
import { postCookies, postIngest } from "./lib/api.js";

const ANALYTICS_PREFIXES = ["_ga", "_gid", "_gcl_", "OptanonConsent", "__cfruid"];
const TEAMIE_TAB_PATTERNS = [
  /^https?:\/\/([^/]+\.)?teamie\.com\//i,
  /^https?:\/\/lms\.asl\.org\//i,
];

const COOKIE_DEBOUNCE_MS = 15 * 60 * 1000; // 15 minutes

// ---------- Install & alarms ----------

// Zombie-backend migration: early dev builds let the extension point at the
// old Flask service (schoolpilot-obvu.onrender.com) or localhost. That
// override sticks across updates and returns 404 for every current endpoint.
// On every install/update, drop any backendUrl override that's not the
// canonical prod host so the extension falls through to the default
// (https://schoolpilot-claw.onrender.com). Keep the key untouched otherwise
// so future backend-swaps can still be pinned via chrome.storage.
async function migrateBackendUrl(reason) {
  try {
    const { backendUrl } = await chrome.storage.local.get("backendUrl");
    if (!backendUrl) return;
    const bad =
      backendUrl.includes("obvu") ||
      backendUrl.includes("localhost") ||
      backendUrl.includes("127.0.0.1") ||
      backendUrl.includes("schoolpilot-new");
    if (bad) {
      await chrome.storage.local.remove("backendUrl");
      console.info(
        "[SchoolPilot] removed stale backendUrl override",
        { backendUrl, reason },
      );
    }
  } catch (err) {
    console.error("[SchoolPilot] backendUrl migration failed", err);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  console.info("[SchoolPilot] installed", details);
  await migrateBackendUrl(details && details.reason);
  chrome.alarms.create("refresh", { periodInMinutes: 360 }); // every 6h
});

chrome.runtime.onStartup.addListener(async () => {
  await migrateBackendUrl("startup");
  chrome.alarms.create("refresh", { periodInMinutes: 360 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "refresh") return;
  try {
    await refreshCookiesIfReady("alarm");
  } catch (err) {
    console.error("[SchoolPilot] alarm refresh failed", err);
  }
});

// ---------- External messages (from schoolpilot.co) ----------

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || typeof msg !== "object") {
        sendResponse({ ok: false, error: "invalid message" });
        return;
      }
      if (msg.type === "PING") {
        sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
        return;
      }
      if (msg.type === "SET_JWT") {
        if (typeof msg.jwt !== "string" || !msg.jwt) {
          sendResponse({ ok: false, error: "missing jwt" });
          return;
        }
        await storageSet({ jwt: msg.jwt, userId: msg.userId || null });
        console.info("[SchoolPilot] stored jwt from", sender.origin || sender.url);
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false, error: "unknown message type" });
    } catch (err) {
      console.error("[SchoolPilot] onMessageExternal error", err);
      try {
        sendResponse({ ok: false, error: err.message || String(err) });
      } catch {
        // sendResponse may already be gone if the sender closed; ignore.
      }
    }
  })();
  return true; // keep channel open for async response
});

// ---------- Internal messages (from popup + content script) ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || typeof msg !== "object") {
        sendResponse({ ok: false, error: "invalid message" });
        return;
      }
      switch (msg.type) {
        case "GET_STATE": {
          const state = await storageGetAll();
          sendResponse({ ok: true, state });
          return;
        }
        case "TRIGGER_SYNC": {
          const result = await triggerSync({ tabId: msg.tabId });
          sendResponse(result);
          return;
        }
        case "SCRAPE_COMPLETE": {
          const result = await handleScrapeComplete(msg.payload, sender);
          sendResponse(result);
          return;
        }
        case "REFRESH_COOKIES": {
          const r = await refreshCookiesIfReady("manual");
          sendResponse(r);
          return;
        }
        default:
          sendResponse({ ok: false, error: "unknown message type" });
      }
    } catch (err) {
      console.error("[SchoolPilot] onMessage error", err);
      try {
        sendResponse({ ok: false, error: err.message || String(err) });
      } catch {
        // ignore
      }
    }
  })();
  return true;
});

// ---------- Tab listener: capture cookies on navigation ----------

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url) return;
  if (!isTeamieUrl(tab.url)) return;
  try {
    await refreshCookiesIfReady("tab-updated");
  } catch (err) {
    console.error("[SchoolPilot] tab cookie refresh failed", err);
  }
});

// ---------- Cookie capture ----------

export async function captureTeamieCookies() {
  const domains = ["teamie.com", "asl.org"];
  const all = [];
  for (const d of domains) {
    try {
      const cookies = await chrome.cookies.getAll({ domain: d });
      for (const c of cookies) {
        if (ANALYTICS_PREFIXES.some((p) => c.name.startsWith(p))) continue;
        all.push({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite: c.sameSite,
          expirationDate: c.expirationDate || null,
        });
      }
    } catch (err) {
      console.warn("[SchoolPilot] cookie read failed for", d, err);
    }
  }
  return all;
}

async function refreshCookiesIfReady(reason) {
  const jwt = await getJwt();
  if (!jwt) {
    console.info("[SchoolPilot] refreshCookies skipped: no jwt", reason);
    return { ok: false, skipped: "no-jwt" };
  }
  const cookies = await captureTeamieCookies();
  if (cookies.length === 0) {
    console.info("[SchoolPilot] refreshCookies skipped: no cookies", reason);
    return { ok: false, skipped: "no-cookies" };
  }
  const hash = await hashCookies(cookies);
  const lastHash = await storageGet("lastCookieHash");
  const lastAt = (await storageGet("lastCookiePostAt")) || 0;
  const now = Date.now();
  if (hash === lastHash && now - lastAt < COOKIE_DEBOUNCE_MS) {
    return { ok: true, skipped: "debounced" };
  }

  const backendUrl = await getBackendUrl();
  const lmsUrl = inferLmsUrl(cookies);
  const res = await postCookies({ cookies, lmsUrl, jwt, backendUrl });
  await recordCookiePost({ hash });
  if (!res.ok) {
    console.warn("[SchoolPilot] postCookies failed", res.status, res.body);
  } else {
    console.info("[SchoolPilot] posted cookies ok", res.status);
  }
  return res;
}

function inferLmsUrl(cookies) {
  const domains = new Set(cookies.map((c) => (c.domain || "").replace(/^\./, "")));
  if (domains.has("lms.asl.org") || [...domains].some((d) => d.endsWith("asl.org"))) {
    return "https://lms.asl.org";
  }
  const teamie = [...domains].find((d) => d.endsWith("teamie.com"));
  if (teamie) return `https://${teamie}`;
  return "https://lms.asl.org";
}

async function hashCookies(cookies) {
  const norm = cookies
    .map((c) => `${c.domain}|${c.name}=${c.value}`)
    .sort()
    .join("\n");
  const bytes = new TextEncoder().encode(norm);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------- Sync orchestration ----------

async function triggerSync({ tabId } = {}) {
  const jwt = await getJwt();
  if (!jwt) {
    return { ok: false, error: "not connected — open schoolpilot.co first" };
  }
  const tab = await resolveTeamieTab(tabId);
  if (!tab) {
    return { ok: false, error: "open a Teamie tab first (e.g. lms.asl.org)" };
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "RUN_SCRAPE" });
    return { ok: true, started: true, tabId: tab.id };
  } catch (err) {
    // content script might not be injected yet — try to inject.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "RUN_SCRAPE" });
      return { ok: true, started: true, tabId: tab.id, injected: true };
    } catch (err2) {
      return { ok: false, error: `failed to start scrape: ${err2.message}` };
    }
  }
}

async function resolveTeamieTab(preferredId) {
  if (preferredId != null) {
    try {
      const t = await chrome.tabs.get(preferredId);
      if (t && isTeamieUrl(t.url)) return t;
    } catch {
      // fall through
    }
  }
  const tabs = await chrome.tabs.query({});
  return tabs.find((t) => isTeamieUrl(t.url || ""));
}

function isTeamieUrl(url) {
  if (!url) return false;
  return TEAMIE_TAB_PATTERNS.some((re) => re.test(url));
}

async function handleScrapeComplete(payload, sender) {
  if (!payload || typeof payload !== "object") {
    await recordSync({ ok: false, error: "scraper returned empty payload" });
    return { ok: false, error: "empty payload" };
  }
  const jwt = await getJwt();
  if (!jwt) {
    // Not yet onboarded — this is not a sync failure, so don't record one.
    // The content script's autoFireScrapeWhenReady() deferral should prevent
    // us ever getting here, but keep the guard belt-and-braces.
    console.info(
      "[SchoolPilot] scrape-complete received without jwt — ignoring (not onboarded yet)",
    );
    return { ok: false, error: "no jwt", deferred: true };
  }

  // Refresh cookies along with ingestion.
  await refreshCookiesIfReady("scrape-complete");

  const backendUrl = await getBackendUrl();
  const res = await postIngest({ payload, jwt, backendUrl });

  const summary = summarizePayload(payload);
  if (res.ok) {
    await recordSync({ ok: true, summary });
  } else if (res.status === 404) {
    await recordSync({
      ok: false,
      summary,
      error: `Backend not ready yet (ingest endpoint returned 404). Scraped: ${summary}`,
    });
  } else {
    await recordSync({
      ok: false,
      summary,
      error: `Ingest failed: ${res.status} ${JSON.stringify(res.body || {})}`,
    });
  }
  console.info("[SchoolPilot] ingest ->", res.status, summary);
  return { ok: res.ok, status: res.status, summary };
}

function summarizePayload(p) {
  const parts = [];
  const count = (v) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0);
  if (p.courses) parts.push(`${count(p.courses)} courses`);
  if (p.assignments) parts.push(`${count(p.assignments)} assignments`);
  if (p.grades) parts.push(`${count(p.grades)} grades`);
  if (p.announcements) parts.push(`${count(p.announcements)} announcements`);
  if (p.calendar) parts.push(`${count(p.calendar)} events`);
  if (p.attachments) parts.push(`${count(p.attachments)} attachments`);
  return parts.join(", ") || "no data extracted";
}
