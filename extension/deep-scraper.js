// deep-scraper.js — Deep content scraper for Teamie LMS courses
// Extracts: unit descriptions, all assignments, Google Drive links, PDFs, instructions
// Returns structured data that can be stored and used for AI-powered study guides

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
    scrapedAt: new Date().toISOString(),
  };

  // Detect what type of page we're on
  const hash = window.location.hash;
  const isCourseMaterials = hash.includes('/sections') && !hash.includes('/lesson/');
  const isLessonPage = hash.includes('/lesson/') && !hash.includes('/page/');
  const isAssignmentPage = hash.includes('/page/');

  // Get course ID from URL
  const courseMatch = hash.match(/classroom\/(\d+)/);
  data.course.id = courseMatch ? courseMatch[1] : null;

  // Get course name
  const courseTitle = document.querySelector('.classroom-title, h1, .page-title');
  data.course.name = courseTitle ? courseTitle.textContent.trim().split('\n')[0] : null;

  // ============================================================
  // COURSE MATERIALS PAGE - Extract all units and lessons
  // ============================================================
  if (isCourseMaterials) {
    // Extract unit information from page text
    const bodyText = document.body.innerText;
    const unitBlocks = bodyText.split(/(?=Unit \d+:)/);

    for (const block of unitBlocks) {
      const match = block.match(/^Unit (\d+):\s*([^\n]+)/);
      if (match) {
        const unitNum = match[1];
        const unitName = match[2].trim();

        // Extract description - clean up UI text
        let description = block.substring(match[0].length, 2000)
          .replace(/\d+ pages?/gi, '')
          .replace(/Resume Reading/gi, '')
          .replace(/Read Again/gi, '')
          .replace(/Read$/gm, '')
          .replace(/Click to view learning goals/gi, '')
          .replace(/Unit Overview/gi, '')
          .replace(/Unit Outline/gi, '')
          .replace(/Textbook solutions[^\n]*/gi, '')
          .replace(/Textbook answers[^\n]*/gi, '')
          .replace(/Review resources/gi, '')
          .trim();

        // Truncate at next unit or section
        const nextSection = description.search(/(?:Unit \d+:|Semester|November|Course Resources|Assessments)/i);
        if (nextSection > 0) {
          description = description.substring(0, nextSection).trim();
        }

        // Extract learning objectives if present
        const objectives = [];
        const bulletMatches = description.matchAll(/[•\-\*]\s*([^\n•\-\*]+)/g);
        for (const m of bulletMatches) {
          objectives.push(m[1].trim());
        }

        data.units.push({
          number: parseInt(unitNum),
          name: unitName,
          fullName: `Unit ${unitNum}: ${unitName}`,
          description: description.substring(0, 1500),
          objectives,
        });
      }
    }

    // Sort units by number
    data.units.sort((a, b) => a.number - b.number);

    // Extract lesson links
    const lessonLinks = document.querySelectorAll('a[href*="/lesson/"]');
    const seenLessons = new Set();

    for (const link of lessonLinks) {
      const href = link.href;
      const lessonId = href.match(/lesson\/(\d+)/)?.[1];
      const name = link.textContent?.trim();

      if (!lessonId || !name || name.length < 3 || seenLessons.has(lessonId)) continue;
      seenLessons.add(lessonId);

      // Get page count from parent
      let pageCount = null;
      let parent = link.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const match = parent.textContent?.match(/(\d+)\s*pages?/i);
        if (match) {
          pageCount = parseInt(match[1]);
          break;
        }
        parent = parent.parentElement;
      }

      // Try to associate with a unit
      let unitNumber = null;
      const unitMatch = name.match(/Unit (\d+)/i) || link.closest('[class*="section"]')?.textContent?.match(/Unit (\d+)/i);
      if (unitMatch) {
        unitNumber = parseInt(unitMatch[1]);
      }

      data.lessons.push({
        name,
        lessonId,
        href,
        pageCount,
        unitNumber,
      });
    }
  }

  // ============================================================
  // LESSON PAGE - Extract all assignment pages
  // ============================================================
  if (isLessonPage) {
    const lessonMatch = hash.match(/lesson\/(\d+)/);
    data.pageContent = {
      type: 'lesson',
      lessonId: lessonMatch ? lessonMatch[1] : null,
      pages: [],
    };

    // Get all page links in the lesson
    const pageLinks = document.querySelectorAll('a[href*="/page/"]');
    const seenPages = new Set();

    for (const link of pageLinks) {
      const href = link.href;
      const pageId = href.match(/page\/(\d+)/)?.[1];
      const name = link.textContent?.trim();

      if (!pageId || !name || name.length < 3 || seenPages.has(pageId)) continue;
      seenPages.add(pageId);

      data.pageContent.pages.push({
        name,
        pageId,
        href,
      });
    }
  }

  // ============================================================
  // ASSIGNMENT PAGE - Extract actual content
  // ============================================================
  if (isAssignmentPage) {
    const pageMatch = hash.match(/page\/(\d+)/);
    const lessonMatch = hash.match(/lesson\/(\d+)/);

    data.pageContent = {
      type: 'assignment',
      pageId: pageMatch ? pageMatch[1] : null,
      lessonId: lessonMatch ? lessonMatch[1] : null,
      title: null,
      instructions: null,
      dueDate: null,
      resources: [],
    };

    // Get page title
    const titleEl = document.querySelector('h1, h2, .page-title');
    if (titleEl) {
      // Clean up title - remove breadcrumb stuff
      data.pageContent.title = titleEl.textContent.trim()
        .split('\n')[0]
        .replace(/^.*[>»]\s*/, '')
        .trim();
    }

    // Get due date
    const pageText = document.body.innerText;
    const dueMatch = pageText.match(/DUE ON[:\s]+([^\n]+)/i);
    if (dueMatch) {
      data.pageContent.dueDate = dueMatch[1].trim();
    }

    // Get instructions - find the main content area
    const contentSelectors = [
      '.page-body',
      '.instructions',
      '.rich-text-content',
      '[class*="page-content"]',
      '[class*="assignment-content"]',
      'main',
    ];

    for (const selector of contentSelectors) {
      const el = document.querySelector(selector);
      if (el && el.innerText.length > 50) {
        data.pageContent.instructions = el.innerText
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 5000);
        break;
      }
    }

    // Extract all resource links
    const links = document.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.href || '';
      const text = link.textContent?.trim() || '';

      if (!href || href.includes('javascript:') || text.length < 2) continue;

      // Google Drive files
      if (href.includes('drive.google.com') || href.includes('docs.google.com')) {
        const fileId = href.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
        data.pageContent.resources.push({
          type: 'google_drive',
          name: text,
          url: href,
          fileId,
        });
      }
      // YouTube videos
      else if (href.includes('youtube.com') || href.includes('youtu.be')) {
        const videoId = href.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1];
        data.pageContent.resources.push({
          type: 'youtube',
          name: text,
          url: href,
          videoId,
        });
      }
      // Khan Academy
      else if (href.includes('khanacademy.org')) {
        data.pageContent.resources.push({
          type: 'khan_academy',
          name: text,
          url: href,
        });
      }
      // AP Classroom
      else if (href.includes('apclassroom') || href.includes('collegeboard')) {
        data.pageContent.resources.push({
          type: 'ap_classroom',
          name: text,
          url: href,
        });
      }
    }

    // Get embedded PDF attachments
    const attachments = document.querySelectorAll('tme-expandable-attachment');
    for (const att of attachments) {
      const name = att.textContent?.trim().substring(0, 100).replace(/\s+/g, ' ');
      const iframe = att.querySelector('iframe');

      data.pageContent.resources.push({
        type: 'embedded_pdf',
        name,
        iframeSrc: iframe?.src || iframe?.getAttribute('ng-src'),
      });
    }

    // Deduplicate resources by URL or name
    const seen = new Set();
    data.pageContent.resources = data.pageContent.resources.filter(r => {
      const key = r.url || r.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ============================================================
  // COMMON - Extract any visible resources
  // ============================================================
  if (!isAssignmentPage) {
    // Get Google Drive links visible on any page
    const driveLinks = document.querySelectorAll('a[href*="drive.google.com"], a[href*="docs.google.com"]');
    for (const link of driveLinks) {
      const fileId = link.href.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
      data.resources.push({
        type: 'google_drive',
        name: link.textContent?.trim(),
        url: link.href,
        fileId,
      });
    }

    // Get YouTube links
    const ytLinks = document.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]');
    for (const link of ytLinks) {
      const videoId = link.href.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1];
      data.resources.push({
        type: 'youtube',
        name: link.textContent?.trim(),
        url: link.href,
        videoId,
      });
    }
  }

  return data;
})();
