-- Public Careers page → HR Recruitment → Job Applications
-- Also applied automatically at backend startup (ensureCareerSchema).

-- Candidate details captured by the Careers application form
ALTER TABLE public.job_applications
ADD COLUMN IF NOT EXISTS mpr_id BIGINT REFERENCES manpower_requests(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS gender TEXT,
ADD COLUMN IF NOT EXISTS nationality TEXT,
ADD COLUMN IF NOT EXISTS current_city TEXT,
ADD COLUMN IF NOT EXISTS current_country TEXT,
ADD COLUMN IF NOT EXISTS in_qatar BOOLEAN,
ADD COLUMN IF NOT EXISTS visa_status TEXT,
ADD COLUMN IF NOT EXISTS agency_id INTEGER REFERENCES recruitment_agencies(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS referrer TEXT,
ADD COLUMN IF NOT EXISTS experience_years INTEGER,
ADD COLUMN IF NOT EXISTS experience_months INTEGER,
ADD COLUMN IF NOT EXISTS current_salary NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS expected_salary NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS salary_currency TEXT,
ADD COLUMN IF NOT EXISTS employment_history JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS internships_projects TEXT,
ADD COLUMN IF NOT EXISTS cv_storage TEXT,              -- supabase (private bucket) | local (backend/uploads/cvs)
ADD COLUMN IF NOT EXISTS cv_path TEXT,                 -- never a public URL; served only to HR
ADD COLUMN IF NOT EXISTS cv_name TEXT,
ADD COLUMN IF NOT EXISTS cv_mime TEXT,
ADD COLUMN IF NOT EXISTS cv_size INTEGER,
ADD COLUMN IF NOT EXISTS submitted_via TEXT,           -- 'careers' for applications from the public Careers page
ADD COLUMN IF NOT EXISTS status_remark TEXT,
ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Already present in existing databases; deleted jobs are never shown on the Careers page
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- Statuses: New → Shortlisted / On Hold / Rejected (Hired / Joined still fill the job)
ALTER TABLE public.job_applications ALTER COLUMN status SET DEFAULT 'New';
UPDATE public.job_applications SET status = 'New' WHERE status IS NULL OR status = 'Applied';

-- One application per email per job (older duplicate rows are left as they are)
CREATE UNIQUE INDEX IF NOT EXISTS job_applications_job_email_unique_idx
ON public.job_applications (job_id, LOWER(email))
WHERE submitted_via = 'careers';

CREATE INDEX IF NOT EXISTS job_applications_job_idx ON public.job_applications (job_id);
CREATE INDEX IF NOT EXISTS job_applications_status_idx ON public.job_applications (status);

-- Tracking log
CREATE TABLE IF NOT EXISTS job_application_actions (
    id BIGSERIAL PRIMARY KEY,
    application_db_id INTEGER NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    actor_id TEXT,
    actor_name TEXT,
    remark TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS job_application_actions_app_idx ON job_application_actions (application_db_id, created_at);
