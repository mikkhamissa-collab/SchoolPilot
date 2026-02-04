// popup.js — Orchestrates scanning, email config, tabs, grades, focus, study, and sprint.

// Polyfill: if chrome.storage is unavailable (e.g. opened outside extension context), provide a no-op shim.
if (typeof chrome === 'undefined' || !chrome.storage) {
  if (typeof chrome === 'undefined') window.chrome = {};
  chrome.storage = { local: {
    get: (_keys, cb) => cb({}),
    set: (_data, cb) => { if (cb) cb(); },
    remove: (_keys, cb) => { if (cb) cb(); }
  }};
}

// ============================================================
// UTILITIES
// ============================================================
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k.startsWith('data-')) node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const child of children) {
    if (typeof child === 'string') node.append(child);
    else if (child) node.appendChild(child);
  }
  return node;
}

function populateSelect(selectEl, items, emptyText) {
  selectEl.textContent = '';
  if (items.length === 0) {
    selectEl.appendChild(el('option', { value: '', text: emptyText || 'None' }));
    return;
  }
  items.forEach(name => {
    selectEl.appendChild(el('option', { value: name, text: name }));
  });
}

// ============================================================
// BACKEND API
// ============================================================
let BACKEND_URL = 'http://localhost:5000';

async function apiFetch(path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Backend error' }));
    throw new Error(err.error || `Server returned ${res.status}`);
  }
  return res.json();
}

function handleFetchError(err) {
  if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
    return 'Cannot reach backend. Is server.py running?';
  }
  return err.message;
}

function setStatus(el, msg, type = '') {
  el.textContent = msg;
  el.className = `status ${type}`;
}

// ============================================================
// DOM REFS
// ============================================================

// Settings
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const emailInput = document.getElementById('email-input');
const saveEmailBtn = document.getElementById('save-email-btn');
const emailStatusEl = document.getElementById('email-status');
const currentEmailEl = document.getElementById('current-email');
const backendUrlInput = document.getElementById('backend-url-input');
const saveBackendBtn = document.getElementById('save-backend-btn');
const backendStatusEl = document.getElementById('backend-status');

// Plan
const scanBtn = document.getElementById('scan-btn');
const planStatus = document.getElementById('plan-status');
const planTimestamp = document.getElementById('plan-timestamp');

// Focus / Chunking
const chunkTitle = document.getElementById('chunk-title');
const chunkType = document.getElementById('chunk-type');
const chunkCourse = document.getElementById('chunk-course');
const chunkDue = document.getElementById('chunk-due');
const chunkContext = document.getElementById('chunk-context');
const chunkBtn = document.getElementById('chunk-btn');
const chunkResults = document.getElementById('chunk-results');
const chunkList = document.getElementById('chunk-list');
const chunkTotal = document.getElementById('chunk-total');
const chunkProgressBar = document.getElementById('chunk-progress-bar');
const chunkStatus = document.getElementById('chunk-status');

// Study Guide
const studyForm = document.getElementById('study-form');
const studyOnboarding = document.getElementById('study-onboarding');
const studyCourseSelect = document.getElementById('study-course-select');
const studyUnit = document.getElementById('study-unit');
const studyNotes = document.getElementById('study-notes');
const studyBtn = document.getElementById('study-btn');
const studyResults = document.getElementById('study-results');
const studyUnitTitle = document.getElementById('study-unit-title');
const studySummary = document.getElementById('study-summary');
const studyConcepts = document.getElementById('study-concepts');
const studyTopics = document.getElementById('study-topics');
const studyQuestions = document.getElementById('study-questions');
const studyStatus = document.getElementById('study-status');

// Sync
const syncGradesBtn = document.getElementById('sync-grades-btn');
const syncAssessmentsBtn = document.getElementById('sync-assessments-btn');
const syncStatus = document.getElementById('sync-status');
const syncTimestamp = document.getElementById('sync-timestamp');
const assessmentsSection = document.getElementById('assessments-section');
const assessmentsList = document.getElementById('assessments-list');

// Grades
const courseListEl = document.getElementById('course-list');
const addCourseBtn = document.getElementById('add-course-btn');
const addCoursePanel = document.getElementById('add-course-panel');
const newCourseName = document.getElementById('new-course-name');
const catInputs = document.getElementById('cat-inputs');
const addCatBtn = document.getElementById('add-cat-btn');
const saveCourseBtn = document.getElementById('save-course-btn');
const cancelCourseBtn = document.getElementById('cancel-course-btn');
const gradeDisplay = document.getElementById('grade-display');
const gradePct = document.getElementById('grade-pct');
const gradeLetter = document.getElementById('grade-letter');
const gradeCategories = document.getElementById('grade-categories');
const gradeCatSelect = document.getElementById('grade-cat-select');
const gradeName = document.getElementById('grade-name');
const gradeScore = document.getElementById('grade-score');
const gradeMax = document.getElementById('grade-max');
const addGradeBtn = document.getElementById('add-grade-btn');
const targetGrade = document.getElementById('target-grade');
const targetCatSelect = document.getElementById('target-cat-select');
const calcRequiredBtn = document.getElementById('calc-required-btn');
const requiredResult = document.getElementById('required-result');
const whatifScore = document.getElementById('whatif-score');
const whatifMax = document.getElementById('whatif-max');
const whatifCatSelect = document.getElementById('whatif-cat-select');
const calcWhatifBtn = document.getElementById('calc-whatif-btn');
const whatifResult = document.getElementById('whatif-result');
const gradesStatus = document.getElementById('grades-status');

// Sprint
const sprintOnboarding = document.getElementById('sprint-onboarding');
const sprintTestNameInput = document.getElementById('sprint-test-name-input');
const sprintTestDate = document.getElementById('sprint-test-date');
const sprintCourseSelect = document.getElementById('sprint-course-select');
const sprintHours = document.getElementById('sprint-hours');
const sprintTopicsList = document.getElementById('sprint-topics-list');
const sprintAddTopic = document.getElementById('sprint-add-topic');
const sprintCreateBtn = document.getElementById('sprint-create-btn');
const sprintSetup = document.getElementById('sprint-setup');
const sprintActive = document.getElementById('sprint-active');
const sprintActiveName = document.getElementById('sprint-active-name');
const sprintActiveDate = document.getElementById('sprint-active-date');
const sprintProgressFill = document.getElementById('sprint-progress-fill');
const sprintProgressText = document.getElementById('sprint-progress-text');
const sprintDaysList = document.getElementById('sprint-days-list');
const sprintTipsBox = document.getElementById('sprint-tips-box');
const sprintTipsList = document.getElementById('sprint-tips-list');
const sprintEndBtn = document.getElementById('sprint-end-btn');
const sprintStatus = document.getElementById('sprint-status');

// ============================================================
// STATE
// ============================================================
let courses = {};
let activeCourse = null;
let currentChunks = [];
let chunkChecked = [];
let activeSprint = null;

// ============================================================
// TABS — Single consolidated handler
// ============================================================
const tabCallbacks = {
  study: () => updateStudyCourseSelect(),
  sprint: () => {
    updateSprintCourseSelect();
    if (!activeSprint) initSprintSetup();
  }
};

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    const cb = tabCallbacks[btn.dataset.tab];
    if (cb) cb();
  });
});

// ============================================================
// SETTINGS — Email & Backend URL
// ============================================================
function showCurrentEmail(email) {
  currentEmailEl.textContent = '';
  if (email) {
    currentEmailEl.append('Sending to: ');
    currentEmailEl.appendChild(el('span', { text: email }));
  } else {
    const hint = el('span', { text: 'No email set \u2014 click \u2699 to add one' });
    hint.style.color = 'var(--error)';
    currentEmailEl.appendChild(hint);
  }
}

chrome.storage.local.get(['userEmail', 'courses', 'activeCourse', 'backendUrl'], (result) => {
  const saved = result.userEmail || '';
  emailInput.value = saved;
  showCurrentEmail(saved);
  if (result.backendUrl) {
    BACKEND_URL = result.backendUrl;
    backendUrlInput.value = result.backendUrl;
  } else {
    backendUrlInput.value = BACKEND_URL;
  }
  if (result.courses) {
    courses = result.courses;
    activeCourse = result.activeCourse || null;
    renderCourseList();
    if (activeCourse && courses[activeCourse]) loadCourseGrades();
  }
});

settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('visible'));

saveEmailBtn.addEventListener('click', () => {
  const email = emailInput.value.trim();
  if (!email || !email.includes('@')) {
    emailStatusEl.textContent = 'Enter a valid email';
    emailStatusEl.className = 'email-error';
    return;
  }
  chrome.storage.local.set({ userEmail: email }, () => {
    emailStatusEl.textContent = 'Saved!';
    emailStatusEl.className = 'email-saved';
    showCurrentEmail(email);
    setTimeout(() => { emailStatusEl.textContent = ''; }, 2000);
  });
});

saveBackendBtn.addEventListener('click', () => {
  const url = backendUrlInput.value.trim().replace(/\/+$/, '');
  if (!url) {
    backendStatusEl.textContent = 'Enter a URL';
    backendStatusEl.className = 'email-error';
    return;
  }
  BACKEND_URL = url;
  chrome.storage.local.set({ backendUrl: url }, () => {
    backendStatusEl.textContent = 'Saved!';
    backendStatusEl.className = 'email-saved';
    setTimeout(() => { backendStatusEl.textContent = ''; }, 2000);
  });
});

// ============================================================
// DAILY PLAN — SCAN & SEND
// ============================================================
scanBtn.addEventListener('click', async () => {
  scanBtn.disabled = true;
  const { userEmail } = await chrome.storage.local.get(['userEmail']);
  if (!userEmail) {
    setStatus(planStatus, 'Set your email first (click the gear icon).', 'error');
    settingsPanel.classList.add('visible');
    scanBtn.disabled = false;
    return;
  }
  setStatus(planStatus, 'Scanning Teamie...', 'loading');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('lms.asl.org')) {
      setStatus(planStatus, 'Not on Teamie. Navigate to lms.asl.org/dash first.', 'error');
      scanBtn.disabled = false;
      return;
    }
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const scraped = result?.result;
    // Support both old format (array) and new format ({ courses, assignments, overdue })
    const upcoming = Array.isArray(scraped) ? scraped : (scraped?.assignments || []);
    const overdue = Array.isArray(scraped) ? [] : (scraped?.overdue || []);

    if (upcoming.length === 0 && overdue.length === 0) {
      setStatus(planStatus, 'No assignments found. Are you on lms.asl.org/dash?', 'error');
      scanBtn.disabled = false;
      return;
    }

    const totalCount = upcoming.length + overdue.length;
    const overdueNote = overdue.length > 0 ? ` (${overdue.length} overdue!)` : '';
    setStatus(planStatus, `Found ${totalCount} assignments${overdueNote}. Sending to AI...`, 'loading');

    // Send both upcoming and overdue separately so backend can prioritize properly
    await apiFetch('/process', { assignments: upcoming, overdue, email: userEmail });
    setStatus(planStatus, 'Email sent! Check your inbox.', 'success');
    planTimestamp.textContent = `Last scanned: ${new Date().toLocaleTimeString()}`;

    // Store scan data for background service worker
    await chrome.storage.local.set({
      lastScanData: { assignments: upcoming, overdue },
      lastScanTime: Date.now()
    });

    // Fetch grade-aware priorities after successful scan
    if (Object.keys(courses).length > 0) {
      try {
        const priorities = await fetchGradeAwarePriorities(upcoming, overdue);
        renderPriorityItems(priorities);
      } catch (err) {
        console.error('Failed to fetch priorities:', err);
      }
    }
  } catch (err) {
    setStatus(planStatus, handleFetchError(err), 'error');
  } finally {
    scanBtn.disabled = false;
  }
});

// ============================================================
// SYNC TO WEB APP (schoolpilot.co)
// ============================================================
const syncWebBtn = document.getElementById('sync-web-btn');
const WEB_APP_URL = 'https://schoolpilot.co';

if (syncWebBtn) {
  syncWebBtn.addEventListener('click', async () => {
    syncWebBtn.disabled = true;
    setStatus(planStatus, 'Scanning Teamie...', 'loading');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.includes('lms.asl.org')) {
        setStatus(planStatus, 'Not on Teamie. Navigate to lms.asl.org/dash first.', 'error');
        syncWebBtn.disabled = false;
        return;
      }
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      const scraped = result?.result;
      // Support both old format (array) and new format ({ courses, assignments, overdue, newsfeed })
      const assignments = Array.isArray(scraped) ? scraped : (scraped?.assignments || []);
      const overdue = Array.isArray(scraped) ? [] : (scraped?.overdue || []);
      const scrapedCourses = Array.isArray(scraped) ? [] : (scraped?.courses || []);
      const newsfeed = Array.isArray(scraped) ? [] : (scraped?.newsfeed || []);
      const stats = Array.isArray(scraped) ? {} : (scraped?.stats || {});

      if (assignments.length === 0 && scrapedCourses.length === 0 && overdue.length === 0) {
        setStatus(planStatus, 'No data found. Are you on lms.asl.org/dash?', 'error');
        syncWebBtn.disabled = false;
        return;
      }

      const totalAssign = assignments.length + overdue.length;
      setStatus(planStatus, `Found ${scrapedCourses.length} courses, ${totalAssign} assignments${overdue.length ? ` (${overdue.length} overdue)` : ''}. Syncing...`, 'loading');

      const { webAuthToken } = await chrome.storage.local.get(['webAuthToken']);
      if (!webAuthToken) {
        setStatus(planStatus, 'Not signed in to schoolpilot.co. Opening sign-in page...', 'error');
        chrome.tabs.create({ url: `${WEB_APP_URL}/auth/login` });
        syncWebBtn.disabled = false;
        return;
      }

      const res = await fetch(`${WEB_APP_URL}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${webAuthToken}`
        },
        body: JSON.stringify({ assignments, overdue, courses: scrapedCourses, newsfeed, stats, type: 'assignments' })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setStatus(planStatus, 'Session expired. Sign in to schoolpilot.co again.', 'error');
          chrome.storage.local.remove(['webAuthToken']);
        } else {
          throw new Error(err.error || 'Sync failed');
        }
        syncWebBtn.disabled = false;
        return;
      }

      const data = await res.json();
      const parts = [];
      if (data.courses_created > 0) parts.push(`${data.courses_created} new courses`);
      parts.push(`${data.count} assignments`);
      if (data.overdue_count > 0) parts.push(`${data.overdue_count} overdue`);
      setStatus(planStatus, `✓ Synced ${parts.join(', ')} to schoolpilot.co!`, 'success');
      planTimestamp.textContent = `Last synced: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      setStatus(planStatus, handleFetchError(err), 'error');
    } finally {
      syncWebBtn.disabled = false;
    }
  });
}

// ============================================================
// GRADES — COURSE MANAGEMENT
// ============================================================
function saveCourses() {
  chrome.storage.local.set({ courses, activeCourse });
}

function renderCourseList() {
  const names = Object.keys(courses);
  courseListEl.textContent = '';
  if (names.length === 0) {
    const msg = el('div', { class: 'no-courses' });
    msg.append('No courses yet. ');
    const link = el('a', { text: 'Add one', onclick: showAddCourse });
    msg.appendChild(link);
    msg.append('.');
    courseListEl.appendChild(msg);
    gradeDisplay.classList.add('hidden');
    return;
  }
  names.forEach(name => {
    const chip = el('span', {
      class: `course-chip ${name === activeCourse ? 'active' : ''}`,
      'data-course': name,
      onclick: () => { activeCourse = name; saveCourses(); renderCourseList(); loadCourseGrades(); }
    });
    chip.textContent = name;
    const delBtn = el('button', {
      class: 'chip-delete',
      text: '\u00d7',
      onclick: (e) => {
        e.stopPropagation();
        if (!confirm(`Remove "${name}" and all its grades?`)) return;
        delete courses[name];
        if (activeCourse === name) { activeCourse = null; gradeDisplay.classList.add('hidden'); }
        saveCourses();
        renderCourseList();
      }
    });
    chip.appendChild(delBtn);
    courseListEl.appendChild(chip);
  });
}

function showAddCourse() {
  addCoursePanel.classList.add('visible');
  newCourseName.value = '';
  catInputs.textContent = '';
  addCatRow('Tests', 40);
  addCatRow('Quizzes', 25);
  addCatRow('Homework', 20);
  addCatRow('Participation', 15);
}

function addCatRow(name = '', weight = '') {
  const row = el('div', { class: 'cat-input-row' });
  const nameInput = el('input', { type: 'text', placeholder: 'Category name', value: name });
  const weightInput = el('input', { type: 'number', placeholder: '%', value: weight, min: '0', max: '100' });
  const removeBtn = el('button', { class: 'remove-cat', text: '\u00d7', onclick: () => row.remove() });
  row.append(nameInput, weightInput, removeBtn);
  catInputs.appendChild(row);
}

addCourseBtn.addEventListener('click', showAddCourse);
addCatBtn.addEventListener('click', () => addCatRow());
cancelCourseBtn.addEventListener('click', () => addCoursePanel.classList.remove('visible'));

saveCourseBtn.addEventListener('click', () => {
  const name = newCourseName.value.trim();
  if (!name) return;
  const cats = [];
  catInputs.querySelectorAll('.cat-input-row').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const catName = inputs[0].value.trim();
    const catWeight = parseFloat(inputs[1].value);
    if (catName && catWeight > 0) cats.push({ name: catName, weight: catWeight / 100 });
  });
  if (cats.length === 0) return;

  const total = cats.reduce((s, c) => s + c.weight, 0);
  if (Math.abs(total - 1.0) > 0.02) {
    setStatus(gradesStatus, `Weights sum to ${Math.round(total * 100)}%, should be 100%`, 'error');
    return;
  }

  courses[name] = { categories: cats, grades: [], policies: {} };
  activeCourse = name;
  saveCourses();
  addCoursePanel.classList.remove('visible');
  setStatus(gradesStatus, '', '');
  renderCourseList();
  loadCourseGrades();
});

// ============================================================
// GRADES — DISPLAY & CALCULATE
// ============================================================
async function loadCourseGrades() {
  if (!activeCourse || !courses[activeCourse]) {
    gradeDisplay.classList.add('hidden');
    return;
  }
  const course = courses[activeCourse];
  gradeDisplay.classList.remove('hidden');

  // Populate category selects
  const catNames = course.categories.map(c => c.name);
  [gradeCatSelect, targetCatSelect, whatifCatSelect].forEach(sel => populateSelect(sel, catNames));

  try {
    const data = await apiFetch('/grades/calculate', {
      categories: course.categories,
      grades: course.grades,
      policies: course.policies
    });
    if (data.overall != null) {
      gradePct.textContent = `${data.overall}%`;
      gradeLetter.textContent = data.letter;
    } else {
      gradePct.textContent = '--';
      gradeLetter.textContent = '--';
    }
    // Render categories safely
    gradeCategories.textContent = '';
    Object.entries(data.categories || {}).forEach(([name, info]) => {
      const row = el('div', { class: 'cat-row' });
      const nameSpan = el('span', { class: 'cat-name' });
      nameSpan.textContent = name;
      nameSpan.appendChild(el('span', { class: 'cat-weight', text: `${Math.round(info.weight * 100)}%` }));
      row.appendChild(nameSpan);
      row.appendChild(el('span', { class: 'cat-avg', text: info.average != null ? `${info.average}%` : 'No grades' }));
      gradeCategories.appendChild(row);
    });
  } catch {
    gradePct.textContent = '--';
    gradeLetter.textContent = '--';
    gradeCategories.textContent = '';
    gradeCategories.appendChild(el('div', { text: 'Cannot reach backend', class: 'result-muted' }));
  }
}

// Add grade
addGradeBtn.addEventListener('click', () => {
  if (!activeCourse) return;
  const cat = gradeCatSelect.value;
  const name = gradeName.value.trim();
  const score = parseFloat(gradeScore.value);
  const max = parseFloat(gradeMax.value);
  if (!cat || !name || isNaN(score) || isNaN(max) || max <= 0) {
    setStatus(gradesStatus, 'Fill in all grade fields', 'error');
    return;
  }
  courses[activeCourse].grades.push({ category: cat, name, score, max });
  saveCourses();
  gradeName.value = '';
  gradeScore.value = '';
  gradeMax.value = '100';
  setStatus(gradesStatus, `Added: ${name} (${score}/${max})`, 'success');
  setTimeout(() => setStatus(gradesStatus, '', ''), 2000);
  loadCourseGrades();
});

// Required score
calcRequiredBtn.addEventListener('click', async () => {
  if (!activeCourse) return;
  const course = courses[activeCourse];
  const target = parseFloat(targetGrade.value);
  const category = targetCatSelect.value;
  if (isNaN(target) || !category) return;

  try {
    const data = await apiFetch('/grades/required', {
      categories: course.categories, grades: course.grades,
      policies: course.policies, target, category
    });
    requiredResult.style.display = 'block';
    requiredResult.textContent = '';
    if (data.achievable) {
      requiredResult.appendChild(el('div', { class: 'result-highlight', text: `${data.required_pct}%` }));
      requiredResult.appendChild(el('div', { text: data.explanation }));
    } else {
      requiredResult.appendChild(el('div', { class: 'result-muted', text: data.explanation }));
    }
  } catch {
    requiredResult.style.display = 'block';
    requiredResult.textContent = '';
    requiredResult.appendChild(el('span', { class: 'result-muted', text: 'Cannot reach backend' }));
  }
});

// What-if
calcWhatifBtn.addEventListener('click', async () => {
  if (!activeCourse) return;
  const course = courses[activeCourse];
  const score = parseFloat(whatifScore.value);
  const max = parseFloat(whatifMax.value);
  const category = whatifCatSelect.value;
  if (isNaN(score) || isNaN(max) || !category) return;

  try {
    const data = await apiFetch('/grades/whatif', {
      categories: course.categories, grades: course.grades,
      policies: course.policies, hypotheticals: [{ category, name: 'What-if', score, max }]
    });
    whatifResult.style.display = 'block';
    whatifResult.textContent = '';
    const changeStr = data.change > 0 ? `+${data.change}` : `${data.change}`;
    const changeColor = data.change >= 0 ? 'var(--success)' : 'var(--error)';
    whatifResult.appendChild(el('div', { class: 'result-highlight', text: `${data.projected}% ${data.projected_letter}` }));
    const detail = el('div');
    detail.textContent = `Current: ${data.current}% \u2192 Projected: ${data.projected}% `;
    const changeSpan = el('span', { text: `(${changeStr})` });
    changeSpan.style.color = changeColor;
    changeSpan.style.fontWeight = '600';
    detail.appendChild(changeSpan);
    whatifResult.appendChild(detail);
  } catch {
    whatifResult.style.display = 'block';
    whatifResult.textContent = '';
    whatifResult.appendChild(el('span', { class: 'result-muted', text: 'Cannot reach backend' }));
  }
});

// ============================================================
// FOCUS — WORK CHUNKING
// ============================================================
function renderChunks() {
  if (!currentChunks.length) {
    chunkResults.classList.add('hidden');
    return;
  }
  chunkResults.classList.remove('hidden');
  const done = chunkChecked.filter(Boolean).length;
  const pct = Math.round((done / currentChunks.length) * 100);
  chunkProgressBar.style.width = `${pct}%`;

  chunkList.textContent = '';
  currentChunks.forEach((c, i) => {
    const card = el('div', { class: `chunk-card ${chunkChecked[i] ? 'done' : ''}` });
    const header = el('div', { class: 'chunk-header' });
    const check = el('button', {
      class: `chunk-check ${chunkChecked[i] ? 'checked' : ''}`,
      text: chunkChecked[i] ? '\u2713' : '',
      onclick: () => { chunkChecked[i] = !chunkChecked[i]; chrome.storage.local.set({ chunkChecked }); renderChunks(); }
    });
    header.append(check, el('span', { class: 'chunk-step', text: c.task }), el('span', { class: 'chunk-time', text: `${c.minutes} min` }));
    card.append(header, el('div', { class: 'chunk-done-when', text: `Done when: ${c.done_when}` }));
    chunkList.appendChild(card);
  });

  const totalMin = currentChunks.reduce((s, c) => s + c.minutes, 0);
  chunkTotal.textContent = '';
  chunkTotal.appendChild(el('strong', { text: `${totalMin} min` }));
  chunkTotal.append(` total \u00b7 ${done}/${currentChunks.length} chunks done`);
}

// Load saved chunks on popup open
chrome.storage.local.get(['currentChunks', 'chunkChecked'], (result) => {
  if (result.currentChunks) {
    currentChunks = result.currentChunks;
    chunkChecked = result.chunkChecked || currentChunks.map(() => false);
    renderChunks();
  }
});

chunkBtn.addEventListener('click', async () => {
  const title = chunkTitle.value.trim();
  if (!title) { setStatus(chunkStatus, 'Enter an assignment name.', 'error'); return; }

  chunkBtn.disabled = true;
  setStatus(chunkStatus, 'Breaking it down...', 'loading');

  try {
    const data = await apiFetch('/chunk', {
      assignment: {
        title,
        type: chunkType.value.trim() || null,
        course: chunkCourse.value.trim() || null,
        due: chunkDue.value.trim() || null
      },
      context: chunkContext.value.trim() || undefined
    });
    currentChunks = data.chunks || [];
    chunkChecked = currentChunks.map(() => false);
    chrome.storage.local.set({ currentChunks, chunkChecked });
    setStatus(chunkStatus, '', '');
    renderChunks();
  } catch (err) {
    setStatus(chunkStatus, handleFetchError(err), 'error');
  } finally {
    chunkBtn.disabled = false;
  }
});

// ============================================================
// SYNC — SCRAPE GRADES & ASSESSMENTS FROM TEAMIE
// ============================================================
function renderAssessments() {
  chrome.storage.local.get(['scrapedAssessments'], (result) => {
    const items = result.scrapedAssessments || [];
    if (items.length === 0) {
      assessmentsSection.classList.add('hidden');
      return;
    }
    assessmentsSection.classList.remove('hidden');
    assessmentsList.textContent = '';
    items.forEach(a => {
      const row = el('div', { class: 'assessment-row' });
      const left = el('div');
      left.appendChild(el('span', { class: 'assessment-title', text: a.title || 'Untitled' }));
      if (a.type) left.appendChild(el('span', { class: 'assessment-type', text: a.type }));
      const right = el('div', { class: 'assessment-meta' });
      if (a.date) right.textContent = a.date;
      if (a.course) { right.appendChild(el('br')); right.append(a.course); }
      row.append(left, right);
      assessmentsList.appendChild(row);
    });
  });
}

renderAssessments();

// Sync Grades button
syncGradesBtn.addEventListener('click', async () => {
  syncGradesBtn.disabled = true;
  setStatus(syncStatus, 'Scanning gradebook...', 'loading');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('lms.asl.org')) {
      setStatus(syncStatus, 'Navigate to a Teamie gradebook page first.', 'error');
      syncGradesBtn.disabled = false;
      return;
    }
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['gradebook.js'] });
    const data = result?.result;
    if (!data || (data.grades.length === 0 && data.categories.length === 0)) {
      setStatus(syncStatus, 'No grade data found on this page.', 'error');
      syncGradesBtn.disabled = false;
      return;
    }
    const courseName = data.course || 'Synced Course';
    if (!courses[courseName]) courses[courseName] = { categories: [], grades: [], policies: {} };
    if (data.categories.length > 0) courses[courseName].categories = data.categories;
    const existingNames = new Set(courses[courseName].grades.map(g => g.name));
    for (const g of data.grades) {
      if (!existingNames.has(g.name)) { courses[courseName].grades.push(g); existingNames.add(g.name); }
    }
    activeCourse = courseName;
    saveCourses();
    renderCourseList();
    loadCourseGrades();
    setStatus(syncStatus, `Synced: ${data.grades.length} grades, ${data.categories.length} categories for ${courseName}`, 'success');
    syncTimestamp.textContent = `Last synced: ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    setStatus(syncStatus, `Sync failed: ${err.message}`, 'error');
  } finally {
    syncGradesBtn.disabled = false;
  }
});

// Sync Assessments button
syncAssessmentsBtn.addEventListener('click', async () => {
  syncAssessmentsBtn.disabled = true;
  setStatus(syncStatus, 'Scanning for assessments...', 'loading');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('lms.asl.org')) {
      setStatus(syncStatus, 'Navigate to a Teamie page first.', 'error');
      syncAssessmentsBtn.disabled = false;
      return;
    }
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['assessments.js'] });
    const data = result?.result;
    if (!data || data.length === 0) {
      setStatus(syncStatus, 'No upcoming assessments found on this page.', 'error');
      syncAssessmentsBtn.disabled = false;
      return;
    }
    chrome.storage.local.get(['scrapedAssessments'], (existing) => {
      const current = existing.scrapedAssessments || [];
      const existingTitles = new Set(current.map(a => a.title));
      const merged = [...current];
      for (const a of data) {
        if (!existingTitles.has(a.title)) { merged.push(a); existingTitles.add(a.title); }
      }
      chrome.storage.local.set({ scrapedAssessments: merged });
      renderAssessments();
      setStatus(syncStatus, `Found ${data.length} assessments (${merged.length} total stored)`, 'success');
      syncTimestamp.textContent = `Last synced: ${new Date().toLocaleTimeString()}`;
    });
  } catch (err) {
    setStatus(syncStatus, `Sync failed: ${err.message}`, 'error');
  } finally {
    syncAssessmentsBtn.disabled = false;
  }
});

// ============================================================
// STUDY GUIDE
// ============================================================
function updateStudyCourseSelect() {
  const names = Object.keys(courses);
  populateSelect(studyCourseSelect, names, 'No courses \u2014 add one in Grades tab');
  if (names.length === 0) {
    studyOnboarding.classList.remove('hidden');
    studyForm.classList.add('hidden');
  } else {
    studyOnboarding.classList.add('hidden');
    studyForm.classList.remove('hidden');
  }
}

// Note: Study button handler is defined in the Feature 5 section below (multi-mode handler).

function renderStudyGuide(data) {
  studyResults.classList.remove('hidden');
  studyUnitTitle.textContent = data.unit || 'Study Guide';
  studySummary.textContent = data.summary || '';

  // Key concepts — safe DOM building
  studyConcepts.textContent = '';
  (data.key_concepts || []).forEach(c => {
    const card = el('div', { class: 'concept-card' });
    card.appendChild(el('div', { class: 'concept-name', text: c.concept }));
    card.appendChild(el('div', { class: 'concept-source', text: c.source }));
    studyConcepts.appendChild(card);
  });
  if (!data.key_concepts?.length) studyConcepts.appendChild(el('div', { class: 'result-muted', text: 'No concepts identified' }));

  // High-likelihood topics
  studyTopics.textContent = '';
  (data.high_likelihood_topics || []).forEach(t => {
    const card = el('div', { class: 'topic-card' });
    card.appendChild(el('div', { class: 'topic-name', text: t.topic }));
    card.appendChild(el('div', { class: 'topic-reason', text: t.reason }));
    if (t.sources) card.appendChild(el('div', { class: 'topic-sources', text: `Sources: ${t.sources.join(', ')}` }));
    studyTopics.appendChild(card);
  });
  if (!data.high_likelihood_topics?.length) studyTopics.appendChild(el('div', { class: 'result-muted', text: 'No high-likelihood topics' }));

  // Practice questions with hint toggles
  studyQuestions.textContent = '';
  (data.practice_questions || []).forEach((q, i) => {
    const card = el('div', { class: 'question-card' });
    card.appendChild(el('div', { class: 'question-text', text: `${i + 1}. ${q.question}` }));
    if (q.hint) {
      const hintDiv = el('div', { class: 'question-hint', id: `hint-${i}`, text: q.hint });
      const toggle = el('button', {
        class: 'hint-toggle', text: 'Show hint',
        onclick: () => {
          hintDiv.classList.toggle('visible');
          toggle.textContent = hintDiv.classList.contains('visible') ? 'Hide hint' : 'Show hint';
        }
      });
      card.append(toggle, hintDiv);
    }
    studyQuestions.appendChild(card);
  });
  if (!data.practice_questions?.length) studyQuestions.appendChild(el('div', { class: 'result-muted', text: 'No practice questions' }));
}

// ============================================================
// SPRINT MODE
// ============================================================
function addSprintTopicRow(value = '') {
  const row = el('div', { class: 'sprint-topic-input' });
  const input = el('input', { type: 'text', placeholder: 'e.g. Confidence Intervals', value });
  const removeBtn = el('button', { class: 'sprint-remove-topic', text: '\u00d7', onclick: () => row.remove() });
  row.append(input, removeBtn);
  sprintTopicsList.appendChild(row);
}

function updateSprintCourseSelect() {
  const names = Object.keys(courses);
  populateSelect(sprintCourseSelect, names, 'No courses');
  if (names.length === 0 && !activeSprint) {
    sprintOnboarding.classList.remove('hidden');
    sprintSetup.classList.add('hidden');
  } else {
    sprintOnboarding.classList.add('hidden');
    sprintSetup.classList.remove('hidden');
  }
}

function initSprintSetup() {
  sprintTopicsList.textContent = '';
  addSprintTopicRow();
  addSprintTopicRow();
  addSprintTopicRow();
  const d = new Date();
  d.setDate(d.getDate() + 7);
  sprintTestDate.value = d.toISOString().split('T')[0];
}

sprintAddTopic.addEventListener('click', () => addSprintTopicRow());

// Create sprint
sprintCreateBtn.addEventListener('click', async () => {
  const testName = sprintTestNameInput.value.trim();
  const testDate = sprintTestDate.value;
  const course = sprintCourseSelect.value;
  const hours = parseFloat(sprintHours.value) || 2;

  if (!testName) { setStatus(sprintStatus, 'Enter a test name.', 'error'); return; }
  if (!testDate) { setStatus(sprintStatus, 'Pick a test date.', 'error'); return; }

  const topics = [];
  sprintTopicsList.querySelectorAll('input').forEach(input => {
    const v = input.value.trim();
    if (v) topics.push(v);
  });
  if (topics.length === 0) { setStatus(sprintStatus, 'Add at least one topic.', 'error'); return; }

  sprintCreateBtn.disabled = true;
  setStatus(sprintStatus, 'Creating sprint plan...', 'loading');

  try {
    const data = await apiFetch('/sprint/create', {
      test_name: testName, test_date: testDate,
      course: course || undefined, topics, available_hours_per_day: hours
    });
    const checked = {};
    (data.days || []).forEach((day, i) => { checked[i] = (day.tasks || []).map(() => false); });
    activeSprint = {
      test_name: data.test_name || testName, course: data.course || course,
      test_date: testDate, days: data.days || [], tips: data.tips || [], checked
    };
    chrome.storage.local.set({ activeSprint });
    setStatus(sprintStatus, '', '');
    renderSprint();
  } catch (err) {
    setStatus(sprintStatus, handleFetchError(err), 'error');
  } finally {
    sprintCreateBtn.disabled = false;
  }
});

function renderSprint() {
  if (!activeSprint) {
    sprintSetup.classList.remove('hidden');
    sprintActive.classList.add('hidden');
    return;
  }
  sprintSetup.classList.add('hidden');
  sprintOnboarding.classList.add('hidden');
  sprintActive.classList.remove('hidden');

  sprintActiveName.textContent = activeSprint.test_name;
  sprintActiveDate.textContent = `${activeSprint.course ? activeSprint.course + ' \u00b7 ' : ''}Test: ${activeSprint.test_date}`;

  // Progress
  let totalTasks = 0, doneTasks = 0;
  const checked = activeSprint.checked || {};
  activeSprint.days.forEach((day, di) => {
    const dayChecks = checked[di] || [];
    (day.tasks || []).forEach((_, ti) => { totalTasks++; if (dayChecks[ti]) doneTasks++; });
  });
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  sprintProgressFill.style.width = `${pct}%`;
  sprintProgressText.textContent = `${pct}% (${doneTasks}/${totalTasks})`;

  // Render days — safe DOM building
  sprintDaysList.textContent = '';
  activeSprint.days.forEach((day, di) => {
    const dayChecks = checked[di] || [];
    const card = el('div', { class: 'sprint-day-card' });
    const header = el('div', { class: 'sprint-day-header' });
    const left = el('div');
    left.appendChild(el('span', { class: 'sprint-day-num', text: `Day ${day.day || di + 1}` }));
    if (day.date) left.appendChild(el('span', { class: 'sprint-day-date', text: ` \u00b7 ${day.date}` }));
    header.append(left, el('span', { class: 'sprint-day-theme', text: day.theme || '' }));
    card.appendChild(header);

    (day.tasks || []).forEach((t, ti) => {
      const isDone = dayChecks[ti] || false;
      const taskRow = el('div', { class: 'sprint-task' });
      const checkBtn = el('button', {
        class: `sprint-task-check ${isDone ? 'checked' : ''}`,
        text: isDone ? '\u2713' : '',
        onclick: () => {
          if (!activeSprint.checked[di]) activeSprint.checked[di] = [];
          activeSprint.checked[di][ti] = !activeSprint.checked[di][ti];
          chrome.storage.local.set({ activeSprint });
          renderSprint();
        }
      });
      const badgeClass = (t.type || 'learn').toLowerCase();
      taskRow.append(
        checkBtn,
        el('span', { class: `sprint-task-name ${isDone ? 'done' : ''}`, text: t.task }),
        el('span', { class: `sprint-task-badge ${badgeClass}`, text: t.type || 'learn' }),
        el('span', { class: 'sprint-task-time', text: `${t.minutes}m` })
      );
      card.appendChild(taskRow);
    });

    card.appendChild(el('div', { class: 'sprint-day-total', text: `${day.total_minutes || 0} min total` }));
    sprintDaysList.appendChild(card);
  });

  // Tips
  if (activeSprint.tips && activeSprint.tips.length > 0) {
    sprintTipsBox.classList.remove('hidden');
    sprintTipsList.textContent = '';
    activeSprint.tips.forEach(t => {
      sprintTipsList.appendChild(el('div', { class: 'sprint-tip', text: `\u2022 ${t}` }));
    });
  } else {
    sprintTipsBox.classList.add('hidden');
  }
}

// End sprint with confirmation
sprintEndBtn.addEventListener('click', () => {
  if (!confirm('End this sprint? Progress will be lost.')) return;
  activeSprint = null;
  chrome.storage.local.remove('activeSprint');
  initSprintSetup();
  renderSprint();
  setStatus(sprintStatus, 'Sprint ended.', '');
});

// Load saved sprint on popup open
chrome.storage.local.get(['activeSprint'], (result) => {
  if (result.activeSprint) {
    activeSprint = result.activeSprint;
    renderSprint();
  }
});

// ============================================================
// FEATURE 3: GRADE-AWARE PRIORITIZATION
// ============================================================
const prioritySection = document.getElementById('priority-section');
const priorityList = document.getElementById('priority-list');

async function fetchGradeAwarePriorities(assignments, overdue) {
  if (Object.keys(courses).length === 0) return [];

  try {
    const data = await apiFetch('/prioritize/grade-aware', {
      assignments,
      overdue,
      courses
    });
    return data.prioritized_items || [];
  } catch (err) {
    console.error('Grade-aware prioritization error:', err);
    return [];
  }
}

function renderPriorityItems(items) {
  if (!items || items.length === 0) {
    prioritySection.classList.add('hidden');
    return;
  }

  // Filter to only show grade-critical items
  const critical = items.filter(i => i.is_grade_critical);
  if (critical.length === 0) {
    prioritySection.classList.add('hidden');
    return;
  }

  prioritySection.classList.remove('hidden');
  priorityList.textContent = '';

  critical.slice(0, 5).forEach(item => {
    const urgency = item.urgency_level || 'medium';
    const div = el('div', { class: `priority-item ${urgency}` });

    const header = el('div', { class: 'priority-item-header' });
    header.appendChild(el('span', { class: 'priority-item-title', text: item.title }));
    if (item.course) {
      header.appendChild(el('span', { class: 'priority-item-course', text: item.course }));
    }
    div.appendChild(header);

    if (item.grade_impact) {
      div.appendChild(el('div', { class: 'priority-item-impact', text: item.grade_impact }));
    }

    if (item.current_course_grade) {
      div.appendChild(el('div', {
        class: 'priority-item-grade',
        text: `Current grade: ${item.current_course_grade}%`
      }));
    }

    priorityList.appendChild(div);
  });
}

// ============================================================
// FEATURE 4: AUTO-SCAN & NOTIFICATIONS
// ============================================================
const autoScanToggle = document.getElementById('auto-scan-toggle');
const scanIntervalRow = document.getElementById('scan-interval-row');
const scanIntervalSelect = document.getElementById('scan-interval');
const lastScanInfo = document.getElementById('last-scan-info');

// Load auto-scan settings
chrome.storage.local.get(['autoScanEnabled', 'scanIntervalHours', 'lastScanTime'], (result) => {
  autoScanToggle.checked = result.autoScanEnabled !== false;
  if (result.scanIntervalHours) {
    scanIntervalSelect.value = result.scanIntervalHours.toString();
  }
  updateScanIntervalVisibility();
  updateLastScanInfo(result.lastScanTime);
});

function updateScanIntervalVisibility() {
  if (autoScanToggle.checked) {
    scanIntervalRow.classList.remove('hidden');
  } else {
    scanIntervalRow.classList.add('hidden');
  }
}

function updateLastScanInfo(timestamp) {
  if (timestamp) {
    const date = new Date(timestamp);
    lastScanInfo.textContent = `Last auto-scan: ${date.toLocaleTimeString()}`;
  } else {
    lastScanInfo.textContent = '';
  }
}

autoScanToggle.addEventListener('change', async () => {
  updateScanIntervalVisibility();
  if (autoScanToggle.checked) {
    const interval = parseInt(scanIntervalSelect.value) || 4;
    chrome.runtime.sendMessage({ type: 'enableAutoScan', intervalHours: interval });
  } else {
    chrome.runtime.sendMessage({ type: 'disableAutoScan' });
  }
});

scanIntervalSelect.addEventListener('change', () => {
  if (autoScanToggle.checked) {
    const interval = parseInt(scanIntervalSelect.value) || 4;
    chrome.runtime.sendMessage({ type: 'enableAutoScan', intervalHours: interval });
  }
});

// ============================================================
// FEATURE 4b: TOMORROW PREVIEW
// ============================================================
const tomorrowPreviewToggle = document.getElementById('tomorrow-preview-toggle');
const previewTimeSelect = document.getElementById('preview-time');
const previewTimeRow = document.getElementById('preview-time-row');
const testPreviewBtn = document.getElementById('test-preview-btn');
const previewStatusEl = document.getElementById('preview-status');

// Load tomorrow preview settings
chrome.storage.local.get(['tomorrowPreviewEnabled', 'previewHour'], (result) => {
  tomorrowPreviewToggle.checked = result.tomorrowPreviewEnabled !== false;
  if (result.previewHour != null) {
    previewTimeSelect.value = result.previewHour.toString();
  }
  updatePreviewTimeVisibility();
});

function updatePreviewTimeVisibility() {
  if (tomorrowPreviewToggle.checked) {
    previewTimeRow.classList.remove('hidden');
    testPreviewBtn.classList.remove('hidden');
  } else {
    previewTimeRow.classList.add('hidden');
    testPreviewBtn.classList.add('hidden');
  }
}

tomorrowPreviewToggle.addEventListener('change', () => {
  updatePreviewTimeVisibility();
  if (tomorrowPreviewToggle.checked) {
    const hour = parseInt(previewTimeSelect.value) || 20;
    chrome.runtime.sendMessage({ type: 'enableTomorrowPreview', hour });
  } else {
    chrome.runtime.sendMessage({ type: 'disableTomorrowPreview' });
  }
});

previewTimeSelect.addEventListener('change', () => {
  if (tomorrowPreviewToggle.checked) {
    const hour = parseInt(previewTimeSelect.value) || 20;
    chrome.runtime.sendMessage({ type: 'enableTomorrowPreview', hour });
  }
});

testPreviewBtn.addEventListener('click', () => {
  previewStatusEl.textContent = 'Sending test preview...';
  chrome.runtime.sendMessage({ type: 'testTomorrowPreview' }, (response) => {
    if (response?.success) {
      previewStatusEl.textContent = 'Preview sent! Check your notifications.';
    } else {
      previewStatusEl.textContent = response?.error || 'Failed to send preview.';
    }
    setTimeout(() => { previewStatusEl.textContent = ''; }, 4000);
  });
});

// ============================================================
// FEATURE 5: STUDY CONTENT GENERATION
// ============================================================
let currentStudyMode = 'guide';
let flashcards = [];
let flashcardIndex = 0;
let markedCards = new Set();
let quizQuestions = [];
let quizAnswers = {};
let quizSubmitted = false;

// Study Mode DOM refs
const studyModeBtns = document.querySelectorAll('.study-mode-btn');
const flashcardOptions = document.getElementById('flashcard-options');
const quizOptions = document.getElementById('quiz-options');
const explainOptions = document.getElementById('explain-options');
const studyContentInput = document.getElementById('study-content-input');
const flashcardResults = document.getElementById('flashcard-results');
const quizResults = document.getElementById('quiz-results');
const explainResults = document.getElementById('explain-results');
const conceptInput = document.getElementById('concept-input');

// Study mode tab switching
studyModeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    studyModeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStudyMode = btn.dataset.mode;
    updateStudyModeUI();
  });
});

function updateStudyModeUI() {
  // Hide all mode-specific options
  flashcardOptions.classList.add('hidden');
  quizOptions.classList.add('hidden');
  explainOptions.classList.add('hidden');

  // Hide all results
  studyResults.classList.add('hidden');
  flashcardResults.classList.add('hidden');
  quizResults.classList.add('hidden');
  explainResults.classList.add('hidden');

  // Update button text and show relevant options
  const studyBtnText = {
    guide: 'Generate Study Guide',
    flashcards: 'Generate Flashcards',
    quiz: 'Start Quiz',
    explain: 'Explain This'
  };
  studyBtn.textContent = studyBtnText[currentStudyMode];

  // Show mode-specific options and manage content input visibility
  studyContentInput.classList.remove('hidden'); // visible by default
  if (currentStudyMode === 'flashcards') {
    flashcardOptions.classList.remove('hidden');
  } else if (currentStudyMode === 'quiz') {
    quizOptions.classList.remove('hidden');
  } else if (currentStudyMode === 'explain') {
    explainOptions.classList.remove('hidden');
    studyContentInput.classList.add('hidden');
  }
}

// Multi-mode study button handler
studyBtn.addEventListener('click', async () => {
  const courseName = studyCourseSelect.value;
  const topic = studyUnit.value.trim();
  const content = studyNotes.value.trim();

  studyBtn.disabled = true;
  setStatus(studyStatus, `Generating ${currentStudyMode}...`, 'loading');

  // Hide all results first
  studyResults.classList.add('hidden');
  flashcardResults.classList.add('hidden');
  quizResults.classList.add('hidden');
  explainResults.classList.add('hidden');

  try {
    if (currentStudyMode === 'guide') {
      await generateStudyGuide(courseName, topic, content);
    } else if (currentStudyMode === 'flashcards') {
      await generateFlashcards(courseName, topic, content);
    } else if (currentStudyMode === 'quiz') {
      await generateQuiz(courseName, topic, content);
    } else if (currentStudyMode === 'explain') {
      await explainConcept(courseName, topic);
    }
    setStatus(studyStatus, '', '');
  } catch (err) {
    setStatus(studyStatus, handleFetchError(err), 'error');
  } finally {
    studyBtn.disabled = false;
  }
});

async function generateStudyGuide(courseName, topic, content) {
  const course = courses[courseName];
  const assignmentNames = (course?.grades || []).map(g => g.name);

  const data = await apiFetch('/study-guide', {
    course: courseName,
    unit: topic || undefined,
    assignments: assignmentNames.length > 0 ? assignmentNames : undefined,
    notes: content || undefined
  });
  renderStudyGuide(data);
}

async function generateFlashcards(courseName, topic, content) {
  const count = parseInt(document.getElementById('flashcard-count').value) || 10;

  const data = await apiFetch('/study/flashcards', {
    course: courseName,
    topic: topic || 'General review',
    content: content || '',
    count
  });

  flashcards = data.cards || [];
  flashcardIndex = 0;
  markedCards = new Set();
  renderFlashcard();
  flashcardResults.classList.remove('hidden');
}

async function generateQuiz(courseName, topic, content) {
  const count = parseInt(document.getElementById('quiz-count').value) || 5;

  const data = await apiFetch('/study/quick-quiz', {
    course: courseName,
    topic: topic || 'General review',
    content: content || '',
    count
  });

  quizQuestions = data.questions || [];
  quizAnswers = {};
  quizSubmitted = false;
  renderQuiz(data);
  quizResults.classList.remove('hidden');
}

async function explainConcept(courseName, topic) {
  const concept = conceptInput.value.trim() || topic;
  if (!concept) {
    setStatus(studyStatus, 'Enter a concept to explain.', 'error');
    return;
  }

  const data = await apiFetch('/study/explain', {
    course: courseName,
    concept,
    context: studyNotes.value.trim() || ''
  });

  renderExplanation(data);
  explainResults.classList.remove('hidden');
}

// Flashcard rendering and navigation
function renderFlashcard() {
  if (flashcards.length === 0) return;

  const card = flashcards[flashcardIndex];
  document.getElementById('flashcard-progress').textContent = `${flashcardIndex + 1} / ${flashcards.length}`;
  document.getElementById('flashcard-front-content').textContent = card.front;
  document.getElementById('flashcard-back-content').textContent = card.back;
  document.getElementById('flashcard-tip').textContent = card.memory_tip || '';

  const flashcardEl = document.getElementById('current-flashcard');
  flashcardEl.classList.remove('flipped');

  const markBtn = document.getElementById('flashcard-mark');
  if (markedCards.has(flashcardIndex)) {
    markBtn.textContent = 'Unmark';
    markBtn.classList.add('marked');
  } else {
    markBtn.textContent = 'Mark for Review';
    markBtn.classList.remove('marked');
  }

  document.getElementById('flashcard-marked').textContent = `${markedCards.size} marked for review`;
}

document.getElementById('current-flashcard')?.addEventListener('click', () => {
  document.getElementById('current-flashcard').classList.toggle('flipped');
});

document.getElementById('flashcard-prev')?.addEventListener('click', () => {
  if (flashcardIndex > 0) {
    flashcardIndex--;
    renderFlashcard();
  }
});

document.getElementById('flashcard-next')?.addEventListener('click', () => {
  if (flashcardIndex < flashcards.length - 1) {
    flashcardIndex++;
    renderFlashcard();
  }
});

document.getElementById('flashcard-mark')?.addEventListener('click', () => {
  if (markedCards.has(flashcardIndex)) {
    markedCards.delete(flashcardIndex);
  } else {
    markedCards.add(flashcardIndex);
  }
  renderFlashcard();
});

document.getElementById('flashcard-shuffle')?.addEventListener('click', () => {
  // Fisher-Yates shuffle
  for (let i = flashcards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [flashcards[i], flashcards[j]] = [flashcards[j], flashcards[i]];
  }
  flashcardIndex = 0;
  markedCards = new Set();
  renderFlashcard();
});

// Quiz rendering
function renderQuiz(data) {
  document.getElementById('quiz-title').textContent = data.topic || 'Quiz';
  document.getElementById('quiz-score').textContent = '';
  document.getElementById('quiz-score').className = 'quiz-score-badge';

  const list = document.getElementById('quiz-questions-list');
  list.textContent = '';

  quizQuestions.forEach((q, idx) => {
    const qDiv = el('div', { class: 'quiz-question', 'data-idx': idx.toString() });

    // Question text
    qDiv.appendChild(el('div', {
      class: 'quiz-question-text',
      text: `${idx + 1}. ${q.question}`
    }));

    // Options
    if (q.type === 'multiple_choice' && q.options) {
      q.options.forEach((opt, optIdx) => {
        const optDiv = el('div', {
          class: 'quiz-option',
          'data-qidx': idx.toString(),
          'data-opt': optIdx.toString()
        });
        optDiv.appendChild(el('span', { class: 'quiz-option-marker', text: String.fromCharCode(65 + optIdx) }));
        optDiv.appendChild(el('span', { text: opt.replace(/^[A-D][\.\)]\s*/, '') }));
        optDiv.addEventListener('click', () => selectQuizOption(idx, optIdx, opt));
        qDiv.appendChild(optDiv);
      });
    } else if (q.type === 'true_false') {
      ['True', 'False'].forEach((opt, optIdx) => {
        const optDiv = el('div', {
          class: 'quiz-option',
          'data-qidx': idx.toString(),
          'data-opt': optIdx.toString()
        });
        optDiv.appendChild(el('span', { class: 'quiz-option-marker', text: opt[0] }));
        optDiv.appendChild(el('span', { text: opt }));
        optDiv.addEventListener('click', () => selectQuizOption(idx, optIdx, opt));
        qDiv.appendChild(optDiv);
      });
    }

    // Explanation (hidden until submitted)
    const explanation = el('div', {
      class: 'quiz-explanation',
      id: `explanation-${idx}`
    });
    explanation.textContent = q.explanation || '';
    qDiv.appendChild(explanation);

    list.appendChild(qDiv);
  });

  // Submit button
  const submitBtn = el('button', {
    class: 'primary-btn quiz-submit-btn',
    text: 'Submit Quiz',
    id: 'quiz-submit-btn'
  });
  submitBtn.addEventListener('click', submitQuiz);
  list.appendChild(submitBtn);

  document.getElementById('quiz-summary').classList.add('hidden');
  document.getElementById('quiz-restart').classList.add('hidden');
}

function selectQuizOption(qIdx, optIdx, value) {
  if (quizSubmitted) return;

  quizAnswers[qIdx] = { optIdx, value };

  // Update UI
  const options = document.querySelectorAll(`.quiz-option[data-qidx="${qIdx}"]`);
  options.forEach((opt, i) => {
    opt.classList.toggle('selected', i === optIdx);
  });
}

function submitQuiz() {
  quizSubmitted = true;
  let correct = 0;

  quizQuestions.forEach((q, idx) => {
    const answer = quizAnswers[idx];
    const correctAnswer = q.correct_answer;
    const options = document.querySelectorAll(`.quiz-option[data-qidx="${idx}"]`);

    options.forEach(opt => {
      const optText = opt.querySelector('span:last-child').textContent;
      const fullOpt = q.options ? q.options[parseInt(opt.dataset.opt)] : optText;

      // Check if this option is correct
      const isCorrect = fullOpt === correctAnswer ||
        correctAnswer?.startsWith(String.fromCharCode(65 + parseInt(opt.dataset.opt))) ||
        optText.toLowerCase() === correctAnswer?.toLowerCase();

      if (isCorrect) {
        opt.classList.add('correct');
      }

      if (answer && parseInt(opt.dataset.opt) === answer.optIdx) {
        if (isCorrect) {
          correct++;
        } else {
          opt.classList.add('incorrect');
        }
      }
    });

    // Show explanation
    document.getElementById(`explanation-${idx}`).classList.add('visible');
  });

  // Update score
  const pct = Math.round((correct / quizQuestions.length) * 100);
  const scoreBadge = document.getElementById('quiz-score');
  scoreBadge.textContent = `${correct}/${quizQuestions.length} (${pct}%)`;
  scoreBadge.classList.add(pct >= 70 ? 'pass' : 'fail');

  // Show summary
  const summary = document.getElementById('quiz-summary');
  summary.classList.remove('hidden');
  summary.querySelector('.quiz-summary-score').textContent = `${pct}%`;
  summary.querySelector('.quiz-summary-review').textContent =
    pct >= 80 ? 'Great job! You\'re ready for the test.' :
    pct >= 60 ? 'Good effort. Review the concepts you missed.' :
    'Keep studying. Focus on the explanations above.';

  // Hide submit, show restart
  document.getElementById('quiz-submit-btn').classList.add('hidden');
  document.getElementById('quiz-restart').classList.remove('hidden');
}

document.getElementById('quiz-restart')?.addEventListener('click', () => {
  quizAnswers = {};
  quizSubmitted = false;
  renderQuiz({ topic: document.getElementById('quiz-title').textContent, questions: quizQuestions });
});

// Concept explanation rendering
function renderExplanation(data) {
  document.getElementById('explain-concept-title').textContent = data.concept || 'Concept';
  document.getElementById('explain-analogy').textContent = data.simple_analogy || '';
  document.getElementById('explain-example').textContent = data.real_world_example || '';
  document.getElementById('explain-insight').textContent = data.key_insight || '';

  // Steps
  const stepsContainer = document.getElementById('explain-steps');
  stepsContainer.textContent = '';
  (data.step_by_step || []).forEach(step => {
    const stepDiv = el('div', { class: 'explain-step' });
    const header = el('div', { class: 'explain-step-header' });
    header.appendChild(el('span', { class: 'explain-step-num', text: step.step.toString() }));
    header.appendChild(el('span', { class: 'explain-step-title', text: step.title }));
    stepDiv.appendChild(header);
    stepDiv.appendChild(el('div', { class: 'explain-step-text', text: step.explanation }));
    if (step.example) {
      stepDiv.appendChild(el('div', { class: 'explain-step-example', text: `Example: ${step.example}` }));
    }
    stepsContainer.appendChild(stepDiv);
  });

  // Confusions
  const confusionsContainer = document.getElementById('explain-confusions');
  confusionsContainer.textContent = '';
  (data.common_confusions || []).forEach(c => {
    const card = el('div', { class: 'confusion-card' });
    card.appendChild(el('div', { class: 'confusion-wrong', text: `❌ ${c.confusion}` }));
    card.appendChild(el('div', { class: 'confusion-right', text: `✓ ${c.clarification}` }));
    confusionsContainer.appendChild(card);
  });

  // Practice prompts
  const promptsContainer = document.getElementById('explain-prompts');
  promptsContainer.textContent = '';
  (data.practice_prompts || []).forEach(p => {
    promptsContainer.appendChild(el('div', { class: 'prompt-card', text: p }));
  });
}

// Load grade-aware priorities from last scan on popup open
chrome.storage.local.get(['lastScanData'], async (result) => {
  if (result.lastScanData && Object.keys(courses).length > 0) {
    try {
      const priorities = await fetchGradeAwarePriorities(
        result.lastScanData.assignments || [],
        result.lastScanData.overdue || []
      );
      renderPriorityItems(priorities);
    } catch (err) {
      // Silently fail — priorities are optional
    }
  }
});

// Initialize study mode UI
updateStudyModeUI();
