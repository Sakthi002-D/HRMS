-- MPR form fields that were only kept in the browser until now.
-- project_name, project_code, required_qualification and required_joining_date already exist in
-- some databases (added by hand, not by a migration); IF NOT EXISTS leaves them as they are.
-- Old MPRs get NULL / FALSE and still open and save. Safe to run more than once.

BEGIN;

ALTER TABLE manpower_requests
    ADD COLUMN IF NOT EXISTS project_name TEXT,
    ADD COLUMN IF NOT EXISTS project_code TEXT,
    ADD COLUMN IF NOT EXISTS employee_category TEXT,
    ADD COLUMN IF NOT EXISTS position TEXT,
    ADD COLUMN IF NOT EXISTS designation TEXT,
    ADD COLUMN IF NOT EXISTS required_qualification TEXT,
    ADD COLUMN IF NOT EXISTS required_joining_date DATE,
    ADD COLUMN IF NOT EXISTS project_start_date DATE,
    ADD COLUMN IF NOT EXISTS deployment_timeline TEXT,
    ADD COLUMN IF NOT EXISTS shift_schedule TEXT,
    ADD COLUMN IF NOT EXISTS pay_basis TEXT,
    ADD COLUMN IF NOT EXISTS ppe_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
