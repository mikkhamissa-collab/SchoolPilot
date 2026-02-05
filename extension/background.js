// background.js — Service worker for SchoolPilot: auto-sync and notifications.

const ALARM_NAME = 'schoolpilot-auto-sync';
const DEFAULT_SYNC_INTERVAL_HOURS = 4;
const WEB_APP_URL = 'https://schoolpilot.co';

// ============================================================
// ALARM SETUP
// ============================================================

chrome.runtime.onInstalled.addListener(async () => {
  const { autoSyncEnabled, syncIntervalHours } = await chrome.storage.local.get([
    'autoSyncEnabled',
    'syncIntervalHours'
  ]);

  // Enable auto-sync by default
  if (autoSyncEnabled !== false) {
    const interval = syncIntervalHours || DEFAULT_SYNC_INTERVAL_HOURS;
    await setupAutoSync(interval);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await performAutoSync();
  }
});

async function setupAutoSync(intervalHours) {
  await chrome.alarms.clear(ALARM_NAME);

  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 5, // First sync in 5 minutes
    periodInMinutes: intervalHours * 60
  });

  await chrome.storage.local.set({
    autoSyncEnabled: true,
    syncIntervalHours: intervalHours
  });
}

async function disableAutoSync() {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.storage.local.set({ autoSyncEnabled: false });
}

// ============================================================
// AUTO-SYNC
// ============================================================

async function performAutoSync() {
  try {
    // Find a Teamie tab
    const tabs = await chrome.tabs.query({ url: 'https://lms.asl.org/*' });
    const teamieTab = tabs.find(t => t.url?.includes('lms.asl.org'));

    if (!teamieTab) {
      // No Teamie tab open — notify user
      await sendNotification(
        'SchoolPilot',
        'Open Teamie to keep your assignments synced',
        'open-teamie'
      );
      return;
    }

    // Inject scraper
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: teamieTab.id },
      files: ['content.js']
    });

    const scraped = result?.result;
    if (!scraped) return;

    const assignments = scraped.assignments || [];
    const overdue = scraped.overdue || [];
    const courses = scraped.courses || [];
    const newsfeed = scraped.newsfeed || [];
    const stats = scraped.stats || {};

    // Check for new items since last sync
    const stored = await chrome.storage.local.get(['lastScanData', 'webAuthToken']);
    const lastData = stored.lastScanData || { assignments: [], overdue: [] };

    const lastKeys = new Set(lastData.assignments.map(a => `${a.title}|${a.course}`));
    const newAssignments = assignments.filter(a => !lastKeys.has(`${a.title}|${a.course}`));

    const lastOverdueKeys = new Set(lastData.overdue.map(a => `${a.title}|${a.course}`));
    const newOverdue = overdue.filter(a => !lastOverdueKeys.has(`${a.title}|${a.course}`));

    // Sync to web app if authenticated
    if (stored.webAuthToken) {
      try {
        const res = await fetch(`${WEB_APP_URL}/api/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${stored.webAuthToken}`
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

        if (res.ok) {
          await chrome.storage.local.set({
            lastScanData: { assignments, overdue },
            lastSyncTime: Date.now(),
            lastSyncStats: {
              assignments: assignments.length,
              overdue: overdue.length,
              courses: courses.length
            }
          });
        }
      } catch {
        // Sync failed silently
      }
    }

    // Notify about important changes
    if (newOverdue.length > 0) {
      await sendNotification(
        `${newOverdue.length} item(s) now overdue`,
        newOverdue.slice(0, 3).map(a => a.title).join(', '),
        'overdue'
      );
    } else if (newAssignments.length > 0) {
      await sendNotification(
        `${newAssignments.length} new assignment(s)`,
        newAssignments.slice(0, 3).map(a => a.title).join(', '),
        'new-assignments'
      );
    }

  } catch (err) {
    console.error('[SchoolPilot] Auto-sync error:', err);
  }
}

// ============================================================
// NOTIFICATIONS
// ============================================================

async function sendNotification(title, message, tag) {
  try {
    await chrome.notifications.create(tag, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message,
      priority: 2
    });
  } catch (err) {
    console.error('[SchoolPilot] Notification error:', err);
  }
}

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === 'open-teamie') {
    await chrome.tabs.create({ url: 'https://lms.asl.org/dash/#/' });
  } else {
    // Open the dashboard
    await chrome.tabs.create({ url: `${WEB_APP_URL}/dashboard` });
  }
  chrome.notifications.clear(notificationId);
});

// ============================================================
// MESSAGE HANDLERS
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'enableAutoSync') {
    setupAutoSync(message.intervalHours || DEFAULT_SYNC_INTERVAL_HOURS)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'disableAutoSync') {
    disableAutoSync()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'syncNow') {
    performAutoSync()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});
