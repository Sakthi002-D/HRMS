// Shared helpers for the Resignation screens (Employee portal and HR portal).
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
    if (status === "Completed") return "done";
    if (status === "Rejected") return "danger";
    return "muted";
};

export const isServingNotice = (resignation) => ["Accepted", "Serving Notice"].includes(resignation?.status);

export const daysLabel = (days) => `${days} day${Number(days) === 1 ? "" : "s"}`;

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
