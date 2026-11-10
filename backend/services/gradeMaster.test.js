import test from "node:test";
import assert from "node:assert/strict";
import {
    GradeError, createGrade, deleteGrade, gradeLeaveDays, listGrades, normalizeGradeFromDb,
    resetGradeSchemaCache, updateGrade, validateGradeInput,
} from "./gradeMaster.js";

// In-memory stand-in for the few queries the service runs
const fakeDb = ({ table = true, leaveDays = true, grades = [], employees = [], overrides = {} } = {}) => {
    const state = { grades: grades.map((grade) => ({ active: true, ...grade })), employees, queries: [] };
    const count = (code) => state.employees.filter((grade) => String(grade || "").trim().toUpperCase() === code.toUpperCase()).length;
    state.query = async (sql, params = []) => {
        state.queries.push(sql);
        if (sql.includes("information_schema.columns")) {
            return { rows: table ? ["id", "code", "band", "sort_order", "active", ...(leaveDays ? ["leave_days"] : [])].map((column_name) => ({ column_name })) : [] };
        }
        if (sql.includes("FROM leave_policy_settings")) return { rows: [{ overrides }] };
        if (sql.includes("LEFT JOIN employees")) {
            return { rows: [...state.grades].sort((a, b) => a.sort_order - b.sort_order).map((grade) => ({ ...grade, leave_days: leaveDays ? grade.leave_days : null, employee_count: String(count(grade.code)) })) };
        }
        if (sql.startsWith("SELECT code, leave_days")) return { rows: state.grades.filter((grade) => grade.leave_days != null) };
        if (sql.startsWith("SELECT code FROM grades")) return { rows: state.grades.filter((grade) => grade.code.toUpperCase() === params[0] && grade.active) };
        if (sql.includes("INSERT INTO grades")) {
            const [code, band, leave_days, sort_order] = params;
            if (state.grades.some((grade) => grade.code === code)) throw Object.assign(new Error("duplicate"), { code: "23505" });
            state.grades.push({ code, band, leave_days, sort_order: sort_order ?? Math.max(0, ...state.grades.map((grade) => grade.sort_order)) + 1, active: true });
            return { rows: [] };
        }
        if (sql.startsWith("UPDATE grades")) {
            const grade = state.grades.find((item) => item.code.toUpperCase() === params.at(-1));
            if (!grade) return { rows: [] };
            [...sql.matchAll(/(band|leave_days|sort_order) = \$(\d+)/g)].forEach(([, column, index]) => { grade[column] = params[Number(index) - 1]; });
            return { rows: [{ code: grade.code }] };
        }
        if (sql.includes("DELETE FROM grades")) {
            const index = state.grades.findIndex((grade) => grade.code.toUpperCase() === params[0] && count(grade.code) === 0);
            if (index < 0) return { rows: [] };
            const [removed] = state.grades.splice(index, 1);
            return { rows: [{ code: removed.code }] };
        }
        throw new Error(`Unexpected query: ${sql}`);
    };
    return state;
};

const GRADE_ROWS = [
    { code: "1-A", band: "Top Management", sort_order: 1, leave_days: "30.0" },
    { code: "9-A", band: "Labor / Helper", sort_order: 2, leave_days: "21.0" },
];

test.beforeEach(() => resetGradeSchemaCache());

test("lists grades in the API shape with employee counts", async () => {
    const db = fakeDb({ grades: GRADE_ROWS, employees: ["1-a", "9-A", "9-A", null] });
    const { grades, editable, leaveDaysEditable } = await listGrades(db);
    assert.equal(editable, true);
    assert.equal(leaveDaysEditable, true);
    assert.deepEqual(grades[0], { grade_code: "1-A", grade_name: "Top Management", leave_days: 30, sort_order: 1, active: true, employee_count: 1 });
    assert.equal(grades[1].employee_count, 2);
});

test("before migration 025, leave days come from Leave Policy and can't be saved", async () => {
    const db = fakeDb({ leaveDays: false, grades: GRADE_ROWS, overrides: { "1-a": 29 } });
    const { grades, leaveDaysEditable } = await listGrades(db);
    assert.equal(leaveDaysEditable, false);
    assert.equal(grades[0].leave_days, 29);
    assert.equal(grades[1].leave_days, null);
    assert.deepEqual(await gradeLeaveDays(db), {});
    await assert.rejects(createGrade(db, { grade_code: "X-1", grade_name: "Test", leave_days: 10 }), (error) => error.status === 503);
});

test("leave calculation days are keyed by lower-case code", async () => {
    assert.deepEqual(await gradeLeaveDays(fakeDb({ grades: GRADE_ROWS })), { "1-a": 30, "9-a": 21 });
});

test("without a grades table the built-in list is returned read-only", async () => {
    const db = fakeDb({ table: false });
    const { grades, editable } = await listGrades(db);
    assert.equal(editable, false);
    assert.equal(grades.length, 23);
    assert.equal(await normalizeGradeFromDb(db, " 4-c "), "4-C");
});

test("grades are checked against the table", async () => {
    const db = fakeDb({ grades: [...GRADE_ROWS, { code: "OLD", band: "Old", sort_order: 3, active: false }] });
    assert.equal(await normalizeGradeFromDb(db, " 1-a "), "1-A");
    assert.equal(await normalizeGradeFromDb(db, ""), null);
    assert.equal(await normalizeGradeFromDb(db, "5-Z"), undefined);
    assert.equal(await normalizeGradeFromDb(db, "old"), undefined);
});

test("input is validated", () => {
    assert.deepEqual(validateGradeInput({ grade_code: " 10-a ", grade_name: " Trainee ", leave_days: "22.5", sort_order: "24" }),
        { grade_code: "10-A", grade_name: "Trainee", leave_days: 22.5, sort_order: 24 });
    const bad = [
        { grade_name: "x", leave_days: 1 },
        { grade_code: "5 A", grade_name: "x", leave_days: 1 },
        { grade_code: "5-A", grade_name: "", leave_days: 1 },
        { grade_code: "5-A", grade_name: "x", leave_days: 0 },
        { grade_code: "5-A", grade_name: "x", leave_days: 20.3 },
        { grade_code: "5-A", grade_name: "x", leave_days: 400 },
        { grade_code: "5-A", grade_name: "x", leave_days: 1, sort_order: 1.5 },
    ];
    bad.forEach((body) => assert.throws(() => validateGradeInput(body), GradeError, JSON.stringify(body)));
    assert.deepEqual(validateGradeInput({ leave_days: 25 }, { partial: true }), { leave_days: 25 });
});

test("create adds a grade at the end and refuses duplicates", async () => {
    const db = fakeDb({ grades: GRADE_ROWS });
    const created = await createGrade(db, { grade_code: "10-a", grade_name: "Trainee", leave_days: 14 });
    assert.deepEqual(created, { grade_code: "10-A", grade_name: "Trainee", leave_days: 14, sort_order: 3, active: true, employee_count: 0 });
    await assert.rejects(createGrade(db, { grade_code: "1-A", grade_name: "Again", leave_days: 30 }), (error) => error.status === 409);
});

test("update changes name, days and order but never the code", async () => {
    const db = fakeDb({ grades: GRADE_ROWS });
    const updated = await updateGrade(db, "9-a", { grade_name: "Helper", leave_days: 22, sort_order: 5 });
    assert.equal(updated.grade_name, "Helper");
    assert.equal(updated.leave_days, 22);
    assert.equal(updated.sort_order, 5);
    await assert.rejects(updateGrade(db, "9-A", { grade_code: "9-B" }), (error) => error.status === 400);
    await assert.rejects(updateGrade(db, "9-A", {}), (error) => error.status === 400);
    await assert.rejects(updateGrade(db, "7-Z", { leave_days: 10 }), (error) => error.status === 404);
});

test("delete only removes grades no employee holds", async () => {
    const db = fakeDb({ grades: GRADE_ROWS, employees: ["9-A", "9-a"] });
    await assert.rejects(deleteGrade(db, "9-A"), (error) => error.status === 409 && error.extra.employee_count === 2);
    await assert.rejects(deleteGrade(db, "7-Z"), (error) => error.status === 404);
    assert.deepEqual(await deleteGrade(db, "1-a"), { grade_code: "1-A", deleted: true });
    assert.deepEqual((await listGrades(db)).grades.map((grade) => grade.grade_code), ["9-A"]);
});
