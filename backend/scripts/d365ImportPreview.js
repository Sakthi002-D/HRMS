// READ-ONLY import preview for D365 EmployeesV2 -> HRMS employees.
// Performs only HTTP GETs against D365 and SELECTs against PostgreSQL. Writes nothing to either.
//
//   node scripts/d365ImportPreview.js [--out <dir>]
//
// Console output is aggregate counts only. With --out, a detailed per-employee CSV is written to
// that directory (it contains personal data: keep it out of the repository).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pool from "../db.js";

const SELECT = [
    "PersonnelNumber", "EmploymentLegalEntityId", "EmploymentId", "Name", "FirstName", "MiddleName", "LastName",
    "PersonalTitle", "ProfessionalTitle", "TitleId", "PrimaryContactEmail", "PrimaryContactPhone",
    "Gender", "MaritalStatus", "BirthDate", "NationalityCountryRegion", "EmploymentStartDate",
    "EmploymentEndDate", "TerminationDate", "LastDateWorked",
].join(",");

// D365 uses 2154-12-31 style sentinels for "no end date"
const isOpenEnded = (iso) => !iso || new Date(iso).getUTCFullYear() >= 2100;
const isUnset = (iso) => !iso || new Date(iso).getUTCFullYear() <= 1901;

const getToken = async (base) => {
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(process.env.D365_TENANT_ID.trim())}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: process.env.D365_CLIENT_ID.trim(),
            client_secret: process.env.D365_CLIENT_SECRET.trim(),
            scope: `${base}/.default`,
        }),
        signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`D365 authentication failed (${response.status})`);
    return (await response.json()).access_token;
};

const fetchAll = async () => {
    const base = new URL(process.env.D365_BASE_URL.trim()).origin;
    const token = await getToken(base);
    const rows = [];
    let next = new URL(`${base}/data/EmployeesV2`);
    next.searchParams.set("$select", SELECT);
    for (let page = 0; next && page < 200; page++) {
        if (next.origin !== base) throw new Error("Unexpected pagination host");
        const response = await fetch(next, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error(`D365 EmployeesV2 read failed (${response.status})`);
        const body = await response.json();
        rows.push(...body.value);
        next = body["@odata.nextLink"] ? new URL(body["@odata.nextLink"], next) : null;
    }
    return rows;
};

const norm = (value) => String(value ?? "").trim();
const normEmail = (value) => norm(value).toLowerCase();
const countBy = (items, keyFn) => {
    const map = new Map();
    for (const item of items) map.set(keyFn(item), (map.get(keyFn(item)) ?? 0) + 1);
    return map;
};
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const outIndex = process.argv.indexOf("--out");
const outDir = outIndex > -1 ? process.argv[outIndex + 1] : null;

try {
    const d365 = await fetchAll();
    const hrms = (await pool.query("SELECT employee_id, name, email, status FROM employees")).rows;
    const mapped = (await pool.query("SELECT personnel_number, employment_legal_entity_id, employment_id FROM employee_d365_mapping")).rows;

    const identityKey = (e) => JSON.stringify([norm(e.PersonnelNumber), norm(e.EmploymentLegalEntityId), norm(e.EmploymentId)]);
    const mappedKeys = new Set(mapped.map((m) => JSON.stringify([norm(m.personnel_number), norm(m.employment_legal_entity_id), norm(m.employment_id)])));
    const hrmsById = new Map(hrms.map((h) => [norm(h.employee_id), h]));
    const hrmsByEmail = new Map(hrms.filter((h) => norm(h.email)).map((h) => [normEmail(h.email), h]));

    const identityCounts = countBy(d365, identityKey);
    const personnelCounts = countBy(d365, (e) => norm(e.PersonnelNumber));
    const emailCounts = countBy(d365.filter((e) => norm(e.PrimaryContactEmail)), (e) => normEmail(e.PrimaryContactEmail));

    const classify = (e) => {
        const reasons = [];
        if (!norm(e.PersonnelNumber) || !norm(e.EmploymentLegalEntityId) || !norm(e.EmploymentId)) reasons.push("incomplete-identity");
        if (!norm(e.Name)) reasons.push("missing-name");
        if (identityCounts.get(identityKey(e)) > 1) reasons.push("duplicate-identity-in-d365");
        if (personnelCounts.get(norm(e.PersonnelNumber)) > 1) reasons.push("personnel-number-in-multiple-employments");
        if (norm(e.PrimaryContactEmail) && emailCounts.get(normEmail(e.PrimaryContactEmail)) > 1) reasons.push("email-shared-within-d365");
        if (mappedKeys.has(identityKey(e))) return { action: "already-mapped", reasons };

        const idMatch = hrmsById.get(norm(e.PersonnelNumber));
        const emailMatch = norm(e.PrimaryContactEmail) ? hrmsByEmail.get(normEmail(e.PrimaryContactEmail)) : null;
        if (idMatch) return { action: "needs-review", reasons: [...reasons, "hrms-employee-id-equals-personnel-number"], hrms: idMatch };
        if (emailMatch) return { action: "needs-review", reasons: [...reasons, "email-already-used-by-hrms-employee"], hrms: emailMatch };
        if (reasons.length) return { action: "needs-review", reasons };
        return { action: "create", reasons };
    };

    const plan = d365.map((e) => ({ e, ...classify(e) }));
    const tally = countBy(plan, (p) => p.action);
    const reasonTally = countBy(plan.flatMap((p) => p.reasons), (r) => r);

    // Employment state derived from dates (D365 has no status field)
    const stateOf = (e) => {
        if (!isOpenEnded(e.EmploymentEndDate)) return new Date(e.EmploymentEndDate) < new Date() ? "ended" : "ends-in-future";
        if (!isUnset(e.TerminationDate) && new Date(e.TerminationDate).getUTCFullYear() < 2100) return "terminated";
        return "active";
    };
    const stateTally = countBy(d365, stateOf);

    // ProfessionalTitle / TitleId validation
    const titles = countBy(d365.filter((e) => norm(e.ProfessionalTitle)), (e) => norm(e.ProfessionalTitle));
    const titleIds = countBy(d365.filter((e) => norm(e.TitleId)), (e) => norm(e.TitleId));
    const emptyProfessionalTitle = d365.filter((e) => !norm(e.ProfessionalTitle)).length;
    const titleLengths = [...titles.keys()].map((t) => t.length);

    console.log("=== D365 -> HRMS import preview (READ-ONLY; nothing was written) ===");
    console.log(`D365 EmployeesV2 rows:        ${d365.length}`);
    console.log(`HRMS employees (kept as-is):  ${hrms.length}`);
    console.log(`Existing D365 mappings:       ${mapped.length}`);
    console.log("\nProposed action per D365 row:");
    for (const [action, n] of [...tally].sort()) console.log(`  ${action.padEnd(16)} ${n}`);
    console.log("\nFlags (a row can have several):");
    for (const [reason, n] of [...reasonTally].sort()) console.log(`  ${reason.padEnd(46)} ${n}`);
    console.log("\nEmployment state derived from dates:");
    for (const [state, n] of [...stateTally].sort()) console.log(`  ${state.padEnd(16)} ${n}`);
    console.log("\nProfessionalTitle validation:");
    console.log(`  rows with a value:          ${d365.length - emptyProfessionalTitle}`);
    console.log(`  rows empty:                 ${emptyProfessionalTitle}`);
    console.log(`  distinct values:            ${titles.size}${titleLengths.length ? ` (length ${Math.min(...titleLengths)}-${Math.max(...titleLengths)})` : ""}`);
    console.log(`  rows with TitleId:          ${d365.filter((e) => norm(e.TitleId)).length} (distinct ${titleIds.size})`);
    console.log(`  top values: ${[...titles].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, n]) => `${t} (${n})`).join("; ") || "none"}`);
    console.log("\nHRMS demo employees whose employee_id equals a D365 personnel number (need manual decision):",
        plan.filter((p) => p.reasons.includes("hrms-employee-id-equals-personnel-number")).length);

    if (outDir) {
        fs.mkdirSync(outDir, { recursive: true });
        const file = path.join(outDir, "d365-import-preview.csv");
        const header = "personnel_number,legal_entity,employment_id,name,professional_title,title_id,email_present,proposed_action,flags,matched_hrms_employee_id";
        const lines = plan.map((p) => [
            norm(p.e.PersonnelNumber), norm(p.e.EmploymentLegalEntityId), norm(p.e.EmploymentId), norm(p.e.Name),
            norm(p.e.ProfessionalTitle), norm(p.e.TitleId), norm(p.e.PrimaryContactEmail) ? "yes" : "no",
            p.action, p.reasons.join("|"), p.hrms?.employee_id ?? "",
        ].map(csv).join(","));
        fs.writeFileSync(file, [header, ...lines].join("\n"));
        console.log(`\nDetailed CSV written to ${file} (contains personal data - do not commit).`);
    }
} catch (error) {
    console.error("Preview failed:", error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
