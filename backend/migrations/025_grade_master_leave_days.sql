-- Grade Master: Annual Leave days are kept on each grade.
-- Run manually, then restart the backend. Safe to run more than once.
--
-- The grades table already has code, band (shown as the grade name), sort_order and active.
-- This adds leave_days and copies the days from Leave Policy (annualLeave.grade_overrides)
-- for grades that have none yet. Until this runs, the backend keeps reading grade_overrides.

BEGIN;

ALTER TABLE grades ADD COLUMN IF NOT EXISTS leave_days NUMERIC(5,1);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grades_leave_days_check') THEN
        ALTER TABLE grades ADD CONSTRAINT grades_leave_days_check CHECK (leave_days IS NULL OR (leave_days > 0 AND leave_days <= 365));
    END IF;
END $$;

UPDATE grades g
SET leave_days = (s.policy->'annualLeave'->'grade_overrides'->>g.code)::numeric
FROM leave_policy_settings s
WHERE s.id = 1
  AND g.leave_days IS NULL
  AND (s.policy->'annualLeave'->'grade_overrides'->>g.code) ~ '^[0-9]+(\.[0-9]+)?$'
  AND (s.policy->'annualLeave'->'grade_overrides'->>g.code)::numeric BETWEEN 0.5 AND 365;

COMMIT;
