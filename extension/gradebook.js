// gradebook.js — Scrapes grade data from a Teamie course gradebook page.
// Inject into: https://lms.asl.org/dash/#/courses/{id}/gradebook
(() => {
  const result = {
    course: null,
    categories: [],
    grades: []
  };

  // Try to get course name from page header
  const courseHeader = document.querySelector('.course-title, .course-name, h1.title, .page-title');
  if (courseHeader) {
    result.course = courseHeader.textContent.trim();
  }
  // Fallback: breadcrumb or nav
  if (!result.course) {
    const breadcrumb = document.querySelector('.breadcrumb li:last-child, .nav-title');
    if (breadcrumb) result.course = breadcrumb.textContent.trim();
  }

  // --- Strategy 1: Table-based gradebook ---
  const tables = document.querySelectorAll('table');
  for (const table of tables) {
    const rows = table.querySelectorAll('tr');
    for (const row of rows) {
      const cells = row.querySelectorAll('td, th');
      if (cells.length < 2) continue;

      const firstCell = cells[0].textContent.trim();
      const lastCell = cells[cells.length - 1].textContent.trim();

      // Look for category weight rows (e.g. "Tests - 40%")
      const weightMatch = firstCell.match(/^(.+?)\s*[-–:]\s*(\d+(?:\.\d+)?)\s*%/);
      if (weightMatch) {
        result.categories.push({
          name: weightMatch[1].trim(),
          weight: parseFloat(weightMatch[2]) / 100
        });
        continue;
      }

      // Look for grade rows: name | score or name | score/max or name | percentage
      const scoreMatch = lastCell.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
      const pctMatch = lastCell.match(/^(\d+(?:\.\d+)?)\s*%$/);

      if (scoreMatch) {
        // Determine category from parent section or row class
        const category = detectCategory(row, table);
        result.grades.push({
          category: category,
          name: firstCell,
          score: parseFloat(scoreMatch[1]),
          max: parseFloat(scoreMatch[2])
        });
      } else if (pctMatch) {
        const category = detectCategory(row, table);
        result.grades.push({
          category: category,
          name: firstCell,
          score: parseFloat(pctMatch[1]),
          max: 100
        });
      }
    }
  }

  // --- Strategy 2: Card/div-based gradebook ---
  if (result.grades.length === 0) {
    // Look for grade items in card layouts
    const gradeItems = document.querySelectorAll(
      '.grade-item, .gradebook-item, .assessment-item, [class*="grade-row"], [class*="gradebook-row"]'
    );
    for (const item of gradeItems) {
      const nameEl = item.querySelector('.title, .name, .item-name, .assessment-name, span:first-child');
      const scoreEl = item.querySelector('.score, .grade, .points, .mark, [class*="score"], [class*="grade"]');
      const catEl = item.querySelector('.category, .type, [class*="category"]');

      if (!nameEl || !scoreEl) continue;

      const scoreText = scoreEl.textContent.trim();
      const scoreMatch = scoreText.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
      const pctMatch = scoreText.match(/(\d+(?:\.\d+)?)\s*%/);

      if (scoreMatch) {
        result.grades.push({
          category: catEl ? catEl.textContent.trim() : 'Uncategorized',
          name: nameEl.textContent.trim(),
          score: parseFloat(scoreMatch[1]),
          max: parseFloat(scoreMatch[2])
        });
      } else if (pctMatch) {
        result.grades.push({
          category: catEl ? catEl.textContent.trim() : 'Uncategorized',
          name: nameEl.textContent.trim(),
          score: parseFloat(pctMatch[1]),
          max: 100
        });
      }
    }
  }

  // --- Strategy 3: Look for category sections with weights ---
  if (result.categories.length === 0) {
    const sections = document.querySelectorAll(
      '.category-header, .grade-category, [class*="category"], .section-header'
    );
    for (const sec of sections) {
      const text = sec.textContent.trim();
      const match = text.match(/(.+?)\s*[-–:(\s]+(\d+(?:\.\d+)?)\s*%/);
      if (match) {
        result.categories.push({
          name: match[1].trim(),
          weight: parseFloat(match[2]) / 100
        });
      }
    }
  }

  // --- Strategy 4: Scrape any visible percentage/score text on the page ---
  if (result.grades.length === 0) {
    // Last resort: look for any elements with score-like text
    const allElements = document.querySelectorAll('*');
    const seen = new Set();
    for (const el of allElements) {
      if (el.children.length > 0) continue; // Only leaf nodes
      const text = el.textContent.trim();
      if (seen.has(text)) continue;
      seen.add(text);
      const match = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
      if (match && parseFloat(match[2]) > 0) {
        // Walk up to find a label
        let label = null;
        let parent = el.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const prev = parent.previousElementSibling;
          if (prev && prev.textContent.trim().length > 0 && prev.textContent.trim().length < 100) {
            label = prev.textContent.trim();
            break;
          }
          parent = parent.parentElement;
        }
        if (label) {
          result.grades.push({
            category: 'Uncategorized',
            name: label,
            score: parseFloat(match[1]),
            max: parseFloat(match[2])
          });
        }
      }
    }
  }

  function detectCategory(row, table) {
    // Check for a section header above this row
    let prev = row.previousElementSibling;
    while (prev) {
      const th = prev.querySelector('th[colspan], .category-header, .section-title');
      if (th) return th.textContent.trim();
      // Check if prev row has a bold/header style indicating category
      if (prev.classList.contains('category') || prev.classList.contains('section-header')) {
        return prev.textContent.trim();
      }
      prev = prev.previousElementSibling;
    }
    // Check table caption or preceding heading
    const caption = table.querySelector('caption');
    if (caption) return caption.textContent.trim();
    const prevHeading = table.previousElementSibling;
    if (prevHeading && ['H2', 'H3', 'H4'].includes(prevHeading.tagName)) {
      return prevHeading.textContent.trim();
    }
    return 'Uncategorized';
  }

  return result;
})();
