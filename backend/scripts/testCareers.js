// Careers page → HR Job Applications. Everything runs in one transaction that is
// rolled back; CVs go to local storage and the files are deleted afterwards.
// Usage: npm run test:careers
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

process.env.CAREERS_CV_STORAGE = "local";
const { default: pool } = await import("../db.js");
const { getCompanyToday } = await import("../services/leaveDateRules.js");
const {
    actOnApplication,
    getApplicationDetail,
    getPublicJob,
    listApplications,
    listPublicJobs,
    submitApplication,
} = await import("../services/careerApplications.js");

const CV_DIR = fileURLToPath(new URL("../uploads/cvs/", import.meta.url));
const results = [];
const storedCvs = [];
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

const today = getCompanyToday();
const addDays = (days) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

const pdf = (name = "cv.pdf") => {
    const buffer = Buffer.from("%PDF-1.4\n% test CV\n");
    return { originalname: name, size: buffer.length, buffer };
};

const common = (email, extra = {}) => ({
    full_name: "Test Candidate",
    email,
    phone_code: "+974",
    phone: "5555 1234",
    date_of_birth: "1998-04-12",
    gender: "Female",
    nationality: "India",
    current_city: "Doha",
    current_country: "Qatar",
    in_qatar: "Yes",
    visa_status: "Work visa",
    willing_to_relocate: "No",
    highest_qualification: "Bachelor's Degree",
    institution: "Qatar University",
    year_of_passing: "2020",
    percentage_cgpa: "8.1",
    key_skills: ["Excel", "Communication"],
    source: "Company website",
    consent: true,
    ...extra,
});

const fresher = (email, extra = {}) => common(email, {
    candidate_type: "Fresher",
    available_from: addDays(14),
    internships_projects: "Internship at ACME, 3 months",
    // Experienced-only fields sent by mistake must be ignored
    expected_salary: "9000",
    current_company: "Should be ignored",
    ...extra,
});

const experienced = (email, extra = {}) => common(email, {
    candidate_type: "Experienced",
    experience_years: "4",
    experience_months: "6",
    current_company: "Gulf Facilities",
    current_designation: "Supervisor",
    current_salary: "7000",
    expected_salary: "9500",
    salary_currency: "QAR",
    notice_period: "30 days",
    employment_history: [{ company: "Gulf Facilities", designation: "Supervisor", from: "2021-03", to: "" }],
    ...extra,
});

const apply = async (jobCode, input, file = pdf()) => {
    const { application } = await submitApplication(db, { jobCode, input, file });
    const row = (await db.query(`SELECT cv_path FROM public.job_applications WHERE application_id = $1`, [application.application_no])).rows[0];
    if (row?.cv_path) storedCvs.push(row.cv_path);
    return application;
};

const appByNo = async (applicationNo) => (await listApplications(db)).find((row) => row.application_id === applicationNo);

try {
    await db.query("BEGIN");

    const hr = (await db.query(`SELECT employee_id FROM employees WHERE LOWER(COALESCE(role, '')) = 'hr' LIMIT 1`)).rows[0]?.employee_id;
    assert.ok(hr, "Need an HR user");
    const agency = (await db.query(`INSERT INTO recruitment_agencies (name) VALUES ('Careers Test Agency') RETURNING id, name`)).rows[0];

    const mpr = async (status) => (await db.query(
        `INSERT INTO manpower_requests (mpr_no, request_type, status, title, department, openings, salary_min, salary_max, currency)
         VALUES ($1, 'New Position', $2, 'Test role', 'Testing Dept', 1, 7777, 8888, 'QAR') RETURNING id`,
        [`MPR-TEST-${status.replace(/\W/g, "")}`, status]
    )).rows[0].id;

    const job = (jobId, { status = "Open", deadline = null, mprId = null, deleted = false } = {}) => db.query(
        `INSERT INTO public.jobs (job_id, title, department, openings, experience, location, employment_type,
                                  job_description, skills, compensation, status, mpr_id, application_deadline, is_deleted)
         VALUES ($1, $2, 'Testing Dept', 2, '2', 'Doha', 'Full Time', 'Test description', 'Excel, SQL',
                 'QAR 7,777 – 8,888 / month', $3, $4, $5, $6)`,
        [jobId, `Title ${jobId}`, status, mprId, deadline, deleted]
    );

    await job("TOPEN1", { mprId: await mpr("Approved"), deadline: addDays(10) });
    await job("TLEGACY1");
    await job("TPROG1", { status: "Recruitment In Progress", deadline: addDays(5) });
    await job("TPEND1", { status: "Pending Approval" });
    await job("TCANC1", { status: "Cancelled" });
    await job("TMPRCANC1", { mprId: await mpr("Cancelled") });
    await job("TMPRPEND1", { mprId: await mpr("Pending HR") });
    await job("TCLOSED1", { status: "Closed" });
    await job("TPAST1", { deadline: addDays(-1) });
    await job("TDEL1", { deleted: true });

    await check("1. Only Open jobs on /careers (Pending, Cancelled, unapproved MPR, Closed, deleted hidden)", async () => {
        const ids = (await listPublicJobs(db)).map((row) => row.job_id).filter((id) => id.startsWith("T"));
        for (const id of ["TOPEN1", "TLEGACY1", "TPROG1"]) assert.ok(ids.includes(id), `${id} should be listed`);
        for (const id of ["TPEND1", "TCANC1", "TMPRCANC1", "TMPRPEND1", "TCLOSED1", "TPAST1", "TDEL1"]) {
            assert.ok(!ids.includes(id), `${id} must not be listed`);
        }
        await assert.rejects(getPublicJob("TPEND1", db), /not found/);
        await assert.rejects(getPublicJob("TMPRCANC1", db), /not found/);
    });

    let fresherNo;
    await check("2. Fresher applies → APP number → HR list with Fresher badge, no experienced fields", async () => {
        const result = await apply("TOPEN1", fresher("fresher.test@example.com"));
        fresherNo = result.application_no;
        assert.match(fresherNo, new RegExp(`^APP-${today.slice(0, 4)}-\\d{4}$`));
        const row = await appByNo(fresherNo);
        assert.equal(row.candidate_type, "Fresher");
        assert.equal(row.status, "New");
        assert.equal(row.job_id, "TOPEN1");
        assert.equal(row.expected_salary, null, "fresher has no expected salary");
        const detail = await getApplicationDetail(db, row.id);
        assert.equal(detail.current_company, null);
        assert.equal(detail.joining_date, addDays(14));
        assert.ok(detail.mpr_id, "linked to the job's MPR");
        assert.equal(detail.has_cv, true);
        assert.equal("cv_path" in detail, false, "storage path is never sent to the browser");
        assert.equal(detail.actions[0].action, "Applied");
    });

    await check("3. Experienced via Recruitment agency → HR sees agency name and expected salary", async () => {
        const result = await apply("TLEGACY1", experienced("exp.test@example.com", { source: "Recruitment agency", agency_id: agency.id }));
        const row = await appByNo(result.application_no);
        assert.equal(row.candidate_type, "Experienced");
        assert.equal(row.agency_name, agency.name);
        assert.equal(row.expected_salary, 9500);
        assert.equal(row.salary_currency, "QAR");
        assert.equal(row.notice_period, "30 days");
        assert.equal(row.experience_years, 4);
        await assert.rejects(apply("TLEGACY1", experienced("exp2.test@example.com", { source: "Recruitment agency", agency_id: "" })), /agency/i);
    });

    await check("4. Same email + same job twice is blocked (case-insensitive); another job is fine", async () => {
        await assert.rejects(apply("TOPEN1", fresher("FRESHER.Test@example.com")), /You have already applied for this job/);
        await apply("TLEGACY1", fresher("fresher.test@example.com"));
    });

    await check("5. Deadline passed → hidden, direct link says Applications closed, apply blocked", async () => {
        const detail = await getPublicJob("TPAST1", db);
        assert.equal(detail.accepting, false);
        assert.match(detail.reason, /deadline/i);
        await assert.rejects(apply("TPAST1", fresher("late.test@example.com")), /Applications closed/);
        const closed = await getPublicJob("TCLOSED1", db);
        assert.equal(closed.accepting, false);
        await assert.rejects(apply("TCLOSED1", fresher("closed.test@example.com")), /Applications closed/);
    });

    await check("6. Public API never exposes salary, budget, MPR, approvers or remarks", async () => {
        // Only this test's jobs: real job descriptions may legitimately mention e.g. "budgeting"
        const fixtures = (await listPublicJobs(db)).filter((row) => /^T[A-Z]+1$/.test(row.job_id));
        assert.ok(fixtures.length >= 3, "fixture jobs listed");
        const payload = JSON.stringify([fixtures, await getPublicJob("TOPEN1", db), await getPublicJob("TPAST1", db)]);
        for (const leak of ["7,777", "8,888", "7777", "8888", "compensation", "salary", "budget", "mpr", "MPR-TEST", "approv", "remark", "agency", "recruiter", "interview_panel"]) {
            assert.ok(!payload.toLowerCase().includes(leak.toLowerCase()), `public payload contains "${leak}"`);
        }
    });

    await check("7. HR shortlist / hold / reject → status, counts and New badge update", async () => {
        const newBefore = (await listApplications(db)).filter((row) => row.status === "New").length;
        const row = await appByNo(fresherNo);
        const shortlisted = await actOnApplication(db, { id: row.id, action: "shortlist", actorId: hr, remark: "Good profile" });
        assert.equal(shortlisted.status, "Shortlisted");
        assert.deepEqual(shortlisted.allowed_actions.sort(), ["hold", "reject"]);
        assert.equal((await listApplications(db)).filter((item) => item.status === "New").length, newBefore - 1);
        await assert.rejects(actOnApplication(db, { id: row.id, action: "reject", actorId: hr, remark: "  " }), /reason/);
        const rejected = await actOnApplication(db, { id: row.id, action: "reject", actorId: hr, remark: "Position needs SQL" });
        assert.equal(rejected.status, "Rejected");
        assert.equal(rejected.status_remark, "Position needs SQL");
        assert.deepEqual(rejected.allowed_actions, []);
        assert.deepEqual(rejected.actions.map((action) => action.action), ["Applied", "Shortlisted", "Rejected"]);
        await assert.rejects(actOnApplication(db, { id: row.id, action: "shortlist", actorId: hr }), /can't be shortlisted/);
        const nonHr = (await db.query(`SELECT employee_id FROM employees WHERE LOWER(COALESCE(role, '')) <> 'hr'
                                       AND employee_id NOT IN (SELECT employee_id FROM workflow_role_assignments WHERE role_key = 'HR') LIMIT 1`)).rows[0]?.employee_id;
        if (nonHr) await assert.rejects(actOnApplication(db, { id: row.id, action: "hold", actorId: nonHr }), /Only HR/);
    });

    await check("Validation: required fields, email, phone, consent, CV type/size, honest content", async () => {
        await assert.rejects(apply("TPROG1", fresher("v1.test@example.com", { email: "not-an-email" })), /valid email/);
        await assert.rejects(apply("TPROG1", fresher("v2.test@example.com", { phone: "12" })), /valid phone/);
        await assert.rejects(apply("TPROG1", fresher("v3.test@example.com", { consent: false })), /declaration/);
        await assert.rejects(apply("TPROG1", fresher("v4.test@example.com", { available_from: "" })), /Available to join/);
        await assert.rejects(apply("TPROG1", experienced("v5.test@example.com", { expected_salary: "" })), /Expected monthly salary/);
        await assert.rejects(apply("TPROG1", fresher("v6.test@example.com", { key_skills: [] })), /key skill/);
        await assert.rejects(apply("TPROG1", fresher("v7.test@example.com"), null), /Upload your CV/);
        await assert.rejects(apply("TPROG1", fresher("v8.test@example.com"), { ...pdf("cv.exe") }), /PDF, DOC or DOCX/);
        await assert.rejects(apply("TPROG1", fresher("v9.test@example.com"), { originalname: "cv.pdf", size: 10, buffer: Buffer.from("MZ not a pdf") }), /valid PDF/);
        await assert.rejects(apply("TPROG1", fresher("v10.test@example.com"), { ...pdf(), size: 6 * 1024 * 1024 }), /5 MB/);
        await assert.rejects(apply("TPROG1", fresher("v11.test@example.com", { source: "Employee referral" })), /Referrer/);
        await assert.rejects(apply("TPROG1", fresher("v12.test@example.com", { linkedin_url: "https://evil.example.com" })), /LinkedIn/);
    });

    await db.query("ROLLBACK");
} catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    results.push(`ERROR ${error.stack || error.message}`);
} finally {
    db.release();
    await Promise.all(storedCvs.map((file) => unlink(path.join(CV_DIR, path.basename(file))).catch(() => {})));
    await pool.end();
}

console.log(results.join("\n"));
const failed = results.filter((line) => !line.startsWith("PASS")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
