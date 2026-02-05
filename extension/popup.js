// popup.js — Minimal SchoolPilot extension. Scrapes Teamie and syncs to web app.

const WEB_APP_URL = 'https://schoolpilot.co';

// DOM refs
const syncBtn = document.getElementById('sync-btn');
const btnText = document.getElementById('btn-text');
const statusEl = document.getElementById('status');
const statsEl = document.getElementById('stats');
const statAssignments = document.getElementById('stat-assignments');
const statOverdue = document.getElementById('stat-overdue');
const statCourses = document.getElementById('stat-courses');
const timestampEl = document.getElementById('timestamp');
const notOnTeamie = document.getElementById('not-on-teamie');

// Set status message
function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

// Update stats display
function showStats(assignments, overdue, courses) {
  statAssignments.textContent = assignments;
  statOverdue.textContent = overdue;
  statCourses.textContent = courses;
  statsEl.classList.remove('hidden');
}

// Check if on Teamie and update UI
async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('lms.asl.org')) {
      notOnTeamie.classList.remove('hidden');
      syncBtn.disabled = true;
      return false;
    }
    notOnTeamie.classList.add('hidden');
    syncBtn.disabled = false;
    return true;
  } catch {
    return false;
  }
}

// Load last sync info
async function loadLastSync() {
  const { lastSyncTime, lastSyncStats } = await chrome.storage.local.get(['lastSyncTime', 'lastSyncStats']);

  if (lastSyncTime) {
    const date = new Date(lastSyncTime);
    timestampEl.textContent = `Last synced: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
  }

  if (lastSyncStats) {
    showStats(lastSyncStats.assignments, lastSyncStats.overdue, lastSyncStats.courses);
  }
}

// Main sync function
async function syncToSchoolPilot() {
  syncBtn.disabled = true;
  btnText.textContent = 'Scanning...';
  setStatus('Reading your assignments...', 'loading');

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('lms.asl.org')) {
      setStatus('Navigate to Teamie first', 'error');
      syncBtn.disabled = false;
      btnText.textContent = 'Sync Assignments';
      return;
    }

    // Inject scraper
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    const scraped = result?.result;
    if (!scraped) {
      setStatus('Could not read page. Try refreshing Teamie.', 'error');
      syncBtn.disabled = false;
      btnText.textContent = 'Sync Assignments';
      return;
    }

    // Extract data
    const assignments = scraped.assignments || [];
    const overdue = scraped.overdue || [];
    const courses = scraped.courses || [];
    const newsfeed = scraped.newsfeed || [];
    const stats = scraped.stats || {};

    const totalItems = assignments.length + overdue.length;
    if (totalItems === 0 && courses.length === 0) {
      setStatus('No assignments found. Make sure Teamie has loaded.', 'error');
      syncBtn.disabled = false;
      btnText.textContent = 'Sync Assignments';
      return;
    }

    // Update status
    btnText.textContent = 'Syncing...';
    setStatus(`Found ${totalItems} assignments. Syncing to SchoolPilot...`, 'loading');

    // Check auth token
    const { webAuthToken } = await chrome.storage.local.get(['webAuthToken']);
    if (!webAuthToken) {
      setStatus('Sign in to SchoolPilot first', 'error');
      chrome.tabs.create({ url: `${WEB_APP_URL}/auth/login` });
      syncBtn.disabled = false;
      btnText.textContent = 'Sync Assignments';
      return;
    }

    // Sync to web app
    const res = await fetch(`${WEB_APP_URL}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${webAuthToken}`
      },
      body: JSON.stringify({
        assignments,
        overdue,
        courses,
        newsfeed,
        stats,
        type: 'assignments'
      })
    });

    if (!res.ok) {
      if (res.status === 401) {
        setStatus('Session expired. Please sign in again.', 'error');
        chrome.storage.local.remove(['webAuthToken']);
        chrome.tabs.create({ url: `${WEB_APP_URL}/auth/login` });
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(err.error || 'Sync failed. Try again.', 'error');
      }
      syncBtn.disabled = false;
      btnText.textContent = 'Sync Assignments';
      return;
    }

    const data = await res.json();

    // Save sync info
    const syncStats = {
      assignments: assignments.length,
      overdue: overdue.length,
      courses: courses.length
    };
    await chrome.storage.local.set({
      lastSyncTime: Date.now(),
      lastSyncStats: syncStats,
      lastScanData: { assignments, overdue }
    });

    // Show success
    showStats(assignments.length, overdue.length, courses.length);
    setStatus('Synced! Opening your dashboard...', 'success');
    timestampEl.textContent = `Last synced: just now`;

    // Auto-open dashboard after successful sync
    setTimeout(() => {
      chrome.tabs.create({ url: `${WEB_APP_URL}/today` });
    }, 1000);

  } catch (err) {
    if (err.message.includes('Failed to fetch')) {
      setStatus('Cannot connect to SchoolPilot. Check your internet.', 'error');
    } else {
      setStatus('Something went wrong. Try again.', 'error');
    }
  } finally {
    syncBtn.disabled = false;
    btnText.textContent = 'Sync Assignments';
  }
}

// Event listeners
syncBtn.addEventListener('click', syncToSchoolPilot);

// Initialize
checkCurrentTab();
loadLastSync();

// Re-check tab when popup gains focus (user might have navigated)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkCurrentTab();
  }
});
