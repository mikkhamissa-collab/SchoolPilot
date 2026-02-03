"use client";

// This page passes the Supabase session token to the Chrome extension.
// User visits this page after signing in, and the extension reads the token.

import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";

export default function ExtensionAuthPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const passToken = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setStatus("error");
        return;
      }

      // Try to send to extension via chrome.runtime.sendMessage
      // If extension isn't installed, we'll show the token for manual copy
      try {
        // Store in localStorage so extension can read it via content script
        localStorage.setItem("schoolpilot_ext_token", session.access_token);
        setStatus("success");
      } catch {
        setStatus("error");
      }
    };
    passToken();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-dark">
      <div className="w-full max-w-sm p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">SchoolPilot Extension</h1>

        {status === "loading" && (
          <p className="text-text-secondary">Connecting...</p>
        )}

        {status === "success" && (
          <div>
            <div className="text-4xl mb-4">✅</div>
            <p className="text-success font-medium mb-2">Connected!</p>
            <p className="text-text-secondary text-sm">
              Your extension is now linked to your account. You can close this tab and use the
              &quot;Sync to schoolpilot.co&quot; button in the extension.
            </p>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="text-4xl mb-4">⚠️</div>
            <p className="text-error font-medium mb-2">Not signed in</p>
            <p className="text-text-secondary text-sm">
              Please <a href="/auth/login" className="text-accent hover:underline">sign in</a> first,
              then come back to this page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
