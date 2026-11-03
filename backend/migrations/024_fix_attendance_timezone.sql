-- Run ONCE in Supabase SQL Editor. Verify the SELECT preview first.
--
-- 024: move attendance saved in India time (IST, UTC+5:30) to Qatar time (AST, UTC+3).
--
-- What it does, for rows saved before the Qatar-time backend went live:
--   * punch_in / punch_out (TIME columns) move back 2 h 30 min (150 minutes)
--   * a punch-in before 02:30 IST happened before midnight in Qatar, so attendance_date moves back one day
--   * late_minutes and early_leave_minutes are recalculated with the backend's rules:
--       late  = punched in more than 10 minutes after the shift start (counted from the start)
--       early = punched out before the shift end
--     The shift comes from the row's saved shift_start / shift_end. Older rows without those use the
--     times in the row's shift text (e.g. "09:00 - 18:00"), else 09:00 - 18:00.
--   * status is not changed (late is a note only; status stays Present)
--
-- Safety:
--   * Runs exactly once: a row in hrms_one_time_fixes records it, and a second run changes nothing.
--   * If moving a row to the previous date would collide with another row for the same employee
--     and date, it stops with an error and changes nothing.
--   * All in one transaction.
--
-- CUTOFF: rows saved before this moment are treated as India time.
--   Default = the moment you run it. So: stop the backend, run this file, then start the backend
--   (the running backend keeps saving India time until it restarts with the Qatar-time code).
--   If the Qatar-time backend is ALREADY running, replace CURRENT_TIMESTAMP with the time it
--   started, in UTC, e.g. '2026-11-03 09:15:00+00'.
--   It needs attendance.created_at. If your attendance table has no created_at, set
--   v_max_id below instead (the largest attendance id saved in India time; find it with
--   SELECT MAX(id) FROM attendance; just before restarting the backend).
--
-- ============================== PREVIEW (run this first) ==============================
-- 1. Which columns does attendance have? (look for created_at)
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'attendance' ORDER BY ordinal_position;
--
-- 2. Rows that will change, old -> new (change the cutoff here too, or replace the
--    created_at condition with "a.id <= <your max id>"):
--
--   SELECT a.id, COALESCE(a.employee_id, a.personnel_number) AS employee,
--          a.attendance_date AS old_date, n.new_date,
--          a.punch_in AS old_in, n.new_in, a.punch_out AS old_out, n.new_out,
--          a.late_minutes AS old_late,
--          CASE WHEN n.new_in IS NULL OR f.f_in > 720 OR f.f_in <= 10 THEN 0 ELSE f.f_in END AS new_late,
--          a.early_leave_minutes AS old_early,
--          CASE WHEN n.new_out IS NULL OR f.f_out > 720 THEN 0 ELSE f.f_out END AS new_early
--   FROM attendance a
--   CROSS JOIN LATERAL (SELECT
--       CASE WHEN a.punch_in IS NOT NULL AND a.punch_in < TIME '02:30' THEN a.attendance_date - 1 ELSE a.attendance_date END AS new_date,
--       a.punch_in - INTERVAL '150 minutes' AS new_in,
--       a.punch_out - INTERVAL '150 minutes' AS new_out) n
--   CROSS JOIN LATERAL (SELECT
--       COALESCE(a.shift_start, substring(a.shift FROM '(\d{2}:\d{2})\s*-')::time, TIME '09:00') AS s_start,
--       COALESCE(a.shift_end, substring(a.shift FROM '-\s*(\d{2}:\d{2})')::time, TIME '18:00') AS s_end) s
--   CROSS JOIN LATERAL (SELECT
--       ((FLOOR(EXTRACT(EPOCH FROM n.new_in) / 60)::int - FLOOR(EXTRACT(EPOCH FROM s.s_start) / 60)::int) % 1440 + 1440) % 1440 AS f_in,
--       ((FLOOR(EXTRACT(EPOCH FROM s.s_end) / 60)::int - FLOOR(EXTRACT(EPOCH FROM n.new_out) / 60)::int) % 1440 + 1440) % 1440 AS f_out) f
--   WHERE (a.punch_in IS NOT NULL OR a.punch_out IS NOT NULL)
--     AND a.created_at < CURRENT_TIMESTAMP
--   ORDER BY a.attendance_date DESC, a.id DESC;
--
-- 3. Has it already been applied?
--
--   SELECT * FROM hrms_one_time_fixes WHERE name = '024_fix_attendance_timezone';
-- =======================================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS hrms_one_time_fixes (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rows_changed INTEGER NOT NULL DEFAULT 0
);

DO $fix$
DECLARE
    v_name CONSTANT TEXT := '024_fix_attendance_timezone';
    -- >>> When the Qatar-time backend went live (UTC); see CUTOFF above <<<
    v_cutoff CONSTANT TIMESTAMPTZ := CURRENT_TIMESTAMP;
    -- >>> Only if attendance has no created_at: the last attendance id saved in India time <<<
    v_max_id CONSTANT BIGINT := NULL;
    v_created_type TEXT;
    v_filter TEXT;
    v_conflicts TEXT;
    v_changed INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM hrms_one_time_fixes WHERE name = v_name) THEN
        RAISE NOTICE '% was already applied; nothing changed.', v_name;
        RETURN;
    END IF;

    SELECT data_type INTO v_created_type
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'attendance' AND column_name = 'created_at';

    IF v_max_id IS NOT NULL THEN
        v_filter := format('a.id <= %s', v_max_id);
    ELSIF v_created_type = 'timestamp with time zone' THEN
        v_filter := format('a.created_at < %L::timestamptz', v_cutoff);
    ELSIF v_created_type IS NOT NULL THEN
        -- created_at without a time zone: Supabase stores it in UTC
        v_filter := format('a.created_at < (%L::timestamptz AT TIME ZONE ''UTC'')', v_cutoff);
    ELSE
        RAISE EXCEPTION 'attendance has no created_at column. Set v_max_id in this file to the last attendance id saved in India time, then run again.';
    END IF;

    -- Old and new values for every row to fix
    EXECUTE format($sql$
        CREATE TEMP TABLE tz_fix ON COMMIT DROP AS
        SELECT a.id, a.employee_id, a.personnel_number, a.employment_legal_entity_id, a.employment_id,
               a.attendance_date AS old_date, n.new_date, n.new_in, n.new_out,
               CASE WHEN n.new_in IS NULL OR f.f_in > 720 OR f.f_in <= 10 THEN 0 ELSE f.f_in END AS new_late,
               CASE WHEN n.new_out IS NULL OR f.f_out > 720 THEN 0 ELSE f.f_out END AS new_early
        FROM attendance a
        CROSS JOIN LATERAL (SELECT
            CASE WHEN a.punch_in IS NOT NULL AND a.punch_in < TIME '02:30' THEN a.attendance_date - 1 ELSE a.attendance_date END AS new_date,
            a.punch_in - INTERVAL '150 minutes' AS new_in,
            a.punch_out - INTERVAL '150 minutes' AS new_out) n
        CROSS JOIN LATERAL (SELECT
            COALESCE(a.shift_start, substring(a.shift FROM '(\d{2}:\d{2})\s*-')::time, TIME '09:00') AS s_start,
            COALESCE(a.shift_end, substring(a.shift FROM '-\s*(\d{2}:\d{2})')::time, TIME '18:00') AS s_end) s
        CROSS JOIN LATERAL (SELECT
            ((FLOOR(EXTRACT(EPOCH FROM n.new_in) / 60)::int - FLOOR(EXTRACT(EPOCH FROM s.s_start) / 60)::int) %% 1440 + 1440) %% 1440 AS f_in,
            ((FLOOR(EXTRACT(EPOCH FROM s.s_end) / 60)::int - FLOOR(EXTRACT(EPOCH FROM n.new_out) / 60)::int) %% 1440 + 1440) %% 1440 AS f_out) f
        WHERE (a.punch_in IS NOT NULL OR a.punch_out IS NOT NULL) AND %s
    $sql$, v_filter);

    -- A row moving to the previous date must not land on a date the same person already has
    SELECT string_agg(format('attendance id %s -> %s (clashes with id %s)', t.id, t.new_date, other.id), '; ')
    INTO v_conflicts
    FROM tz_fix t
    JOIN attendance other
      ON other.id <> t.id
     AND other.attendance_date = t.new_date
     AND (
            (t.employee_id IS NOT NULL AND other.employee_id = t.employee_id)
         OR (t.employee_id IS NULL AND other.employee_id IS NULL
             AND other.personnel_number = t.personnel_number
             AND other.employment_legal_entity_id = t.employment_legal_entity_id
             AND other.employment_id = t.employment_id)
     )
    WHERE t.new_date <> t.old_date
      AND NOT EXISTS (SELECT 1 FROM tz_fix moved WHERE moved.id = other.id AND moved.new_date <> other.attendance_date);

    IF v_conflicts IS NOT NULL THEN
        RAISE EXCEPTION 'Nothing changed. These rows would end up on a date the employee already has: %', v_conflicts;
    END IF;

    UPDATE attendance a
    SET attendance_date = t.new_date,
        punch_in = t.new_in,
        punch_out = t.new_out,
        late_minutes = t.new_late,
        early_leave_minutes = t.new_early
    FROM tz_fix t
    WHERE a.id = t.id;
    GET DIAGNOSTICS v_changed = ROW_COUNT;

    INSERT INTO hrms_one_time_fixes (name, rows_changed) VALUES (v_name, v_changed);
    RAISE NOTICE '%: % attendance row(s) moved to Qatar time.', v_name, v_changed;
END
$fix$;

COMMIT;
