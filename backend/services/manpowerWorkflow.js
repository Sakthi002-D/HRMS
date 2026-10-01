// =====================================================
// MANPOWER REQUEST (MPR) WORKFLOW — FRD SHELTER-HCM-RC-01-001
//
// Draft → Pending <Role> … → Approved (job opening auto-created)
//                        ↘ Sent Back (coordinator edits, resubmits; resumes at
//                          the step that sent it back) / Rejected / Cancelled
//
// Workflow steps, the COO/CTO-by-department mapping and department codes live
// in recruitment_settings (Settings → Approval Workflows). People are mapped to
// workflow roles in workflow_role_assignments.
// =====================================================

import pool from "../db.js";
import { getCompanyToday } from "./leaveDateRules.js";
import { createNotifications } from "./notificationService.js";

export const ROLE_LABELS = {
    DEPT_COORDINATOR: "Department Coordinator",
    DEPT_HEAD: "Department Head",
    HR: "HR",
    EXEC: "COO/CTO",
    COO: "COO",
    CTO: "CTO",
    FINANCE: "Finance",
    CEO: "CEO",
    PROCUREMENT: "Procurement",
    IT: "IT",
    LINE_MANAGER: "Line Manager",
    PAYROLL: "Payroll",
};
export const ASSIGNABLE_ROLES = ["DEPT_COORDINATOR", "DEPT_HEAD", "LINE_MANAGER", "HR", "COO", "CTO", "FINANCE", "PAYROLL", "CEO", "PROCUREMENT", "IT"];
export const DEPARTMENT_SCOPED_ROLES = ["DEPT_COORDINATOR", "DEPT_HEAD", "LINE_MANAGER"];
// Roles used only by the Resignation workflow; they don't make someone an MPR approver
export const NON_MPR_ROLES = ["DEPT_COORDINATOR", "LINE_MANAGER", "PAYROLL"];
export const WORKFLOW_STEP_ROLES = ["DEPT_HEAD", "HR", "EXEC", "FINANCE", "CEO"];
export const REQUEST_TYPES = ["Replacement", "New Position"];
export const ASSET_OPTIONS = ["Laptop", "Mobile", "SIM", "Vehicle", "Access Card", "Other"];
export const SOURCING_OPTIONS = ["Agency", "Internal", "Both"];
export const EMPLOYMENT_TYPES = ["Full Time", "Part Time", "Contract"];
export const FILLED_APPLICATION_STATUSES = ["hired", "joined"];

export const DEFAULT_RECRUITMENT_SETTINGS = {
    workflows: {
        Replacement: ["DEPT_HEAD", "HR", "EXEC", "FINANCE", "CEO"],
        "New Position": ["HR", "FINANCE", "EXEC", "CEO"],
    },
    execByDepartment: { IT: "CTO" },
    defaultExec: "COO",
    departmentCodes: { IT: "IT", Finance: "FIN", HR: "HR" },
    currency: "INR",
    currencySymbol: "₹",
};

const FINAL_STATUSES = ["Approved", "Rejected", "Cancelled"];

export class WorkflowError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const sameText = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

const lookupByDepartment = (map, department) => {
    const key = Object.keys(map || {}).find((name) => sameText(name, department));
    return key ? map[key] : undefined;
};

export const roleLabel = (roleKey) => ROLE_LABELS[roleKey] || roleKey;

// =====================================================
// SCHEMA
// =====================================================

export async function ensureManpowerSchema(db = pool) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS recruitment_settings (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            settings JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(
        `INSERT INTO recruitment_settings (id, settings) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(DEFAULT_RECRUITMENT_SETTINGS)]
    );

    await db.query(`
        CREATE TABLE IF NOT EXISTS workflow_role_assignments (
            id BIGSERIAL PRIMARY KEY,
            role_key TEXT NOT NULL,
            department TEXT,
            employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS workflow_role_assignments_unique_idx
        ON workflow_role_assignments (role_key, COALESCE(LOWER(department), ''), employee_id)
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS recruitment_locations (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    // Seed the master from locations already used on job openings
    await db.query(`
        INSERT INTO recruitment_locations (name)
        SELECT DISTINCT TRIM(location) FROM public.jobs WHERE COALESCE(TRIM(location), '') <> ''
        ON CONFLICT (name) DO NOTHING
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS recruitment_agencies (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            contact_person TEXT,
            email TEXT,
            phone TEXT,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS department_headcount_budgets (
            id SERIAL PRIMARY KEY,
            department TEXT NOT NULL,
            year INTEGER NOT NULL,
            headcount INTEGER NOT NULL CHECK (headcount >= 0),
            salary_budget NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (salary_budget >= 0),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS department_headcount_budgets_unique_idx
        ON department_headcount_budgets (LOWER(department), year)
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS manpower_requests (
            id BIGSERIAL PRIMARY KEY,
            mpr_no TEXT UNIQUE,
            request_type TEXT NOT NULL CHECK (request_type IN ('Replacement', 'New Position')),
            status TEXT NOT NULL DEFAULT 'Draft',
            workflow_steps JSONB,
            current_step INTEGER,
            resume_step INTEGER,
            title TEXT,
            department TEXT NOT NULL,
            openings INTEGER,
            experience TEXT,
            location TEXT,
            employment_type TEXT,
            job_description TEXT,
            skills TEXT,
            salary_min NUMERIC(12, 2),
            salary_max NUMERIC(12, 2),
            currency TEXT,
            benefits JSONB NOT NULL DEFAULT '{}'::jsonb,
            grade TEXT,
            required_by DATE,
            justification TEXT,
            assets JSONB NOT NULL DEFAULT '[]'::jsonb,
            asset_other TEXT,
            replaced_employee_id TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
            replacement_reason TEXT,
            budget_status TEXT,
            budget_snapshot JSONB,
            requested_by TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
            job_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            submitted_at TIMESTAMPTZ,
            decided_at TIMESTAMPTZ
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS manpower_requests_status_idx ON manpower_requests (status)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS manpower_request_actions (
            id BIGSERIAL PRIMARY KEY,
            mpr_id BIGINT NOT NULL REFERENCES manpower_requests(id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            step_role TEXT,
            actor_id TEXT,
            actor_name TEXT,
            remark TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS manpower_request_actions_mpr_idx ON manpower_request_actions (mpr_id, created_at)`);

    await db.query(`
        ALTER TABLE public.jobs
        ADD COLUMN IF NOT EXISTS mpr_id BIGINT REFERENCES manpower_requests(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS request_type TEXT,
        ADD COLUMN IF NOT EXISTS sourcing TEXT,
        ADD COLUMN IF NOT EXISTS agency_id INTEGER REFERENCES recruitment_agencies(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS application_deadline DATE,
        ADD COLUMN IF NOT EXISTS recruiter_employee_id TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS interview_panel JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS application_start_date DATE
    `);

    // Application period (replaces Required By / Grade on the form; old columns and data are kept)
    await db.query(`
        ALTER TABLE manpower_requests
        ADD COLUMN IF NOT EXISTS application_start_date DATE,
        ADD COLUMN IF NOT EXISTS application_end_date DATE
    `);
}

// =====================================================
// SETTINGS / ROLES
// =====================================================

export async function getRecruitmentSettings(db = pool) {
    const result = await db.query("SELECT settings FROM recruitment_settings WHERE id = 1");
    const saved = result.rows[0]?.settings || {};
    return {
        ...DEFAULT_RECRUITMENT_SETTINGS,
        ...saved,
        workflows: { ...DEFAULT_RECRUITMENT_SETTINGS.workflows, ...(saved.workflows || {}) },
    };
}

export async function saveRecruitmentSettings(input, db = pool) {
    const current = await getRecruitmentSettings(db);
    const next = { ...current };

    if (input.workflows) {
        REQUEST_TYPES.forEach((type) => {
            const steps = input.workflows[type];
            if (steps === undefined) return;
            if (!Array.isArray(steps) || steps.length === 0) {
                throw new WorkflowError(`${type} workflow needs at least one approver`);
            }
            if (steps.some((step) => !WORKFLOW_STEP_ROLES.includes(step))) {
                throw new WorkflowError(`${type} workflow has an unknown approver role`);
            }
            next.workflows = { ...next.workflows, [type]: steps };
        });
    }
    if (input.execByDepartment) {
        Object.values(input.execByDepartment).forEach((role) => {
            if (!["COO", "CTO"].includes(role)) throw new WorkflowError("COO/CTO mapping must be COO or CTO");
        });
        next.execByDepartment = input.execByDepartment;
    }
    if (input.defaultExec) {
        if (!["COO", "CTO"].includes(input.defaultExec)) throw new WorkflowError("Default must be COO or CTO");
        next.defaultExec = input.defaultExec;
    }
    if (input.departmentCodes) {
        Object.values(input.departmentCodes).forEach((code) => {
            if (!/^[A-Z]{2,5}$/.test(String(code))) throw new WorkflowError("Department codes must be 2-5 capital letters");
        });
        next.departmentCodes = input.departmentCodes;
    }
    if (input.timezone !== undefined) {
        if (!isValidTimeZone(input.timezone)) throw new WorkflowError("Unknown timezone");
        next.timezone = input.timezone;
    }
    if (input.currency) next.currency = String(input.currency).slice(0, 8);
    if (input.currencySymbol !== undefined) next.currencySymbol = String(input.currencySymbol).slice(0, 8);

    await db.query(
        `UPDATE recruitment_settings SET settings = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
        [JSON.stringify(next)]
    );
    return next;
}

const isValidTimeZone = (timeZone) => {
    try {
        new Intl.DateTimeFormat("en-CA", { timeZone: String(timeZone) });
        return Boolean(timeZone);
    } catch {
        return false;
    }
};

// "Today" (YYYY-MM-DD) in the company timezone from HR Settings (synced from the
// Settings page), falling back to COMPANY_TIMEZONE. Used for MPR application dates,
// recruitment plan deadlines and Careers page visibility.
export async function getRecruitmentToday(db = pool) {
    const { timezone } = await getRecruitmentSettings(db);
    if (!isValidTimeZone(timezone)) return getCompanyToday();
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Workflow for a request, with COO/CTO resolved by department
export const resolveWorkflowSteps = (settings, requestType, department) =>
    (settings.workflows[requestType] || []).map((step) =>
        step === "EXEC" ? lookupByDepartment(settings.execByDepartment, department) || settings.defaultExec : step
    );

export async function getActor(db, employeeId) {
    if (!employeeId) throw new WorkflowError("Sign in again: your employee ID is missing", 401);
    const result = await db.query(
        `SELECT employee_id, name, email, department, LOWER(COALESCE(role, '')) AS role FROM employees WHERE employee_id = $1`,
        [employeeId]
    );
    if (result.rows.length === 0) throw new WorkflowError("Unknown user", 401);
    return result.rows[0];
}

export async function getRolesFor(db, employeeId) {
    const actor = await getActor(db, employeeId);
    const result = await db.query(
        `SELECT role_key, department FROM workflow_role_assignments WHERE employee_id = $1 ORDER BY role_key`,
        [employeeId]
    );
    const roles = result.rows.map((row) => ({ role: row.role_key, department: row.department }));
    if (actor.role === "hr" && !roles.some((item) => item.role === "HR")) roles.push({ role: "HR", department: null });
    return { actor, roles };
}

const isHR = (roles) => roles.some((item) => item.role === "HR");

// Employee IDs that can act on a workflow role for a department
export async function getApproverIds(db, roleKey, department) {
    const scoped = DEPARTMENT_SCOPED_ROLES.includes(roleKey);
    const result = await db.query(
        `
        SELECT employee_id FROM workflow_role_assignments
        WHERE role_key = $1 AND ($2::boolean = FALSE OR LOWER(department) = LOWER($3))
        ${roleKey === "HR" ? "UNION SELECT employee_id FROM employees WHERE LOWER(COALESCE(role, '')) = 'hr'" : ""}
        `,
        [roleKey, scoped, department || ""]
    );
    return [...new Set(result.rows.map((row) => row.employee_id))];
}

const canRaiseFor = (roles, department) =>
    isHR(roles) || roles.some((item) => item.role === "DEPT_COORDINATOR" && sameText(item.department, department));

// =====================================================
// BUDGET CHECK (New Position)
// =====================================================

// Budget check for a New Position MPR (Replacement MPRs skip it). Existing employees are NOT counted:
//   available       = budgeted positions − openings of OTHER New Position MPRs (Pending / Approved)
//   salaryAvailable = annual salary budget − yearly cost of those MPRs (max salary × 12 × openings)
// status: "match" (requested = available), "under" (fewer), "exceeded" (more positions, or cost over
// the salary available), "no_budget" (no row for the department + year).
export async function computeBudget(db, { department, year, openings, salaryMax, excludeMprId = null }) {
    const requested = Math.max(0, Math.trunc(Number(openings) || 0));
    const monthlyMax = Math.max(0, Number(salaryMax) || 0);
    const requestCost = roundMoney(monthlyMax * 12 * requested);
    const base = { department, year, requested, salaryMax: monthlyMax, requestCost };

    const budgetResult = await db.query(
        `SELECT headcount AS budgeted_positions, salary_budget::float AS salary_budget
         FROM department_headcount_budgets WHERE LOWER(department) = LOWER($1) AND year = $2`,
        [department, year]
    );
    if (budgetResult.rows.length === 0) {
        return { ...base, status: "no_budget", reason: `No budget set for ${department} (${year}). Set it in Settings → Recruitment Masters.` };
    }

    const { budgeted_positions: budgetedPositions, salary_budget: salaryBudget } = budgetResult.rows[0];
    const usedResult = await db.query(
        `
        SELECT COALESCE(SUM(COALESCE(openings, 0)), 0)::int AS positions,
               COALESCE(SUM(COALESCE(salary_max, 0) * 12 * COALESCE(openings, 0)), 0)::float AS cost
        FROM manpower_requests
        WHERE LOWER(department) = LOWER($1)
          AND request_type = 'New Position'
          AND (status = 'Approved' OR status LIKE 'Pending %')
          AND EXTRACT(YEAR FROM COALESCE(application_start_date, required_by, created_at::date)) = $2
          AND ($3::bigint IS NULL OR id <> $3)
        `,
        [department, year, excludeMprId]
    );
    const alreadyUsed = usedResult.rows[0].positions;
    const salaryUsed = roundMoney(usedResult.rows[0].cost);

    const available = Math.max(0, budgetedPositions - alreadyUsed);
    const salaryAvailable = Math.max(0, roundMoney(salaryBudget - salaryUsed));
    const positionsExceeded = requested > available;
    const salaryExceeded = requestCost > salaryAvailable;

    return {
        ...base,
        status: positionsExceeded || salaryExceeded ? "exceeded" : requested < available ? "under" : "match",
        budgetedPositions,
        alreadyUsed,
        available,
        positionsExceeded,
        exceededBy: Math.max(0, requested - available),
        remaining: Math.max(0, available - requested),
        salaryBudget,
        salaryUsed,
        salaryAvailable,
        salaryExceeded,
        salaryExceededBy: Math.max(0, roundMoney(requestCost - salaryAvailable)),
    };
}

// Stored on the MPR and shown in the list: "within" (match / under) or "exception" (exceeded / no budget)
export const budgetStatusFor = (budget) => (!budget ? null : ["match", "under"].includes(budget.status) ? "within" : "exception");

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Budget year = year of the Application Start Date
const budgetYear = (startDate, today) => Number(String(startDate || today).slice(0, 4));

// DATE column → "YYYY-MM-DD" (pg returns DATE as a local-midnight Date)
const formatDateKey = (value) => {
    if (!value) return "—";
    if (!(value instanceof Date)) return String(value).slice(0, 10);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};

// Real calendar date only (2026-02-31 is rejected, not rolled over to March)
const isDateKey = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

// =====================================================
// INPUT
// =====================================================

const yesNo = (value) => value === true || value === "Yes" || value === "yes" || value === "true";

const normalizeInput = (body) => {
    const benefits = body.benefits || {};
    const assets = Array.isArray(body.assets) ? body.assets.filter((asset) => ASSET_OPTIONS.includes(asset)) : [];
    const number = (value) => (value === "" || value === null || value === undefined ? null : Number(value));

    return {
        request_type: body.request_type,
        title: body.title?.trim() || null,
        department: body.department?.trim() || null,
        openings: number(body.openings),
        experience: body.experience?.trim() || null,
        location: body.location?.trim() || null,
        employment_type: body.employment_type || "Full Time",
        job_description: body.job_description?.trim() || null,
        skills: body.skills?.trim() || null,
        salary_min: number(body.salary_min),
        salary_max: number(body.salary_max),
        benefits: {
            air_ticket: yesNo(benefits.air_ticket),
            allowances: String(benefits.allowances || "").trim(),
            vehicle: yesNo(benefits.vehicle),
            medical_insurance_category: String(benefits.medical_insurance_category || "").trim(),
            accommodation: yesNo(benefits.accommodation),
        },
        application_start_date: String(body.application_start_date || "").slice(0, 10) || null,
        application_end_date: String(body.application_end_date || "").slice(0, 10) || null,
        justification: body.justification?.trim() || null,
        assets,
        asset_other: assets.includes("Other") ? body.asset_other?.trim() || null : null,
        replaced_employee_id: body.request_type === "Replacement" ? body.replaced_employee_id || null : null,
        replacement_reason: body.request_type === "Replacement" ? body.replacement_reason?.trim() || null : null,
        // Company currency from HR portal → Settings (falls back to the server copy)
        currency: String(body.currency || "").trim().slice(0, 8) || null,
    };
};

// Format always (drafts too); start ≥ today and end ≥ start
function validateApplicationPeriod(input, today) {
    const { application_start_date: start, application_end_date: end } = input;
    if (start && !isDateKey(start)) throw new WorkflowError("Application Start Date is not a valid date");
    if (end && !isDateKey(end)) throw new WorkflowError("Application End Date is not a valid date");
    if (start && start < today) throw new WorkflowError("Application Start Date must be today or later");
    if (start && end && end < start) throw new WorkflowError("Application End Date must be on or after the Application Start Date");
    if (!start && end && end < today) throw new WorkflowError("Application End Date must be today or later");
}

async function validateForSubmit(db, input, today) {
    const missing = [];
    if (!REQUEST_TYPES.includes(input.request_type)) missing.push("Request Type");
    if (!input.title) missing.push("Job Title");
    if (!input.department) missing.push("Department");
    if (!(input.openings >= 1)) missing.push("No. of Openings");
    if (!input.experience) missing.push("Experience");
    if (!input.location) missing.push("Location");
    if (!input.job_description) missing.push("Job Description");
    if (!input.skills) missing.push("Required Skills");
    if (!(input.salary_min > 0)) missing.push("Minimum Salary");
    if (!(input.salary_max > 0)) missing.push("Maximum Salary");
    if (!input.application_start_date) missing.push("Application Start Date");
    if (!input.application_end_date) missing.push("Application End Date");
    if (input.request_type === "Replacement") {
        if (!input.replaced_employee_id) missing.push("Employee being replaced");
        if (!input.replacement_reason) missing.push("Replacement reason");
    }
    if (input.assets.includes("Other") && !input.asset_other) missing.push("Other asset details");
    if (missing.length) throw new WorkflowError(`Please complete: ${missing.join(", ")}`);

    if (input.salary_min > input.salary_max) throw new WorkflowError("Minimum salary cannot be more than maximum salary");
    if (!EMPLOYMENT_TYPES.includes(input.employment_type)) throw new WorkflowError("Invalid employment type");
    validateApplicationPeriod(input, today);

    const location = await db.query(`SELECT 1 FROM recruitment_locations WHERE name = $1 AND active`, [input.location]);
    if (location.rows.length === 0) throw new WorkflowError("Choose a location from the Locations master");

    if (input.replaced_employee_id) {
        const replaced = await db.query(`SELECT 1 FROM employees WHERE employee_id = $1`, [input.replaced_employee_id]);
        if (replaced.rows.length === 0) throw new WorkflowError("Employee being replaced was not found");
    }
}

// =====================================================
// LOGGING / NOTIFYING
// =====================================================

const logAction = (db, mprId, action, actor, { stepRole = null, remark = null } = {}) =>
    db.query(
        `INSERT INTO manpower_request_actions (mpr_id, action, step_role, actor_id, actor_name, remark) VALUES ($1, $2, $3, $4, $5, $6)`,
        [mprId, action, stepRole, actor?.employee_id || null, actor?.name || "System", remark]
    );

async function notifyCurrentApprovers(db, mpr) {
    const role = mpr.workflow_steps[mpr.current_step];
    const approvers = await getApproverIds(db, role, mpr.department);
    const budgetNote = mpr.budget_status === "exception" ? " (budget exception)" : "";
    return createNotifications(db, approvers, {
        type: "mpr",
        title: `MPR ${mpr.mpr_no} awaits your approval`,
        message: `${mpr.request_type}: ${mpr.title} (${mpr.openings} × ${mpr.department})${budgetNote}. Open Manpower Requests → My Approvals.`,
        link: `mpr:${mpr.id}`,
    });
}

// =====================================================
// CREATE / EDIT / SUBMIT
// =====================================================

async function nextMprNumber(db) {
    const year = getCompanyToday().slice(0, 4);
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('mpr-number-' || $1))`, [year]);
    const result = await db.query(
        `SELECT COALESCE(MAX(SUBSTRING(mpr_no FROM '^MPR-\\d{4}-(\\d+)$')::int), 0) + 1 AS next FROM manpower_requests WHERE mpr_no LIKE $1`,
        [`MPR-${year}-%`]
    );
    return `MPR-${year}-${String(result.rows[0].next).padStart(4, "0")}`;
}

// action: "draft" | "submit"
export async function saveMpr(db, { id = null, body, actorId, action }) {
    const { actor, roles } = await getRolesFor(db, actorId);
    const input = normalizeInput(body);
    const settings = await getRecruitmentSettings(db);

    if (!input.department) throw new WorkflowError("Department is required");
    if (!REQUEST_TYPES.includes(input.request_type)) throw new WorkflowError("Request Type is required");
    if (!canRaiseFor(roles, input.department)) {
        throw new WorkflowError(`Only HR or the ${input.department} Department Coordinator can raise this MPR`, 403);
    }

    let existing = null;
    if (id) {
        const found = await db.query(`SELECT * FROM manpower_requests WHERE id = $1 FOR UPDATE`, [id]);
        existing = found.rows[0];
        if (!existing) throw new WorkflowError("MPR not found", 404);
        if (!["Draft", "Sent Back"].includes(existing.status)) {
            throw new WorkflowError(`An MPR that is ${existing.status} can't be edited`);
        }
        if (existing.requested_by !== actor.employee_id && !isHR(roles)) {
            throw new WorkflowError("Only the requester or HR can edit this MPR", 403);
        }
        if (existing.status === "Sent Back" && !sameText(existing.department, input.department)) {
            throw new WorkflowError("Department can't change after the MPR entered approval");
        }
    }

    let budget = null;
    let steps = existing?.workflow_steps || null;
    let currentStep = null;
    let status = existing?.status || "Draft";

    const today = await getRecruitmentToday(db);
    if (action === "submit") {
        await validateForSubmit(db, input, today);

        if (input.request_type === "New Position") {
            budget = await computeBudget(db, {
                department: input.department,
                year: budgetYear(input.application_start_date, today),
                openings: input.openings,
                salaryMax: input.salary_max,
                excludeMprId: id,
            });
            // Justification is mandatory only when the budget is exceeded or not set
            if (budgetStatusFor(budget) === "exception" && !input.justification) {
                throw new WorkflowError(budget.status === "no_budget"
                    ? `${budget.reason} Enter a justification to continue.`
                    : "Budget exceeded: enter a justification to continue");
            }
        }

        if (existing?.status === "Sent Back") {
            // Resume where it was sent back from; the workflow itself is unchanged
            currentStep = existing.resume_step ?? 0;
        } else {
            steps = resolveWorkflowSteps(settings, input.request_type, input.department);
            currentStep = 0;
        }
        status = `Pending ${roleLabel(steps[currentStep])}`;
    } else {
        validateApplicationPeriod(input, today);
    }

    const values = [
        input.request_type, status, steps ? JSON.stringify(steps) : null, currentStep,
        input.title, input.department, input.openings, input.experience, input.location, input.employment_type,
        input.job_description, input.skills, input.salary_min, input.salary_max, input.currency || settings.currency,
        JSON.stringify(input.benefits), input.application_start_date, input.application_end_date, input.justification,
        JSON.stringify(input.assets), input.asset_other, input.replaced_employee_id, input.replacement_reason,
        budgetStatusFor(budget), budget ? JSON.stringify(budget) : null,
    ];

    let mpr;
    if (existing) {
        const result = await db.query(
            `
            UPDATE manpower_requests SET
                request_type = $1, status = $2, workflow_steps = $3::jsonb, current_step = $4,
                title = $5, department = $6, openings = $7, experience = $8, location = $9, employment_type = $10,
                job_description = $11, skills = $12, salary_min = $13, salary_max = $14, currency = $15,
                benefits = $16::jsonb, application_start_date = $17, application_end_date = $18, justification = $19,
                assets = $20::jsonb, asset_other = $21, replaced_employee_id = $22, replacement_reason = $23,
                budget_status = $24, budget_snapshot = $25::jsonb,
                resume_step = CASE WHEN $2 LIKE 'Pending %' THEN NULL ELSE resume_step END,
                submitted_at = CASE WHEN $2 LIKE 'Pending %' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $26
            RETURNING *
            `,
            [...values, id]
        );
        mpr = result.rows[0];
    } else {
        const mprNo = await nextMprNumber(db);
        const result = await db.query(
            `
            INSERT INTO manpower_requests (
                request_type, status, workflow_steps, current_step,
                title, department, openings, experience, location, employment_type,
                job_description, skills, salary_min, salary_max, currency,
                benefits, application_start_date, application_end_date, justification,
                assets, asset_other, replaced_employee_id, replacement_reason,
                budget_status, budget_snapshot, mpr_no, requested_by, submitted_at
            ) VALUES (
                $1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                $16::jsonb, $17, $18, $19, $20::jsonb, $21, $22, $23, $24, $25::jsonb, $26, $27,
                CASE WHEN $2 LIKE 'Pending %' THEN CURRENT_TIMESTAMP END
            )
            RETURNING *
            `,
            [...values, mprNo, actor.employee_id]
        );
        mpr = result.rows[0];
        await logAction(db, mpr.id, "Created", actor);
    }

    let emails = [];
    if (action === "submit") {
        const resubmitted = existing?.status === "Sent Back";
        await logAction(db, mpr.id, resubmitted ? "Resubmitted" : "Submitted", actor, {
            remark: budgetStatusFor(budget) === "exception" ? `Budget exception: ${input.justification}` : null,
        });
        emails = await notifyCurrentApprovers(db, mpr);
    } else {
        await logAction(db, mpr.id, "Saved as draft", actor);
    }

    return { mpr, emails };
}

// =====================================================
// APPROVER ACTIONS
// =====================================================

async function lockPendingMpr(db, id, actorId) {
    const { actor } = await getRolesFor(db, actorId);
    const found = await db.query(`SELECT * FROM manpower_requests WHERE id = $1 FOR UPDATE`, [id]);
    const mpr = found.rows[0];
    if (!mpr) throw new WorkflowError("MPR not found", 404);
    if (!String(mpr.status).startsWith("Pending ")) throw new WorkflowError(`This MPR is ${mpr.status}; there is nothing to approve`);

    const role = mpr.workflow_steps[mpr.current_step];
    const approvers = await getApproverIds(db, role, mpr.department);
    if (!approvers.includes(actor.employee_id)) {
        throw new WorkflowError(`Only the ${roleLabel(role)} approver can act on this step`, 403);
    }
    return { actor, mpr, role };
}

export async function approveMpr(db, { id, actorId, remark }) {
    const { actor, mpr, role } = await lockPendingMpr(db, id, actorId);
    await logAction(db, mpr.id, "Approved", actor, { stepRole: role, remark: remark?.trim() || null });

    const nextStep = mpr.current_step + 1;
    if (nextStep < mpr.workflow_steps.length) {
        const result = await db.query(
            `UPDATE manpower_requests SET current_step = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
            [mpr.id, nextStep, `Pending ${roleLabel(mpr.workflow_steps[nextStep])}`]
        );
        const emails = await notifyCurrentApprovers(db, result.rows[0]);
        return { mpr: result.rows[0], emails };
    }

    return finalizeMpr(db, mpr, actor);
}

export async function rejectMpr(db, { id, actorId, remark }) {
    if (!remark?.trim()) throw new WorkflowError("A reason is required to reject");
    const { actor, mpr, role } = await lockPendingMpr(db, id, actorId);

    const result = await db.query(
        `UPDATE manpower_requests SET status = 'Rejected', decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        [mpr.id]
    );
    await logAction(db, mpr.id, "Rejected", actor, { stepRole: role, remark: remark.trim() });
    const emails = await createNotifications(db, [mpr.requested_by], {
        type: "mpr",
        title: `MPR ${mpr.mpr_no} was rejected`,
        message: `${roleLabel(role)} rejected "${mpr.title}": ${remark.trim()}`,
        link: `mpr:${mpr.id}`,
    });
    return { mpr: result.rows[0], emails };
}

export async function sendBackMpr(db, { id, actorId, remark }) {
    if (!remark?.trim()) throw new WorkflowError("A remark is required to send back");
    const { actor, mpr, role } = await lockPendingMpr(db, id, actorId);

    const result = await db.query(
        `UPDATE manpower_requests SET status = 'Sent Back', resume_step = current_step, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        [mpr.id]
    );
    await logAction(db, mpr.id, "Sent Back", actor, { stepRole: role, remark: remark.trim() });
    const emails = await createNotifications(db, [mpr.requested_by], {
        type: "mpr",
        title: `MPR ${mpr.mpr_no} was sent back`,
        message: `${roleLabel(role)} sent back "${mpr.title}": ${remark.trim()}. Edit and resubmit it from Manpower Requests.`,
        link: `mpr:${mpr.id}`,
    });
    return { mpr: result.rows[0], emails };
}

export async function cancelMpr(db, { id, actorId, remark }) {
    const { actor, roles } = await getRolesFor(db, actorId);
    const found = await db.query(`SELECT * FROM manpower_requests WHERE id = $1 FOR UPDATE`, [id]);
    const mpr = found.rows[0];
    if (!mpr) throw new WorkflowError("MPR not found", 404);
    if (FINAL_STATUSES.includes(mpr.status)) throw new WorkflowError(`This MPR is already ${mpr.status}`);
    if (mpr.requested_by !== actor.employee_id && !isHR(roles)) {
        throw new WorkflowError("Only the requester or HR can cancel this MPR", 403);
    }

    const result = await db.query(
        `UPDATE manpower_requests SET status = 'Cancelled', decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        [mpr.id]
    );
    await logAction(db, mpr.id, "Cancelled", actor, { remark: remark?.trim() || null });
    return { mpr: result.rows[0], emails: [] };
}

// =====================================================
// FINAL APPROVAL → JOB OPENING
// =====================================================

const departmentCode = (settings, department) =>
    lookupByDepartment(settings.departmentCodes, department) ||
    String(department).replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() ||
    "JOB";

// IT001, IT002, FIN001 … (legacy JOB001/JOB002 are left untouched)
export async function nextJobId(db, department, settings) {
    const code = departmentCode(settings, department);
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('job-id-' || $1))`, [code]);
    const result = await db.query(
        `SELECT COALESCE(MAX(SUBSTRING(job_id FROM $2)::int), 0) + 1 AS next FROM public.jobs WHERE job_id ~ $1`,
        [`^${code}[0-9]+$`, `^${code}([0-9]+)$`]
    );
    return `${code}${String(result.rows[0].next).padStart(3, "0")}`;
}

const formatMoney = (value) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

async function finalizeMpr(db, mpr, actor) {
    const settings = await getRecruitmentSettings(db);
    const jobId = await nextJobId(db, mpr.department, settings);
    const compensation = `${mpr.currency || settings.currency} ${formatMoney(mpr.salary_min)} – ${formatMoney(mpr.salary_max)} / month`;

    await db.query(
        `
        INSERT INTO public.jobs (
            job_id, title, department, openings, experience, location, employment_type,
            job_description, skills, compensation, status, mpr_id, request_type,
            application_start_date, application_deadline
        )
        -- Application period copied in SQL (no JS Date / timezone round trip)
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Open', $11, $12,
               m.application_start_date, m.application_end_date
        FROM manpower_requests m WHERE m.id = $11
        `,
        [
            jobId, mpr.title, mpr.department, mpr.openings, mpr.experience, mpr.location, mpr.employment_type,
            mpr.job_description, mpr.skills, compensation, mpr.id, mpr.request_type,
        ]
    );

    const result = await db.query(
        `UPDATE manpower_requests SET status = 'Approved', job_id = $2, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        [mpr.id, jobId]
    );
    await logAction(db, mpr.id, "Job opening created", null, { remark: `${jobId} created with status Open` });

    const emails = [];
    const assetList = (mpr.assets || []).map((asset) => (asset === "Other" && mpr.asset_other ? `Other: ${mpr.asset_other}` : asset));
    const procurement = await getApproverIds(db, "PROCUREMENT", mpr.department);
    const itTeam = await getApproverIds(db, "IT", mpr.department);
    const hrTeam = await getApproverIds(db, "HR", mpr.department);

    if (assetList.length) {
        emails.push(...await createNotifications(db, [...procurement, ...itTeam], {
            type: "mpr-assets",
            title: `Assets required for ${jobId}`,
            message: `${mpr.openings} × ${mpr.title} (${mpr.department}, ${mpr.location}) needs: ${assetList.join(", ")}. MPR ${mpr.mpr_no}; applications ${formatDateKey(mpr.application_start_date)} – ${formatDateKey(mpr.application_end_date)}.`,
            link: `job:${jobId}`,
        }));
    }
    if (mpr.benefits?.accommodation) {
        emails.push(...await createNotifications(db, procurement, {
            type: "mpr-accommodation",
            title: `Accommodation required for ${jobId}`,
            message: `Arrange accommodation for ${mpr.openings} × ${mpr.title} (${mpr.department}, ${mpr.location}). MPR ${mpr.mpr_no}.`,
            link: `job:${jobId}`,
        }));
    }
    emails.push(...await createNotifications(db, hrTeam, {
        type: "mpr-plan",
        title: `Complete recruitment plan for ${jobId}`,
        message: `MPR ${mpr.mpr_no} is fully approved and job opening ${jobId} (${mpr.title}) was created. Complete its recruitment plan in Recruitment → Job Openings.`,
        link: `job:${jobId}`,
    }));
    emails.push(...await createNotifications(db, [mpr.requested_by], {
        type: "mpr",
        title: `MPR ${mpr.mpr_no} approved`,
        message: `Job opening ${jobId} was created for "${mpr.title}".`,
        link: `mpr:${mpr.id}`,
    }));
    await logAction(db, mpr.id, "Notified", null, {
        remark: [
            assetList.length ? `Procurement & IT: assets (${assetList.join(", ")})` : null,
            mpr.benefits?.accommodation ? "Procurement: accommodation" : null,
            "HR: complete recruitment plan",
        ].filter(Boolean).join(" • "),
    });

    return { mpr: result.rows[0], emails, jobId, finalActor: actor };
}

// =====================================================
// READ
// =====================================================

const MPR_SELECT = `
    SELECT m.*, TO_CHAR(m.required_by, 'YYYY-MM-DD') AS required_by,
           TO_CHAR(m.application_start_date, 'YYYY-MM-DD') AS application_start_date,
           TO_CHAR(m.application_end_date, 'YYYY-MM-DD') AS application_end_date,
           m.salary_min::float AS salary_min, m.salary_max::float AS salary_max,
           r.name AS requested_by_name, x.name AS replaced_employee_name
    FROM manpower_requests m
    LEFT JOIN employees r ON r.employee_id = m.requested_by
    LEFT JOIN employees x ON x.employee_id = m.replaced_employee_id
`;

export async function listMprs(db, { actorId, scope = "all" }) {
    const { actor, roles } = await getRolesFor(db, actorId);
    const result = await db.query(`${MPR_SELECT} ORDER BY m.updated_at DESC`);

    const pendingForActor = async (mpr) => {
        if (!String(mpr.status).startsWith("Pending ")) return false;
        const approvers = await getApproverIds(db, mpr.workflow_steps[mpr.current_step], mpr.department);
        return approvers.includes(actor.employee_id);
    };

    const rows = [];
    for (const mpr of result.rows) {
        const awaitingMe = await pendingForActor(mpr);
        const visible =
            scope === "approvals"
                ? awaitingMe
                : isHR(roles) ||
                  mpr.requested_by === actor.employee_id ||
                  roles.some((item) => item.role === "DEPT_COORDINATOR" && sameText(item.department, mpr.department)) ||
                  awaitingMe;
        if (visible) rows.push({ ...mpr, awaiting_me: awaitingMe, current_role: mpr.workflow_steps?.[mpr.current_step] || null });
    }

    if (scope !== "approvals") {
        // Include MPRs this user acted on before
        const acted = await db.query(`SELECT DISTINCT mpr_id FROM manpower_request_actions WHERE actor_id = $1`, [actor.employee_id]);
        const actedIds = new Set(acted.rows.map((row) => String(row.mpr_id)));
        result.rows.forEach((mpr) => {
            if (actedIds.has(String(mpr.id)) && !rows.some((row) => row.id === mpr.id)) {
                rows.push({ ...mpr, awaiting_me: false, current_role: mpr.workflow_steps?.[mpr.current_step] || null });
            }
        });
    }

    return rows;
}

export async function getMprDetail(db, { id, actorId }) {
    const { actor, roles } = await getRolesFor(db, actorId);
    const found = await db.query(`${MPR_SELECT} WHERE m.id = $1`, [id]);
    const mpr = found.rows[0];
    if (!mpr) throw new WorkflowError("MPR not found", 404);

    const actions = await db.query(
        `SELECT id, action, step_role, actor_id, actor_name, remark, created_at FROM manpower_request_actions WHERE mpr_id = $1 ORDER BY created_at, id`,
        [id]
    );

    // Workflow shown even for drafts (resolved from current settings)
    const settings = await getRecruitmentSettings(db);
    const steps = mpr.workflow_steps || resolveWorkflowSteps(settings, mpr.request_type, mpr.department);
    const stepApprovers = [];
    for (const role of steps) {
        const ids = await getApproverIds(db, role, mpr.department);
        const people = ids.length
            ? (await db.query(`SELECT employee_id, name FROM employees WHERE employee_id = ANY($1::text[]) ORDER BY name`, [ids])).rows
            : [];
        stepApprovers.push({ role, label: roleLabel(role), approvers: people });
    }

    const awaitingMe = String(mpr.status).startsWith("Pending ") &&
        stepApprovers[mpr.current_step]?.approvers.some((person) => person.employee_id === actor.employee_id);

    return {
        ...mpr,
        workflow: stepApprovers,
        actions: actions.rows,
        permissions: {
            canApprove: Boolean(awaitingMe),
            canEdit: ["Draft", "Sent Back"].includes(mpr.status) && (mpr.requested_by === actor.employee_id || isHR(roles)),
            canCancel: !FINAL_STATUSES.includes(mpr.status) && (mpr.requested_by === actor.employee_id || isHR(roles)),
        },
    };
}

export async function getRecruitmentSummary(db = pool) {
    const result = await db.query(`
        SELECT
            (SELECT COUNT(*)::int FROM manpower_requests WHERE status LIKE 'Pending %') AS pending_mpr_approvals,
            (SELECT COUNT(*)::int FROM public.jobs WHERE LOWER(COALESCE(status, '')) IN ('open', 'recruitment in progress')) AS open_jobs,
            (SELECT COALESCE(SUM(GREATEST(j.openings - (
                    SELECT COUNT(*) FROM public.job_applications a
                    WHERE a.job_id = j.job_id AND LOWER(a.status) = ANY($1::text[])
                ), 0)), 0)::int
               FROM public.jobs j WHERE LOWER(COALESCE(j.status, '')) IN ('open', 'recruitment in progress')) AS open_positions,
            (SELECT COUNT(DISTINCT department)::int FROM public.jobs) AS departments
    `, [FILLED_APPLICATION_STATUSES]);
    return result.rows[0];
}

// =====================================================
// RECRUITMENT PLAN (HR) + FILL / CLOSE
// =====================================================

export async function saveRecruitmentPlan(db, { jobDbId, body, actorId }) {
    const { roles } = await getRolesFor(db, actorId);
    if (!isHR(roles)) throw new WorkflowError("Only HR can edit the recruitment plan", 403);

    const found = await db.query(`SELECT * FROM public.jobs WHERE id = $1 FOR UPDATE`, [jobDbId]);
    const job = found.rows[0];
    if (!job) throw new WorkflowError("Job not found", 404);

    const sourcing = body.sourcing;
    const agencyId = body.agency_id ? Number(body.agency_id) : null;
    const deadline = body.application_deadline;
    const recruiter = body.recruiter_employee_id || null;
    const panel = Array.isArray(body.interview_panel) ? [...new Set(body.interview_panel.filter(Boolean))] : [];

    if (!SOURCING_OPTIONS.includes(sourcing)) throw new WorkflowError("Choose a sourcing option");
    if (sourcing !== "Internal" && !agencyId) throw new WorkflowError("Choose a recruitment agency");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(deadline || ""))) throw new WorkflowError("Application deadline is required");
    if (deadline < await getRecruitmentToday(db)) throw new WorkflowError("Application deadline must be today or later");
    const startDate = (await db.query(`SELECT TO_CHAR(application_start_date, 'YYYY-MM-DD') AS d FROM public.jobs WHERE id = $1`, [jobDbId])).rows[0]?.d;
    if (startDate && deadline < startDate) throw new WorkflowError("Application deadline can't be before the application start date");
    if (agencyId) {
        const agency = await db.query(`SELECT 1 FROM recruitment_agencies WHERE id = $1 AND active`, [agencyId]);
        if (agency.rows.length === 0) throw new WorkflowError("Agency not found");
    }
    const people = [recruiter, ...panel].filter(Boolean);
    if (people.length) {
        const found = await db.query(`SELECT COUNT(DISTINCT employee_id)::int n FROM employees WHERE employee_id = ANY($1::text[])`, [people]);
        if (found.rows[0].n !== new Set(people).size) throw new WorkflowError("Recruiter or panel member not found");
    }

    const result = await db.query(
        `
        UPDATE public.jobs SET
            sourcing = $2,
            agency_id = $3,
            application_deadline = $4,
            recruiter_employee_id = $5,
            interview_panel = $6::jsonb,
            status = CASE WHEN LOWER(COALESCE(status, '')) = 'open' THEN 'Recruitment In Progress' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
        `,
        [jobDbId, sourcing, sourcing === "Internal" ? null : agencyId, deadline, recruiter, JSON.stringify(panel)]
    );

    if (job.mpr_id) {
        await logAction(db, job.mpr_id, "Recruitment plan saved", await getActor(db, actorId), {
            remark: `${job.job_id}: ${sourcing}, deadline ${deadline}`,
        });
    }
    return result.rows[0];
}

// Filled = applications marked Hired/Joined; the job closes when filled = openings
export async function refreshJobFill(db, jobCode) {
    await db.query(
        `
        UPDATE public.jobs j SET status = 'Closed', updated_at = CURRENT_TIMESTAMP
        WHERE j.job_id = $1
          AND LOWER(COALESCE(j.status, '')) <> 'closed'
          AND j.openings > 0
          AND (SELECT COUNT(*) FROM public.job_applications a
               WHERE a.job_id = j.job_id AND LOWER(a.status) = ANY($2::text[])) >= j.openings
        `,
        [jobCode, FILLED_APPLICATION_STATUSES]
    );
}
