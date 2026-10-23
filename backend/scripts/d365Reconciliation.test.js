import test from "node:test";
import assert from "node:assert/strict";
import { fetchD365Pages, reconcileD365 } from "./d365Reconciliation.js";

const source = (number, extra = {}) => ({
    PersonnelNumber: number, EmploymentLegalEntityId: "SHLT", EmploymentId: `job-${number}`,
    Name: `Person ${number}`, ...extra,
});
const mapping = (number, employeeId = number, extra = {}) => ({
    employee_id: employeeId, personnel_number: number, employment_legal_entity_id: "SHLT",
    employment_id: `job-${number}`, link_status: "linked", ...extra,
});
const fetchOptions = (pages, extra = {}) => {
    let calls = 0;
    return {
        base: "https://d365.example",
        select: "PersonnelNumber",
        authorization: "synthetic-test-token",
        fetchImpl: async (_url, options) => {
            assert.equal(options.method, "GET");
            assert.equal(options.redirect, "error");
            assert.ok(calls < pages.length, "Unexpected fetch");
            return { ok: true, json: async () => pages[calls++] };
        },
        ...extra,
    };
};

test("fetches every page including relative next links", async () => {
    const rows = await fetchD365Pages(fetchOptions([
        { value: [source("001")], "@odata.nextLink": "?page=2" },
        { value: [source("002")] },
    ]));
    assert.deepEqual(rows.map((row) => row.PersonnelNumber), ["001", "002"]);
});

test("incomplete pagination fails rather than returning partial records", async () => {
    await assert.rejects(fetchD365Pages(fetchOptions([
        { value: [source("001")], "@odata.nextLink": "?page=2" },
    ], { maxPages: 1 })), /incomplete/);
});

test("cycles, foreign hosts, wrong paths and malformed pages fail closed", async () => {
    for (const link of ["?page=2", "https://other.example/data/EmployeesV2", "/data/Other", ""]) {
        const page = { value: [source("001")], "@odata.nextLink": link };
        await assert.rejects(fetchD365Pages(fetchOptions([page, page])), /pagination|Malformed/);
    }
    for (const page of [{}, { value: {} }, { value: [null] }, { value: [] }]) {
        await assert.rejects(fetchD365Pages(fetchOptions([page])), /Malformed|no records/);
    }
});

test("HTTP failure on a later page fails the entire fetch", async () => {
    let count = 0;
    await assert.rejects(fetchD365Pages(fetchOptions([], {
        fetchImpl: async () => ++count === 1
            ? { ok: true, json: async () => ({ value: [source("001")], "@odata.nextLink": "?page=2" }) }
            : { ok: false, status: 503 },
    })), /503/);
});

test("classifies mapped, linked, new, ambiguous and excluded rows in one manifest", () => {
    const result = reconcileD365([
        source("1"), source("2"), source("3"),
        source("4"), source("4", { EmploymentId: "second" }), source("1610"),
    ], [{ employee_id: "legacy-1" }, { employee_id: "2" }], [mapping("1", "legacy-1")]);
    assert.deepEqual(result.counts, {
        "already-mapped": 1, "confirmed-link": 1, "new-record": 1, ambiguous: 2, excluded: 1,
    });
    assert.equal(result.records[0].employee_id, "legacy-1");
});

test("duplicate composite identities are ambiguous even when already mapped", () => {
    const row = source("1");
    const result = reconcileD365([row, { ...row }], [{ employee_id: "1" }], [mapping("1")]);
    assert.equal(result.counts.ambiguous, 2);
    assert.equal(result.counts["already-mapped"], 0);
});

test("conflicting ID/email matches and shared email never confirm a link", () => {
    const result = reconcileD365([
        source("1", { PrimaryContactEmail: "same@example.invalid" }),
        source("2", { PrimaryContactEmail: "same@example.invalid" }),
    ], [{ employee_id: "1" }, { employee_id: "other", email: "same@example.invalid" }], []);
    assert.equal(result.counts.ambiguous, 2);
});

test("two source identities cannot claim the same existing employee", () => {
    const result = reconcileD365([
        source("1"), source("2", { PrimaryContactEmail: "one@example.invalid" }),
    ], [{ employee_id: "1", email: "one@example.invalid" }], []);
    assert.equal(result.counts.ambiguous, 2);
});

test("incomplete identity, missing names and designated review records are excluded", () => {
    const result = reconcileD365([
        source("1", { EmploymentId: "" }), source("2", { Name: "" }), source("2866"),
    ], [], []);
    assert.equal(result.counts.excluded, 3);
});

test("weak name/phone matches require review, not duplicate master records", () => {
    const result = reconcileD365([source("1", { Name: "Same Person" })],
        [{ employee_id: "old", name: "same person" }], []);
    assert.equal(result.counts.ambiguous, 1);
    assert.equal(result.counts["new-record"], 0);
    assert.deepEqual(result.unmatched_existing_employee_ids, ["old"]);
});

test("existing HR3391 and relationships remain untouched in a confirmed-link preview", () => {
    const employees = [{
        employee_id: "3391", role: "hr", password: "synthetic-marker", auth_credential_version: 7,
    }, { employee_id: "1761", role: "employee", password: "other-marker" }];
    const input = JSON.stringify(employees);
    const result = reconcileD365([source("3391")], employees, []);
    assert.equal(result.records[0].category, "confirmed-link");
    assert.equal(result.records[0].employee_id, "3391");
    assert.equal(JSON.stringify(employees), input);
    assert.equal(JSON.stringify(result).includes("synthetic-marker"), false);
    assert.deepEqual(result.unmatched_existing_employee_ids, ["1761"]);
});

test("leading zeros stay distinct and HR3391 existing mapping is retained", () => {
    const result = reconcileD365([source("001"), source("1"), source("3391")],
        [{ employee_id: "3391", role: "hr" }], [mapping("3391")]);
    assert.equal(result.records[2].category, "already-mapped");
    assert.notEqual(result.records[0].key, result.records[1].key);
    assert.equal(result.counts["new-record"], 2);
});

test("orphan, pending and conflicting mappings block automatic reconciliation", () => {
    for (const mappings of [
        [mapping("1", "missing")],
        [mapping("1", "1", { link_status: "pending_review" })],
        [mapping("1"), mapping("1", "other")],
        [mapping("1", "1", { employment_id: "other-job" })],
    ]) {
        const result = reconcileD365([source("1")], [{ employee_id: "1" }], mappings);
        assert.equal(result.records[0].category, "ambiguous");
    }
});

test("duplicate legacy IDs cannot be linked through a unique email and absent mappings are retained", () => {
    const result = reconcileD365([source("2", { PrimaryContactEmail: "one@example.invalid" })], [
        { employee_id: "1", email: "one@example.invalid" },
        { employee_id: "1" },
    ], [mapping("missing")]);
    assert.equal(result.records[0].category, "ambiguous");
    assert.equal(result.unmatched_existing_mapping_count, 1);
});
