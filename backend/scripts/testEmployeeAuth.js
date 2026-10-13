// Server-side token auth for employee-master routes.
// Part 1-3 run in one transaction that is rolled back (no employee rows are created or changed).
// Part 4 starts the real server on a spare port and only sends requests that are rejected
// before any database write, plus read-only GETs.
// Usage: npm run test:employee-auth
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import express from "express";
import bcrypt from "bcryptjs";

const TEST_SECRET = "test-secret-for-employee-auth";
process.env.AUTH_TOKEN_SECRET = TEST_SECRET;

const { default: pool } = await import("../db.js");
const auth = await import("../middleware/auth.js");
const { signToken, verifyToken, createLoginHandler, requireAuth, requireHR, requireSelfOrHR, stripPassword } = auth;

const results = [];
const check = async (name, fn) => {
    try {
        await fn();
        results.push(`PASS  ${name}`);
    } catch (error) {
        results.push(`FAIL  ${name}\n      ${error.message}`);
    }
};

const db = await pool.connect();
let httpServer;
let child;

const call = async (base, method, path, { token, body } = {}) => {
    const response = await fetch(`${base}${path}`, {
        method,
        headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: response.status, json, text };
};

try {
    // ---- 1. Token unit tests
    await check("token: sign/verify round trip", () => {
        assert.equal(verifyToken(signToken("E1")).sub, "E1");
    });
    await check("token: tampered payload is rejected", () => {
        const [, sig] = signToken("E1").split(".");
        const forged = `${Buffer.from(JSON.stringify({ sub: "HR1", exp: 9999999999 })).toString("base64url")}.${sig}`;
        assert.equal(verifyToken(forged), null);
    });
    await check("token: wrong secret is rejected", () => {
        assert.equal(verifyToken(signToken("E1", { key: "other" })), null);
    });
    await check("token: expired token is rejected", () => {
        assert.equal(verifyToken(signToken("E1", { ttl: 10, now: Date.now() - 60_000 })), null);
    });
    await check("token: garbage and non-strings are rejected", () => {
        for (const value of ["", "abc", "a.b.c", null, undefined, 42]) assert.equal(verifyToken(value), null);
    });
    await check("stripPassword removes only the password", () => {
        assert.deepEqual(stripPassword({ id: 1, password: "x", name: "A" }), { id: 1, name: "A" });
    });

    // ---- 2/3. Login + middleware against rolled-back temporary employees
    await db.query("BEGIN");
    const hash = await bcrypt.hash("Pass#1234", 4);
    const insert = (id, role, password, disabled = false) => db.query(
        `INSERT INTO employees (employee_id, name, email, role, password, status, access_disabled)
         VALUES ($1, $2, $3, $4, $5, 'Active', $6)`,
        [id, `Test ${id}`, `${id.toLowerCase()}@auth-test.invalid`, role, password, disabled]
    );
    await insert("T-HR", "hr", hash);
    await insert("T-EMP", "employee", hash);
    await insert("T-EMP2", "employee", hash);
    await insert("T-NOPW", "employee", null);
    await insert("T-OFF", "employee", hash, true);

    const app = express();
    app.use(express.json());
    app.post("/login", createLoginHandler(db));
    const guard = requireAuth(db);
    app.get("/hr-only", guard, requireHR, (req, res) => res.json({ ok: true }));
    app.put("/emp/:employeeId", guard, requireSelfOrHR, (req, res) => res.json({ ok: true }));
    httpServer = app.listen(0);
    const base = `http://127.0.0.1:${httpServer.address().port}`;
    const login = (employee_id, password) => call(base, "POST", "/login", { body: { employee_id, password } });

    await check("HR login returns token, no password hash", async () => {
        const r = await login("T-HR", "Pass#1234");
        assert.equal(r.status, 200);
        assert.equal(r.json.employee.role, "hr");
        assert.ok(r.json.token);
        assert.ok(!("password" in r.json.employee));
        assert.ok(!r.text.includes(hash));
    });
    await check("employee login returns token, no password hash", async () => {
        const r = await login("T-EMP", "Pass#1234");
        assert.equal(r.status, 200);
        assert.equal(r.json.employee.employee_id, "T-EMP");
        assert.ok(r.json.token);
        assert.ok(!r.text.includes(hash));
    });
    await check("wrong password -> 401", async () => {
        assert.equal((await login("T-EMP", "nope")).status, 401);
    });
    await check("unknown employee -> 401", async () => {
        assert.equal((await login("T-NOBODY", "Pass#1234")).status, 401);
    });
    await check("NULL password account -> 401 (not 500)", async () => {
        assert.equal((await login("T-NOPW", "anything")).status, 401);
    });
    await check("disabled account -> 403", async () => {
        assert.equal((await login("T-OFF", "Pass#1234")).status, 403);
    });
    await check("missing credentials -> 400", async () => {
        assert.equal((await login("", "")).status, 400);
    });

    const tokenFor = async (id) => (await login(id, "Pass#1234")).json.token;
    const hrToken = await tokenFor("T-HR");
    const empToken = await tokenFor("T-EMP");

    await check("missing token -> 401", async () => {
        assert.equal((await call(base, "GET", "/hr-only")).status, 401);
        assert.equal((await call(base, "PUT", "/emp/T-EMP")).status, 401);
    });
    await check("invalid and spoofed-header requests -> 401", async () => {
        assert.equal((await call(base, "GET", "/hr-only", { token: "bad.token" })).status, 401);
        const spoof = await fetch(`${base}/hr-only`, { headers: { "x-employee-id": "T-HR" } });
        assert.equal(spoof.status, 401);
    });
    await check("employee token on HR-only route -> 403", async () => {
        assert.equal((await call(base, "GET", "/hr-only", { token: empToken })).status, 403);
    });
    await check("HR token on HR-only route -> 200", async () => {
        assert.equal((await call(base, "GET", "/hr-only", { token: hrToken })).status, 200);
    });
    await check("employee can edit own record, not another's", async () => {
        assert.equal((await call(base, "PUT", "/emp/T-EMP", { token: empToken })).status, 200);
        assert.equal((await call(base, "PUT", "/emp/T-EMP2", { token: empToken })).status, 403);
    });
    await check("HR can edit any employee record", async () => {
        assert.equal((await call(base, "PUT", "/emp/T-EMP2", { token: hrToken })).status, 200);
    });
    await check("token of a deleted employee stops working", async () => {
        await db.query("SAVEPOINT s");
        await db.query("DELETE FROM employees WHERE employee_id = 'T-EMP2'");
        const ghost = signToken("T-EMP2");
        assert.equal((await call(base, "PUT", "/emp/T-EMP2", { token: ghost })).status, 401);
        await db.query("ROLLBACK TO SAVEPOINT s");
    });
    await check("token stops working once access is disabled", async () => {
        await db.query("SAVEPOINT s");
        await db.query("UPDATE employees SET access_disabled = true WHERE employee_id = 'T-EMP'");
        assert.equal((await call(base, "PUT", "/emp/T-EMP", { token: empToken })).status, 403);
        await db.query("ROLLBACK TO SAVEPOINT s");
    });
    await check("role demotion applies to existing tokens", async () => {
        await db.query("SAVEPOINT s");
        await db.query("UPDATE employees SET role = 'employee' WHERE employee_id = 'T-HR'");
        assert.equal((await call(base, "GET", "/hr-only", { token: hrToken })).status, 403);
        await db.query("ROLLBACK TO SAVEPOINT s");
    });

    await db.query("ROLLBACK");

    // ---- 4. Real server: route protection and module regressions
    const live = (await pool.query(
        `SELECT employee_id, role FROM employees WHERE role IN ('hr', 'employee') ORDER BY role, id`
    )).rows;
    const realHR = live.find((row) => row.role === "hr");
    const realEmployees = live.filter((row) => row.role === "employee");
    assert.ok(realHR && realEmployees.length >= 2, "needs one HR and two employees in the database");
    const [empA, empB] = realEmployees;

    const port = 5000 + 700 + Math.floor(Math.random() * 90);
    child = spawn(process.execPath, [fileURLToPath(new URL("../server.js", import.meta.url))], {
        env: { ...process.env, PORT: String(port), AUTH_TOKEN_SECRET: TEST_SECRET },
        stdio: "ignore",
    });
    const live_base = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try { await fetch(`${live_base}/api/employees`); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
    }

    const hrLive = signToken(realHR.employee_id);
    const empLive = signToken(empA.employee_id);

    const protectedRoutes = [
        ["POST", "/api/employees"],
        ["PUT", `/api/employees/${empA.employee_id}`],
        ["PATCH", `/api/employees/${empA.employee_id}/status`],
        ["DELETE", `/api/employees/${empA.employee_id}`],
        ["POST", `/api/employees/${empA.employee_id}/reset-password`],
        ["POST", `/api/employees/${empA.employee_id}/change-password`],
        ["PUT", `/api/employees/${empA.employee_id}/about`],
        ["POST", `/api/employees/${empA.employee_id}/education`],
        ["PUT", `/api/employees/${empA.employee_id}/bank`],
        ["POST", `/api/employees/${empA.employee_id}/experience`],
        ["PUT", "/api/hr/employee-requests/1"],
    ];
    await check("live: every employee-master write rejects missing tokens (401)", async () => {
        for (const [method, path] of protectedRoutes) {
            const r = await call(live_base, method, path, { body: {} });
            assert.equal(r.status, 401, `${method} ${path} -> ${r.status}`);
        }
    });
    await check("live: HR-only routes reject an employee token (403)", async () => {
        const hrOnly = protectedRoutes.filter(([m, p]) =>
            (m === "POST" && p === "/api/employees") || p.endsWith("/status") ||
            p.endsWith("/reset-password") || p.startsWith("/api/hr/") || (m === "DELETE"));
        for (const [method, path] of hrOnly) {
            const r = await call(live_base, method, path, { token: empLive, body: {} });
            assert.equal(r.status, 403, `${method} ${path} -> ${r.status}`);
        }
    });
    await check("live: employee token cannot write another employee's record (403)", async () => {
        for (const [method, section] of [["PUT", ""], ["PUT", "/about"], ["POST", "/education"], ["PUT", "/bank"]]) {
            const r = await call(live_base, method, `/api/employees/${empB.employee_id}${section}`, { token: empLive, body: {} });
            assert.equal(r.status, 403, `${method} ${section} -> ${r.status}`);
        }
    });
    await check("live: self PUT cannot change employee_id (400, nothing written)", async () => {
        const r = await call(live_base, "PUT", `/api/employees/${empA.employee_id}`, {
            token: empLive, body: { employee_id: "SOMEONE-ELSE" },
        });
        assert.equal(r.status, 400);
    });
    await check("live: HR passes auth; invalid exit status -> 400 (nothing written)", async () => {
        const r = await call(live_base, "PATCH", `/api/employees/${empA.employee_id}/status`, {
            token: hrLive, body: { status: "NotAStatus" },
        });
        assert.equal(r.status, 400);
    });
    await check("live: GET /api/employees returns no password field", async () => {
        const r = await call(live_base, "GET", "/api/employees");
        assert.equal(r.status, 200);
        assert.ok(Array.isArray(r.json) && r.json.length > 0);
        assert.ok(r.json.every((row) => !("password" in row)));
        assert.ok(!r.text.includes("$2a$") && !r.text.includes("$2b$"));
    });
    await check("live: existing modules still readable without a token", async () => {
        for (const path of ["/api/dashboard", "/api/attendance", "/api/leaves", "/api/payroll"]) {
            const r = await call(live_base, "GET", path);
            assert.equal(r.status, 200, `${path} -> ${r.status}`);
        }
        const details = await call(live_base, "GET", `/api/employees/${empA.employee_id}/details`);
        assert.equal(details.status, 200);
    });
    await check("live: leave and attendance write APIs are not auth-gated by this stage", async () => {
        // Empty bodies fail validation (400/404/422), never 401/403
        for (const [method, path] of [["POST", "/api/leaves"], ["POST", "/api/attendance/punch-in"]]) {
            const r = await call(live_base, method, path, { body: {} });
            assert.ok(![401, 403].includes(r.status), `${method} ${path} -> ${r.status}`);
        }
    });
} catch (error) {
    results.push(`FAIL  setup/teardown\n      ${error.stack || error.message}`);
    await db.query("ROLLBACK").catch(() => {});
} finally {
    if (child) child.kill();
    if (httpServer) httpServer.close();
    db.release();
    await pool.end();
}

console.log(results.join("\n"));
const failed = results.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
