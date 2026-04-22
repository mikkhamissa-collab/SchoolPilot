// Popup script: read state from storage, render immediately, refresh in background.

const els = {
  version: document.getElementById("version"),
  dot: document.getElementById("dot"),
  statusPrimary: document.getElementById("statusPrimary"),
  statusSecondary: document.getElementById("statusSecondary"),
  lastSync: document.getElementById("lastSync"),
  lastResult: document.getElementById("lastResult"),
  syncBtn: document.getElementById("syncBtn"),
  openBtn: document.getElementById("openBtn"),
  debugLink: document.getElementById("debugLink"),
};

els.version.textContent = "v" + chrome.runtime.getManifest().version;

els.openBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://schoolpilot.co/today" });
});

els.debugLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id });
});

els.syncBtn.addEventListener("click", async () => {
  els.syncBtn.disabled = true;
  els.syncBtn.textContent = "Syncing…";
  try {
    const tab = await getActiveTeamieTab();
    const r = await chrome.runtime.sendMessage({
      type: "TRIGGER_SYNC",
      tabId: tab ? tab.id : undefined,
    });
    if (!r || !r.ok) {
      renderError(r && r.error ? r.error : "Sync failed");
    }
  } finally {
    // Re-render after a short delay to pick up results.
    setTimeout(render, 1500);
  }
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") render();
});

render();

async function render() {
  const { state } = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const hasJwt = !!(state && state.jwt);

  if (hasJwt) {
    els.dot.className = "dot connected";
    els.statusPrimary.textContent = "Connected to SchoolPilot ✓";
    els.statusSecondary.textContent = state.userId ? `Signed in as ${shorten(state.userId)}` : "";
  } else {
    els.dot.className = "dot";
    els.statusPrimary.textContent = "Not connected";
    els.statusSecondary.textContent = "Open schoolpilot.co to connect";
  }

  if (state && state.lastSyncAt) {
    els.lastSync.textContent = timeAgo(state.lastSyncAt);
  } else {
    els.lastSync.textContent = "Never";
  }

  if (state && state.lastSyncResult) {
    if (state.lastSyncResult.ok) {
      els.lastResult.textContent = state.lastSyncResult.summary || "ok";
      els.lastResult.style.color = "#22c55e";
    } else {
      els.lastResult.textContent = state.lastSyncResult.error || state.lastSyncResult.summary || "failed";
      els.lastResult.style.color = "#f59e0b";
    }
  } else {
    els.lastResult.textContent = "—";
    els.lastResult.style.color = "";
  }

  // Enable sync button if connected AND a Teamie tab exists.
  const teamieTab = await getActiveTeamieTab();
  els.syncBtn.disabled = !(hasJwt && teamieTab);
  els.syncBtn.textContent = "Sync now";
  if (!teamieTab && hasJwt) {
    els.syncBtn.title = "Open a Teamie tab first (e.g. lms.asl.org)";
  } else {
    els.syncBtn.title = "";
  }
}

function renderError(msg) {
  els.lastResult.textContent = msg;
  els.lastResult.style.color = "#ef4444";
}

async function getActiveTeamieTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find((t) => isTeamieUrl(t.url || ""));
}

function isTeamieUrl(url) {
  return /^https?:\/\/([^/]+\.)?teamie\.com\//i.test(url) || /^https?:\/\/lms\.asl\.org\//i.test(url);
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function shorten(s) {
  return s.length > 10 ? s.slice(0, 6) + "…" + s.slice(-3) : s;
}
