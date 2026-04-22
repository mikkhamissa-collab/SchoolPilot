// Thin POST helpers for the SchoolPilot backend.
// Callers pass jwt + backendUrl explicitly so this file stays side-effect free.

async function doPost({ url, jwt, body }) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });

  let parsed = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    body: parsed,
  };
}

export async function postCookies({ cookies, lmsUrl, jwt, backendUrl }) {
  const url = `${backendUrl}/api/auth/lms-cookies`;
  const res = await doPost({
    url,
    jwt,
    body: {
      lms_type: "teamie",
      lms_url: lmsUrl,
      cookies,
    },
  });

  // Essential debug output: lms_credentials has been empty for test users even
  // when this call appeared to succeed. Always log status + a response preview so
  // the service-worker console shows exactly why the row wasn't written.
  const preview = previewBody(res.body);
  if (res.ok) {
    console.info("[SchoolPilot] postCookies ->", res.status, preview);
  } else {
    console.error(
      "[SchoolPilot] postCookies FAILED",
      res.status,
      "url=", url,
      "jwt.len=", jwt ? jwt.length : 0,
      "cookies=", Array.isArray(cookies) ? cookies.length : 0,
      "body=", preview,
    );
  }
  return res;
}

function previewBody(body) {
  if (body == null) return "<empty>";
  try {
    const s = typeof body === "string" ? body : JSON.stringify(body);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return String(body).slice(0, 200);
  }
}

export async function postIngest({ payload, jwt, backendUrl }) {
  return await doPost({
    url: `${backendUrl}/api/sync/ingest`,
    jwt,
    body: payload,
  });
}
