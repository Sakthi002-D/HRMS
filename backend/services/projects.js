// Projects: the project master and employee assignments (project_assignments).
// Status is free text, matching the existing Projects section.

export const PROJECT_STATUS_SUGGESTIONS = ["Active", "Completed", "On Hold"];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (value) => DATE_PATTERN.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
const text = (value) => String(value ?? "").trim();

// "" or missing -> null; a valid YYYY-MM-DD -> itself; anything else -> undefined (invalid)
const optionalDate = (value) => {
    const date = text(value);
    if (!date) return null;
    return isDate(date) ? date : undefined;
};

export const validateProject = (input) => {
    const name = text(input?.name);
    const status = text(input?.status) || "Active";
    const startDate = optionalDate(input?.start_date);
    const endDate = optionalDate(input?.end_date);

    if (!name || name.length > 120) return { error: "Project name is required (up to 120 characters)" };
    if (status.length > 40) return { error: "Status can be up to 40 characters" };
    if (startDate === undefined || endDate === undefined) return { error: "Dates must be YYYY-MM-DD" };
    if (startDate && endDate && endDate < startDate) return { error: "End date must be on or after the start date" };

    return {
        project: {
            name,
            description: text(input?.description) || null,
            client: text(input?.client) || null,
            start_date: startDate,
            end_date: endDate,
            status,
        },
    };
};

export const validateProjectAssignment = (input) => {
    const employeeId = text(input?.employee_id);
    const role = text(input?.role);
    const assignedFrom = optionalDate(input?.assigned_from);
    const assignedTo = optionalDate(input?.assigned_to);

    if (!employeeId) return { error: "Choose an employee" };
    if (role.length > 80) return { error: "Role can be up to 80 characters" };
    if (!assignedFrom) return { error: "Assigned from must be a date (YYYY-MM-DD)" };
    if (assignedTo === undefined) return { error: "Assigned to must be a date (YYYY-MM-DD)" };
    if (assignedTo && assignedTo < assignedFrom) return { error: "Assigned to must be on or after assigned from" };

    return { assignment: { employee_id: employeeId, role: role || null, assigned_from: assignedFrom, assigned_to: assignedTo } };
};

const PROJECT_COLUMNS = `p.id, p.name, p.description, p.client, p.status,
    TO_CHAR(p.start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(p.end_date, 'YYYY-MM-DD') AS end_date`;
const ASSIGNMENT_DATES = `TO_CHAR(pa.assigned_from, 'YYYY-MM-DD') AS assigned_from, TO_CHAR(pa.assigned_to, 'YYYY-MM-DD') AS assigned_to`;
const COMPANY_TODAY = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Qatar')::date";

export const listProjects = async (db) => (await db.query(
    `SELECT ${PROJECT_COLUMNS},
            (SELECT COUNT(DISTINCT pa.employee_id)::int FROM project_assignments pa
             WHERE pa.project_id = p.id AND (pa.assigned_to IS NULL OR pa.assigned_to >= ${COMPANY_TODAY})) AS active_members
     FROM projects p
     ORDER BY p.created_at DESC, p.id DESC`
)).rows;

export const listProjectAssignments = async (db, projectId) => (await db.query(
    `SELECT pa.id, pa.employee_id, pa.role, ${ASSIGNMENT_DATES},
            e.name AS employee_name, e.department, e.designation
     FROM project_assignments pa
     JOIN employees e ON e.employee_id = pa.employee_id
     WHERE pa.project_id = $1
     ORDER BY (pa.assigned_to IS NULL OR pa.assigned_to >= ${COMPANY_TODAY}) DESC, e.name, pa.assigned_from DESC`,
    [projectId]
)).rows;

export const listEmployeeProjects = async (db, employeeId) => (await db.query(
    `SELECT pa.id, pa.role, ${ASSIGNMENT_DATES},
            p.id AS project_id, p.name, p.client, p.status, p.description
     FROM project_assignments pa
     JOIN projects p ON p.id = pa.project_id
     WHERE pa.employee_id = $1
     ORDER BY (pa.assigned_to IS NULL OR pa.assigned_to >= ${COMPANY_TODAY}) DESC, pa.assigned_from DESC`,
    [employeeId]
)).rows;

// Maps database errors to a status and message the HR page can show
export const projectDbError = (error) => {
    if (error?.code === "23505") {
        return error.constraint?.includes("name")
            ? [409, "A project with this name already exists"]
            : [409, "This employee is already on this project from that date"];
    }
    if (error?.code === "23503") return [400, "Employee or project not found"];
    if (error?.code === "23514") return [400, "End date must be on or after the start date"];
    return null;
};
