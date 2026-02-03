// content.js — Deep scraper for Teamie LMS. Extracts courses, assignments,
// and newsfeed tasks from the dashboard at lms.asl.org/dash.
(() => {
  const result = {
    courses: [],
    assignments: [],
    newsfeed: [],
  };

  const seenCourses = new Set();
  const seenAssignments = new Set();

  // ============================================================
  // 1. SCRAPE COURSES — from the "Classes" section on the dashboard
  // ============================================================
  // The dashboard shows course cards/tiles in a grid. Each has a name.
  // Selectors based on the Teamie dashboard structure:

  // Try multiple selectors for course cards/tiles
  const courseCardSelectors = [
    '.classroom-card',
    '.classroom-tile',
    '.class-card',
    '.course-card',
    '[class*="classroom-"] a',
    '[class*="class-item"]',
  ];

  for (const selector of courseCardSelectors) {
    try {
      const cards = document.querySelectorAll(selector);
      for (const card of cards) {
        const name = card.textContent.trim().replace(/\s+/g, ' ');
        if (name && name.length > 2 && name.length < 120 && !seenCourses.has(name)) {
          seenCourses.add(name);
          result.courses.push({ name, href: card.href || '' });
        }
      }
    } catch { /* ignore */ }
  }

  // Try: Links to classroom pages (href contains "classroom")
  try {
    const classroomLinks = document.querySelectorAll('a[href*="classroom"]');
    for (const link of classroomLinks) {
      // Get the visible text, clean it up
      let name = link.textContent.trim().replace(/\s+/g, ' ');
      // Skip navigation/UI links (very short or very long)
      if (!name || name.length < 3 || name.length > 120) continue;
      // Skip if it's a button like "View Class Catalogue"
      if (name.includes('Catalogue') || name.includes('View all')) continue;

      if (!seenCourses.has(name)) {
        seenCourses.add(name);
        result.courses.push({ name, href: link.href || '' });
      }
    }
  } catch { /* ignore */ }

  // Try: Starred section — look for course names in the starred area
  try {
    const starred = document.querySelector('.starred, [class*="starred"]');
    if (starred) {
      const items = starred.querySelectorAll('a, .item, .card, [class*="class"]');
      for (const item of items) {
        const name = item.textContent.trim().replace(/\s+/g, ' ');
        if (name && name.length > 2 && name.length < 120 && !seenCourses.has(name)) {
          seenCourses.add(name);
          result.courses.push({ name, href: item.href || '' });
        }
      }
    }
  } catch { /* ignore */ }

  // ============================================================
  // 2. SCRAPE ASSIGNMENTS — from the events/todos sidebar
  // ============================================================
  const wrappers = document.querySelectorAll('.event-wrapper');
  let currentDate = null;
  let currentDay = null;

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
        result.assignments.push({
          title, type, due, course,
          date: currentDate,
          day: currentDay,
        });
      }
    }
  }

  // ============================================================
  // 3. SCRAPE NEWSFEED — posts with tasks/assignments from teachers
  // ============================================================
  // The newsfeed shows posts like "Reminder to do the review..."
  // with "Due on: Feb 3 at 8:30 AM" and course info
  try {
    const feedPosts = document.querySelectorAll('.feed-post, .post, .activity, [class*="feed"] > div, .newsfeed-item');
    for (const post of feedPosts) {
      const bodyEl = post.querySelector('.post-body, .body, .content, p');
      const courseLink = post.querySelector('a[href*="classroom"]');
      const dueEl = post.querySelector('.due, [class*="due"], .deadline');
      const authorEl = post.querySelector('.author, .name, [class*="author"]');

      const body = bodyEl ? bodyEl.textContent.trim() : null;
      const courseName = courseLink ? courseLink.textContent.trim() : null;
      const due = dueEl ? dueEl.textContent.trim() : null;
      const author = authorEl ? authorEl.textContent.trim() : null;

      if (body && body.length > 5) {
        result.newsfeed.push({
          body: body.substring(0, 300),
          course: courseName,
          due,
          author,
        });
      }
    }
  } catch { /* ignore */ }

  // Also try to grab task posts specifically (the "Task" filtered view)
  try {
    const taskPosts = document.querySelectorAll('[class*="task"], [class*="assignment-post"]');
    for (const post of taskPosts) {
      const title = post.querySelector('.title, h3, h4, .post-title')?.textContent?.trim();
      const course = post.querySelector('a[href*="classroom"]')?.textContent?.trim();
      const due = post.querySelector('[class*="due"]')?.textContent?.trim();

      if (title && !seenAssignments.has(title)) {
        seenAssignments.add(title);
        result.assignments.push({
          title, type: 'Task', due: due || null,
          course: course || null, date: null, day: null,
        });
      }
    }
  } catch { /* ignore */ }

  return result;
})();
