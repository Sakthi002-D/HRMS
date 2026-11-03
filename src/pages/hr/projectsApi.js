import API_URL from "../../config/api";
import { authHeaders } from "../../utils/auth";
import { formatAppDate } from "../../utils/appSettings";

export const PROJECT_STATUSES = ["Active", "Completed", "On Hold"];

export const projectsRequest = async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: authHeaders(options.body ? { "Content-Type": "application/json" } : {}),
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
};

export const formatProjectDate = (value) => (value ? formatAppDate(new Date(`${value}T00:00:00`)) : "");

export const todayKey = () => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
};

export const isCurrentAssignment = (assignment) => !assignment.assigned_to || assignment.assigned_to >= todayKey();

// Status is free text; known ones get a colour and a translated label
export const statusTone = (status) => String(status || "").trim().toLowerCase().replace(/[\s_-]+/g, "-");
export const projectStatusLabel = (t, status) => t(`projects.statuses.${statusTone(status).replace(/-/g, "_")}`, { defaultValue: status || "-" });
