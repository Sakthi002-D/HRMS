-- MPR form: Application Start / End Date replace Grade and Required By.
-- Also applied automatically at backend startup (ensureManpowerSchema).
-- grade and required_by stay (nullable) so existing MPRs keep their data.

ALTER TABLE manpower_requests
ADD COLUMN IF NOT EXISTS application_start_date DATE,
ADD COLUMN IF NOT EXISTS application_end_date DATE;

-- Copied from the MPR on final approval; application_deadline (existing) = application end date
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS application_start_date DATE;
