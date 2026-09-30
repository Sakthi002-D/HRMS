-- FRD SHELTER-HCM-RC-01-001: Manpower Request (MPR) workflow
-- Also applied automatically at backend startup (ensureManpowerSchema / ensureNotificationSchema).

-- In-app notifications (employee bell + HR dashboard bell)
CREATE TABLE IF NOT EXISTS hr_notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient_employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'general',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS hr_notifications_recipient_idx ON hr_notifications (recipient_employee_id, created_at DESC);

-- Settings → Approval Workflows (single row). Seeded by the backend with:
--   Replacement:  DEPT_HEAD → HR → EXEC → FINANCE → CEO
--   New Position: HR → FINANCE → EXEC → CEO
--   EXEC = CTO for IT, COO otherwise; department codes IT / FIN / HR
CREATE TABLE IF NOT EXISTS recruitment_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    settings JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Who holds each workflow role (department-scoped for Coordinator / Dept Head)
CREATE TABLE IF NOT EXISTS workflow_role_assignments (
    id BIGSERIAL PRIMARY KEY,
    role_key TEXT NOT NULL,
    department TEXT,
    employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_role_assignments_unique_idx
ON workflow_role_assignments (role_key, COALESCE(LOWER(department), ''), employee_id);

-- Masters
CREATE TABLE IF NOT EXISTS recruitment_locations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO recruitment_locations (name)
SELECT DISTINCT TRIM(location) FROM public.jobs WHERE COALESCE(TRIM(location), '') <> ''
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS recruitment_agencies (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS department_headcount_budgets (
    id SERIAL PRIMARY KEY,
    department TEXT NOT NULL,
    year INTEGER NOT NULL,
    headcount INTEGER NOT NULL CHECK (headcount >= 0),
    salary_budget NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (salary_budget >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS department_headcount_budgets_unique_idx
ON department_headcount_budgets (LOWER(department), year);

-- Manpower requests + tracking log
CREATE TABLE IF NOT EXISTS manpower_requests (
    id BIGSERIAL PRIMARY KEY,
    mpr_no TEXT UNIQUE,                               -- MPR-2026-0001
    request_type TEXT NOT NULL CHECK (request_type IN ('Replacement', 'New Position')),
    status TEXT NOT NULL DEFAULT 'Draft',             -- Draft | Pending <Role> | Sent Back | Rejected | Approved | Cancelled
    workflow_steps JSONB,                             -- snapshot at first submit, e.g. ["DEPT_HEAD","HR","CTO","FINANCE","CEO"]
    current_step INTEGER,
    resume_step INTEGER,                              -- step to resume at after Send Back
    title TEXT,
    department TEXT NOT NULL,
    openings INTEGER,
    experience TEXT,
    location TEXT,
    employment_type TEXT,
    job_description TEXT,
    skills TEXT,
    salary_min NUMERIC(12, 2),                        -- monthly
    salary_max NUMERIC(12, 2),
    currency TEXT,
    benefits JSONB NOT NULL DEFAULT '{}'::jsonb,      -- air_ticket, allowances, vehicle, medical_insurance_category, accommodation
    grade TEXT,
    required_by DATE,
    justification TEXT,
    assets JSONB NOT NULL DEFAULT '[]'::jsonb,
    asset_other TEXT,
    replaced_employee_id TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
    replacement_reason TEXT,
    budget_status TEXT,                               -- within | exception (New Position)
    budget_snapshot JSONB,
    requested_by TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
    job_id TEXT,                                      -- job opening created on final approval
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMPTZ,
    decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS manpower_requests_status_idx ON manpower_requests (status);

CREATE TABLE IF NOT EXISTS manpower_request_actions (
    id BIGSERIAL PRIMARY KEY,
    mpr_id BIGINT NOT NULL REFERENCES manpower_requests(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    step_role TEXT,
    actor_id TEXT,
    actor_name TEXT,
    remark TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS manpower_request_actions_mpr_idx ON manpower_request_actions (mpr_id, created_at);

-- Job openings: MPR link + recruitment plan (existing JOB001/JOB002 rows keep NULLs)
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS mpr_id BIGINT REFERENCES manpower_requests(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS request_type TEXT,
ADD COLUMN IF NOT EXISTS sourcing TEXT,
ADD COLUMN IF NOT EXISTS agency_id INTEGER REFERENCES recruitment_agencies(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS application_deadline DATE,
ADD COLUMN IF NOT EXISTS recruiter_employee_id TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS interview_panel JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
