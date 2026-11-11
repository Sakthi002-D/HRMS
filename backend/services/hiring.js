// =====================================================
// RECRUITMENT → HIRING (after the interview)
// Interview result → offer letter (Accept / Decline link) → pre-joining checklist → Hire.
// Schema: migrations/028_hiring.sql (run by hand, like 020); until it exists the Hiring
// routes answer 503 and the rest of Recruitment keeps working.
//
// Candidates only ever see their own offer through a long random single-use token; the
// database stores its SHA-256 hash. Internal feedback, reject reasons and the MPR salary
// range are never put in a candidate email or on the public offer page.
// =====================================================

import { createHash, randomBytes } from "node:crypto";
import { escapeHtml, createNotifications } from "./notificationService.js";
import { WorkflowError, FILLED_APPLICATION_STATUSES, getApproverIds, getRecruitmentToday, refreshJobFill } from "./manpowerWorkflow.js";
import {
    ValidationError,
    formatDateKey,
    getApplicationDetail,
    interviewTableExists,
    logApplicationAction,
    requireHRActor,
} from "./careerApplications.js";
import { normalizeGrade } from "./grades.js";
import { createHrmsEmployeeLogin, nextEmployeeId, hasEmpPrefix, EMP_PREFIX_MESSAGE } from "./accountCredentials.js";
import {
    OFFER_ACCEPT_LABEL,
    OFFER_CURRENCY,
    OFFER_DECLINE_LABEL,
    OFFER_LINK_NOTE,
    OFFER_REPLY_PREFIX,
    OFFER_VALID_DAYS,
    formatOfferDate,
    offerIntro,
    offerRows,
    offerSignature,
    offerSubject,
} from "./offerLetterContent.js";

export { OFFER_CURRENCY };
const MAX_PROBATION_MONTHS = 6; // Qatar Labour Law

// Interview decision → new application status
export const INTERVIEW_DECISIONS = { Selected: "Selected", "Next round": "Shortlisted", "On hold": "On Hold", Rejected: "Rejected" };

export const PREJOINING_ITEMS = [
    { key: "passport_copy", label: "Passport copy", required: true },
    { key: "passport_photo", label: "Passport-size photo", required: true },
    { key: "educational_certificates", label: "Educational certificates (attested)", required: true },
    { key: "experience_letters", label: "Experience letters", required: false },
    { key: "medical_fitness", label: "Medical fitness test", required: true },
    { key: "police_clearance", label: "Police clearance certificate", required: true },
    { key: "visa_qid", label: "Work visa / QID processing started", required: true },
    { key: "bank_details", label: "Bank account details", required: false },
];

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
const money = (value) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
const companyOf = (settings) => String(settings?.companyName || "Shelter Group");

const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex");
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const newToken = () => randomBytes(32).toString("base64url");

const requiredDone = (checklist) => PREJOINING_ITEMS.filter((item) => item.required && checklist?.[item.key] === true).length;
const REQUIRED_COUNT = PREJOINING_ITEMS.filter((item) => item.required).length;

export async function hiringTablesExist(db) {
    const result = await db.query(`SELECT to_regclass('public.job_offers') AS offers`);
    return Boolean(result.rows[0].offers) && (await interviewTableExists(db));
}

async function requireHiringTables(db) {
    if (!(await hiringTablesExist(db))) {
        throw new WorkflowError("Hiring isn't set up yet: run migrations/020_job_application_interviews.sql and migrations/028_hiring.sql", 503);
    }
}

export const publicOfferUrl = () => String(process.env.APP_PUBLIC_URL || "").trim().replace(/\/+$/, "");

// =====================================================
// LIST + DETAIL (HR)
// =====================================================

// Every application past "New". Candidates who answered an offer that HR hasn't opened come first.
export async function listHiring(db) {
    await requireHiringTables(db);
    const result = await db.query(
        `
        SELECT a.id, a.application_id, a.candidate_name, a.email, a.job_id,
               COALESCE(j.title, a.job_title) AS job_title, a.status,
               j.openings,
               (SELECT COUNT(*)::int FROM public.job_applications x
                 WHERE x.job_id = a.job_id AND LOWER(x.status) = ANY($1::text[])) AS filled,
               to_jsonb(m) ->> 'grade' AS grade,
               to_jsonb(m) ->> 'designation' AS designation,
               TO_CHAR(i.interview_date, 'YYYY-MM-DD') AS interview_date,
               TO_CHAR(i.interview_time, 'HH24:MI') AS interview_time,
               i.mode AS interview_mode,
               o.response AS offer_response,
               (o.response IS NOT NULL AND NOT o.seen_by_hr) AS new_response,
               o.responded_at,
               a.prejoining_checklist, a.hired_employee_id,
               COALESCE(a.updated_at, a.applied_at AT TIME ZONE current_setting('TimeZone')) AS updated_at
        FROM public.job_applications a
        LEFT JOIN public.jobs j ON j.job_id = a.job_id
        LEFT JOIN manpower_requests m ON m.id = COALESCE(a.mpr_id, j.mpr_id)
        LEFT JOIN LATERAL (
            SELECT interview_date, interview_time, mode FROM public.job_application_interviews
            WHERE application_db_id = a.id ORDER BY created_at DESC, id DESC LIMIT 1
        ) i ON TRUE
        LEFT JOIN LATERAL (
            SELECT response, seen_by_hr, responded_at FROM public.job_offers
            WHERE application_db_id = a.id ORDER BY created_at DESC, id DESC LIMIT 1
        ) o ON TRUE
        WHERE COALESCE(a.status, 'New') <> 'New'
        ORDER BY (o.response IS NOT NULL AND NOT o.seen_by_hr) DESC, o.responded_at DESC NULLS LAST,
                 COALESCE(a.updated_at, a.applied_at AT TIME ZONE current_setting('TimeZone')) DESC NULLS LAST, a.id DESC
        `,
        [FILLED_APPLICATION_STATUSES]
    );
    return result.rows.map((row) => ({
        ...row,
        prejoining_done: requiredDone(row.prejoining_checklist),
        prejoining_required: REQUIRED_COUNT,
        prejoining_checklist: undefined,
    }));
}

// Applications with an offer answer HR hasn't opened yet (sidebar + Hiring tab badge)
export async function listUnseenResponses(db) {
    if (!(await hiringTablesExist(db))) return [];
    return (await db.query(`SELECT DISTINCT application_db_id AS id FROM public.job_offers WHERE NOT seen_by_hr`)).rows;
}

export async function markResponseSeen(db, id) {
    await requireHiringTables(db);
    await db.query(`UPDATE public.job_offers SET seen_by_hr = TRUE WHERE application_db_id = $1 AND NOT seen_by_hr`, [id]);
}

// Job + MPR values the offer and the new employee take (MPR columns read through to_jsonb:
// position / designation / employee_category aren't in every database)
async function loadJobContext(db, applicationId, { lock = false } = {}) {
    const result = await db.query(
        `
        SELECT a.id, a.application_id, a.status, a.candidate_name, a.email, a.phone, a.nationality, a.gender,
               TO_CHAR(a.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
               a.prejoining_checklist, a.hired_employee_id,
               a.job_id, COALESCE(j.title, a.job_title) AS job_title, j.openings, j.status AS job_status,
               COALESCE(m.department, j.department, a.department) AS department,
               COALESCE(m.location, j.location) AS site,
               COALESCE(m.employment_type, j.employment_type, 'Full Time') AS employment_type,
               m.id AS mpr_id, m.mpr_no, m.filled_at AS mpr_filled_at,
               to_jsonb(m) ->> 'grade' AS grade,
               to_jsonb(m) ->> 'position' AS position,
               to_jsonb(m) ->> 'designation' AS designation,
               m.salary_min::float AS salary_min, m.salary_max::float AS salary_max, m.currency AS mpr_currency,
               COALESCE(m.benefits ->> 'accommodation', '') IN ('true', 'Yes', 'yes') AS accommodation,
               COALESCE(m.benefits ->> 'vehicle', '') IN ('true', 'Yes', 'yes') AS transport,
               (SELECT COUNT(*)::int FROM public.job_applications x
                 WHERE x.job_id = a.job_id AND LOWER(x.status) = ANY($2::text[])) AS filled
        FROM public.job_applications a
        LEFT JOIN public.jobs j ON j.job_id = a.job_id
        LEFT JOIN manpower_requests m ON m.id = COALESCE(a.mpr_id, j.mpr_id)
        WHERE a.id = $1
        ${lock ? "FOR UPDATE OF a" : ""}
        `,
        [applicationId, FILLED_APPLICATION_STATUSES]
    );
    const row = result.rows[0];
    if (!row) throw new WorkflowError("Application not found", 404);
    return row;
}

const OFFER_COLUMNS = `id, salary::float AS salary, currency, TO_CHAR(joining_date, 'YYYY-MM-DD') AS joining_date,
    probation_months, token_expires_at, sent_at, email_error, response, response_reason, responded_at,
    responded_via, seen_by_hr, created_at`;

async function latestOffer(db, applicationId, { lock = false } = {}) {
    const result = await db.query(
        `SELECT ${OFFER_COLUMNS} FROM public.job_offers WHERE application_db_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1 ${lock ? "FOR UPDATE" : ""}`,
        [applicationId]
    );
    return result.rows[0] || null;
}

async function latestInterview(db, applicationId) {
    const result = await db.query(
        `SELECT id, result FROM public.job_application_interviews WHERE application_db_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [applicationId]
    );
    return result.rows[0] || null;
}

// What the side panel may do for the current status
const allowedHiringActions = (status, hasInterview) => {
    const actions = [];
    if (status === "Shortlisted") actions.push("schedule");
    if (status === "Interview Scheduled" || (status === "On Hold" && hasInterview)) actions.push("result");
    if (status === "Selected") actions.push("offer");
    if (status === "Offer Sent") actions.push("resend", "record");
    if (status === "Offer Accepted") actions.push("checklist", "hire");
    return actions;
};

export async function getHiringDetail(db, id) {
    await requireHiringTables(db);
    const [application, context, offer] = await Promise.all([
        getApplicationDetail(db, id),
        loadJobContext(db, id),
        latestOffer(db, id),
    ]);
    const interviews = (await db.query(
        `SELECT id, TO_CHAR(interview_date, 'YYYY-MM-DD') AS interview_date, TO_CHAR(interview_time, 'HH24:MI') AS interview_time,
                mode, location_or_link, interviewer_name, result, feedback, reject_reason, result_at,
                result_email_sent_at, result_email_error, email_sent_at, email_error, created_at
         FROM public.job_application_interviews WHERE application_db_id = $1 ORDER BY created_at, id`,
        [id]
    )).rows;
    const employee = application.hired_employee_id
        ? (await db.query(`SELECT employee_id, name, TO_CHAR(probation_end_date, 'YYYY-MM-DD') AS probation_end_date FROM employees WHERE employee_id = $1`, [application.hired_employee_id])).rows[0] || null
        : null;

    return {
        ...application,
        job: {
            job_id: context.job_id, title: context.job_title, openings: context.openings, filled: context.filled, status: context.job_status,
            mpr_no: context.mpr_no, mpr_filled_at: context.mpr_filled_at, grade: context.grade, position: context.position,
            designation: context.designation, department: context.department, site: context.site,
            employment_type: context.employment_type, accommodation: context.accommodation, transport: context.transport,
            salary_min: context.salary_min, salary_max: context.salary_max, currency: context.mpr_currency,
        },
        interviews,
        offer,
        offer_currency: OFFER_CURRENCY,
        max_probation_months: MAX_PROBATION_MONTHS,
        offer_link_ready: Boolean(publicOfferUrl()),
        prejoining_items: PREJOINING_ITEMS,
        prejoining_checklist: application.prejoining_checklist || {},
        employee,
        hiring_actions: allowedHiringActions(application.status, interviews.length > 0),
    };
}

// =====================================================
// INTERVIEW RESULT
// =====================================================

const resultEmail = (application, decision, settings) => {
    const company = companyOf(settings);
    const job = application.job_title;
    const mails = {
        Selected: {
            subject: `Congratulations – ${job} – ${company}`,
            text: `Congratulations – you have been selected for ${job}. Our HR team will send your offer letter shortly.`,
        },
        "Next round": {
            subject: `Next Interview Round – ${job} – ${company}`,
            text: `You have moved to the next interview round for ${job}. We will send you the details soon.`,
        },
        "On hold": {
            subject: `Application Update – ${job} – ${company}`,
            text: `Your application for ${job} is on hold while we complete our review. We will contact you soon.`,
        },
        Rejected: {
            subject: `Application Update – ${job} – ${company}`,
            text:
                `Thank you for your interest in the position of ${job} at ${company} and for the time you spent with us during the interview process.\n\n` +
                "After careful consideration, we regret to inform you that we will not be moving forward with your application at this time.\n\n" +
                "We appreciate your interest and wish you every success in your career.",
        },
    };
    return { to: application.email, name: application.candidate_name, plainSubject: true, signature: `HR Team\n${company}`, ...mails[decision] };
};

export async function recordInterviewResult(db, { id, actorId, input, settings }) {
    const actor = await requireHRActor(db, actorId);
    await requireHiringTables(db);

    const decision = text(input?.decision, 20);
    const feedback = text(input?.feedback, 3000);
    const reason = text(input?.reason, 1000);
    const fields = {};
    if (!feedback) fields.feedback = "Interview feedback is required";
    if (!INTERVIEW_DECISIONS[decision]) fields.decision = "Choose a decision";
    if (decision === "Rejected" && !reason) fields.reason = "Enter the internal reason for rejecting";
    if (Object.keys(fields).length) throw new ValidationError(fields);

    const application = await loadJobContext(db, id, { lock: true });
    const interview = await latestInterview(db, id);
    const allowed = application.status === "Interview Scheduled" || (application.status === "On Hold" && interview);
    if (!allowed) throw new WorkflowError(`This application is ${application.status}; an interview result can't be recorded now`, 409);

    const to = INTERVIEW_DECISIONS[decision];
    if (interview) {
        await db.query(
            `UPDATE public.job_application_interviews
             SET result = $2, feedback = $3, reject_reason = $4, result_by = $5, result_at = CURRENT_TIMESTAMP,
                 result_email_sent_at = NULL, result_email_error = NULL
             WHERE id = $1`,
            [interview.id, decision, feedback, decision === "Rejected" ? reason : null, actor.employee_id]
        );
    }
    await db.query(
        `UPDATE public.job_applications
         SET status = $2, status_remark = $3, reviewed_by = $4, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, to, decision === "Rejected" ? reason : `Interview result: ${decision}`, actor.employee_id]
    );
    await logApplicationAction(db, id, {
        action: `Interview result: ${decision}`,
        from: application.status,
        to,
        actor,
        remark: `Feedback: ${feedback}${decision === "Rejected" ? ` · Reason: ${reason}` : ""}`,
    });

    return { interviewId: interview?.id || null, email: resultEmail(application, decision, settings) };
}

export async function recordResultEmail(db, interviewId, { sent, reason }) {
    if (!interviewId) return;
    await db.query(
        `UPDATE public.job_application_interviews SET result_email_sent_at = $2, result_email_error = $3 WHERE id = $1`,
        [interviewId, sent ? new Date() : null, sent ? null : String(reason).slice(0, 500)]
    );
}

// =====================================================
// OFFER LETTER
// =====================================================

const formatExpiry = (expiresAt, settings) => {
    const timeZone = settings.timezone || "Asia/Qatar";
    const key = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(expiresAt));
    return formatOfferDate(key, settings.dateFormat);
};

// Offer letter email. The wording lives in offerLetterContent.js, which the HR preview also uses.
const offerEmail = (context, offer, token, settings) => {
    const company = companyOf(settings);
    const link = `${publicOfferUrl()}/offer/${token}`;
    const rows = offerRows(context, offer, settings);
    const expiry = formatExpiry(offer.token_expires_at, settings);
    const intro = offerIntro(context, company);
    const button = (label, href, color) =>
        `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 10px 10px 0;padding:14px 28px;border-radius:8px;background:${color};color:#ffffff;font-size:16px;font-weight:700;text-decoration:none">${label}</a>`;

    return {
        to: context.email,
        name: context.candidate_name,
        subject: offerSubject(context, company),
        plainSubject: true,
        signature: offerSignature(company),
        text:
            `${intro}\n\n` +
            rows.map(([label, value]) => `${label}: ${value}`).join("\n") +
            `\n\n${OFFER_REPLY_PREFIX} ${expiry}:\n` +
            `${OFFER_ACCEPT_LABEL}: ${link}?answer=accept\n` +
            `${OFFER_DECLINE_LABEL}: ${link}?answer=decline\n\n` +
            OFFER_LINK_NOTE,
        html:
            `<p>${escapeHtml(intro)}</p>` +
            `<table style="border-collapse:collapse;margin:12px 0 18px">` +
            rows.map(([label, value]) => `<tr><td style="padding:6px 18px 6px 0;color:#64748b">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`).join("") +
            `</table>` +
            `<p>${OFFER_REPLY_PREFIX} <strong>${escapeHtml(expiry)}</strong>.</p>` +
            `<p>${button(OFFER_ACCEPT_LABEL, `${link}?answer=accept`, "#0f8b83")}${button(OFFER_DECLINE_LABEL, `${link}?answer=decline`, "#b91c1c")}</p>` +
            `<p style="color:#64748b;font-size:13px">${OFFER_LINK_NOTE}</p>`,
    };
};

// New token (hash stored) expiring 14 days from now or at the end of the joining date, whichever is first
async function issueToken(db, offerId, { timezone }) {
    const token = newToken();
    const result = await db.query(
        `UPDATE public.job_offers
         SET token = $2,
             token_expires_at = LEAST(CURRENT_TIMESTAMP + make_interval(days => $3::int), ((joining_date + 1)::timestamp AT TIME ZONE $4)),
             sent_at = NULL, email_error = NULL
         WHERE id = $1
         RETURNING ${OFFER_COLUMNS}`,
        [offerId, hashToken(token), OFFER_VALID_DAYS, timezone || "Asia/Qatar"]
    );
    return { token, offer: result.rows[0] };
}

export function validateOffer(input, today) {
    const fields = {};
    const salaryRaw = input?.salary;
    const salary = Number(salaryRaw);
    if (salaryRaw === "" || salaryRaw === null || salaryRaw === undefined) fields.salary = "Monthly salary is required";
    else if (!Number.isFinite(salary) || salary <= 0 || salary > 99999999) fields.salary = "Enter a valid monthly salary";

    const joiningDate = text(input?.joining_date, 10);
    if (!isDateKey(joiningDate)) fields.joining_date = "Joining date is required";
    else if (joiningDate < today) fields.joining_date = "Joining date must be today or later";

    const probationRaw = input?.probation_months;
    const probation = Number(probationRaw);
    if (probationRaw === "" || probationRaw === null || probationRaw === undefined) fields.probation_months = "Probation is required";
    else if (!Number.isInteger(probation) || probation < 1 || probation > MAX_PROBATION_MONTHS) {
        fields.probation_months = `Probation must be a whole number of months from 1 to ${MAX_PROBATION_MONTHS}`;
    }

    if (Object.keys(fields).length) throw new ValidationError(fields);
    return { salary: Math.round(salary * 100) / 100, joining_date: joiningDate, probation_months: probation };
}

export async function sendOffer(db, { id, actorId, input, settings }) {
    const actor = await requireHRActor(db, actorId);
    await requireHiringTables(db);
    if (!publicOfferUrl()) throw new WorkflowError("Offer letters need APP_PUBLIC_URL in backend/.env (the address of this HRMS, for the Accept / Decline link)", 503);

    const data = validateOffer(input, await getRecruitmentToday(db));
    const context = await loadJobContext(db, id, { lock: true });
    if (context.status !== "Selected") throw new WorkflowError(`This application is ${context.status}; only Selected candidates can be sent an offer`, 409);

    const inserted = await db.query(
        `INSERT INTO public.job_offers (application_db_id, salary, currency, joining_date, probation_months, token, token_expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
         RETURNING id`,
        [id, data.salary, OFFER_CURRENCY, data.joining_date, data.probation_months, hashToken(newToken()), actor.employee_id]
    );
    const { token, offer } = await issueToken(db, inserted.rows[0].id, settings);

    const outside = context.salary_min !== null && context.salary_max !== null && (data.salary < context.salary_min || data.salary > context.salary_max);
    const remark = `${OFFER_CURRENCY} ${money(data.salary)} / month, joining ${formatDateKey(data.joining_date, settings.dateFormat)}, probation ${data.probation_months} month(s)`
        + (outside ? ` · outside the MPR range (${OFFER_CURRENCY} ${money(context.salary_min)} – ${money(context.salary_max)})` : "");
    await db.query(
        `UPDATE public.job_applications
         SET status = 'Offer Sent', status_remark = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, "Offer letter sent", actor.employee_id]
    );
    await logApplicationAction(db, id, { action: "Offer Sent", from: context.status, to: "Offer Sent", actor, remark });

    return { offerId: offer.id, email: offerEmail(context, offer, token, settings) };
}

export async function resendOffer(db, { id, actorId, settings }) {
    const actor = await requireHRActor(db, actorId);
    await requireHiringTables(db);
    if (!publicOfferUrl()) throw new WorkflowError("Offer letters need APP_PUBLIC_URL in backend/.env (the address of this HRMS, for the Accept / Decline link)", 503);

    const context = await loadJobContext(db, id, { lock: true });
    if (context.status !== "Offer Sent") throw new WorkflowError(`This application is ${context.status}; there is no open offer to resend`, 409);
    const current = await latestOffer(db, id, { lock: true });
    if (!current || current.response) throw new WorkflowError("This offer has already been answered", 409);
    if (current.joining_date < await getRecruitmentToday(db)) {
        throw new WorkflowError("The joining date of this offer has passed. Record the candidate's answer instead.", 409);
    }

    // The old link stops working; the new one gets a fresh expiry
    const { token, offer } = await issueToken(db, current.id, settings);
    await logApplicationAction(db, id, { action: "Offer email resent", actor, remark: "A new Accept / Decline link was sent; the previous link no longer works" });
    return { offerId: offer.id, email: offerEmail(context, offer, token, settings) };
}

export async function recordOfferEmail(db, offerId, { sent, reason }) {
    await db.query(
        `UPDATE public.job_offers SET sent_at = $2, email_error = $3 WHERE id = $1`,
        [offerId, sent ? new Date() : null, sent ? null : String(reason).slice(0, 500)]
    );
}

// HR records the answer the candidate gave by phone / in person
export async function recordOfferResponse(db, { id, actorId, input }) {
    const actor = await requireHRActor(db, actorId);
    await requireHiringTables(db);
    const response = input?.response === "Accepted" || input?.response === "Declined" ? input.response : null;
    if (!response) throw new ValidationError({ response: "Choose Accepted or Declined" });
    const reason = text(input?.reason, 1000) || null;

    const context = await loadJobContext(db, id, { lock: true });
    if (context.status !== "Offer Sent") throw new WorkflowError(`This application is ${context.status}; there is no open offer`, 409);
    const offer = await latestOffer(db, id, { lock: true });
    if (!offer || offer.response) throw new WorkflowError("This offer has already been answered", 409);

    return applyOfferResponse(db, { context, offer, response, reason, via: "hr", actor });
}

async function applyOfferResponse(db, { context, offer, response, reason, via, actor }) {
    const to = response === "Accepted" ? "Offer Accepted" : "Offer Declined";
    await db.query(
        `UPDATE public.job_offers
         SET response = $2, response_reason = $3, responded_at = CURRENT_TIMESTAMP, responded_via = $4, seen_by_hr = $5
         WHERE id = $1`,
        [offer.id, response, reason, via, via === "hr"]
    );
    await db.query(
        `UPDATE public.job_applications
         SET status = $2, status_remark = $3, updated_at = CURRENT_TIMESTAMP
             ${via === "hr" ? ", reviewed_by = $4, reviewed_at = CURRENT_TIMESTAMP" : ""}
         WHERE id = $1`,
        via === "hr"
            ? [context.id, to, reason || `Offer ${response.toLowerCase()}`, actor.employee_id]
            : [context.id, to, reason || `Offer ${response.toLowerCase()} by the candidate`]
    );
    await logApplicationAction(db, context.id, {
        action: `Offer ${response}`,
        from: context.status,
        to,
        actor: via === "hr" ? actor : { employee_id: null, name: `${context.candidate_name} (candidate)` },
        remark: [via === "hr" ? "Recorded by HR" : "Answered via the offer link", reason ? `Reason: ${reason}` : null].filter(Boolean).join(" · "),
    });
    return { status: to };
}

// =====================================================
// PUBLIC OFFER PAGE (/offer/:token)
// =====================================================

// state: open | accepted | declined | expired | invalid. Details only while open.
async function findOfferByToken(db, token) {
    if (!TOKEN_PATTERN.test(String(token || ""))) return null;
    if (!(await hiringTablesExist(db))) return null;
    const result = await db.query(
        `SELECT o.id, o.application_db_id, o.salary::float AS salary, o.currency, TO_CHAR(o.joining_date, 'YYYY-MM-DD') AS joining_date,
                o.probation_months, o.token_expires_at, o.response, (o.token_expires_at <= CURRENT_TIMESTAMP) AS expired
         FROM public.job_offers o WHERE o.token = $1`,
        [hashToken(token)]
    );
    return result.rows[0] || null;
}

export async function getPublicOffer(db, token, settings) {
    const offer = await findOfferByToken(db, token);
    if (!offer) return { state: "invalid" };
    if (offer.response) return { state: offer.response === "Accepted" ? "accepted" : "declined" };
    const context = await loadJobContext(db, offer.application_db_id);
    if (offer.expired || context.status !== "Offer Sent") return { state: "expired" };

    // Whitelist: only this candidate's offer, never the MPR range, feedback or remarks
    return {
        state: "open",
        company: companyOf(settings),
        offer: {
            candidate_name: context.candidate_name,
            job_title: context.job_title,
            rows: offerRows(context, offer, settings),
            expires_on: formatExpiry(offer.token_expires_at, settings),
        },
    };
}

export async function respondToOffer(db, { token, answer, reason }) {
    const response = answer === "accept" ? "Accepted" : answer === "decline" ? "Declined" : null;
    if (!response) throw new WorkflowError("Choose Accept or Decline");

    const found = await findOfferByToken(db, token);
    if (!found) return { state: "invalid" };
    // Application first, then the offer: the same lock order as the HR actions
    const context = await loadJobContext(db, found.application_db_id, { lock: true });
    const offer = (await db.query(
        `SELECT id, response, (token_expires_at <= CURRENT_TIMESTAMP) AS expired, token = $2 AS current_link
         FROM public.job_offers WHERE id = $1 FOR UPDATE`,
        [found.id, hashToken(token)]
    )).rows[0];
    if (!offer?.current_link) return { state: "expired" }; // a resend replaced this link meanwhile
    if (offer.response) return { state: offer.response === "Accepted" ? "accepted" : "declined", alreadyAnswered: true };
    if (offer.expired || context.status !== "Offer Sent") return { state: "expired" };

    const note = response === "Declined" ? text(reason, 1000) || null : null;
    await applyOfferResponse(db, { context, offer, response, reason: note, via: "candidate" });

    const verb = response === "Accepted" ? "accepted" : "declined";
    const message = `${context.candidate_name} ${verb} the offer for ${context.job_title}.`;
    await createNotifications(db, await getApproverIds(db, "HR", context.department), {
        type: "offer-response",
        title: `Offer ${verb}: ${context.candidate_name}`,
        message: `${message} Application ${context.application_id}. Open Recruitment → Hiring.`,
        link: `application:${context.application_id}`,
    });

    return {
        state: verb,
        hrEmail: {
            name: "HR Team",
            subject: `${context.candidate_name} ${verb} the offer for ${context.job_title}`,
            plainSubject: true,
            text: `${message}\n\nApplication: ${context.application_id}${note ? `\nReason given: ${note}` : ""}\n\nOpen HRMS → Recruitment → Hiring to continue.`,
        },
    };
}

// =====================================================
// PRE-JOINING + HIRE
// =====================================================

export async function savePrejoiningItem(db, { id, actorId, input }) {
    const actor = await requireHRActor(db, actorId);
    await requireHiringTables(db);
    const item = PREJOINING_ITEMS.find((entry) => entry.key === input?.key);
    if (!item || typeof input?.done !== "boolean") throw new WorkflowError("Unknown checklist item");

    const context = await loadJobContext(db, id, { lock: true });
    if (context.status !== "Offer Accepted") throw new WorkflowError(`This application is ${context.status}; the pre-joining checklist can't be changed now`, 409);

    const checklist = { ...(context.prejoining_checklist || {}), [item.key]: input.done };
    await db.query(
        `UPDATE public.job_applications SET prejoining_checklist = $2::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id, JSON.stringify(checklist)]
    );
    await logApplicationAction(db, id, {
        action: input.done ? "Pre-joining item done" : "Pre-joining item reopened",
        actor,
        remark: `${item.label} · ${requiredDone(checklist)} of ${REQUIRED_COUNT} required done`,
    });
    return checklist;
}

// Next free numeric ID (same style as the D365 personnel numbers); HR can change it in the
// Hire box. The portal login is EMP<ID>, e.g. 9121 -> EMP9121.
export const suggestEmployeeId = (db) => nextEmployeeId(db);

// Same columns and defaults as POST /api/employees (backend/server.js), plus salary and probation
// from the accepted offer. status stays 'Active' (login, punch-in and headcount need it).
export async function hireCandidate(db, { id, actorId, input, settings }) {
    const actor = await requireHRActor(db, actorId);
    await requireHiringTables(db);

    const context = await loadJobContext(db, id, { lock: true });
    if (context.status !== "Offer Accepted") throw new WorkflowError(`This application is ${context.status}; only candidates who accepted the offer can be hired`, 409);
    if (requiredDone(context.prejoining_checklist) < REQUIRED_COUNT) throw new WorkflowError("Complete every required pre-joining item first", 409);
    const offer = await latestOffer(db, id);
    if (offer?.response !== "Accepted") throw new WorkflowError("No accepted offer was found for this application", 409);

    // Serialises hires so the suggested ID is never handed out twice
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('hire-employee-id'))`);
    const employeeId = text(input?.employee_id, 30) || await suggestEmployeeId(db);
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(employeeId)) throw new ValidationError({ employee_id: "Employee ID can use letters, numbers, - and _ (2–30 characters)" });
    if (hasEmpPrefix(employeeId)) throw new ValidationError({ employee_id: EMP_PREFIX_MESSAGE });
    const taken = await db.query(`SELECT 1 FROM employees WHERE LOWER(employee_id) = LOWER($1)`, [employeeId]);
    if (taken.rows.length) throw new ValidationError({ employee_id: `Employee ID ${employeeId} already exists` });
    const sameEmail = await db.query(`SELECT employee_id FROM employees WHERE LOWER(email) = LOWER($1) LIMIT 1`, [context.email]);
    if (sameEmail.rows.length) throw new WorkflowError(`An employee with the email ${context.email} already exists (${sameEmail.rows[0].employee_id})`, 409);

    const designation = context.designation || context.job_title;
    const grade = normalizeGrade(context.grade); // undefined = not in the employee grade list
    const inserted = await db.query(
        `INSERT INTO employees (
            employee_id, name, department, designation, email, phone, date_of_birth, gender, nationality,
            joining_date, employment_type, status, legal_entity, worker_type, employment_end_date,
            position, position_title, assignment_start, make_primary, grade, work_location,
            monthly_salary, probation_months, probation_end_date
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10::date, $11, 'Active', 'SHLT', 'Employee', 'Never',
            $12, $13, $10::date, FALSE, $14, $15,
            $16, $17, ($10::date + make_interval(months => $17::int))::date
         )
         RETURNING employee_id, name, TO_CHAR(probation_end_date, 'YYYY-MM-DD') AS probation_end_date`,
        [
            employeeId, context.candidate_name, context.department, designation, context.email, context.phone,
            context.date_of_birth, ["Male", "Female"].includes(context.gender) ? context.gender : null, context.nationality,
            offer.joining_date, context.employment_type,
            context.position || designation, designation, grade || null, context.site,
            offer.salary, offer.probation_months,
        ]
    );
    const employee = inserted.rows[0];
    // Employee portal login: EMP<employee ID>, temporary password = the username
    employee.login_username = await createHrmsEmployeeLogin(db, employee.employee_id);

    await db.query(
        `UPDATE public.job_applications
         SET status = 'Hired', hired_employee_id = $2, hired_at = CURRENT_TIMESTAMP, status_remark = $3,
             reviewed_by = $4, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, employee.employee_id, `Hired as ${employee.employee_id}`, actor.employee_id]
    );
    await logApplicationAction(db, id, {
        action: "Hired",
        from: context.status,
        to: "Hired",
        actor,
        remark: `Employee ${employee.employee_id} created; probation until ${formatDateKey(employee.probation_end_date, settings.dateFormat)}`
            + (context.grade && grade === undefined ? ` · grade "${context.grade}" isn't in the employee grade list, set it in Grade Assignment` : ""),
    });

    // Filled count = Hired / Joined applications; the job closes at filled = openings
    await refreshJobFill(db, context.job_id);
    const filled = await db.query(
        `UPDATE manpower_requests m SET filled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         FROM public.jobs j
         WHERE j.job_id = $1 AND m.id = j.mpr_id AND m.filled_at IS NULL AND LOWER(COALESCE(j.status, '')) = 'closed'
           AND j.openings > 0
           AND (SELECT COUNT(*) FROM public.job_applications x WHERE x.job_id = j.job_id AND LOWER(x.status) = ANY($2::text[])) >= j.openings
         RETURNING m.id, j.openings`,
        [context.job_id, FILLED_APPLICATION_STATUSES]
    );
    if (filled.rows[0]) {
        await db.query(
            `INSERT INTO manpower_request_actions (mpr_id, action, actor_id, actor_name, remark) VALUES ($1, 'Filled', $2, $3, $4)`,
            [filled.rows[0].id, actor.employee_id, actor.name, `All ${filled.rows[0].openings} position(s) of ${context.job_id} filled; job opening closed`]
        );
    }

    const company = companyOf(settings);
    return {
        employee,
        email: {
            to: context.email,
            name: context.candidate_name,
            subject: `Welcome to ${company} – ${context.job_title}`,
            plainSubject: true,
            signature: `HR Team\n${company}`,
            text:
                `Welcome to ${company}! We are delighted that you are joining us as ${designation}.\n\n` +
                `Joining date: ${formatDateKey(offer.joining_date, settings.dateFormat)}\n` +
                `Site: ${context.site || "to be confirmed by HR"}\n` +
                `Employee ID: ${employee.employee_id}\n` +
                (employee.login_username
                    ? `HRMS username: ${employee.login_username}\n`
                      + "Temporary password: the same as your username. Please change it after your first sign-in.\n\n"
                    : "\n") +
                "Our HR team will contact you before your first day with the reporting details.",
        },
    };
}
