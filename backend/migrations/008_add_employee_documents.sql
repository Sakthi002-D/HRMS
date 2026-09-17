ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS employment_contract_url TEXT,
    ADD COLUMN IF NOT EXISTS offer_letter_url TEXT,
    ADD COLUMN IF NOT EXISTS visa_copy_url TEXT,
    ADD COLUMN IF NOT EXISTS qid_copy_url TEXT,
    ADD COLUMN IF NOT EXISTS passport_copy_url TEXT;
