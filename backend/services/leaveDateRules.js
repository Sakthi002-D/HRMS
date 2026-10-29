// Shared leave date rules for the leave-apply API and Shelter Assistant.
// "Today" is taken in the company timezone, not the server's.

export const COMPANY_TIMEZONE = process.env.COMPANY_TIMEZONE || "Asia/Qatar";

export const isValidTimeZone = (timeZone) => {
    if (!timeZone || typeof timeZone !== "string") return false;
    try {
        new Intl.DateTimeFormat("en-CA", { timeZone: timeZone.trim() });
        return true;
    } catch {
        return false;
    }
};

export const getAttendanceTimezone = async (db) => {
    if (process.env.COMPANY_TIMEZONE && isValidTimeZone(process.env.COMPANY_TIMEZONE)) {
        return process.env.COMPANY_TIMEZONE.trim();
    }
    if (db) {
        try {
            const result = await db.query("SELECT settings->>'timezone' AS tz FROM recruitment_settings WHERE id = 1");
            const tz = result.rows[0]?.tz;
            if (tz && isValidTimeZone(tz) && tz !== "Asia/Kolkata") {
                return tz.trim();
            }
        } catch {
            // fallback to default
        }
    }
    return COMPANY_TIMEZONE;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const getCompanyToday = () =>
    new Intl.DateTimeFormat("en-CA", {
        timeZone: COMPANY_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());

const isValidDateKey = (value) => {
    if (!DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

// Returns an error message, or null when the dates are valid.
export const validateLeaveDates = (fromDate, toDate) => {
    const from = String(fromDate || "").slice(0, 10);
    const to = String(toDate || "").slice(0, 10);

    if (!isValidDateKey(from) || !isValidDateKey(to)) {
        return "Invalid date format. Use YYYY-MM-DD.";
    }

    const today = getCompanyToday();

    if (from < today) {
        return `From Date cannot be in the past (today is ${today}).`;
    }

    if (to < from) {
        return "To Date must be on or after From Date.";
    }

    return null;
};
