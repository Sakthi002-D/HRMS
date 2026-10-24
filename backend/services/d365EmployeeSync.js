// Two-way employee sync between HRMS and D365 EmployeesV2 for linked identities only.
//
// Pull (D365 -> HRMS): for every employee_d365_mapping row with link_status='linked'
// that matches exactly one D365 employment, overlapping profile fields are updated in
// HRMS when D365 differs. HR accounts, unlinked/demo employees, credentials, role and
// access_disabled are never touched by the pull.
//
// Push (HRMS -> D365): after an HRMS employee update, the fields HR actually changed
// (email, phone, gender, marital status, birth date, joining date) are PATCHed to the
// linked D365 employment.
// Push is best-effort and must never block or fail the HRMS write.
import { getD365Config, getAccessToken } from "./d365Employees.js";
import { fetchD365Pages } from "../scripts/d365Reconciliation.js";

const SELECT = [
    "PersonnelNumber", "EmploymentLegalEntityId", "EmploymentId", "Name", "FirstName", "MiddleName", "LastName",
    "PrimaryContactEmail", "PrimaryContactPhone", "Gender", "MaritalStatus", "BirthDate", "EmploymentStartDate",
    "EmploymentEndDate", "TerminationDate", "LastDateWorked",
].join(",");

const norm = (value) => String(value ?? "").trim();
const lower = (value) => norm(value).toLowerCase();
const identityKey = (row) => JSON.stringify([
    norm(row.PersonnelNumber ?? row.personnel_number),
    norm(row.EmploymentLegalEntityId ?? row.employment_legal_entity_id),
    norm(row.EmploymentId ?? row.employment_id),
]);

// D365 uses 1900-01-01 for "not set" and dates >= 2100 for "no end"
const isUnset = (iso) => !norm(iso) || new Date(iso).getUTCFullYear() <= 1901;
const isOpenEnded = (iso) => !norm(iso) || new Date(iso).getUTCFullYear() >= 2100;
const toDate = (iso) => (isUnset(iso) || isOpenEnded(iso) ? null : norm(iso).slice(0, 10));
const GENDER_MAP = { male: "Male", female: "Female" };
const MARITAL_MAP = { single: "Single", married: "Married" };

// Same normalization the import uses; only fields D365 actually owns are compared.
export const buildPullTarget = (source) => {
    const composed = [source.FirstName, source.MiddleName, source.LastName].map(norm).filter(Boolean).join(" ");
    const hasEnded = !isOpenEnded(source.EmploymentEndDate) && new Date(source.EmploymentEndDate) < new Date();
    const terminated = !isUnset(source.TerminationDate) && !isOpenEnded(source.TerminationDate);
    return {
        name: norm(source.Name) || composed || null,
        email: lower(source.PrimaryContactEmail) || null,
        phone: norm(source.PrimaryContactPhone) || null,
        gender: GENDER_MAP[lower(source.Gender)] ?? null,
        marital_status: MARITAL_MAP[lower(source.MaritalStatus)] ?? null,
        date_of_birth: toDate(source.BirthDate),
        joining_date: toDate(source.EmploymentStartDate),
        employment_end_date: isOpenEnded(source.EmploymentEndDate) ? "Never" : toDate(source.EmploymentEndDate),
        last_date_worked: toDate(source.LastDateWorked),
        status: hasEnded || terminated ? "Inactive" : "Active",
    };
};

const asDateString = (value) => {
    if (value === null || value === undefined || value === "") return null;
    if (value instanceof Date) {
        // pg returns DATE columns as local-midnight Dates; toISOString would shift the day
        return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
    }
    return norm(value).slice(0, 10);
};

// Returns only the fields whose D365 value differs from the stored HRMS value.
// Null/empty D365 values never erase existing HRMS data (HRMS holds more detail).
export const diffPullTarget = (target, current) => {
    const changes = {};
    for (const [field, value] of Object.entries(target)) {
        if (value === null) continue;
        const stored = ["date_of_birth", "joining_date", "last_date_worked"].includes(field)
            ? asDateString(current[field])
            : (field === "employment_end_date" ? norm(current[field]) : norm(current[field] ?? ""));
        if (String(value) !== String(stored ?? "")) changes[field] = value;
    }
    return changes;
};

const d365EntityUrl = (config, mapping) =>
    `${config.baseUrl}/data/EmployeesV2(PersonnelNumber='${encodeURIComponent(mapping.personnel_number)}'`
    + `,EmploymentLegalEntityId='${encodeURIComponent(mapping.employment_legal_entity_id)}'`
    + `,EmploymentId='${encodeURIComponent(mapping.employment_id)}')?cross-company=true`;

export async function pullD365Changes(pool) {
    const config = getD365Config();
    const token = await getAccessToken(config);
    const d365Rows = await fetchD365Pages({ base: config.baseUrl, select: SELECT, authorization: `Bearer ${token}` });
    const byIdentity = new Map();
    for (const row of d365Rows) {
        const key = identityKey(row);
        byIdentity.set(key, byIdentity.has(key) ? "duplicate" : row);
    }

    const mappings = (await pool.query(
        `SELECT m.employee_id, m.personnel_number, m.employment_legal_entity_id, m.employment_id
         FROM employee_d365_mapping m
         JOIN employees e ON e.employee_id = m.employee_id
         WHERE m.link_status = 'linked' AND LOWER(e.role) = 'employee'`
    )).rows;

    const summary = { d365Rows: d365Rows.length, linked: mappings.length, updated: 0, unchanged: 0, missingInD365: 0, skipped: [] };
    for (const mapping of mappings) {
        const source = byIdentity.get(identityKey(mapping));
        if (!source) { summary.missingInD365++; continue; }
        if (source === "duplicate") { summary.skipped.push({ employee_id: mapping.employee_id, reason: "duplicate-d365-identity" }); continue; }
        const current = (await pool.query("SELECT * FROM employees WHERE employee_id = $1", [mapping.employee_id])).rows[0];
        if (!current) { summary.skipped.push({ employee_id: mapping.employee_id, reason: "missing-employee" }); continue; }
        const changes = diffPullTarget(buildPullTarget(source), current);
        if (changes.email) {
            const clash = await pool.query(
                "SELECT 1 FROM employees WHERE LOWER(email) = LOWER($1) AND employee_id <> $2",
                [changes.email, mapping.employee_id]
            );
            if (clash.rows.length) {
                summary.skipped.push({ employee_id: mapping.employee_id, reason: "email-conflict" });
                delete changes.email;
            }
        }
        const fields = Object.keys(changes);
        if (!fields.length) { summary.unchanged++; continue; }
        await pool.query(
            `UPDATE employees SET ${fields.map((field, i) => `${field} = $${i + 1}`).join(", ")} WHERE employee_id = $${fields.length + 1}`,
            [...fields.map((field) => changes[field]), mapping.employee_id]
        );
        summary.updated++;
    }
    return summary;
}

// Verified writable on EmployeesV2 via PATCH. Names are not pushed (HRMS keeps one
// full-name field while D365 splits first/middle/last).
const PUSH_FIELDS = {
    email: { d365: "PrimaryContactEmail", value: (v) => norm(v) || null },
    phone: { d365: "PrimaryContactPhone", value: (v) => norm(v) || null },
    gender: { d365: "Gender", value: (v) => GENDER_MAP[lower(v)] ?? null },
    marital_status: { d365: "MaritalStatus", value: (v) => MARITAL_MAP[lower(v)] ?? null },
    date_of_birth: { d365: "BirthDate", value: (v) => (asDateString(v) ? `${asDateString(v)}T12:00:00Z` : null) },
    joining_date: { d365: "EmploymentStartDate", value: (v) => (asDateString(v) ? `${asDateString(v)}T12:00:00Z` : null) },
};

// With `previous`, only fields whose value changed are included, so a stale HRMS value
// never overwrites a newer D365 one. Empty values are never pushed (no erasing D365).
export const buildPushBody = (employee, previous = null) => {
    const body = {};
    for (const [field, { d365, value }] of Object.entries(PUSH_FIELDS)) {
        const next = value(employee[field]);
        if (next === null) continue;
        if (previous && value(previous[field]) === next) continue;
        body[d365] = next;
    }
    return body;
};

export async function pushEmployeeToD365(pool, employeeId, previous = null) {
    const mapping = (await pool.query(
        `SELECT m.employee_id, m.personnel_number, m.employment_legal_entity_id, m.employment_id
         FROM employee_d365_mapping m
         JOIN employees e ON e.employee_id = m.employee_id
         WHERE m.employee_id = $1 AND m.link_status = 'linked' AND LOWER(e.role) = 'employee'`,
        [employeeId]
    )).rows[0];
    if (!mapping) return { pushed: false, reason: "not-linked" };
    const employee = (await pool.query(
        "SELECT email, phone, gender, marital_status, date_of_birth, joining_date FROM employees WHERE employee_id = $1",
        [employeeId]
    )).rows[0];
    if (!employee) return { pushed: false, reason: "missing-employee" };
    const body = buildPushBody(employee, previous);
    if (!Object.keys(body).length) return { pushed: false, reason: "no-pushable-fields" };

    const config = getD365Config();
    const token = await getAccessToken(config);
    const response = await fetch(d365EntityUrl(config, mapping), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok) return { pushed: false, reason: `d365-status-${response.status}` };
    return { pushed: true, fields: Object.keys(body) };
}

let syncRunning = false;
export const startD365SyncScheduler = (pool) => {
    const minutes = Number(process.env.D365_SYNC_INTERVAL_MINUTES) || 30;
    const run = async () => {
        if (syncRunning) return;
        syncRunning = true;
        try {
            const summary = await pullD365Changes(pool);
            console.log(`D365 pull sync: ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.missingInD365} missing, ${summary.skipped.length} skipped`);
        } catch (error) {
            console.error("D365 pull sync failed:", error.message);
        } finally {
            syncRunning = false;
        }
    };
    setInterval(run, minutes * 60_000).unref?.();
    console.log(`D365 sync scheduler started (every ${minutes} minutes)`);
};
