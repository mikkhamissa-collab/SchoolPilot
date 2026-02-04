// content.js — Comprehensive deep scraper for Teamie LMS (lms.asl.org).
// Extracts: all courses, all sidebar events (overdue + upcoming),
// all newsfeed posts with due dates, and teacher task details.
(() => {
  const data = {
    courses: [],
    assignments: [],
    newsfeed: [],
    overdue: [],
    stats: {},
  };

  const seenAssignments = new Set();
  const seenCourses = new Set();

  // ============================================================
  // 1. COURSES — from the Classes section
  // ============================================================
  // First, click "View all X Classes" to expand from starred to full list
  const viewAllBtn = document.querySelector('.btn.toggle-all');
  if (viewAllBtn && viewAllBtn.textContent.includes('View all')) {
    viewAllBtn.click();
  }

  // Small delay won't help in sync execution, but the DOM updates instantly
  // since it's just toggling a CSS class. Get all classroom links.
  const classroomLinks = document.querySelectorAll('a.classroom.list-group-item');
  for (const link of classroomLinks) {
    const name = link.textContent.trim().replace(/\s+/g, ' ');
    const idMatch = link.href && link.href.match(/classroom\/(\d+)/);
    const id = idMatch ? idMatch[1] : null;
    if (name && name.length > 2 && !seenCourses.has(name)) {
      seenCourses.add(name);
      data.courses.push({ name, id, href: link.href || '' });
    }
  }

  // Fallback: also try generic classroom links if above found nothing
  if (data.courses.length === 0) {
    const fallbackLinks = document.querySelectorAll('a[href*="classroom/"]');
    for (const link of fallbackLinks) {
      const name = link.textContent.trim().replace(/\s+/g, ' ');
      if (!name || name.length < 3 || name.length > 120) continue;
      if (name.includes('Catalogue') || name.includes('View all')) continue;
      const idMatch = link.href && link.href.match(/classroom\/(\d+)/);
      if (!seenCourses.has(name)) {
        seenCourses.add(name);
        data.courses.push({ name, id: idMatch ? idMatch[1] : null, href: link.href || '' });
      }
    }
  }

  // ============================================================
  // 2. SIDEBAR EVENTS — Overdue + Next 7 Days from event panels
  // ============================================================
  // The page uses .panel.event-category sections with headings like
  // "Overdue 29", "Next 7 Days 7", "Next 3 weeks". Each category
  // contains .event-wrapper elements with assignments.
  const eventCategories = document.querySelectorAll('.panel.event-category');

  for (const category of eventCategories) {
    const headingEl = category.querySelector('.panel-heading');
    const headingText = headingEl ? headingEl.textContent.trim().replace(/\s+/g, ' ') : '';
    const isOverdue = headingText.toLowerCase().includes('overdue');
    const targetArray = isOverdue ? data.overdue : data.assignments;

    const wrappers = category.querySelectorAll('.event-wrapper');
    let currentDate = null;
    let currentDay = null;

    for (const wrapper of wrappers) {
      const dateEl = wrapper.querySelector('.date-block .date');
      const dayEl = wrapper.querySelector('.date-block .day');

      if (dateEl && dateEl.textContent.trim()) currentDate = dateEl.textContent.trim();
      if (dayEl && dayEl.textContent.trim()) currentDay = dayEl.textContent.trim();

      const titleEl = wrapper.querySelector('.title span') || wrapper.querySelector('.title');
      const title = titleEl ? titleEl.textContent.trim() : null;
      if (!title) continue;

      // Type is first line of first .meta element
      const metaEl = wrapper.querySelector('.meta');
      let type = null;
      if (metaEl) {
        const lines = metaEl.textContent.split('\n').map(l => l.trim()).filter(Boolean);
        type = lines.length > 0 ? lines[0] : null;
      }

      // Due time
      const dueEl = wrapper.querySelector('.text-primary span') || wrapper.querySelector('.text-primary');
      const due = dueEl ? dueEl.textContent.trim() : null;

      // Course name is the last .meta element
      const courseEl = wrapper.querySelector('.meta:last-of-type');
      const course = courseEl ? courseEl.textContent.trim().replace(/\s+/g, ' ') : null;

      // Icon class tells us the type (mdi-home = task, mdi-file = assignment, etc.)
      const iconEl = wrapper.querySelector('.event-icons .mdi');
      const iconClass = iconEl ? iconEl.className : '';

      const key = `${title}|${course || ''}|${currentDate || ''}`;
      if (!seenAssignments.has(key)) {
        seenAssignments.add(key);
        targetArray.push({
          title,
          type,
          due,
          course,
          date: currentDate,
          day: currentDay,
          isOverdue,
          icon: iconClass,
        });

        // Extract course from event if not seen
        if (course) {
          const cleaned = course.split('\n')[0].trim();
          if (cleaned && !seenCourses.has(cleaned)) {
            seenCourses.add(cleaned);
            data.courses.push({ name: cleaned, id: null, href: '' });
          }
        }
      }
    }
  }

  // Fallback: if no event-category panels found, try user-events-container
  if (data.assignments.length === 0 && data.overdue.length === 0) {
    const eventContainers = document.querySelectorAll('.user-events-container');
    for (const container of eventContainers) {
      const wrappers = container.querySelectorAll('.event-wrapper');
      let cd = null, cday = null;
      for (const wrapper of wrappers) {
        const dateEl = wrapper.querySelector('.date-block .date');
        const dayEl = wrapper.querySelector('.date-block .day');
        if (dateEl && dateEl.textContent.trim()) cd = dateEl.textContent.trim();
        if (dayEl && dayEl.textContent.trim()) cday = dayEl.textContent.trim();
        const titleEl = wrapper.querySelector('.title span') || wrapper.querySelector('.title');
        const title = titleEl ? titleEl.textContent.trim() : null;
        if (!title) continue;
        const metaEl = wrapper.querySelector('.meta');
        let type = null;
        if (metaEl) {
          const lines = metaEl.textContent.split('\n').map(l => l.trim()).filter(Boolean);
          type = lines[0] || null;
        }
        const dueEl = wrapper.querySelector('.text-primary span') || wrapper.querySelector('.text-primary');
        const due = dueEl ? dueEl.textContent.trim() : null;
        const courseEl = wrapper.querySelector('.meta:last-of-type');
        const course = courseEl ? courseEl.textContent.trim().replace(/\s+/g, ' ') : null;
        const key = `${title}|${course || ''}|${cd || ''}`;
        if (!seenAssignments.has(key)) {
          seenAssignments.add(key);
          data.assignments.push({ title, type, due, course, date: cd, day: cday, isOverdue: false, icon: '' });
        }
      }
    }
  }

  // Also get events from the visible .event-wrapper elements outside containers
  // (in case the page structure differs)
  const topLevelWrappers = document.querySelectorAll('.panel-group.event-list .event-wrapper');
  let currentDate = null;
  let currentDay = null;

  for (const wrapper of topLevelWrappers) {
    const dateEl = wrapper.querySelector('.date-block .date');
    const dayEl = wrapper.querySelector('.date-block .day');
    if (dateEl && dateEl.textContent.trim()) currentDate = dateEl.textContent.trim();
    if (dayEl && dayEl.textContent.trim()) currentDay = dayEl.textContent.trim();

    const titleEl = wrapper.querySelector('.title span') || wrapper.querySelector('.title');
    const title = titleEl ? titleEl.textContent.trim() : null;
    if (!title) continue;

    const metaEl = wrapper.querySelector('.meta');
    let type = null;
    if (metaEl) {
      const lines = metaEl.textContent.split('\n').map(l => l.trim()).filter(Boolean);
      type = lines[0] || null;
    }

    const dueEl = wrapper.querySelector('.text-primary span') || wrapper.querySelector('.text-primary');
    const due = dueEl ? dueEl.textContent.trim() : null;
    const courseEl = wrapper.querySelector('.meta:last-of-type');
    const course = courseEl ? courseEl.textContent.trim().replace(/\s+/g, ' ') : null;

    const key = `${title}|${course || ''}|${currentDate || ''}`;
    if (!seenAssignments.has(key)) {
      seenAssignments.add(key);
      data.assignments.push({
        title, type, due, course,
        date: currentDate, day: currentDay,
        isOverdue: false, icon: '',
      });
    }
  }

  // ============================================================
  // 3. NEWSFEED — Teacher posts with tasks, announcements, due dates
  // ============================================================
  // Posts are .node-post elements with .post-header containing course links
  const nodePosts = document.querySelectorAll('.node-post');
  for (const post of nodePosts) {
    const courseLink = post.querySelector('a[href*="classroom"]');
    const courseName = courseLink ? courseLink.textContent.trim() : null;
    const courseId = courseLink ? (courseLink.href.match(/classroom\/(\d+)/)?.[1] || null) : null;

    // Body text: all <p> tags except the first (which is often the author)
    const allP = post.querySelectorAll('p');
    const bodyParts = [];
    for (const p of allP) {
      const text = p.textContent.trim();
      if (text.length > 10) bodyParts.push(text);
    }
    const body = bodyParts.join(' ').substring(0, 500);
    if (!body) continue;

    // Due date: match "Due on: Feb 3 at 8:30 AM" pattern
    const fullText = post.textContent;
    const dueMatch = fullText.match(/Due on:\s*(.+?)(?:\n|Mark)/);
    const dueDate = dueMatch ? dueMatch[1].trim() : null;

    // Is it a task? (has "Mark as Done" button)
    const isTask = fullText.includes('Mark as Done');

    // Post type from class
    const cls = post.className || '';
    let postType = 'post';
    if (cls.includes('announcement')) postType = 'announcement';
    else if (cls.includes('thought')) postType = 'thought';
    else if (cls.includes('task')) postType = 'task';

    // Author name from .field-post-title
    const authorEl = post.querySelector('.field-post-title a');
    const author = authorEl ? authorEl.textContent.trim() : null;

    data.newsfeed.push({
      author,
      course: courseName,
      courseId,
      body,
      dueDate,
      isTask,
      postType,
    });

    // Extract course if not seen
    if (courseName && !seenCourses.has(courseName)) {
      seenCourses.add(courseName);
      data.courses.push({ name: courseName, id: courseId, href: '' });
    }
  }

  // ============================================================
  // 4. STATS — summary counts
  // ============================================================
  // Overdue badge count
  const overdueCountEl = document.querySelector('.user-events-container .panel-heading');
  const overdueMatch = overdueCountEl?.textContent?.match(/Overdue\s+(\d+)/i);
  const todoCountEl = document.querySelector('.user-todo-count');

  data.stats = {
    totalCourses: data.courses.length,
    totalAssignments: data.assignments.length,
    totalOverdue: data.overdue.length,
    overdueReported: overdueMatch ? parseInt(overdueMatch[1]) : null,
    todosCount: todoCountEl ? parseInt(todoCountEl.textContent.trim()) : null,
    newsfeedPosts: data.newsfeed.length,
    scrapedAt: new Date().toISOString(),
  };

  return data;
})();
