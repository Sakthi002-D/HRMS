import bcrypt from "bcryptjs";
import { setAccountPassword, employeeMappingPredicate } from "./accountCredentials.js";
import { verifyToken } from "../middleware/auth.js";

export async function findPasswordIdentity(db, username, { lock = false } = {}) {
    const hr = await db.query(
        `SELECT employee_id, email, name FROM employees
         WHERE employee_id = $1 AND LOWER(role) = 'hr'
           AND status = 'Active' AND access_disabled IS NOT TRUE${lock ? " FOR UPDATE" : ""}`,
        [username]
    );
    if (hr.rows[0]) return { employee: hr.rows[0], credentialType: "hr" };
    if (!/^EMP[A-Za-z0-9-]+$/i.test(username)) return null;
    const result = await db.query(
        `SELECT e.employee_id, e.email, e.name, l.enabled
         FROM employee_logins l JOIN employees e ON e.employee_id = l.employee_id
         WHERE l.normalized_username = LOWER(BTRIM($1))
           AND l.enabled = TRUE AND e.status = 'Active' AND e.access_disabled IS NOT TRUE
           AND ${employeeMappingPredicate}${lock ? " FOR UPDATE OF e, l" : ""}`,
        [username]
    );
    return result.rows[0] ? { employee: result.rows[0], credentialType: "employee" } : null;
}

export const createResetPasswordHandler = (pool) => async (req, res) => {
    const username = String(req.body?.username ?? req.body?.employee_id ?? "").trim();
    const password = req.body?.new_password;
    if (!username || typeof password !== "string" || password.length < 6 || Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({ message: "Username and a password of at least 6 characters and at most 72 UTF-8 bytes are required" });
    }
    const grant = verifyToken(req.body?.reset_token);
    if (!grant || grant.purpose !== "password-reset" || !["employee", "hr"].includes(grant.typ)
        || !Number.isSafeInteger(grant.ver) || grant.ver <= 0) {
        return res.status(401).json({ message: "OTP verification required" });
    }
    let db;
    let started = false;
    try {
        const hash = await bcrypt.hash(password, 10);
        db = await pool.connect();
        await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        started = true;
        const resolved = await findPasswordIdentity(db, username, { lock: true });
        if (!resolved || grant.sub !== resolved.employee.employee_id || grant.typ !== resolved.credentialType) {
            await db.query("ROLLBACK");
            started = false;
            return res.status(401).json({ message: "OTP verification required" });
        }
        const result = await db.query(
            `SELECT id FROM password_resets
             WHERE employee_id = $1 AND credential_type = $2 AND verified = TRUE
               AND expires_at >= CURRENT_TIMESTAMP
             ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
            [grant.sub, grant.typ]
        );
        if (!result.rows[0] || String(result.rows[0].id) !== String(grant.ver)) {
            await db.query("ROLLBACK");
            started = false;
            return res.status(401).json({ message: "OTP verification required" });
        }
        const updated = await setAccountPassword(db, {
            identityType: grant.typ, employeeId: grant.sub, passwordHash: hash,
        });
        if (updated.rows.length !== 1) throw new Error("Password identity changed");
        const consumed = await db.query(
            "DELETE FROM password_resets WHERE employee_id = $1 AND credential_type = $2",
            [grant.sub, grant.typ]
        );
        if (consumed.rowCount < 1) throw new Error("Reset grant was not consumed");
        await db.query("COMMIT");
        started = false;
        return res.json({ message: "Password reset successfully" });
    } catch (error) {
        if (started) {
            try {
                await db.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Password reset rollback failed:", rollbackError.code || "ROLLBACK_FAILED");
            }
        }
        console.error("Password reset failed:", error.code || "PASSWORD_RESET_FAILED");
        return res.status(500).json({ message: "Failed to reset password" });
    } finally {
        if (db) db.release();
    }
};
