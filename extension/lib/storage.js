// Typed wrappers over chrome.storage.local.
// Keys match the schema documented in manifest / README.

const KEYS = [
  "jwt",
  "userId",
  "backendUrl",
  "lastCookieHash",
  "lastCookiePostAt",
  "lastSyncAt",
  "lastSyncResult",
];

export async function getAll() {
  return await chrome.storage.local.get(KEYS);
}

export async function get(key) {
  const out = await chrome.storage.local.get([key]);
  return out[key];
}

export async function set(patch) {
  await chrome.storage.local.set(patch);
}

export async function clearAll() {
  await chrome.storage.local.remove(KEYS);
}

export async function getJwt() {
  return await get("jwt");
}

export async function getUserId() {
  return await get("userId");
}

export async function getBackendUrl() {
  const url = await get("backendUrl");
  return url || "https://schoolpilot-claw.onrender.com";
}

export async function setJwt({ jwt, userId }) {
  await set({ jwt, userId });
}

export async function recordSync(result) {
  await set({
    lastSyncAt: Date.now(),
    lastSyncResult: result,
  });
}

export async function recordCookiePost({ hash }) {
  await set({
    lastCookieHash: hash,
    lastCookiePostAt: Date.now(),
  });
}
