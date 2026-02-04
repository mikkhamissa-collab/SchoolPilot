// background.js — Service worker for SchoolPilot: recurring scans, notifications, grade-aware prioritization.

// ============================================================
// CONSTANTS
// ============================================================
const ALARM_NAME = 'schoolpilot-scan';
const PREVIEW_ALARM_NAME = 'schoolpilot-tomorrow-preview';
const DEFAULT_SCAN_INTERVAL_HOURS = 4; // Scan every 4 hours by default
const DEFAULT_PREVIEW_HOUR = 20; // 8 PM default for tomorrow preview
const TEAMIE_URL = 'https://lms.asl.org/dash/#/';

// ============================================================
// ALARM HANDLERS — Recurring Background Scans
// ============================================================

// Set up alarm when extension is installed or updated
chrome.runtime.onInstalled.addListener(async () => {
  const { autoScanEnabled, scanIntervalHours } = await chrome.storage.local.get([
    'autoScanEnabled',
    'scanIntervalHours'
  ]);

  if (autoScanEnabled !== false) {
    const interval = scanIntervalHours || DEFAULT_SCAN_INTERVAL_HOURS;
    await setupRecurringAlarm(interval);
    // Auto-scan enabled
  }

  // Set up tomorrow preview alarm
  const { tomorrowPreviewEnabled } = await chrome.storage.local.get(['tomorrowPreviewEnabled']);
  if (tomorrowPreviewEnabled !== false) {
    await setupTomorrowPreviewAlarm();
  }
});

// Handle alarm triggers
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    // Background scan triggered
    await performBackgroundScan();
  }
  if (alarm.name === PREVIEW_ALARM_NAME) {
    // Tomorrow preview triggered
    await sendTomorrowPreview();
  }
});

// Set up or update the recurring alarm
async function setupRecurringAlarm(intervalHours) {
  // Clear existing alarm
  await chrome.alarms.clear(ALARM_NAME);

  // Create new alarm
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1, // First scan in 1 minute
    periodInMinutes: intervalHours * 60
  });

  await chrome.storage.local.set({
    autoScanEnabled: true,
    scanIntervalHours: intervalHours
  });
}

// Disable recurring scans
async function disableRecurringAlarm() {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.storage.local.set({ autoScanEnabled: false });
}

// ============================================================
// BACKGROUND SCANNING
// ============================================================

async function performBackgroundScan() {
  try {
    // Find a Teamie tab or create one
    const tabs = await chrome.tabs.query({ url: 'https://lms.asl.org/*' });
    let teamieTab = tabs.find(t => t.url?.includes('lms.asl.org'));

    if (!teamieTab) {
      // No Teamie tab open — we can't scrape without one
      // Send a notification prompting user to open Teamie
      await sendNotification(
        'SchoolPilot: Open Teamie',
        'Open lms.asl.org to enable automatic assignment scanning',
        'open-teamie'
      );
      return;
    }

    // Inject scraper and get data
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: teamieTab.id },
      files: ['content.js']
    });

    const scraped = result?.result;
    if (!scraped) return;

    const assignments = scraped.assignments || [];
    const overdue = scraped.overdue || [];

    // Get stored data for comparison
    const stored = await chrome.storage.local.get([
      'lastScanData',
      'courses',
      'userEmail',
      'backendUrl'
    ]);

    const lastData = stored.lastScanData || { assignments: [], overdue: [] };

    // Find NEW assignments since last scan
    const lastAssignmentKeys = new Set(
      lastData.assignments.map(a => `${a.title}|${a.course}|${a.date}`)
    );
    const newAssignments = assignments.filter(
      a => !lastAssignmentKeys.has(`${a.title}|${a.course}|${a.date}`)
    );

    // Find NEW overdue items
    const lastOverdueKeys = new Set(
      lastData.overdue.map(a => `${a.title}|${a.course}`)
    );
    const newOverdue = overdue.filter(
      a => !lastOverdueKeys.has(`${a.title}|${a.course}`)
    );

    // Store updated data
    await chrome.storage.local.set({
      lastScanData: { assignments, overdue },
      lastScanTime: Date.now()
    });

    // Calculate grade-aware priorities if grades are available
    let urgentItems = [];
    if (stored.courses) {
      urgentItems = await getGradeAwarePriorities(assignments, overdue, stored.courses);
    }

    // Send notifications for important items
    if (newOverdue.length > 0) {
      await sendNotification(
        `${newOverdue.length} item(s) now OVERDUE`,
        newOverdue.map(a => a.title).slice(0, 3).join(', '),
        'overdue'
      );
    } else if (newAssignments.length > 0) {
      await sendNotification(
        `${newAssignments.length} new assignment(s)`,
        newAssignments.map(a => a.title).slice(0, 3).join(', '),
        'new-assignments'
      );
    } else if (urgentItems.length > 0) {
      // Notify about grade-critical assignments
      const critical = urgentItems.filter(u => u.isGradeCritical);
      if (critical.length > 0) {
        await sendNotification(
          'Grade-critical assignments',
          critical.map(c => `${c.title} - ${c.gradeImpact}`).slice(0, 2).join('; '),
          'grade-critical'
        );
      }
    }

    // Background scan complete

  } catch (err) {
    console.error('[SchoolPilot] Background scan error:', err);
  }
}

// ============================================================
// GRADE-AWARE PRIORITIZATION
// ============================================================

async function getGradeAwarePriorities(assignments, overdue, courses) {
  const prioritized = [];
  const backendUrl = (await chrome.storage.local.get('backendUrl')).backendUrl || 'http://localhost:5000';

  for (const assignment of [...overdue, ...assignments]) {
    const courseName = assignment.course;
    if (!courseName) continue;

    // Find matching course in user's grade data
    const courseKey = Object.keys(courses).find(
      k => k.toLowerCase().includes(courseName.toLowerCase()) ||
           courseName.toLowerCase().includes(k.toLowerCase())
    );

    if (!courseKey || !courses[courseKey]) continue;

    const courseData = courses[courseKey];

    // Calculate current grade for this course
    try {
      const response = await fetch(`${backendUrl}/grades/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: courseData.categories,
          grades: courseData.grades,
          policies: courseData.policies || {}
        })
      });

      if (!response.ok) continue;

      const gradeData = await response.json();
      const currentGrade = gradeData.overall;

      if (currentGrade == null) continue;

      // Check if student is at a grade boundary
      const gradeBoundaries = [90, 80, 70, 60]; // A, B, C, D cutoffs
      const nearBoundary = gradeBoundaries.find(
        b => currentGrade >= b - 3 && currentGrade < b + 2
      );

      // Determine assignment type weight
      const typeStr = (assignment.type || '').toLowerCase();
      const isHighStakes =
        typeStr.includes('test') ||
        typeStr.includes('exam') ||
        typeStr.includes('assess') ||
        typeStr.includes('quiz');

      if (nearBoundary || (currentGrade < 75 && isHighStakes)) {
        let gradeImpact = '';
        if (nearBoundary) {
          if (currentGrade < nearBoundary) {
            gradeImpact = `Could push you to ${getLetterGrade(nearBoundary)}`;
          } else {
            gradeImpact = `At risk of dropping below ${getLetterGrade(nearBoundary)}`;
          }
        } else if (currentGrade < 75) {
          gradeImpact = `Current grade: ${currentGrade}% - needs attention`;
        }

        prioritized.push({
          ...assignment,
          currentGrade,
          nearBoundary,
          isGradeCritical: true,
          gradeImpact,
          priorityScore: calculatePriorityScore(assignment, currentGrade, nearBoundary, isHighStakes)
        });
      }
    } catch {
      // Backend unavailable, skip grade calculation
    }
  }

  // Sort by priority score (highest first)
  return prioritized.sort((a, b) => b.priorityScore - a.priorityScore);
}

function calculatePriorityScore(assignment, currentGrade, nearBoundary, isHighStakes) {
  let score = 0;

  // Overdue: highest priority
  if (assignment.isOverdue) score += 1000;

  // Near grade boundary: +500
  if (nearBoundary) score += 500;

  // Low grade: +300
  if (currentGrade < 75) score += 300;

  // High stakes assignment: +200
  if (isHighStakes) score += 200;

  // Due date proximity
  if (assignment.date) {
    const dayNum = parseInt(assignment.date);
    if (!isNaN(dayNum)) {
      score += Math.max(0, 31 - dayNum) * 10;
    }
  }

  return score;
}

function getLetterGrade(percentage) {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

// ============================================================
// TOMORROW PREVIEW — Evening notification of what's due tomorrow
// ============================================================

async function setupTomorrowPreviewAlarm() {
  await chrome.alarms.clear(PREVIEW_ALARM_NAME);

  // Calculate minutes until the next preview time (default 8 PM)
  const { previewHour } = await chrome.storage.local.get(['previewHour']);
  const hour = previewHour || DEFAULT_PREVIEW_HOUR;

  const now = new Date();
  const target = new Date();
  target.setHours(hour, 0, 0, 0);

  // If it's already past the preview time today, schedule for tomorrow
  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }

  const delayMs = target.getTime() - now.getTime();
  const delayMinutes = Math.max(1, Math.round(delayMs / 60000));

  chrome.alarms.create(PREVIEW_ALARM_NAME, {
    delayInMinutes: delayMinutes,
    periodInMinutes: 24 * 60 // Repeat every 24 hours
  });

  await chrome.storage.local.set({ tomorrowPreviewEnabled: true });
  // Tomorrow preview scheduled
}

async function disableTomorrowPreview() {
  await chrome.alarms.clear(PREVIEW_ALARM_NAME);
  await chrome.storage.local.set({ tomorrowPreviewEnabled: false });
}

async function sendTomorrowPreview() {
  try {
    const stored = await chrome.storage.local.get([
      'lastScanData',
      'courses',
      'backendUrl'
    ]);

    const scanData = stored.lastScanData;
    if (!scanData) {
      // No scan data — try a fresh scan first
      await performBackgroundScan();
      return; // The scan will store data; preview will fire again tomorrow
    }

    const assignments = scanData.assignments || [];
    const overdue = scanData.overdue || [];

    // Determine tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.getDate().toString().padStart(2, '0');
    const tomorrowDay = tomorrow.toLocaleDateString('en-US', { weekday: 'short' });

    // Find items due tomorrow by matching date field (day number)
    const tomorrowItems = assignments.filter(a => {
      if (!a.date) return false;
      const dateStr = a.date.toString().trim();
      return dateStr === tomorrowDate || dateStr === tomorrowDate.replace(/^0/, '');
    });

    // Build the preview message
    const parts = [];

    // Overdue items always shown
    if (overdue.length > 0) {
      parts.push(`⚠️ ${overdue.length} overdue`);
    }

    if (tomorrowItems.length > 0) {
      // Group by type for a concise summary
      const types = {};
      for (const item of tomorrowItems) {
        const type = (item.type || 'Task').split('\n')[0].trim();
        types[type] = (types[type] || 0) + 1;
      }
      const typeSummary = Object.entries(types)
        .map(([t, count]) => `${count} ${t}${count > 1 ? 's' : ''}`)
        .join(', ');
      parts.push(typeSummary);
    }

    // Get grade context for tomorrow's items
    let gradeCriticalCount = 0;
    if (stored.courses && tomorrowItems.length > 0) {
      try {
        const priorities = await getGradeAwarePriorities(tomorrowItems, [], stored.courses);
        gradeCriticalCount = priorities.filter(p => p.isGradeCritical).length;
      } catch {
        // Grade context unavailable, skip
      }
    }

    if (gradeCriticalCount > 0) {
      parts.push(`🔥 ${gradeCriticalCount} grade-critical`);
    }

    // Build notification
    if (tomorrowItems.length === 0 && overdue.length === 0) {
      await sendNotification(
        '🌙 Tomorrow looks clear!',
        'No assignments due tomorrow. Great time to get ahead.',
        'tomorrow-preview'
      );
    } else {
      const title = `📋 Tomorrow: ${tomorrowItems.length} item${tomorrowItems.length !== 1 ? 's' : ''} due`;
      const topItems = tomorrowItems
        .slice(0, 3)
        .map(a => a.title)
        .join(', ');

      const message = parts.length > 0
        ? `${parts.join(' · ')}\n${topItems}`
        : topItems;

      await sendNotification(title, message, 'tomorrow-preview');
    }

    // Tomorrow preview sent

  } catch (err) {
    console.error('[SchoolPilot] Tomorrow preview error:', err);
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

// Handle notification clicks
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === 'open-teamie') {
    await chrome.tabs.create({ url: TEAMIE_URL });
  } else {
    // Open the extension popup by focusing the browser
    // (Can't programmatically open popup, but clicking notification brings focus)
  }
  chrome.notifications.clear(notificationId);
});

// ============================================================
// MESSAGE HANDLERS — Communication with popup
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'enableAutoScan') {
    setupRecurringAlarm(message.intervalHours || DEFAULT_SCAN_INTERVAL_HOURS)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'disableAutoScan') {
    disableRecurringAlarm()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'scanNow') {
    performBackgroundScan()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'getGradePriorities') {
    const { assignments, overdue, courses } = message;
    getGradeAwarePriorities(assignments, overdue, courses)
      .then(priorities => sendResponse({ priorities }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'getScanStatus') {
    chrome.storage.local.get(['autoScanEnabled', 'scanIntervalHours', 'lastScanTime'])
      .then(sendResponse);
    return true;
  }

  if (message.type === 'enableTomorrowPreview') {
    if (message.hour != null) {
      chrome.storage.local.set({ previewHour: message.hour });
    }
    setupTomorrowPreviewAlarm()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'disableTomorrowPreview') {
    disableTomorrowPreview()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'testTomorrowPreview') {
    sendTomorrowPreview()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});
