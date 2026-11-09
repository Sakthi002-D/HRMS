-- Resignation, first half after HR accepts: Serving Notice → Exit Clearance → Final Settlement.
-- Run once in one transaction. Safe to re-run: IF NOT EXISTS everywhere, and the seed only
-- fills settings that are missing. Nothing is dropped except the old status CHECK, which is
-- replaced by a wider one (every existing status stays valid).

BEGIN;

-- 1. Statuses: Pending <role>, Serving Notice, Exit Clearance, Final Settlement, Exit Formalities,
--    Completed, Rejected, Withdrawn ("Accepted" kept for old rows)
DO $$
DECLARE constraint_row record;
BEGIN
    FOR constraint_row IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.resignations'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE public.resignations DROP CONSTRAINT %I', constraint_row.conname);
    END LOOP;
END $$;

ALTER TABLE public.resignations
    ADD CONSTRAINT resignations_status_check CHECK (
        status LIKE 'Pending %'
        OR status IN ('Accepted', 'Serving Notice', 'Exit Clearance', 'Final Settlement', 'Exit Formalities', 'Completed', 'Rejected', 'Withdrawn')
    );

-- 2. HR acceptance remarks, notice period details and clearance dates
ALTER TABLE public.resignations
    ADD COLUMN IF NOT EXISTS hr_remarks TEXT,
    ADD COLUMN IF NOT EXISTS handover_notes TEXT,
    ADD COLUMN IF NOT EXISTS exit_main_reason TEXT,
    ADD COLUMN IF NOT EXISTS eligible_for_rehire BOOLEAN,
    ADD COLUMN IF NOT EXISTS exit_internal_notes TEXT,
    ADD COLUMN IF NOT EXISTS clearance_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS clearance_completed_at TIMESTAMPTZ;

-- 3. Exit clearance: one row per department (copied from Settings when clearance starts) ...
CREATE TABLE IF NOT EXISTS public.resignation_clearance_departments (
    id BIGSERIAL PRIMARY KEY,
    resignation_id BIGINT NOT NULL REFERENCES public.resignations(id) ON DELETE CASCADE,
    department_key TEXT NOT NULL,
    name TEXT NOT NULL,
    owner_ids TEXT[] NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (resignation_id, department_key)
);
CREATE INDEX IF NOT EXISTS resignation_clearance_departments_owner_idx
    ON public.resignation_clearance_departments USING GIN (owner_ids);

-- ... and one row per item. Status: Pending / Done (Returned for assets) / Deduct (with amount) / Not issued
CREATE TABLE IF NOT EXISTS public.resignation_clearance_items (
    id BIGSERIAL PRIMARY KEY,
    resignation_id BIGINT NOT NULL REFERENCES public.resignations(id) ON DELETE CASCADE,
    department_id BIGINT NOT NULL REFERENCES public.resignation_clearance_departments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('Asset', 'Task', 'Amount')),
    source TEXT NOT NULL DEFAULT 'settings',
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Done', 'Deduct', 'Not issued')),
    deduction_amount NUMERIC(12, 2) CHECK (deduction_amount IS NULL OR deduction_amount >= 0),
    remark TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT,
    updated_by_name TEXT,
    updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT resignation_clearance_items_deduct_amount CHECK (status <> 'Deduct' OR deduction_amount > 0)
);
CREATE INDEX IF NOT EXISTS resignation_clearance_items_resignation_idx
    ON public.resignation_clearance_items (resignation_id, department_id, sort_order);

-- 4. Settings seed
-- 4a. Workflow with only "HR (accepts)" gets Line Manager as step 1
UPDATE public.resignation_settings
SET settings = jsonb_set(settings, '{workflow}', '["LINE_MANAGER", "HR"]'::jsonb),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND (settings->'workflow' IS NULL OR settings->'workflow' = '["HR"]'::jsonb);

-- 4b. Exit clearance departments and items (only when none are saved yet)
UPDATE public.resignation_settings
SET settings = settings || jsonb_build_object('clearanceDepartments', '[
        {"id": "line_manager", "name": "Project / Line Manager", "ownerId": null, "useLineManager": true, "items": [
            {"id": "work_handover", "name": "Work handover", "type": "Task"},
            {"id": "site_tools", "name": "Site tools", "type": "Asset"},
            {"id": "ppe_kit", "name": "PPE kit", "type": "Asset"}]},
        {"id": "it", "name": "IT", "ownerId": null, "items": [
            {"id": "laptop", "name": "Laptop", "type": "Asset"},
            {"id": "mobile_sim", "name": "Mobile & SIM", "type": "Asset"},
            {"id": "system_access", "name": "System access disabled", "type": "Task"}]},
        {"id": "administration", "name": "Administration", "ownerId": null, "items": [
            {"id": "accommodation_key", "name": "Accommodation key", "type": "Asset"},
            {"id": "vehicle_fuel_card", "name": "Vehicle & fuel card", "type": "Asset"},
            {"id": "site_access_card", "name": "Site access card", "type": "Asset"}]},
        {"id": "finance", "name": "Finance", "ownerId": null, "items": [
            {"id": "loan_advance", "name": "Loan / advance recovered", "type": "Amount"},
            {"id": "petty_cash", "name": "Petty cash settled", "type": "Amount"}]},
        {"id": "hr", "name": "HR", "ownerId": null, "items": [
            {"id": "company_id_card", "name": "Company ID card", "type": "Asset"},
            {"id": "exit_interview", "name": "Exit interview", "type": "Task"}]}
    ]'::jsonb),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND NOT (settings ? 'clearanceDepartments');

COMMIT;
