import test from "node:test";
import assert from "node:assert/strict";
import { buildPullTarget, diffPullTarget, buildPushBody, isPushEnabled, pushEmployeeToD365 } from "./d365EmployeeSync.js";

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
