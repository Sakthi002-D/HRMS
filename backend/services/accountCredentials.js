import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

export const employeeMappingPredicate = `
    l.username = 'EMP' || l.personnel_number
    AND (SELECT count(*) FROM public.employee_d365_mapping m
         WHERE m.personnel_number = l.personnel_number AND m.link_status = 'linked') = 1
    AND (SELECT count(*) FROM public.employee_d365_mapping m
         WHERE m.employee_id = l.employee_id AND m.link_status = 'linked') = 1
    AND EXISTS (SELECT 1 FROM public.employee_d365_mapping m
                WHERE m.employee_id = l.employee_id AND m.personnel_number = l.personnel_number
                  AND m.link_status = 'linked')
`;

// Who may sign in: an employee linked to exactly one D365 worker (above), or an employee
// added in HRMS that is not in D365 yet, whose login is EMP<their HRMS employee ID>.
// Once the D365 create links them (same personnel number), the first rule applies.
export const employeeLoginPredicate = `(
    (${employeeMappingPredicate})
    OR (
        l.username = 'EMP' || l.personnel_number
        AND l.personnel_number = l.employee_id
        AND NOT EXISTS (SELECT 1 FROM public.employee_d365_mapping m WHERE m.employee_id = l.employee_id)
        AND NOT EXISTS (SELECT 1 FROM public.employee_d365_mapping m WHERE m.personnel_number = l.personnel_number)
    )
)`;

// Login for an employee HR adds in HRMS: username EMP<employee ID>, temporary password =
// username (same as the imported employees), changed after first sign-in.
// Returns null when the ID cannot be a login name (e.g. it already starts with EMP).
export async function createHrmsEmployeeLogin(db, employeeId) {
    const id = String(employeeId ?? "").trim();
    if (!/^[A-Za-z0-9-]+$/.test(id) || /^EMP/i.test(id)) return null;
    const username = `EMP${id}`;
    const result = await db.query(
        `INSERT INTO employee_logins
            (employee_id, personnel_number, username, normalized_username, password_hash,
             enabled, credential_version, must_change_password, provision_run_id)
         VALUES ($1, $1, $2, $3, $4, TRUE, 0, TRUE, 'hrms-add')
         ON CONFLICT DO NOTHING
         RETURNING username`,
        [id, username, username.toLowerCase(), await bcrypt.hash(username, 10)]
    );
    return result.rows[0]?.username || null;
}

// New employee IDs are plain numbers like the D365 personnel numbers (e.g. 9121), so the
// login is EMP<ID> (EMP9121) with the same text as the temporary password.
export async function nextEmployeeId(db) {
    const result = await db.query(
        `SELECT COALESCE(MAX(employee_id::bigint), 0) + 1 AS next
         FROM employees WHERE employee_id ~ '^[0-9]{1,15}$'`
    );
    return String(result.rows[0].next).padStart(4, "0");
}

// An ID that already starts with EMP would give the login EMPEMP...; the EMP is added for the login
export const EMP_PREFIX_MESSAGE = "Enter the employee ID without EMP (for example 9121); the login becomes EMP9121";
export const hasEmpPrefix = (employeeId) => /^EMP/i.test(String(employeeId ?? "").trim());

export async function buildInitialEmployeeCredential(personnelNumber) {
    if (typeof personnelNumber !== "string" || !/^[A-Za-z0-9-]+$/.test(personnelNumber)
        || /^EMP/i.test(personnelNumber)) {
        throw new TypeError("Invalid D365 Personnel Number");
    }
    const username = `EMP${personnelNumber}`;
    return {
        personnelNumber,
        username,
        normalizedUsername: username.toLowerCase(),
        // The initial password is random and never disclosed; employees gain access
        // through the OTP password-recovery flow once HR enables the login.
        passwordHash: await bcrypt.hash(randomBytes(32).toString("base64url"), 10),
    };
}

export const setAccountPassword = (db, { identityType, employeeId, passwordHash }) => {
    if (identityType === "employee") {
        return db.query(
            `UPDATE employee_logins
             SET password_hash = $1, credential_version = credential_version + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE employee_id = $2
             RETURNING employee_id`,
            [passwordHash, employeeId]
        );
    }
    if (identityType === "hr") {
        return db.query(
            `UPDATE employees
             SET password = $1, auth_credential_version = auth_credential_version + 1
             WHERE employee_id = $2 AND LOWER(role) = 'hr'
             RETURNING employee_id`,
            [passwordHash, employeeId]
        );
    }
    throw new TypeError("Unknown account identity type");
};
