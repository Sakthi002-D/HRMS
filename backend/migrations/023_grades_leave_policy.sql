-- Employee grades and grade-based Annual Leave, plus the company leave limits.
-- Run manually, then restart the backend. Safe to run more than once.

BEGIN;

-- Grade already exists from 011_annual_leave_accrual.sql; kept here so this file works on its own.
-- No CHECK constraint: older rows may hold other grade names. The API only accepts the company grades.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS grade TEXT;

-- Annual Leave days per grade (company grading document).
-- Only filled when HR has not set any grade entitlements yet.
UPDATE leave_policy_settings
SET policy = jsonb_set(
        policy,
        '{annualLeave,grade_overrides}',
        '{"1-A":30,"1-B":30,"1-C":30,"1-D":30,
          "2-A":28,"2-B":28,"3-A":28,"3-B":28,
          "3-C":26,"4-A":26,"4-B":26,
          "4-C":24,"4-D":24,"5-A":24,"5-B":24,"5-C":24,
          "5-D":21,"6-A":21,"6-B":21,"6-D":21,"7-A":21,"8-A":21,"9-A":21}'::jsonb,
        true
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND COALESCE(policy->'annualLeave'->'grade_overrides', '{}'::jsonb) = '{}'::jsonb
  AND policy ? 'annualLeave';

-- Leave limits from the company document:
--   Sick 14 days/year, Casual 2 days/year, Compassionate/Bereavement 14 days paid,
--   Maternity 50 calendar days, Paternity 3 calendar days, Umrah 7 days unpaid, Hajj 14 days unpaid
UPDATE leave_policy_settings
SET policy = policy
        || jsonb_build_object(
            'sickLeave', COALESCE(policy->'sickLeave', '{}'::jsonb) || '{"yearlyDays": 14}'::jsonb,
            'bereavementLeave', COALESCE(policy->'bereavementLeave', '{}'::jsonb) || '{"immediateFamilyDays": 14, "pay": "Full Pay"}'::jsonb,
            'maternityLeave', COALESCE(policy->'maternityLeave', '{}'::jsonb) || '{"days": 50}'::jsonb,
            'paternityLeave', '{"days": 3, "pay": "Full Pay"}'::jsonb,
            'casualLeave', '{"days": 2, "pay": "Full Pay"}'::jsonb,
            'umrahLeave', '{"days": 7, "pay": "Unpaid"}'::jsonb,
            'hajjLeave', '{"days": 14, "pay": "Unpaid"}'::jsonb
        ),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

-- "Umrah Leave" is added to the leave types by the backend when it starts.

COMMIT;
