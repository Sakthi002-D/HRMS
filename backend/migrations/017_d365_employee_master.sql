-- Stage 2: additive schema for D365 employee-master sync. No data is imported or changed.
-- employee_d365_mapping already has UNIQUE(identity) and UNIQUE(employee_id).
--
-- ROLLBACK (only if nothing depends on them):
--   DROP TABLE IF EXISTS d365_sync_audit;
--   DROP TABLE IF EXISTS d365_sync_runs;
--   ALTER TABLE employee_d365_mapping
--     DROP COLUMN IF EXISTS link_status, DROP COLUMN IF EXISTS d365_etag,
--     DROP COLUMN IF EXISTS source_hash, DROP COLUMN IF EXISTS last_synced_at;

ALTER TABLE employee_d365_mapping
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS source_hash TEXT,
ADD COLUMN IF NOT EXISTS d365_etag TEXT,
ADD COLUMN IF NOT EXISTS link_status TEXT NOT NULL DEFAULT 'linked';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_d365_mapping_link_status_ck') THEN
        ALTER TABLE employee_d365_mapping
        ADD CONSTRAINT employee_d365_mapping_link_status_ck
        CHECK (link_status IN ('linked', 'pending_review'));
    END IF;
END $$;

-- Counts only: no employee data
CREATE TABLE IF NOT EXISTS d365_sync_runs (
    id BIGSERIAL PRIMARY KEY,
    direction TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    fetched_count INTEGER NOT NULL DEFAULT 0,
    created_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    triggered_by TEXT
);

-- Field names only, never values
CREATE TABLE IF NOT EXISTS d365_sync_audit (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT REFERENCES d365_sync_runs(id) ON DELETE SET NULL,
    employee_id TEXT,
    action TEXT NOT NULL,
    changed_fields TEXT[],
    outcome TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS d365_sync_audit_run_idx ON d365_sync_audit(run_id);
