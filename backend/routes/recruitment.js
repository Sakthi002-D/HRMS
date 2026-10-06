// =====================================================
// RECRUITMENT: Manpower Requests, approval settings, masters, recruitment plan
// FRD SHELTER-HCM-RC-01-001
//
// Identity: like the rest of this API, the caller's employee ID comes from the
// client session (actor_id / employee_id). Permissions are checked against
// workflow_role_assignments and employees.role on every call.
// =====================================================

import express from "express";
import pool from "../db.js";
import { getInbox, sendQueuedEmails } from "../services/notificationService.js";
import {
    ASSET_OPTIONS,
    ASSIGNABLE_ROLES,
    DEPARTMENT_SCOPED_ROLES,
    EMPLOYMENT_TYPES,
    NON_MPR_ROLES,
    REQUEST_TYPES,
    ROLE_LABELS,
    SOURCING_OPTIONS,
    WORKFLOW_STEP_ROLES,
    WorkflowError,
    approveMpr,
    cancelMpr,
    computeBudget,
    getMprDetail,
    getRecruitmentSettings,
    getRecruitmentSummary,
    getRecruitmentToday,
    getRolesFor,
    listMprs,
    rejectMpr,
    saveMpr,
    saveRecruitmentPlan,
    saveRecruitmentSettings,
    sendBackMpr,
} from "../services/manpowerWorkflow.js";

const router = express.Router();

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        if (error instanceof WorkflowError) {
            return res.status(error.status).json({ message: error.message });
        }
        if (error.code === "23505") {
            return res.status(409).json({ message: "That record already exists" });
        }
        if (error.code === "23503") {
            return res.status(409).json({ message: "This record is in use and can't be deleted. Make it inactive instead." });
        }
        console.error("Recruitment API error:", error);
        res.status(500).json({ message: "Something went wrong. Please try again." });
    }
};

// Runs fn in a transaction; queued emails are sent only after COMMIT
async function inTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        sendQueuedEmails(result?.emails);
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function requireHR(actorId) {
    const { roles } = await getRolesFor(pool, actorId);
    if (!roles.some((item) => item.role === "HR")) throw new WorkflowError("Only HR can change this setting", 403);
}

const actorFrom = (req) => req.body?.actor_id || req.query.employee_id || req.query.actor_id;

// =====================================================
// META (form options + the caller's roles)
// =====================================================

router.get("/recruitment/meta", handle(async (req, res) => {
    const [settings, locations, agencies, departments] = await Promise.all([
        getRecruitmentSettings(),
        pool.query(`SELECT id, name FROM recruitment_locations WHERE active ORDER BY name`),
        pool.query(`SELECT id, name, contact_person, email, phone FROM recruitment_agencies WHERE active ORDER BY name`),
        pool.query(`SELECT DISTINCT TRIM(department) AS name FROM employees WHERE COALESCE(TRIM(department), '') <> '' ORDER BY 1`),
    ]);

    let roles = [];
    if (req.query.employee_id) roles = (await getRolesFor(pool, req.query.employee_id)).roles;

    const isHR = roles.some((item) => item.role === "HR");
    const departmentNames = [...new Set([...Object.keys(settings.departmentCodes || {}), ...departments.rows.map((row) => row.name)])];
    const raiseDepartments = isHR
        ? departmentNames
        : roles.filter((item) => item.role === "DEPT_COORDINATOR").map((item) => item.department);
    const approverRoles = roles.filter((item) => !NON_MPR_ROLES.includes(item.role));

    res.set("Cache-Control", "no-store");
    res.json({
        today: await getRecruitmentToday(),
        currency: settings.currency,
        currencySymbol: settings.currencySymbol,
        departments: departmentNames,
        locations: locations.rows,
        agencies: agencies.rows,
        requestTypes: REQUEST_TYPES,
        assetOptions: ASSET_OPTIONS,
        employmentTypes: EMPLOYMENT_TYPES,
        sourcingOptions: SOURCING_OPTIONS,
        roleLabels: ROLE_LABELS,
        roles,
        isHR,
        canRaise: raiseDepartments.length > 0,
        raiseDepartments,
        isApprover: approverRoles.length > 0,
    });
}));

router.get("/recruitment/employees", handle(async (req, res) => {
    const result = await pool.query(
        `SELECT employee_id, name, department, designation FROM employees
         WHERE LOWER(COALESCE(status, '')) = 'active' AND ($1::text IS NULL OR LOWER(department) = LOWER($1))
         ORDER BY name`,
        [req.query.department || null]
    );
    res.json(result.rows);
}));

// =====================================================
// SETTINGS → APPROVAL WORKFLOWS
// =====================================================

router.get("/recruitment/settings", handle(async (req, res) => {
    res.json({ settings: await getRecruitmentSettings(), stepRoles: WORKFLOW_STEP_ROLES, roleLabels: ROLE_LABELS });
}));

router.put("/recruitment/settings", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    res.json({ settings: await saveRecruitmentSettings(req.body?.settings || {}) });
}));

router.get("/recruitment/role-assignments", handle(async (req, res) => {
    const result = await pool.query(`
        SELECT w.id, w.role_key, w.department, w.employee_id, e.name AS employee_name, e.department AS employee_department
        FROM workflow_role_assignments w
        JOIN employees e ON e.employee_id = w.employee_id
        ORDER BY w.role_key, w.department NULLS FIRST, e.name
    `);
    res.json({ assignments: result.rows, assignableRoles: ASSIGNABLE_ROLES, departmentScopedRoles: DEPARTMENT_SCOPED_ROLES });
}));

router.post("/recruitment/role-assignments", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    const { role_key: roleKey, department, employee_id: employeeId } = req.body || {};
    if (!ASSIGNABLE_ROLES.includes(roleKey)) throw new WorkflowError("Choose a role");
    if (!employeeId) throw new WorkflowError("Choose an employee");
    const scoped = DEPARTMENT_SCOPED_ROLES.includes(roleKey);
    if (scoped && !department) throw new WorkflowError(`${ROLE_LABELS[roleKey]} needs a department`);

    const result = await pool.query(
        `INSERT INTO workflow_role_assignments (role_key, department, employee_id) VALUES ($1, $2, $3) RETURNING *`,
        [roleKey, scoped ? department : null, employeeId]
    );
    res.status(201).json(result.rows[0]);
}));

router.delete("/recruitment/role-assignments/:id", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    await pool.query(`DELETE FROM workflow_role_assignments WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
}));

// =====================================================
// MASTERS: locations, agencies, headcount budgets
// =====================================================

router.get("/recruitment/locations", handle(async (req, res) => {
    res.json((await pool.query(`SELECT id, name, active FROM recruitment_locations ORDER BY active DESC, name`)).rows);
}));

router.post("/recruitment/locations", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    const name = String(req.body?.name || "").trim();
    if (!name) throw new WorkflowError("Location name is required");
    res.status(201).json((await pool.query(`INSERT INTO recruitment_locations (name) VALUES ($1) RETURNING *`, [name])).rows[0]);
}));

router.put("/recruitment/locations/:id", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    const result = await pool.query(
        `UPDATE recruitment_locations SET name = COALESCE(NULLIF(TRIM($2), ''), name), active = COALESCE($3, active) WHERE id = $1 RETURNING *`,
        [req.params.id, req.body?.name ?? null, typeof req.body?.active === "boolean" ? req.body.active : null]
    );
    res.json(result.rows[0]);
}));

// Delete a location, only if nothing uses it (Manpower Requests, Job Openings, etc.).
// If it's in use, HR is asked to make it inactive instead so old records keep their location.
router.delete("/recruitment/locations/:id", handle(async (req, res) => {
    await requireHR(actorFrom(req));

    const found = await pool.query(`SELECT id, name FROM recruitment_locations WHERE id = $1`, [req.params.id]);
    const location = found.rows[0];
    if (!location) throw new WorkflowError("Location not found", 404);

    // Every table that has a "location" (name) or "location_id" column
    const columns = await pool.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND column_name IN ('location', 'location_id')
          AND table_name <> 'recruitment_locations'
    `);

    let usedBy = 0;
    for (const { table_name: table, column_name: column } of columns.rows) {
        if (!/^[a-z_][a-z0-9_]*$/.test(table)) continue;
        const sql = column === "location_id"
            ? `SELECT COUNT(*)::int AS n FROM "${table}" WHERE location_id::text = $1::text`
            : `SELECT COUNT(*)::int AS n FROM "${table}" WHERE LOWER(TRIM(location::text)) = LOWER(TRIM($1))`;
        const { rows } = await pool.query(sql, [column === "location_id" ? String(location.id) : location.name]);
        usedBy += rows[0].n;
    }

    if (usedBy > 0) {
        throw new WorkflowError(
            `"${location.name}" is used by ${usedBy} record${usedBy === 1 ? "" : "s"} (requests or job openings), so it can't be deleted. Click the chip to make it inactive instead.`,
            409
        );
    }

    await pool.query(`DELETE FROM recruitment_locations WHERE id = $1`, [location.id]);
    res.json({ ok: true });
}));

router.get("/recruitment/agencies", handle(async (req, res) => {
    res.json((await pool.query(`SELECT * FROM recruitment_agencies ORDER BY active DESC, name`)).rows);
}));

router.post("/recruitment/agencies", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    const { name, contact_person: contact, email, phone } = req.body || {};
    if (!String(name || "").trim()) throw new WorkflowError("Agency name is required");
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new WorkflowError("Agency email is not valid");
    const result = await pool.query(
        `INSERT INTO recruitment_agencies (name, contact_person, email, phone) VALUES ($1, $2, $3, $4) RETURNING *`,
        [name.trim(), contact || null, email || null, phone || null]
    );
    res.status(201).json(result.rows[0]);
}));

router.put("/recruitment/agencies/:id", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    const { name, contact_person: contact, email, phone, active } = req.body || {};
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new WorkflowError("Agency email is not valid");
    const result = await pool.query(
        `UPDATE recruitment_agencies SET
            name = COALESCE(NULLIF(TRIM($2), ''), name),
            contact_person = COALESCE($3, contact_person),
            email = COALESCE($4, email),
            phone = COALESCE($5, phone),
            active = COALESCE($6, active)
         WHERE id = $1 RETURNING *`,
        [req.params.id, name ?? null, contact ?? null, email ?? null, phone ?? null, typeof active === "boolean" ? active : null]
    );
    res.json(result.rows[0]);
}));

// Delete an agency, only if no job opening / application uses it.
router.delete("/recruitment/agencies/:id", handle(async (req, res) => {
    await requireHR(actorFrom(req));

    const found = await pool.query(`SELECT id, name FROM recruitment_agencies WHERE id = $1`, [req.params.id]);
    const agency = found.rows[0];
    if (!agency) throw new WorkflowError("Agency not found", 404);

    // Every table that links to an agency by id or by name
    const columns = await pool.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND column_name IN ('agency_id', 'recruitment_agency_id', 'agency_name', 'agency')
          AND table_name <> 'recruitment_agencies'
    `);

    let usedBy = 0;
    for (const { table_name: table, column_name: column } of columns.rows) {
        if (!/^[a-z_][a-z0-9_]*$/.test(table)) continue;
        const byId = column.endsWith("_id");
        const sql = byId
            ? `SELECT COUNT(*)::int AS n FROM "${table}" WHERE "${column}"::text = $1::text`
            : `SELECT COUNT(*)::int AS n FROM "${table}" WHERE LOWER(TRIM("${column}"::text)) = LOWER(TRIM($1))`;
        const { rows } = await pool.query(sql, [byId ? String(agency.id) : agency.name]);
        usedBy += rows[0].n;
    }

    if (usedBy > 0) {
        throw new WorkflowError(
            `"${agency.name}" is used by ${usedBy} record${usedBy === 1 ? "" : "s"} (job openings or applications), so it can't be deleted. Set it to Inactive instead.`,
            409
        );
    }

    await pool.query(`DELETE FROM recruitment_agencies WHERE id = $1`, [agency.id]);
    res.json({ ok: true });
}));

router.get("/recruitment/budgets", handle(async (req, res) => {
    res.json((await pool.query(
        `SELECT id, department, year, headcount AS budgeted_positions, salary_budget::float AS salary_budget FROM department_headcount_budgets ORDER BY year DESC, department`
    )).rows);
}));

// Create or update the budget for a department + year.
// Budgeted Positions = NEW people HR approves (stored in the existing headcount column).
router.post("/recruitment/budgets", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    const { department, year, salary_budget: salaryBudget } = req.body || {};
    const positions = req.body?.budgeted_positions ?? req.body?.headcount;
    if (!String(department || "").trim()) throw new WorkflowError("Department is required");
    if (!(Number(year) >= 2000)) throw new WorkflowError("Year is required");
    if (positions === "" || positions === null || positions === undefined || !Number.isInteger(Number(positions)) || Number(positions) < 0) {
        throw new WorkflowError("Budgeted Positions must be a whole number, 0 or more");
    }
    if (salaryBudget === "" || salaryBudget === undefined || !(Number(salaryBudget) >= 0)) throw new WorkflowError("Salary budget must be 0 or more");

    const result = await pool.query(
        `
        INSERT INTO department_headcount_budgets (department, year, headcount, salary_budget)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (LOWER(department), year) DO UPDATE SET headcount = EXCLUDED.headcount, salary_budget = EXCLUDED.salary_budget
        RETURNING id, department, year, headcount AS budgeted_positions, salary_budget::float AS salary_budget
        `,
        [department.trim(), Number(year), Number(positions), Number(salaryBudget)]
    );
    res.json(result.rows[0]);
}));

router.delete("/recruitment/budgets/:id", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    await pool.query(`DELETE FROM department_headcount_budgets WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
}));

// =====================================================
// MANPOWER REQUESTS
// =====================================================

router.get("/mprs/summary", handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getRecruitmentSummary());
}));

// Budget check while filling the form (New Position only)
router.get("/mprs/budget-preview", handle(async (req, res) => {
    const { department, start_date: startDate, openings, salary_max: salaryMax, mpr_id: mprId } = req.query;
    if (!department) throw new WorkflowError("Department is required");
    res.json(await computeBudget(pool, {
        department,
        // Budget year = year of the Application Start Date
        year: Number(String(startDate || await getRecruitmentToday()).slice(0, 4)),
        openings,
        salaryMax,
        excludeMprId: mprId || null,
    }));
}));

router.get("/mprs", handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await listMprs(pool, { actorId: req.query.employee_id, scope: req.query.scope || "all" }));
}));

router.get("/mprs/:id", handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getMprDetail(pool, { id: req.params.id, actorId: req.query.employee_id }));
}));

router.post("/mprs", handle(async (req, res) => {
    const { mpr } = await inTransaction((db) =>
        saveMpr(db, { body: req.body || {}, actorId: actorFrom(req), action: req.body?.action === "submit" ? "submit" : "draft" })
    );
    res.status(201).json(mpr);
}));

router.put("/mprs/:id", handle(async (req, res) => {
    const { mpr } = await inTransaction((db) =>
        saveMpr(db, { id: req.params.id, body: req.body || {}, actorId: actorFrom(req), action: req.body?.action === "submit" ? "submit" : "draft" })
    );
    res.json(mpr);
}));

const MPR_ACTIONS = { approve: approveMpr, reject: rejectMpr, "send-back": sendBackMpr, cancel: cancelMpr };

router.post("/mprs/:id/:action", handle(async (req, res) => {
    const action = MPR_ACTIONS[req.params.action];
    if (!action) throw new WorkflowError("Unknown action", 404);
    const result = await inTransaction((db) =>
        action(db, { id: req.params.id, actorId: actorFrom(req), remark: req.body?.remark })
    );
    res.json({ mpr: result.mpr, jobId: result.jobId || null });
}));

// =====================================================
// JOB OPENINGS: recruitment plan
// =====================================================

router.put("/jobs/:id/recruitment-plan", handle(async (req, res) => {
    const job = await inTransaction(async (db) => ({
        job: await saveRecruitmentPlan(db, { jobDbId: req.params.id, body: req.body || {}, actorId: actorFrom(req) }),
    }));
    res.json(job.job);
}));

// =====================================================
// IN-APP NOTIFICATIONS
// =====================================================

router.get("/notifications/inbox/:employeeId", handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getInbox(req.params.employeeId));
}));

router.put("/notifications/inbox/:id/read", handle(async (req, res) => {
    await pool.query(`UPDATE hr_notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
}));

export default router;
