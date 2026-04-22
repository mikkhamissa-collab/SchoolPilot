// Download assignment attachments as base64 blobs for backend ingestion.
// Skips files > MAX_BYTES. Never invents data — returns { ok: false, error } if no attachments found.

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const PER_SCRAPE_BUDGET = 50 * 1024 * 1024; // 50 MB total per scrape to avoid memory blowups

export async function scrapeAttachments({ assignments }) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { ok: true, data: [] };
  }

  const targets = [];
  for (const a of assignments) {
    if (!a.attachments || !Array.isArray(a.attachments)) continue;
    for (const f of a.attachments) {
      if (!f.url) continue;
      targets.push({ assignmentId: a.id, sourceUrl: absolutize(f.url), filename: f.filename, mimeType: f.mimeType, declaredSize: f.size });
    }
  }

  if (targets.length === 0) {
    return { ok: true, data: [] };
  }

  const results = [];
  let totalBytes = 0;

  for (const t of targets) {
    if (totalBytes >= PER_SCRAPE_BUDGET) {
      console.warn("[SchoolPilot] attachment budget exhausted, skipping remaining", targets.length - results.length);
      break;
    }
    const r = await fetchAsBase64(t.sourceUrl);
    if (!r.ok) {
      console.warn("[SchoolPilot] attachment fetch failed", t.sourceUrl, r.error);
      results.push({ ...t, error: r.error });
      continue;
    }
    if (r.size > MAX_BYTES) {
      console.warn("[SchoolPilot] attachment too large, skipping", t.sourceUrl, r.size);
      results.push({ ...t, error: `too-large:${r.size}` });
      continue;
    }
    totalBytes += r.size;
    results.push({
      assignmentId: t.assignmentId,
      sourceUrl: t.sourceUrl,
      filename: t.filename || r.filename || "attachment",
      mimeType: t.mimeType || r.mimeType || "application/octet-stream",
      size: r.size,
      contentBase64: r.base64,
    });
  }

  return { ok: true, data: results };
}

function absolutize(url) {
  try {
    return new URL(url, location.origin).toString();
  } catch {
    return url;
  }
}

async function fetchAsBase64(url) {
  let res;
  try {
    res = await fetch(url, { credentials: "include" });
  } catch (err) {
    return { ok: false, error: `fetch-failed: ${err.message}` };
  }
  if (!res.ok) {
    return { ok: false, error: `status-${res.status}` };
  }
  const mimeType = res.headers.get("content-type") || null;
  const cd = res.headers.get("content-disposition") || "";
  const filenameMatch = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  const filename = filenameMatch ? decodeURIComponent(filenameMatch[1].replace(/"/g, "")) : null;

  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  if (size > MAX_BYTES) {
    return { ok: true, size, base64: null, mimeType, filename, error: "size-exceeded" };
  }
  const base64 = arrayBufferToBase64(buf);
  return { ok: true, size, base64, mimeType, filename };
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
