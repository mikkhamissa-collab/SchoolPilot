-- 2026-04-17 — add encrypted_session_cookies column for Chrome-extension cookie capture
--
-- The extension POSTs the student's authenticated teamie cookies to
-- /api/auth/lms-cookies. We store them Fernet-encrypted so the Playwright
-- sync can replay the session without any Google SSO / password flow.
--
-- Also relax NOT NULL on encrypted_username / encrypted_password — cookie-only
-- onboarding is now a valid flow and we never capture credentials for it.

ALTER TABLE lms_credentials
  ADD COLUMN IF NOT EXISTS encrypted_session_cookies TEXT,
  ADD COLUMN IF NOT EXISTS cookies_updated_at TIMESTAMPTZ;

ALTER TABLE lms_credentials
  ALTER COLUMN encrypted_username DROP NOT NULL,
  ALTER COLUMN encrypted_password DROP NOT NULL;
