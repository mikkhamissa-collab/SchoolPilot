// web-auth.js — Content script that runs on schoolpilot.co to grab the auth token.
// When the user signs in on the website, this script reads the Supabase session
// from localStorage and stores it in chrome.storage for the extension to use.

(function() {
  // Check for Supabase auth token in localStorage
  function extractToken() {
    try {
      // Supabase stores session in localStorage with a key like sb-<ref>-auth-token
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.includes('auth-token') || key === 'schoolpilot_ext_token') {
          const raw = localStorage.getItem(key);
          if (!raw) continue;

          // If it's the explicit extension token
          if (key === 'schoolpilot_ext_token') {
            chrome.storage.local.set({ webAuthToken: raw });
            return;
          }

          // Parse Supabase session format
          try {
            const parsed = JSON.parse(raw);
            const token = parsed?.access_token || parsed;
            if (typeof token === 'string' && token.startsWith('eyJ')) {
              chrome.storage.local.set({ webAuthToken: token });
              return;
            }
          } catch {
            // Not JSON, try as plain token
            if (raw.startsWith('eyJ')) {
              chrome.storage.local.set({ webAuthToken: raw });
              return;
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Run on page load
  extractToken();

  // Also run after a delay (for SPA navigation)
  setTimeout(extractToken, 2000);
  setTimeout(extractToken, 5000);
})();
