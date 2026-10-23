import { d365IdentityKey, reconcileD365 } from "./d365Reconciliation.js";

export const D365_BACKUP_TABLES = [
    "employees",
    "employee_d365_mapping",
    "attendance",
    "leaves",
    "employee_payroll",
    "password_resets",
    "employee_documents",
    "resignations",
];

const REQUIRED_EMPLOYEE_COLUMNS = [
    "employee_id", "name", "email", "phone", "date_of_birth", "gender", "joining_date",
    "marital_status", "status", "legal_entity", "employment_end_date", "last_date_worked",
    "role", "password", "access_disabled",
];
const REQUIRED_MAPPING_COLUMNS = [
    "employee_id", "personnel_number", "employment_legal_entity_id", "employment_id", "link_status",
];
const norm = (value) => String(value ?? "").trim();
const lower = (value) => norm(value).toLowerCase();
const REVIEW_PERSONNEL_NUMBERS = new Set(["1610", "2866"]);

const requiredString = (value, field) => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid D365 ${field}`);
    return value.trim();
};

const parseSourceDate = (value, field) => {
    const text = norm(value);
    if (!text) return null;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid D365 ${field}`);
    return date;
};

const sourceDateValue = (value, field) => {
    const date = parseSourceDate(value, field);
    if (!date || date.getUTCFullYear() <= 1901 || date.getUTCFullYear() >= 2100) return null;
    return date.toISOString().slice(0, 10);
};

const buildEmployee = (source, now) => {
    const personnelNumber = requiredString(source.PersonnelNumber, "PersonnelNumber");
    const legalEntity = requiredString(source.EmploymentLegalEntityId, "EmploymentLegalEntityId");
    requiredString(source.EmploymentId, "EmploymentId");
    const name = norm(source.Name)
        || [source.FirstName, source.MiddleName, source.LastName].map(norm).filter(Boolean).join(" ");
    if (!name) throw new Error("D365 employee name is missing");

    const endDate = parseSourceDate(source.EmploymentEndDate, "EmploymentEndDate");
    const terminationDate = parseSourceDate(source.TerminationDate, "TerminationDate");
    const hasEnded = endDate
        && endDate.getUTCFullYear() > 1901
        && endDate.getUTCFullYear() < 2100
        && endDate.getTime() < now.getTime();
    const terminated = terminationDate
        && terminationDate.getUTCFullYear() > 1901
        && terminationDate.getUTCFullYear() < 2100;
    const gender = { male: "Male", female: "Female" }[lower(source.Gender)] ?? null;
    const maritalStatus = { single: "Single", married: "Married" }[lower(source.MaritalStatus)] ?? null;

    return {
        employee_id: personnelNumber,
        name,
        email: norm(source.PrimaryContactEmail).toLowerCase() || null,
        phone: norm(source.PrimaryContactPhone) || null,
        date_of_birth: sourceDateValue(source.BirthDate, "BirthDate"),
        gender,
        joining_date: sourceDateValue(source.EmploymentStartDate, "EmploymentStartDate"),
        marital_status: maritalStatus,
        status: hasEnded || terminated ? "Inactive" : "Active",
        legal_entity: legalEntity,
        employment_end_date: !endDate || endDate.getUTCFullYear() <= 1901 || endDate.getUTCFullYear() >= 2100
            ? "Never"
            : sourceDateValue(source.EmploymentEndDate, "EmploymentEndDate"),
        last_date_worked: sourceDateValue(source.LastDateWorked, "LastDateWorked"),
        role: "employee",
        password: null,
        access_disabled: true,
    };
};

export function verifyD365BackupManifest(manifest, liveCounts, now = new Date()) {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        throw new Error("A verified full-database backup manifest is required");
    }
    const createdAt = new Date(manifest.created_at);
    const verifiedAt = new Date(manifest.verification?.verified_at);
    if (Number.isNaN(createdAt.getTime()) || Number.isNaN(verifiedAt.getTime())) {
        throw new Error("Backup manifest requires valid created_at and verification.verified_at timestamps");
    }
    const ageHours = (now.getTime() - createdAt.getTime()) / 3_600_000;
    if (ageHours < 0 || ageHours > 24 || verifiedAt < createdAt || verifiedAt > now) {
        throw new Error("Backup manifest is not recent or its verification timestamp is invalid");
    }
    if (!["pg_dump", "supabase-snapshot"].includes(manifest.method)
        || manifest.full_database_backup !== true
        || !norm(manifest.backup_id)
        || !norm(manifest.location)
        || !norm(manifest.created_by)) {
        throw new Error("Backup manifest must identify a recent full database backup");
    }
    const verification = manifest.verification;
    if (!verification || verification.independent !== true
        || verification.result !== "passed"
        || !norm(verification.verified_by)
        || !norm(verification.method)
        || lower(manifest.created_by) === lower(verification.verified_by)) {
        throw new Error("Backup manifest lacks a passed independent verification");
    }
    const mismatches = D365_BACKUP_TABLES.filter((table) =>
        !Number.isSafeInteger(manifest.row_counts?.[table])
        || manifest.row_counts[table] !== liveCounts[table]);
    if (mismatches.length) {
        throw new Error(`Backup row counts differ from the live database for: ${mismatches.join(", ")}`);
    }
    return { verified: true, ageHours };
}

const verifyColumns = async (db, table, required) => {
    const result = await db.query(
        `SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]
    );
    const columns = new Map(result.rows.map((row) => [row.column_name, row.is_nullable]));
    const missing = required.filter((column) => !columns.has(column));
    if (missing.length) throw new Error(`Required public.${table} columns are missing`);
    if (table === "employees" && columns.get("password") !== "YES") {
        throw new Error("Employee password column must allow NULL; no password can be created during import");
    }
};

const verifyUniqueConstraints = async (db, table, requiredKeys) => {
    const result = await db.query(
        `SELECT array_agg(a.attname ORDER BY a.attname) AS columns
         FROM pg_index index_row
         JOIN LATERAL unnest(index_row.indkey) WITH ORDINALITY AS key(attnum, ordinal)
              ON key.ordinal <= index_row.indnkeyatts
         JOIN pg_attribute a ON a.attrelid = index_row.indrelid AND a.attnum = key.attnum
         WHERE index_row.indrelid = to_regclass($1)
           AND index_row.indisunique AND index_row.indpred IS NULL AND index_row.indexprs IS NULL
         GROUP BY index_row.indexrelid`,
        [`public.${table}`]
    );
    const uniqueKeys = new Set(result.rows.map((row) => JSON.stringify(row.columns)));
    for (const columns of requiredKeys) {
        if (!uniqueKeys.has(JSON.stringify([...columns].sort()))) {
            throw new Error(`Required public.${table} uniqueness constraint is missing`);
        }
    }
};

const readLiveCounts = async (db) => {
    const counts = {};
    for (const table of D365_BACKUP_TABLES) {
        const result = await db.query(`SELECT COUNT(*)::int AS count FROM public.${table}`);
        counts[table] = result.rows[0].count;
    }
    return counts;
};

export async function applyD365EmployeeImport(db, d365Rows, backupManifest, { now = new Date() } = {}) {
    let transactionStarted = false;
    try {
        await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        transactionStarted = true;
        await db.query(
            "LOCK TABLE public.employees, public.employee_d365_mapping IN SHARE ROW EXCLUSIVE MODE"
        );

        await verifyColumns(db, "employees", REQUIRED_EMPLOYEE_COLUMNS);
        await verifyColumns(db, "employee_d365_mapping", REQUIRED_MAPPING_COLUMNS);
        await verifyUniqueConstraints(db, "employees", [["employee_id"]]);
        await verifyUniqueConstraints(db, "employee_d365_mapping", [
            ["employee_id"],
            ["personnel_number", "employment_legal_entity_id", "employment_id"],
        ]);

        const liveCounts = await readLiveCounts(db);
        const backup = verifyD365BackupManifest(backupManifest, liveCounts, now);
        const employees = (await db.query(
            "SELECT employee_id, name, email, phone FROM public.employees"
        )).rows;
        const mappings = (await db.query(
            `SELECT employee_id, personnel_number, employment_legal_entity_id, employment_id, link_status
             FROM public.employee_d365_mapping`
        )).rows;
        const reconciliation = reconcileD365(d365Rows, employees, mappings);

        const employeeIds = new Set(employees.map((row) => lower(row.employee_id)));
        const mappedKeys = new Set(mappings.map(d365IdentityKey));
        const identities = new Set();
        const newPersonnelNumbers = new Set();
        const safeRows = [];

        for (const [index, row] of d365Rows.entries()) {
            const decision = reconciliation.records[index];
            const personnelNumber = norm(row.PersonnelNumber);
            if (!personnelNumber || !norm(row.EmploymentLegalEntityId) || !norm(row.EmploymentId)
                || REVIEW_PERSONNEL_NUMBERS.has(personnelNumber)
                || decision.reasons.includes("multi-employment")
                || decision.reasons.includes("duplicate-identity")) continue;
            if (employeeIds.has(lower(personnelNumber)) && !mappedKeys.has(decision.key)) {
                throw new Error("D365 PersonnelNumber collides with an existing HRMS employee_id");
            }
            if (decision.category !== "new-record") continue;
            if (identities.has(decision.key) || newPersonnelNumbers.has(lower(personnelNumber))) {
                throw new Error("Duplicate D365 identity or PersonnelNumber detected before import");
            }
            identities.add(decision.key);
            newPersonnelNumbers.add(lower(personnelNumber));
            safeRows.push({ source: row, employee: buildEmployee(row, now) });
        }

        for (const { source, employee } of safeRows) {
            const insertedEmployee = await db.query(
                `INSERT INTO public.employees
                    (employee_id, name, email, phone, date_of_birth, gender, joining_date, marital_status,
                     status, legal_entity, employment_end_date, last_date_worked, role, password, access_disabled)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                 RETURNING employee_id`,
                [
                    employee.employee_id, employee.name, employee.email, employee.phone,
                    employee.date_of_birth, employee.gender, employee.joining_date, employee.marital_status,
                    employee.status, employee.legal_entity, employee.employment_end_date,
                    employee.last_date_worked, employee.role, null, true,
                ]
            );
            if (insertedEmployee.rowCount !== 1) throw new Error("D365 employee insert did not return one row");
            const insertedMapping = await db.query(
                `INSERT INTO public.employee_d365_mapping
                    (employee_id, personnel_number, employment_legal_entity_id, employment_id, link_status)
                 VALUES ($1, $2, $3, $4, 'linked')
                 RETURNING employee_id`,
                [
                    employee.employee_id,
                    requiredString(source.PersonnelNumber, "PersonnelNumber"),
                    requiredString(source.EmploymentLegalEntityId, "EmploymentLegalEntityId"),
                    requiredString(source.EmploymentId, "EmploymentId"),
                ]
            );
            if (insertedMapping.rowCount !== 1) throw new Error("D365 mapping insert did not return one row");
        }

        await db.query("COMMIT");
        transactionStarted = false;
        return {
            sourceRows: d365Rows.length,
            imported: safeRows.length,
            skipped: d365Rows.length - safeRows.length,
            backupAgeHours: backup.ageHours,
            loginsCreated: 0,
        };
    } catch (error) {
        if (transactionStarted) {
            try {
                await db.query("ROLLBACK");
            } catch (rollbackError) {
                throw new AggregateError(
                    [error, rollbackError],
                    "D365 import failed and the database rollback also failed"
                );
            }
        }
        throw error;
    }
}
