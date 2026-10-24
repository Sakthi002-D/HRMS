import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { provisionD365EmployeeLogins } from "./d365EmployeeProvisionCore.js";
import { D365_BACKUP_TABLES } from "./d365EmployeeApplyCore.js";
import { employeeMappingPredicate } from "../services/accountCredentials.js";
import { createLoginHandler } from "../middleware/auth.js";

const now = new Date("2026-10-23T06:00:00Z");
const identity = (number = "0007") => ({
    employee_id: number, personnel_number: number,
    employment_legal_entity_id: "SHLT", employment_id: `job-${number}`,
});
const mapping = (number, extra = {}) => ({
    ...identity(number), link_status: "linked", role: "employee", status: "Active",
    access_disabled: true, mapping_valid: true, ...extra,
});

class FakeDatabase {
    constructor(mappings = [mapping("0007")], logins = []) {
        this.mappings = mappings;
        this.logins = structuredClone(logins);
        this.queries = [];
        this.inserts = 0;
        this.failAt = null;
    }
    counts() {
        return {
            ...Object.fromEntries(D365_BACKUP_TABLES.map((table) => [table, 0])),
            employees: this.mappings.length, employee_d365_mapping: this.mappings.length,
            employee_logins: this.logins.length,
        };
    }
    async query(sql, values = []) {
        this.queries.push(sql);
        if (sql.startsWith("BEGIN")) {
            this.snapshot = structuredClone(this.logins);
            this.readOnly = sql.includes("READ ONLY");
            return { rows: [] };
        }
        if (sql === "ROLLBACK") {
            this.logins = structuredClone(this.snapshot);
            return { rows: [] };
        }
        if (sql === "COMMIT" || sql.startsWith("LOCK TABLE")) return { rows: [] };
        if (sql.includes("COUNT(*)")) {
            const table = sql.match(/public\.([a-z0-9_]+)$/)[1];
            return { rows: [{ count: this.counts()[table] }] };
        }
        if (sql.includes("CROSS JOIN LATERAL")) {
            assert.ok(sql.includes(employeeMappingPredicate));
            return { rows: this.mappings };
        }
        if (sql.startsWith("SELECT employee_id, personnel_number")) return { rows: this.logins };
        if (sql.startsWith("INSERT INTO public.employee_logins")) {
            assert.equal(this.readOnly, false);
            if (++this.inserts === this.failAt) throw new Error("synthetic insertion failure");
            assert.match(sql, /FALSE, 0/);
            const [employee_id, personnel_number, username, normalized_username, password_hash, provision_run_id] = values;
            this.logins.push({
                employee_id, personnel_number, username, normalized_username, password_hash,
                provision_run_id, enabled: false, credential_version: 0,
            });
            return { rows: [{ employee_id }], rowCount: 1 };
        }
        throw new Error(`Unexpected query: ${sql}`);
    }
}
const manifestFor = (db) => ({
    created_at: "2026-10-23T05:00:00Z", method: "pg_dump", full_database_backup: true,
    backup_id: "mock-backup", location: "mock-location", created_by: "operator",
    verification: {
        independent: true, verified_at: "2026-10-23T05:30:00Z",
        verified_by: "reviewer", method: "restore-test", result: "passed",
    },
    row_counts: db.counts(),
});
const options = (db) => ({
    apply: true, backupManifest: manifestFor(db), runId: "test-run", operator: "test-operator", now,
});

test("default preview is read-only, returns no credentials and does not insert", async () => {
    const db = new FakeDatabase();
    const result = await provisionD365EmployeeLogins(db, [{ ...identity(), password: "must-not-echo" }]);
    assert.equal(result.proposed, 1);
    assert.equal(result.created, 0);
    assert.equal(db.logins.length, 0);
    assert.match(db.queries[0], /READ ONLY/);
    assert.equal(db.queries.at(-1), "ROLLBACK");
    assert.doesNotMatch(JSON.stringify(result), /must-not-echo|passwordHash|password_hash/);
});

test("apply preserves zeros, hashes undisclosed randomness and only inserts disabled logins", async () => {
    const db = new FakeDatabase();
    const result = await provisionD365EmployeeLogins(db, [identity()], options(db));
    const login = db.logins[0];
    assert.equal(login.username, "EMP0007");
    assert.equal(login.normalized_username, "emp0007");
    assert.equal(login.enabled, false);
    assert.equal(login.provision_run_id, "test-run");
    assert.equal(bcrypt.getRounds(login.password_hash), 10);
    assert.equal(await bcrypt.compare(login.username, login.password_hash), false);
    assert.equal(result.created, 1);
    assert.equal(result.operator, "test-operator");
    assert.doesNotMatch(JSON.stringify(result), /password|hash/i);
    assert.equal(db.queries.at(-1), "COMMIT");
    assert.equal(db.queries.some((sql) => /^\s*(UPDATE|DELETE)/.test(sql)), false);
    assert.equal(db.queries.filter((sql) => sql.startsWith("INSERT")).length, 1);
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await createLoginHandler({
        query: async (sql) => ({ rows: sql.includes("FROM employee_logins")
            ? [{ ...login, status: "Active", access_disabled: false }] : [] }),
    })({ body: { username: login.username, password: "arbitrary-password" } }, res);
    assert.equal(res.code, 403);
    assert.equal(res.body.token, undefined);
});

test("reruns preserve hashes, enabled state and credential versions", async () => {
    const db = new FakeDatabase();
    await provisionD365EmployeeLogins(db, [identity()], options(db));
    db.logins[0].enabled = true;
    db.logins[0].credential_version = 12;
    const before = structuredClone(db.logins);
    const result = await provisionD365EmployeeLogins(db, [identity()], options(db));
    assert.equal(result.created, 0);
    assert.equal(result.records[0].action, "existing-unchanged");
    assert.deepEqual(db.logins, before);
});

test("duplicate and non-string approved identities fail before a transaction", async () => {
    for (const identities of [[identity(), identity()], [{ ...identity(), personnel_number: 7 }],
        [identity("ab"), identity("AB")], []]) {
        const db = new FakeDatabase();
        await assert.rejects(provisionD365EmployeeLogins(db, identities));
        assert.equal(db.queries.length, 0);
    }
});

test("missing, invalid, duplicate, mismatched and HR mappings fail closed", async () => {
    for (const rows of [
        [], [mapping("0007", { mapping_valid: false })],
        [mapping("0007"), mapping("0007", { employment_id: "other" })],
        [mapping("0007", { employment_legal_entity_id: "OTHER" })],
        [mapping("0007", { link_status: "pending" })],
        [mapping("0007", { role: "hr" })],
        [mapping("0007", { employee_id: "different" })],
    ]) {
        const db = new FakeDatabase(rows);
        await assert.rejects(provisionD365EmployeeLogins(db, [identity()], options(db)), /linked identity/);
        assert.equal(db.inserts, 0);
        assert.equal(db.queries.at(-1), "ROLLBACK");
    }
});

test("manual review personnel numbers are excluded across all employments", async () => {
    const db = new FakeDatabase([]);
    const result = await provisionD365EmployeeLogins(db, [
        identity("1610"), { ...identity("1610"), employment_id: "second-1610" },
        identity("2866"), { ...identity("2866"), employment_id: "second-2866" },
    ]);
    assert.equal(result.proposed, 0);
    assert.equal(result.records.length, 4);
    assert.ok(result.records.every((row) => row.action === "excluded-manual-review"));
});

test("conflicting existing login aborts before any inserts", async () => {
    const db = new FakeDatabase(undefined, [{
        employee_id: "different", personnel_number: "0007",
        username: "EMP0007", normalized_username: "emp0007",
    }]);
    await assert.rejects(provisionD365EmployeeLogins(db, [identity()], options(db)), /Conflicting existing login/);
    assert.equal(db.inserts, 0);
});

test("mid-batch failure rolls back all login inserts", async () => {
    const db = new FakeDatabase([mapping("0007"), mapping("0008")]);
    db.failAt = 2;
    await assert.rejects(provisionD365EmployeeLogins(db, [identity(), identity("0008")], options(db)), /synthetic/);
    assert.deepEqual(db.logins, []);
    assert.equal(db.queries.includes("COMMIT"), false);
});

test("inactive and access-blocked employees remain blocked when staging logins", async () => {
    const db = new FakeDatabase([mapping("0007", { status: "Inactive", access_disabled: true })]);
    const before = structuredClone(db.mappings);
    const result = await provisionD365EmployeeLogins(db, [identity()], options(db));
    assert.equal(result.records[0].active, false);
    assert.equal(result.records[0].accessDisabled, true);
    assert.equal(db.logins[0].enabled, false);
    assert.deepEqual(db.mappings, before);
});

test("apply requires audit metadata and a verified backup including employee_logins", async () => {
    const db = new FakeDatabase();
    await assert.rejects(provisionD365EmployeeLogins(db, [identity()], { apply: true }), /run ID/);
    await assert.rejects(provisionD365EmployeeLogins(db, [identity()], {
        ...options(db), backupManifest: null,
    }), /backup manifest/);
    const opts = options(db);
    delete opts.backupManifest.row_counts.employee_logins;
    await assert.rejects(provisionD365EmployeeLogins(db, [identity()], opts), /employee_logins/);
    const mismatched = options(db);
    mismatched.backupManifest.row_counts.employee_logins = 1;
    await assert.rejects(provisionD365EmployeeLogins(db, [identity()], mismatched), /employee_logins/);
    const stale = options(db);
    stale.backupManifest.created_at = "2026-10-20T05:00:00Z";
    await assert.rejects(provisionD365EmployeeLogins(db, [identity()], stale), /not recent/);
    assert.equal(db.inserts, 0);
});
