// READ-ONLY Stage 3 link preview: which existing HRMS employees could be linked to which D365 employee.
// Performs only HTTP GETs against D365 and SELECTs against PostgreSQL. Creates no mapping rows,
// imports nothing and writes nothing.
//
//   node scripts/d365LinkPreview.js [--out <dir>]
//
// Console output is aggregate counts and employee IDs only. With --out, a detailed CSV is written
// (it contains personal data: keep it out of the repository).
//
// Linking rule: a link is only proposed from an exact, unique identity signal. Name is NEVER used
// to link; name matches are listed as weak candidates for human review.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pool from "../db.js";
import { fetchD365Pages, reconcileD365 } from "./d365Reconciliation.js";

const SELECT = [
    "PersonnelNumber", "EmploymentLegalEntityId", "EmploymentId", "Name",
    "PrimaryContactEmail", "PrimaryContactPhone",
].join(",");

const norm = (value) => String(value ?? "").trim();
const lower = (value) => norm(value).toLowerCase();
const digits = (value) => norm(value).replace(/\D/g, "");
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const group = (items, keyFn) => {
    const map = new Map();
    for (const item of items) {
        const key = keyFn(item);
        if (!key) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
    }
    return map;
};

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
    const accessToken = (await tokenResponse.json()).access_token;
    const authorization = ["Bearer", accessToken].join(" ");

    return fetchD365Pages({ base, select: SELECT, authorization });
};

const outIndex = process.argv.indexOf("--out");
const outDir = outIndex > -1 ? process.argv[outIndex + 1] : null;

const db = await pool.connect();
try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const d365 = await fetchD365();
    const hrms = (await db.query(
        "SELECT employee_id, name, email, phone FROM employees ORDER BY id"
    )).rows;
    const mapped = (await db.query("SELECT employee_id, personnel_number, employment_legal_entity_id, employment_id, link_status FROM employee_d365_mapping")).rows;
    const mappedIds = new Set(mapped.map((m) => m.employee_id));
    const reconciliation = reconcileD365(d365, hrms, mapped);
    const attendanceD365 = (await db.query(
        `SELECT DISTINCT personnel_number, employment_legal_entity_id, employment_id
         FROM attendance WHERE employee_id IS NULL AND personnel_number IS NOT NULL`
    )).rows;

    const identityKey = (e) => JSON.stringify([norm(e.PersonnelNumber), norm(e.EmploymentLegalEntityId), norm(e.EmploymentId)]);
    const byPersonnel = group(d365, (e) => norm(e.PersonnelNumber));
    const byEmail = group(d365, (e) => lower(e.PrimaryContactEmail));
    const byPhone = group(d365, (e) => digits(e.PrimaryContactPhone).slice(-8) || null);
    const byName = group(d365, (e) => lower(e.Name).replace(/\s+/g, " "));

    const results = hrms.map((h) => {
        const signals = [];
        const personnel = byPersonnel.get(norm(h.employee_id)) ?? [];
        if (personnel.length) signals.push({ signal: "employee_id=PersonnelNumber", matches: personnel });
        const email = byEmail.get(lower(h.email)) ?? [];
        if (email.length) signals.push({ signal: "email", matches: email });
        const phoneKey = digits(h.phone).slice(-8);
        const phone = phoneKey.length === 8 ? (byPhone.get(phoneKey) ?? []) : [];
        if (phone.length) signals.push({ signal: "phone-last-8-digits", matches: phone });
        const name = byName.get(lower(h.name).replace(/\s+/g, " ")) ?? [];
        if (name.length) signals.push({ signal: "name-only", matches: name });

        let action;
        let target = null;
        const resolved = reconciliation.records.filter((row) => row.employee_id === h.employee_id);
        if (resolved.length === 1 && resolved[0].category === "already-mapped") action = "already-mapped";
        else if (resolved.length === 1 && resolved[0].category === "confirmed-link") {
            action = "propose-link";
            target = resolved[0].key;
        }
        else if (resolved.length || mappedIds.has(h.employee_id)) action = "needs-review-mapping-conflict";
        else if (signals.length) action = "needs-review-weak-signal-only";
        else action = "no-match-keep-hrms-only";
        return { h, signals, action, target };
    });

    // A D365 identity proposed for more than one HRMS employee must not be linked twice
    const targetCounts = group(results.filter((r) => r.target), (r) => r.target);
    for (const r of results) {
        if (r.target && targetCounts.get(r.target).length > 1) r.action = "needs-review-d365-claimed-twice";
    }

    const tally = new Map();
    for (const r of results) tally.set(r.action, (tally.get(r.action) ?? 0) + 1);
    const signalTally = new Map();
    for (const r of results) for (const s of r.signals) signalTally.set(s.signal, (signalTally.get(s.signal) ?? 0) + 1);

    const multiEmployment = [...byPersonnel].filter(([, rows]) => rows.length > 1);
    const d365Keys = new Set(d365.map(identityKey));
    const attendanceUnknown = attendanceD365.filter((a) =>
        !d365Keys.has(JSON.stringify([norm(a.personnel_number), norm(a.employment_legal_entity_id), norm(a.employment_id)])));

    console.log("=== D365 <-> HRMS link preview (READ-ONLY; nothing was written) ===");
    console.log("Reconciliation categories:", JSON.stringify(reconciliation.counts));
    console.log(`D365 EmployeesV2 rows:           ${d365.length}`);
    console.log(`HRMS employees:                  ${hrms.length}`);
    console.log(`Existing mapping rows:           ${mapped.length}`);
    console.log("\nProposed action per HRMS employee:");
    for (const [action, n] of [...tally].sort()) console.log(`  ${action.padEnd(36)} ${n}`);
    console.log("\nSignals found (informational):");
    for (const [signal, n] of [...signalTally].sort()) console.log(`  ${signal.padEnd(36)} ${n}`);
    const review = results.filter((r) => r.action.startsWith("needs-review")).map((r) => r.h.employee_id);
    console.log(`\nHRMS employee IDs needing review: ${review.join(", ") || "none"}`);
    console.log(`\nMulti-employment personnel numbers (stay pending review): ${multiEmployment.length}`);
    console.log(`  D365 rows involved: ${multiEmployment.reduce((n, [, rows]) => n + rows.length, 0)}`);
    console.log(`  personnel numbers: ${multiEmployment.map(([p]) => p).join(", ") || "none"}`);
    console.log(`\nD365 punches in attendance (employee_id NULL): ${attendanceD365.length} distinct D365 identities`);
    console.log(`  of which not found in D365 EmployeesV2 now: ${attendanceUnknown.length}`);

    if (outDir) {
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, "d365-reconciliation.json"), JSON.stringify(reconciliation, null, 2));
        const lines = ["employee_id,action,signals,d365_personnel_numbers"];
        for (const r of results) {
            const numbers = [...new Set(r.signals.flatMap((s) => s.matches.map((m) => norm(m.PersonnelNumber))))];
            lines.push([r.h.employee_id, r.action, r.signals.map((s) => s.signal).join("|"), numbers.join("|")].map(csv).join(","));
        }
        const file = path.join(outDir, "d365-link-preview.csv");
        fs.writeFileSync(file, lines.join("\n"));
        console.log(`\nDetailed CSV written to ${file}`);
    }
} finally {
    try {
        await db.query("ROLLBACK");
    } finally {
        db.release();
        await pool.end();
    }
}
