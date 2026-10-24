import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import express from "express";
import {
    createApiAccessMiddleware,
    createLoginHandler,
    createChangePasswordHandler,
    requireAuth,
    requireHR,
    signToken,
} from "./auth.js";
import { buildInitialEmployeeCredential, setAccountPassword } from "../services/accountCredentials.js";

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    },
});

test("employee username and HR employee ID authenticate distinct identities", async () => {
    const hrHash = await bcrypt.hash("hr-pass-3391", 4);
    const credential = await buildInitialEmployeeCredential("3391");
    const employeeHash = await bcrypt.hash("chosen-employee-password", 4);
    const db = {
        async query(sql, [username]) {
            if (sql.includes("FROM employee_logins")) {
                return { rows: username.toLowerCase() === "emp3391"
                    ? [{
                        employee_id: "3391", name: "Employee 3391", status: "Active",
                        password_hash: employeeHash, credential_version: 3, enabled: true,
                    }]
                    : [] };
            }
            if (sql.includes("FROM employees")) {
                return { rows: username === "3391"
                    ? [{
                        employee_id: "3391", name: "HR 3391", role: "HR", status: "Active",
                        password: hrHash, credential_version: 7,
                    }]
                    : [] };
            }
            throw new Error(`Unexpected SQL: ${sql}`);
        },
    };

    for (const [username, password, expectedRole, expectedSub, expectedVersion] of [
        ["3391", "hr-pass-3391", "hr", "3391", 7],
        ["EMP3391", "chosen-employee-password", "employee", "3391", 3],
        ["emp3391", "chosen-employee-password", "employee", "3391", 3],
    ]) {
        const res = response();
        await createLoginHandler(db)({ body: { username, password } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.role, expectedRole);
        assert.equal(res.body.employee.role, expectedRole);
        assert.equal(res.body.employee.password, undefined);
        assert.equal(res.body.employee.password_hash, undefined);
        const claims = JSON.parse(Buffer.from(res.body.token.split(".")[0], "base64url").toString());
        assert.equal(claims.sub, expectedSub);
        assert.equal(claims.typ, expectedRole);
        assert.equal(claims.ver, expectedVersion);
    }
    assert.equal(credential.username, "EMP3391");
    assert.equal(credential.normalizedUsername, "emp3391");
    assert.equal(bcrypt.getRounds(credential.passwordHash), 10);
});

test("HR3391 login and session work before identity migration without querying employee schema", async () => {
    const password = "Existing-HR-Password";
    const hash = await bcrypt.hash(password, 4);
    const queries = [];
    const db = {
        async query(sql, [id]) {
            queries.push(sql);
            assert.doesNotMatch(sql, /employee_logins|employee_d365_mapping/);
            assert.match(sql, /to_jsonb\(e\)->>'auth_credential_version'/);
            return { rows: id === "3391" ? [{
                employee_id: "3391", role: "hr", status: "Active",
                password: hash, credential_version: 0,
            }] : [] };
        },
    };
    const res = response();
    await createLoginHandler(db)({ body: { employee_id: "3391", password } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.employee.role, "hr");
    assert.equal(res.body.employee.password, undefined);
    const req = { get: () => `Bearer ${res.body.token}` };
    let advanced = false;
    await requireAuth(db)(req, response(), () => { advanced = true; });
    assert.equal(advanced, true);
    assert.equal(req.auth.identityType, "hr");
    assert.equal(queries.length, 2);

    const wrong = response();
    await createLoginHandler(db)({ body: { employee_id: "3391", password: "Wrong-HR-Password" } }, wrong);
    assert.equal(wrong.statusCode, 401);
    assert.equal(wrong.body.token, undefined);
});

test("missing employee schema fails explicitly without HR credential fallback", async (t) => {
    for (const code of ["42P01", "42703"]) {
        await t.test(code, async () => {
            let employeeQueries = 0;
            const db = {
                async query(sql) {
                    if (sql.includes("FROM employee_logins")) {
                        employeeQueries++;
                        throw Object.assign(new Error("Synthetic missing schema"), { code });
                    }
                    return { rows: [] };
                },
            };
            const res = response();
            await createLoginHandler(db)({ body: { employee_id: "EMP3391", password: "EMP3391" } }, res);
            assert.equal(res.statusCode, 503);
            assert.match(res.body.message, /setup is incomplete/);
            assert.equal(res.body.token, undefined);
            assert.equal(employeeQueries, 1);
            const session = response();
            await requireAuth(db)({
                get: () => `Bearer ${signToken("3391", { identityType: "employee" })}`,
            }, session, () => assert.fail("Missing-schema employee authenticated"));
            assert.equal(session.statusCode, 503);
        });
    }
});

test("wrong passwords fail and legacy employee master passwords cannot bypass identity provisioning", async () => {
    const legacyHash = await bcrypt.hash("legacy-password", 4);
    const employeeHash = await bcrypt.hash("employee-password", 4);
    const db = {
        async query(sql, [username]) {
            if (sql.includes("FROM employee_logins")) {
                return { rows: username === "EMP3391"
                    ? [{ employee_id: "3391", status: "Active", password_hash: employeeHash, enabled: true }]
                    : [] };
            }
            if (sql.includes("FROM employees")) {
                return { rows: username === "3391"
                    ? [{ employee_id: "3391", role: "employee", password: legacyHash, status: "Active" }]
                    : [] };
            }
            throw new Error(`Unexpected SQL: ${sql}`);
        },
    };

    for (const attempt of [
        { username: "EMP3391", password: "incorrect" },
        { username: "3391", password: "legacy-password" },
    ]) {
        const res = response();
        await createLoginHandler(db)({ body: attempt }, res);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.token, undefined);
    }
});

test("password updates target only the selected account's credential store", async () => {
    const statements = [];
    const db = {
        async query(sql, values) {
            statements.push({ sql, values });
            return { rows: [{ employee_id: values[1] }] };
        },
    };

    await setAccountPassword(db, {
        identityType: "employee",
        employeeId: "3391",
        passwordHash: "employee-hash",
    });
    await setAccountPassword(db, {
        identityType: "hr",
        employeeId: "3391",
        passwordHash: "hr-hash",
    });

    assert.match(statements[0].sql, /UPDATE employee_logins/);
    assert.match(statements[0].sql, /password_hash/);
    assert.match(statements[0].sql, /credential_version = credential_version \+ 1/);
    assert.deepEqual(statements[0].values, ["employee-hash", "3391"]);
    assert.match(statements[1].sql, /UPDATE employees/);
    assert.match(statements[1].sql, /auth_credential_version = auth_credential_version \+ 1/);
    assert.match(statements[1].sql, /LOWER\(role\) = 'hr'/);
    assert.deepEqual(statements[1].values, ["hr-hash", "3391"]);
    assert.throws(() => setAccountPassword(db, { identityType: "unknown", employeeId: "3391", passwordHash: "x" }));
});

test("token validation rechecks enabled state and credential version", async () => {
    const reqFor = (token) => ({ get: () => `Bearer ${token}` });
    const token = signToken("3391", { identityType: "employee", credentialVersion: 4 });
    let row = {
        employee_id: "3391", name: "Employee", status: "Active",
        enabled: true, credential_version: 4,
    };
    const db = { query: async () => ({ rows: [row] }) };
    const req = reqFor(token);
    const res = response();
    let nextCalled = false;
    await requireAuth(db)(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.auth.role, "employee");
    assert.equal(req.auth.identityType, "employee");

    row = { ...row, credential_version: 5 };
    const stale = response();
    await requireAuth(db)(reqFor(token), stale, () => assert.fail("stale token accepted"));
    assert.equal(stale.statusCode, 401);

    row = { ...row, credential_version: 4, enabled: false };
    const disabled = response();
    await requireAuth(db)(reqFor(token), disabled, () => assert.fail("disabled token accepted"));
    assert.equal(disabled.statusCode, 401);

    const resetGrant = response();
    await requireAuth(db)(reqFor(signToken("3391", { identityType: "employee", purpose: "password-reset" })),
        resetGrant, () => assert.fail("recovery grant accepted as session"));
    assert.equal(resetGrant.statusCode, 401);
});

test("employee identity is denied HR routes and limited to its own records", async () => {
    const token = signToken("3391", { identityType: "employee", credentialVersion: 0 });
    const db = {
        async query() {
            return { rows: [{
                employee_id: "3391", name: "Employee", status: "Active",
                enabled: true, credential_version: 0,
            }] };
        },
    };
    const middleware = createApiAccessMiddleware(db);
    const makeRequest = (path, method = "GET") => ({
        path,
        method,
        body: {},
        get: () => `Bearer ${token}`,
        params: {},
    });

    const hrOnly = response();
    let nextCalled = false;
    await middleware(makeRequest("/hr/employee-requests"), hrOnly, () => { nextCalled = true; });
    assert.equal(hrOnly.statusCode, 403);
    assert.equal(nextCalled, false);

    const ownRecord = response();
    await middleware(makeRequest("/employees/3391/details"), ownRecord, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    const otherRecord = response();
    await middleware(makeRequest("/employees/HR3391/details"), otherRecord, () => assert.fail("cross-record access accepted"));
    assert.equal(otherRecord.statusCode, 403);

    let publicNext = false;
    await middleware(makeRequest("/careers/jobs"), response(), () => { publicNext = true; });
    assert.equal(publicNext, true);
});

test("initial credentials preserve leading zeros and reject invalid personnel numbers", async () => {
    const credential = await buildInitialEmployeeCredential("001013");
    assert.equal(credential.username, "EMP001013");
    assert.equal(await bcrypt.compare("EMP001013", credential.passwordHash), false);
    assert.equal(await bcrypt.compare("EMP1013", credential.passwordHash), false);
    assert.deepEqual(Object.keys(credential).sort(), ["normalizedUsername", "passwordHash", "personnelNumber", "username"]);
    assert.notEqual(credential.passwordHash, (await buildInitialEmployeeCredential("001013")).passwordHash);
    for (const value of ["", " EMP1", "EMP1", "../1", 1013]) {
        await assert.rejects(buildInitialEmployeeCredential(value), TypeError);
    }
});

test("EMP3391 password change preserves HR3391 hash and revokes employee sessions only", async () => {
    let employeeHash = await bcrypt.hash("Chosen-Employee-Password", 4);
    const originalHrHash = await bcrypt.hash("Existing-HR-Secret", 4);
    let hrHash = originalHrHash;
    let employeeVersion = 0;
    let hrVersion = 0;
    const db = {
        async query(sql, values) {
            if (sql.startsWith("SELECT password_hash AS password")) return { rows: [{ password: employeeHash }] };
            if (sql.startsWith("SELECT password FROM employees")) return { rows: [{ password: hrHash }] };
            if (sql.includes("UPDATE employee_logins")) {
                employeeHash = values[0]; employeeVersion++;
                return { rows: [{ employee_id: "3391" }] };
            }
            if (sql.includes("UPDATE employees")) {
                hrHash = values[0]; hrVersion++;
                return { rows: [{ employee_id: "3391" }] };
            }
            if (sql.includes("FROM employee_logins")) return { rows: [{
                employee_id: "3391", enabled: true, status: "Active", credential_version: employeeVersion,
            }] };
            if (sql.includes("FROM employees")) return { rows: [{
                employee_id: "3391", role: "hr", status: "Active", credential_version: hrVersion,
            }] };
            throw new Error("Unexpected mocked query");
        },
    };
    const oldEmployeeToken = signToken("3391", { identityType: "employee" });
    const hrToken = signToken("3391", { identityType: "hr" });
    const change = (identityType, current, next) => ({
        auth: { employeeId: "3391", identityType },
        params: { employeeId: "3391" },
        body: { current_password: current, new_password: next, repeat_password: next },
    });
    const wrong = response();
    await createChangePasswordHandler(db)(change("employee", "wrong", "Changed-Employee"), wrong);
    assert.equal(wrong.statusCode, 401);
    assert.equal(employeeVersion, 0);
    const changed = response();
    await createChangePasswordHandler(db)(change("employee", "Chosen-Employee-Password", "Changed-Employee"), changed);
    assert.equal(changed.statusCode, 200);
    assert.equal(await bcrypt.compare("Changed-Employee", employeeHash), true);
    assert.equal(await bcrypt.compare("EMP3391", employeeHash), false);
    assert.equal(hrHash, originalHrHash);
    const req = (token) => ({ get: () => `Bearer ${token}` });
    const stale = response();
    await requireAuth(db)(req(oldEmployeeToken), stale, () => assert.fail("stale employee session accepted"));
    assert.equal(stale.statusCode, 401);
    await requireAuth(db)(req(hrToken), response(), () => {});
    const preservedEmployeeHash = employeeHash;
    const hrChanged = response();
    await createChangePasswordHandler(db)(change("hr", "Existing-HR-Secret", "Changed-HR"), hrChanged);
    assert.equal(hrChanged.statusCode, 200);
    assert.equal(employeeHash, preservedEmployeeHash);
    assert.equal(await bcrypt.compare("Changed-HR", hrHash), true);
    const staleHr = response();
    await requireAuth(db)(req(hrToken), staleHr, () => assert.fail("stale HR session accepted"));
    assert.equal(staleHr.statusCode, 401);
});

test("HR-only route matrix denies EMP3391 despite HR master role", async () => {
    const employeeToken = signToken("3391", { identityType: "employee" });
    const db = { query: async () => ({ rows: [{
        employee_id: "3391", role: "hr", enabled: true, status: "Active", credential_version: 0,
    }] }) };
    const middleware = createApiAccessMiddleware(db);
    for (const [path, method] of [
        ["/payroll", "GET"], ["/payroll", "POST"], ["/employees", "GET"],
        ["/employees/3391/reset-password", "POST"], ["/employees/3391/status", "PATCH"],
        ["/hr/employee-requests", "PUT"], ["/dashboard", "GET"], ["/jobs", "POST"],
        ["/leave-policies", "PUT"], ["/leaves", "GET"], ["/resignations/settings", "GET"],
        ["/resignations/approvals", "GET"], ["/resignations/12/approve", "POST"],
        ["/notifications/inbox/3391", "GET"], ["/d365/employees", "GET"],
    ]) {
        const res = response();
        await middleware({ path, method, params: {}, body: {}, get: () => `Bearer ${employeeToken}` },
            res, () => assert.fail(`Employee reached ${method} ${path}`));
        assert.equal(res.statusCode, 403, `${method} ${path}`);
    }
    const authRequest = { get: () => `Bearer ${employeeToken}` };
    await requireAuth(db)(authRequest, response(), () => {});
    const hrDenied = response();
    requireHR(authRequest, hrDenied, () => assert.fail("employee identity elevated to HR"));
    assert.equal(hrDenied.statusCode, 403);
    let advanced = false;
    await middleware({
        path: "/payroll", method: "GET", body: {}, get: () => `Bearer ${signToken("3391", { identityType: "hr" })}`,
    }, response(), () => { advanced = true; });
    assert.equal(advanced, true);
});

test("HTTP gate scopes the employee identity and blocks anonymous/HR-only access", async () => {
    const db = { query: async (sql) => {
        assert.match(sql, /employee_d365_mapping/);
        return { rows: [{ employee_id: "3391", role: "hr", enabled: true, status: "Active", credential_version: 0 }] };
    } };
    const app = express();
    app.use(express.json());
    app.use("/api", createApiAccessMiddleware(db));
    app.get("/api/payroll", (_req, res) => res.json({ payroll: [] }));
    app.get("/api/employees/:employeeId/details", (req, res) => res.json({ role: req.auth.role }));
    app.post("/api/assistant", (req, res) => res.json({ role: req.auth.role }));
    const server = await new Promise((resolve, reject) => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
        listening.on("error", reject);
    });
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const headers = { Authorization: `Bearer ${signToken("3391", { identityType: "employee" })}` };
        assert.equal((await fetch(`${base}/api/payroll`)).status, 401);
        assert.equal((await fetch(`${base}/api/payroll`, { headers })).status, 403);
        const own = await fetch(`${base}/api/employees/3391/details`, { headers });
        assert.equal(own.status, 200);
        assert.deepEqual(await own.json(), { role: "employee" });
        assert.equal((await fetch(`${base}/api/employees/1761/details`, { headers })).status, 403);
        assert.equal((await fetch(`${base}/api/assistant`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ employee_id: "1761", role: "hr" }),
        })).status, 403);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});
