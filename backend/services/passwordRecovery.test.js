import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createResetPasswordHandler, findPasswordIdentity } from "./passwordRecovery.js";
import { employeeMappingPredicate } from "./accountCredentials.js";
import { signToken } from "../middleware/auth.js";

const response = () => ({
    code: 200, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
});
const grant = (options = {}) => signToken("0007", {
    identityType: "employee", purpose: "password-reset", credentialVersion: 9, ...options,
});
const request = (token = grant()) => ({
    body: { username: "EMP0007", new_password: "Chosen-Test-Password", reset_token: token },
});

class RecoveryDatabase {
    constructor() {
        this.queries = [];
        this.state = { hash: "original", version: 0, reset: true };
        this.eligible = true;
        this.failDelete = false;
        this.released = false;
    }
    async connect() { return this; }
    release() { this.released = true; }
    async query(sql, values = []) {
        this.queries.push(sql);
        if (sql.startsWith("BEGIN")) { this.snapshot = structuredClone(this.state); return { rows: [] }; }
        if (sql === "COMMIT") return { rows: [] };
        if (sql === "ROLLBACK") { this.state = this.snapshot; return { rows: [] }; }
        if (sql.includes("FROM employees") && !sql.includes("FROM employee_logins")) return { rows: [] };
        if (sql.includes("FROM employee_logins")) {
            assert.ok(sql.includes(employeeMappingPredicate));
            assert.match(sql, /l.enabled = TRUE.*e.status = 'Active'.*e.access_disabled IS NOT TRUE/);
            return { rows: this.eligible ? [{ employee_id: "0007" }] : [] };
        }
        if (sql.includes("SELECT id FROM password_resets")) {
            assert.match(sql, /verified = TRUE/);
            assert.match(sql, /expires_at >= CURRENT_TIMESTAMP/);
            assert.match(sql, /FOR UPDATE/);
            assert.deepEqual(values, ["0007", "employee"]);
            return { rows: this.state.reset ? [{ id: 9 }] : [] };
        }
        if (sql.includes("UPDATE employee_logins")) {
            this.state.hash = values[0]; this.state.version++;
            return { rows: [{ employee_id: "0007" }] };
        }
        if (sql.startsWith("DELETE FROM password_resets")) {
            if (this.failDelete) throw new Error("synthetic delete failure");
            this.state.reset = false;
            return { rowCount: 1 };
        }
        throw new Error(`Unexpected query: ${sql}`);
    }
}

test("employee recovery consumes grant atomically, changes only employee hash and rejects replay", async () => {
    const db = new RecoveryDatabase();
    const handler = createResetPasswordHandler(db);
    const res = response();
    await handler(request(), res);
    assert.equal(res.code, 200);
    assert.equal(await bcrypt.compare("Chosen-Test-Password", db.state.hash), true);
    assert.equal(db.state.version, 1);
    assert.equal(db.state.reset, false);
    assert.equal(db.queries.at(-1), "COMMIT");
    assert.equal(db.queries.some((sql) => /UPDATE employees|SET enabled|SET access_disabled/.test(sql)), false);
    assert.equal(db.released, true);
    const replay = response();
    await handler(request(), replay);
    assert.equal(replay.code, 401);
    assert.equal(db.state.version, 1);
});

test("reset consumption failure rolls password and version back", async () => {
    const db = new RecoveryDatabase();
    db.failDelete = true;
    const res = response();
    await createResetPasswordHandler(db)(request(), res);
    assert.equal(res.code, 500);
    assert.deepEqual(db.state, { hash: "original", version: 0, reset: true });
    assert.equal(db.queries.at(-1), "ROLLBACK");
});

test("disabled, inactive, blocked or unlinked identities cannot complete recovery", async () => {
    const db = new RecoveryDatabase();
    db.eligible = false;
    const res = response();
    await createResetPasswordHandler(db)(request(), res);
    assert.equal(res.code, 401);
    assert.equal(db.state.hash, "original");
    assert.equal(db.queries.some((sql) => sql.includes("UPDATE employee_logins")), false);
});

test("wrong identity, purpose, reset ID and expired grants cannot set a password", async () => {
    for (const token of [
        grant({ identityType: "hr" }), grant({ purpose: "session" }),
        grant({ credentialVersion: 8 }), grant({ ttl: -1 }),
        signToken("different", { identityType: "employee", purpose: "password-reset", credentialVersion: 9 }),
    ]) {
        const db = new RecoveryDatabase();
        const res = response();
        await createResetPasswordHandler(db)(request(token), res);
        assert.equal(res.code, 401);
        assert.equal(db.state.hash, "original");
    }
});

test("non-string and bcrypt-truncated password inputs fail before database access", async () => {
    for (const password of [null, 123456, {}, "short", "a".repeat(73), "\u00e9".repeat(37)]) {
        const db = new RecoveryDatabase();
        const req = request();
        req.body.new_password = password;
        const res = response();
        await createResetPasswordHandler(db)(req, res);
        assert.equal(res.code, 400);
        assert.equal(db.queries.length, 0);
    }
});

test("HR recovery resolves before touching employee schema", async () => {
    let queries = 0;
    const db = {
        async query(sql) {
            queries++;
            assert.doesNotMatch(sql, /employee_logins|employee_d365_mapping/);
            return { rows: [{ employee_id: "3391", email: "hr@example.invalid" }] };
        },
    };
    const identity = await findPasswordIdentity(db, "3391");
    assert.equal(identity.credentialType, "hr");
    assert.equal(queries, 1);
});

test("HR reset completion updates only HR credentials and consumes only HR recovery records", async () => {
    const queries = [];
    const db = {
        async connect() { return this; },
        release() {},
        async query(sql, values) {
            queries.push(sql);
            assert.doesNotMatch(sql, /employee_logins|employee_d365_mapping/);
            if (sql.includes("SELECT employee_id")) return { rows: [{ employee_id: "3391" }] };
            if (sql.includes("SELECT id FROM password_resets")) {
                assert.deepEqual(values, ["3391", "hr"]);
                return { rows: [{ id: 9 }] };
            }
            if (sql.includes("UPDATE employees")) {
                assert.match(sql, /LOWER\(role\) = 'hr'/);
                assert.match(sql, /auth_credential_version = auth_credential_version \+ 1/);
                assert.equal(await bcrypt.compare("Chosen-Test-Password", values[0]), true);
                return { rows: [{ employee_id: "3391" }] };
            }
            if (sql.startsWith("DELETE FROM password_resets")) {
                assert.deepEqual(values, ["3391", "hr"]);
                return { rowCount: 1 };
            }
            if (sql.startsWith("BEGIN") || sql === "COMMIT") return { rows: [] };
            throw new Error("Unexpected HR reset query");
        },
    };
    const req = request(signToken("3391", {
        identityType: "hr", purpose: "password-reset", credentialVersion: 9,
    }));
    req.body.username = "3391";
    const res = response();
    await createResetPasswordHandler(db)(req, res);
    assert.equal(res.code, 200);
    assert.equal(queries.at(-1), "COMMIT");
});

test("missing, expired or already consumed reset records cannot change credentials", async () => {
    const db = new RecoveryDatabase();
    db.state.reset = false;
    const res = response();
    await createResetPasswordHandler(db)(request(), res);
    assert.equal(res.code, 401);
    assert.equal(db.state.version, 0);
    assert.equal(db.queries.at(-1), "ROLLBACK");
});
