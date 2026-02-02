// content.js — Scrapes assignment data from the Teamie LMS dashboard sidebar.
(() => {
  const wrappers = document.querySelectorAll('.event-wrapper');
  const assignments = [];
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
      assignments.push({
        title,
        type,
        due,
        course,
        date: currentDate,
        day: currentDay
      });
    }
  }

  return assignments;
})();
