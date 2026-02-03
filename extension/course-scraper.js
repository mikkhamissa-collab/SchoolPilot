// course-scraper.js — Deep scraper for Teamie course materials
// Extracts: units, lessons, assignments with PDFs, Google Drive links, YouTube videos
// Must be injected into a course page (https://lms.asl.org/dash/#/classroom/{id}/sections)
(() => {
  const data = {
    course: null,
    units: [],
    resources: [],
    stats: {},
  };

  // Get course info from page header
  const courseHeader = document.querySelector('.classroom-title, .page-title, h1');
  const courseIdMatch = window.location.hash.match(/classroom\/(\d+)/);
  data.course = {
    id: courseIdMatch ? courseIdMatch[1] : null,
    name: courseHeader ? courseHeader.textContent.trim() : null,
    url: window.location.href,
  };

  // ============================================================
  // 1. EXTRACT UNITS/FOLDERS from the Materials section
  // ============================================================
  // Units are shown as folders in the sections view
  const folderElements = document.querySelectorAll('[class*="folder"], [class*="section-item"], .material-folder');
  const unitLinks = document.querySelectorAll('a[href*="lesson"], a[href*="sections"]');

  const seenUnits = new Set();

  // Try to get unit structure from folder list
  const sectionItems = document.querySelectorAll('.section-list-item, .folder-item, [ng-repeat*="section"], [ng-repeat*="folder"]');
  for (const item of sectionItems) {
    const nameEl = item.querySelector('.folder-name, .section-name, .title, a');
    const name = nameEl ? nameEl.textContent.trim() : null;
    if (!name || seenUnits.has(name)) continue;

    const linkEl = item.querySelector('a[href*="lesson"]');
    const href = linkEl ? linkEl.href : null;
    const lessonIdMatch = href ? href.match(/lesson\/(\d+)/) : null;

    seenUnits.add(name);
    data.units.push({
      name,
      lessonId: lessonIdMatch ? lessonIdMatch[1] : null,
      href,
    });
  }

  // Fallback: get from visible links
  if (data.units.length === 0) {
    const allLinks = document.querySelectorAll('a[href*="sections/lesson"]');
    for (const link of allLinks) {
      const name = link.textContent.trim();
      if (!name || name.length < 3 || seenUnits.has(name)) continue;

      const lessonIdMatch = link.href.match(/lesson\/(\d+)/);
      seenUnits.add(name);
      data.units.push({
        name,
        lessonId: lessonIdMatch ? lessonIdMatch[1] : null,
        href: link.href,
      });
    }
  }

  // ============================================================
  // 2. EXTRACT RESOURCES from current page view
  // ============================================================
  // Google Drive links
  const driveLinks = document.querySelectorAll('a[href*="drive.google.com"], a[href*="docs.google.com"]');
  for (const link of driveLinks) {
    const text = link.textContent.trim();
    const href = link.href;
    const fileIdMatch = href.match(/\/d\/([a-zA-Z0-9_-]+)/);

    data.resources.push({
      type: 'google_drive',
      name: text || 'Untitled',
      url: href,
      fileId: fileIdMatch ? fileIdMatch[1] : null,
    });
  }

  // YouTube videos
  const ytLinks = document.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]');
  for (const link of ytLinks) {
    const text = link.textContent.trim();
    const href = link.href;
    const videoIdMatch = href.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);

    data.resources.push({
      type: 'youtube',
      name: text || 'Video',
      url: href,
      videoId: videoIdMatch ? videoIdMatch[1] : null,
    });
  }

  // Embedded PDFs (tme-expandable-attachment)
  const attachments = document.querySelectorAll('tme-expandable-attachment');
  for (const att of attachments) {
    const nameEl = att.querySelector('.attachment-title, .file-name, span');
    const name = nameEl ? nameEl.textContent.trim() : att.textContent.trim().substring(0, 100);

    // Try to get the source URL from ng-src or data attributes
    const iframe = att.querySelector('iframe');
    const src = iframe ? (iframe.src || iframe.getAttribute('ng-src')) : null;

    data.resources.push({
      type: 'pdf_attachment',
      name: name.replace(/\s+/g, ' '),
      src,
    });
  }

  // External links (other educational resources)
  const eduLinks = document.querySelectorAll('a[href*="khanacademy"], a[href*="collegeboard"], a[href*="apclassroom"]');
  for (const link of eduLinks) {
    data.resources.push({
      type: 'educational',
      name: link.textContent.trim(),
      url: link.href,
    });
  }

  // ============================================================
  // 3. EXTRACT ASSIGNMENT PAGE CONTENT (if on a page view)
  // ============================================================
  const pageContent = {};

  // Page title
  const pageTitleEl = document.querySelector('.page-title, h1, h2');
  pageContent.title = pageTitleEl ? pageTitleEl.textContent.trim() : null;

  // Instructions text
  const instructionsEl = document.querySelector('.instructions, .page-body, .rich-text-content');
  if (instructionsEl) {
    pageContent.instructions = instructionsEl.textContent.trim().substring(0, 2000);
  }

  // Due date info
  const dueDateEl = document.querySelector('[class*="due"], .available-dates');
  if (dueDateEl) {
    const text = dueDateEl.textContent;
    const dueMatch = text.match(/DUE ON[\s:]+([^]+?)(?=AVAILABLE|MAX|$)/i);
    const availMatch = text.match(/AVAILABLE FROM[\s:]+([^]+?)(?=DUE|MAX|$)/i);
    pageContent.dueOn = dueMatch ? dueMatch[1].trim() : null;
    pageContent.availableFrom = availMatch ? availMatch[1].trim() : null;
  }

  // All text content for topic extraction
  const bodyEl = document.querySelector('.page-view, .assignment-view, main, [class*="content"]');
  if (bodyEl) {
    pageContent.fullText = bodyEl.textContent.replace(/\s+/g, ' ').trim().substring(0, 5000);
  }

  data.pageContent = pageContent;

  // ============================================================
  // 4. STATS
  // ============================================================
  data.stats = {
    unitsFound: data.units.length,
    resourcesFound: data.resources.length,
    scrapedAt: new Date().toISOString(),
  };

  return data;
})();
