-- Edit Job Opening: the required qualification is kept on the job opening itself,
-- so HR can change it without touching the approved MPR.
-- Existing jobs get NULL and keep showing the MPR's required_qualification
-- (the Careers page reads COALESCE(job, MPR)). Safe to run more than once.

BEGIN;

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS qualification TEXT;

COMMIT;
