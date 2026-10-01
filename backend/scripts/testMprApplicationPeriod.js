// MPR Application Start / End Date: validation, saving, copy to the job on approval,
// recruitment plan deadline and Careers visibility. One transaction, rolled back.
// Usage: npm run test:mpr-period
import assert from "node:assert/strict";
import pool from "../db.js";
import {
    approveMpr,
    getMprDetail,
    getRecruitmentToday,
    listMprs,
    saveMpr,
    saveRecruitmentPlan,
} from "../services/manpowerWorkflow.js";
import { getPublicJob, listPublicJobs } from "../services/careerApplications.js";

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

try {
    await db.query("BEGIN");

    const today = await getRecruitmentToday(db);
    const addDays = (days) => {
        const date = new Date(`${today}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().slice(0, 10);
    };

    // Fixtures (rolled back): HR-only workflow so one HR approval creates the job
    const hr = (await db.query(`SELECT employee_id FROM employees WHERE LOWER(COALESCE(role, '')) = 'hr' LIMIT 1`)).rows[0]?.employee_id;
    assert.ok(hr, "Need an HR user");
    await db.query(`UPDATE recruitment_settings SET settings = settings || '{"workflows": {"Replacement": ["HR"], "New Position": ["HR"]}}'::jsonb WHERE id = 1`);
    await db.query(`INSERT INTO recruitment_locations (name) VALUES ('Period Test Location') ON CONFLICT (name) DO NOTHING`);

    const body = (extra = {}) => ({
        request_type: "New Position", title: "Period Tester", department: "Period Test Dept", openings: 1, experience: "2 years",
        location: "Period Test Location", employment_type: "Full Time", job_description: "Tests dates", skills: "QA",
        salary_min: 5000, salary_max: 6000, justification: "No budget set for this test department",
        application_start_date: today, application_end_date: addDays(14), ...extra,
    });
    const submit = (extra) => saveMpr(db, { body: body(extra), actorId: hr, action: "submit" });

    await check("Backend validation: both dates required, start ≥ today, end ≥ start", async () => {
        await assert.rejects(submit({ application_start_date: "" }), /Application Start Date/);
        await assert.rejects(submit({ application_end_date: "" }), /Application End Date/);
        await assert.rejects(submit({ application_start_date: addDays(-1) }), /Start Date must be today or later/);
        await assert.rejects(submit({ application_start_date: addDays(5), application_end_date: addDays(4) }), /on or after/);
        await assert.rejects(submit({ application_end_date: "2026-02-31" }), /not a valid date/);
        await submit({ application_start_date: addDays(3), application_end_date: addDays(3) }); // same day is fine
    });

    await check("3. Submit saves both dates; grade / required_by are not set; list shows the period", async () => {
        const { mpr } = await submit({ grade: "G9", required_by: addDays(30) });
        const detail = await getMprDetail(db, { id: mpr.id, actorId: hr });
        assert.equal(detail.application_start_date, today);
        assert.equal(detail.application_end_date, addDays(14));
        assert.equal(detail.grade, null);
        assert.equal(detail.required_by, null);
        const listed = (await listMprs(db, { actorId: hr, scope: "all" })).find((row) => Number(row.id) === Number(mpr.id));
        assert.equal(listed.application_start_date, today);
        assert.equal(listed.application_end_date, addDays(14));
        const old = (await listMprs(db, { actorId: hr, scope: "all" })).find((row) => !row.application_start_date);
        if (old) assert.equal(old.application_end_date, null, "old MPRs have no period (shown as —)");
    });

    await check("4. Approval copies the period to the job: deadline = end date; plan can change it (not before start)", async () => {
        const { mpr } = await submit({ application_start_date: addDays(2), application_end_date: addDays(20) });
        const { jobId } = await approveMpr(db, { id: mpr.id, actorId: hr });
        assert.ok(jobId, "job created");
        const job = (await db.query(
            `SELECT id, TO_CHAR(application_start_date, 'YYYY-MM-DD') AS s, TO_CHAR(application_deadline, 'YYYY-MM-DD') AS d FROM public.jobs WHERE job_id = $1`,
            [jobId]
        )).rows[0];
        assert.equal(job.s, addDays(2));
        assert.equal(job.d, addDays(20));
        const plan = (deadline) => saveRecruitmentPlan(db, { jobDbId: job.id, actorId: hr, body: { sourcing: "Internal", application_deadline: deadline } });
        await assert.rejects(plan(addDays(1)), /before the application start date/);
        const saved = await plan(addDays(25));
        assert.equal(saved.application_deadline.getDate(), new Date(`${addDays(25)}T00:00:00`).getDate());
    });

    await check("5. Careers: start tomorrow → hidden; past end → Applications closed; today inside → listed", async () => {
        const make = async (code, start, end) => db.query(
            `INSERT INTO public.jobs (job_id, title, department, openings, status, application_start_date, application_deadline)
             VALUES ($1, $1, 'Period Test Dept', 1, 'Open', $2, $3)`,
            [code, start, end]
        );
        await make("PERTOMORROW", addDays(1), addDays(10));
        await make("PERPAST", addDays(-10), addDays(-1));
        await make("PERNOW", today, today);
        const listed = (await listPublicJobs(db)).map((row) => row.job_id);
        assert.ok(!listed.includes("PERTOMORROW"), "future start must be hidden");
        assert.ok(!listed.includes("PERPAST"), "past end must be hidden");
        assert.ok(listed.includes("PERNOW"), "start = end = today is inclusive");
        await assert.rejects(getPublicJob("PERTOMORROW", db), /not found/);
        const closed = await getPublicJob("PERPAST", db);
        assert.equal(closed.accepting, false);
    });

    await db.query("ROLLBACK");
} catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    results.push(`ERROR ${error.stack || error.message}`);
} finally {
    db.release();
    await pool.end();
}

console.log(results.join("\n"));
const failed = results.filter((line) => !line.startsWith("PASS")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
