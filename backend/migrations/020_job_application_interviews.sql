-- Interviews scheduled by HR from Recruitment -> Job Applications.
-- The status "Interview Scheduled" needs no schema change (job_applications.status is VARCHAR(30)).

CREATE TABLE IF NOT EXISTS public.job_application_interviews (
    id BIGSERIAL PRIMARY KEY,
    application_db_id INTEGER NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
    interview_date DATE NOT NULL,
    interview_time TIME NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('In-person', 'Online', 'Phone')),
    location_or_link TEXT NOT NULL,
    interviewer_name TEXT NOT NULL,
    notes TEXT,
    email_sent_at TIMESTAMPTZ,
    email_error TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS job_application_interviews_app_idx`
ON public.job_application_interviews (application_db_id, created_at DESC);
