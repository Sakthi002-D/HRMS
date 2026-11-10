// Shared helpers for the Resignation screens (Employee portal and HR portal).
import i18n from "i18next";
import { API_URL, api, formatDate, formatDateTime, getSessionEmployeeId } from "../recruitment/recruitmentApi";

export { api, formatDate, formatDateTime, getSessionEmployeeId };

export const REASON_CATEGORIES = ["Better opportunity", "Personal", "Relocation", "Higher studies", "Health", "Other"];
export const LETTER_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp";
export const LETTER_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
];
export const LETTER_MAX_BYTES = 5 * 1024 * 1024;

// multipart/form-data POST (resignation letter upload)
export async function postForm(path, formData) {
    const response = await fetch(`${API_URL}${path}`, { method: "POST", body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
}

// CSS modifier for a resignation status pill (mpr-status classes)
export const resignationTone = (status = "") => {
    if (status.startsWith("Pending ")) return "pending";
    if (status === "Accepted" || status === "Serving Notice") return "info";
    if (status === "Exit Clearance") return "warning";
    if (status === "Final Settlement" || status === "Exit Formalities") return "info";
    if (status === "Completed") return "done";
    if (status === "Rejected") return "danger";
    return "muted";
};

export const isServingNotice = (resignation) => ["Accepted", "Serving Notice"].includes(resignation?.status);
// HR accepted and the resignation is not finished yet (leave cut-off, last-working-day banner)
export const AFTER_ACCEPT_STATUSES = ["Accepted", "Serving Notice", "Exit Clearance", "Final Settlement", "Exit Formalities"];
export const isAfterAcceptance = (resignation) => AFTER_ACCEPT_STATUSES.includes(resignation?.status);

// ---------- 8-step progress: Request, Manager, HR, Notice, Clearance, Settlement, Exit, Resigned ----------
export const PROGRESS_STEPS = ["Request", "Manager", "HR", "Notice", "Clearance", "Settlement", "Exit", "Resigned"];
const STATUS_STEP = { "Pending HR": 2, Accepted: 3, "Serving Notice": 3, "Exit Clearance": 4, "Final Settlement": 5, "Exit Formalities": 6 };

// { current, stoppedAt }: steps before `current` are done; stoppedAt marks where it was rejected / withdrawn
export function resignationProgress(resignation) {
    const status = resignation?.status || "";
    if (status === "Completed") return { current: PROGRESS_STEPS.length };
    if (status.startsWith("Pending ")) return { current: STATUS_STEP[status] ?? 1 };
    if (STATUS_STEP[status] !== undefined) return { current: STATUS_STEP[status] };
    const actions = resignation?.actions || [];
    const did = (name) => actions.some((action) => action.action === name);
    let at;
    if (did("Exit clearance started")) at = 4;
    else if (did("Accepted")) at = 3;
    else if (status === "Rejected") at = actions.find((action) => action.action === "Rejected")?.step_role === "HR" ? 2 : 1;
    else at = did("Approved") || resignation?.workflow_steps?.[0] === "HR" ? 2 : 1;
    return { current: at, stoppedAt: at };
}

export const progressStepLabel = (step, index) => i18n.t(`resignation.progress.${index}`, { defaultValue: step });

// ---------- Exit clearance ----------
export const CLEARANCE_STATUSES = ["Pending", "Done", "Deduct", "Not issued"];
// "Done" reads "Returned" for assets
export const clearanceStatusLabel = (status, type) => {
    const english = status === "Done" ? (type === "Asset" ? "Returned" : "Done") : status;
    return i18n.t(`resignation.clearance.status.${valueKey(english)}`, { defaultValue: english });
};
export const clearanceTone = (status) => ({ Pending: "pending", Done: "done", Deduct: "danger", "Not issued": "muted" })[status] || "muted";
export const formatQar = (value) => `QAR ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const joinList = (names) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

// One short line per stage for the employee's tracker card
export function employeeStageLine(resignation) {
    const status = resignation?.status || "";
    const t = (key, defaultValue, values = {}) => i18n.t(`resignation.stageLine.${key}`, { ...values, defaultValue });
    if (status === "Pending Line Manager") return t("lineManager", "Waiting for your Line Manager");
    if (status === "Pending Department Head") return t("deptHead", "Waiting for your Department Head");
    if (status === "Pending HR") return t("hr", "Waiting for HR to accept your resignation");
    if (isServingNotice(resignation)) {
        return t("notice", "You're serving your notice. Hand over your work before {{date}}.", { date: ltrText(formatDate(resignation.last_working_day)) });
    }
    if (status === "Exit Clearance") {
        const lines = (resignation.clearance || []).map((department) => {
            const pending = department.items.filter((item) => item.status === "Pending");
            if (!pending.length) return null;
            const assets = pending.filter((item) => item.item_type === "Asset").map((item) => item.name);
            return assets.length
                ? t("returnTo", "Return your {{items}} to {{department}}", { items: joinList(assets), department: department.name })
                : t("waitingFor", "Waiting for {{department}} to clear you", { department: department.name });
        }).filter(Boolean);
        return lines.length ? `${lines.join(". ")}.` : t("cleared", "Every department has cleared you. HR will start your final settlement.");
    }
    if (status === "Final Settlement") {
        return resignation.settlement_status === "With Finance"
            ? t("settlementFinance", "Your final settlement is with Finance for approval")
            : t("settlement", "HR is preparing your final settlement");
    }
    if (status === "Exit Formalities") {
        return resignation.settlement?.net < 0
            ? t("exitRecover", "Settlement approved. HR is completing your exit formalities.")
            : t("exit", "Settlement approved – payment on its way. HR is completing your exit formalities.");
    }
    if (status === "Completed") return t("completed", "Your resignation is complete");
    return "";
}

// Settlement status for the employee: "With Finance", "Approved – payment on its way"
export const employeeSettlementLabel = (resignation) => {
    const status = resignation?.settlement_status;
    if (status === "Approved") {
        return resignation.settlement?.net < 0
            ? i18n.t("resignation.settlement.approvedRecover", { defaultValue: "Approved" })
            : i18n.t("resignation.settlement.approvedEmployee", { defaultValue: "Approved – payment on its way" });
    }
    if (status === "With Finance") return i18n.t("resignation.settlement.withFinance", { defaultValue: "With Finance" });
    if (resignation?.status === "Final Settlement") return i18n.t("resignation.settlement.preparing", { defaultValue: "Being prepared by HR" });
    return "";
};
export const settlementStatusLabel = (status) => (status ? i18n.t(`resignation.settlement.status.${valueKey(status)}`, { defaultValue: status }) : "");
export const settlementTone = (status) => ({ Draft: "muted", "With Finance": "pending", Returned: "danger", Approved: "done" })[status] || "muted";

// Date math on YYYY-MM-DD keys
const keyToUtc = (key) => {
    const [year, month, day] = String(key).slice(0, 10).split("-").map(Number);
    return Date.UTC(year, month - 1, day);
};
export const addDaysToKey = (key, days) => (key ? new Date(keyToUtc(key) + Number(days || 0) * 86400000).toISOString().slice(0, 10) : "");
export const daysBetweenKeys = (from, to) => Math.round((keyToUtc(to) - keyToUtc(from)) / 86400000);
export const initialsOf = (name = "") => String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "?";

// "30 days" (English) / "30 يومًا" (Arabic). Same English text as before.
export const daysLabel = (days) => i18n.t("resignation.days", { count: Number(days), defaultValue: `${days} day${Number(days) === 1 ? "" : "s"}` });

// Displayed text for saved English values. The saved value itself never changes.
const valueKey = (value) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
export const resignationStatusLabel = (status) => status ? i18n.t(`resignation.statuses.${valueKey(status)}`, { defaultValue: status }) : "";
export const reasonCategoryLabel = (reason) => reason ? i18n.t(`resignation.reasons.${valueKey(reason)}`, { defaultValue: reason }) : "";
export const resignationActionLabel = (action) => action ? i18n.t(`resignation.actions.${valueKey(action)}`, { defaultValue: action }) : "";
export const noticeSourceLabel = (source) => source ? i18n.t(`resignation.noticeSource.${valueKey(source)}`, { defaultValue: String(source) }) : "";
// Role keys exist only in ar.json, so English always shows the original label (fallback) unchanged
export const resignationRoleLabel = (role, fallback) => i18n.t(`resignation.roles.${role}`, { defaultValue: fallback || role || "" });

// A date or number inside a translated sentence keeps its left-to-right order on the Arabic page
// ("12 Oct 2026", "RES-2026-0011"). Invisible marks, so English looks exactly the same.
export const ltrText = (value) => (value ? `⁦${value}⁩` : value);

// Resignations waiting for HR action (HR sidebar badge, Dashboard welcome message)
export const isPendingHR = (resignation) => resignation?.status === "Pending HR";

// The HR sidebar badge refetches when a page reports a resignation change
export const RESIGNATIONS_CHANGED_EVENT = "hr-resignations-changed";
export const notifyResignationsChanged = () => window.dispatchEvent(new Event(RESIGNATIONS_CHANGED_EVENT));

export const getSessionHRId = () => {
    try {
        return JSON.parse(sessionStorage.getItem("loggedInHR") || "{}")?.employee_id || "";
    } catch {
        return "";
    }
};

// Resignation letter (private storage): the backend checks access and returns a signed URL valid
// for 10 minutes. The tab opens first (inside the click, so popup blockers allow it) and is pointed
// at the file once the URL arrives. Returns "" on success or the error message to show.
export async function openResignationLetter(resignationId) {
    const tab = window.open("", "_blank");
    try {
        const { url } = await api(`/api/resignations/${resignationId}/letter`);
        if (tab) {
            tab.opener = null;
            tab.location.href = url;
        } else {
            window.open(url, "_blank", "noopener");
        }
        return "";
    } catch (error) {
        tab?.close();
        return error.message || i18n.t("resignation.detail.letterError", { defaultValue: "The letter could not be opened." });
    }
}
