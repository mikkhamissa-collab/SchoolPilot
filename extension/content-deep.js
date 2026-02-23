// content-deep.js — Deep scraper for Teamie LMS course pages.
// Navigates into a course and extracts: lesson content, assignment details,
// embedded documents, PDF links, teacher instructions, and page text.
// Injected into course pages (lms.asl.org/classroom/*) not the dashboard.
(() => {
  const data = {
    course: {
      id: null,
      name: null,
      url: window.location.href,
    },
    units: [],
    lessons: [],
    resources: [],
    pageContent: null,
    coursePostContent: [],
    scrapedAt: new Date().toISOString(),
  };

  const seenResources = new Set();

  // ============================================================
  // HELPERS
  // ============================================================

  function cleanText(el) {
    if (!el) return null;
    return el.textContent.trim().replace(/\s+/g, ' ');
  }

  function extractStructuredText(el) {
    if (!el) return null;
    const parts = [];
    const children = el.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, div, br, span, td, th');

    if (children.length === 0) {
      // No structure — just get text
      return el.textContent.trim().substring(0, 10000);
    }

    for (const child of children) {
      const tag = child.tagName.toLowerCase();
      const text = child.textContent.trim();
      if (!text) continue;

      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        parts.push(`\n## ${text}\n`);
      } else if (tag === 'li') {
        parts.push(`• ${text}`);
      } else if (['p', 'div', 'td', 'th'].includes(tag)) {
        // Only add if not already captured by a child
        if (child.children.length === 0 || child.querySelector('a, strong, em, span, b, i')) {
          parts.push(text);
        }
      }
    }

    const result = parts.join('\n').trim();
    return result.substring(0, 10000); // Cap at 10k chars
  }

  function extractResourcesFromEl(container) {
    const resources = [];
    if (!container) return resources;

    // Google Drive links
    const driveLinks = container.querySelectorAll('a[href*="drive.google.com"], a[href*="docs.google.com"]');
    for (const link of driveLinks) {
      const href = link.href || '';
      const fileIdMatch = href.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const fileId = fileIdMatch ? fileIdMatch[1] : null;
      const key = fileId || href;
      if (key && !seenResources.has(key)) {
        seenResources.add(key);
        resources.push({
          type: 'google_drive',
          name: cleanText(link) || href,
          url: href,
          fileId,
        });
      }
    }

    // PDF links
    const pdfLinks = container.querySelectorAll('a[href$=".pdf"], a[href*=".pdf?"]');
    for (const link of pdfLinks) {
      const href = link.href || '';
      if (!seenResources.has(href)) {
        seenResources.add(href);
        resources.push({
          type: 'pdf',
          name: cleanText(link) || href.split('/').pop(),
          url: href,
        });
      }
    }

    // YouTube embeds
    const ytIframes = container.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtu.be"]');
    for (const iframe of ytIframes) {
      const src = iframe.src || '';
      const videoIdMatch = src.match(/(?:embed\/|v=)([a-zA-Z0-9_-]{11})/);
      const videoId = videoIdMatch ? videoIdMatch[1] : null;
      if (videoId && !seenResources.has(videoId)) {
        seenResources.add(videoId);
        resources.push({
          type: 'youtube',
          name: iframe.title || 'YouTube Video',
          videoId,
          src,
        });
      }
    }

    // YouTube links
    const ytLinks = container.querySelectorAll('a[href*="youtube.com/watch"], a[href*="youtu.be/"]');
    for (const link of ytLinks) {
      const href = link.href || '';
      const videoIdMatch = href.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      const videoId = videoIdMatch ? videoIdMatch[1] : null;
      if (videoId && !seenResources.has(videoId)) {
        seenResources.add(videoId);
        resources.push({
          type: 'youtube',
          name: cleanText(link) || 'YouTube Video',
          url: href,
          videoId,
        });
      }
    }

    // Teamie file attachments
    const fileLinks = container.querySelectorAll('a[href*="/file/"], a.attachment-link, .attachment a');
    for (const link of fileLinks) {
      const href = link.href || '';
      if (href && !seenResources.has(href)) {
        seenResources.add(href);
        resources.push({
          type: 'attachment',
          name: cleanText(link) || href.split('/').pop(),
          url: href,
        });
      }
    }

    // Images that are content (not icons/avatars)
    const images = container.querySelectorAll('img:not([class*="avatar"]):not([class*="icon"]):not([width="16"])');
    for (const img of images) {
      const src = img.src || '';
      if (src && src.length > 50 && !src.includes('avatar') && !src.includes('icon') && !seenResources.has(src)) {
        seenResources.add(src);
        resources.push({
          type: 'image',
          name: img.alt || 'Image',
          url: src,
        });
      }
    }

    return resources;
  }

  // ============================================================
  // 1. COURSE INFO — from the page header
  // ============================================================
  const courseIdMatch = window.location.href.match(/classroom\/(\d+)/);
  data.course.id = courseIdMatch ? courseIdMatch[1] : null;

  // Course name from breadcrumb or header
  const courseNameEl = document.querySelector('.classroom-header .name') ||
    document.querySelector('.course-name') ||
    document.querySelector('h1.classroom-name') ||
    document.querySelector('.breadcrumb li:last-child a') ||
    document.querySelector('.page-title');
  data.course.name = courseNameEl ? cleanText(courseNameEl) : null;

  // Fallback: document title
  if (!data.course.name) {
    const title = document.title || '';
    const parts = title.split('|');
    if (parts.length >= 2) {
      data.course.name = parts[0].trim();
    }
  }

  // ============================================================
  // 2. UNITS — Course organization/modules
  // ============================================================
  const unitEls = document.querySelectorAll('.unit-item, .lesson-group, .module-item, [class*="unit"]');
  for (const unitEl of unitEls) {
    const nameEl = unitEl.querySelector('.unit-name, .unit-title, h3, h4, .name');
    const name = nameEl ? cleanText(nameEl) : null;
    if (!name) continue;

    const descEl = unitEl.querySelector('.unit-description, .description, p');
    const description = descEl ? cleanText(descEl) : null;

    const numMatch = name.match(/^(?:Unit|Module)\s+(\d+)/i);
    const number = numMatch ? parseInt(numMatch[1]) : null;

    const objectives = [];
    const objEls = unitEl.querySelectorAll('li, .objective');
    for (const obj of objEls) {
      const text = cleanText(obj);
      if (text && text.length > 5 && text.length < 200) {
        objectives.push(text);
      }
    }

    data.units.push({
      number,
      name,
      fullName: cleanText(unitEl.querySelector('h2, h3, .full-name')) || name,
      description,
      objectives: objectives.length > 0 ? objectives : undefined,
    });
  }

  // ============================================================
  // 3. LESSONS — Individual lesson/page links
  // ============================================================
  const lessonLinks = document.querySelectorAll(
    'a[href*="/lesson/"], a[href*="/page/"], .lesson-item a, .lesson-link, .page-link'
  );
  const seenLessons = new Set();

  for (const link of lessonLinks) {
    const name = cleanText(link);
    if (!name || name.length < 3 || name.length > 200) continue;

    const href = link.href || '';
    const lessonIdMatch = href.match(/(?:lesson|page)\/(\d+)/);
    const lessonId = lessonIdMatch ? lessonIdMatch[1] : null;

    const key = lessonId || name;
    if (seenLessons.has(key)) continue;
    seenLessons.add(key);

    data.lessons.push({ name, lessonId, href });
  }

  // ============================================================
  // 4. PAGE CONTENT — If on a specific lesson/assignment page
  // ============================================================
  const isLessonPage = window.location.href.match(/\/(lesson|page)\/\d+/);
  const isAssignmentPage = document.querySelector('.assignment-view, .submission-form, [class*="assignment"]');

  if (isLessonPage || isAssignmentPage) {
    const pageContent = {
      type: isAssignmentPage ? 'assignment' : 'lesson',
      pageId: null,
      lessonId: null,
      title: null,
      body: null,
      instructions: null,
      dueDate: null,
      resources: [],
      pages: [],
    };

    const pageIdMatch = window.location.href.match(/(?:lesson|page)\/(\d+)/);
    pageContent.pageId = pageIdMatch ? pageIdMatch[1] : null;
    pageContent.lessonId = pageContent.pageId;

    // Title
    const titleEl = document.querySelector('.page-title, .lesson-title, h1, .post-title');
    pageContent.title = titleEl ? cleanText(titleEl) : null;

    // Body content
    const bodyEl = document.querySelector(
      '.page-content, .lesson-content, .post-body, .node-body, .field-body, .text-content, article'
    );
    if (bodyEl) {
      pageContent.body = extractStructuredText(bodyEl);
    }

    // Assignment instructions
    const instructionsEl = document.querySelector(
      '.assignment-instructions, .instructions, .field-instructions'
    );
    if (instructionsEl) {
      pageContent.instructions = extractStructuredText(instructionsEl);
    }

    // Due date
    const dueDateEl = document.querySelector('.due-date, .deadline, [class*="due"]');
    if (dueDateEl) {
      pageContent.dueDate = cleanText(dueDateEl);
    }
    if (!pageContent.dueDate) {
      const fullText = document.body.textContent || '';
      const dueMatch = fullText.match(/Due(?:\s+(?:on|by|date))?\s*:\s*(.+?)(?:\n|$)/i);
      if (dueMatch) {
        pageContent.dueDate = dueMatch[1].trim().substring(0, 100);
      }
    }

    // Resources from page
    pageContent.resources = extractResourcesFromEl(bodyEl || document.body);

    // Sub-pages
    const pageLinks = document.querySelectorAll('.page-nav a, .lesson-nav a, .sub-pages a');
    for (const link of pageLinks) {
      const name = cleanText(link);
      const href = link.href || '';
      const pidMatch = href.match(/(?:page|lesson)\/(\d+)/);
      if (name && href) {
        pageContent.pages.push({ name, pageId: pidMatch ? pidMatch[1] : null, href });
      }
    }

    data.pageContent = pageContent;
  }

  // ============================================================
  // 5. ALL RESOURCES from visible page
  // ============================================================
  const mainContent = document.querySelector('.main-content, #content, main, .page-content') || document.body;
  data.resources = extractResourcesFromEl(mainContent);

  // ============================================================
  // 6. COURSE POSTS / ANNOUNCEMENTS
  // ============================================================
  const posts = document.querySelectorAll('.node-post, .post-item, .feed-item');
  for (const post of posts) {
    const bodyEl = post.querySelector('.post-body, .node-body, .field-body, p');
    const text = bodyEl ? cleanText(bodyEl) : null;
    if (text && text.length > 20) {
      data.coursePostContent.push(text.substring(0, 1000));
    }
  }

  return data;
})();
