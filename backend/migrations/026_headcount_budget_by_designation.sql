-- Headcount Budget by Grade → Position → Designation (no department).
-- Old department-only rows stay in the table but are no longer shown or used
-- (they have grade = NULL). Safe to run more than once.

BEGIN;

ALTER TABLE department_headcount_budgets
    ADD COLUMN IF NOT EXISTS grade TEXT,
    ADD COLUMN IF NOT EXISTS position TEXT,
    ADD COLUMN IF NOT EXISTS designation TEXT,
    ALTER COLUMN department DROP NOT NULL;

-- One line per year + grade + position + designation (case-insensitive); old rows excluded
CREATE UNIQUE INDEX IF NOT EXISTS department_headcount_budgets_line_idx
    ON department_headcount_budgets (year, LOWER(grade), LOWER(position), LOWER(designation))
    WHERE grade IS NOT NULL;

COMMIT;
