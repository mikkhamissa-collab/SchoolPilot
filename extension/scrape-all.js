// scrape-all.js — Deep scraper that extracts ALL data from Teamie LMS pages.
// Scrapes: courses from nav/sidebar, assignments from events, and any other
// structured content it can find on the page.
(() => {
  const data = {
    courses: [],
    assignments: [],
    page_url: window.location.href,
    page_title: document.title,
  };

  // ============================================================
  // 1. SCRAPE COURSES — from navigation, sidebar, and any course lists
  // ============================================================

  // Try: Main navigation / sidebar course links
  // Teamie typically has course links in nav menus, sidebar, or a "My Courses" section
  const courseSelectors = [
    // Common Teamie course selectors
    '.classroom-name',
    '.course-name',
    '.course-title',
    '.classroom-title',
    // Navigation items that look like courses
    'nav a[href*="classroom"]',
    'a[href*="/classroom/"]',
    'a[href*="/course/"]',
    // Sidebar course list
    '.sidebar .course',
    '.side-nav .course',
    '.classroom-list .classroom',
    '.course-list-item',
    '.my-courses a',
    // Left nav items
    '.left-nav a',
    '.main-nav a[href*="classroom"]',
    // Generic: any link that goes to a classroom/course page
    'a[href*="classroom"]',
  ];

  const seenCourses = new Set();
  for (const selector of courseSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const name = el.textContent.trim().replace(/\s+/g, ' ');
        const href = el.href || el.closest('a')?.href || '';
        if (name && name.length > 2 && name.length < 100 && !seenCourses.has(name)) {
          seenCourses.add(name);
          data.courses.push({ name, href, source: selector });
        }
      }
    } catch { /* ignore selector errors */ }
  }

  // ============================================================
  // 2. SCRAPE ASSIGNMENTS — from event sidebar (existing logic, enhanced)
  // ============================================================
  const wrappers = document.querySelectorAll('.event-wrapper');
  let currentDate = null;
  let currentDay = null;
  const seenAssignments = new Set();

  for (const wrapper of wrappers) {
    const dateEl = wrapper.querySelector('.date-block .date');
    const dayEl = wrapper.querySelector('.date-block .day');

    if (dateEl) currentDate = dateEl.textContent.trim() || currentDate;
    if (dayEl) currentDay = dayEl.textContent.trim() || currentDay;

    const titleEl = wrapper.querySelector('.event-tile .title span');
    const metaEl = wrapper.querySelector('.event-tile .meta');
    const dueEl = wrapper.querySelector('.sub-meta .text-primary span');
    const courseEl = wrapper.querySelector('.event-tile .meta:last-of-type');

    const title = titleEl ? titleEl.textContent.trim() : null;

    let type = null;
    if (metaEl) {
      const lines = metaEl.textContent.split('\n').map(l => l.trim()).filter(Boolean);
      type = lines.length > 0 ? lines[0] : null;
    }

    const due = dueEl ? dueEl.textContent.trim() : null;
    const course = courseEl ? courseEl.textContent.trim() : null;

    if (title) {
      const key = `${title}|${course || ''}|${currentDate || ''}`;
      if (!seenAssignments.has(key)) {
        seenAssignments.add(key);
        data.assignments.push({
          title,
          type,
          due,
          course,
          date: currentDate,
          day: currentDay
        });

        // Also extract course name from assignment
        if (course) {
          const cleaned = course.split('\n')[0].trim();
          if (cleaned && !seenCourses.has(cleaned)) {
            seenCourses.add(cleaned);
            data.courses.push({ name: cleaned, href: '', source: 'assignment-course' });
          }
        }
      }
    }
  }

  // ============================================================
  // 3. SCRAPE ADDITIONAL EVENT/TASK LISTS — other formats Teamie might use
  // ============================================================
  const additionalSelectors = [
    '.todo-item',
    '.task-item',
    '.activity-item',
    '.submission-item',
    '.assessment-item',
    '.material-item',
    '.lesson-item',
  ];

  for (const selector of additionalSelectors) {
    try {
      const items = document.querySelectorAll(selector);
      for (const item of items) {
        const title = item.querySelector('.title, .name, h3, h4')?.textContent?.trim();
        const course = item.querySelector('.course, .classroom')?.textContent?.trim();
        const due = item.querySelector('.due, .date, .deadline')?.textContent?.trim();
        const type = item.querySelector('.type, .badge, .label')?.textContent?.trim();

        if (title) {
          const key = `${title}|${course || ''}`;
          if (!seenAssignments.has(key)) {
            seenAssignments.add(key);
            data.assignments.push({ title, type: type || null, due: due || null, course: course || null, date: null, day: null });
          }
        }
      }
    } catch { /* ignore */ }
  }

  // ============================================================
  // 4. DEEP SCAN — Look for any structured content that looks like courses/assignments
  // ============================================================

  // Scan for elements with "classroom" in their class or data attributes
  try {
    const classroomEls = document.querySelectorAll('[class*="classroom"], [data-classroom], [data-course]');
    for (const el of classroomEls) {
      const name = el.getAttribute('data-classroom-name')
        || el.getAttribute('data-course-name')
        || el.getAttribute('title')
        || '';
      if (name && !seenCourses.has(name)) {
        seenCourses.add(name);
        data.courses.push({ name, href: '', source: 'data-attr' });
      }
    }
  } catch { /* ignore */ }

  // ============================================================
  // 5. PAGE STRUCTURE DUMP — for debugging, capture key page sections
  // ============================================================
  const debugInfo = [];

  // Capture what major sections exist on the page
  const sections = [
    { selector: '#sidebar, .sidebar, [class*="sidebar"]', label: 'sidebar' },
    { selector: 'nav, .nav, .navigation', label: 'nav' },
    { selector: '.main-content, .content, #content, main', label: 'main-content' },
    { selector: '.event-wrapper', label: 'event-wrappers' },
    { selector: '[class*="classroom"]', label: 'classroom-elements' },
    { selector: '[class*="course"]', label: 'course-elements' },
    { selector: '.widget, .card, .panel', label: 'widgets' },
  ];

  for (const { selector, label } of sections) {
    try {
      const count = document.querySelectorAll(selector).length;
      if (count > 0) {
        debugInfo.push(`${label}: ${count} elements`);
        // Get first element's class list for debugging
        const first = document.querySelector(selector);
        if (first) {
          debugInfo.push(`  first class: ${first.className?.substring?.(0, 100) || 'none'}`);
        }
      }
    } catch { /* ignore */ }
  }

  data._debug = debugInfo;
  data._timestamp = new Date().toISOString();

  return data;
})();
