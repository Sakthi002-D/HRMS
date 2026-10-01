// =====================================================
// CAREERS: public job openings, candidate applications, HR review
//
// Public side only ever sees PUBLIC_JOB_FIELDS (no salary, budget, MPR,
// approvers or internal remarks). CVs are stored privately (Supabase private
// bucket, or backend/uploads/cvs when Supabase isn't configured) and are only
// streamed back through the HR-only download route.
// =====================================================

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pool from "../db.js";
import { COMPANY_TIMEZONE, getCompanyToday } from "./leaveDateRules.js";
import { createNotifications } from "./notificationService.js";
import { WorkflowError, getApproverIds, getRecruitmentSettings, getRecruitmentToday, getRolesFor } from "./manpowerWorkflow.js";

// Job statuses that accept applications. "Recruitment In Progress" is an Open job
// whose recruitment plan (incl. the application deadline) has been saved.
export const PUBLIC_JOB_STATUSES = ["open", "recruitment in progress", "active"];

export const CANDIDATE_TYPES = ["Fresher", "Experienced"];
export const GENDERS = ["Male", "Female", "Prefer not to say"];
export const VISA_STATUSES = ["Work visa", "Family visa", "Visit visa", "Other"];
export const QUALIFICATIONS = ["High School", "Diploma", "Bachelor's Degree", "Master's Degree", "Doctorate", "Other"];
export const SOURCES = ["Company website", "LinkedIn", "NaukriGulf", "Recruitment agency", "Employee referral", "Other"];
export const NOTICE_PERIODS = ["Immediate", "15 days", "30 days", "60 days", "90 days"];
export const SALARY_CURRENCIES = ["QAR", "INR", "USD", "EUR", "GBP", "AED", "SAR", "KWD", "OMR", "BHD"];
export const APPLICATION_STATUSES = ["New", "Shortlisted", "On Hold", "Rejected"];

export const CV_MAX_BYTES = 5 * 1024 * 1024;
const CV_TYPES = {
    pdf: { mime: "application/pdf", magic: (buf) => buf.subarray(0, 5).toString("latin1") === "%PDF-" },
    doc: { mime: "application/msword", magic: (buf) => buf.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1" },
    docx: {
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        magic: (buf) => buf.subarray(0, 4).toString("hex") === "504b0304",
    },
};

// HR actions on an application
const TRANSITIONS = {
    shortlist: { to: "Shortlisted", from: ["New", "On Hold"], label: "Shortlisted" },
    hold: { to: "On Hold", from: ["New", "Shortlisted"], label: "Put on hold" },
    reject: { to: "Rejected", from: ["New", "Shortlisted", "On Hold"], label: "Rejected", remarkRequired: true },
};

export class ValidationError extends WorkflowError {
    constructor(fields) {
        super(Object.values(fields)[0] || "Please check the form", 400);
        this.fields = fields;
    }
}

// =====================================================
// SCHEMA (same as migrations/015_career_applications.sql)
// =====================================================

export async function ensureCareerSchema(db = pool) {
    await db.query(`
        ALTER TABLE public.job_applications
        ADD COLUMN IF NOT EXISTS mpr_id BIGINT REFERENCES manpower_requests(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS date_of_birth DATE,
        ADD COLUMN IF NOT EXISTS gender TEXT,
        ADD COLUMN IF NOT EXISTS nationality TEXT,
        ADD COLUMN IF NOT EXISTS current_city TEXT,
        ADD COLUMN IF NOT EXISTS current_country TEXT,
        ADD COLUMN IF NOT EXISTS in_qatar BOOLEAN,
        ADD COLUMN IF NOT EXISTS visa_status TEXT,
        ADD COLUMN IF NOT EXISTS agency_id INTEGER REFERENCES recruitment_agencies(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS referrer TEXT,
        ADD COLUMN IF NOT EXISTS experience_years INTEGER,
        ADD COLUMN IF NOT EXISTS experience_months INTEGER,
        ADD COLUMN IF NOT EXISTS current_salary NUMERIC(12, 2),
        ADD COLUMN IF NOT EXISTS expected_salary NUMERIC(12, 2),
        ADD COLUMN IF NOT EXISTS salary_currency TEXT,
        ADD COLUMN IF NOT EXISTS employment_history JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS internships_projects TEXT,
        ADD COLUMN IF NOT EXISTS cv_storage TEXT,
        ADD COLUMN IF NOT EXISTS cv_path TEXT,
        ADD COLUMN IF NOT EXISTS cv_name TEXT,
        ADD COLUMN IF NOT EXISTS cv_mime TEXT,
        ADD COLUMN IF NOT EXISTS cv_size INTEGER,
        ADD COLUMN IF NOT EXISTS submitted_via TEXT,
        ADD COLUMN IF NOT EXISTS status_remark TEXT,
        ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
        ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
    `);
    // Already present in existing databases; deleted jobs are never public
    await db.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.query(`ALTER TABLE public.job_applications ALTER COLUMN status SET DEFAULT 'New'`);
    await db.query(`UPDATE public.job_applications SET status = 'New' WHERE status IS NULL OR status = 'Applied'`);
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS job_applications_job_email_unique_idx
        ON public.job_applications (job_id, LOWER(email)) WHERE submitted_via = 'careers'
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS job_applications_job_idx ON public.job_applications (job_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS job_applications_status_idx ON public.job_applications (status)`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS job_application_actions (
            id BIGSERIAL PRIMARY KEY,
            application_db_id INTEGER NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            from_status TEXT,
            to_status TEXT,
            actor_id TEXT,
            actor_name TEXT,
            remark TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS job_application_actions_app_idx ON job_application_actions (application_db_id, created_at)`);
}

// =====================================================
// PUBLIC JOBS
// =====================================================

// "fresher", "0", "0-1 years" → Fresher; anything else → Experienced
export const experienceLevel = (experience) => {
    const text = String(experience || "").trim().toLowerCase();
    if (!text || text.includes("fresher") || /^0(\D|$)/.test(text)) return "Fresher";
    return "Experienced";
};

const experienceLabel = (experience) => {
    const text = String(experience || "").trim();
    if (!text) return "Not specified";
    if (/fresher/i.test(text)) return "Fresher";
    if (/^\d+(\.\d+)?$/.test(text)) return Number(text) === 0 ? "Fresher" : `${text}+ year${Number(text) === 1 ? "" : "s"}`;
    return text;
};

// Whitelist: the only job fields the public API ever returns
const toPublicJob = (row) => ({
    job_id: row.job_id,
    title: row.title,
    department: row.department,
    location: row.location,
    employment_type: row.employment_type,
    experience: experienceLabel(row.experience),
    experience_level: experienceLevel(row.experience),
    openings: row.openings,
    posted_on: row.posted_on,
    apply_by: row.apply_by,
    job_description: row.job_description,
    skills: row.skills,
});

// An Open job counts only if it is legacy (no MPR) or its MPR was approved
const PUBLIC_JOB_SELECT = `
    SELECT j.id, j.job_id, j.title, j.department, j.location, j.employment_type, j.experience, j.openings,
           j.job_description, j.skills, j.status, j.mpr_id,
           TO_CHAR(j.created_at, 'YYYY-MM-DD') AS posted_on,
           TO_CHAR(j.application_deadline, 'YYYY-MM-DD') AS apply_by,
           (j.application_deadline IS NOT NULL AND j.application_deadline < $1::date) AS deadline_passed,
           (j.application_start_date IS NOT NULL AND j.application_start_date > $1::date) AS not_started,
           LOWER(COALESCE(j.status, '')) = ANY($2::text[]) AS status_open
    FROM public.jobs j
    LEFT JOIN manpower_requests m ON m.id = j.mpr_id
    WHERE (j.mpr_id IS NULL OR m.status = 'Approved')
      AND NOT j.is_deleted
`;

export async function listPublicJobs(db = pool) {
    const result = await db.query(
        `${PUBLIC_JOB_SELECT}
           AND LOWER(COALESCE(j.status, '')) = ANY($2::text[])
           AND (j.application_deadline IS NULL OR j.application_deadline >= $1::date)
           AND (j.application_start_date IS NULL OR j.application_start_date <= $1::date)
         ORDER BY j.created_at DESC, j.id DESC`,
        [await getRecruitmentToday(db), PUBLIC_JOB_STATUSES]
    );
    return result.rows.map(toPublicJob);
}

// Open → full public details. Closed / deadline passed → title only + accepting: false.
// Never-published jobs (Draft, Pending, Rejected, Cancelled, Deleted…) → 404.
export async function getPublicJob(jobCode, db = pool) {
    const result = await db.query(
        `${PUBLIC_JOB_SELECT} AND j.job_id = $3`,
        [await getRecruitmentToday(db), PUBLIC_JOB_STATUSES, String(jobCode || "")]
    );
    const row = result.rows[0];
    // Before the application start date the job isn't published yet
    const wasPublished = row && !row.not_started && (row.status_open || String(row.status).toLowerCase() === "closed");
    if (!wasPublished) throw new WorkflowError("This job opening was not found", 404);

    if (!row.status_open || row.deadline_passed) {
        return {
            accepting: false,
            reason: row.deadline_passed ? "The application deadline for this job has passed." : "This position is no longer accepting applications.",
            job: { job_id: row.job_id, title: row.title, department: row.department, location: row.location, apply_by: row.apply_by },
        };
    }
    return { accepting: true, job: toPublicJob(row) };
}

export async function getCareersMeta(db = pool) {
    const [settings, agencies] = await Promise.all([
        getRecruitmentSettings(db),
        db.query(`SELECT id, name FROM recruitment_agencies WHERE active ORDER BY name`),
    ]);
    return {
        today: await getRecruitmentToday(db),
        defaultCurrency: SALARY_CURRENCIES.includes(settings.currency) ? settings.currency : "QAR",
        currencies: SALARY_CURRENCIES,
        agencies: agencies.rows,
        genders: GENDERS,
        visaStatuses: VISA_STATUSES,
        qualifications: QUALIFICATIONS,
        sources: SOURCES,
        noticePeriods: NOTICE_PERIODS,
        cvMaxBytes: CV_MAX_BYTES,
    };
}

// =====================================================
// VALIDATION (mirrors src/components/careers/careersApi.js)
// =====================================================

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
const isMonthKey = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
const yesNo = (value) => (value === true || value === "Yes" ? true : value === false || value === "No" ? false : null);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const yearsBetween = (fromKey, toKey) => {
    const [fy, fm, fd] = fromKey.split("-").map(Number);
    const [ty, tm, td] = toKey.split("-").map(Number);
    return ty - fy - (tm < fm || (tm === fm && td < fd) ? 1 : 0);
};

export function validateApplication(input = {}, { today = getCompanyToday(), agencyIds = [] } = {}) {
    const errors = {};
    const fail = (field, message) => { errors[field] ||= message; };
    const required = (field, value, label) => { if (!value) fail(field, `${label} is required`); return value; };

    const candidateType = CANDIDATE_TYPES.includes(input.candidate_type) ? input.candidate_type : null;
    if (!candidateType) fail("candidate_type", "Choose Fresher or Experienced");

    const out = { candidate_type: candidateType };

    out.full_name = required("full_name", text(input.full_name, 120), "Full name");
    if (out.full_name && out.full_name.length < 2) fail("full_name", "Enter your full name");

    out.email = required("email", text(input.email, 160).toLowerCase(), "Email");
    if (out.email && !EMAIL_PATTERN.test(out.email)) fail("email", "Enter a valid email address");

    out.phone_code = text(input.phone_code, 6) || "+974";
    if (!/^\+\d{1,4}$/.test(out.phone_code)) fail("phone", "Choose a valid country code");
    const phoneDigits = String(input.phone ?? "").replace(/[\s\-().]/g, "");
    required("phone", phoneDigits, "Phone number");
    if (phoneDigits && !/^\d{6,15}$/.test(phoneDigits)) fail("phone", "Enter a valid phone number (6–15 digits)");
    out.phone = `${out.phone_code} ${phoneDigits}`;

    out.date_of_birth = required("date_of_birth", text(input.date_of_birth, 10), "Date of birth");
    if (out.date_of_birth) {
        if (!isDateKey(out.date_of_birth)) fail("date_of_birth", "Enter a valid date of birth");
        else if (yearsBetween(out.date_of_birth, today) < 16) fail("date_of_birth", "You must be at least 16 years old");
        else if (yearsBetween(out.date_of_birth, today) > 80) fail("date_of_birth", "Enter a valid date of birth");
    }

    out.gender = text(input.gender, 30) || null;
    if (out.gender && !GENDERS.includes(out.gender)) fail("gender", "Choose a gender from the list");

    out.nationality = required("nationality", text(input.nationality, 80), "Nationality");
    out.current_city = required("current_city", text(input.current_city, 80), "Current city");
    out.current_country = required("current_country", text(input.current_country, 80), "Current country");

    out.in_qatar = yesNo(input.in_qatar);
    if (out.in_qatar === null) fail("in_qatar", "Tell us whether you are currently in Qatar");
    out.visa_status = out.in_qatar ? text(input.visa_status, 30) : null;
    if (out.in_qatar && !VISA_STATUSES.includes(out.visa_status)) fail("visa_status", "Choose your visa status");
    out.willing_to_relocate = yesNo(input.willing_to_relocate);
    if (out.willing_to_relocate === null) fail("willing_to_relocate", "Tell us whether you are willing to relocate");

    out.highest_qualification = required("highest_qualification", text(input.highest_qualification, 60), "Highest qualification");
    if (out.highest_qualification && !QUALIFICATIONS.includes(out.highest_qualification)) fail("highest_qualification", "Choose a qualification from the list");
    out.institution = required("institution", text(input.institution, 160), "Institution");
    const passingYear = Number(input.year_of_passing);
    const thisYear = Number(today.slice(0, 4));
    if (!input.year_of_passing) fail("year_of_passing", "Year of passing is required");
    else if (!Number.isInteger(passingYear) || passingYear < 1960 || passingYear > thisYear + 1) fail("year_of_passing", `Enter a year between 1960 and ${thisYear + 1}`);
    out.year_of_passing = passingYear || null;
    out.percentage_cgpa = text(input.percentage_cgpa, 20) || null;

    const skills = (Array.isArray(input.key_skills) ? input.key_skills : String(input.key_skills || "").split(","))
        .map((skill) => text(skill, 50))
        .filter(Boolean);
    out.key_skills = [...new Map(skills.map((skill) => [skill.toLowerCase(), skill])).values()].slice(0, 30);
    if (out.key_skills.length === 0) fail("key_skills", "Add at least one key skill");

    out.linkedin_url = text(input.linkedin_url, 300) || null;
    if (out.linkedin_url && !/^https?:\/\/([a-z0-9-]+\.)*linkedin\.com(\/\S*)?$/i.test(out.linkedin_url)) {
        fail("linkedin_url", "Enter a LinkedIn URL, e.g. https://www.linkedin.com/in/your-name");
    }
    out.cover_letter = text(input.cover_letter, 5000) || null;

    out.source = required("source", text(input.source, 40), "How you heard about us");
    if (out.source && !SOURCES.includes(out.source)) fail("source", "Choose an option from the list");
    out.agency_id = null;
    out.referrer = null;
    if (out.source === "Recruitment agency") {
        out.agency_id = Number(input.agency_id) || null;
        if (!out.agency_id || !agencyIds.includes(out.agency_id)) fail("agency_id", "Choose the recruitment agency");
    }
    if (out.source === "Employee referral") {
        out.referrer = required("referrer", text(input.referrer, 120), "Referrer's name or employee ID");
    }

    if (input.consent !== true) fail("consent", "Please confirm the declaration to continue");

    if (candidateType === "Fresher") {
        out.internships_projects = text(input.internships_projects, 3000) || null;
        out.certifications = text(input.certifications, 2000) || null;
        out.available_from = required("available_from", text(input.available_from, 10), "Available to join from");
        if (out.available_from && !isDateKey(out.available_from)) fail("available_from", "Enter a valid date");
        else if (out.available_from && out.available_from < today) fail("available_from", "Choose today or a later date");
    }

    if (candidateType === "Experienced") {
        const years = Number(input.experience_years);
        const months = input.experience_months === "" || input.experience_months === undefined ? 0 : Number(input.experience_months);
        if (input.experience_years === "" || input.experience_years === undefined || input.experience_years === null) fail("experience_years", "Total experience is required");
        else if (!Number.isInteger(years) || years < 0 || years > 50) fail("experience_years", "Years must be a whole number from 0 to 50");
        if (!Number.isInteger(months) || months < 0 || months > 11) fail("experience_years", "Months must be from 0 to 11");
        else if (years === 0 && months === 0) fail("experience_years", "Enter your total experience");
        out.experience_years = years;
        out.experience_months = months;

        out.current_company = required("current_company", text(input.current_company, 160), "Current/last company");
        out.current_designation = required("current_designation", text(input.current_designation, 120), "Current/last designation");

        out.salary_currency = text(input.salary_currency, 8);
        if (!SALARY_CURRENCIES.includes(out.salary_currency)) fail("current_salary", "Choose a salary currency");
        const money = (field, label, allowZero) => {
            const raw = input[field];
            if (raw === "" || raw === null || raw === undefined) { fail(field, `${label} is required`); return null; }
            const value = Number(raw);
            if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0) || value > 99999999) { fail(field, `Enter a valid ${label.toLowerCase()}`); return null; }
            return Math.round(value * 100) / 100;
        };
        out.current_salary = money("current_salary", "Current monthly salary", true);
        out.expected_salary = money("expected_salary", "Expected monthly salary", false);

        out.notice_period = required("notice_period", text(input.notice_period, 20), "Notice period");
        if (out.notice_period && !NOTICE_PERIODS.includes(out.notice_period)) fail("notice_period", "Choose a notice period");

        const rows = Array.isArray(input.employment_history) ? input.employment_history.slice(0, 10) : [];
        out.employment_history = rows
            .map((row) => ({
                company: text(row?.company, 160),
                designation: text(row?.designation, 120),
                from: text(row?.from, 7),
                to: text(row?.to, 7),
            }))
            .filter((row) => row.company || row.designation || row.from || row.to);
        out.employment_history.forEach((row, index) => {
            const field = `employment_history.${index}`;
            if (!row.company || !row.designation) fail(field, `Employment history row ${index + 1}: company and designation are required`);
            else if (!isMonthKey(row.from)) fail(field, `Employment history row ${index + 1}: choose the From month`);
            else if (row.to && !isMonthKey(row.to)) fail(field, `Employment history row ${index + 1}: choose a valid To month`);
            else if (row.to && row.to < row.from) fail(field, `Employment history row ${index + 1}: To must be after From`);
            else if (row.from > today.slice(0, 7)) fail(field, `Employment history row ${index + 1}: From can't be in the future`);
        });
    }

    if (Object.keys(errors).length) throw new ValidationError(errors);
    return out;
}

// Extension + content sniffing; the browser-supplied MIME type is not trusted
export function validateCvFile(file) {
    if (!file) throw new ValidationError({ cv: "Upload your CV/Resume" });
    const extension = path.extname(file.originalname || "").slice(1).toLowerCase();
    const type = CV_TYPES[extension];
    if (!type) throw new ValidationError({ cv: "CV must be a PDF, DOC or DOCX file" });
    if (file.size > CV_MAX_BYTES) throw new ValidationError({ cv: "CV must be 5 MB or smaller" });
    if (!file.buffer?.length || !type.magic(file.buffer)) throw new ValidationError({ cv: "This file doesn't look like a valid PDF or Word document" });
    const safeName = path.basename(file.originalname).replace(/[^\w.\- ()]/g, "_").slice(-120);
    return { extension, mime: type.mime, name: safeName, size: file.size };
}

// =====================================================
// CV STORAGE (private)
// =====================================================

const CV_BUCKET = "candidate-cvs";
const LOCAL_CV_DIR = fileURLToPath(new URL("../uploads/cvs/", import.meta.url));

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.CAREERS_CV_STORAGE !== "local"
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

let bucketReady = null;
const ensureCvBucket = () => {
    bucketReady ||= (async () => {
        const { data } = await supabase.storage.getBucket(CV_BUCKET);
        if (data) {
            if (data.public) await supabase.storage.updateBucket(CV_BUCKET, { public: false });
            return;
        }
        const { error } = await supabase.storage.createBucket(CV_BUCKET, { public: false, fileSizeLimit: CV_MAX_BYTES });
        if (error && !/exist/i.test(error.message)) throw error;
    })().catch((error) => {
        bucketReady = null;
        throw error;
    });
    return bucketReady;
};

async function storeCv(buffer, { applicationNo, extension, mime }) {
    const fileName = `${applicationNo}-${randomBytes(8).toString("hex")}.${extension}`;
    if (supabase) {
        try {
            await ensureCvBucket();
            const objectPath = `${applicationNo.slice(4, 8)}/${fileName}`;
            const { error } = await supabase.storage.from(CV_BUCKET).upload(objectPath, buffer, { contentType: mime, upsert: false });
            if (error) throw error;
            return { storage: "supabase", path: objectPath };
        } catch (error) {
            console.error("CV upload to private storage failed; saving on the server instead:", error.message);
        }
    }
    await mkdir(LOCAL_CV_DIR, { recursive: true });
    await writeFile(path.join(LOCAL_CV_DIR, fileName), buffer, { flag: "wx" });
    return { storage: "local", path: fileName };
}

async function removeCv(stored) {
    try {
        if (stored.storage === "supabase") await supabase?.storage.from(CV_BUCKET).remove([stored.path]);
        else await unlink(path.join(LOCAL_CV_DIR, path.basename(stored.path)));
    } catch {
        // best effort
    }
}

export async function readCv({ cv_storage: storage, cv_path: cvPath }) {
    if (storage === "supabase") {
        if (!supabase) throw new WorkflowError("CV storage is not configured on this server", 503);
        const { data, error } = await supabase.storage.from(CV_BUCKET).download(cvPath);
        if (error) throw new WorkflowError("The CV file could not be found", 404);
        return Buffer.from(await data.arrayBuffer());
    }
    try {
        return await readFile(path.join(LOCAL_CV_DIR, path.basename(cvPath)));
    } catch {
        throw new WorkflowError("The CV file could not be found", 404);
    }
}

// =====================================================
// SUBMIT (public)
// =====================================================

const experienceText = (years, months) =>
    [years ? `${years} yr${years === 1 ? "" : "s"}` : null, months ? `${months} mo${months === 1 ? "" : "s"}` : null].filter(Boolean).join(" ") || "0";

async function nextApplicationNo(db, year) {
    const result = await db.query(
        `SELECT COALESCE(MAX(SUBSTRING(application_id FROM $1)::int), 0) + 1 AS next
         FROM public.job_applications WHERE application_id ~ $2`,
        [`^APP-${year}-([0-9]+)$`, `^APP-${year}-[0-9]+$`]
    );
    return `APP-${year}-${String(result.rows[0].next).padStart(4, "0")}`;
}

async function logApplicationAction(db, applicationDbId, { action, from = null, to = null, actor = null, remark = null }) {
    await db.query(
        `INSERT INTO job_application_actions (application_db_id, action, from_status, to_status, actor_id, actor_name, remark)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [applicationDbId, action, from, to, actor?.employee_id || null, actor?.name || null, remark]
    );
}

// Runs inside the caller's transaction. Returns { application, candidateEmail }.
export async function submitApplication(db, { jobCode, input, file }) {
    const today = await getRecruitmentToday(db);
    const agencies = await db.query(`SELECT id, name FROM recruitment_agencies WHERE active`);
    const data = validateApplication(input, { today, agencyIds: agencies.rows.map((row) => row.id) });
    const cv = validateCvFile(file);

    // Serialises submissions so the duplicate check and APP number are race-free
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('career-application'))`);

    const jobResult = await db.query(
        `${PUBLIC_JOB_SELECT} AND j.job_id = $3`,
        [today, PUBLIC_JOB_STATUSES, String(jobCode || "")]
    );
    const job = jobResult.rows[0];
    if (!job || job.not_started || !(job.status_open || String(job.status).toLowerCase() === "closed")) throw new WorkflowError("This job opening was not found", 404);
    if (job.deadline_passed) throw new WorkflowError("Applications closed: the deadline for this job has passed", 409);
    if (!job.status_open) throw new WorkflowError("Applications closed: this position is no longer accepting applications", 409);

    const duplicate = await db.query(
        `SELECT 1 FROM public.job_applications WHERE job_id = $1 AND LOWER(email) = $2 LIMIT 1`,
        [job.job_id, data.email]
    );
    if (duplicate.rows.length) throw new WorkflowError("You have already applied for this job", 409);

    const applicationNo = await nextApplicationNo(db, today.slice(0, 4));
    const stored = await storeCv(file.buffer, { applicationNo, extension: cv.extension, mime: cv.mime });

    try {
        const isExperienced = data.candidate_type === "Experienced";
        const result = await db.query(
            `
            INSERT INTO public.job_applications (
                application_id, job_id, job_title, department, mpr_id,
                candidate_name, email, phone, date_of_birth, gender, nationality,
                location, current_city, current_country, in_qatar, visa_status, willing_to_relocate,
                highest_education, college, graduation_year, cgpa_percentage,
                skills, linkedin_url, cover_letter, source, agency_id, referrer, declaration,
                candidate_type, internships_projects, certifications, joining_date,
                experience_years, experience_months, total_experience, current_company, current_designation,
                current_salary, expected_salary, salary_currency, notice_period, employment_history,
                cv_storage, cv_path, cv_name, cv_mime, cv_size,
                submitted_via, status, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16, $17,
                $18, $19, $20, $21,
                $22, $23, $24, $25, $26, $27, TRUE,
                $28, $29, $30, $31,
                $32, $33, $34, $35, $36,
                $37, $38, $39, $40, $41::jsonb,
                $42, $43, $44, $45, $46,
                'careers', 'New', CURRENT_TIMESTAMP
            )
            RETURNING id, application_id
            `,
            [
                applicationNo, job.job_id, job.title, job.department, job.mpr_id,
                data.full_name, data.email, data.phone, data.date_of_birth, data.gender, data.nationality,
                `${data.current_city}, ${data.current_country}`, data.current_city, data.current_country, data.in_qatar, data.visa_status, data.willing_to_relocate,
                data.highest_qualification, data.institution, data.year_of_passing, data.percentage_cgpa,
                data.key_skills.join(", "), data.linkedin_url, data.cover_letter, data.source, data.agency_id, data.referrer,
                data.candidate_type,
                isExperienced ? null : data.internships_projects,
                isExperienced ? null : data.certifications,
                isExperienced ? null : data.available_from,
                isExperienced ? data.experience_years : null,
                isExperienced ? data.experience_months : null,
                isExperienced ? experienceText(data.experience_years, data.experience_months) : "Fresher",
                isExperienced ? data.current_company : null,
                isExperienced ? data.current_designation : null,
                isExperienced ? data.current_salary : null,
                isExperienced ? data.expected_salary : null,
                isExperienced ? data.salary_currency : null,
                isExperienced ? data.notice_period : null,
                JSON.stringify(isExperienced ? data.employment_history : []),
                stored.storage, stored.path, cv.name, cv.mime, cv.size,
            ]
        );
        const application = result.rows[0];

        const agencyName = agencies.rows.find((row) => row.id === data.agency_id)?.name;
        await logApplicationAction(db, application.id, {
            action: "Applied",
            to: "New",
            remark: `Applied via Careers page (${data.candidate_type}; source: ${agencyName ? `${data.source} – ${agencyName}` : data.source})`,
        });

        // In-app only: one bell notification per application for the HR team
        const hrTeam = await getApproverIds(db, "HR", job.department);
        await createNotifications(db, hrTeam, {
            type: "job-application",
            title: `New application for ${job.job_id}`,
            message: `${data.full_name} (${data.candidate_type}) applied for ${job.title}. Application ${applicationNo}. Open Recruitment → Job Applications.`,
            link: `application:${applicationNo}`,
        });

        return {
            application: { application_no: applicationNo, job_id: job.job_id, job_title: job.title },
            candidateEmail: {
                to: data.email,
                name: data.full_name,
                subject: `Application received – ${job.title} (${applicationNo})`,
                plainSubject: true,
                signature: "HR Team\nShelter Group",
                text:
                    `Thank you for applying for ${job.title} (${job.job_id}) at Shelter Group.\n\n` +
                    `Your application number is ${applicationNo}. Our HR team will review your application and contact you if you are shortlisted.\n\n` +
                    "Please keep this number for any future correspondence.",
            },
        };
    } catch (error) {
        await removeCv(stored);
        if (error.code === "23505") throw new WorkflowError("You have already applied for this job", 409);
        throw error;
    }
}

// =====================================================
// HR
// =====================================================

export async function requireHRActor(db, actorId) {
    const { actor, roles } = await getRolesFor(db, actorId);
    if (!roles.some((item) => item.role === "HR")) throw new WorkflowError("Only HR can view job applications", 403);
    return actor;
}

// applied_at is a timestamp without time zone, written in the database session's zone
const APPLIED_AT = `(a.applied_at AT TIME ZONE current_setting('TimeZone'))`;

export async function listApplications(db = pool) {
    const result = await db.query(
        `
        SELECT a.id, a.application_id, a.job_id, COALESCE(j.title, a.job_title) AS job_title,
               COALESCE(j.department, a.department) AS department,
               a.candidate_name, a.email, a.phone, a.candidate_type,
               a.experience_years, a.experience_months, a.total_experience,
               a.expected_salary::float AS expected_salary, a.salary_currency, a.expected_ctc,
               a.notice_period, a.source, a.agency_id, ag.name AS agency_name, a.referrer,
               a.status, ${APPLIED_AT} AS applied_at,
               TO_CHAR(${APPLIED_AT} AT TIME ZONE $1, 'YYYY-MM-DD') AS applied_on
        FROM public.job_applications a
        LEFT JOIN public.jobs j ON j.job_id = a.job_id
        LEFT JOIN recruitment_agencies ag ON ag.id = a.agency_id
        ORDER BY a.applied_at DESC NULLS LAST, a.id DESC
        `,
        [COMPANY_TIMEZONE]
    );
    return result.rows;
}

export async function getApplicationDetail(db, id) {
    const result = await db.query(
        `
        SELECT a.*, ${APPLIED_AT} AS applied_at,
               a.current_salary::float AS current_salary, a.expected_salary::float AS expected_salary,
               TO_CHAR(a.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
               TO_CHAR(a.joining_date, 'YYYY-MM-DD') AS joining_date,
               COALESCE(j.title, a.job_title) AS job_title, COALESCE(j.department, a.department) AS department,
               j.status AS job_status, m.mpr_no, ag.name AS agency_name
        FROM public.job_applications a
        LEFT JOIN public.jobs j ON j.job_id = a.job_id
        LEFT JOIN manpower_requests m ON m.id = COALESCE(a.mpr_id, j.mpr_id)
        LEFT JOIN recruitment_agencies ag ON ag.id = a.agency_id
        WHERE a.id = $1
        `,
        [id]
    );
    const row = result.rows[0];
    if (!row) throw new WorkflowError("Application not found", 404);

    const actions = await db.query(
        `SELECT id, action, from_status, to_status, actor_name, remark, created_at
         FROM job_application_actions WHERE application_db_id = $1 ORDER BY created_at, id`,
        [id]
    );

    const { cv_path: cvPath, cv_storage: cvStorage, ...safe } = row;
    return {
        ...safe,
        has_cv: Boolean(cvPath && cvStorage),
        allowed_actions: Object.entries(TRANSITIONS).filter(([, rule]) => rule.from.includes(row.status)).map(([key]) => key),
        actions: actions.rows,
    };
}

export async function getApplicationCv(db, id) {
    const result = await db.query(
        `SELECT application_id, cv_storage, cv_path, cv_name, cv_mime FROM public.job_applications WHERE id = $1`,
        [id]
    );
    const row = result.rows[0];
    if (!row?.cv_path) throw new WorkflowError("No CV was uploaded with this application", 404);
    return { ...row, buffer: await readCv(row) };
}

export async function actOnApplication(db, { id, action, actorId, remark }) {
    const rule = TRANSITIONS[action];
    if (!rule) throw new WorkflowError("Unknown action", 404);
    const actor = await requireHRActor(db, actorId);
    const note = text(remark, 1000) || null;
    if (rule.remarkRequired && !note) throw new WorkflowError("Enter the reason for rejecting this application");

    const found = await db.query(`SELECT id, status FROM public.job_applications WHERE id = $1 FOR UPDATE`, [id]);
    const current = found.rows[0];
    if (!current) throw new WorkflowError("Application not found", 404);
    if (!rule.from.includes(current.status)) {
        throw new WorkflowError(`This application is ${current.status}; it can't be ${rule.label.toLowerCase()} now`, 409);
    }

    await db.query(
        `UPDATE public.job_applications
         SET status = $2, status_remark = $3, reviewed_by = $4, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, rule.to, note, actor.employee_id]
    );
    await logApplicationAction(db, id, { action: rule.label, from: current.status, to: rule.to, actor, remark: note });
    return getApplicationDetail(db, id);
}
