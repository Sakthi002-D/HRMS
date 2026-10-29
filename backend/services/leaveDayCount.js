// Leave day count — single source of truth for every leave path (apply, approve,
// balance checks, Shelter Assistant).
//
// A leave day is a working day: Friday and Saturday (Qatar weekend) and the
// Qatar public holidays from leave_policy_settings.qatarHolidayCalendar are not counted.
//
// Holiday `date` formats understood (each holiday covers `days` consecutive days):
//   "2027-03-10"                 exact date (use this for Eid and other Islamic-calendar holidays)
//   "18 December"                same day every year
//   "Second Tuesday of February" n-th (or last) weekday of a month, every year
// Entries without a resolvable date (e.g. "Islamic calendar") are skipped.

import pool from "../db.js";

export const NO_WORKING_DAYS_MESSAGE = "No working days in selected range";
export const OVERLAPPING_LEAVE_MESSAGE = "You already have a leave request for those dates";

// 0 = Sunday … 5 = Friday, 6 = Saturday
const WEEKEND_DAYS = new Set([5, 6]);
const DAY_MS = 86_400_000;

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1 };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const toUtc = (key) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
};
const utcToKey = (utc) => new Date(utc).toISOString().slice(0, 10);

const isValidKey = (key) => DATE_KEY.test(key) && utcToKey(toUtc(key)) === key;

const monthIndex = (name) => MONTHS.indexOf(String(name).toLowerCase());

// Start dates (UTC ms) of one holiday entry in `year`, or [] when its date can't be resolved
const holidayStartsInYear = (dateText, year) => {
    const text = String(dateText ?? "").trim();
    if (isValidKey(text)) return Number(text.slice(0, 4)) === year ? [toUtc(text)] : [];

    let match = text.match(/^(\d{1,2})\s+([A-Za-z]+)$/) || text.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
    if (match) {
        const [day, monthName] = /^\d/.test(match[1]) ? [match[1], match[2]] : [match[2], match[1]];
        const month = monthIndex(monthName);
        const utc = Date.UTC(year, month, Number(day));
        return month >= 0 && new Date(utc).getUTCMonth() === month ? [utc] : [];
    }

    match = text.match(/^(\w+)\s+(\w+)\s+of\s+(\w+)$/i);
    if (match) {
        const ordinal = ORDINALS[match[1].toLowerCase()];
        const weekday = WEEKDAYS.indexOf(match[2].toLowerCase());
        const month = monthIndex(match[3]);
        if (!ordinal || weekday < 0 || month < 0) return [];
        const matches = [];
        for (let utc = Date.UTC(year, month, 1); new Date(utc).getUTCMonth() === month; utc += DAY_MS) {
            if (new Date(utc).getUTCDay() === weekday) matches.push(utc);
        }
        const pick = ordinal === -1 ? matches[matches.length - 1] : matches[ordinal - 1];
        return pick === undefined ? [] : [pick];
    }

    return [];
};

// Every holiday date (YYYY-MM-DD) that can fall between fromKey and toKey
export const resolveHolidayDates = (calendar, fromKey, toKey) => {
    const dates = new Set();
    if (!Array.isArray(calendar)) return dates;
    const fromYear = Number(fromKey.slice(0, 4));
    const toYear = Number(toKey.slice(0, 4));

    for (const holiday of calendar) {
        const span = Number.isInteger(Number(holiday?.days)) && Number(holiday.days) > 0 ? Number(holiday.days) : 1;
        // Start a year early so a multi-day holiday from late December still counts
        for (let year = fromYear - 1; year <= toYear; year++) {
            for (const start of holidayStartsInYear(holiday?.date, year)) {
                for (let offset = 0; offset < span; offset++) dates.add(utcToKey(start + offset * DAY_MS));
            }
        }
    }
    return dates;
};

// Working days from fromKey to toKey inclusive (both YYYY-MM-DD). Returns null for invalid input.
export const countLeaveWorkingDays = (fromKey, toKey, holidayCalendar = []) => {
    const from = String(fromKey ?? "").slice(0, 10);
    const to = String(toKey ?? "").slice(0, 10);
    if (!isValidKey(from) || !isValidKey(to) || to < from) return null;

    const holidays = resolveHolidayDates(holidayCalendar, from, to);
    let days = 0;
    for (let utc = toUtc(from); utc <= toUtc(to); utc += DAY_MS) {
        if (!WEEKEND_DAYS.has(new Date(utc).getUTCDay()) && !holidays.has(utcToKey(utc))) days++;
    }
    return days;
};

// Working days two date ranges share (0 when they only meet on weekends/holidays or not at all)
export const sharedWorkingDays = (fromA, toA, fromB, toB, holidayCalendar = []) => {
    const keys = [fromA, toA, fromB, toB].map((value) => String(value ?? "").slice(0, 10));
    const start = keys[0] > keys[2] ? keys[0] : keys[2];
    const end = keys[1] < keys[3] ? keys[1] : keys[3];
    return end < start ? 0 : countLeaveWorkingDays(start, end, holidayCalendar) ?? 0;
};

// The employee's first Approved or Pending leave sharing a working day with fromDate–toDate, or null
export async function findOverlappingLeave(employeeId, fromDate, toDate, db = pool) {
    const result = await db.query(
        `SELECT id, leave_type, status,
                TO_CHAR(from_date, 'YYYY-MM-DD') AS from_day,
                TO_CHAR(to_date, 'YYYY-MM-DD') AS to_day
         FROM leaves
         WHERE employee_id = $1
           AND LOWER(status) IN ('approved', 'pending')
           AND from_date <= $3::date
           AND to_date >= $2::date
         ORDER BY from_date, id`,
        [employeeId, fromDate, toDate]
    );
    if (!result.rows.length) return null;

    const calendar = await getHolidayCalendar(db);
    return result.rows.find((leave) =>
        sharedWorkingDays(fromDate, toDate, leave.from_day, leave.to_day, calendar) > 0
    ) || null;
}

export async function getHolidayCalendar(db = pool) {
    const result = await db.query("SELECT policy->'qatarHolidayCalendar' AS calendar FROM leave_policy_settings WHERE id = 1");
    const calendar = result.rows[0]?.calendar;
    return Array.isArray(calendar) ? calendar : [];
}

// { days } on success, or { error } when the range is invalid or has no working days
export async function calculateLeaveDays(fromDate, toDate, db = pool) {
    const days = countLeaveWorkingDays(fromDate, toDate, await getHolidayCalendar(db));
    if (days === null) return { error: "Invalid date range" };
    if (days === 0) return { error: NO_WORKING_DAYS_MESSAGE };
    return { days };
}
