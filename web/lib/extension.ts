// lib/extension.ts — Thin client-side module that talks to the SchoolPilot
// Chrome extension via `chrome.runtime.sendMessage` on the
// `externally_connectable` channel.
//
// All exports are SSR-safe (guarded by `typeof window !== "undefined"`) and
// every function swallows errors — this module NEVER throws.

export const EXTENSION_ID: string = process.env.NEXT_PUBLIC_EXTENSION_ID || "";

export const EXTENSION_WEBSTORE_URL: string =
  process.env.NEXT_PUBLIC_EXTENSION_WEBSTORE_URL || "";

export interface ExtensionPing {
  ok: boolean;
  version?: string;
}

type ChromeRuntime = {
  sendMessage?: (
    extensionId: string,
    message: unknown,
    callback?: (response: unknown) => void
  ) => void;
  lastError?: { message?: string };
};

type ChromeLike = { runtime?: ChromeRuntime };

function getChromeRuntime(): ChromeRuntime | null {
  if (typeof window === "undefined") return null;
  const chromeLike = (window as unknown as { chrome?: ChromeLike }).chrome;
  return chromeLike?.runtime ?? null;
}

/**
 * Ping the extension to check whether it is installed and responsive.
 * Returns `{ ok: false }` when:
 *   - SSR (no window)
 *   - `chrome.runtime.sendMessage` not available (non-Chromium or no extension)
 *   - `EXTENSION_ID` env var is empty
 *   - the call times out
 *   - the extension responds with no `ok` flag
 *
 * Resolves to `{ ok: true, version? }` when the extension responds.
 */
export async function pingExtension(timeoutMs = 500): Promise<ExtensionPing> {
  const runtime = getChromeRuntime();
  if (!runtime?.sendMessage) return { ok: false };
  if (!EXTENSION_ID) return { ok: false };

  return new Promise<ExtensionPing>((resolve) => {
    let settled = false;
    const finish = (result: ExtensionPing) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false }), timeoutMs);

    try {
      runtime.sendMessage!(EXTENSION_ID, { type: "PING" }, (response) => {
        clearTimeout(timer);
        // chrome.runtime.lastError is set when the extension isn't installed
        // or doesn't expose externally_connectable. Reading it prevents an
        // unchecked-runtime-error console warning.
        const lastError = runtime.lastError;
        if (lastError) {
          finish({ ok: false });
          return;
        }
        if (response && typeof response === "object") {
          const r = response as { ok?: boolean; version?: string };
          if (r.ok) {
            finish({ ok: true, version: r.version });
            return;
          }
        }
        finish({ ok: false });
      });
    } catch {
      clearTimeout(timer);
      finish({ ok: false });
    }
  });
}

/**
 * Send the user's Supabase JWT + user id to the extension so it can
 * authenticate against our backend. The extension persists this in its own
 * storage. Returns true on success, false otherwise. Never throws.
 */
export async function sendJwtToExtension(
  jwt: string,
  userId: string
): Promise<boolean> {
  const runtime = getChromeRuntime();
  if (!runtime?.sendMessage) return false;
  if (!EXTENSION_ID) return false;
  if (!jwt || !userId) return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => finish(false), 1500);

    try {
      runtime.sendMessage!(
        EXTENSION_ID,
        { type: "SET_JWT", jwt, userId },
        (response) => {
          clearTimeout(timer);
          const lastError = runtime.lastError;
          if (lastError) {
            finish(false);
            return;
          }
          if (response && typeof response === "object") {
            const r = response as { ok?: boolean };
            finish(Boolean(r.ok));
            return;
          }
          // Some extensions respond with a bare truthy value.
          finish(Boolean(response));
        }
      );
    } catch {
      clearTimeout(timer);
      finish(false);
    }
  });
}

/**
 * Open the Teamie LMS in a new tab. Called during onboarding after the
 * extension is detected — the user logs in, the extension captures cookies,
 * and we poll the backend for the first sync.
 */
export function openTeamieTab(lmsUrl = "https://lms.asl.org"): void {
  if (typeof window === "undefined") return;
  try {
    window.open(lmsUrl, "_blank", "noopener,noreferrer");
  } catch {
    // no-op — popup blockers can throw synchronously
  }
}
