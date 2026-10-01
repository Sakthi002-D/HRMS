// MPR budget check (New Position): positions + salary, Finance 2026 = 2 positions, 240,000.
// Everything runs in one transaction that is rolled back, so no data is kept.
// Usage: npm run test:mpr-budget
import assert from "node:assert/strict";
import pool from "../db.js";
import { budgetStatusFor, computeBudget, saveMpr } from "../services/manpowerWorkflow.js";

const YEAR = 2026;
const results = [];
const db = await pool.connect();

const check = async (name, fn) => {
    await db.query("SAVEPOINT test_case");
    try {
        await fn();
        results.push(`PASS  ${name}`);
    } catch (error) {
        results.push(`FAIL  ${name}\n      ${error.message}`);
    } finally {
        await db.query("ROLLBACK TO SAVEPOINT test_case");
    }
};

const finance = (openings, salaryMax = 10000, extra = {}) =>
    computeBudget(db, { department: "Finance", year: YEAR, openings, salaryMax, ...extra });

try {
    await db.query("BEGIN");

    // Fixtures (rolled back)
    const hr = (await db.query(`SELECT employee_id FROM employees WHERE LOWER(COALESCE(role, '')) = 'hr' LIMIT 1`)).rows[0]?.employee_id;
    assert.ok(hr, "Need an HR user");
    await db.query(`DELETE FROM manpower_requests WHERE LOWER(department) IN ('finance', 'hr')`);
    await db.query(`DELETE FROM department_headcount_budgets WHERE LOWER(department) IN ('finance', 'hr') AND year = $1`, [YEAR]);
    await db.query(`INSERT INTO department_headcount_budgets (department, year, headcount, salary_budget) VALUES ('Finance', $1, 2, 240000)`, [YEAR]);
    await db.query(`INSERT INTO recruitment_locations (name) VALUES ('Budget Test Location') ON CONFLICT (name) DO NOTHING`);

    const mprBody = (openings, salaryMax, extra = {}) => ({
        request_type: "New Position", title: "Accountant", department: "Finance", openings, experience: "2 years",
        location: "Budget Test Location", employment_type: "Full Time", job_description: "Books", skills: "Excel",
        salary_min: 5000, salary_max: salaryMax, application_start_date: `${YEAR}-12-15`, application_end_date: `${YEAR}-12-31`, justification: "", ...extra,
    });
    const submit = (body) => saveMpr(db, { body, actorId: hr, action: "submit" });

    await check("1. Openings 2 → match (no pop-up, no badge)", async () => {
        const budget = await finance(2);
        assert.equal(budget.status, "match");
        assert.equal(budget.available, 2);
        assert.equal(budget.alreadyUsed, 0);
        assert.equal(budgetStatusFor(budget), "within");
        assert.equal("currentHeadcount" in budget || "projectedHeadcount" in budget, false, "no employee counts");
    });

    await check("2. Openings 3 → exceeded by 1; submit needs a justification", async () => {
        const budget = await finance(3);
        assert.equal(budget.status, "exceeded");
        assert.equal(budget.exceededBy, 1);
        assert.equal(budget.salaryBudget, 240000);
        await assert.rejects(submit(mprBody(3, 10000)), /Budget exceeded: enter a justification/);
        const { mpr } = await submit(mprBody(3, 10000, { justification: "Year-end close" }));
        assert.equal(mpr.budget_status, "exception");
        assert.equal(mpr.budget_snapshot.exceededBy, 1);
    });

    await check("3. Openings 1 → under budget, 1 more position, cost 120,000 of 240,000", async () => {
        const budget = await finance(1);
        assert.equal(budget.status, "under");
        assert.equal(budget.remaining, 1);
        assert.equal(budget.available, 2);
        assert.equal(budget.requestCost, 120000);
        assert.equal(budget.salaryAvailable, 240000);
        const { mpr } = await submit(mprBody(1, 10000));
        assert.equal(mpr.budget_status, "within", "no justification needed within budget");
    });

    await check("4. Earlier Finance MPR for 2 Approved → new MPR for 1 → available 0, exceeded by 1", async () => {
        const { mpr } = await submit(mprBody(2, 10000));
        await db.query(`UPDATE manpower_requests SET status = 'Approved' WHERE id = $1`, [mpr.id]);
        const budget = await finance(1);
        assert.equal(budget.alreadyUsed, 2);
        assert.equal(budget.available, 0);
        assert.equal(budget.status, "exceeded");
        assert.equal(budget.exceededBy, 1);
        // Its own openings are never counted against itself
        assert.equal((await finance(2, 10000, { excludeMprId: mpr.id })).status, "match");
    });

    await check("Rejected, Cancelled and Draft MPRs are not counted", async () => {
        for (const status of ["Rejected", "Cancelled", "Draft"]) {
            const { mpr } = await submit(mprBody(2, 10000));
            await db.query(`UPDATE manpower_requests SET status = $2 WHERE id = $1`, [mpr.id, status]);
        }
        const budget = await finance(2);
        assert.equal(budget.alreadyUsed, 0);
        assert.equal(budget.status, "match");
    });

    await check("5. Replacement MPR → no budget check", async () => {
        const employee = (await db.query(`SELECT employee_id FROM employees WHERE LOWER(department) = 'finance' LIMIT 1`)).rows[0]?.employee_id;
        const { mpr } = await submit(mprBody(5, 99999, { request_type: "Replacement", replaced_employee_id: employee, replacement_reason: "Resigned" }));
        assert.equal(mpr.budget_status, null);
        assert.equal(mpr.budget_snapshot, null);
    });

    await check("6. HR with no budget row → No budget set; submit needs a justification", async () => {
        const budget = await computeBudget(db, { department: "HR", year: YEAR, openings: 1, salaryMax: 8000 });
        assert.equal(budget.status, "no_budget");
        assert.equal(budget.reason, "No budget set for HR (2026). Set it in Settings → Recruitment Masters.");
        await assert.rejects(submit(mprBody(1, 8000, { department: "HR" })), /No budget set for HR \(2026\).*justification/);
    });

    await check("7. Openings 2, max salary 10,000 → cost 240,000 → match", async () => {
        const budget = await finance(2, 10000);
        assert.equal(budget.requestCost, 240000);
        assert.equal(budget.salaryExceeded, false);
        assert.equal(budget.status, "match");
    });

    await check("8. Openings 2, max salary 12,000 → cost 288,000 → exceeded by 48,000 (positions match)", async () => {
        const budget = await finance(2, 12000);
        assert.equal(budget.positionsExceeded, false);
        assert.equal(budget.requestCost, 288000);
        assert.equal(budget.salaryExceeded, true);
        assert.equal(budget.salaryExceededBy, 48000);
        assert.equal(budget.status, "exceeded");
    });

    await check("9. Openings 1, max salary 10,000 → under, cost 120,000 of 240,000", async () => {
        const budget = await finance(1, 10000);
        assert.equal(budget.status, "under");
        assert.equal(budget.remaining, 1);
        assert.equal(budget.requestCost, 120000);
        assert.equal(budget.salaryAvailable, 240000);
    });

    await check("Example from the spec: 12,000 × 12 × 3 = 432,000 → exceeds by 192,000", async () => {
        const budget = await finance(3, 12000);
        assert.equal(budget.requestCost, 432000);
        assert.equal(budget.salaryExceededBy, 192000);
        assert.equal(budget.exceededBy, 1);
    });
} finally {
    await db.query("ROLLBACK");
    db.release();
    await pool.end();
}

console.log(results.join("\n"));
const failed = results.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed (all changes rolled back)`);
process.exitCode = failed ? 1 : 0;
