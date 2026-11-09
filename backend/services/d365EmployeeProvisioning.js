// New employees in either system.
//
// D365 -> HRMS: workers the reconciliation calls "new-record" (no HRMS employee, mapping,
// matching ID or e-mail) are added during the pull sync: employee row, linked mapping and an
// enabled login (username EMP<PersonnelNumber>, temporary password = username, must change),
// the same way the first 892 were imported. A run that finds more than MAX_NEW_PER_RUN new
// workers imports none of them, since that points at broken mappings rather than new hires.
//
// HRMS -> D365: an employee HR adds in HRMS is created on EmployeesV2 (PersonnelNumber =
// HRMS employee_id) and the returned employment is linked back. Best-effort: HRMS keeps the
// employee when D365 refuses, and "Sync this employee" retries the create.
import bcrypt from "bcryptjs";
import { getD365Config, getAccessToken } from "./d365Employees.js";
import { reconcileD365 } from "../scripts/d365Reconciliation.js";
import { buildEmployee } from "../scripts/d365EmployeeApplyCore.js";

export const MAX_NEW_PER_RUN = 50;
const SYNC_RUN_ID = "d365-sync";
const norm = (value) => String(value ?? "").trim();
const lower = (value) => norm(value).toLowerCase();
const PERSONNEL_NUMBER = /^[A-Za-z0-9-]+$/;

// Pure: D365 rows that are safe to add as new HRMS employees
export function planNewWorkers(d365Rows, employees, mappings, now = new Date()) {
    const { records } = reconcileD365(d365Rows, employees, mappings);
    const planned = [];
    const failed = [];
    records.forEach((record, index) => {
        if (record.category !== "new-record") return;
        try {
            planned.push({ source: d365Rows[index], employee: buildEmployee(d365Rows[index], now) });
        } catch (error) {
            failed.push({ personnelNumber: record.personnel_number, reason: error.message });
        }
    });
    return { planned, failed };
}

async function insertNewWorker(pool, { source, employee }) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(
            `INSERT INTO employees
                (employee_id, name, email, phone, date_of_birth, gender, joining_date, marital_status,
                 status, legal_entity, employment_end_date, last_date_worked, role, password, access_disabled)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'employee', NULL, FALSE)`,
            [
                employee.employee_id, employee.name, employee.email, employee.phone,
                employee.date_of_birth, employee.gender, employee.joining_date, employee.marital_status,
                employee.status, employee.legal_entity, employee.employment_end_date, employee.last_date_worked,
            ]
        );
        await client.query(
            `INSERT INTO employee_d365_mapping (employee_id, personnel_number, employment_legal_entity_id, employment_id, link_status, last_synced_at)
             VALUES ($1, $2, $3, $4, 'linked', CURRENT_TIMESTAMP)`,
            [employee.employee_id, norm(source.PersonnelNumber), norm(source.EmploymentLegalEntityId), norm(source.EmploymentId)]
        );
        // Same as the imported employees: temporary password = username, changed after first login
        const username = `EMP${norm(source.PersonnelNumber)}`;
        await client.query(
            `INSERT INTO employee_logins
                (employee_id, personnel_number, username, normalized_username, password_hash,
                 enabled, credential_version, must_change_password, provision_run_id)
             VALUES ($1, $2, $3, $4, $5, TRUE, 0, TRUE, $6)`,
            [employee.employee_id, norm(source.PersonnelNumber), username, username.toLowerCase(), await bcrypt.hash(username, 10), SYNC_RUN_ID]
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

// Called by the pull sync with the D365 rows it already fetched
export async function importNewD365Workers(pool, d365Rows, { log = console.log, now = new Date() } = {}) {
    const employees = (await pool.query("SELECT employee_id, name, email, phone FROM employees")).rows;
    const mappings = (await pool.query(
        "SELECT employee_id, personnel_number, employment_legal_entity_id, employment_id, link_status FROM employee_d365_mapping"
    )).rows;
    const { planned, failed } = planNewWorkers(d365Rows, employees, mappings, now);
    const result = { found: planned.length, imported: [], failed, blocked: false };
    if (planned.length > MAX_NEW_PER_RUN) {
        result.blocked = true;
        log(`D365 new workers: ${planned.length} found, more than ${MAX_NEW_PER_RUN}; none imported, needs review`);
        return result;
    }
    for (const worker of planned) {
        try {
            await insertNewWorker(pool, worker);
            result.imported.push(worker.employee.employee_id);
        } catch (error) {
            result.failed.push({ personnelNumber: worker.employee.employee_id, reason: error.message });
        }
    }
    if (planned.length || failed.length) {
        log(`D365 new workers: ${result.imported.length} imported${result.failed.length ? `, ${result.failed.length} failed` : ""}`);
    }
    return result;
}

const dateTime = (value) => {
    const text = value instanceof Date
        ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
        : norm(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00Z` : null;
};

// Pure: EmployeesV2 body for a new HRMS employee. Name splits into first / middle / last.
export function buildCreateBody(employee, today = new Date()) {
    const parts = norm(employee.name).split(/\s+/).filter(Boolean);
    const body = {
        PersonnelNumber: norm(employee.employee_id),
        EmploymentLegalEntityId: norm(employee.legal_entity) || "SHLT",
        FirstName: parts[0] || "",
        MiddleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
        LastName: parts.length > 1 ? parts[parts.length - 1] : "",
        EmploymentStartDate: dateTime(employee.joining_date) || dateTime(today),
        PrimaryContactEmail: norm(employee.email) || undefined,
        PrimaryContactPhone: norm(employee.phone) || undefined,
        Gender: { male: "Male", female: "Female" }[lower(employee.gender)],
        MaritalStatus: { single: "Single", married: "Married" }[lower(employee.marital_status)],
        BirthDate: dateTime(employee.date_of_birth) || undefined,
        ProfessionalTitle: norm(employee.designation) || undefined,
    };
    return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined && value !== ""));
}

export async function createEmployeeInD365(pool, employeeId, { log = console.log } = {}) {
    const linked = (await pool.query("SELECT 1 FROM employee_d365_mapping WHERE employee_id = $1", [employeeId])).rows.length;
    if (linked) return { created: false, reason: "already-linked" };
    const employee = (await pool.query(
        `SELECT employee_id, name, email, phone, gender, marital_status, date_of_birth, joining_date,
                designation, legal_entity, role
         FROM employees WHERE employee_id = $1`,
        [employeeId]
    )).rows[0];
    if (!employee || lower(employee.role) !== "employee") return { created: false, reason: "not-an-employee" };
    if (!PERSONNEL_NUMBER.test(norm(employee.employee_id)) || /^EMP/i.test(employee.employee_id)) {
        return { created: false, reason: "unsupported-employee-id" };
    }
    const body = buildCreateBody(employee);
    if (!body.FirstName || !body.LastName) return { created: false, reason: "needs-first-and-last-name" };

    const config = getD365Config();
    const token = await getAccessToken(config);
    const response = await fetch(`${new URL(config.baseUrl).origin}/data/EmployeesV2?cross-company=true`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000),
    });
    const reply = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = reply?.error?.innererror?.message || reply?.error?.message || `status ${response.status}`;
        log(`D365 create ${employeeId} failed: ${message}`);
        return { created: false, reason: "d365-refused", message };
    }
    const personnelNumber = norm(reply.PersonnelNumber) || body.PersonnelNumber;
    const legalEntity = norm(reply.EmploymentLegalEntityId) || body.EmploymentLegalEntityId;
    const employmentId = norm(reply.EmploymentId);
    if (!employmentId) return { created: true, linked: false, reason: "no-employment-id-returned" };
    await pool.query(
        `INSERT INTO employee_d365_mapping (employee_id, personnel_number, employment_legal_entity_id, employment_id, link_status, last_synced_at)
         VALUES ($1, $2, $3, $4, 'linked', CURRENT_TIMESTAMP)`,
        [employeeId, personnelNumber, legalEntity, employmentId]
    );
    log(`D365 create ${employeeId}: created as ${personnelNumber} / ${legalEntity} / ${employmentId}`);
    return { created: true, linked: true, personnelNumber, legalEntity, employmentId };
}
