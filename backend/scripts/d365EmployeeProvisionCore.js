import { buildInitialEmployeeCredential, employeeMappingPredicate } from "../services/accountCredentials.js";
import { D365_BACKUP_TABLES, verifyD365BackupManifest } from "./d365EmployeeApplyCore.js";

const REVIEW_NUMBERS = new Set(["1610", "2866"]);
const IDENTITY_FIELDS = ["employee_id", "personnel_number", "employment_legal_entity_id", "employment_id"];
const key = (row) => JSON.stringify(IDENTITY_FIELDS.map((field) => row[field]));

export function validateProvisionIdentities(identities) {
    if (!Array.isArray(identities) || !identities.length) {
        throw new Error("A nonempty approved identity array is required");
    }
    const employees = new Set();
    const usernames = new Set();
    for (const identity of identities) {
        if (!identity || IDENTITY_FIELDS.some((field) =>
            typeof identity[field] !== "string" || !identity[field] || identity[field] !== identity[field].trim())
            || !/^[A-Za-z0-9-]+$/.test(identity.personnel_number) || /^EMP/i.test(identity.personnel_number)) {
            throw new Error("Invalid approved identity; identifiers must be nonempty strings without surrounding whitespace");
        }
        if (REVIEW_NUMBERS.has(identity.personnel_number)) continue;
        const username = `emp${identity.personnel_number}`.toLowerCase();
        if (employees.has(identity.employee_id.toLowerCase()) || usernames.has(username)) {
            throw new Error("Duplicate employee or normalized username in approved identities");
        }
        employees.add(identity.employee_id.toLowerCase());
        usernames.add(username);
    }
}

export async function provisionD365EmployeeLogins(db, identities, {
    apply = false, backupManifest, runId, operator, now = new Date(),
} = {}) {
    validateProvisionIdentities(identities);
    if (typeof apply !== "boolean") throw new Error("apply must be a boolean");
    if (apply && [runId, operator].some((value) => typeof value !== "string" || !value.trim())) {
        throw new Error("Apply requires a run ID and operator for the audit record");
    }
    let started = false;
    try {
        await db.query(apply
            ? "BEGIN ISOLATION LEVEL SERIALIZABLE"
            : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        started = true;
        if (apply) {
            await db.query("LOCK TABLE public.employees, public.employee_d365_mapping, public.employee_logins IN SHARE ROW EXCLUSIVE MODE");
            const counts = {};
            for (const table of [...D365_BACKUP_TABLES, "employee_logins"]) {
                const result = await db.query(`SELECT COUNT(*)::int AS count FROM public.${table}`);
                counts[table] = result.rows[0].count;
            }
            verifyD365BackupManifest(backupManifest, counts, now);
            if (!Number.isSafeInteger(backupManifest.row_counts.employee_logins)
                || backupManifest.row_counts.employee_logins !== counts.employee_logins) {
                throw new Error("Backup row counts differ from the live database for: employee_logins");
            }
        }
        const mappings = (await db.query(
            `SELECT m.employee_id, m.personnel_number, m.employment_legal_entity_id, m.employment_id,
                    m.link_status, e.role, e.status, e.access_disabled,
                    (${employeeMappingPredicate}) AS mapping_valid
             FROM public.employee_d365_mapping m
             LEFT JOIN public.employees e ON e.employee_id = m.employee_id
             CROSS JOIN LATERAL (
                 SELECT m.employee_id, m.personnel_number, 'EMP' || m.personnel_number AS username
             ) l`
        )).rows;
        const existing = (await db.query(
            "SELECT employee_id, personnel_number, username, normalized_username FROM public.employee_logins"
        )).rows;
        const records = identities.map((identity) => {
            const username = `EMP${identity.personnel_number}`;
            const normalized = username.toLowerCase();
            if (REVIEW_NUMBERS.has(identity.personnel_number)) {
                return { ...Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, identity[field]])), action: "excluded-manual-review" };
            }
            const related = mappings.filter((mapping) =>
                mapping.employee_id === identity.employee_id || mapping.personnel_number === identity.personnel_number);
            const mapping = related[0];
            if (related.length !== 1 || key(mapping) !== key(identity)
                || mapping.mapping_valid !== true || mapping.link_status !== "linked"
                || String(mapping.role).toLowerCase() !== "employee") {
                throw new Error(`Missing or conflicting linked identity for employee ${identity.employee_id}`);
            }
            const matches = existing.filter((login) =>
                login.employee_id.toLowerCase() === identity.employee_id.toLowerCase()
                || login.personnel_number.toLowerCase() === identity.personnel_number.toLowerCase()
                || login.normalized_username === normalized);
            if (matches.length && (matches.length !== 1
                || matches[0].employee_id !== identity.employee_id
                || matches[0].personnel_number !== identity.personnel_number
                || matches[0].username !== username || matches[0].normalized_username !== normalized)) {
                throw new Error(`Conflicting existing login for employee ${identity.employee_id}`);
            }
            return {
                ...Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, identity[field]])),
                action: matches.length ? "existing-unchanged" : "create-disabled",
                active: String(mapping.status).toLowerCase() === "active",
                accessDisabled: mapping.access_disabled !== false,
            };
        });
        let created = 0;
        if (apply) {
            for (const record of records.filter((row) => row.action === "create-disabled")) {
                const credential = await buildInitialEmployeeCredential(record.personnel_number);
                const result = await db.query(
                    `INSERT INTO public.employee_logins
                        (employee_id, personnel_number, username, normalized_username, password_hash,
                         enabled, credential_version, provision_run_id)
                     VALUES ($1, $2, $3, $4, $5, FALSE, 0, $6)
                     RETURNING employee_id`,
                    [record.employee_id, credential.personnelNumber, credential.username,
                        credential.normalizedUsername, credential.passwordHash, runId]
                );
                if (result.rowCount !== 1) throw new Error("Login insert did not return one row");
                created++;
            }
        }
        await db.query(apply ? "COMMIT" : "ROLLBACK");
        started = false;
        return {
            mode: apply ? "apply" : "preview", runId: runId ?? null, operator: operator ?? null,
            backupId: apply ? backupManifest.backup_id : null,
            completedAt: now.toISOString(), created,
            proposed: records.filter((row) => row.action === "create-disabled").length,
            records,
        };
    } catch (error) {
        if (started) {
            try {
                await db.query("ROLLBACK");
            } catch (rollbackError) {
                throw new AggregateError([error, rollbackError], "Provisioning failed and rollback failed");
            }
        }
        throw error;
    }
}
