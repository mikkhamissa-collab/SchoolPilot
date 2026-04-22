-- 2026-04-22 — Drop legacy encrypted_cookies column from lms_credentials.
--
-- Context (P0.2 of LAUNCH-ROADMAP.md):
--   The Chrome-extension flow writes to `encrypted_session_cookies`, but the
--   scheduler's HTTP-sync path used to read from the legacy `encrypted_cookies`
--   column. That mismatch is why no user has successfully synced since the
--   extension pivot — the freshest cookies sat unused while the scheduler
--   pinged a 3-week-old cookie blob and wrote `last_error = "Session expired"`.
--
-- What this migration does:
--   1. Back-fills `encrypted_session_cookies` from the legacy column for any
--      row that only has the legacy value. (As of 2026-04-22 no such rows
--      exist in prod, but the guard is cheap.)
--   2. Back-fills `cookies_updated_at` from `last_login_at` where it's NULL
--      and the new column is being back-filled, so the freshness check in
--      _pick_session_cookies() still makes sense for migrated rows.
--   3. Drops the `encrypted_cookies` column.
--
-- Pre-req: backend code must already read `encrypted_session_cookies`
-- (commits landing with this migration). Otherwise the scheduler will break
-- the moment this runs.
--
-- Rollback: `ALTER TABLE lms_credentials ADD COLUMN encrypted_cookies TEXT;`
-- (Data in the dropped column is NOT recoverable — make sure you are OK.)

BEGIN;

UPDATE lms_credentials
SET
  encrypted_session_cookies = encrypted_cookies,
  cookies_updated_at = COALESCE(cookies_updated_at, last_login_at)
WHERE encrypted_session_cookies IS NULL
  AND encrypted_cookies IS NOT NULL;

ALTER TABLE lms_credentials
  DROP COLUMN IF EXISTS encrypted_cookies;

-- Clear the stale "Session expired (ping)" error that was written by the
-- old ping code against the legacy column. Any remaining `last_error`
-- rows after this migration are from real failures.
UPDATE lms_credentials
SET last_error = NULL
WHERE last_error = 'Session expired (ping)'
  AND encrypted_session_cookies IS NOT NULL
  AND cookies_updated_at > now() - interval '3 days';

COMMIT;
