ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS legal_entity text DEFAULT 'SHLT',
    ADD COLUMN IF NOT EXISTS worker_type text DEFAULT 'Employee',
    ADD COLUMN IF NOT EXISTS employment_category text,
    ADD COLUMN IF NOT EXISTS project_role_id text,
    ADD COLUMN IF NOT EXISTS employment_end_date text DEFAULT 'Never',
    ADD COLUMN IF NOT EXISTS termination_reason text,
    ADD COLUMN IF NOT EXISTS last_date_worked text,
    ADD COLUMN IF NOT EXISTS position text,
    ADD COLUMN IF NOT EXISTS position_title text,
    ADD COLUMN IF NOT EXISTS assignment_start date,
    ADD COLUMN IF NOT EXISTS assignment_end date,
    ADD COLUMN IF NOT EXISTS make_primary boolean DEFAULT false;
