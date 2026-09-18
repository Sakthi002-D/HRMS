-- employee_payroll already exists in this Supabase project.
-- Add only the columns required by the Payroll page.
ALTER TABLE employee_payroll
    ADD COLUMN IF NOT EXISTS salary_month DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS allowances NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deductions NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS net_salary NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS employee_payroll_month_idx ON employee_payroll (salary_month);
