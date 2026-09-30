// Shared helpers for the Manpower Request (MPR) screens in the HR and Employee portals.

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function api(path, { method = "GET", body } = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        method,
        cache: "no-store",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
}

// Logged-in user's employee ID (HR portal or Employee portal session)
export const getSessionEmployeeId = () => {
    for (const key of ["loggedInHR", "loggedInEmployee"]) {
        try {
            const user = JSON.parse(sessionStorage.getItem(key) || "null");
            if (user?.employee_id) return user.employee_id;
        } catch {
            // ignore malformed session
        }
    }
    return null;
};

// Company currency: HR portal → Settings (saved in this browser) first, then the server copy
export const getCompanyCurrency = (serverCurrency = "") => {
    try {
        const settings = JSON.parse(localStorage.getItem("hrmsSettings") || "{}");
        if (settings.currency) return settings.currency;
    } catch {
        // ignore malformed settings
    }
    return serverCurrency || "";
};

export const formatMoney = (value) =>
    value === null || value === undefined || value === ""
        ? "—"
        : Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });

export const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatDateTime = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// Budget check result that needs a justification (exceeded, or no budget for the department + year)
export const isBudgetException = (budget) => ["exceeded", "no_budget"].includes(budget?.status);

// CSS modifier for an MPR / job status pill
export const statusTone = (status = "") => {
    const value = status.toLowerCase();
    if (value === "approved" || value === "closed") return "done";
    if (value.startsWith("pending")) return "pending";
    if (value === "sent back") return "warning";
    if (value === "rejected") return "danger";
    if (value === "cancelled") return "muted";
    if (value === "recruitment in progress") return "progress";
    if (value === "open") return "open";
    return "draft";
};

// The HR sidebar's Recruitment badge ("My Approvals" count) refetches on this event
export const MPRS_CHANGED_EVENT = "hr-mprs-changed";
export const notifyMprsChanged = () => window.dispatchEvent(new Event(MPRS_CHANGED_EVENT));
