// web-auth.js — Content script that runs on schoolpilot.co to grab the auth token.
// When the user signs in on the website, this script reads the Supabase session
// from localStorage and stores it in chrome.storage for the extension to use.

(function() {
  let found = false;

  function extractToken() {
    if (found) return;
    try {
      // 1. Check for the explicit extension token (written by Sidebar component)
      const extToken = localStorage.getItem('schoolpilot_ext_token');
      if (extToken && extToken.startsWith('eyJ')) {
        chrome.storage.local.set({ webAuthToken: extToken });
        found = true;
        return;
      }

      // 2. Check for Supabase auth token (sb-<ref>-auth-token)
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.includes('auth-token')) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            const token = parsed?.access_token || parsed;
            if (typeof token === 'string' && token.startsWith('eyJ')) {
              chrome.storage.local.set({ webAuthToken: token });
              found = true;
              return;
            }
          } catch {
            if (typeof raw === 'string' && raw.startsWith('eyJ')) {
              chrome.storage.local.set({ webAuthToken: raw });
              found = true;
              return;
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Run immediately
  extractToken();

  // Retry several times (React/Next.js hydration can take a few seconds)
  setTimeout(extractToken, 1000);
  setTimeout(extractToken, 2500);
  setTimeout(extractToken, 5000);
  setTimeout(extractToken, 8000);

  // Also listen for localStorage changes (catches when Sidebar writes the token)
  window.addEventListener('storage', (e) => {
    if (e.key === 'schoolpilot_ext_token' && e.newValue) {
      if (!found && e.newValue.startsWith('eyJ')) {
        chrome.storage.local.set({ webAuthToken: e.newValue });
        found = true;
      }
    }
  });

  // MutationObserver fallback: when DOM changes (SPA navigation), re-check
  const observer = new MutationObserver(() => {
    if (!found) extractToken();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Stop observing after 15 seconds to avoid performance impact
  setTimeout(() => observer.disconnect(), 15000);
})();
