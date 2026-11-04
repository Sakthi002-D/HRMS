-- MPR request types: add "Project Expansion" and "Temporary / Contract".
-- Safe to run more than once. Existing MPRs keep their stored workflow_steps.

BEGIN;

-- 1. Allow the two new request types
ALTER TABLE manpower_requests DROP CONSTRAINT IF EXISTS manpower_requests_request_type_check;
ALTER TABLE manpower_requests ADD CONSTRAINT manpower_requests_request_type_check
    CHECK (request_type IN ('Replacement', 'New Position', 'Project Expansion', 'Temporary / Contract'));

-- 2. Seed their approval steps (HR → COO/CTO → CEO) only where none exist yet;
--    keys already in settings.workflows win over the seed
UPDATE recruitment_settings
SET settings = jsonb_set(
        settings,
        '{workflows}',
        jsonb_build_object(
            'Project Expansion', '["HR", "EXEC", "CEO"]'::jsonb,
            'Temporary / Contract', '["HR", "EXEC", "CEO"]'::jsonb
        ) || COALESCE(settings -> 'workflows', '{}'::jsonb)
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND NOT (COALESCE(settings -> 'workflows', '{}'::jsonb) ?& ARRAY['Project Expansion', 'Temporary / Contract']);

COMMIT;
