import test from "node:test";
import assert from "node:assert/strict";
import { applyD365EmployeeImport, D365_BACKUP_TABLES } from "./d365EmployeeApplyCore.js";

const now = new Date("2026-06-01T12:00:00.000Z");
const source = (number, extra = {}) => ({
    PersonnelNumber: number,
    EmploymentLegalEntityId: "SHLT",
    EmploymentId: `job-${number}`,
    Name: `Person ${number}`,
    ...extra,
});

class FakeDatabase {
    constructor({ employees = [], mappings = [], failMappingAt = null } = {}) {
        this.employees = structuredClone(employees);
        this.mappings = structuredClone(mappings);
        this.failMappingAt = failMappingAt;
        this.mappingInsertCount = 0;
        this.historyCounts = Object.fromEntries(
            D365_BACKUP_TABLES.filter((table) => !["employees", "employee_d365_mapping"].includes(table))
                .map((table) => [table, 1])
        );
        this.queries = [];
        this.snapshot = null;
    }

    counts() {
        return {
            ...this.historyCounts,
            employees: this.employees.length,
            employee_d365_mapping: this.mappings.length,
        };
    }

    async query(sql, params = []) {
        this.queries.push(sql);
        if (sql.startsWith("BEGIN")) {
            this.snapshot = {
                employees: structuredClone(this.employees),
                mappings: structuredClone(this.mappings),
            };
            return { rows: [], rowCount: 0 };
        }
        if (sql.startsWith("LOCK TABLE")) return { rows: [], rowCount: 0 };
        if (sql.includes("information_schema.columns")) {
            const columns = params[0] === "employees"
                ? [
                    "employee_id", "name", "email", "phone", "date_of_birth", "gender", "joining_date",
                    "marital_status", "status", "legal_entity", "employment_end_date", "last_date_worked",
                    "role", "password", "access_disabled",
                ]
                : [
                    "employee_id", "personnel_number", "employment_legal_entity_id", "employment_id", "link_status",
                ];
            return {
                rows: columns.map((column_name) => ({
                    column_name, is_nullable: column_name === "password" ? "YES" : "NO",
                })),
                rowCount: columns.length,
            };
        }
        if (sql.includes("FROM pg_index")) {
            const columns = params[0] === "public.employees"
                ? [["employee_id"]]
                : [
                    ["employee_id"],
                    ["employment_id", "employment_legal_entity_id", "personnel_number"],
                ];
            return { rows: columns.map((columns) => ({ contype: "u", columns })), rowCount: columns.length };
        }
        const countTable = sql.match(/FROM public\.([a-z0-9_]+)$/i)?.[1];
        if (sql.includes("COUNT(*)::int AS count") && countTable) {
            return { rows: [{ count: this.counts()[countTable] }], rowCount: 1 };
        }
        if (sql.startsWith("SELECT employee_id, name, email, phone FROM public.employees")) {
            return {
                rows: this.employees.map(({ employee_id, name, email, phone }) => ({
                    employee_id, name, email, phone,
                })),
                rowCount: this.employees.length,
            };
        }
        if (sql.includes("FROM public.employee_d365_mapping")) {
            return { rows: structuredClone(this.mappings), rowCount: this.mappings.length };
        }
        if (sql.startsWith("INSERT INTO public.employees")) {
            const [employee_id, name, email, phone, date_of_birth, gender, joining_date, marital_status,
                status, legal_entity, employment_end_date, last_date_worked, role, password, access_disabled] = params;
            this.employees.push({
                employee_id, name, email, phone, date_of_birth, gender, joining_date, marital_status,
                status, legal_entity, employment_end_date, last_date_worked, role, password, access_disabled,
            });
            return { rows: [{ employee_id }], rowCount: 1 };
        }
        if (sql.startsWith("INSERT INTO public.employee_d365_mapping")) {
            this.mappingInsertCount += 1;
            if (this.mappingInsertCount === this.failMappingAt) throw new Error("synthetic mapping failure");
            const [employee_id, personnel_number, employment_legal_entity_id, employment_id] = params;
            this.mappings.push({
                employee_id, personnel_number, employment_legal_entity_id, employment_id, link_status: "linked",
            });
            return { rows: [{ employee_id }], rowCount: 1 };
        }
        if (sql === "COMMIT") {
            this.snapshot = null;
            return { rows: [], rowCount: 0 };
        }
        if (sql === "ROLLBACK") {
            if (this.snapshot) {
                this.employees = this.snapshot.employees;
                this.mappings = this.snapshot.mappings;
            }
            this.snapshot = null;
            return { rows: [], rowCount: 0 };
        }
        throw new Error(`Unexpected test query: ${sql}`);
    }
}

const manifestFor = (db) => ({
    created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    created_by: "backup-operator",
    method: "pg_dump",
    full_database_backup: true,
    backup_id: "synthetic-backup-id",
    location: "synthetic-backup-location",
    verification: {
        independent: true,
        verified_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        verified_by: "independent-reviewer",
        method: "restore-test",
        result: "passed",
    },
    row_counts: db.counts(),
});

test("rolls back employee and mapping writes together on any insert failure", async () => {
    const db = new FakeDatabase({ failMappingAt: 2 });
    await assert.rejects(
        applyD365EmployeeImport(db, [source("001"), source("002")], manifestFor(db), { now }),
        /synthetic mapping failure/
    );
    assert.deepEqual(db.employees, []);
    assert.deepEqual(db.mappings, []);
    assert.ok(db.queries.includes("ROLLBACK"));
    assert.equal(db.queries.includes("COMMIT"), false);
});

test("duplicate composite identities are excluded without inserting either row", async () => {
    const db = new FakeDatabase();
    const row = source("001");
    const result = await applyD365EmployeeImport(db, [row, { ...row }], manifestFor(db), { now });
    assert.equal(result.imported, 0);
    assert.equal(result.skipped, 2);
    assert.equal(db.employees.length, 0);
    assert.equal(db.mappings.length, 0);
});

test("designated review and multi-employment identities remain pending human approval", async () => {
    const db = new FakeDatabase();
    const result = await applyD365EmployeeImport(
        db,
        [source("1610"), source("0042"), source("0042", { EmploymentId: "second-job" })],
        manifestFor(db),
        { now }
    );
    assert.equal(result.imported, 0);
    assert.equal(result.skipped, 3);
    assert.equal(db.employees.length, 0);
    assert.equal(db.mappings.length, 0);
});

test("missing or unverified backup manifest blocks the transaction before writes", async () => {
    const db = new FakeDatabase();
    await assert.rejects(
        applyD365EmployeeImport(db, [source("001")], null, { now }),
        /backup manifest is required/
    );
    assert.deepEqual(db.employees, []);
    assert.deepEqual(db.mappings, []);
    assert.ok(db.queries.includes("ROLLBACK"));
});

test("employee ID collisions fail closed and do not link or mutate legacy employees", async () => {
    const existing = {
        employee_id: "001", name: "Existing HRMS", email: "legacy@example.invalid", phone: "555",
        password: "unchanged-test-hash", status: "Active", role: "hr",
    };
    const db = new FakeDatabase({ employees: [existing] });
    await assert.rejects(
        applyD365EmployeeImport(db, [source("001")], manifestFor(db), { now }),
        /collides with an existing HRMS/
    );
    assert.deepEqual(db.employees, [existing]);
    assert.deepEqual(db.mappings, []);
});

test("imports only a new D365 identity with no password or enabled login, and reruns idempotently", async () => {
    const db = new FakeDatabase();
    const first = await applyD365EmployeeImport(db, [source("0007")], manifestFor(db), { now });
    assert.equal(first.imported, 1);
    assert.equal(db.employees[0].employee_id, "0007");
    assert.equal(db.employees[0].password, null);
    assert.equal(db.employees[0].role, "employee");
    assert.equal(db.employees[0].access_disabled, true);
    assert.deepEqual(db.mappings, [{
        employee_id: "0007", personnel_number: "0007", employment_legal_entity_id: "SHLT",
        employment_id: "job-0007", link_status: "linked",
    }]);
    assert.equal(db.queries.some((sql) => /employee_logins/i.test(sql)), false);

    const rerun = await applyD365EmployeeImport(db, [source("0007")], manifestFor(db), { now });
    assert.equal(rerun.imported, 0);
    assert.equal(rerun.skipped, 1);
    assert.equal(db.employees.length, 1);
    assert.equal(db.mappings.length, 1);
});

test("backup manifests must cover every protected HRMS table and have independent verification", async () => {
    const db = new FakeDatabase();
    const manifest = manifestFor(db);
    delete manifest.row_counts.password_resets;
    await assert.rejects(
        applyD365EmployeeImport(db, [source("001")], manifest, { now }),
        /password_resets/
    );
    assert.deepEqual(db.employees, []);
    assert.deepEqual(db.mappings, []);
});
