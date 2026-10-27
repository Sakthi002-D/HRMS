import API_URL from "../config/api";
import { getAuthToken } from "./auth";

// Workspace settings from HR Settings. The server is the source of truth; this copy lives in
// localStorage ("hrmsSettings") so synchronous helpers (dates, currency, timezone) can read it.
const STORAGE_KEY = "hrmsSettings";
export const SETTINGS_EVENT = "hrms-settings-changed";

export const DATE_FORMATS = ["DD-MM-YYYY", "MM-DD-YYYY", "YYYY-MM-DD"];
export const SESSION_TIMEOUTS = [15, 30, 60, 120, 240];

export const DEFAULT_SETTINGS = {
    companyName: "Shelter Group",
    supportEmail: "",
    timezone: "Asia/Qatar",
    currency: "QAR",
    currencySymbol: "QR",
    dateFormat: "DD-MM-YYYY",
    sessionTimeout: 30,
    emailNotifications: true,
    leaveNotifications: true,
};

export const getAppSettings = () => {
    try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
};

const cacheSettings = (settings) => {
    // Only known keys are kept, so the old per-browser fields (primaryColor, ...) disappear
    const clean = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).filter((key) => settings[key] !== undefined).map((key) => [key, settings[key]]));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    applyDocumentTitle();
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    return getAppSettings();
};

export const applyDocumentTitle = () => {
    document.title = `${getAppSettings().companyName} HRMS`;
};

const readError = async (response, fallback) => {
    const data = await response.json().catch(() => ({}));
    return data.message || fallback;
};

// Fetches the shared settings (any signed-in user) and refreshes the local copy
export const loadAppSettings = async () => {
    if (!getAuthToken()) return getAppSettings();
    const response = await fetch(`${API_URL}/api/settings/app`, { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response, "Unable to load settings"));
    const data = await response.json();
    return cacheSettings(data.settings || {});
};

// HR only. Resolves with the saved settings; rejects with the server's message.
export const saveAppSettings = async (settings) => {
    const response = await fetch(`${API_URL}/api/settings/app`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
    });
    if (!response.ok) throw new Error(await readError(response, "Unable to save settings"));
    const data = await response.json();
    return cacheSettings(data.settings || {});
};

const pad = (value) => String(value).padStart(2, "0");

const applyDateFormat = (parts) => {
    const format = DATE_FORMATS.includes(getAppSettings().dateFormat) ? getAppSettings().dateFormat : DATE_FORMATS[0];
    return format.replace(/DD|MM|YYYY/g, (token) => parts[token]);
};

// Formats a date value (YYYY-MM-DD string, ISO string or Date) with the HR date format setting.
// Pass a timeZone to read the calendar day in that zone instead of the browser's.
export const formatAppDate = (value, { empty = "—", timeZone } = {}) => {
    if (!value) return empty;
    const isDateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = value instanceof Date ? value : new Date(isDateOnly ? `${value}T00:00:00` : value);
    if (Number.isNaN(date.getTime())) return String(value);

    if (timeZone && !isDateOnly) {
        const zoned = Object.fromEntries(
            new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
                .formatToParts(date)
                .map((part) => [part.type, part.value])
        );
        return applyDateFormat({ DD: zoned.day, MM: zoned.month, YYYY: zoned.year });
    }
    return applyDateFormat({ DD: pad(date.getDate()), MM: pad(date.getMonth() + 1), YYYY: date.getFullYear() });
};

export const formatAppDateTime = (value, empty = "—") => {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return empty;
    return `${formatAppDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
