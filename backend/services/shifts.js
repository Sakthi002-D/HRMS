// Shift Management: shift definitions, employee assignments, and late / early-leave rules.
//
// Times are minutes after midnight. A shift whose end is before its start (Summer Evening,
// 18:00 – 02:00) runs past midnight; its attendance stays on the day it started.

export const SHIFT_TYPES = ["standard", "labour", "summer", "ramadan"];
export const LATE_GRACE_MINUTES = 10;
const DAY = 24 * 60;
const RAMADAN_MIN_MINUTES = 4 * 60;
const RAMADAN_MAX_MINUTES = 5 * 60;

// "08:30", "08:30:00" or "08:30:15.123" -> 510; anything else -> null
export const toMinutes = (value) => {
    const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(value ?? "").trim());
    if (!match) return null;
    const [hours, minutes] = [Number(match[1]), Number(match[2])];
    return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
};

export const toTimeText = (minutes) =>
    `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// Length from start to end, going past midnight when needed (an equal start and end is 24 h)
export const spanMinutes = (start, end) => ((toMinutes(end) - toMinutes(start) + DAY) % DAY) || DAY;

export const workMinutes = (shift) => Math.max(0, spanMinutes(shift.start_time, shift.end_time) - Number(shift.break_minutes || 0));

export const shiftLabel = (shift) => `${shift.name} (${toTimeText(toMinutes(shift.start_time))} - ${toTimeText(toMinutes(shift.end_time))})`;

// Minutes from `from` forward to `to` on a 24-hour clock, or a negative number when `to`
// is up to 12 hours before `from`. Lets 01:00 count as "after" an 18:00 start.
const clockDifference = (from, to) => {
    const forward = (to - from + DAY) % DAY;
    return forward > DAY / 2 ? forward - DAY : forward;
};

// Late = punched in more than the grace period after the shift start; counted from the start
export const lateMinutes = (shift, punchIn) => {
    const start = toMinutes(shift?.start_time ?? shift?.shift_start);
    const punch = toMinutes(punchIn);
    if (start === null || punch === null) return 0;
    const after = clockDifference(start, punch);
    return after > LATE_GRACE_MINUTES ? after : 0;
};

// Early leave = punched out before the shift end
export const earlyLeaveMinutes = (shift, punchOut) => {
    const end = toMinutes(shift?.end_time ?? shift?.shift_end);
    const punch = toMinutes(punchOut);
    if (end === null || punch === null) return 0;
    const before = clockDifference(punch, end);
    return before > 0 ? before : 0;
};

// Returns { shift } with clean values, or { error }
export const validateShift = (input) => {
    const name = String(input?.name ?? "").trim();
    const shiftType = String(input?.shift_type ?? "").trim().toLowerCase();
    const start = toMinutes(input?.start_time);
    const breakMinutes = input?.break_minutes === "" || input?.break_minutes == null ? 0 : Number(input.break_minutes);

    if (!name || name.length > 80) return { error: "Shift name is required (up to 80 characters)" };
    if (!SHIFT_TYPES.includes(shiftType)) return { error: `Shift type must be one of: ${SHIFT_TYPES.join(", ")}` };
    if (start === null) return { error: "Start time must be HH:MM" };
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 240) {
        return { error: "Break must be a whole number of minutes between 0 and 240" };
    }

    // Ramadan is set as a start time plus a 4–5 hour length
    let end = toMinutes(input?.end_time);
    if (shiftType === "ramadan" && input?.duration_minutes != null && input.duration_minutes !== "") {
        const duration = Number(input.duration_minutes);
        if (!Number.isInteger(duration)) return { error: "Ramadan length must be a whole number of minutes" };
        end = (start + duration) % DAY;
    }
    if (end === null) return { error: "End time must be HH:MM" };

    const span = ((end - start + DAY) % DAY) || DAY;
    if (shiftType === "ramadan" && (span < RAMADAN_MIN_MINUTES || span > RAMADAN_MAX_MINUTES)) {
        return { error: "A Ramadan shift must be between 4 and 5 hours long" };
    }
    if (breakMinutes >= span) return { error: "Break must be shorter than the shift" };

    return { shift: { name, shift_type: shiftType, start_time: toTimeText(start), end_time: toTimeText(end), break_minutes: breakMinutes } };
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (value) => DATE_PATTERN.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
const addDays = (date, days) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const overlaps = (a, b) => a.effective_from <= (b.effective_to ?? "9999-12-31") && b.effective_from <= (a.effective_to ?? "9999-12-31");

/*
  Decides how a new assignment fits the employee's existing ones (dates are YYYY-MM-DD text).
  - A new shift with no end date replaces the one running on its start date (closed the day before).
  - A new shift with an end date (Ramadan, summer) pauses the running one: it is closed the day
    before and `reopen` continues it from the day after, so the employee goes back to their own shift.
  Any other overlap is refused so a day never has two shifts.
*/
export const planAssignment = (existing, input) => {
    const from = String(input?.effective_from ?? "").trim();
    const to = input?.effective_to ? String(input.effective_to).trim() : null;
    if (!isDate(from)) return { error: "Effective from must be a date (YYYY-MM-DD)" };
    if (to !== null && (!isDate(to) || to < from)) return { error: "Effective to must be a date on or after effective from" };

    const next = { effective_from: from, effective_to: to };
    const running = existing.find((row) => row.effective_from < from && (row.effective_to === null || row.effective_to >= from));
    const runsPastEnd = running && to !== null && (running.effective_to === null || running.effective_to > to);
    const close = running && (running.effective_to === null || runsPastEnd) ? running : null;
    const reopen = close && runsPastEnd
        ? { shift_id: close.shift_id, effective_from: addDays(to, 1), effective_to: close.effective_to }
        : null;

    const remaining = existing
        .filter((row) => row !== close)
        .concat(close ? [{ ...close, effective_to: addDays(from, -1) }] : [])
        .concat(reopen ? [reopen] : []);
    const conflict = remaining.find((row) => overlaps(row, next));
    if (conflict) {
        return { error: `Overlaps the shift assigned from ${conflict.effective_from}${conflict.effective_to ? ` to ${conflict.effective_to}` : ""}` };
    }

    return { assignment: next, close: close ? { id: close.id, effective_to: addDays(from, -1) } : null, reopen };
};

const SHIFT_COLUMNS = "s.id, s.name, TO_CHAR(s.start_time, 'HH24:MI') AS start_time, TO_CHAR(s.end_time, 'HH24:MI') AS end_time, s.break_minutes, s.shift_type";

// "Assigned" = on the shift today or from a future date; ended assignments are history
const COMPANY_TODAY = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Qatar')::date";
const NOT_ENDED = `(es.effective_to IS NULL OR es.effective_to >= ${COMPANY_TODAY})`;

export const listShifts = async (db) => (await db.query(
    `SELECT ${SHIFT_COLUMNS}, (SELECT COUNT(DISTINCT es.employee_id)::int FROM employee_shifts es WHERE es.shift_id = s.id AND ${NOT_ENDED}) AS assigned_employees
     FROM shifts s
     ORDER BY s.start_time, s.name`
)).rows;

export const listShiftEmployees = async (db, shiftId) => (await db.query(
    `SELECT es.id, es.employee_id, e.name, e.department,
            TO_CHAR(es.effective_from, 'YYYY-MM-DD') AS effective_from, TO_CHAR(es.effective_to, 'YYYY-MM-DD') AS effective_to,
            es.effective_from <= ${COMPANY_TODAY} AS is_current
     FROM employee_shifts es
     JOIN employees e ON e.employee_id = es.employee_id
     WHERE es.shift_id = $1 AND ${NOT_ENDED}
     ORDER BY es.effective_from, e.name`,
    [shiftId]
)).rows;

export const listEmployeeShifts = async (db, employeeId) => (await db.query(
    `SELECT es.id, es.shift_id, TO_CHAR(es.effective_from, 'YYYY-MM-DD') AS effective_from,
            TO_CHAR(es.effective_to, 'YYYY-MM-DD') AS effective_to, ${SHIFT_COLUMNS.replace("s.id, ", "")}
     FROM employee_shifts es
     JOIN shifts s ON s.id = es.shift_id
     WHERE es.employee_id = $1
     ORDER BY es.effective_from DESC`,
    [employeeId]
)).rows;

// The employee's shift on a date; without an assignment, the first Standard shift
export const getShiftForEmployee = async (db, employeeId, date) => {
    if (employeeId) {
        const assigned = await db.query(
            `SELECT ${SHIFT_COLUMNS}
             FROM employee_shifts es
             JOIN shifts s ON s.id = es.shift_id
             WHERE es.employee_id = $1
               AND es.effective_from <= $2::date
               AND (es.effective_to IS NULL OR es.effective_to >= $2::date)
             ORDER BY es.effective_from DESC
             LIMIT 1`,
            [employeeId, date]
        );
        if (assigned.rows.length) return assigned.rows[0];
    }
    const fallback = await db.query(`SELECT ${SHIFT_COLUMNS} FROM shifts s WHERE s.shift_type = 'standard' ORDER BY s.id LIMIT 1`);
    return fallback.rows[0] || null;
};

// D365 punches have no employee_id; their HRMS employee comes from the D365 link
export const findLinkedEmployeeId = async (db, personnelNumber, legalEntityId, employmentId) => (await db.query(
    `SELECT employee_id FROM employee_d365_mapping
     WHERE personnel_number = $1 AND employment_legal_entity_id = $2 AND employment_id = $3 AND link_status = 'linked'
     LIMIT 1`,
    [personnelNumber, legalEntityId, employmentId]
)).rows[0]?.employee_id ?? null;

// Values saved on an attendance row at punch in
export const shiftSnapshot = (shift, punchIn) => (shift
    ? {
        shift_id: shift.id,
        shift: shiftLabel(shift),
        shift_start: shift.start_time,
        shift_end: shift.end_time,
        shift_work_minutes: workMinutes(shift),
        break_minutes: Number(shift.break_minutes || 0),
        late_minutes: lateMinutes(shift, punchIn),
    }
    : { shift_id: null, shift: null, shift_start: null, shift_end: null, shift_work_minutes: null, break_minutes: 0, late_minutes: 0 });
