-- Leave tracker: when HR approved/rejected a leave, and when the employee resumed duty
ALTER TABLE leaves
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resumed_on DATE;
