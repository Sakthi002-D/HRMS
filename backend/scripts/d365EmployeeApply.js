// Explicit D365 EmployeesV2 apply. Preview remains scripts/d365EmployeeImport.js.
// Usage: node scripts/d365EmployeeApply.js --apply --backup-manifest <verified-full-backup.json>
// The manifest contract and required protected-table counts are documented in d365EmployeeImport.js.
// Inserts only new, uniquely identified D365 employees and their composite-key mapping rows.
// It never writes employee credentials, employee_logins, or existing HRMS/history rows.
import "dotenv/config";
import fs from "node:fs";
import pool from "../db.js";
import { applyD365EmployeeImport } from "./d365EmployeeApplyCore.js";
import { fetchD365Pages } from "./d365Reconciliation.js";

const SELECT = [
    "PersonnelNumber", "EmploymentLegalEntityId", "EmploymentId", "Name", "FirstName", "MiddleName", "LastName",
    "PrimaryContactEmail", "PrimaryContactPhone", "Gender", "MaritalStatus", "BirthDate", "EmploymentStartDate",
    "EmploymentEndDate", "TerminationDate", "LastDateWorked",
].join(",");

const arg = (name) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? null : process.argv[index + 1];
};

const requireArgument = (name) => {
    const value = arg(name);
    if (!value || value.startsWith("--")) throw new Error(`${name} is required`);
    return value;
};

const readManifest = (manifestPath) => {
    try {
        return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
        throw new Error("Backup manifest is missing or is not valid JSON");
    }
};

const fetchD365 = async () => {
    const requiredEnv = ["D365_BASE_URL", "D365_TENANT_ID", "D365_CLIENT_ID", "D365_CLIENT_SECRET"];
    if (requiredEnv.some((key) => !process.env[key]?.trim())) {
        throw new Error("D365 connection configuration is incomplete");
    }
    const base = new URL(process.env.D365_BASE_URL.trim()).origin;
    if (new URL(base).protocol !== "https:") throw new Error("D365 requires HTTPS");
    const response = await fetch(
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
            signal: AbortSignal.timeout(300_000),
        }
    );
    if (!response.ok) throw new Error(`D365 authentication failed (${response.status})`);
    const authorization = `Bearer ${(await response.json()).access_token}`;
    return fetchD365Pages({ base, select: SELECT, authorization });
};

const main = async () => {
    if (!process.argv.includes("--apply")) {
        throw new Error("No changes were made. This script requires explicit --apply");
    }
    const manifest = readManifest(requireArgument("--backup-manifest"));
    const sourceRows = await fetchD365();
    const db = await pool.connect();
    try {
        const result = await applyD365EmployeeImport(db, sourceRows, manifest);
        console.log("D365 employee import committed.");
        console.log(`  source rows: ${result.sourceRows}`);
        console.log(`  imported: ${result.imported}`);
        console.log(`  skipped or pending review: ${result.skipped}`);
        console.log(`  employee logins created: ${result.loginsCreated}`);
        console.log(`  backup verification age: ${result.backupAgeHours.toFixed(1)} hours`);
    } finally {
        db.release();
    }
};

try {
    await main();
} catch (error) {
    console.error("D365 employee apply failed:", error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
