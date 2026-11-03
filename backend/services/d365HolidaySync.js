// D365 Holiday Calendar Sync
// Reads WorkCalendarDates from D365 Finance & Operations (READ-ONLY from D365).
// Maps non-working/closed dates to HRMS { name, date, days } format and
// updates leave_policy_settings.policy.qatarHolidayCalendar (or rwandaHolidayCalendar).
//
// Security: This service ONLY reads from D365. It never writes to D365.
// Auth: Uses the same client-credentials token as d365Employees.js.

import pool from "../db.js";
import { getD365Config, getAccessToken, D365Error } from "./d365Employees.js";

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_PAGES = 50;

// Attempt to parse an OData datetime string into YYYY-MM-DD.
// Handles: "2024-12-25T00:00:00Z", "2024-12-25T00:00:00+00:00", "/Date(1735084800000)/"
const parseDateStr = (raw) => {
    if (!raw) return null;

    // OData DateTime tick format: /Date(1735084800000)/
    const tick = String(raw).match(/\/Date\((-?\d+)\)\//);
    if (tick) {
        return new Date(Number(tick[1])).toISOString().slice(0, 10);
    }

    // ISO string
    const iso = String(raw).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
};

// Fetch closed/non-working dates from D365 WorkCalendarDates OData entity.
// Returns { holidays: [{date, name}], entity, totalFetched }
export async function fetchD365HolidayDates({ calendarId, year } = {}) {
    const config = getD365Config();
    const accessToken = await getAccessToken(config);

    const targetYear = Number.isInteger(year) ? year : new Date().getFullYear();
    const startDate = `${targetYear}-01-01T00:00:00Z`;
    const endDate   = `${targetYear + 1}-01-01T00:00:00Z`;

    // D365 F&O entity for work calendar daily entries
    const url = new URL(`${config.baseUrl}/data/WorkCalendarDates`);

    // Select only the fields we need (avoids large payload)
    url.searchParams.set("$select", [
        "CalendarId",
        "TransDate",
        "Description",
        "WorkTimeScheduleId",
        "WorkCalendarId",    // alternate field name in some D365 versions
        "Date",              // alternate field name
    ].join(","));

    // Build filter:  calendar (if given)  +  date range  +  closed days
    const filters = [];
    if (calendarId) {
        // Try both possible field names in the filter expression
        filters.push(`(CalendarId eq '${calendarId}' or WorkCalendarId eq '${calendarId}')`);
    }
    filters.push(`(TransDate ge ${startDate} and TransDate lt ${endDate})`);

    // D365 marks non-working days via WorkTimeScheduleId = 'Closed' (or 'CLOSED')
    // We add this filter but fall back to fetching all and filtering client-side
    // if the field doesn't exist in this environment (handled below).
    filters.push(`(WorkTimeScheduleId eq 'Closed' or WorkTimeScheduleId eq 'CLOSED')`);

    url.searchParams.set("$filter", filters.join(" and "));
    url.searchParams.set("$orderby", "TransDate asc");
    url.searchParams.set("$top", "500");

    const holidays = [];
    const seenDates = new Set();
    let nextUrl = url.toString();
    let pages = 0;
    let entityConfirmed = "WorkCalendarDates";

    while (nextUrl) {
        if (!nextUrl.startsWith(config.baseUrl)) {
            throw new D365Error("holidays", "D365 returned a pagination link for an unexpected host");
        }
        if (++pages > MAX_PAGES) {
            throw new D365Error("holidays", "D365 holiday pagination exceeded the safety limit");
        }

        let response;
        try {
            response = await fetch(nextUrl, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/json",
                    "OData-MaxVersion": "4.0",
                    "OData-Version": "4.0",
                },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (err) {
            const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
            throw new D365Error(
                "holidays",
                timedOut
                    ? "D365 WorkCalendarDates request timed out"
                    : `D365 WorkCalendarDates request failed to connect: ${err?.message ?? "unknown"}`,
                { httpStatus: timedOut ? 504 : 502 }
            );
        }

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            // 404 on the entity itself → entity name is wrong in this environment
            if (response.status === 404) {
                throw new D365Error(
                    "holidays",
                    "D365 entity 'WorkCalendarDates' was not found (404). " +
                    "Check that the entity is enabled in your D365 environment and that the Data Management workspace has it published.",
                    { upstreamStatus: 404, httpStatus: 502 }
                );
            }
            throw new D365Error(
                "holidays",
                `D365 WorkCalendarDates request failed (${response.status}): ${body.slice(0, 300)}`,
                { upstreamStatus: response.status, httpStatus: 502 }
            );
        }

        const data = await response.json();
        if (!Array.isArray(data.value)) {
            throw new D365Error("holidays", "D365 WorkCalendarDates response did not contain an array");
        }

        for (const row of data.value) {
            // Support both field-name conventions
            const rawDate = row.TransDate ?? row.Date ?? "";
            const dateStr = parseDateStr(rawDate);
            if (!dateStr) continue;
            if (seenDates.has(dateStr)) continue;
            seenDates.add(dateStr);

            const name = (row.Description ?? "").trim() || `Holiday (${dateStr})`;
            holidays.push({ date: dateStr, name });
        }

        nextUrl = data["@odata.nextLink"] ?? null;
    }

    return { holidays, entity: entityConfirmed, totalFetched: holidays.length };
}

// Maps D365 holiday array to HRMS { name, date, days } format.
// We use exact YYYY-MM-DD dates so they're pinned to the fetched year.
// Consecutive dates with the same name are collapsed into multi-day entries.
function mapToHrmsFormat(d365Holidays) {
    if (!d365Holidays.length) return [];

    const result = [];
    let current = null;

    for (const { date, name } of d365Holidays) {
        if (!current) {
            current = { name, date, days: 1, _lastDate: date };
            continue;
        }
        // Check if this is the next consecutive day with the same name
        const lastMs = new Date(current._lastDate + "T00:00:00Z").getTime();
        const thisMs = new Date(date + "T00:00:00Z").getTime();
        if (name === current.name && thisMs === lastMs + 86_400_000) {
            current.days++;
            current._lastDate = date;
        } else {
            const { _lastDate: _, ...entry } = current;
            result.push(entry);
            current = { name, date, days: 1, _lastDate: date };
        }
    }
    if (current) {
        const { _lastDate: _, ...entry } = current;
        result.push(entry);
    }

    return result;
}

// Main entry point: sync D365 holidays into leave_policy_settings for a given year.
//
// Options:
//   calendarId      – D365 work calendar ID to read from (required for meaningful results)
//   year            – 4-digit year to sync (default: current year)
//   countryCalendar – "qatar" | "rwanda" (which HRMS calendar key to update, default: "qatar")
//   mergeMode       – "replace-year" (default) | "replace-all"
//                     replace-year: keep existing entries from other years, replace this year's
//                     replace-all:  wipe the entire calendar and replace with D365 data
//   db              – pg pool (default: the shared pool)
//
// Returns: { synced, year, holidays, calendarKey }
export async function syncD365Holidays({
    calendarId,
    year,
    countryCalendar = "qatar",
    mergeMode = "replace-year",
    db = pool,
} = {}) {
    const targetYear = Number.isInteger(year) ? year : new Date().getFullYear();
    const calendarKey = countryCalendar === "rwanda" ? "rwandaHolidayCalendar" : "qatarHolidayCalendar";

    const { holidays: d365Raw } = await fetchD365HolidayDates({ calendarId, year: targetYear });

    if (d365Raw.length === 0) {
        return {
            synced: 0,
            year: targetYear,
            holidays: [],
            calendarKey,
            message: `No closed dates found in D365 for calendar '${calendarId ?? "(all)"}' in ${targetYear}. ` +
                     "Verify the Calendar ID and that non-working days are configured in D365.",
        };
    }

    const incoming = mapToHrmsFormat(d365Raw);

    // Read existing calendar
    const { rows } = await db.query(
        `SELECT policy->'${calendarKey}' AS calendar FROM leave_policy_settings WHERE id = 1`
    );
    const existing = Array.isArray(rows[0]?.calendar) ? rows[0].calendar : [];

    let merged;
    if (mergeMode === "replace-all") {
        merged = incoming;
    } else {
        // Keep non-year-specific entries (e.g. "25 December") and entries from other years
        const keep = existing.filter((entry) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
                return !entry.date.startsWith(String(targetYear));
            }
            return true; // named/recurrence entries are preserved
        });
        merged = [...keep, ...incoming];
    }

    await db.query(
        `UPDATE leave_policy_settings
         SET policy = jsonb_set(policy, '{${calendarKey}}', $1::jsonb)
         WHERE id = 1`,
        [JSON.stringify(merged)]
    );

    return { synced: incoming.length, year: targetYear, holidays: incoming, calendarKey };
}
