// Stage 4A: READ-ONLY dry-run preview of the D365 EmployeesV2 -> HRMS employees import.
//
//   node scripts/d365EmployeeImport.js [--backup-manifest <file>] [--out <dir>]
//
// This script has NO apply mode. Safety guarantees:
//   * PostgreSQL work runs inside BEGIN READ ONLY, so the database itself rejects any write.
//   * D365 access is HTTP GET only, to the EmployeesV2 entity.
//   * Console output is counts plus a redacted sample (no names, emails, phones, tokens, secrets).
//   * --out writes a per-record CSV with identity keys and issue flags only (no personal data).
//
// --backup-manifest must identify a full backup and contain a passed independent verification:
//   created_at, method, full_database_backup: true, backup_id, location, created_by,
//   row_counts for every D365_BACKUP_TABLES entry, and
//   verification: { independent: true, verified_at, verified_by, method, result: "passed" }.
// The verifier must be distinct from created_by. All required table counts must match live counts.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pool from "../db.js";
import { D365_BACKUP_TABLES, verifyD365BackupManifest } from "./d365EmployeeApplyCore.js";
import { fetchD365Pages, reconcileD365 } from "./d365Reconciliation.js";

const SELECT = [
    "PersonnelNumber", "EmploymentLegalEntityId", "EmploymentId", "Name", "FirstName", "MiddleName", "LastName",
    "PersonalTitle", "PrimaryContactEmail", "PrimaryContactPhone", "Gender", "MaritalStatus", "BirthDate",
    "EmploymentStartDate", "EmploymentEndDate", "TerminationDate", "LastDateWorked",
    "ProfessionalTitle", "TitleId", "NationalityCountryRegion",
].join(",");

const BACKUP_TABLES = D365_BACKUP_TABLES;
const REVIEW_PERSONNEL_NUMBERS = ["1610", "2866"];

const norm = (value) => String(value ?? "").trim();
const lower = (value) => norm(value).toLowerCase();
const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const countBy = (items, keyFn) => {
    const map = new Map();
    for (const item of items) bump(map, keyFn(item));
    return map;
};

// D365 uses 1900-01-01 for "not set" and 2154-12-31 for "no end"
const isUnset = (iso) => !norm(iso) || new Date(iso).getUTCFullYear() <= 1901;
const isOpenEnded = (iso) => !norm(iso) || new Date(iso).getUTCFullYear() >= 2100;
const toDate = (iso) => (isUnset(iso) || isOpenEnded(iso) ? null : norm(iso).slice(0, 10));

// Only values HRMS already uses are mapped. Anything else is reported and left empty, never guessed.
const GENDER_MAP = { male: "Male", female: "Female" };
const MARITAL_MAP = { single: "Single", married: "Married" };

const fetchD365 = async () => {
    const base = new URL(process.env.D365_BASE_URL.trim()).origin;
    const tokenResponse = await fetch(
        `https://login.microsoftonline.com/${encodeURIComponent(process.env.D365_TENANT_ID.trim())}/oauth2/v2.0/token`,
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "client_credentials",
                client_id: process.env.D365_CLIENT_ID.trim(),
                client_secret: process.env.D365_CLIENT_SECRET.trim(),
                scope: `${base}/.default`,
            }),
            signal: AbortSignal.timeout(60_000),
        }
    );
    if (!tokenResponse.ok) throw new Error(`D365 authentication failed (${tokenResponse.status})`);
    const authorization = ["Bearer", (await tokenResponse.json()).access_token].join(" ");

    return fetchD365Pages({ base, select: SELECT, authorization });
};

const checkBackup = (manifestPath, liveCounts) => {
    if (!manifestPath) return { verified: false, reason: "no --backup-manifest supplied" };
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
        return { verified: false, reason: "manifest missing or not valid JSON" };
    }
    try {
        const result = verifyD365BackupManifest(manifest, liveCounts);
        return { verified: true, reason: `${manifest.method}, ${result.ageHours.toFixed(1)}h old, independently verified; row counts match` };
    } catch (error) {
        return { verified: false, reason: error.message };
    }
};

const arg = (name) => {
    const index = process.argv.indexOf(name);
    return index > -1 ? process.argv[index + 1] : null;
};

const db = await pool.connect();
try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    const d365 = await fetchD365();
    const hrms = (await db.query("SELECT employee_id, name, email, phone FROM employees")).rows;
    const mappingRows = (await db.query("SELECT employee_id, personnel_number, employment_legal_entity_id, employment_id, link_status FROM employee_d365_mapping")).rows;
    const reconciliation = reconcileD365(d365, hrms, mappingRows);
    const liveCounts = {};
    for (const table of BACKUP_TABLES) {
        liveCounts[table] = (await db.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n;
    }
    const demoPasswordless = (await db.query("SELECT COUNT(*)::int AS n FROM employees WHERE password IS NULL")).rows[0].n;

    const identityKey = (e) => JSON.stringify([norm(e.PersonnelNumber), norm(e.EmploymentLegalEntityId), norm(e.EmploymentId)]);
    const hrmsIds = new Set(hrms.map((h) => norm(h.employee_id)));
    const hrmsEmails = new Set(hrms.map((h) => lower(h.email)).filter(Boolean));
    const mappedKeys = new Set(mappingRows.map((m) => JSON.stringify([norm(m.personnel_number), norm(m.employment_legal_entity_id), norm(m.employment_id)])));

    const identityCounts = countBy(d365, identityKey);
    const personnelCounts = countBy(d365, (e) => norm(e.PersonnelNumber));
    const emailCounts = countBy(d365.filter((e) => norm(e.PrimaryContactEmail)), (e) => lower(e.PrimaryContactEmail));

    const unmapped = { Gender: new Map(), MaritalStatus: new Map() };
    const issueTally = new Map();

    const build = (e) => {
        const issues = [];
        const personnel = norm(e.PersonnelNumber);

        if (!personnel || !norm(e.EmploymentLegalEntityId) || !norm(e.EmploymentId)) issues.push("incomplete-identity");
        if (identityCounts.get(identityKey(e)) > 1) issues.push("duplicate-identity-in-d365");
        if (personnelCounts.get(personnel) > 1) issues.push("multi-employment-pending-identity-review");
        if (REVIEW_PERSONNEL_NUMBERS.includes(personnel)) issues.push("designated-manual-review-personnel-number");
        if (hrmsIds.has(personnel)) issues.push("employee-id-collision");
        if (mappedKeys.has(identityKey(e))) issues.push("already-mapped");

        const composed = [e.FirstName, e.MiddleName, e.LastName].map(norm).filter(Boolean).join(" ");
        const name = norm(e.Name) || composed;
        if (!name) issues.push("missing-name");

        let email = lower(e.PrimaryContactEmail) || null;
        if (email && emailCounts.get(email) > 1) { issues.push("email-shared-within-d365"); email = null; }
        if (email && hrmsEmails.has(email)) { issues.push("email-collision-with-hrms"); email = null; }

        const genderRaw = lower(e.Gender);
        const gender = GENDER_MAP[genderRaw] ?? null;
        if (genderRaw && !gender) bump(unmapped.Gender, norm(e.Gender));
        const maritalRaw = lower(e.MaritalStatus);
        const marital = MARITAL_MAP[maritalRaw] ?? null;
        if (maritalRaw && !marital) bump(unmapped.MaritalStatus, norm(e.MaritalStatus));

        const hasEnded = !isOpenEnded(e.EmploymentEndDate) && new Date(e.EmploymentEndDate) < new Date();
        const terminated = !isUnset(e.TerminationDate) && !isOpenEnded(e.TerminationDate);

        const proposed = {
            employee_id: personnel,
            name,
            title: norm(e.PersonalTitle) || null,
            first_name: norm(e.FirstName) || null,
            middle_name: norm(e.MiddleName) || null,
            last_name: norm(e.LastName) || null,
            phone: norm(e.PrimaryContactPhone) || null,
            email,
            gender,
            marital_status: marital,
            date_of_birth: toDate(e.BirthDate),
            joining_date: toDate(e.EmploymentStartDate),
            employment_end_date: isOpenEnded(e.EmploymentEndDate) ? "Never" : toDate(e.EmploymentEndDate),
            last_date_worked: toDate(e.LastDateWorked),
            legal_entity: norm(e.EmploymentLegalEntityId),
            status: hasEnded || terminated ? "Inactive" : "Active",
            role: "employee",
            password: null,
            access_disabled: false,
            designation: null,
            department: null,
        };
        return { e, issues, proposed };
    };

    const records = d365.map(build);
    for (const [index, r] of records.entries()) {
        const reconciled = reconciliation.records[index];
        r.action = ({
            "already-mapped": "skip-already-mapped",
            "confirmed-link": "propose-link-existing",
            "new-record": "propose-insert",
            ambiguous: "excluded-manual-review",
            excluded: "excluded-manual-review",
        })[reconciled.category];
        r.issues = [...new Set([...r.issues, ...reconciled.reasons])];
        for (const issue of r.issues) bump(issueTally, issue);
    }
    const actionTally = countBy(records, (r) => r.action);
    const inserts = records.filter((r) => r.action === "propose-insert");
    const excluded = records.filter((r) => r.action === "excluded-manual-review");

    const insertIdCounts = countBy(inserts, (r) => r.proposed.employee_id);
    const dupInsertIds = [...insertIdCounts].filter(([, n]) => n > 1).length;
    const insertKeys = new Set(inserts.map((r) => identityKey(r.e)));
    const reviewInInserts = inserts.filter((r) => REVIEW_PERSONNEL_NUMBERS.includes(norm(r.e.PersonnelNumber))).length;
    const reviewRows = records.filter((r) => REVIEW_PERSONNEL_NUMBERS.includes(norm(r.e.PersonnelNumber)));
    const backup = checkBackup(arg("--backup-manifest"), liveCounts);

    const pad = (s, n = 44) => String(s).padEnd(n);
    console.log("=== D365 -> HRMS employee import DRY RUN (READ-ONLY; nothing was written) ===");
    console.log("Reconciliation categories:", JSON.stringify(reconciliation.counts));
    console.log(`\nIMPORT STATUS: ${backup.verified ? "backup verified (still needs your explicit approval)" : "BLOCKED - BACKUP NOT VERIFIED"}`);
    console.log(`  backup check: ${backup.reason}`);

    console.log("\nLive counts");
    console.log(`  ${pad("D365 EmployeesV2 rows")}${d365.length}   (baseline 896)`);
    console.log(`  ${pad("HRMS employees (demo, preserved)")}${hrms.length}   (baseline 56)`);
    console.log(`  ${pad("Existing D365 mapping rows")}${mappingRows.length}   (baseline 0)`);
    for (const table of BACKUP_TABLES.filter((t) => !["employees", "employee_d365_mapping"].includes(t))) {
        console.log(`  ${pad(`${table} rows (must stay unchanged)`)}${liveCounts[table]}`);
    }

    console.log("\nProposed action per D365 row");
    for (const [action, n] of [...actionTally].sort()) console.log(`  ${pad(action)}${n}`);
    const matchesBaseline = d365.length === 896 && inserts.length === 892 && excluded.length === 4 && hrms.length === 56 && mappingRows.length === 0;
    console.log(`  baseline 892 inserts / 4 pending review matches: ${matchesBaseline ? "yes" : "NO - discrepancy, see counts above (nothing forced)"}`);

    console.log("\nIdentity and collision checks");
    console.log(`  ${pad("identity key complete on all rows")}${records.every((r) => !r.issues.includes("incomplete-identity")) ? "yes" : "NO"}`);
    console.log(`  ${pad("duplicate identity keys in D365")}${[...identityCounts].filter(([, n]) => n > 1).length}`);
    console.log(`  ${pad("employee_id collisions with HRMS")}${issueTally.get("employee-id-collision") ?? 0}`);
    console.log(`  ${pad("proposed employee_ids duplicated")}${dupInsertIds}`);
    console.log(`  ${pad("proposed inserts have unique identity")}${insertKeys.size === inserts.length ? "yes" : "NO"}`);
    console.log(`  ${pad("review numbers 1610/2866")}${reviewRows.length} D365 rows found, ${reviewInInserts} in proposed inserts (must be 0)`);
    console.log(`  ${pad("review rows (number/entity/employment)")}${reviewRows.map((r) => `${r.e.PersonnelNumber}/${r.e.EmploymentLegalEntityId}/${r.e.EmploymentId}`).join("; ")}`);
    const otherMulti = [...personnelCounts].filter(([p, n]) => n > 1 && !REVIEW_PERSONNEL_NUMBERS.includes(p)).map(([p]) => p);
    console.log(`  ${pad("other multi-employment numbers")}${otherMulti.length ? otherMulti.join(", ") : "none"}`);

    console.log("\nAccount safety");
    console.log(`  ${pad("proposed accounts with a password")}${inserts.filter((r) => r.proposed.password !== null).length} (must be 0)`);
    console.log(`  ${pad("proposed role")}${[...new Set(inserts.map((r) => r.proposed.role))].join(",")} (never hr)`);
    console.log(`  ${pad("login provisioning")}not part of reconciliation; verify auth separately`);
    console.log(`  ${pad("existing HRMS rows with NULL password")}${demoPasswordless} (unchanged by this dry run)`);

    console.log("\nFlags (a row can have several)");
    for (const [issue, n] of [...issueTally].sort()) console.log(`  ${pad(issue)}${n}`);

    console.log("\nProposed field fill across proposed inserts (non-empty / total)");
    const insertFill = new Map();
    for (const r of inserts) for (const [field, value] of Object.entries(r.proposed)) if (value !== null && value !== "") bump(insertFill, field);
    for (const field of Object.keys(inserts[0]?.proposed ?? {})) {
        console.log(`  ${pad(field)}${insertFill.get(field) ?? 0}/${inserts.length}`);
    }

    console.log("\nMapping issues");
    for (const [field, values] of Object.entries(unmapped)) {
        console.log(`  ${field}: ${values.size ? [...values].map(([v, n]) => `"${v}" x${n} left empty`).join(", ") : "all non-empty values mapped"}`);
    }
    console.log(`  designation / department: unmapped by design (ProfessionalTitle filled on ${d365.filter((e) => norm(e.ProfessionalTitle)).length}, TitleId on ${d365.filter((e) => norm(e.TitleId)).length}; position lookup not yet validated)`);
    console.log(`  nationality: NationalityCountryRegion filled on ${d365.filter((e) => norm(e.NationalityCountryRegion)).length}; not imported`);
    console.log("  employment_type, worker_type, grade: no validated D365 source; HRMS defaults apply");
    console.log(`  legal_entity values: ${[...countBy(inserts, (r) => r.proposed.legal_entity)].map(([v, n]) => `${v} x${n}`).join(", ")} (HRMS default is SHLT for demo rows)`);
    console.log(`  status: ${[...countBy(inserts, (r) => r.proposed.status)].map(([v, n]) => `${v} x${n}`).join(", ")}`);

    console.log("\nRedacted sample (3 proposed inserts; no names, emails or phones)");
    for (const r of inserts.slice(0, 3)) {
        const p = r.proposed;
        console.log(`  id=${p.employee_id} entity=${p.legal_entity} name=${p.name ? `${p.name[0]}***` : "-"} phone=${p.phone ? "set" : "empty"} email=${p.email ? "set" : "empty"} gender=${p.gender ?? "empty"} joined=${p.joining_date ? "set" : "empty"} status=${p.status} password=NULL`);
    }

    const outDir = arg("--out");
    if (outDir) {
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, "d365-reconciliation.json"), JSON.stringify(reconciliation, null, 2));
        const lines = ["personnel_number,legal_entity,employment_id,action,issues"];
        for (const r of records) {
            lines.push([r.e.PersonnelNumber, r.e.EmploymentLegalEntityId, r.e.EmploymentId, r.action, r.issues.join("|")]
                .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","));
        }
        const file = path.join(outDir, "d365-import-dry-run.csv");
        fs.writeFileSync(file, lines.join("\n"));
        console.log(`\nIdentity/flag CSV (no personal data) written to ${file}`);
    }

    const txAssigned = (await db.query("SELECT txid_current_if_assigned() AS tx")).rows[0].tx;
    console.log("\nSafety");
    console.log(`  transaction was READ ONLY; write transaction id assigned: ${txAssigned === null ? "none (no writes occurred)" : "YES (unexpected)"}`);
    console.log("  D365 requests: GET only. No mapping rows created, no employees imported.");
} finally {
    try {
        await db.query("ROLLBACK");
    } finally {
        db.release();
        await pool.end();
    }
}
