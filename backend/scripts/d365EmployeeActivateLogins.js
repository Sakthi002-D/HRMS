// Activates provisioned D365 employee logins for first-time onboarding.
// Usage: node scripts/d365EmployeeActivateLogins.js [--apply]
//
// Default is a read-only preview. With --apply, for every disabled login whose
// employee is Active and linked through employee_d365_mapping:
//   * password_hash is set to bcrypt(username) — the documented temporary
//     bootstrap credential (username EMP<PersonnelNumber>, password the same)
//   * enabled is set to TRUE and must_change_password stays TRUE so the
//     employee is forced to replace the bootstrap password
//   * employees.access_disabled is cleared for those employees only
// HR accounts, demo employees without logins, and inactive employees are never touched.
import "dotenv/config";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { employeeMappingPredicate } from "../services/accountCredentials.js";

const apply = process.argv.includes("--apply");
const db = await pool.connect();
let started = false;
try {
    await db.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    started = true;
    const targets = (await db.query(
        `SELECT l.employee_id, l.username
         FROM employee_logins l
         JOIN employees e ON e.employee_id = l.employee_id
         WHERE l.enabled = FALSE AND e.status = 'Active' AND LOWER(e.role) = 'employee'
           AND ${employeeMappingPredicate}
         ORDER BY l.employee_id`
    )).rows;
    console.log(`${apply ? "Activating" : "Preview: would activate"} ${targets.length} logins`);
    if (apply) {
        let done = 0;
        for (const { employee_id, username } of targets) {
            const hash = await bcrypt.hash(username, 10);
            const updated = await db.query(
                `UPDATE employee_logins
                 SET password_hash = $1, enabled = TRUE, must_change_password = TRUE,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE employee_id = $2 AND enabled = FALSE
                 RETURNING employee_id`,
                [hash, employee_id]
            );
            if (updated.rowCount !== 1) throw new Error(`Login activation did not match one row for ${employee_id}`);
            if (++done % 100 === 0) console.log(`  ${done}/${targets.length}`);
        }
        const unblocked = await db.query(
            `UPDATE employees e SET access_disabled = FALSE
             WHERE access_disabled = TRUE AND status = 'Active' AND LOWER(role) = 'employee'
               AND EXISTS (SELECT 1 FROM employee_logins l
                           WHERE l.employee_id = e.employee_id AND l.enabled = TRUE)
             RETURNING employee_id`
        );
        console.log(`Cleared access_disabled on ${unblocked.rowCount} employees`);
    }
    await db.query(apply ? "COMMIT" : "ROLLBACK");
    started = false;
    console.log(apply ? "Activation committed." : "Preview only; nothing was written. Re-run with --apply.");
} catch (error) {
    if (started) await db.query("ROLLBACK").catch(() => {});
    console.error("Activation failed:", error.message);
    process.exitCode = 1;
} finally {
    db.release();
    await pool.end();
}
