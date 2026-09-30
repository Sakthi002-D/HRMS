// =====================================================
// RESIGNATION REQUEST — FRD SHELTER-HCM-SSP-20-001
//
// Pending Line Manager → Pending HR → Accepted → Serving Notice → Completed
//                     ↘ Rejected (approver gives a reason)
//                     ↘ Withdrawn (employee, only before HR accepts)
//
// Notice period and approval steps live in resignation_settings (HR portal →
// Settings). Approvers are the people holding the step's role in
// workflow_role_assignments (Settings → Approval Workflows).
// A daily job completes resignations the day after the last working day.
// =====================================================

import pool from "../db.js";
import { getCompanyToday } from "./leaveDateRules.js";
import { createNotifications } from "./notificationService.js";
import { WorkflowError, getActor, getApproverIds, getRolesFor, roleLabel } from "./manpowerWorkflow.js";

export const REASON_CATEGORIES = ["Better opportunity", "Personal", "Relocation", "Higher studies", "Health", "Other"];
export const RESIGNATION_STEP_ROLES = ["LINE_MANAGER", "DEPT_HEAD", "HR"];
export const FINAL_STATUSES = ["Rejected", "Withdrawn", "Completed"];
export const ACCEPTED_STATUSES = ["Accepted", "Serving Notice"];

export const DEFAULT_RESIGNATION_SETTINGS = {
    noticePeriodDays: 30,
    gradeOverrides: {},
    employmentTypeOverrides: {},
    workflow: ["LINE_MANAGER", "HR"],
};

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
    return { ...DEFAULT_RESIGNATION_SETTINGS, ...(result.rows[0]?.settings || {}) };
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

    await db.query(
        `UPDATE resignation_settings SET settings = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
        [JSON.stringify(next)]
    );
    return next;
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

async function hrIds(db, excludeId) {
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

const pendingStatus = (role) => `Pending ${roleLabel(role)}`;

// =====================================================
// LOADING
// =====================================================

const RESIGNATION_COLUMNS = `
    r.id, r.resignation_no, r.employee_id, e.name AS employee_name, e.department, e.designation, e.grade,
    e.employment_type, e.status AS employee_status,
    TO_CHAR(r.resignation_date, 'YYYY-MM-DD') AS resignation_date,
    r.notice_period_days, r.notice_period_source,
    TO_CHAR(r.calculated_last_working_day, 'YYYY-MM-DD') AS calculated_last_working_day,
    TO_CHAR(r.requested_last_working_day, 'YYYY-MM-DD') AS requested_last_working_day,
    TO_CHAR(r.last_working_day, 'YYYY-MM-DD') AS last_working_day,
    r.early_release, r.early_release_reason, r.reason_category, r.details, r.letter_url, r.letter_name,
    r.acknowledged, r.status, r.workflow_steps, r.current_step, r.rejection_reason, r.accepted_by,
    r.accepted_at, r.completed_at, r.withdrawn_at, r.created_at, r.updated_at
`;

async function loadResignation(db, id, { forUpdate = false } = {}) {
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

const logAction = (db, resignationId, action, actor, { stepRole = null, remark = null } = {}) =>
    db.query(
        `INSERT INTO resignation_actions (resignation_id, action, step_role, actor_id, actor_name, remark) VALUES ($1, $2, $3, $4, $5, $6)`,
        [resignationId, action, stepRole, actor?.employee_id || null, actor?.name || "System", remark]
    );

const notifyEmployee = (db, resignation, title, message) =>
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

export async function getResignationDetail(db, id, actorId, { today = getCompanyToday() } = {}) {
    const resignation = await loadResignation(db, id);
    const { actor, roles } = await getRolesFor(db, actorId);
    const isHR = roles.some((item) => item.role === "HR");

    const workflow = await Promise.all(resignation.workflow_steps.map(async (role) => {
        const { ids, via } = await approversForStep(db, role, resignation);
        const people = ids.length
            ? (await db.query(`SELECT employee_id, name FROM employees WHERE employee_id = ANY($1::text[]) ORDER BY name`, [ids])).rows
            : [];
        return { role, label: roleLabel(role), via, approvers: people.map((row) => ({ employee_id: row.employee_id, name: row.name })) };
    }));

    const isPending = resignation.status.startsWith("Pending ");
    const currentStep = isPending ? workflow[resignation.current_step] : null;
    const isCurrentApprover = Boolean(currentStep?.approvers.some((person) => person.employee_id === actor.employee_id));
    const isOwner = resignation.employee_id === actor.employee_id;
    const everApprover = workflow.some((step) => step.approvers.some((person) => person.employee_id === actor.employee_id));

    if (!isOwner && !isHR && !everApprover) throw new WorkflowError("You can't view this resignation", 403);

    const actions = await db.query(
        `SELECT id, action, step_role, actor_id, actor_name, remark, created_at FROM resignation_actions WHERE resignation_id = $1 ORDER BY created_at, id`,
        [id]
    );

    return {
        ...resignation,
        today,
        workflow,
        actions: actions.rows,
        days_remaining: ACCEPTED_STATUSES.includes(resignation.status) ? Math.max(0, daysBetween(today, resignation.last_working_day)) : null,
        permissions: {
            canApprove: isCurrentApprover,
            isFinalStep: isCurrentApprover && resignation.current_step === resignation.workflow_steps.length - 1,
            canWithdraw: isOwner && isPending,
        },
    };
}

const listSelect = (where) => `
    SELECT ${RESIGNATION_COLUMNS} FROM resignations r JOIN employees e ON e.employee_id = r.employee_id
    ${where} ORDER BY r.created_at DESC, r.id DESC
`;

export async function listResignationsForApprover(db, actorId) {
    await getActor(db, actorId);
    const pending = await db.query(listSelect(`WHERE r.status LIKE 'Pending %'`));
    const mine = [];
    for (const row of pending.rows) {
        const { ids } = await approversForStep(db, row.workflow_steps[row.current_step], row);
        if (ids.includes(actorId)) mine.push({ ...row, awaiting_me: true });
    }
    return mine;
}

export async function listAllResignations(db = pool) {
    return (await db.query(listSelect(""))).rows;
}

export async function listEmployeeResignations(db, employeeId) {
    return (await db.query(listSelect(`WHERE r.employee_id = $1`), [employeeId])).rows;
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

const text = (value) => String(value ?? "").trim();
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

async function requireCurrentApprover(db, resignation, actorId) {
    if (!resignation.status.startsWith("Pending ")) {
        throw new WorkflowError(`This resignation is ${resignation.status}; there is nothing to approve`);
    }
    const role = resignation.workflow_steps[resignation.current_step];
    const actor = await getActor(db, actorId);
    const { ids } = await approversForStep(db, role, resignation);
    if (!ids.includes(actor.employee_id)) throw new WorkflowError(`Only the current approver (${roleLabel(role)}) can act on this resignation`, 403);
    return { actor, role };
}

export async function approveResignation(db, { id, actorId, remark = "", lastWorkingDay = null, today = getCompanyToday() }) {
    const resignation = await loadResignation(db, id, { forUpdate: true });
    const { actor, role } = await requireCurrentApprover(db, resignation, actorId);
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

    // Final step (HR): accept, optionally changing the last working day
    const previousLwd = resignation.last_working_day;
    const newLwd = text(lastWorkingDay) || previousLwd;
    if (!isDateKey(newLwd)) throw new WorkflowError("Last working day must be a valid date (YYYY-MM-DD)");
    if (newLwd < today) throw new WorkflowError("Last working day can't be in the past");
    const changed = newLwd !== previousLwd;
    if (changed && !note) throw new WorkflowError("Enter a remark explaining why the last working day changed");

    await db.query(
        `
        UPDATE resignations
        SET status = 'Serving Notice', current_step = NULL, last_working_day = $2,
            accepted_by = $3, accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [id, newLwd, actor.employee_id]
    );
    await logAction(db, id, "Accepted", actor, { stepRole: role, remark: changed ? null : note });
    if (changed) {
        await logAction(db, id, "Last working day changed", actor, {
            stepRole: role,
            remark: `${formatDateKey(previousLwd)} → ${formatDateKey(newLwd)}: ${note}`,
        });
    }
    await logAction(db, id, "Serving Notice", null, { remark: `Notice period until ${formatDateKey(newLwd)}` });

    const updated = await loadResignation(db, id);
    const summary = `${updated.employee_name} (${updated.employee_id}, ${updated.department || "—"}). Last working day: ${formatDateKey(newLwd)}.`;
    const hrAndPayroll = [...new Set([...(await hrIds(db, null)), ...(await payrollIds(db))])].filter((person) => person !== updated.employee_id);
    const emails = [
        ...(await notifyEmployee(db, updated, `Resignation ${updated.resignation_no} accepted`, `HR accepted your resignation. You are serving notice until ${formatDateKey(newLwd)}.${changed ? ` Your last working day was changed from ${formatDateKey(previousLwd)}.` : ""}`)),
        ...(await createNotifications(db, hrAndPayroll, {
            type: "resignation",
            title: `Resignation accepted: ${updated.employee_name}`,
            message: `${updated.resignation_no} accepted. ${summary} Final settlement to be processed after the last working day.`,
            link: `resignation:${id}`,
        })),
    ];
    return { resignation: updated, emails };
}

export async function rejectResignation(db, { id, actorId, remark = "" }) {
    const resignation = await loadResignation(db, id, { forUpdate: true });
    const { actor, role } = await requireCurrentApprover(db, resignation, actorId);
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
        [employeeId, ACCEPTED_STATUSES]
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

// Each resignation completes in its own transaction; returns queued emails
export async function completeDueResignations({ today = getCompanyToday(), db = null } = {}) {
    const due = await (db || pool).query(
        `SELECT id FROM resignations WHERE status = ANY($1::text[]) AND last_working_day < $2::date ORDER BY id`,
        [ACCEPTED_STATUSES, today]
    );

    const completed = [];
    const emails = [];
    for (const { id } of due.rows) {
        const client = db || await pool.connect();
        try {
            if (!db) await client.query("BEGIN");
            const resignation = await loadResignation(client, id, { forUpdate: true });
            if (!ACCEPTED_STATUSES.includes(resignation.status) || resignation.last_working_day >= today) {
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
        } catch (error) {
            console.error("Resignation completion job failed:", error);
        }
    };

    tick();
    return setInterval(tick, intervalMs);
}
