-- Migration 002: Drop dead tables from v1/v2 that have 0 rows and no code references.
-- Run AFTER verifying these tables are empty in production.
--
-- Tables kept (still referenced by code):
--   courses, grades — used by frontend grade calculator
--   scraped_assignments — referenced by legacy sync route (web/app/api/sync/route.ts)
--
-- Tables dropped:
--   study_guides — replaced by study_content
--   sprints — never implemented
--   sync_metrics — never instrumented
--   grade_snapshots — never instrumented
--   user_events — never instrumented

DROP TABLE IF EXISTS public.study_guides CASCADE;
DROP TABLE IF EXISTS public.sprints CASCADE;
DROP TABLE IF EXISTS public.sync_metrics CASCADE;
DROP TABLE IF EXISTS public.grade_snapshots CASCADE;
DROP TABLE IF EXISTS public.user_events CASCADE;
