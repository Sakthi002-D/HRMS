CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    employee_id TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_resets_employee_id_idx
ON password_resets (employee_id, created_at DESC);