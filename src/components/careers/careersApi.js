// Public Careers page helpers (no login). Validation mirrors
// backend/services/careerApplications.js → validateApplication.
import API_URL from "../../config/api";

export async function careersApi(path) {
    const response = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.message || "Something went wrong. Please try again.");
        error.status = response.status;
        throw error;
    }
    return data;
}

// multipart: "application" (JSON) + "cv" (file) + "website" (honeypot)
export async function submitApplication(jobId, application, cv, honeypot) {
    const body = new FormData();
    body.append("application", JSON.stringify(application));
    body.append("website", honeypot || "");
    body.append("cv", cv);
    const response = await fetch(`${API_URL}/api/careers/jobs/${encodeURIComponent(jobId)}/apply`, { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.message || "Your application could not be submitted. Please try again.");
        error.status = response.status;
        error.fields = data.fields || null;
        throw error;
    }
    return data;
}

export const formatJobDate = (value) => {
    if (!value) return "";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const splitSkills = (skills) =>
    String(skills || "")
        .split(/[,\n;]/)
        .map((skill) => skill.trim())
        .filter(Boolean);

export const CV_ACCEPT = ".pdf,.doc,.docx";
export const CV_EXTENSIONS = ["pdf", "doc", "docx"];
export const CV_MAX_BYTES = 5 * 1024 * 1024;

export const PHONE_CODES = [
    ["+974", "Qatar"], ["+971", "UAE"], ["+966", "Saudi Arabia"], ["+965", "Kuwait"], ["+968", "Oman"], ["+973", "Bahrain"],
    ["+91", "India"], ["+92", "Pakistan"], ["+880", "Bangladesh"], ["+94", "Sri Lanka"], ["+977", "Nepal"], ["+63", "Philippines"],
    ["+20", "Egypt"], ["+962", "Jordan"], ["+961", "Lebanon"], ["+963", "Syria"], ["+90", "Turkey"], ["+212", "Morocco"],
    ["+216", "Tunisia"], ["+254", "Kenya"], ["+234", "Nigeria"], ["+27", "South Africa"], ["+44", "United Kingdom"],
    ["+1", "USA / Canada"], ["+61", "Australia"], ["+49", "Germany"], ["+33", "France"], ["+60", "Malaysia"],
    ["+62", "Indonesia"], ["+65", "Singapore"], ["+86", "China"],
];

export const COUNTRIES = [
    "Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahrain", "Bangladesh",
    "Belarus", "Belgium", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Brazil", "Bulgaria", "Cambodia", "Cameroon", "Canada",
    "Chile", "China", "Colombia", "Croatia", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Ecuador", "Egypt", "Eritrea",
    "Estonia", "Ethiopia", "Finland", "France", "Georgia", "Germany", "Ghana", "Greece", "Hungary", "India", "Indonesia", "Iran",
    "Iraq", "Ireland", "Italy", "Ivory Coast", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Kyrgyzstan", "Latvia",
    "Lebanon", "Libya", "Lithuania", "Malaysia", "Maldives", "Mauritania", "Mexico", "Moldova", "Mongolia", "Morocco", "Myanmar",
    "Nepal", "Netherlands", "New Zealand", "Nigeria", "North Macedonia", "Norway", "Oman", "Pakistan", "Palestine", "Peru",
    "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saudi Arabia", "Senegal", "Serbia",
    "Singapore", "Slovakia", "Somalia", "South Africa", "South Korea", "Spain", "Sri Lanka", "Sudan", "Sweden", "Switzerland",
    "Syria", "Tajikistan", "Tanzania", "Thailand", "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine",
    "United Arab Emirates", "United Kingdom", "United States", "Uzbekistan", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const LINKEDIN_PATTERN =/^https?:\/\/([a-z0-9-]+\.)*linkedin\.com(\/\S*)?$/i;

const yearsBetween = (fromKey, toKey) => {
    const [fy, fm, fd] = fromKey.split("-").map(Number);
    const [ty, tm, td] = toKey.split("-").map(Number);
    return ty - fy - (tm < fm || (tm === fm && td < fd) ? 1 : 0);
};

export function validateCv(file) {
    if (!file) return "Upload your CV/Resume";
    const extension = file.name.split(".").pop().toLowerCase();
    if (!CV_EXTENSIONS.includes(extension)) return "CV must be a PDF, DOC or DOCX file";
    if (file.size > CV_MAX_BYTES) return "CV must be 5 MB or smaller";
    if (file.size === 0) return "This file is empty";
    return "";
}

// Returns { field: message } for the current form state
export function validateForm(form, { today, cv }) {
    const errors = {};
    const fail = (field, message) => { errors[field] ||= message; };
    const need = (field, label) => { if (!String(form[field] ?? "").trim()) fail(field, `${label} is required`); };

    need("full_name", "Full name");
    if (form.full_name.trim() && form.full_name.trim().length < 2) fail("full_name", "Enter your full name");
    need("email", "Email");
    if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) fail("email", "Enter a valid email address");
    const phone = form.phone.replace(/[\s\-().]/g, "");
    need("phone", "Phone number");
    if (phone && !/^\d{6,15}$/.test(phone)) fail("phone", "Enter a valid phone number (6–15 digits)");
    need("date_of_birth", "Date of birth");
    if (form.date_of_birth) {
        const age = yearsBetween(form.date_of_birth, today);
        if (age < 16) fail("date_of_birth", "You must be at least 16 years old");
        else if (age > 80) fail("date_of_birth", "Enter a valid date of birth");
    }
    need("nationality", "Nationality");
    need("current_city", "Current city");
    need("current_country", "Current country");
    if (!form.in_qatar) fail("in_qatar", "Tell us whether you are currently in Qatar");
    if (form.in_qatar === "Yes") need("visa_status", "Visa status");
    if (!form.willing_to_relocate) fail("willing_to_relocate", "Tell us whether you are willing to relocate");

    need("highest_qualification", "Highest qualification");
    need("institution", "Institution");
    const thisYear = Number(today.slice(0, 4));
    const year = Number(form.year_of_passing);
    need("year_of_passing", "Year of passing");
    if (form.year_of_passing && (!Number.isInteger(year) || year < 1960 || year > thisYear + 1)) {
        fail("year_of_passing", `Enter a year between 1960 and ${thisYear + 1}`);
    }
    if (form.key_skills.length === 0) fail("key_skills", "Add at least one key skill");

    const cvError = validateCv(cv);
    if (cvError) fail("cv", cvError);

    if (form.linkedin_url.trim() && !LINKEDIN_PATTERN.test(form.linkedin_url.trim())) {
        fail("linkedin_url", "Enter a LinkedIn URL, e.g. https://www.linkedin.com/in/your-name");
    }
    need("source", "How you heard about us");
    if (form.source === "Recruitment agency") need("agency_id", "Recruitment agency");
    if (form.source === "Employee referral") need("referrer", "Referrer's name or employee ID");
    if (!form.consent) fail("consent", "Please confirm the declaration to continue");

    if (form.candidate_type === "Fresher") {
        need("available_from", "Available to join from");
        if (form.available_from && form.available_from < today) fail("available_from", "Choose today or a later date");
    }

    if (form.candidate_type === "Experienced") {
        const years = Number(form.experience_years);
        const months = form.experience_months === "" ? 0 : Number(form.experience_months);
        if (form.experience_years === "") fail("experience_years", "Total experience is required");
        else if (!Number.isInteger(years) || years < 0 || years > 50) fail("experience_years", "Years must be a whole number from 0 to 50");
        if (!Number.isInteger(months) || months < 0 || months > 11) fail("experience_years", "Months must be from 0 to 11");
        else if (years === 0 && months === 0) fail("experience_years", "Enter your total experience");
        need("current_company", "Current/last company");
        need("current_designation", "Current/last designation");
        need("current_salary", "Current monthly salary");
        if (form.current_salary !== "" && !(Number(form.current_salary) >= 0)) fail("current_salary", "Enter a valid salary");
        need("expected_salary", "Expected monthly salary");
        if (form.expected_salary !== "" && !(Number(form.expected_salary) > 0)) fail("expected_salary", "Enter a valid salary");
        need("notice_period", "Notice period");
        form.employment_history.forEach((row, index) => {
            if (!row.company && !row.designation && !row.from && !row.to) return;
            const field = `employment_history.${index}`;
            if (!row.company.trim() || !row.designation.trim()) fail(field, "Company and designation are required");
            else if (!MONTH_PATTERN.test(row.from)) fail(field, "Choose the From month and year");
            else if (row.to && !MONTH_PATTERN.test(row.to)) fail(field, "Choose both the To month and year, or leave both empty for Present");
            else if (row.to && row.to < row.from) fail(field, "To must be after From");
            else if (row.from > today.slice(0, 7)) fail(field, "From can't be in the future");
        });
    }
    return errors;
}

// Form state → API payload (only the fields for the chosen candidate type)
export function toPayload(form) {
    const common = {
        candidate_type: form.candidate_type,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone_code: form.phone_code,
        phone: form.phone.trim(),
        date_of_birth: form.date_of_birth,
        gender: form.gender,
        nationality: form.nationality.trim(),
        current_city: form.current_city.trim(),
        current_country: form.current_country.trim(),
        in_qatar: form.in_qatar,
        visa_status: form.in_qatar === "Yes" ? form.visa_status : "",
        willing_to_relocate: form.willing_to_relocate,
        highest_qualification: form.highest_qualification,
        institution: form.institution.trim(),
        year_of_passing: form.year_of_passing,
        percentage_cgpa: form.percentage_cgpa.trim(),
        key_skills: form.key_skills,
        linkedin_url: form.linkedin_url.trim(),
        cover_letter: form.cover_letter.trim(),
        source: form.source,
        agency_id: form.source === "Recruitment agency" ? form.agency_id : "",
        referrer: form.source === "Employee referral" ? form.referrer.trim() : "",
        consent: form.consent,
    };
    if (form.candidate_type === "Fresher") {
        return {
            ...common,
            internships_projects: form.internships_projects.trim(),
            certifications: form.certifications.trim(),
            available_from: form.available_from,
        };
    }
    return {
        ...common,
        experience_years: form.experience_years,
        experience_months: form.experience_months,
        current_company: form.current_company.trim(),
        current_designation: form.current_designation.trim(),
        current_salary: form.current_salary,
        expected_salary: form.expected_salary,
        salary_currency: form.salary_currency,
        notice_period: form.notice_period,
        employment_history: form.employment_history.filter((row) => row.company || row.designation || row.from || row.to),
    };
}
