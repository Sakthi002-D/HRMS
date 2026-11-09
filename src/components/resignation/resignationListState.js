// Stage cards and filters for the HR Resignations page (pure, no React).

export const RESIGNATION_CARDS = [
    { key: "pending-lm", label: "Pending Line Manager", statuses: ["Pending Line Manager", "Pending Department Head"] },
    { key: "pending-hr", label: "Pending HR", statuses: ["Pending HR"] },
    { key: "serving", label: "Serving Notice", statuses: ["Accepted", "Serving Notice"] },
    { key: "clearance", label: "Exit Clearance", statuses: ["Exit Clearance"] },
    { key: "settlement", label: "Final Settlement", statuses: ["Final Settlement"] },
    { key: "formalities", label: "Exit Formalities", statuses: ["Exit Formalities"] },
    { key: "completed", label: "Completed", statuses: ["Completed"] },
    { key: "closed", label: "Rejected / Withdrawn", statuses: ["Rejected", "Withdrawn"] },
];

export const RESIGNATION_STATUSES = [
    "Pending Line Manager",
    "Pending Department Head",
    "Pending HR",
    "Serving Notice",
    "Exit Clearance",
    "Final Settlement",
    "Exit Formalities",
    "Completed",
    "Rejected",
    "Withdrawn",
];

// "Days left" shows for these (red at 7 or fewer)
export const DAYS_LEFT_STATUSES = ["Accepted", "Serving Notice", "Exit Clearance"];
export const DAYS_LEFT_WARNING = 7;

export const EMPTY_FILTERS = { card: "", search: "", status: "", department: "", month: "" };

export function countByCard(rows) {
    return Object.fromEntries(
        RESIGNATION_CARDS.map((card) => [card.key, rows.filter((row) => card.statuses.includes(row.status)).length])
    );
}

// "Serving Notice" in the status filter also matches the legacy "Accepted" status
const statusMatches = (rowStatus, status) =>
    rowStatus === status || (status === "Serving Notice" && rowStatus === "Accepted");

export function filterResignations(rows, filters) {
    const card = RESIGNATION_CARDS.find((item) => item.key === filters.card);
    const search = filters.search.trim().toLowerCase();

    return rows
        .filter((row) => !card || card.statuses.includes(row.status))
        .filter((row) => !filters.status || statusMatches(row.status, filters.status))
        .filter((row) => !filters.department || row.department === filters.department)
        .filter((row) => !filters.month || String(row.resignation_date || "").startsWith(filters.month))
        .filter((row) => !search || [row.employee_name, row.employee_id].some((value) => String(value || "").toLowerCase().includes(search)))
        .sort((a, b) =>
            String(b.resignation_date).localeCompare(String(a.resignation_date))
            || String(b.created_at).localeCompare(String(a.created_at))
            || Number(b.id) - Number(a.id)
        );
}

export const departmentsOf = (rows) => [...new Set(rows.map((row) => row.department).filter(Boolean))].sort();
