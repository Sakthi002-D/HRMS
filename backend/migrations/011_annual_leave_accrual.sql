-- FRD SHELTER-HCM-LA-15-001: Annual Leave monthly accrual (days + amount)
-- Also applied automatically at backend startup (ensureAnnualLeaveAccrualSchema).

-- Grade (for per-grade entitlement overrides) and carry-forward opening balance
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS grade TEXT,
ADD COLUMN IF NOT EXISTS annual_leave_opening_days NUMERIC(6, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS annual_leave_accrual_ledger (
    id BIGSERIAL PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    accrual_month CHAR(7) NOT NULL,              -- YYYY-MM
    accrual_date DATE NOT NULL,                  -- day the service month completed
    days_accrued NUMERIC(6, 2) NOT NULL,         -- yearly entitlement ÷ 12
    salary_basis TEXT NOT NULL CHECK (salary_basis IN ('basic', 'total')),
    salary_amount NUMERIC(12, 2),                -- NULL when no payroll record exists
    amount_accrued NUMERIC(12, 2),               -- salary_amount ÷ 12
    posted_to_finance BOOLEAN NOT NULL DEFAULT FALSE,
    posted_at TIMESTAMPTZ,
    posting_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (employee_id, accrual_month)
);

CREATE INDEX IF NOT EXISTS annual_leave_accrual_ledger_month_idx
ON annual_leave_accrual_ledger (accrual_month);
