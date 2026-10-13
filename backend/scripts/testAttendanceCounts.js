// Verifies attendance headcounts for legacy HRMS and D365 rows.
// All inserts happen inside a transaction that is always rolled back.
import assert from "node:assert/strict";
import pool from "../db.js";
import { getAttendanceCounts } from "../services/attendanceCounts.js";

const DATE = "2099-01-01";
const results = [];
const db = await pool.connect();

const check = async (name, fn) => {
    await db.query("SAVEPOINT test_case");
    try {
        await fn();
        await db.query("RELEASE SAVEPOINT test_case");
        results.push(`PASS  ${name}`);
    } catch (error) {
        await db.query("ROLLBACK TO SAVEPOINT test_case");
        results.push(`FAIL  ${name}\n      ${error.message}`);
    }
};

const insertHrms = (employeeId, status, late = 0) =>
    db.query(
        `INSERT INTO attendance (employee_id, attendance_date, punch_in, status, late_minutes)
         VALUES ($1, $2, '09:00', $3, $4)`,
        [employeeId, DATE, status, late]
    );

const insertD365 = (personnel, entity, employment, status, late = 0) =>
    db.query(
        `INSERT INTO attendance
            (employee_id, attendance_date, punch_in, status, late_minutes,
             personnel_number, employment_legal_entity_id, employment_id, employee_name_snapshot)
         VALUES (NULL, $1, '09:00', $2, $3, $4, $5, $6, 'Test D365 Person')`,
        [DATE, status, late, personnel, entity, employment]
    );

try {
    await db.query("BEGIN");

    const employees = await db.query("SELECT employee_id FROM employees ORDER BY id LIMIT 2");

    await check("legacy HRMS rows are counted per employee", async () => {
        assert.ok(employees.rows.length === 2, "needs two existing employees");
        const before = await getAttendanceCounts(db, DATE);
        await insertHrms(employees.rows[0].employee_id, "Present");
        await insertHrms(employees.rows[1].employee_id, "Late", 15);
        const after = await getAttendanceCounts(db, DATE);
        assert.equal(after.hrmsPresent - before.hrmsPresent, 2);
        assert.equal(after.hrmsLate - before.hrmsLate, 1);
        assert.equal(after.present - before.present, 2);
        assert.equal(after.d365Present, before.d365Present);
    });

    await check("D365 rows with NULL employee_id are counted", async () => {
        const before = await getAttendanceCounts(db, DATE);
        await insertD365("TESTP1", "TST1", "TESTE1", "Present");
        await insertD365("TESTP2", "TST1", "TESTE2", "Late", 20);
        await insertD365("TESTP3", "TST1", "TESTE3", "Absent");
        const after = await getAttendanceCounts(db, DATE);
        assert.equal(after.d365Present - before.d365Present, 2);
        assert.equal(after.d365Late - before.d365Late, 1);
        assert.equal(after.present - before.present, 2);
        assert.equal(after.hrmsPresent, before.hrmsPresent);
    });

    await check("same personnel number under different D365 identity is a separate person", async () => {
        const before = await getAttendanceCounts(db, DATE);
        await insertD365("TESTP9", "TST1", "TESTE9", "Present");
        await insertD365("TESTP9", "TST2", "TESTE9", "Present");
        const after = await getAttendanceCounts(db, DATE);
        assert.equal(after.d365Present - before.d365Present, 2);
    });

    await check("D365 and HRMS rows do not double-count each other", async () => {
        const employeeId = employees.rows[0].employee_id;
        const before = await getAttendanceCounts(db, "2099-01-03");
        const insertOn = (sql, params) => db.query(sql, params);
        await insertOn(
            `INSERT INTO attendance (employee_id, attendance_date, punch_in, status) VALUES ($1, '2099-01-03', '09:00', 'Present')`,
            [employeeId]
        );
        await insertOn(
            `INSERT INTO attendance (employee_id, attendance_date, punch_in, status, personnel_number, employment_legal_entity_id, employment_id)
             VALUES (NULL, '2099-01-03', '09:00', 'Present', $1, 'TST3', 'TESTE4')`,
            [String(employeeId)]
        );
        const after = await getAttendanceCounts(db, "2099-01-03");
        assert.equal(after.present - before.present, 2);
    });

    await check("counts are scoped to the requested date", async () => {
        const other = await getAttendanceCounts(db, "2099-01-04");
        assert.equal(other.present, 0);
    });

    await db.query("ROLLBACK");
} catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    results.push(`FAIL  setup\n      ${error.message}`);
} finally {
    db.release();
    await pool.end();
}

console.log(results.join("\n"));
if (results.some((line) => line.startsWith("FAIL"))) process.exit(1);
