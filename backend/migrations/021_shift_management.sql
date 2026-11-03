-- Shift Management
-- Run manually BEFORE restarting the backend: punch in/out and the attendance list use these columns.
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 240),
    shift_type TEXT NOT NULL CHECK (shift_type IN ('standard', 'labour', 'summer', 'ramadan')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A shift that is still assigned to someone cannot be deleted (RESTRICT)
CREATE TABLE IF NOT EXISTS employee_shifts (
    id SERIAL PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON UPDATE CASCADE ON DELETE CASCADE,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS employee_shifts_employee_dates_idx
    ON employee_shifts (employee_id, effective_from);

-- Each attendance row keeps the shift it was punched against, so editing a shift later
-- does not change past attendance.
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS shift_start TIME;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS shift_end TIME;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS shift_work_minutes INTEGER;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS early_leave_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS break_minutes INTEGER DEFAULT 0;

-- Starting shifts. Employees without an assigned shift use "Standard".
INSERT INTO shifts (name, start_time, end_time, break_minutes, shift_type) VALUES
    ('Standard', '08:00', '17:30', 30, 'standard'),
    ('Labour', '07:00', '16:00', 30, 'labour'),
    ('Summer Evening', '18:00', '02:00', 0, 'summer'),
    ('Ramadan', '09:00', '14:00', 0, 'ramadan')
ON CONFLICT (name) DO NOTHING;

COMMIT;
