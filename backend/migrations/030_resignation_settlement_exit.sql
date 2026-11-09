-- Resignation, second half: Final Settlement → Exit Formalities → Completed.
-- Run once, after 029. Safe to re-run: IF NOT EXISTS columns, the settings seed only fills a
-- missing key. Nothing is dropped.

BEGIN;

ALTER TABLE public.resignations
    -- Final settlement: HR's manual rows (draft), the frozen figures sent to Finance, and the decision
    ADD COLUMN IF NOT EXISTS settlement_status TEXT
        CHECK (settlement_status IS NULL OR settlement_status IN ('Draft', 'With Finance', 'Returned', 'Approved')),
    ADD COLUMN IF NOT EXISTS settlement_manual JSONB NOT NULL DEFAULT '{"earnings": [], "deductions": []}'::jsonb,
    ADD COLUMN IF NOT EXISTS settlement JSONB,
    ADD COLUMN IF NOT EXISTS settlement_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS settlement_decided_by TEXT,
    ADD COLUMN IF NOT EXISTS settlement_decided_by_name TEXT,
    ADD COLUMN IF NOT EXISTS settlement_decided_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS settlement_remark TEXT,
    -- Exit formalities: { item_key: { done, not_applicable, by, by_name, at } }
    ADD COLUMN IF NOT EXISTS exit_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Generated letters: { experience_certificate: { issued_on, by_name, emailed }, relieving_letter: {...} }
    ADD COLUMN IF NOT EXISTS exit_documents JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS separated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS resignations_settlement_status_idx
    ON public.resignations (settlement_status) WHERE settlement_status IS NOT NULL;

-- Settings → Resignation → Final settlement (defaults: 21 gratuity days per year, 1 year minimum
-- service, leave encashment on basic salary)
UPDATE public.resignation_settings
SET settings = settings || jsonb_build_object('finalSettlement',
        '{"gratuityDaysPerYear": 21, "minServiceYears": 1, "leaveEncashmentBasis": "basic"}'::jsonb),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND NOT (settings ? 'finalSettlement');

COMMIT;
