// Display helpers for job applications (HR Recruitment → Job Applications)
import i18n from "i18next";
import { formatMoney, recruitmentValueLabel } from "./recruitmentApi";

export const APPLICATION_STATUSES = ["New", "Shortlisted", "On Hold", "Rejected"];
export const CANDIDATE_TYPES = ["Fresher", "Experienced"];
export const SOURCE_OPTIONS = ["Company website", "LinkedIn", "NaukriGulf", "Recruitment agency", "Employee referral", "Other"];

export const experienceText = (row) => {
    if (row.candidate_type === "Fresher") return recruitmentValueLabel("candidateType", "Fresher");
    if (row.experience_years !== null && row.experience_years !== undefined) {
        const years = Number(row.experience_years);
        const months = Number(row.experience_months || 0);
        return [
            i18n.t("recruitment.applications.years", { count: years, defaultValue: `${years} yr${years === 1 ? "" : "s"}` }),
            months ? i18n.t("recruitment.applications.months", { count: months, defaultValue: `${months} mo${months === 1 ? "" : "s"}` }) : "",
        ].filter(Boolean).join(" ");
    }
    return row.total_experience || "—";
};

// Numeric salary (Careers applications) or the free-text legacy value
export const salaryText = (amount, currency, legacy) =>
    amount !== null && amount !== undefined ? `${currency || ""} ${formatMoney(amount)}`.trim() : legacy || "—";

export const sourceText = (row) => {
    if (!row.source) return "—";
    if (row.source === "Recruitment agency") {
        return row.agency_name
            ? i18n.t("recruitment.applications.agencySource", { name: row.agency_name, defaultValue: "Agency: {{name}}" })
            : recruitmentValueLabel("source", "Recruitment agency");
    }
    if (row.source === "Employee referral") {
        return row.referrer
            ? i18n.t("recruitment.applications.referralSource", { name: row.referrer, defaultValue: "Referral: {{name}}" })
            : recruitmentValueLabel("source", "Employee referral");
    }
    return recruitmentValueLabel("source", row.source);
};

export const monthText = (value) => {
    if (!value) return i18n.t("recruitment.applications.present", { defaultValue: "Present" });
    const date = new Date(`${value}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};
