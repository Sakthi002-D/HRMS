// =====================================================
// GRADE MASTER — the company grade list and each grade's yearly Annual Leave days.
//
// Table `grades`: code, band (shown as the grade name), sort_order, active and,
// after migration 025, leave_days. The API speaks grade_code / grade_name /
// leave_days / sort_order.
//
// The schema is checked through information_schema instead of by catching
// errors: the annual leave accrual job calls this inside a transaction, where a
// failed query would abort the whole transaction.
// =====================================================

import { GRADES, defaultGradeEntitlements, normalizeGrade } from "./grades.js";

export class GradeError extends Error {
    constructor(status, message, extra = {}) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}

export const MIGRATION_MESSAGE = "Leave days can't be saved yet. Run backend/migrations/025_grade_master_leave_days.sql, then restart the backend.";

const SCHEMA_TTL_MS = 60_000;
let schemaCache = null;

export const resetGradeSchemaCache = () => {
    schemaCache = null;
};

// { table: grades exists, leaveDays: grades.leave_days exists }
export async function gradeSchema(db) {
    if (schemaCache && Date.now() - schemaCache.at < SCHEMA_TTL_MS) return schemaCache.value;
    const result = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'grades'"
    );
    const columns = result.rows.map((row) => row.column_name);
    const value = { table: columns.length > 0, leaveDays: columns.includes("leave_days") };
    schemaCache = { at: Date.now(), value };
    return value;
}

const toNumber = (value) => (value === null || value === undefined || value === "" ? null : Number(value));

// Days HR set in Leave Policy, by upper-case grade code (used until migration 025 runs)
async function policyGradeDays(db) {
    const result = await db.query("SELECT policy->'annualLeave'->'grade_overrides' AS overrides FROM leave_policy_settings WHERE id = 1");
    const overrides = result.rows[0]?.overrides || {};
    return Object.fromEntries(Object.entries(overrides)
        .filter(([, days]) => Number(days) > 0)
        .map(([code, days]) => [code.trim().toUpperCase(), Number(days)]));
}

const toApi = (row, fallbackDays = {}) => ({
    grade_code: row.code,
    grade_name: row.band,
    leave_days: toNumber(row.leave_days) ?? fallbackDays[String(row.code).toUpperCase()] ?? null,
    sort_order: Number(row.sort_order),
    active: row.active !== false,
    employee_count: Number(row.employee_count || 0),
});

// All grades in sort order, with how many employees hold each one
export async function listGrades(db) {
    const schema = await gradeSchema(db);
    if (!schema.table) {
        // Built-in company list, read-only, so every grade dropdown keeps working
        const days = defaultGradeEntitlements();
        return {
            grades: GRADES.map((code, index) => ({ grade_code: code, grade_name: "", leave_days: days[code], sort_order: index + 1, active: true, employee_count: 0 })),
            editable: false,
            leaveDaysEditable: false,
        };
    }
    const result = await db.query(`
        SELECT g.code, g.band, g.sort_order, g.active, ${schema.leaveDays ? "g.leave_days" : "NULL::numeric AS leave_days"},
               COUNT(e.employee_id) AS employee_count
        FROM grades g
        LEFT JOIN employees e ON UPPER(TRIM(e.grade)) = UPPER(g.code)
        GROUP BY g.id
        ORDER BY g.sort_order, g.code
    `);
    const fallbackDays = schema.leaveDays ? {} : await policyGradeDays(db);
    return { grades: result.rows.map((row) => toApi(row, fallbackDays)), editable: true, leaveDaysEditable: schema.leaveDays };
}

// Leave days per grade from the grades table, keyed by lower-case code ({} before migration 025)
export async function gradeLeaveDays(db) {
    const schema = await gradeSchema(db);
    if (!schema.table || !schema.leaveDays) return {};
    const result = await db.query("SELECT code, leave_days FROM grades WHERE leave_days IS NOT NULL");
    return Object.fromEntries(result.rows
        .filter((row) => Number(row.leave_days) > 0)
        .map((row) => [String(row.code).trim().toLowerCase(), Number(row.leave_days)]));
}

// "" / null -> null (no grade); an active grade -> its stored spelling; anything else -> undefined
export async function normalizeGradeFromDb(db, value) {
    const grade = String(value ?? "").trim().toUpperCase();
    if (!grade) return null;
    const schema = await gradeSchema(db);
    if (!schema.table) return normalizeGrade(grade);
    const result = await db.query("SELECT code FROM grades WHERE UPPER(code) = $1 AND active = TRUE", [grade]);
    return result.rows[0]?.code ?? undefined;
}

const CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

// Checks a create (partial = false) or update (partial = true) body. Returns only the given fields.
export function validateGradeInput(body, { partial = false } = {}) {
    const input = body && typeof body === "object" ? body : {};
    const value = {};

    if (!partial || input.grade_code !== undefined) {
        const code = String(input.grade_code ?? "").trim().toUpperCase();
        if (!code) throw new GradeError(400, "Grade code is required");
        if (code.length > 12 || !CODE_PATTERN.test(code)) throw new GradeError(400, "Grade code can use letters, numbers and dashes only (for example 5-A), up to 12 characters");
        value.grade_code = code;
    }
    if (!partial || input.grade_name !== undefined) {
        const name = String(input.grade_name ?? "").trim();
        if (!name) throw new GradeError(400, "Grade name is required");
        if (name.length > 100) throw new GradeError(400, "Grade name can be up to 100 characters");
        value.grade_name = name;
    }
    if (!partial || input.leave_days !== undefined) {
        const days = Number(input.leave_days);
        if (input.leave_days === "" || input.leave_days === null || !Number.isFinite(days) || days <= 0 || days > 365 || Math.round(days * 2) !== days * 2) {
            throw new GradeError(400, "Leave days must be between 0.5 and 365 (whole or half days)");
        }
        value.leave_days = days;
    }
    if (input.sort_order !== undefined && input.sort_order !== "" && input.sort_order !== null) {
        const order = Number(input.sort_order);
        if (!Number.isInteger(order) || order < 0 || order > 9999) throw new GradeError(400, "Sort order must be a whole number from 0 to 9999");
        value.sort_order = order;
    }
    return value;
}

async function requireEditable(db, needsLeaveDays) {
    const schema = await gradeSchema(db);
    if (!schema.table) throw new GradeError(503, "The grades table is missing on this database");
    if (needsLeaveDays && !schema.leaveDays) throw new GradeError(503, MIGRATION_MESSAGE);
    return schema;
}

async function findGrade(db, code) {
    const { grades } = await listGrades(db);
    return grades.find((grade) => grade.grade_code.toUpperCase() === String(code).toUpperCase()) || null;
}

export async function createGrade(db, body) {
    const value = validateGradeInput(body);
    await requireEditable(db, true);
    try {
        await db.query(
            `INSERT INTO grades (code, band, leave_days, sort_order, active)
             VALUES ($1, $2, $3, COALESCE($4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM grades)), TRUE)`,
            [value.grade_code, value.grade_name, value.leave_days, value.sort_order ?? null]
        );
    } catch (error) {
        if (error.code === "23505") throw new GradeError(409, `Grade ${value.grade_code} already exists`);
        throw error;
    }
    return findGrade(db, value.grade_code);
}

// The code is the key employees are linked by, so it can't be renamed here
export async function updateGrade(db, code, body) {
    const current = String(code ?? "").trim().toUpperCase();
    const value = validateGradeInput(body, { partial: true });
    if (value.grade_code !== undefined && value.grade_code !== current) {
        throw new GradeError(400, "The grade code can't be changed. Add a new grade and move employees to it instead.");
    }
    const sets = [];
    const params = [];
    const set = (column, item) => {
        params.push(item);
        sets.push(`${column} = $${params.length}`);
    };
    if (value.grade_name !== undefined) set("band", value.grade_name);
    if (value.leave_days !== undefined) set("leave_days", value.leave_days);
    if (value.sort_order !== undefined) set("sort_order", value.sort_order);
    if (!sets.length) throw new GradeError(400, "Nothing to update");

    await requireEditable(db, value.leave_days !== undefined);
    params.push(current);
    const result = await db.query(`UPDATE grades SET ${sets.join(", ")} WHERE UPPER(code) = $${params.length} RETURNING code`, params);
    if (!result.rows.length) throw new GradeError(404, `Grade ${current} not found`);
    return findGrade(db, result.rows[0].code);
}

// Only deletes a grade no employee holds (checked in the same statement)
export async function deleteGrade(db, code) {
    const current = String(code ?? "").trim().toUpperCase();
    await requireEditable(db, false);
    let result;
    try {
        result = await db.query(
            `DELETE FROM grades g
             WHERE UPPER(g.code) = $1
               AND NOT EXISTS (SELECT 1 FROM employees e WHERE UPPER(TRIM(e.grade)) = UPPER(g.code))
             RETURNING g.code`,
            [current]
        );
    } catch (error) {
        // grade_positions (migration 021, MPR form) points at the grade
        if (error.code === "23503") throw new GradeError(409, `Grade ${current} has MPR positions and designations linked to it, so it can't be deleted.`);
        throw error;
    }
    if (result.rows.length) return { grade_code: result.rows[0].code, deleted: true };

    const grade = await findGrade(db, current);
    if (!grade) throw new GradeError(404, `Grade ${current} not found`);
    throw new GradeError(409, grade.employee_count === 1
        ? `Grade ${grade.grade_code} is given to 1 employee. Move them to another grade first.`
        : `Grade ${grade.grade_code} is given to ${grade.employee_count} employees. Move them to another grade first.`,
    { employee_count: grade.employee_count });
}

// =====================================================
// GRADE MASTER: Grade → Position → Designation (MPR form "Grade & Designation")
// Tables: grades, grade_positions, grade_designations (migration 021).
// =====================================================

// Nested list: grades (by sort order) → positions → designations.
// activeOnly = what the MPR form offers (an inactive grade hides its positions, and so on).
export async function listGradeMaster(db, { activeOnly = false } = {}) {
    const where = activeOnly ? "WHERE active" : "";
    const [grades, positions, designations] = await Promise.all([
        db.query(`SELECT id, code, band, sort_order, active FROM grades ${where} ORDER BY sort_order, code`),
        db.query(`SELECT id, grade_id, name, sort_order, active FROM grade_positions ${where} ORDER BY sort_order, name`),
        db.query(`SELECT id, position_id, name, sort_order, active FROM grade_designations ${where} ORDER BY sort_order, name`),
    ]);

    const designationsByPosition = new Map();
    designations.rows.forEach(({ position_id: positionId, ...designation }) => {
        if (!designationsByPosition.has(positionId)) designationsByPosition.set(positionId, []);
        designationsByPosition.get(positionId).push(designation);
    });

    const positionsByGrade = new Map();
    positions.rows.forEach(({ grade_id: gradeId, ...position }) => {
        if (!positionsByGrade.has(gradeId)) positionsByGrade.set(gradeId, []);
        positionsByGrade.get(gradeId).push({ ...position, designations: designationsByPosition.get(position.id) || [] });
    });

    return grades.rows.map((grade) => ({ ...grade, positions: positionsByGrade.get(grade.id) || [] }));
}

// For /recruitment/meta: an empty list until migration 021 has been run, so the MPR form still opens
export async function listActiveGrades(db) {
    try {
        return await listGradeMaster(db, { activeOnly: true });
    } catch (error) {
        if (error.code === "42P01") return []; // undefined_table
        throw error;
    }
}
