import test from "node:test";
import assert from "node:assert/strict";
import { buildCreateBody, planNewWorkers } from "./d365EmployeeProvisioning.js";

const worker = (number, extra = {}) => ({
    PersonnelNumber: number,
    EmploymentLegalEntityId: "SHLT",
    EmploymentId: `00000${number}`,
    Name: `Worker ${number}`,
    PrimaryContactEmail: `w${number}@example.com`,
    EmploymentStartDate: "2026-11-01T12:00:00Z",
    EmploymentEndDate: "2154-12-31T23:59:59Z",
    ...extra,
});

test("only workers without an HRMS employee or mapping are planned", () => {
    const d365 = [worker("9001"), worker("9002"), worker("9003")];
    const employees = [{ employee_id: "9002", name: "Worker 9002", email: "w9002@example.com", phone: null }];
    const mappings = [{ employee_id: "9002", personnel_number: "9002", employment_legal_entity_id: "SHLT", employment_id: "000009002", link_status: "linked" }];
    const { planned } = planNewWorkers(d365, employees, mappings, new Date("2026-11-07T00:00:00Z"));
    assert.deepEqual(planned.map((row) => row.employee.employee_id), ["9001", "9003"]);
    assert.equal(planned[0].employee.status, "Active");
    assert.equal(planned[0].employee.joining_date, "2026-11-01");
});

test("an HRMS employee with the same ID or e-mail is not added again", () => {
    const d365 = [worker("9004"), worker("9005")];
    const employees = [
        { employee_id: "9004", name: "Old", email: null, phone: null },
        { employee_id: "X1", name: "Other", email: "w9005@example.com", phone: null },
    ];
    const { planned } = planNewWorkers(d365, employees, [], new Date());
    assert.equal(planned.length, 0);
});

test("workers held for manual review are never planned", () => {
    const { planned } = planNewWorkers([worker("1610")], [], [], new Date());
    assert.equal(planned.length, 0);
});

test("create body splits the name and keeps the HRMS ID as personnel number", () => {
    const body = buildCreateBody({
        employee_id: "5001", name: "Mohamed Ali Hassan", email: " a@b.com ", phone: "", gender: "male",
        marital_status: "Married", date_of_birth: "1990-05-04", joining_date: "2026-11-07", designation: "Foreman", legal_entity: null,
    });
    assert.deepEqual(body, {
        PersonnelNumber: "5001",
        EmploymentLegalEntityId: "SHLT",
        FirstName: "Mohamed",
        MiddleName: "Ali",
        LastName: "Hassan",
        EmploymentStartDate: "2026-11-07T12:00:00Z",
        PrimaryContactEmail: "a@b.com",
        Gender: "Male",
        MaritalStatus: "Married",
        BirthDate: "1990-05-04T12:00:00Z",
        ProfessionalTitle: "Foreman",
    });
});

test("create body falls back to today when there is no joining date", () => {
    const body = buildCreateBody({ employee_id: "5002", name: "Sara Khan" }, new Date(2026, 10, 7));
    assert.equal(body.EmploymentStartDate, "2026-11-07T12:00:00Z");
    assert.equal(body.LastName, "Khan");
    assert.equal(body.MiddleName, undefined);
});
