// =====================================================
// RESIGNATION REQUEST — FRD SHELTER-HCM-SSP-20-001
//
// Pending Line Manager → Pending HR → Serving Notice → Exit Clearance → Final Settlement
//   → Exit Formalities → Completed
//                     ↘ Rejected (approver gives a reason)
//                     ↘ Withdrawn (employee before HR accepts, or HR records it during notice)
// Serving Notice / Exit Clearance actions live in resignationExit.js.
//
// Notice period and approval steps live in resignation_settings (HR portal →
// Settings). Approvers are the people holding the step's role in
// workflow_role_assignments (Settings → Approval Workflows).
// A daily job completes resignations the day after the last working day.
// =====================================================

import pool from "../db.js";
import { getCompanyToday } from "./leaveDateRules.js";
import { createNotifications, escapeHtml } from "./notificationService.js";
import { getAnnualLeaveBalance } from "./annualLeaveBalance.js";
import { AVAILABLE_SETTLEMENT_APPROVERS, DEFAULT_FINAL_SETTLEMENT, SETTLEMENT_APPROVERS, settlementApproverOf } from "./settlementCalculation.js";
import { WorkflowError, getActor, getApproverIds, getRolesFor, roleLabel } from "./manpowerWorkflow.js";

export const REASON_CATEGORIES = ["Better opportunity", "Personal", "Relocation", "Higher studies", "Health", "Other"];
export const RESIGNATION_STEP_ROLES = ["LINE_MANAGER", "DEPT_HEAD", "HR"];
export const FINAL_STATUSES = ["Rejected", "Withdrawn", "Completed"];
export const ACCEPTED_STATUSES = ["Accepted", "Serving Notice"];
export const EXIT_STATUSES = ["Exit Clearance", "Final Settlement", "Exit Formalities"];
// After HR accepted and before Completed: the leave cut-off applies
export const AFTER_ACCEPT_STATUSES = [...ACCEPTED_STATUSES, ...EXIT_STATUSES];
// Statuses that show "N days left"
export const COUNTDOWN_STATUSES = ["Accepted", "Serving Notice", "Exit Clearance"];
export const CLEARANCE_ITEM_TYPES = ["Asset", "Task", "Amount"];

// Settings → Resignation → Exit clearance (seed). useLineManager: with no owner set, the
// employee's Line Manager (Approval Workflows) clears this department.
export const DEFAULT_CLEARANCE_DEPARTMENTS = [
    { id: "line_manager", name: "Project / Line Manager", ownerId: null, useLineManager: true, items: [
        { id: "work_handover", name: "Work handover", type: "Task" },
        { id: "site_tools", name: "Site tools", type: "Asset" },
        { id: "ppe_kit", name: "PPE kit", type: "Asset" },
    ] },
    { id: "it", name: "IT", ownerId: null, items: [
        { id: "laptop", name: "Laptop", type: "Asset" },
        { id: "mobile_sim", name: "Mobile & SIM", type: "Asset" },
        { id: "system_access", name: "System access disabled", type: "Task" },
    ] },
    { id: "administration", name: "Administration", ownerId: null, items: [
        { id: "accommodation_key", name: "Accommodation key", type: "Asset" },
        { id: "vehicle_fuel_card", name: "Vehicle & fuel card", type: "Asset" },
        { id: "site_access_card", name: "Site access card", type: "Asset" },
    ] },
    { id: "finance", name: "Finance", ownerId: null, items: [
        { id: "loan_advance", name: "Loan / advance recovered", type: "Amount" },
        { id: "petty_cash", name: "Petty cash settled", type: "Amount" },
    ] },
    { id: "hr", name: "HR", ownerId: null, items: [
        { id: "company_id_card", name: "Company ID card", type: "Asset" },
        { id: "exit_interview", name: "Exit interview", type: "Task" },
    ] },
];

// Settings → Resignation → Final settlement (defaults and approver list: settlementCalculation.js)
export { DEFAULT_FINAL_SETTLEMENT };

export const DEFAULT_RESIGNATION_SETTINGS = {
    noticePeriodDays: 30,
    gradeOverrides: {},
    employmentTypeOverrides: {},
    workflow: ["LINE_MANAGER", "HR"],
    clearanceDepartments: DEFAULT_CLEARANCE_DEPARTMENTS,
    finalSettlement: DEFAULT_FINAL_SETTLEMENT,
};

export function cleanFinalSettlementSettings(input = {}) {
    const days = Number(input.gratuityDaysPerYear);
    const years = Number(input.minServiceYears);
    if (!Number.isFinite(days) || days < 0 || days > 365) throw new WorkflowError("Gratuity days per year must be 0–365");
    if (!Number.isFinite(years) || years < 0 || years > 50) throw new WorkflowError("Minimum service for gratuity must be 0–50 years");
    if (!["basic", "gross"].includes(input.leaveEncashmentBasis)) throw new WorkflowError("Leave encashment must use basic or gross salary");
    const approver = input.settlementApprover || DEFAULT_FINAL_SETTLEMENT.settlementApprover;
    if (!SETTLEMENT_APPROVERS.includes(approver)) throw new WorkflowError("Unknown settlement approver");
    if (!AVAILABLE_SETTLEMENT_APPROVERS.includes(approver)) throw new WorkflowError("Finance approval of settlements is coming soon; choose HR for now");
    return {
        gratuityDaysPerYear: Math.round(days * 100) / 100,
        minServiceYears: Math.round(years * 100) / 100,
        leaveEncashmentBasis: input.leaveEncashmentBasis,
        settlementApprover: approver,
    };
}

// =====================================================
// DATES (YYYY-MM-DD keys, company timezone)
// =====================================================

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toUtc = (key) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
};

const isDateKey = (value) => {
    if (!DATE_PATTERN.test(String(value || ""))) return false;
    return new Date(toUtc(value)).toISOString().slice(0, 10) === value;
};

export const addDays = (key, days) => new Date(toUtc(key) + days * 86400000).toISOString().slice(0, 10);
export const daysBetween = (fromKey, toKey) => Math.round((toUtc(toKey) - toUtc(fromKey)) / 86400000);

export const formatDateKey = (key) =>
    key
        ? new Date(toUtc(key)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
        : "—";

// =====================================================
// SCHEMA
// =====================================================

export async function ensureResignationSchema(db = pool) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS resignation_settings (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            settings JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(
        `INSERT INTO resignation_settings (id, settings) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(DEFAULT_RESIGNATION_SETTINGS)]
    );

    await db.query(`
        CREATE TABLE IF NOT EXISTS resignations (
            id BIGSERIAL PRIMARY KEY,
            resignation_no TEXT UNIQUE,
            employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
            resignation_date DATE NOT NULL,
            notice_period_days INTEGER NOT NULL CHECK (notice_period_days >= 0),
            notice_period_source TEXT,
            calculated_last_working_day DATE NOT NULL,
            requested_last_working_day DATE NOT NULL,
            last_working_day DATE NOT NULL,
            early_release BOOLEAN NOT NULL DEFAULT FALSE,
            early_release_reason TEXT,
            reason_category TEXT NOT NULL,
            details TEXT NOT NULL,
            letter_url TEXT,
            letter_name TEXT,
            acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
            status TEXT NOT NULL CHECK (status LIKE 'Pending %' OR status IN ('Accepted', 'Serving Notice', 'Completed', 'Rejected', 'Withdrawn')),
            workflow_steps JSONB NOT NULL,
            current_step INTEGER,
            rejection_reason TEXT,
            accepted_by TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
            accepted_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            withdrawn_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    // Only one active resignation per employee
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS resignations_one_active_idx
        ON resignations (employee_id) WHERE status NOT IN ('Rejected', 'Withdrawn', 'Completed')
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS resignations_status_idx ON resignations (status)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS resignation_actions (
            id BIGSERIAL PRIMARY KEY,
            resignation_id BIGINT NOT NULL REFERENCES resignations(id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            step_role TEXT,
            actor_id TEXT,
            actor_name TEXT,
            remark TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS resignation_actions_resignation_idx ON resignation_actions (resignation_id, created_at)`);

    // Placeholder for the End of Service module
    await db.query(`
        CREATE TABLE IF NOT EXISTS end_of_service_queue (
            id BIGSERIAL PRIMARY KEY,
            employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
            resignation_id BIGINT UNIQUE REFERENCES resignations(id) ON DELETE CASCADE,
            last_working_day DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS end_of_service_queue_status_idx ON end_of_service_queue (status)`);
}

// =====================================================
// SETTINGS
// =====================================================

export async function getResignationSettings(db = pool) {
    const result = await db.query("SELECT settings FROM resignation_settings WHERE id = 1");
    const stored = result.rows[0]?.settings || {};
    return { ...DEFAULT_RESIGNATION_SETTINGS, ...stored, finalSettlement: { ...DEFAULT_FINAL_SETTLEMENT, ...(stored.finalSettlement || {}) } };
}

const validDays = (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 365;

const cleanOverrides = (overrides, label) =>
    Object.fromEntries(Object.entries(overrides || {}).map(([key, days]) => {
        const name = String(key).trim();
        if (!name) throw new WorkflowError(`${label} override needs a name`);
        if (!validDays(days)) throw new WorkflowError(`${label} "${name}" notice period must be 1–365 days`);
        return [name, Number(days)];
    }));

export async function saveResignationSettings(input, db = pool) {
    const next = await getResignationSettings(db);

    if (input.noticePeriodDays !== undefined) {
        if (!validDays(input.noticePeriodDays)) throw new WorkflowError("Notice period must be 1–365 days");
        next.noticePeriodDays = Number(input.noticePeriodDays);
    }
    if (input.gradeOverrides !== undefined) next.gradeOverrides = cleanOverrides(input.gradeOverrides, "Grade");
    if (input.employmentTypeOverrides !== undefined) {
        next.employmentTypeOverrides = cleanOverrides(input.employmentTypeOverrides, "Employment type");
    }
    if (input.workflow !== undefined) {
        const steps = input.workflow;
        if (!Array.isArray(steps) || steps.length === 0) throw new WorkflowError("Resignation workflow needs at least one approver");
        if (steps.some((step) => !RESIGNATION_STEP_ROLES.includes(step))) throw new WorkflowError("Resignation workflow has an unknown approver role");
        if (new Set(steps).size !== steps.length) throw new WorkflowError("Each approver can appear only once in the resignation workflow");
        if (steps[steps.length - 1] !== "HR") throw new WorkflowError("HR must be the last resignation approver (HR accepts the resignation)");
        next.workflow = steps;
    }
    if (input.clearanceDepartments !== undefined) {
        next.clearanceDepartments = await cleanClearanceDepartments(db, input.clearanceDepartments);
    }
    if (input.finalSettlement !== undefined) {
        next.finalSettlement = cleanFinalSettlementSettings({ ...DEFAULT_FINAL_SETTLEMENT, ...input.finalSettlement });
    }

    await db.query(
        `UPDATE resignation_settings SET settings = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
        [JSON.stringify(next)]
    );
    return next;
}

const slug = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// A unique id per list: "laptop", "laptop_2", ...
const uniqueIdIn = (used, wanted, fallback) => {
    const base = slug(wanted) || slug(fallback) || "item";
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}_${n}`;
    used.add(id);
    return id;
};

async function cleanClearanceDepartments(db, departments) {
    if (!Array.isArray(departments)) throw new WorkflowError("Exit clearance departments must be a list");
    const departmentIds = new Set();

    const cleaned = departments.map((department) => {
        const name = text(department?.name);
        if (!name) throw new WorkflowError("Each exit clearance department needs a name");
        const itemIds = new Set();
        return {
            id: uniqueIdIn(departmentIds, department.id, name),
            name,
            ownerId: text(department.ownerId) || null,
            ...(department.useLineManager ? { useLineManager: true } : {}),
            items: (Array.isArray(department.items) ? department.items : []).map((item) => {
                const itemName = text(item?.name);
                if (!itemName) throw new WorkflowError(`An item in "${name}" needs a name`);
                if (!CLEARANCE_ITEM_TYPES.includes(item.type)) {
                    throw new WorkflowError(`"${itemName}" in "${name}" needs a type (Asset, Task or Amount)`);
                }
                return { id: uniqueIdIn(itemIds, item.id, itemName), name: itemName, type: item.type };
            }),
        };
    });

    const owners = [...new Set(cleaned.map((department) => department.ownerId).filter(Boolean))];
    if (owners.length) {
        const found = await db.query(`SELECT employee_id FROM employees WHERE employee_id = ANY($1::text[])`, [owners]);
        const known = new Set(found.rows.map((row) => row.employee_id));
        const missing = owners.find((owner) => !known.has(owner));
        if (missing) throw new WorkflowError(`Clearance owner ${missing} is not an employee`);
    }
    return cleaned;
}

const findKey = (map, value) =>
    Object.keys(map || {}).find((key) => key.trim().toLowerCase() === String(value || "").trim().toLowerCase());

// Grade override wins, then employment type, then the default
export function noticePeriodFor(settings, employee) {
    const gradeKey = employee.grade ? findKey(settings.gradeOverrides, employee.grade) : undefined;
    if (gradeKey) return { days: settings.gradeOverrides[gradeKey], source: `Grade ${gradeKey}` };
    const typeKey = employee.employment_type ? findKey(settings.employmentTypeOverrides, employee.employment_type) : undefined;
    if (typeKey) return { days: settings.employmentTypeOverrides[typeKey], source: typeKey };
    return { days: settings.noticePeriodDays, source: "Company default" };
}

// =====================================================
// APPROVERS
// =====================================================

export async function hrIds(db, excludeId) {
    return (await getApproverIds(db, "HR", null)).filter((id) => id !== excludeId);
}

// Who can act on a step. Line Manager falls back to the Department Head, then HR,
// so a resignation never gets stuck. The resigning employee never approves their own.
export async function approversForStep(db, role, resignation) {
    const self = resignation.employee_id;
    const department = resignation.department;

    if (role === "LINE_MANAGER" || role === "DEPT_HEAD") {
        if (role === "LINE_MANAGER") {
            const managers = (await getApproverIds(db, "LINE_MANAGER", department)).filter((id) => id !== self);
            if (managers.length) return { ids: managers, via: null };
        }
        const heads = (await getApproverIds(db, "DEPT_HEAD", department)).filter((id) => id !== self);
        if (heads.length) {
            return { ids: heads, via: role === "LINE_MANAGER" ? "Department Head (no Line Manager assigned)" : null };
        }
        return { ids: await hrIds(db, self), via: `HR (no ${roleLabel(role)} assigned for ${department || "this department"})` };
    }

    return { ids: await hrIds(db, self), via: null };
}

async function payrollIds(db) {
    const payroll = await getApproverIds(db, "PAYROLL", null);
    return payroll.length ? payroll : getApproverIds(db, "FINANCE", null);
}

export const pendingStatus = (role) => `Pending ${roleLabel(role)}`;

// =====================================================
// LOADING
// =====================================================

const RESIGNATION_COLUMNS = `
    r.id, r.resignation_no, r.employee_id, e.name AS employee_name, e.department, e.designation, e.grade,
    e.employment_type, e.status AS employee_status, e.work_location,
    TO_CHAR(e.joining_date, 'YYYY-MM-DD') AS joining_date,
    TO_CHAR(r.resignation_date, 'YYYY-MM-DD') AS resignation_date,
    r.notice_period_days, r.notice_period_source,
    TO_CHAR(r.calculated_last_working_day, 'YYYY-MM-DD') AS calculated_last_working_day,
    TO_CHAR(r.requested_last_working_day, 'YYYY-MM-DD') AS requested_last_working_day,
    TO_CHAR(r.last_working_day, 'YYYY-MM-DD') AS last_working_day,
    r.early_release, r.early_release_reason, r.reason_category, r.details, r.letter_url, r.letter_name,
    r.acknowledged, r.status, r.workflow_steps, r.current_step, r.rejection_reason, r.accepted_by,
    r.accepted_at, r.completed_at, r.withdrawn_at, r.created_at, r.updated_at,
    r.hr_remarks, r.handover_notes, r.exit_main_reason, r.eligible_for_rehire, r.exit_internal_notes,
    r.clearance_started_at, r.clearance_completed_at,
    r.settlement_status, r.settlement_manual, r.settlement, r.settlement_sent_at, r.settlement_decided_by_name,
    r.settlement_decided_at, r.settlement_remark, r.exit_checklist, r.exit_documents, r.separated_at
`;

export async function loadResignation(db, id, { forUpdate = false } = {}) {
    if (forUpdate) await db.query(`SELECT id FROM resignations WHERE id = $1 FOR UPDATE`, [id]);
    const result = await db.query(
        `SELECT ${RESIGNATION_COLUMNS} FROM resignations r JOIN employees e ON e.employee_id = r.employee_id WHERE r.id = $1`,
        [id]
    );
    if (!result.rows[0]) throw new WorkflowError("Resignation not found", 404);
    return result.rows[0];
}

export async function getActiveResignationId(db, employeeId) {
    const result = await db.query(
        `SELECT id FROM resignations WHERE employee_id = $1 AND status <> ALL($2::text[]) ORDER BY id DESC LIMIT 1`,
        [employeeId, FINAL_STATUSES]
    );
    return result.rows[0]?.id || null;
}

// Employee Resignation page: the active resignation, or one whose separation is complete while the
// employee can still sign in (up to the last working day), so the downloads stay available
export async function getTrackedResignationId(db, employeeId, { today = getCompanyToday() } = {}) {
    const activeId = await getActiveResignationId(db, employeeId);
    if (activeId) return activeId;
    const result = await db.query(
        `SELECT id FROM resignations
         WHERE employee_id = $1 AND status = 'Completed' AND separated_at IS NOT NULL AND last_working_day >= $2::date
         ORDER BY id DESC LIMIT 1`,
        [employeeId, today]
    );
    return result.rows[0]?.id || null;
}

export const logAction = (db, resignationId, action, actor, { stepRole = null, remark = null } = {}) =>
    db.query(
        `INSERT INTO resignation_actions (resignation_id, action, step_role, actor_id, actor_name, remark) VALUES ($1, $2, $3, $4, $5, $6)`,
        [resignationId, action, stepRole, actor?.employee_id || null, actor?.name || "System", remark]
    );

export const notifyEmployee = (db, resignation, title, message) =>
    createNotifications(db, [resignation.employee_id], { type: "resignation", title, message, link: `resignation:${resignation.id}` });

async function notifyCurrentApprovers(db, resignation) {
    const role = resignation.workflow_steps[resignation.current_step];
    const { ids } = await approversForStep(db, role, resignation);
    const early = resignation.early_release ? " Early release requested." : "";
    return createNotifications(db, ids, {
        type: "resignation",
        title: `Resignation ${resignation.resignation_no} awaits your approval`,
        message: `${resignation.employee_name} (${resignation.employee_id}, ${resignation.department || "—"}) resigned. Last working day ${formatDateKey(resignation.last_working_day)}.${early} Open Resignation → My Approvals.`,
        link: `resignation:${resignation.id}`,
    });
}

// =====================================================
// DETAIL / LISTS
// =====================================================

// Employee portal logins (separate from HR logins) may act only on Line Manager / Department Head
// steps they hold themselves, never on the HR step or on a step routed to HR as a fallback.
export const employeeCanActOnStep = (role, via, ids, actorId) =>
    role !== "HR" && !String(via || "").startsWith("HR") && ids.includes(actorId);

export const daysLeftFor = (resignation, today = getCompanyToday()) =>
    COUNTDOWN_STATUSES.includes(resignation.status) && resignation.last_working_day
        ? Math.max(0, daysBetween(today, resignation.last_working_day))
        : null;

const namesFor = async (db, ids) => {
    if (!ids.length) return new Map();
    const result = await db.query(`SELECT employee_id, name FROM employees WHERE employee_id = ANY($1::text[])`, [ids]);
    return new Map(result.rows.map((row) => [row.employee_id, row.name]));
};

// Exit clearance departments with their items; a department is cleared when no item is Pending
export async function loadClearance(db, resignationId) {
    const departments = await db.query(
        `SELECT id, department_key, name, owner_ids FROM resignation_clearance_departments WHERE resignation_id = $1 ORDER BY sort_order, id`,
        [resignationId]
    );
    if (!departments.rows.length) return [];
    const items = await db.query(
        `SELECT id, department_id, name, item_type, source, status, deduction_amount::float AS deduction_amount,
                remark, updated_by_name, updated_at
         FROM resignation_clearance_items WHERE resignation_id = $1 ORDER BY sort_order, id`,
        [resignationId]
    );
    const names = await namesFor(db, [...new Set(departments.rows.flatMap((row) => row.owner_ids || []))]);
    return departments.rows.map((department) => {
        const own = items.rows.filter((item) => String(item.department_id) === String(department.id));
        return {
            id: department.id,
            key: department.department_key,
            name: department.name,
            owners: (department.owner_ids || []).map((ownerId) => ({ employee_id: ownerId, name: names.get(ownerId) || ownerId })),
            items: own,
            cleared: own.every((item) => item.status !== "Pending"),
        };
    });
}

const roundMoney = (value) => (value === null || value === undefined ? null : Math.round(Number(value) * 100) / 100);

// HR-only facts for the case window's Details tab
// Leave balance for a resignation, the one source for the Details tab and the final settlement:
// the leave module's annual leave balance on the last working day
export async function resignationLeaveBalance(db, resignation) {
    const balance = await getAnnualLeaveBalance(resignation.employee_id, { asOf: resignation.last_working_day || undefined, db }).catch(() => null);
    return balance ? roundMoney(balance.available) : null;
}

async function loadEmployeeProfile(db, resignation, today) {
    const salary = await db.query(
        `SELECT basic_salary::float AS basic_salary, allowances::float AS allowances
         FROM employee_payroll WHERE employee_id = $1
         ORDER BY salary_month DESC NULLS LAST, updated_at DESC NULLS LAST LIMIT 1`,
        [resignation.employee_id]
    ).catch(() => ({ rows: [] }));
    const leaveBalance = await resignationLeaveBalance(db, resignation);
    const joined = resignation.joining_date;
    let service = null;
    if (joined && joined <= today) {
        const [y1, m1, d1] = joined.split("-").map(Number);
        const [y2, m2, d2] = today.split("-").map(Number);
        let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
        months = Math.max(0, months);
        service = { years: Math.floor(months / 12), months: months % 12 };
    }
    return {
        service,
        leave_balance: leaveBalance,
        leave_balance_as_of: resignation.last_working_day || null,
        basic_salary: roundMoney(salary.rows[0]?.basic_salary),
        allowances: roundMoney(salary.rows[0]?.allowances),
    };
}

export async function getResignationDetail(db, id, actorId, { today = getCompanyToday(), identityType } = {}) {
    const resignation = await loadResignation(db, id);
    const { actor, roles } = await getRolesFor(db, actorId);
    const isHR = identityType !== "employee" && roles.some((item) => item.role === "HR");
    const employeePortal = identityType === "employee";

    const workflow = await Promise.all(resignation.workflow_steps.map(async (role) => {
        const { ids, via } = await approversForStep(db, role, resignation);
        const people = ids.length
            ? (await db.query(`SELECT employee_id, name FROM employees WHERE employee_id = ANY($1::text[]) ORDER BY name`, [ids])).rows
            : [];
        return { role, label: roleLabel(role), via, approvers: people.map((row) => ({ employee_id: row.employee_id, name: row.name })) };
    }));

    const canActOn = (step) => {
        const ids = step.approvers.map((person) => person.employee_id);
        return employeePortal ? employeeCanActOnStep(step.role, step.via, ids, actor.employee_id) : ids.includes(actor.employee_id);
    };
    const isPending = resignation.status.startsWith("Pending ");
    const currentStep = isPending ? workflow[resignation.current_step] : null;
    const isCurrentApprover = Boolean(currentStep && canActOn(currentStep));
    const isOwner = resignation.employee_id === actor.employee_id;
    const everApprover = workflow.some(canActOn);

    if (!isOwner && !isHR && !everApprover) throw new WorkflowError("You can't view this resignation", 403);

    const [actions, clearance] = await Promise.all([
        db.query(
            `SELECT id, action, step_role, actor_id, actor_name, remark, created_at FROM resignation_actions WHERE resignation_id = $1 ORDER BY created_at, id`,
            [id]
        ),
        loadClearance(db, id),
    ]);

    const detail = {
        ...resignation,
        today,
        workflow,
        actions: actions.rows,
        clearance,
        days_remaining: daysLeftFor(resignation, today),
        // The letter is in a private bucket: opened through GET /api/resignations/:id/letter
        // (signed URL), so the stored path is not sent
        has_letter: Boolean(resignation.letter_url),
        permissions: {
            canApprove: isCurrentApprover,
            isFinalStep: isCurrentApprover && resignation.current_step === resignation.workflow_steps.length - 1,
            canWithdraw: isOwner && isPending,
            canViewLetter: Boolean(resignation.letter_url) && (isOwner || isHR),
            isHR,
        },
    };
    delete detail.letter_url;

    if (isHR) {
        const settings = await getResignationSettings(db);
        const notice = noticePeriodFor(settings, resignation);
        // Line manager for the Details tab; an HR fallback is not a line manager
        const lineManagerStep = workflow.find((step) => step.role === "LINE_MANAGER");
        let lineManagers = lineManagerStep && !String(lineManagerStep.via || "").startsWith("HR") ? lineManagerStep.approvers : null;
        if (!lineManagerStep) {
            const { ids, via } = await approversForStep(db, "LINE_MANAGER", resignation);
            const names = await namesFor(db, String(via || "").startsWith("HR") ? [] : ids);
            lineManagers = [...names].map(([personId, name]) => ({ employee_id: personId, name }));
        }
        lineManagers ||= [];
        Object.assign(detail, {
            profile: {
                ...(await loadEmployeeProfile(db, resignation, today)),
                line_managers: lineManagers.map((person) => person.name),
            },
            suggested_notice: {
                days: notice.days,
                source: notice.source,
                last_working_day: addDays(resignation.resignation_date, notice.days),
            },
        });
        // Final settlement figures (frozen once sent to Finance) and who approves them.
        // Loaded on demand: resignationSettlement.js imports this module.
        if (["Final Settlement", "Exit Formalities", "Completed"].includes(resignation.status)) {
            const { settlementForDetail, settlementEditorFor, financeIds } = await import("./resignationSettlement.js");
            const approver = settlementApproverOf(settings.finalSettlement);
            detail.settlement_approver = approver;
            detail.settlement_view = await settlementForDetail(db, resignation);
            if (approver === "FINANCE") {
                const finance = await financeIds(db);
                const names = await namesFor(db, finance);
                detail.finance_approvers = finance.map((personId) => names.get(personId) || personId);
                detail.permissions.canDecideSettlement = resignation.status === "Final Settlement"
                    && resignation.settlement_status === "With Finance"
                    && finance.includes(actor.employee_id)
                    && actor.employee_id !== resignation.employee_id;
            }
            // HR approves in the case window: the raw inputs so the table recalculates while HR types
            if (resignation.status === "Final Settlement" && resignation.settlement_status !== "With Finance") {
                detail.settlement_editor = await settlementEditorFor(db, resignation);
                detail.permissions.canApproveSettlement = approver === "HR" && actor.employee_id !== resignation.employee_id;
            }
        }
    } else {
        // Exit interview, HR notes and settlement drafts are for HR only; the employee sees the
        // settlement once Finance has approved it
        for (const field of ["exit_main_reason", "eligible_for_rehire", "exit_internal_notes", "hr_remarks", "settlement_manual", "settlement_remark"]) delete detail[field];
        if (resignation.settlement_status !== "Approved") delete detail.settlement;
        if (!isOwner) delete detail.handover_notes;
    }
    return detail;
}

// Lists never carry the letter path (private bucket; opened via the signed-URL route)
const withoutLetterPath = ({ letter_url: letterUrl, ...row }) => ({ ...row, has_letter: Boolean(letterUrl) });

const listSelect = (where) => `
    SELECT ${RESIGNATION_COLUMNS} FROM resignations r JOIN employees e ON e.employee_id = r.employee_id
    ${where} ORDER BY r.created_at DESC, r.id DESC
`;

// employeePortal: only Line Manager / Department Head steps the person holds (see employeeCanActOnStep)
export async function listResignationsForApprover(db, actorId, { employeePortal = false } = {}) {
    await getActor(db, actorId);
    const pending = await db.query(listSelect(`WHERE r.status LIKE 'Pending %'`));
    const mine = [];
    for (const row of pending.rows) {
        const role = row.workflow_steps[row.current_step];
        const { ids, via } = await approversForStep(db, role, row);
        const allowed = employeePortal ? employeeCanActOnStep(role, via, ids, actorId) : ids.includes(actorId);
        if (allowed) mine.push({ ...row, awaiting_me: true });
    }
    return mine;
}

export async function listAllResignations(db = pool, { today = getCompanyToday() } = {}) {
    return (await db.query(listSelect(""))).rows.map((row) => withoutLetterPath({ ...row, days_left: daysLeftFor(row, today) }));
}

export async function listEmployeeResignations(db, employeeId) {
    return (await db.query(listSelect(`WHERE r.employee_id = $1`), [employeeId])).rows.map(withoutLetterPath);
}

export async function listPendingEndOfService(db = pool) {
    const result = await db.query(`
        SELECT q.id, q.employee_id, e.name AS employee_name, e.department, e.designation,
               TO_CHAR(q.last_working_day, 'YYYY-MM-DD') AS last_working_day, q.status, q.resignation_id,
               r.resignation_no, q.created_at
        FROM end_of_service_queue q
        JOIN employees e ON e.employee_id = q.employee_id
        LEFT JOIN resignations r ON r.id = q.resignation_id
        WHERE q.status = 'Pending'
        ORDER BY q.last_working_day, e.name
    `);
    return result.rows;
}

// What the employee form needs: today, the notice period and the auto last working day
export async function getResignationFormInfo(db, employeeId, { today = getCompanyToday() } = {}) {
    const employee = await db.query(`SELECT employee_id, grade, employment_type FROM employees WHERE employee_id = $1`, [employeeId]);
    if (!employee.rows[0]) throw new WorkflowError("Employee not found", 404);
    const notice = noticePeriodFor(await getResignationSettings(db), employee.rows[0]);
    return {
        today,
        noticePeriodDays: notice.days,
        noticePeriodSource: notice.source,
        calculatedLastWorkingDay: addDays(today, notice.days),
        reasonCategories: REASON_CATEGORIES,
    };
}

// =====================================================
// SUBMIT
// =====================================================

async function nextResignationNumber(db, today) {
    const year = today.slice(0, 4);
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('resignation-number-' || $1))`, [year]);
    const result = await db.query(
        `SELECT COALESCE(MAX(SUBSTRING(resignation_no FROM '^RES-\\d{4}-(\\d+)$')::int), 0) + 1 AS next FROM resignations WHERE resignation_no LIKE $1`,
        [`RES-${year}-%`]
    );
    return `RES-${year}-${String(result.rows[0].next).padStart(4, "0")}`;
}

export const text = (value) => String(value ?? "").trim();
const isChecked = (value) => value === true || value === "true" || value === "on" || value === "1";

// uploadLetter: optional async () => ({ url, name }), called only after validation passes
export async function submitResignation(db, { employeeId, body, uploadLetter = null, today = getCompanyToday() }) {
    const employeeResult = await db.query(
        `SELECT employee_id, name, email, department, grade, employment_type, status FROM employees WHERE employee_id = $1`,
        [employeeId]
    );
    const employee = employeeResult.rows[0];
    if (!employee) throw new WorkflowError("Sign in again: employee not found", 401);
    if (String(employee.status || "").toLowerCase() !== "active") throw new WorkflowError("Only active employees can submit a resignation");

    await db.query(`SELECT pg_advisory_xact_lock(hashtext('resignation-employee-' || $1))`, [employeeId]);
    const activeId = await getActiveResignationId(db, employeeId);
    if (activeId) {
        const active = await loadResignation(db, activeId);
        throw new WorkflowError(`You already have an active resignation (${active.resignation_no}: ${active.status})`, 409);
    }

    const reasonCategory = text(body.reason_category);
    const details = text(body.details);
    const missing = [];
    if (!REASON_CATEGORIES.includes(reasonCategory)) missing.push("Reason category");
    if (!details) missing.push("Details");
    if (!isChecked(body.acknowledged)) missing.push("Final settlement confirmation");
    if (missing.length) throw new WorkflowError(`Please complete: ${missing.join(", ")}`);

    const settings = await getResignationSettings(db);
    const notice = noticePeriodFor(settings, employee);
    const calculated = addDays(today, notice.days);
    const requested = text(body.last_working_day) || calculated;

    if (!isDateKey(requested)) throw new WorkflowError("Last working day must be a valid date (YYYY-MM-DD)");
    if (requested < today) throw new WorkflowError("Last working day can't be in the past");
    if (requested > calculated) {
        throw new WorkflowError(`Last working day can't be after ${formatDateKey(calculated)} (resignation date + ${notice.days}-day notice period)`);
    }

    const earlyRelease = requested < calculated;
    const earlyReason = text(body.early_release_reason);
    if (earlyRelease && !earlyReason) throw new WorkflowError("Enter a reason for requesting an early release");

    const letter = uploadLetter ? await uploadLetter() : null;
    const steps = settings.workflow;
    const number = await nextResignationNumber(db, today);

    const inserted = await db.query(
        `
        INSERT INTO resignations (
            resignation_no, employee_id, resignation_date, notice_period_days, notice_period_source,
            calculated_last_working_day, requested_last_working_day, last_working_day, early_release, early_release_reason,
            reason_category, details, letter_url, letter_name, acknowledged, status, workflow_steps, current_step
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12, $13, TRUE, $14, $15::jsonb, 0)
        RETURNING id
        `,
        [
            number, employeeId, today, notice.days, notice.source, calculated, requested, earlyRelease,
            earlyRelease ? earlyReason : null, reasonCategory, details, letter?.url || null, letter?.name || null,
            pendingStatus(steps[0]), JSON.stringify(steps),
        ]
    );

    const resignation = await loadResignation(db, inserted.rows[0].id);
    await logAction(db, resignation.id, "Submitted", employee, {
        remark: earlyRelease
            ? `Early release requested – last working day ${formatDateKey(requested)} instead of ${formatDateKey(calculated)}. Reason: ${earlyReason}`
            : `Last working day ${formatDateKey(requested)} (${notice.days}-day notice)`,
    });

    const emails = [
        ...(await notifyCurrentApprovers(db, resignation)),
        ...(await notifyEmployee(db, resignation, `Resignation ${number} submitted`, `Your resignation is ${resignation.status}. Last working day: ${formatDateKey(requested)}.`)),
    ];
    return { resignation, emails };
}

// =====================================================
// APPROVER ACTIONS
// =====================================================

async function requireCurrentApprover(db, resignation, actorId, { employeePortal = false } = {}) {
    if (!resignation.status.startsWith("Pending ")) {
        throw new WorkflowError(`This resignation is ${resignation.status}; there is nothing to approve`);
    }
    const role = resignation.workflow_steps[resignation.current_step];
    const actor = await getActor(db, actorId);
    const { ids, via } = await approversForStep(db, role, resignation);
    if (!ids.includes(actor.employee_id)) throw new WorkflowError(`Only the current approver (${roleLabel(role)}) can act on this resignation`, 403);
    if (employeePortal && !employeeCanActOnStep(role, via, ids, actor.employee_id)) {
        throw new WorkflowError("Open this resignation from the HR portal to act on it", 403);
    }
    return { actor, role };
}

// Acceptance letter (email text + HTML) sent to the employee when HR accepts
function acceptanceLetter(resignation, remark) {
    const lines = [
        `This letter confirms that your resignation ${resignation.resignation_no}, submitted on ${formatDateKey(resignation.resignation_date)}, has been accepted.`,
        `Notice period: ${resignation.notice_period_days} days.`,
        `Your last working day will be ${formatDateKey(resignation.last_working_day)}.`,
        "During your notice period please complete your work handover. Before your last working day you will be asked to return company property and complete exit clearance with each department.",
        "Your final settlement will be processed by HR after exit clearance.",
        ...(remark ? [`HR remarks: ${remark}`] : []),
        "We thank you for your contribution and wish you every success.",
    ];
    return {
        text: lines.join("\n\n"),
        html: lines.map((line, index) => (index === 2
            ? `<p><strong>${escapeHtml(line)}</strong></p>`
            : `<p>${escapeHtml(line)}</p>`)).join(""),
    };
}

// employeePortal: the caller signed in with an Employee portal login (see employeeCanActOnStep)
export async function approveResignation(db, { id, actorId, remark = "", lastWorkingDay = null, noticePeriodDays = null, employeePortal = false, today = getCompanyToday() }) {
    const resignation = await loadResignation(db, id, { forUpdate: true });
    const { actor, role } = await requireCurrentApprover(db, resignation, actorId, { employeePortal });
    const note = text(remark) || null;
    const isFinal = resignation.current_step === resignation.workflow_steps.length - 1;

    if (!isFinal) {
        const nextStep = resignation.current_step + 1;
        const nextStatus = pendingStatus(resignation.workflow_steps[nextStep]);
        await db.query(
            `UPDATE resignations SET current_step = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [id, nextStep, nextStatus]
        );
        await logAction(db, id, "Approved", actor, { stepRole: role, remark: note });
        const updated = await loadResignation(db, id);
        const emails = [
            ...(await notifyCurrentApprovers(db, updated)),
            ...(await notifyEmployee(db, updated, `Resignation ${updated.resignation_no}: ${nextStatus}`, `${roleLabel(role)} (${actor.name}) approved your resignation. It is now ${nextStatus}.`)),
        ];
        return { resignation: updated, emails };
    }

    // Final step (HR): accept with the notice period and last working day HR confirms
    // (pre-filled from Settings: grade override → employment type override → default)
    const previousLwd = resignation.last_working_day;
    let noticeDays = resignation.notice_period_days;
    if (noticePeriodDays !== null && noticePeriodDays !== undefined && noticePeriodDays !== "") {
        noticeDays = Number(noticePeriodDays);
        if (!Number.isInteger(noticeDays) || noticeDays < 0 || noticeDays > 365) throw new WorkflowError("Notice period must be 0–365 days");
    }
    const newLwd = text(lastWorkingDay) || previousLwd;
    if (!isDateKey(newLwd)) throw new WorkflowError("Last working day must be a valid date (YYYY-MM-DD)");
    if (newLwd < today) throw new WorkflowError("Last working day can't be in the past");
    if (newLwd < resignation.resignation_date) throw new WorkflowError("Last working day can't be before the resignation date");
    const changed = newLwd !== previousLwd;
    const noticeChanged = noticeDays !== resignation.notice_period_days;

    await db.query(
        `
        UPDATE resignations
        SET status = 'Serving Notice', current_step = NULL, last_working_day = $2,
            accepted_by = $3, accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
            notice_period_days = $4, notice_period_source = CASE WHEN $5 THEN 'Set by HR' ELSE notice_period_source END,
            hr_remarks = $6
        WHERE id = $1
        `,
        [id, newLwd, actor.employee_id, noticeDays, noticeChanged, note]
    );
    await logAction(db, id, "Accepted", actor, { stepRole: role, remark: note });
    if (noticeChanged) {
        await logAction(db, id, "Notice period changed", actor, {
            stepRole: role,
            remark: `${resignation.notice_period_days} → ${noticeDays} days`,
        });
    }
    if (changed) {
        await logAction(db, id, "Last working day changed", actor, {
            stepRole: role,
            remark: `${formatDateKey(previousLwd)} → ${formatDateKey(newLwd)}${note ? `: ${note}` : ""}`,
        });
    }
    await logAction(db, id, "Serving Notice", null, { remark: `Notice period until ${formatDateKey(newLwd)}` });

    const updated = await loadResignation(db, id);
    const summary = `${updated.employee_name} (${updated.employee_id}, ${updated.department || "—"}). Last working day: ${formatDateKey(newLwd)}.`;
    const hrAndPayroll = [...new Set([...(await hrIds(db, null)), ...(await payrollIds(db))])].filter((person) => person !== updated.employee_id);
    const employeeMails = (await notifyEmployee(db, updated, `Resignation ${updated.resignation_no} accepted`, `HR accepted your resignation. You are serving notice until ${formatDateKey(newLwd)}.${changed ? ` Your last working day was changed from ${formatDateKey(previousLwd)}.` : ""}`))
        .map((mail) => ({ ...mail, subject: `Resignation acceptance – ${updated.resignation_no}`, ...acceptanceLetter(updated, note) }));
    const emails = [
        ...employeeMails,
        ...(await createNotifications(db, hrAndPayroll, {
            type: "resignation",
            title: `Resignation accepted: ${updated.employee_name}`,
            message: `${updated.resignation_no} accepted. ${summary} Final settlement to be processed after the last working day.`,
            link: `resignation:${id}`,
        })),
    ];
    return { resignation: updated, emails };
}

export async function rejectResignation(db, { id, actorId, remark = "", employeePortal = false }) {
    const resignation = await loadResignation(db, id, { forUpdate: true });
    const { actor, role } = await requireCurrentApprover(db, resignation, actorId, { employeePortal });
    const reason = text(remark);
    if (!reason) throw new WorkflowError("Enter the reason for rejecting");

    await db.query(
        `UPDATE resignations SET status = 'Rejected', current_step = NULL, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id, reason]
    );
    await logAction(db, id, "Rejected", actor, { stepRole: role, remark: reason });
    const updated = await loadResignation(db, id);
    const emails = await notifyEmployee(db, updated, `Resignation ${updated.resignation_no} rejected`, `${roleLabel(role)} (${actor.name}) rejected your resignation: ${reason}`);
    return { resignation: updated, emails };
}

export async function withdrawResignation(db, { id, actorId, remark = "" }) {
    const resignation = await loadResignation(db, id, { forUpdate: true });
    const actor = await getActor(db, actorId);
    if (resignation.employee_id !== actor.employee_id) throw new WorkflowError("Only the employee can withdraw their resignation", 403);
    if (!resignation.status.startsWith("Pending ")) {
        throw new WorkflowError(`A resignation that is ${resignation.status} can't be withdrawn`);
    }

    const approvers = (await approversForStep(db, resignation.workflow_steps[resignation.current_step], resignation)).ids;
    await db.query(
        `UPDATE resignations SET status = 'Withdrawn', current_step = NULL, withdrawn_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
    );
    await logAction(db, id, "Withdrawn", actor, { remark: text(remark) || null });
    const updated = await loadResignation(db, id);
    const emails = [
        ...(await notifyEmployee(db, updated, `Resignation ${updated.resignation_no} withdrawn`, "You withdrew your resignation. Your employment continues as normal.")),
        ...(await createNotifications(db, approvers, {
            type: "resignation",
            title: `Resignation ${updated.resignation_no} withdrawn`,
            message: `${updated.employee_name} (${updated.employee_id}) withdrew their resignation. No action is needed.`,
            link: `resignation:${id}`,
        })),
    ];
    return { resignation: updated, emails };
}

// =====================================================
// LEAVE RULE: no leave after the last working day once HR has accepted
// =====================================================

export async function getAcceptedLastWorkingDay(db, employeeId) {
    const result = await db.query(
        `SELECT TO_CHAR(last_working_day, 'YYYY-MM-DD') AS last_working_day FROM resignations
         WHERE employee_id = $1 AND status = ANY($2::text[]) ORDER BY id DESC LIMIT 1`,
        [employeeId, AFTER_ACCEPT_STATUSES]
    );
    return result.rows[0]?.last_working_day || null;
}

// Returns an error message, or null when the leave is allowed
export async function checkLeaveAgainstResignation(db, employeeId, fromDate, toDate) {
    const lastWorkingDay = await getAcceptedLastWorkingDay(db, employeeId);
    if (!lastWorkingDay) return null;
    const lastDay = String(toDate || fromDate || "").slice(0, 10);
    if (lastDay > lastWorkingDay) {
        return `Leave can't include dates after your last working day (${formatDateKey(lastWorkingDay)}).`;
    }
    return null;
}

// =====================================================
// DAILY JOB: complete resignations after the last working day
// =====================================================

// Each resignation completes in its own transaction; returns queued emails.
// Only legacy "Accepted" rows complete automatically: a resignation in Serving Notice now moves
// on through Exit Clearance → Final Settlement → Exit Formalities, which HR drives.
export const AUTO_COMPLETE_STATUSES = ["Accepted"];

export async function completeDueResignations({ today = getCompanyToday(), db = null } = {}) {
    const due = await (db || pool).query(
        `SELECT id FROM resignations WHERE status = ANY($1::text[]) AND last_working_day < $2::date ORDER BY id`,
        [AUTO_COMPLETE_STATUSES, today]
    );

    const completed = [];
    const emails = [];
    for (const { id } of due.rows) {
        const client = db || await pool.connect();
        try {
            if (!db) await client.query("BEGIN");
            const resignation = await loadResignation(client, id, { forUpdate: true });
            if (!AUTO_COMPLETE_STATUSES.includes(resignation.status) || resignation.last_working_day >= today) {
                if (!db) await client.query("ROLLBACK");
                continue;
            }

            await client.query(
                `
                UPDATE employees
                SET status = 'Inactive',
                    last_date_worked = $2,
                    termination_reason = COALESCE(NULLIF(TRIM(termination_reason), ''), 'Resignation')
                WHERE employee_id = $1
                `,
                [resignation.employee_id, resignation.last_working_day]
            );
            await client.query(
                `UPDATE resignations SET status = 'Completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [id]
            );
            await client.query(
                `INSERT INTO end_of_service_queue (employee_id, resignation_id, last_working_day) VALUES ($1, $2, $3) ON CONFLICT (resignation_id) DO NOTHING`,
                [resignation.employee_id, id, resignation.last_working_day]
            );
            await logAction(client, id, "Completed", null, { remark: "Last working day passed. Employee set to Inactive and added to Pending End of Service." });

            emails.push(
                ...(await notifyEmployee(client, resignation, `Resignation ${resignation.resignation_no} completed`, `Your last working day was ${formatDateKey(resignation.last_working_day)}. HR will process your final settlement.`)),
                ...(await createNotifications(client, (await hrIds(client, null)).filter((person) => person !== resignation.employee_id), {
                    type: "resignation",
                    title: `Pending End of Service: ${resignation.employee_name}`,
                    message: `${resignation.employee_name} (${resignation.employee_id}, ${resignation.department || "—"}) finished on ${formatDateKey(resignation.last_working_day)} and is now Inactive.`,
                    link: `resignation:${id}`,
                })),
            );
            if (!db) await client.query("COMMIT");
            completed.push(id);
        } catch (error) {
            if (!db) await client.query("ROLLBACK");
            console.error(`Resignation ${id} completion failed:`, error);
        } finally {
            if (!db) client.release();
        }
    }
    return { completed, emails };
}

export function startResignationScheduler({ intervalMs = 60 * 60 * 1000, onEmails = () => {} } = {}) {
    let lastRunDate = null;

    const tick = async () => {
        const today = getCompanyToday();
        if (today === lastRunDate) return;
        try {
            const { completed, emails } = await completeDueResignations({ today });
            lastRunDate = today;
            onEmails(emails);
            if (completed.length) console.log(`Resignations completed ${today}: ${completed.length}`);
            // Separation completed before the last working day: Resigned (login blocked) once it has passed
            const { resignCompletedEmployees } = await import("./resignationSettlement.js");
            const resigned = await resignCompletedEmployees(pool, { today });
            if (resigned) console.log(`Employees set to Resigned ${today}: ${resigned}`);
        } catch (error) {
            console.error("Resignation completion job failed:", error);
        }
    };

    tick();
    return setInterval(tick, intervalMs);
}
