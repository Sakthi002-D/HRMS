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
        passwordHash: await bcrypt.hash(username, 10),
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
