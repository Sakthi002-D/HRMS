import test from "node:test";
import assert from "node:assert/strict";
import { buildPullTarget, diffPullTarget, buildPushBody, isPushEnabled, pushEmployeeToD365, runFullSync, isFullSyncRunning, pullD365Changes, syncSingleEmployee } from "./d365EmployeeSync.js";

const d365Row = (overrides = {}) => ({
    PersonnelNumber: "3544",
    EmploymentLegalEntityId: "SHLT",
    EmploymentId: "000010001",
    Name: "Test Person",
    FirstName: "Test", MiddleName: "", LastName: "Person",
    PrimaryContactEmail: "Test.Person@Example.com",
    PrimaryContactPhone: " 555-0100 ",
    Gender: "Male", MaritalStatus: "None",
    BirthDate: "1990-05-10T12:00:00Z",
    EmploymentStartDate: "2020-01-15T12:00:00Z",
    EmploymentEndDate: "2154-12-31T12:00:00Z",
    TerminationDate: "1900-01-01T12:00:00Z",
    LastDateWorked: "1900-01-01T12:00:00Z",
    ...overrides,
});

test("buildPullTarget normalizes D365 values the same way the import does", () => {
    const target = buildPullTarget(d365Row());
    assert.equal(target.name, "Test Person");
    assert.equal(target.email, "test.person@example.com");
    assert.equal(target.phone, "555-0100");
    assert.equal(target.gender, "Male");
    assert.equal(target.marital_status, null);
    assert.equal(target.date_of_birth, "1990-05-10");
    assert.equal(target.joining_date, "2020-01-15");
    assert.equal(target.employment_end_date, "Never");
    assert.equal(target.last_date_worked, null);
    assert.equal(target.status, "Active");
});

test("ended or terminated employments become Inactive", () => {
    assert.equal(buildPullTarget(d365Row({ EmploymentEndDate: "2023-01-01T12:00:00Z" })).status, "Inactive");
    assert.equal(buildPullTarget(d365Row({ TerminationDate: "2023-06-01T12:00:00Z" })).status, "Inactive");
});

test("diffPullTarget returns only changed fields and never erases with nulls", () => {
    const target = buildPullTarget(d365Row());
    const current = {
        name: "Test Person", email: "test.person@example.com", phone: "555-0100",
        gender: "Male", marital_status: "Married", date_of_birth: new Date("1990-05-10T00:00:00Z"),
        joining_date: new Date("2020-01-15T00:00:00Z"), employment_end_date: "Never",
        last_date_worked: null, status: "Active",
    };
    assert.deepEqual(diffPullTarget(target, current), {});
    assert.deepEqual(diffPullTarget(target, { ...current, phone: "old" }), { phone: "555-0100" });
    // D365 null marital must not clear the richer HRMS value
    assert.equal("marital_status" in diffPullTarget(target, current), false);
});

test("buildPushBody sends only safe mapped fields in D365 formats", () => {
    assert.deepEqual(
        buildPushBody({ gender: "Female", marital_status: "Single", date_of_birth: new Date("1991-02-03T00:00:00Z") }),
        { Gender: "Female", MaritalStatus: "Single", BirthDate: "1991-02-03T12:00:00Z" }
    );
    assert.deepEqual(buildPushBody({ gender: "Other", marital_status: null, date_of_birth: null }), {});
});

test("buildPushBody with previous values pushes only changed contact and date fields", () => {
    const previous = { email: "a@x.com", phone: "111", gender: "Male", joining_date: "2024-01-01", date_of_birth: null, marital_status: null };
    const next = { ...previous, email: "b@x.com", phone: "222", joining_date: "2025-02-03" };
    assert.deepEqual(buildPushBody(next, previous), {
        PrimaryContactEmail: "b@x.com",
        PrimaryContactPhone: "222",
        EmploymentStartDate: "2025-02-03T12:00:00Z",
    });
    assert.deepEqual(buildPushBody(previous, previous), {});
    assert.deepEqual(buildPushBody({ ...previous, phone: "" }, previous), {});
});

test("designation is pulled from ProfessionalTitle and pushed back", () => {
    assert.equal(buildPullTarget(d365Row({ ProfessionalTitle: " Site Engineer " })).designation, "Site Engineer");
    assert.equal(buildPullTarget(d365Row()).designation, null);
    assert.deepEqual(buildPushBody({ designation: "Lead" }, { designation: "Engineer" }), { ProfessionalTitle: "Lead" });
});

test("name is pull-only: a name change is never pushed to D365", () => {
    assert.deepEqual(buildPushBody({ name: "Anna Maria Lopez" }, { name: "Anna Lopez" }), {});
    assert.deepEqual(buildPushBody({ name: "Gopal Kumar Yadav" }), {});
    assert.equal(buildPullTarget(d365Row({ Name: "Gopal Kumar Yadav" })).name, "Gopal Kumar Yadav");
});

test("status and employment end date are never pushed to D365", () => {
    const body = buildPushBody(
        { status: "Inactive", employment_end_date: "2025-01-01", last_date_worked: "2025-01-01" },
        { status: "Active", employment_end_date: "Never", last_date_worked: null }
    );
    assert.deepEqual(body, {});
    assert.equal("EmploymentEndDate" in body, false);
});

test("D365_PUSH_ENABLED kill switch", () => {
    assert.equal(isPushEnabled({}), true);
    assert.equal(isPushEnabled({ D365_PUSH_ENABLED: "true" }), true);
    for (const off of ["false", "FALSE", " false ", "0", "off", "no"]) {
        assert.equal(isPushEnabled({ D365_PUSH_ENABLED: off }), false, off);
    }
});

test("pushEmployeeToD365 does nothing, not even a DB query, when the kill switch is off", async () => {
    const saved = process.env.D365_PUSH_ENABLED;
    process.env.D365_PUSH_ENABLED = "false";
    try {
        const pool = { query: async () => { throw new Error("DB must not be touched"); } };
        assert.deepEqual(await pushEmployeeToD365(pool, "E1", { email: "a@x.com" }), { pushed: false, reason: "push-disabled" });
    } finally {
        if (saved === undefined) delete process.env.D365_PUSH_ENABLED; else process.env.D365_PUSH_ENABLED = saved;
    }
});

// ---- sync flows with a fake pool and mocked fetch (no database, no network) ----

Object.assign(process.env, {
    D365_BASE_URL: "https://example.axcloud.dynamics.com",
    D365_TENANT_ID: "tenant", D365_CLIENT_ID: "client", D365_CLIENT_SECRET: "secret",
});

const MAPPING = { employee_id: "EMP3544", personnel_number: "3544", employment_legal_entity_id: "SHLT", employment_id: "000010001" };
const CURRENT = {
    employee_id: "EMP3544", name: "Test Person", email: "test.person@example.com", phone: "old-phone", gender: "Male",
    marital_status: null, date_of_birth: new Date(1990, 4, 10), joining_date: new Date(2020, 0, 15),
    employment_end_date: "Never", last_date_worked: null, status: "Active", designation: null,
};

const fakePool = () => {
    const calls = [];
    return {
        calls,
        query: async (sql, params = []) => {
            calls.push({ sql, params });
            if (sql.includes("FROM employee_d365_mapping")) {
                return { rows: params.length && params[0] !== MAPPING.employee_id ? [] : [MAPPING] };
            }
            if (sql.startsWith("SELECT employee_id, name")) return { rows: [CURRENT] };
            return { rows: [], rowCount: 1 };
        },
    };
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const withMockedFetch = async (handler, run) => {
    const original = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (url, options) => {
        const href = String(url);
        requests.push(href);
        if (href.includes("login.microsoftonline.com")) return json({ access_token: "tok", expires_in: 3600 });
        return handler(href, options);
    };
    try { return await run(requests); } finally { globalThis.fetch = original; }
};

test("pullD365Changes logs every step with timings and omits unneeded name fields from $select", async () => {
    await withMockedFetch(() => json({ value: [d365Row({ PrimaryContactPhone: "555-0100" })] }), async (requests) => {
        const pool = fakePool();
        const lines = [];
        const summary = await pullD365Changes(pool, { log: (line) => lines.push(line) });
        assert.equal(summary.updated, 1);
        for (const stepName of ["token", "fetch", "load", "diff", "write"]) {
            assert.ok(lines.some((line) => line.startsWith(`D365 sync [${stepName}] `)), stepName);
            assert.equal(typeof summary.timings[stepName], "number");
        }
        assert.equal(typeof summary.timings.total, "number");
        const select = decodeURIComponent(requests.find((href) => href.includes("/data/EmployeesV2")));
        assert.ok(select.includes("PrimaryContactPhone"));
        assert.equal(/FirstName|MiddleName|LastName/.test(select), false);
        // one batched load instead of one SELECT per employee
        assert.equal(pool.calls.filter((call) => call.sql.startsWith("SELECT employee_id, name")).length, 1);
        assert.equal(pool.calls.filter((call) => call.sql.startsWith("UPDATE employees")).length, 1);
    });
});

test("only one full sync runs at a time and the lock is released afterwards", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await withMockedFetch(async () => { await gate; return json({ value: [d365Row()] }); }, async () => {
        const first = runFullSync(fakePool(), { log: () => {} });
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(isFullSyncRunning(), true);
        assert.deepEqual(await runFullSync(fakePool(), { log: () => {} }), { alreadyRunning: true });
        release();
        assert.equal((await first).alreadyRunning, false);
        assert.equal(isFullSyncRunning(), false);
    });
    await withMockedFetch(() => json({ value: [] }, 500), async () => {
        await assert.rejects(() => runFullSync(fakePool(), { log: () => {} }));
        assert.equal(isFullSyncRunning(), false);
    });
});

test("syncSingleEmployee fetches one record by key with cross-company and a narrow $select", async () => {
    await withMockedFetch(() => json(d365Row({ PrimaryContactPhone: "555-0100", ProfessionalTitle: "Engineer" })), async (requests) => {
        const pool = fakePool();
        const result = await syncSingleEmployee(pool, "EMP3544", { log: () => {} });
        assert.equal(result.synced, true);
        assert.deepEqual(result.fields.sort(), ["designation", "phone"]);
        const d365Requests = requests.filter((href) => href.includes("/data/"));
        assert.equal(d365Requests.length, 1);
        const url = decodeURIComponent(d365Requests[0]);
        assert.ok(url.includes("EmployeesV2(PersonnelNumber='3544',EmploymentLegalEntityId='SHLT',EmploymentId='000010001')"));
        assert.ok(url.includes("cross-company=true"));
        assert.ok(url.includes("$select=") && !/FirstName|LastName|MiddleName/.test(url));
        const update = pool.calls.find((call) => call.sql.startsWith("UPDATE employees"));
        assert.ok(update && update.params.includes("EMP3544"));
    });
});

test("syncSingleEmployee reports unlinked, missing and mismatched records without writing", async () => {
    const pool = fakePool();
    assert.deepEqual(await syncSingleEmployee(pool, "EMP9999", { log: () => {} }), { synced: false, reason: "not-linked" });
    await withMockedFetch(() => json({}, 404), async () => {
        assert.deepEqual(await syncSingleEmployee(pool, "EMP3544", { log: () => {} }), { synced: false, reason: "missing-in-d365" });
    });
    await withMockedFetch(() => json(d365Row({ PersonnelNumber: "9999" })), async () => {
        assert.deepEqual(await syncSingleEmployee(pool, "EMP3544", { log: () => {} }), { synced: false, reason: "identity-mismatch" });
    });
    await withMockedFetch(() => json({}, 500), async () => {
        await assert.rejects(() => syncSingleEmployee(pool, "EMP3544", { log: () => {} }), /read failed \(500\)/);
    });
    assert.equal(pool.calls.some((call) => call.sql.startsWith("UPDATE employees")), false);
});

test("syncSingleEmployee is not blocked by a running full sync", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await withMockedFetch(async (href) => (href.includes("EmployeesV2(") ? json(d365Row({ PrimaryContactPhone: "555-0100" })) : (await gate, json({ value: [d365Row()] }))), async () => {
        const full = runFullSync(fakePool(), { log: () => {} });
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(isFullSyncRunning(), true);
        const single = await syncSingleEmployee(fakePool(), "EMP3544", { log: () => {} });
        assert.equal(single.synced, true);
        release();
        await full;
    });
});
