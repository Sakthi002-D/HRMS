-- FRD SHELTER-HCM-SSP-20-001: Resignation Request
-- Also applied automatically at backend startup (ensureResignationSchema in services/resignationWorkflow.js).
-- Safe to re-run: creates only what is missing, never drops or alters existing tables.
-- Line Manager / Payroll are workflow roles in the existing workflow_role_assignments table (no schema change).

-- HR portal → Settings: notice period (default 30 days, overrides per grade / employment type)
-- and the approval chain (default Line Manager → HR). Single row.
CREATE TABLE IF NOT EXISTS resignation_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    settings JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO resignation_settings (id, settings)
VALUES (1, '{"noticePeriodDays": 30, "gradeOverrides": {}, "employmentTypeOverrides": {}, "workflow": ["LINE_MANAGER", "HR"]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS resignations (
    id BIGSERIAL PRIMARY KEY,
    resignation_no TEXT UNIQUE,
    employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    resignation_date DATE NOT NULL,
    notice_period_days INTEGER NOT NULL CHECK (notice_period_days >= 0),
    notice_period_source TEXT,
    calculated_last_working_day DATE NOT NULL,
    requested_last_working_day DATE NOT NULL,
    last_working_day DATE NOT NULL,
    early_release BOOLEAN NOT NULL DEFAULT FALSE,
    early_release_reason TEXT,
    reason_category TEXT NOT NULL,
    details TEXT NOT NULL,
    letter_url TEXT,
    letter_name TEXT,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL CHECK (status LIKE 'Pending %' OR status IN ('Accepted', 'Serving Notice', 'Completed', 'Rejected', 'Withdrawn')),
    workflow_steps JSONB NOT NULL,
    current_step INTEGER,
    rejection_reason TEXT,
    accepted_by TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Only one active resignation per employee
CREATE UNIQUE INDEX IF NOT EXISTS resignations_one_active_idx
ON resignations (employee_id) WHERE status NOT IN ('Rejected', 'Withdrawn', 'Completed');
CREATE INDEX IF NOT EXISTS resignations_status_idx ON resignations (status);

-- Tracking details log
CREATE TABLE IF NOT EXISTS resignation_actions (
    id BIGSERIAL PRIMARY KEY,
    resignation_id BIGINT NOT NULL REFERENCES resignations(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    step_role TEXT,
    actor_id TEXT,
    actor_name TEXT,
    remark TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS resignation_actions_resignation_idx ON resignation_actions (resignation_id, created_at);

-- HR list "Pending End of Service" (placeholder for the End of Service module)
CREATE TABLE IF NOT EXISTS end_of_service_queue (
    id BIGSERIAL PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    resignation_id BIGINT UNIQUE REFERENCES resignations(id) ON DELETE CASCADE,
    last_working_day DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS end_of_service_queue_status_idx ON end_of_service_queue (status);
