CREATE TABLE IF NOT EXISTS employee_requests (
    id BIGSERIAL PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    request_type TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    hr_response TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS employee_requests_employee_id_idx ON employee_requests(employee_id);
CREATE INDEX IF NOT EXISTS employee_requests_status_idx ON employee_requests(status);
