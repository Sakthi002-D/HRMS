// Two-way employee sync between HRMS and D365 EmployeesV2 for linked identities only.
//
// Pull (D365 -> HRMS): for every employee_d365_mapping row with link_status='linked'
// that matches exactly one D365 employment, overlapping profile fields are updated in
// HRMS when D365 differs. HR accounts, unlinked/demo employees, credentials, role and
// access_disabled are never touched by the pull.
//
// Push (HRMS -> D365): after an HRMS employee update, the fields HR actually changed
// (email, phone, gender, marital status, birth date, joining date, designation) are
// PATCHed to the linked D365 employment. Name and status are pull-only: pushing status
// would end the D365 employment (payroll, leave) and HRMS keeps one full-name field
// while D365 splits first/middle/last.
// Push is best-effort and must never block or fail the HRMS write. Set
// D365_PUSH_ENABLED=false to turn the push off entirely (pull keeps running).
import { getD365Config, getAccessToken } from "./d365Employees.js";
import { fetchD365Pages } from "../scripts/d365Reconciliation.js";
import { importNewD365Workers } from "./d365EmployeeProvisioning.js";

// Only the fields the pull actually compares (First/Middle/Last name are not needed: Name is pull-only).
// OriginalHireDateTime confirmed present on EmployeesV2 (verified via testD365Fields.js).
// Department is NOT on EmployeesV2 — it lives on the Position entity (separate D365 API call needed).
const SELECT = [
    "PersonnelNumber", "EmploymentLegalEntityId", "EmploymentId", "Name",
    "PrimaryContactEmail", "PrimaryContactPhone", "Gender", "MaritalStatus", "BirthDate",
    "OriginalHireDateTime", "EmploymentStartDate",
    "EmploymentEndDate", "TerminationDate", "LastDateWorked", "ProfessionalTitle",
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
export const buildPullTarget = (source, positionInfo = {}) => {
    const hasEnded = !isOpenEnded(source.EmploymentEndDate) && new Date(source.EmploymentEndDate) < new Date();
    const terminated = !isUnset(source.TerminationDate) && !isOpenEnded(source.TerminationDate);
    return {
        name: norm(source.Name) || null,
        email: lower(source.PrimaryContactEmail) || null,
        phone: norm(source.PrimaryContactPhone) || null,
        gender: GENDER_MAP[lower(source.Gender)] ?? null,
        marital_status: MARITAL_MAP[lower(source.MaritalStatus)] ?? null,
        date_of_birth: toDate(source.BirthDate),
        // OriginalHireDateTime = the date the person first joined the company (e.g. 2022-05-14).
        // EmploymentStartDate = the start of their current employment record (may differ after rehire).
        // toDate() slices the DateTime to "YYYY-MM-DD" and treats 1900-era values as null.
        joining_date: toDate(source.OriginalHireDateTime) || toDate(source.EmploymentStartDate),
        employment_end_date: isOpenEnded(source.EmploymentEndDate) ? "Never" : toDate(source.EmploymentEndDate),
        last_date_worked: toDate(source.LastDateWorked),
        status: hasEnded || terminated ? "Inactive" : "Active",
        designation: norm(positionInfo.positionDesignation) || norm(source.ProfessionalTitle) || null,
        department: norm(positionInfo.department) || null,
        work_location: norm(positionInfo.workLocation) || null,
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

const odataKey = (value) => encodeURIComponent(String(value).replace(/'/g, "''"));
const d365EntityUrl = (config, mapping, select = null) =>
    `${config.baseUrl}/data/EmployeesV2(PersonnelNumber='${odataKey(mapping.personnel_number)}'`
    + `,EmploymentLegalEntityId='${odataKey(mapping.employment_legal_entity_id)}'`
    + `,EmploymentId='${odataKey(mapping.employment_id)}')?cross-company=true${select ? `&$select=${select}` : ""}`;

const LOOKUP_TIMEOUT_MS = 30_000;
const LOOKUP_BATCH_SIZE = 50;
// D365 rejects a plain 'Yes' here (400): the field is an enum, not a string
const IS_PRIMARY = "IsPrimaryPosition eq Microsoft.Dynamics.DataEntities.NoYes'Yes'";

// Position, department and city are extras: a failed lookup gives no rows and the sync carries on.
const d365Lookup = async (origin, token, entity, query) => {
    try {
        const response = await fetch(`${origin}/data/${entity}?${query}&cross-company=true`, {
            method: "GET",
            redirect: "error",
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
        });
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data?.value) ? data.value : [];
    } catch {
        return [];
    }
};

const odataEq = (field, value) => `${field} eq '${odataKey(value)}'`;

const d365LookupMany = async (origin, token, entity, field, values, select) => {
    const unique = [...new Set(values.map(norm).filter(Boolean))];
    const rows = [];
    for (let index = 0; index < unique.length; index += LOOKUP_BATCH_SIZE) {
        const filter = unique.slice(index, index + LOOKUP_BATCH_SIZE).map((value) => odataEq(field, value)).join(" or ");
        rows.push(...await d365Lookup(origin, token, entity, `$filter=${filter}&$select=${select}`));
    }
    return rows;
};

// Primary position, department and work location for one employee. Never throws.
export async function fetchPositionInfo(origin, token, personnelNumber, legalEntityId) {
    try {
        const [assignment] = await d365Lookup(origin, token, "PositionWorkerAssignments",
            `$filter=${odataEq("PersonnelNumber", personnelNumber)} and ${IS_PRIMARY}&$top=1&$select=PositionId`);
        const [position] = assignment?.PositionId
            ? await d365Lookup(origin, token, "PositionDetails",
                `$filter=${odataEq("PositionId", assignment.PositionId)}&$top=1&$select=PositionId,Description,DepartmentNumber`)
            : [];
        const [department] = position?.DepartmentNumber
            ? await d365Lookup(origin, token, "Departments",
                `$filter=${odataEq("OperatingUnitNumber", position.DepartmentNumber)}&$top=1&$select=Name,OperatingUnitNumber`)
            : [];
        const [legalEntity] = await d365Lookup(origin, token, "LegalEntities",
            `$filter=${odataEq("LegalEntityId", legalEntityId)}&$top=1&$select=AddressCity`);
        return {
            positionDesignation: position?.Description,
            department: department?.Name,
            workLocation: legalEntity?.AddressCity,
        };
    } catch {
        return {};
    }
}

// Full sync: primary position of each linked employee, by personnel number
const fetchPrimaryPositions = async (origin, token, personnelNumbers) => {
    const assignments = (await d365Lookup(origin, token, "PositionWorkerAssignments",
        `$filter=${IS_PRIMARY}&$select=PersonnelNumber,PositionId&$top=5000`))
        .filter((assignment) => personnelNumbers.has(norm(assignment.PersonnelNumber)));
    const details = await d365LookupMany(origin, token, "PositionDetails", "PositionId",
        assignments.map((assignment) => assignment.PositionId), "PositionId,Description,DepartmentNumber");
    const positionById = new Map(details.map((position) => [norm(position.PositionId), position]));
    return new Map(assignments.map((assignment) => [norm(assignment.PersonnelNumber), positionById.get(norm(assignment.PositionId))]));
};

// Full sync: department and city names, returned as the lookup planPull uses per employee
const fetchDepartmentLookup = async (origin, token, positions, legalEntityIds) => {
    const departments = await d365LookupMany(origin, token, "Departments", "OperatingUnitNumber",
        [...positions.values()].map((position) => position?.DepartmentNumber), "Name,OperatingUnitNumber");
    const legalEntities = await d365LookupMany(origin, token, "LegalEntities", "LegalEntityId", legalEntityIds, "LegalEntityId,AddressCity");
    const departmentNames = new Map(departments.map((department) => [norm(department.OperatingUnitNumber), department.Name]));
    const cities = new Map(legalEntities.map((legalEntity) => [lower(legalEntity.LegalEntityId), legalEntity.AddressCity]));

    return (personnelNumber, legalEntityId) => {
        const position = positions.get(norm(personnelNumber));
        return {
            positionDesignation: position?.Description,
            department: departmentNames.get(norm(position?.DepartmentNumber)),
            workLocation: cities.get(lower(legalEntityId)),
        };
    };
};

const CURRENT_COLUMNS = "employee_id, name, email, phone, gender, marital_status, date_of_birth, joining_date, employment_end_date, last_date_worked, status, designation, department, work_location";
const LINKED_MAPPINGS_SQL = `SELECT m.employee_id, m.personnel_number, m.employment_legal_entity_id, m.employment_id
         FROM employee_d365_mapping m
         JOIN employees e ON e.employee_id = m.employee_id
         WHERE m.link_status = 'linked' AND LOWER(e.role) = 'employee'`;

const stopwatch = () => {
    const start = Date.now();
    return () => Date.now() - start;
};

// Decides what (if anything) to write for one linked employee. Shared by the full and single sync.
async function planPull(pool, mapping, source, current, summary, positionInfo = {}) {
    if (!source) { summary.missingInD365++; return null; }
    if (source === "duplicate") { summary.skipped.push({ employee_id: mapping.employee_id, reason: "duplicate-d365-identity" }); return null; }
    if (!current) { summary.skipped.push({ employee_id: mapping.employee_id, reason: "missing-employee" }); return null; }
    const changes = diffPullTarget(buildPullTarget(source, positionInfo), current);
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
    if (!Object.keys(changes).length) { summary.unchanged++; return null; }
    return changes;
}

async function writePull(pool, employeeId, changes) {
    const fields = Object.keys(changes);
    await pool.query(
        `UPDATE employees SET ${fields.map((field, i) => `${field} = $${i + 1}`).join(", ")} WHERE employee_id = $${fields.length + 1}`,
        [...fields.map((field) => changes[field]), employeeId]
    );
}

export async function pullD365Changes(pool, { log = console.log } = {}) {
    const timings = {};
    const total = stopwatch();
    const step = async (name, work, detail = () => "") => {
        const elapsed = stopwatch();
        const result = await work();
        timings[name] = elapsed();
        log(`D365 sync [${name}] ${timings[name]}ms${detail(result)}`);
        return result;
    };

    const config = getD365Config();
    const token = await step("token", () => getAccessToken(config));
    const d365Rows = await step(
        "fetch",
        () => fetchD365Pages({ base: config.baseUrl, select: SELECT, authorization: `Bearer ${token}` }),
        (rows) => ` (${rows.length} rows)`
    );
    // Workers added in D365 since the last run become HRMS employees (with a login)
    const newWorkers = await step(
        "new-workers",
        () => importNewD365Workers(pool, d365Rows, { log }),
        (result) => ` (${result.imported.length} imported)`
    );
    const byIdentity = new Map();
    for (const row of d365Rows) {
        const key = identityKey(row);
        byIdentity.set(key, byIdentity.has(key) ? "duplicate" : row);
    }

    const { mappings, currentById } = await step("load", async () => {
        const rows = (await pool.query(LINKED_MAPPINGS_SQL)).rows;
        const current = (await pool.query(
            `SELECT ${CURRENT_COLUMNS} FROM employees WHERE employee_id = ANY($1::text[])`,
            [rows.map((mapping) => mapping.employee_id)]
        )).rows;
        return { mappings: rows, currentById: new Map(current.map((row) => [row.employee_id, row])) };
    }, ({ mappings: rows }) => ` (${rows.length} linked)`);

    const positions = await step(
        "positions",
        () => fetchPrimaryPositions(config.baseUrl, token, new Set(mappings.map((mapping) => norm(mapping.personnel_number)))),
        (found) => ` (${found.size} assigned)`
    );
    const getPositionInfo = await step("departments", () => fetchDepartmentLookup(
        config.baseUrl, token, positions, mappings.map((mapping) => mapping.employment_legal_entity_id)
    ));

    const summary = {
        d365Rows: d365Rows.length, linked: mappings.length, updated: 0, unchanged: 0, missingInD365: 0, skipped: [],
        newWorkers: { imported: newWorkers.imported, failed: newWorkers.failed, blocked: newWorkers.blocked, found: newWorkers.found },
    };
    const plans = await step("diff", async () => {
        const planned = [];
        for (const mapping of mappings) {
            const positionInfo = getPositionInfo(mapping.personnel_number, mapping.employment_legal_entity_id);
            const changes = await planPull(pool, mapping, byIdentity.get(identityKey(mapping)), currentById.get(mapping.employee_id), summary, positionInfo);
            if (changes) planned.push({ employeeId: mapping.employee_id, changes });
        }
        return planned;
    }, (planned) => ` (${planned.length} to write)`);

    await step("write", async () => {
        for (const { employeeId, changes } of plans) {
            await writePull(pool, employeeId, changes);
            summary.updated++;
        }
    });

    timings.total = total();
    log(`D365 sync total ${timings.total}ms`);
    return { ...summary, timings };
}

// Only one full sync may run at a time (scheduler and manual "Sync now" share this lock).
let fullSyncRunning = false;
export const isFullSyncRunning = () => fullSyncRunning;
export async function runFullSync(pool, options) {
    if (fullSyncRunning) return { alreadyRunning: true };
    fullSyncRunning = true;
    try {
        return { alreadyRunning: false, summary: await pullD365Changes(pool, options) };
    } finally {
        fullSyncRunning = false;
    }
}

// D365 usually answers in about 1s but can take minutes when it has been idle
// (measured: over 100s, then 72s, then 1s), so a timed-out read is tried once more.
const SINGLE_READ_TIMEOUT_MS = 120_000;
const SINGLE_READ_ATTEMPTS = 2;

// Returns undefined when D365 has no such record
const readD365Employee = async (url, token) => {
    for (let attempt = 1; ; attempt += 1) {
        try {
            const response = await fetch(url, {
                method: "GET",
                redirect: "error",
                headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                signal: AbortSignal.timeout(SINGLE_READ_TIMEOUT_MS),
            });
            if (response.status === 404) return undefined;
            if (!response.ok) throw new Error(`D365 EmployeesV2 read failed (${response.status})`);
            return await response.json();
        } catch (error) {
            if (error?.name !== "TimeoutError" || attempt === SINGLE_READ_ATTEMPTS) throw error;
        }
    }
};

// Fetches just one EmployeesV2 record by its D365 key and applies the same diff as the full pull.
export async function syncSingleEmployee(pool, employeeId, { log = console.log } = {}) {
    const total = stopwatch();
    const mapping = (await pool.query(`${LINKED_MAPPINGS_SQL} AND m.employee_id = $1`, [employeeId])).rows[0];
    if (!mapping) return { synced: false, reason: "not-linked" };

    const config = getD365Config();
    const token = await getAccessToken(config);
    const fetchTimer = stopwatch();
    // Use the key-based entity URL with SELECT. OriginalHireDateTime is confirmed to return
    // correctly via this URL when D365 is healthy (verified via testD365Fields.js).
    // The 2-minute timeout + retry above handles the occasional D365 slowness.
    const source = await readD365Employee(d365EntityUrl(config, mapping, SELECT), token);
    const fetchMs = fetchTimer();
    if (source === undefined) return { synced: false, reason: "missing-in-d365" };
    if (!source || typeof source !== "object" || identityKey(source) !== identityKey(mapping)) {
        return { synced: false, reason: "identity-mismatch" };
    }

    const positionInfo = await fetchPositionInfo(config.baseUrl, token, mapping.personnel_number, mapping.employment_legal_entity_id);
    const current = (await pool.query(`SELECT ${CURRENT_COLUMNS} FROM employees WHERE employee_id = $1`, [employeeId])).rows[0];
    const summary = { updated: 0, unchanged: 0, missingInD365: 0, skipped: [] };
    const changes = await planPull(pool, mapping, source, current, summary, positionInfo);
    if (changes) await writePull(pool, employeeId, changes);
    const result = {
        synced: true,
        updated: changes ? 1 : 0,
        fields: changes ? Object.keys(changes) : [],
        skipped: summary.skipped.map((entry) => entry.reason),
        name: changes?.name ?? current?.name ?? null,
        timings: { fetch: fetchMs, total: total() },
    };
    log(`D365 single sync ${employeeId}: fetch ${fetchMs}ms, total ${result.timings.total}ms, fields: ${result.fields.join(", ") || "none"}`);
    return result;
}

// Writable on EmployeesV2 via PATCH.
const PUSH_FIELDS = {
    designation: { d365: "ProfessionalTitle", value: (v) => norm(v) || null },
    email: { d365: "PrimaryContactEmail", value: (v) => norm(v) || null },
    phone: { d365: "PrimaryContactPhone", value: (v) => norm(v) || null },
    gender: { d365: "Gender", value: (v) => GENDER_MAP[lower(v)] ?? null },
    marital_status: { d365: "MaritalStatus", value: (v) => MARITAL_MAP[lower(v)] ?? null },
    date_of_birth: { d365: "BirthDate", value: (v) => (asDateString(v) ? `${asDateString(v)}T12:00:00Z` : null) },
    joining_date: { d365: "EmploymentStartDate", value: (v) => (asDateString(v) ? `${asDateString(v)}T12:00:00Z` : null) },
};

export const isPushEnabled = (env = process.env) => !["false", "0", "off", "no"].includes(lower(env.D365_PUSH_ENABLED));

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
    if (!isPushEnabled()) return { pushed: false, reason: "push-disabled" };
    const mapping = (await pool.query(
        `SELECT m.employee_id, m.personnel_number, m.employment_legal_entity_id, m.employment_id
         FROM employee_d365_mapping m
         JOIN employees e ON e.employee_id = m.employee_id
         WHERE m.employee_id = $1 AND m.link_status = 'linked' AND LOWER(e.role) = 'employee'`,
        [employeeId]
    )).rows[0];
    if (!mapping) return { pushed: false, reason: "not-linked" };
    const employee = (await pool.query(
        "SELECT email, phone, gender, marital_status, date_of_birth, joining_date, designation FROM employees WHERE employee_id = $1",
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

export const startD365SyncScheduler = (pool) => {
    const minutes = Number(process.env.D365_SYNC_INTERVAL_MINUTES) || 5;
    const run = async () => {
        try {
            const { alreadyRunning, summary } = await runFullSync(pool);
            if (alreadyRunning) return console.log("D365 pull sync skipped: sync already running");
            console.log(`D365 pull sync: ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.missingInD365} missing, ${summary.skipped.length} skipped`);
        } catch (error) {
            console.error("D365 pull sync failed:", error.message);
        }
    };
    setInterval(run, minutes * 60_000).unref?.();
    console.log(`D365 sync scheduler started (every ${minutes} minutes)`);
};
