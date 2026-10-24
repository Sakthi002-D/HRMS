import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { provisionD365EmployeeLogins, validateProvisionIdentities } from "./d365EmployeeProvisionCore.js";

let pool;
try {
    const { values } = parseArgs({
        options: {
            identities: { type: "string" },
            apply: { type: "boolean", default: false },
            "backup-manifest": { type: "string" },
            "run-id": { type: "string" },
            operator: { type: "string" },
            help: { type: "boolean" },
        },
    });
    if (values.help) {
        console.log("node scripts\\d365EmployeeProvision.js --identities <approved.json> [--apply --backup-manifest <verified.json> --run-id <id> --operator <name>]");
        console.log("Default: read-only preview. Apply creates disabled logins only. Store JSON output as a private audit record.");
    } else {
        if (!values.identities) throw new Error("--identities is required");
        const identities = JSON.parse(readFileSync(values.identities, "utf8"));
        validateProvisionIdentities(identities);
        if (values.apply && (!values["backup-manifest"] || !values["run-id"]?.trim() || !values.operator?.trim())) {
            throw new Error("--apply requires --backup-manifest, --run-id and --operator");
        }
        const backupManifest = values["backup-manifest"]
            ? JSON.parse(readFileSync(values["backup-manifest"], "utf8")) : undefined;
        pool = (await import("../db.js")).default;
        const db = await pool.connect();
        try {
            console.log(JSON.stringify(await provisionD365EmployeeLogins(db, identities, {
                apply: values.apply, backupManifest, runId: values["run-id"], operator: values.operator,
            }), null, 2));
        } finally {
            db.release();
        }
    }
} catch (error) {
    // Database errors can contain bind values, including hashes. Never print their details.
    console.error("D365 login provisioning failed:", error.code ? `database error ${error.code}` : error.message);
    process.exitCode = 1;
} finally {
    if (pool) await pool.end();
}
