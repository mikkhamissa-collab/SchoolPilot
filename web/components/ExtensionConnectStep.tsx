"use client";

// ExtensionConnectStep — replaces the old RemoteBrowser onboarding step.
//
// Three sub-states:
//   1. Not installed: show Add-to-Chrome button or sideload instructions.
//   2. Installed, not connected: prompt user to log in to Teamie in a new tab;
//      hand the Supabase JWT off to the extension and poll sync-status.
//   3. Connected: show data counts and a Continue button.
//
// We detect extension presence by calling `pingExtension()` repeatedly.
// We detect "connected" by polling `/api/agent/sync-status` for an
// lms_credentials row (cookies have been saved) and read data counts off
// `last_sync.data_extracted` (ingest has run).

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-client";
import {
  EXTENSION_ID,
  EXTENSION_WEBSTORE_URL,
  openTeamieTab,
  pingExtension,
  sendJwtToExtension,
} from "@/lib/extension";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type SubState = "not_installed" | "detected" | "connected";

interface SyncCounts {
  courses?: number;
  assignments?: number;
  grades?: number;
}

interface SyncStatusResponse {
  last_sync: {
    data_extracted?: Record<string, number> | null;
  } | null;
  credentials: { lms_type: string; last_login_success: boolean | null }[];
}

interface ExtensionConnectStepProps {
  onComplete: () => void;
  onError?: (msg: string) => void;
}

const SIDELOAD_PATH = "/Users/mikstartups/Desktop/SchoolPilot/extension/";

export default function ExtensionConnectStep({
  onComplete,
  onError,
}: ExtensionConnectStepProps) {
  const [subState, setSubState] = useState<SubState>("not_installed");
  const [counts, setCounts] = useState<SyncCounts>({});
  const [syncError, setSyncError] = useState<string>("");

  // Persist refs so the poll intervals never chase stale state
  const pollingInstallRef = useRef<number | null>(null);
  const pollingStatusRef = useRef<number | null>(null);
  const jwtSentRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  const extensionIdMissing = !EXTENSION_ID;

  // ---------------------------------------------------------------------------
  // Poll #1: is the extension installed?
  // ---------------------------------------------------------------------------
  const checkInstalled = useCallback(async (): Promise<boolean> => {
    const result = await pingExtension(600);
    return Boolean(result.ok);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollingInstallRef.current) {
        window.clearInterval(pollingInstallRef.current);
        pollingInstallRef.current = null;
      }
      if (pollingStatusRef.current) {
        window.clearInterval(pollingStatusRef.current);
        pollingStatusRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Start polling immediately on mount so the UI can advance without a click.
    if (subState !== "not_installed") return;
    if (extensionIdMissing) return; // pointless to poll without an ID

    let cancelled = false;

    const tick = async () => {
      const ok = await checkInstalled();
      if (cancelled || !mountedRef.current) return;
      if (ok) {
        setSubState("detected");
      }
    };

    // First immediate check, then every 1s for up to 30s.
    tick();
    let elapsed = 0;
    pollingInstallRef.current = window.setInterval(() => {
      elapsed += 1000;
      if (elapsed > 30_000) {
        if (pollingInstallRef.current) {
          window.clearInterval(pollingInstallRef.current);
          pollingInstallRef.current = null;
        }
        return;
      }
      tick();
    }, 1000);

    return () => {
      cancelled = true;
      if (pollingInstallRef.current) {
        window.clearInterval(pollingInstallRef.current);
        pollingInstallRef.current = null;
      }
    };
  }, [subState, extensionIdMissing, checkInstalled]);

  // ---------------------------------------------------------------------------
  // On entering "detected": send JWT to extension, then poll sync-status.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (subState !== "detected") return;

    let cancelled = false;

    const handoff = async () => {
      if (jwtSentRef.current) return;
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const jwt = session?.access_token;
        const userId = session?.user?.id;
        if (!jwt || !userId) return;
        const ok = await sendJwtToExtension(jwt, userId);
        if (ok) {
          jwtSentRef.current = true;
        } else if (onError) {
          onError(
            "We couldn't hand your session to the extension. Try refreshing the page."
          );
        }
      } catch {
        // swallow — user can retry
      }
    };

    const fetchStatus = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const jwt = session?.access_token;
        if (!jwt) return;
        const res = await fetch(`${API_URL}/api/agent/sync-status`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (!res.ok) return;
        const data: SyncStatusResponse = await res.json();
        if (cancelled || !mountedRef.current) return;

        const credsPresent = (data.credentials?.length ?? 0) > 0;
        const extracted = data.last_sync?.data_extracted || {};
        const anyCounts =
          (extracted["courses"] ?? 0) +
            (extracted["assignments"] ?? 0) +
            (extracted["grades"] ?? 0) >
          0;

        if (credsPresent || anyCounts) {
          setCounts({
            courses: extracted["courses"],
            assignments: extracted["assignments"],
            grades: extracted["grades"],
          });
          setSubState("connected");
        }
      } catch {
        // silent — keep polling
      }
    };

    handoff();
    fetchStatus();

    pollingStatusRef.current = window.setInterval(() => {
      fetchStatus();
    }, 3000);

    return () => {
      cancelled = true;
      if (pollingStatusRef.current) {
        window.clearInterval(pollingStatusRef.current);
        pollingStatusRef.current = null;
      }
    };
  }, [subState, onError]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleIveInstalled = useCallback(async () => {
    const ok = await checkInstalled();
    if (ok) {
      setSubState("detected");
    } else {
      setSyncError(
        "We still don't see the extension. Make sure it's enabled at chrome://extensions and the extension ID in your app matches."
      );
    }
  }, [checkInstalled]);

  const openWebStore = useCallback(() => {
    if (!EXTENSION_WEBSTORE_URL) return;
    if (typeof window !== "undefined") {
      window.open(EXTENSION_WEBSTORE_URL, "_blank", "noopener,noreferrer");
    }
  }, []);

  const openChromeExtensionsTab = useCallback(() => {
    if (typeof window !== "undefined") {
      // chrome:// URLs can't be opened from JS; we copy the path instead.
      window.open("https://www.google.com/chrome/", "_blank", "noopener,noreferrer");
    }
  }, []);

  const copySideloadPath = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(SIDELOAD_PATH);
    } catch {
      // ignore
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (subState === "connected") {
    const courseCount = counts.courses ?? 0;
    const assignmentCount = counts.assignments ?? 0;
    const gradeCount = counts.grades ?? 0;
    const totalTouched = courseCount + assignmentCount + gradeCount;

    return (
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-success/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-white font-semibold text-lg">You&apos;re connected to Teamie.</h2>
          {totalTouched > 0 ? (
            <p className="text-text-secondary text-sm">
              Found {courseCount} course{courseCount === 1 ? "" : "s"},{" "}
              {assignmentCount} assignment{assignmentCount === 1 ? "" : "s"},{" "}
              {gradeCount} grade{gradeCount === 1 ? "" : "s"}.
            </p>
          ) : (
            <p className="text-text-secondary text-sm">
              Session captured. Your first sync will finish in the background.
            </p>
          )}
        </div>

        <button
          onClick={onComplete}
          className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors cursor-pointer"
        >
          Continue
        </button>
      </div>
    );
  }

  if (subState === "detected") {
    return (
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/10 flex items-center justify-center">
            <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h2 className="text-white font-semibold text-lg">Great — extension detected.</h2>
          <p className="text-text-secondary text-sm">
            Now open Teamie and log in with your ASL Google account. We&apos;ll finish the rest.
          </p>
        </div>

        <button
          onClick={() => openTeamieTab()}
          className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors cursor-pointer"
        >
          Open Teamie
        </button>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-text-secondary text-sm">Waiting for first sync...</p>
        </div>

        {syncError && (
          <div className="p-3 rounded-lg bg-error/10 text-error text-sm">{syncError}</div>
        )}
      </div>
    );
  }

  // subState === "not_installed"
  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/10 flex items-center justify-center">
          <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
          </svg>
        </div>
        <h2 className="text-white font-semibold text-lg">Install the SchoolPilot extension</h2>
        <p className="text-text-secondary text-sm leading-relaxed">
          SchoolPilot uses a small Chrome extension to read your Teamie data.
          It runs in your browser, not our server — which means it works where
          server-side login gets blocked.
        </p>
      </div>

      {extensionIdMissing && (
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs">
          Extension ID not configured —{" "}
          <span className="text-text-secondary">
            sideload instructions below. (Set{" "}
            <code className="font-mono bg-bg/50 px-1 rounded">NEXT_PUBLIC_EXTENSION_ID</code> in{" "}
            <code className="font-mono bg-bg/50 px-1 rounded">.env.local</code> to auto-detect.)
          </span>
        </div>
      )}

      {EXTENSION_WEBSTORE_URL ? (
        <button
          onClick={openWebStore}
          className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors cursor-pointer"
        >
          Add to Chrome
        </button>
      ) : (
        <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
          <p className="text-white text-sm font-medium">Sideload for beta testers</p>
          <ol className="text-text-secondary text-sm space-y-2 list-decimal pl-5 leading-relaxed">
            <li>
              Open{" "}
              <button
                onClick={openChromeExtensionsTab}
                className="text-accent hover:underline cursor-pointer"
              >
                Chrome
              </button>{" "}
              and go to{" "}
              <code className="font-mono bg-bg px-1.5 py-0.5 rounded">chrome://extensions</code>.
            </li>
            <li>Turn on <strong className="text-white">Developer mode</strong> (top right).</li>
            <li>
              Click <strong className="text-white">Load unpacked</strong> and select:
              <div className="mt-1.5 flex items-center gap-2">
                <code className="font-mono bg-bg px-2 py-1 rounded text-xs break-all flex-1">
                  {SIDELOAD_PATH}
                </code>
                <button
                  onClick={copySideloadPath}
                  className="px-2 py-1 rounded bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors cursor-pointer shrink-0"
                >
                  Copy
                </button>
              </div>
            </li>
          </ol>
        </div>
      )}

      <button
        onClick={handleIveInstalled}
        className="w-full py-3 rounded-xl border border-border text-text-secondary hover:text-white hover:border-accent/50 transition-colors cursor-pointer"
      >
        I&apos;ve installed it
      </button>

      {syncError && (
        <div className="p-3 rounded-lg bg-error/10 text-error text-sm">{syncError}</div>
      )}
    </div>
  );
}
