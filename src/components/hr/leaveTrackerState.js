// =========================================================
// LEAVE TRACKER STATE
//
// Pure logic for the HR leave tracker. getTrackerState() takes a
// leave and "today" (YYYY-MM-DD in the company timezone) and returns
// every stage's state + label, so it can be tested without React.
// =========================================================

export const DEFAULT_COMPANY_TIMEZONE = "Asia/Kolkata";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const TRACKER_STAGES = [
    { key: "applied", label: "Applied" },
    { key: "review", label: "Under HR review" },
    { key: "approved", label: "Approved" },
    { key: "onLeave", label: "On leave" },
    { key: "resumed", label: "Resumed duty" },
];

// Timezone chosen in HR Settings (saved to localStorage by Settings.jsx)
export const getCompanyTimeZone = () => {
    try {
        const settings = JSON.parse(localStorage.getItem("hrmsSettings") || "{}");
        const timeZone = settings.timezone || DEFAULT_COMPANY_TIMEZONE;

        // Throws RangeError for an unknown zone
        new Intl.DateTimeFormat("en-CA", { timeZone });

        return timeZone;
    } catch {
        return DEFAULT_COMPANY_TIMEZONE;
    }
};

// Calendar date (YYYY-MM-DD) of a value as seen in the given timezone.
// Plain date strings are returned unchanged so DATE columns never shift.
export const toDateKey = (value, timeZone = getCompanyTimeZone()) => {
    if (!value) return null;

    if (typeof value === "string" && DATE_KEY_PATTERN.test(value)) {
        return value;
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return null;

    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
};

export const getCompanyToday = (timeZone = getCompanyTimeZone()) =>
    toDateKey(new Date(), timeZone);

const keyToUTC = (key) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
};

// Whole days from a to b (both YYYY-MM-DD)
export const daysBetween = (a, b) =>
    Math.round((keyToUTC(b) - keyToUTC(a)) / DAY_MS);

export const addDays = (key, amount) =>
    new Date(keyToUTC(key) + amount * DAY_MS).toISOString().slice(0, 10);

export const formatDateKey = (key) =>
    key
        ? new Date(keyToUTC(key)).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              timeZone: "UTC",
          })
        : null;

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

const pick = (leave, ...fields) => {
    for (const field of fields) {
        if (leave[field] !== undefined && leave[field] !== null && leave[field] !== "") {
            return leave[field];
        }
    }
    return null;
};

// =========================================================
// getTrackerState(leave, today)
//
// step.state: "completed" | "current" | "upcoming"
//             | "rejected" | "cancelled" | "overdue"
// =========================================================

export function getTrackerState(leave, today, { timeZone = getCompanyTimeZone() } = {}) {
    const todayKey = toDateKey(today, timeZone);
    const status = String(leave?.status || "Pending").toLowerCase();

    const fromKey = toDateKey(pick(leave, "fromDay", "from_day", "from_date", "fromDateRaw"), timeZone);
    const toKey = toDateKey(pick(leave, "toDay", "to_day", "to_date", "toDateRaw"), timeZone) || fromKey;
    const appliedKey = toDateKey(pick(leave, "appliedAt", "created_at"), timeZone);
    const reviewedKey = toDateKey(pick(leave, "reviewedAt", "reviewed_at"), timeZone);
    const resumedKey = toDateKey(pick(leave, "resumedOn", "resumed_on"), timeZone);
    const cancelledKey = toDateKey(pick(leave, "cancelledAt", "cancelled_at"), timeZone);
    const cancelledBy = pick(leave, "cancelledBy", "cancelled_by");

    const totalDays =
        Number(leave?.days) ||
        (fromKey && toKey ? daysBetween(fromKey, toKey) + 1 : 0);

    const steps = TRACKER_STAGES.map((stage) => ({
        key: stage.key,
        label: stage.label,
        state: "upcoming",
        caption: null,
        date: null,
    }));
    const step = Object.fromEntries(steps.map((item) => [item.key, item]));

    const leaveRange =
        fromKey === toKey
            ? formatDateKey(fromKey)
            : `${formatDateKey(fromKey)} – ${formatDateKey(toKey)}`;

    // Upcoming captions shared by pending/approved flows
    const describeUpcomingLeave = () => {
        if (fromKey && todayKey < fromKey) {
            step.onLeave.caption = `Starts in ${plural(daysBetween(todayKey, fromKey), "day")}`;
        }
        if (toKey && todayKey <= toKey) {
            step.resumed.caption = `Expected ${formatDateKey(addDays(toKey, 1))}`;
        }
    };

    // Applied: always done once the request exists
    step.applied.state = "completed";
    step.applied.date = formatDateKey(appliedKey);

    let headline;
    let tone;
    let canMarkResumed = false;

    if (status === "rejected") {
        step.review.state = "completed";
        step.review.date = formatDateKey(reviewedKey);
        step.approved.state = "rejected";
        step.approved.label = "Rejected";
        step.approved.date = formatDateKey(reviewedKey);

        headline = "Rejected by HR";
        tone = "rejected";
    } else if (status === "cancelled") {
        // Where was it stopped? Pending → review node. Approved → the
        // stage that was next when it was cancelled.
        let stopKey = "review";

        if (reviewedKey) {
            const at = cancelledKey || todayKey;
            stopKey = toKey && at > toKey ? "resumed" : "onLeave";
        }

        const stopIndex = steps.findIndex((item) => item.key === stopKey);

        steps.forEach((item, index) => {
            if (index > 0 && index < stopIndex) item.state = "completed";
        });
        if (reviewedKey) {
            step.review.date = formatDateKey(reviewedKey);
            step.approved.date = formatDateKey(reviewedKey);
        }

        step[stopKey].state = "cancelled";
        step[stopKey].label = cancelledBy ? `Cancelled by ${cancelledBy}` : "Cancelled";
        step[stopKey].date = formatDateKey(cancelledKey);

        headline = cancelledBy ? `Cancelled by ${cancelledBy}` : "Cancelled";
        tone = "cancelled";
    } else if (status === "approved") {
        step.review.state = "completed";
        step.review.date = formatDateKey(reviewedKey);
        step.approved.state = "completed";
        step.approved.date = formatDateKey(reviewedKey);

        if (resumedKey) {
            step.onLeave.state = "completed";
            step.onLeave.date = leaveRange;
            step.resumed.state = "completed";
            step.resumed.date = formatDateKey(resumedKey);

            headline = `Resumed duty on ${formatDateKey(resumedKey)}`;
            tone = "completed";
        } else if (!fromKey || todayKey < fromKey) {
            describeUpcomingLeave();

            const startsIn = fromKey ? daysBetween(todayKey, fromKey) : null;
            headline = startsIn
                ? `Approved – leave starts in ${plural(startsIn, "day")}`
                : "Approved";
            tone = "completed";
        } else if (todayKey <= toKey) {
            // Only count leave days that have passed, capped at the total
            const dayNumber = Math.min(daysBetween(fromKey, todayKey) + 1, totalDays);

            step.onLeave.state = "current";
            step.onLeave.caption = `Day ${dayNumber} of ${totalDays}`;
            describeUpcomingLeave();

            headline = `On leave – Day ${dayNumber} of ${totalDays}`;
            tone = "current";
        } else {
            step.onLeave.state = "completed";
            step.onLeave.date = leaveRange;
            canMarkResumed = true;

            // Expected back the day after to_date
            const overdueDays = daysBetween(toKey, todayKey) - 1;

            if (overdueDays <= 0) {
                step.resumed.state = "current";
                step.resumed.caption = "Expected today";

                headline = "Leave ended – return expected today";
                tone = "current";
            } else {
                step.resumed.state = "overdue";
                step.resumed.caption = `Not resumed – ${plural(overdueDays, "day")} overdue`;

                headline = `Not resumed – ${plural(overdueDays, "day")} overdue`;
                tone = "overdue";
            }
        }
    } else {
        // Pending (or any unknown status)
        step.review.state = "current";
        step.review.caption = "Awaiting decision";
        describeUpcomingLeave();

        headline = "Under HR review";
        tone = "current";
    }

    return { steps, headline, tone, canMarkResumed, today: todayKey, leaveEnd: toKey };
}
