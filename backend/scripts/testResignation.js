// Resignation workflow checks (FRD SHELTER-HCM-SSP-20-001), with "today" = 30 Sep 2026.
// Everything runs in one transaction that is rolled back, so no data is kept.
// Usage: npm run test:resignation
import assert from "node:assert/strict";
import pool from "../db.js";
import {
    approveResignation,
    checkLeaveAgainstResignation,
    completeDueResignations,
    ensureResignationSchema,
    getResignationDetail,
    listPendingEndOfService,
    listResignationsForApprover,
    noticePeriodFor,
    submitResignation,
    withdrawResignation,
} from "../services/resignationWorkflow.js";

const TODAY = "2026-09-30";
const EMPLOYEE = "EMP001";
const LINE_MANAGER = "EMP002";

const form = (extra = {}) => ({
    reason_category: "Better opportunity",
    details: "Moving to a new role.",
    acknowledged: "true",
    ...extra,
});

const results = [];
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

const rejects = async (promise, pattern) => {
    await assert.rejects(promise, (error) => {
        assert.match(error.message, pattern);
        return true;
    });
};

await ensureResignationSchema();
const db = await pool.connect();

try {
    await db.query("BEGIN");

    // Fixtures (rolled back): IT line manager, one HR user, EMP001 active
    const hr = (await db.query(`SELECT employee_id FROM employees WHERE LOWER(COALESCE(role, '')) = 'hr' AND employee_id <> $1 LIMIT 1`, [EMPLOYEE])).rows[0]?.employee_id;
    assert.ok(hr, "Need at least one employee with role 'hr'");
    await db.query(`DELETE FROM resignations WHERE employee_id = $1`, [EMPLOYEE]);
    await db.query(`UPDATE employees SET status = 'Active' WHERE employee_id = $1`, [EMPLOYEE]);
    await db.query(`UPDATE resignation_settings SET settings = settings || '{"noticePeriodDays": 30, "workflow": ["LINE_MANAGER", "HR"]}'::jsonb WHERE id = 1`);
    await db.query(`DELETE FROM workflow_role_assignments WHERE role_key = 'LINE_MANAGER' AND LOWER(department) = 'it'`);
    await db.query(`INSERT INTO workflow_role_assignments (role_key, department, employee_id) VALUES ('LINE_MANAGER', 'IT', $1)`, [LINE_MANAGER]);

    const submit = (body) => submitResignation(db, { employeeId: EMPLOYEE, body, today: TODAY }).then((result) => result.resignation);
    const approve = (id, actorId, extra = {}) => approveResignation(db, { id, actorId, today: TODAY, ...extra });
    const detail = (id, actorId = EMPLOYEE) => getResignationDetail(db, id, actorId, { today: TODAY });

    await check("1. 30-day notice → last working day 30 Oct 2026, Pending Line Manager", async () => {
        const r = await submit(form());
        assert.equal(r.resignation_date, TODAY);
        assert.equal(r.notice_period_days, 30);
        assert.equal(r.last_working_day, "2026-10-30");
        assert.equal(r.status, "Pending Line Manager");
        assert.equal(r.early_release, false);
        const approvals = await listResignationsForApprover(db, LINE_MANAGER);
        assert.ok(approvals.some((row) => row.id === r.id), "shows in the Line Manager's My Approvals");
    });

    await check("2. Early release on 15 Oct needs a reason; HR sees early release", async () => {
        await rejects(submit(form({ last_working_day: "2026-10-15" })), /reason for requesting an early release/);
        const r = await submit(form({ last_working_day: "2026-10-15", early_release_reason: "Joining date at new employer" }));
        assert.equal(r.early_release, true);
        assert.equal(r.last_working_day, "2026-10-15");
        assert.equal(r.calculated_last_working_day, "2026-10-30");
        await approve(r.id, LINE_MANAGER);
        const hrView = await detail(r.id, hr);
        assert.equal(hrView.status, "Pending HR");
        assert.equal(hrView.early_release, true);
        assert.equal(hrView.permissions.isFinalStep, true);
    });

    await check("Last working day can't be in the past or after the auto date", async () => {
        await rejects(submit(form({ last_working_day: "2026-09-29" })), /can't be in the past/);
        await rejects(submit(form({ last_working_day: "2026-10-31" })), /can't be after 30 Oct 2026/);
        await rejects(submit(form({ acknowledged: "false" })), /Final settlement confirmation/);
        await rejects(submit(form({ reason_category: "Bored" })), /Reason category/);
    });

    await check("Only the current approver can act", async () => {
        const r = await submit(form());
        await rejects(approve(r.id, hr), /Only the current approver \(Line Manager\)/);
        await rejects(approve(r.id, EMPLOYEE), /Only the current approver/);
    });

    await check("3. Line Manager approves → HR accepts → Serving notice, 30 days remaining", async () => {
        const r = await submit(form());
        assert.equal((await approve(r.id, LINE_MANAGER)).resignation.status, "Pending HR");
        const accepted = (await approve(r.id, hr)).resignation;
        assert.equal(accepted.status, "Serving Notice");
        const view = await detail(r.id);
        assert.equal(view.days_remaining, 30);
        assert.equal(view.last_working_day, "2026-10-30");
        const employee = await db.query(`SELECT status FROM employees WHERE employee_id = $1`, [EMPLOYEE]);
        assert.equal(employee.rows[0].status, "Active", "stays Active until the last working day");
        assert.deepEqual(view.actions.map((a) => a.action), ["Submitted", "Approved", "Accepted", "Serving Notice"]);
    });

    await check("HR changing the last working day needs a remark and is logged", async () => {
        const r = await submit(form());
        await approve(r.id, LINE_MANAGER);
        await rejects(approve(r.id, hr, { lastWorkingDay: "2026-10-20" }), /remark/);
        const accepted = (await approve(r.id, hr, { lastWorkingDay: "2026-10-20", remark: "Handover completes early" })).resignation;
        assert.equal(accepted.last_working_day, "2026-10-20");
        const log = (await detail(r.id)).actions.find((a) => a.action === "Last working day changed");
        assert.match(log.remark, /30 Oct 2026 → 20 Oct 2026: Handover completes early/);
    });

    await check("4. Leave on 2–3 Nov blocked; leave on 20 Oct allowed", async () => {
        const r = await submit(form());
        await approve(r.id, LINE_MANAGER);
        await approve(r.id, hr);
        assert.match(await checkLeaveAgainstResignation(db, EMPLOYEE, "2026-11-02", "2026-11-03"), /after your last working day \(30 Oct 2026\)/);
        assert.equal(await checkLeaveAgainstResignation(db, EMPLOYEE, "2026-10-20", "2026-10-20"), null);
    });

    await check("Leave isn't blocked while the resignation is still pending", async () => {
        await submit(form());
        assert.equal(await checkLeaveAgainstResignation(db, EMPLOYEE, "2026-11-02", "2026-11-03"), null);
    });

    await check("5. On 31 Oct: Inactive, Completed, in Pending End of Service", async () => {
        const r = await submit(form());
        await approve(r.id, LINE_MANAGER);
        await approve(r.id, hr);
        assert.deepEqual((await completeDueResignations({ today: "2026-10-30", db })).completed, [], "not on the last working day itself");
        assert.deepEqual((await completeDueResignations({ today: "2026-10-31", db })).completed, [r.id]);
        const employee = await db.query(`SELECT status FROM employees WHERE employee_id = $1`, [EMPLOYEE]);
        assert.equal(employee.rows[0].status, "Inactive");
        assert.equal((await detail(r.id, hr)).status, "Completed");
        const queue = await listPendingEndOfService(db);
        const row = queue.find((item) => item.employee_id === EMPLOYEE);
        assert.ok(row, "listed in Pending End of Service");
        assert.equal(row.last_working_day, "2026-10-30");
        assert.equal(row.department, "IT");
    });

    await check("6. Withdraw works before HR accepts; hidden and blocked after", async () => {
        const pending = await submit(form());
        await approve(pending.id, LINE_MANAGER);
        assert.equal((await detail(pending.id)).permissions.canWithdraw, true);
        assert.equal((await withdrawResignation(db, { id: pending.id, actorId: EMPLOYEE })).resignation.status, "Withdrawn");

        const second = await submit(form());
        await approve(second.id, LINE_MANAGER);
        await approve(second.id, hr);
        assert.equal((await detail(second.id)).permissions.canWithdraw, false);
        await rejects(withdrawResignation(db, { id: second.id, actorId: EMPLOYEE }), /can't be withdrawn/);
    });

    await check("7. A second resignation while one is active is blocked", async () => {
        const first = await submit(form());
        await rejects(submit(form()), new RegExp(`already have an active resignation \\(${first.resignation_no}: Pending Line Manager\\)`));
    });

    await check("Notice period: grade override, then employment type, then default", async () => {
        const settings = { noticePeriodDays: 30, gradeOverrides: { G7: 90 }, employmentTypeOverrides: { Contract: 15 } };
        assert.equal(noticePeriodFor(settings, { grade: "g7", employment_type: "Contract" }).days, 90);
        assert.equal(noticePeriodFor(settings, { grade: "G1", employment_type: "Contract" }).days, 15);
        assert.equal(noticePeriodFor(settings, { grade: null, employment_type: "Full Time" }).days, 30);
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
