-- Recruitment → Hiring: interview result, offer letter (Accept / Decline link), pre-joining
-- checklist and Hire into Employees. Additive only: old applications, MPRs and employees keep
-- working unchanged (new columns are NULL / default). Safe to run more than once.
-- Needs 020_job_application_interviews.sql to have been run first.
--
-- New application statuses (job_applications.status is VARCHAR(30), no schema change):
--   Selected, Offer Sent, Offer Accepted, Offer Declined, Hired

BEGIN;

-- 1. Interview result per interview round (internal only: never shown or emailed to the candidate)
ALTER TABLE public.job_application_interviews
    ADD COLUMN IF NOT EXISTS result TEXT,                  -- Selected | Next round | On hold | Rejected
    ADD COLUMN IF NOT EXISTS feedback TEXT,
    ADD COLUMN IF NOT EXISTS reject_reason TEXT,
    ADD COLUMN IF NOT EXISTS result_by TEXT,
    ADD COLUMN IF NOT EXISTS result_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS result_email_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS result_email_error TEXT;

-- 2. Offer letters. token holds the SHA-256 hash of the link token (the link itself is only in the email).
CREATE TABLE IF NOT EXISTS public.job_offers (
    id BIGSERIAL PRIMARY KEY,
    application_db_id INTEGER NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
    salary NUMERIC(12, 2) NOT NULL CHECK (salary > 0),     -- monthly
    currency TEXT NOT NULL DEFAULT 'QAR',
    joining_date DATE NOT NULL,
    probation_months INTEGER NOT NULL CHECK (probation_months BETWEEN 1 AND 6),
    token TEXT NOT NULL UNIQUE,
    token_expires_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    email_error TEXT,
    response TEXT CHECK (response IN ('Accepted', 'Declined')),
    response_reason TEXT,
    responded_at TIMESTAMPTZ,
    responded_via TEXT CHECK (responded_via IN ('candidate', 'hr')),
    seen_by_hr BOOLEAN NOT NULL DEFAULT TRUE,              -- FALSE = candidate answered, HR hasn't opened it yet
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS job_offers_app_idx ON public.job_offers (application_db_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_offers_unseen_idx ON public.job_offers (application_db_id) WHERE NOT seen_by_hr;

-- 3. Pre-joining checklist + the employee created by "Mark as hired"
ALTER TABLE public.job_applications
    ADD COLUMN IF NOT EXISTS prejoining_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS hired_employee_id TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS hired_at TIMESTAMPTZ;

-- 4. Employees: salary and probation from the accepted offer. status stays 'Active' (login,
--    punch-in and headcount only accept Active). The D365 sync never reads or writes these columns.
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS probation_months INTEGER,
    ADD COLUMN IF NOT EXISTS probation_end_date DATE;

-- 5. MPR filled: the status stays 'Approved' (the headcount budget counts Approved MPRs)
ALTER TABLE manpower_requests
    ADD COLUMN IF NOT EXISTS filled_at TIMESTAMPTZ;

COMMIT;
