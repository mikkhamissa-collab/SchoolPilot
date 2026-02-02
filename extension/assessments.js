// assessments.js — Scrapes upcoming tests/quizzes from a Teamie course assessments page.
// Inject into: https://lms.asl.org/dash/#/courses/{id}/assessments or similar
(() => {
  const assessments = [];

  // --- Strategy 1: Assessment cards/items ---
  const items = document.querySelectorAll(
    '.assessment-item, .assessment-card, .quiz-item, .test-item, ' +
    '[class*="assessment"], [class*="quiz"], [class*="test-card"], ' +
    '.event-wrapper, .activity-item, .upcoming-item'
  );

  for (const item of items) {
    const entry = { title: null, type: null, date: null, course: null, weight: null };

    // Title
    const titleEl = item.querySelector(
      '.title, .name, .assessment-name, .item-title, h3, h4, ' +
      '.event-tile .title span, a[class*="title"]'
    );
    if (titleEl) entry.title = titleEl.textContent.trim();

    // Type (test, quiz, exam, etc.)
    const typeEl = item.querySelector(
      '.type, .badge, .tag, .label, .meta, .assessment-type, ' +
      '[class*="type"], [class*="badge"]'
    );
    if (typeEl) {
      const typeText = typeEl.textContent.trim().split('\n')[0].trim();
      entry.type = typeText;
    }

    // Date
    const dateEl = item.querySelector(
      '.date, .due-date, .deadline, time, [class*="date"], [class*="due"], ' +
      '.date-block .date, .sub-meta .text-primary span'
    );
    if (dateEl) {
      entry.date = dateEl.textContent.trim();
    }
    // Also check for datetime attribute
    const timeEl = item.querySelector('time[datetime]');
    if (timeEl) {
      entry.date = timeEl.getAttribute('datetime');
    }

    // Course (if on a combined page)
    const courseEl = item.querySelector(
      '.course, .course-name, [class*="course"], .meta:last-of-type'
    );
    if (courseEl) entry.course = courseEl.textContent.trim();

    // Weight/points
    const weightEl = item.querySelector(
      '.weight, .points, .max-score, [class*="weight"], [class*="points"]'
    );
    if (weightEl) {
      const wText = weightEl.textContent.trim();
      const wMatch = wText.match(/(\d+)/);
      if (wMatch) entry.weight = wText;
    }

    if (entry.title) assessments.push(entry);
  }

  // --- Strategy 2: Table-based assessment list ---
  if (assessments.length === 0) {
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      // Skip header row
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length < 2) continue;

        const entry = { title: null, type: null, date: null, course: null, weight: null };
        entry.title = cells[0].textContent.trim();

        // Try to find date and type from remaining cells
        for (let j = 1; j < cells.length; j++) {
          const text = cells[j].textContent.trim();
          const dateMatch = text.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\w+ \d{1,2},?\s*\d{4}|\d{1,2}\s+\w+\s+\d{4}/);
          const typeMatch = text.match(/^(test|quiz|exam|assessment|midterm|final|project)/i);

          if (dateMatch) entry.date = text;
          else if (typeMatch) entry.type = text;
        }

        if (entry.title) assessments.push(entry);
      }
    }
  }

  // --- Strategy 3: Calendar events ---
  if (assessments.length === 0) {
    const events = document.querySelectorAll(
      '.calendar-event, .fc-event, [class*="calendar-item"], [class*="event"]'
    );
    for (const event of events) {
      const text = event.textContent.trim();
      if (!text) continue;
      // Filter for assessment-like events
      if (/test|quiz|exam|assessment|midterm|final/i.test(text)) {
        const dateEl = event.querySelector('time, .date, [datetime]');
        assessments.push({
          title: text.split('\n')[0].trim(),
          type: 'Assessment',
          date: dateEl ? dateEl.textContent.trim() : null,
          course: null,
          weight: null
        });
      }
    }
  }

  return assessments;
})();
