ALTER TABLE employee_experience
    ADD COLUMN IF NOT EXISTS department TEXT,
    ADD COLUMN IF NOT EXISTS employment_type TEXT,
    ADD COLUMN IF NOT EXISTS currently_working BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS company_location TEXT,
    ADD COLUMN IF NOT EXISTS job_description TEXT,
    ADD COLUMN IF NOT EXISTS responsibilities TEXT,
    ADD COLUMN IF NOT EXISTS skills TEXT,
    ADD COLUMN IF NOT EXISTS reason_for_leaving TEXT;
