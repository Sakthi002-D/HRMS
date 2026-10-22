-- Employee portal credentials are separate from HR credentials and the employee master record.
ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS auth_credential_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.employee_logins (
    employee_id TEXT PRIMARY KEY
        REFERENCES public.employees(employee_id) ON DELETE CASCADE ON UPDATE CASCADE,
    username TEXT NOT NULL,
    personnel_number TEXT NOT NULL UNIQUE,
    normalized_username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    credential_version INTEGER NOT NULL DEFAULT 0,
    provision_run_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT employee_logins_username_normalized
        CHECK (normalized_username = LOWER(BTRIM(username))),
    CONSTRAINT employee_logins_username_format
        CHECK (username = 'EMP' || personnel_number
          AND personnel_number ~ '^[A-Za-z0-9-]+$'
          AND UPPER(personnel_number) NOT LIKE 'EMP%'),
    CONSTRAINT employee_logins_bcrypt_hash
        CHECK (password_hash ~ '^[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}$'),
    CONSTRAINT employee_logins_credential_version_nonnegative
        CHECK (credential_version >= 0)
);

ALTER TABLE public.password_resets
    ADD COLUMN IF NOT EXISTS credential_type TEXT NOT NULL DEFAULT 'hr';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'password_resets_credential_type_check'
    ) THEN
        ALTER TABLE public.password_resets
            ADD CONSTRAINT password_resets_credential_type_check
            CHECK (credential_type IN ('hr', 'employee'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS employee_logins_enabled_idx
    ON public.employee_logins (employee_id) WHERE enabled = TRUE;
