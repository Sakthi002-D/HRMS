// Display helpers for job applications (HR Recruitment → Job Applications)
import { formatMoney } from "./recruitmentApi";

export const APPLICATION_STATUSES = ["New", "Shortlisted", "On Hold", "Rejected"];
export const CANDIDATE_TYPES = ["Fresher", "Experienced"];
export const SOURCE_OPTIONS = ["Company website", "LinkedIn", "NaukriGulf", "Recruitment agency", "Employee referral", "Other"];

export const experienceText = (row) => {
    if (row.candidate_type === "Fresher") return "Fresher";
    if (row.experience_years !== null && row.experience_years !== undefined) {
        const years = Number(row.experience_years);
        const months = Number(row.experience_months || 0);
        return [`${years} yr${years === 1 ? "" : "s"}`, months ? `${months} mo${months === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
    }
    return row.total_experience || "—";
};

// Numeric salary (Careers applications) or the free-text legacy value
export const salaryText = (amount, currency, legacy) =>
    amount !== null && amount !== undefined ? `${currency || ""} ${formatMoney(amount)}`.trim() : legacy || "—";

export const sourceText = (row) => {
    if (!row.source) return "—";
    if (row.source === "Recruitment agency") return row.agency_name ? `Agency: ${row.agency_name}` : "Recruitment agency";
    if (row.source === "Employee referral") return row.referrer ? `Referral: ${row.referrer}` : "Employee referral";
    return row.source;
};

export const monthText = (value) => {
    if (!value) return "Present";
    const date = new Date(`${value}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};
