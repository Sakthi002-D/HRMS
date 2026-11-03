import test from "node:test";
import assert from "node:assert/strict";
import { projectDbError, validateProject, validateProjectAssignment } from "./projects.js";

test("a project needs a name; status defaults to Active and stays free text", () => {
    assert.match(validateProject({ name: "  " }).error, /name/);
    assert.deepEqual(validateProject({ name: " Lusail Tower ", client: " Qatar Rail " }).project, {
        name: "Lusail Tower", description: null, client: "Qatar Rail", start_date: null, end_date: null, status: "Active",
    });
    assert.equal(validateProject({ name: "A", status: "on hold" }).project.status, "on hold");
    assert.equal(validateProject({ name: "A", status: "Waiting for client" }).project.status, "Waiting for client");
});

test("project dates are optional but must be in order", () => {
    assert.equal(validateProject({ name: "A", start_date: "2026-01-01", end_date: "2026-12-31" }).error, undefined);
    assert.match(validateProject({ name: "A", start_date: "2026-12-31", end_date: "2026-01-01" }).error, /End date/);
    assert.match(validateProject({ name: "A", start_date: "31-12-2026" }).error, /YYYY-MM-DD/);
});

test("an assignment needs an employee and a start date", () => {
    assert.match(validateProjectAssignment({ assigned_from: "2026-11-01" }).error, /employee/);
    assert.match(validateProjectAssignment({ employee_id: "3544" }).error, /from/);
    assert.deepEqual(validateProjectAssignment({ employee_id: " 3544 ", role: " Supervisor ", assigned_from: "2026-11-01", assigned_to: "" }).assignment, {
        employee_id: "3544", role: "Supervisor", assigned_from: "2026-11-01", assigned_to: null,
    });
});

test("assigned to cannot be before assigned from", () => {
    assert.match(validateProjectAssignment({ employee_id: "1", assigned_from: "2026-11-10", assigned_to: "2026-11-01" }).error, /on or after/);
    assert.equal(validateProjectAssignment({ employee_id: "1", assigned_from: "2026-11-10", assigned_to: "2026-11-10" }).error, undefined);
});

test("database errors become readable messages", () => {
    assert.deepEqual(projectDbError({ code: "23505", constraint: "projects_name_key" }), [409, "A project with this name already exists"]);
    assert.deepEqual(projectDbError({ code: "23505", constraint: "project_assignments_employee_id_project_id_assigned_from_key" }),
        [409, "This employee is already on this project from that date"]);
    assert.equal(projectDbError({ code: "23503" })[0], 400);
    assert.equal(projectDbError({ code: "XX000" }), null);
});
