import pool from "../db.js";

/**
 * HR / Admin Tools - Authorized functions available strictly to users with role === 'hr'.
 */

// 1. Get Employee Listing
export async function getEmployees({ department, status = "Active", limit = 20 }) {
    let query = `
        SELECT 
            id,
            employee_id,
            name,
            department,
            designation,
            email,
            phone,
            status,
            joining_date,
            employment_type
        FROM employees
        WHERE 1=1
    `;
    const params = [];

    if (status && status.toLowerCase() !== "all") {
        params.push(status);
        query += ` AND LOWER(status) = LOWER($${params.length})`;
    }

    if (department && department.toLowerCase() !== "all") {
        params.push(department);
        query += ` AND LOWER(department) = LOWER($${params.length})`;
    }

    params.push(limit);
    query += ` ORDER BY id ASC LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    return {
        totalReturned: result.rows.length,
        employees: result.rows.map(r => ({
            employeeId: r.employee_id,
            name: r.name,
            department: r.department,
            designation: r.designation,
            email: r.email,
            phone: r.phone,
            status: r.status,
            joiningDate: r.joining_date ? new Date(r.joining_date).toISOString().slice(0, 10) : null,
            employmentType: r.employment_type
        }))
    };
}

// 2. Get Single Employee Details
export async function getEmployeeDetails({ employeeId }) {
    if (!employeeId) throw new Error("Employee ID is required");

    const query = `
        SELECT 
            e.id,
            e.employee_id,
            e.name,
            e.department,
            e.designation,
            e.email,
            e.phone,
            e.status,
            e.joining_date,
            e.date_of_birth,
            e.gender,
            e.address,
            e.employment_type,
            e.emergency_contact,
            e.role,
            COALESCE((SELECT row_to_json(b) FROM employee_bank_details b WHERE b.employee_id = e.employee_id ORDER BY b.id DESC LIMIT 1), '{}'::json) AS bank,
            COALESCE((SELECT row_to_json(ed) FROM employee_education ed WHERE ed.employee_id = e.employee_id ORDER BY ed.id DESC LIMIT 1), '{}'::json) AS education,
            COALESCE((SELECT row_to_json(ex) FROM employee_experience ex WHERE ex.employee_id = e.id ORDER BY ex.id DESC LIMIT 1), '{}'::json) AS experience
        FROM employees e
        WHERE e.employee_id = $1
    `;

    const result = await pool.query(query, [employeeId]);
    if (result.rows.length === 0) {
        return { error: `Employee not found with ID ${employeeId}` };
    }

    return result.rows[0];
}

// 3. Get Employee Count & Department Breakdown
export async function getEmployeeCount({ department } = {}) {
    if (department) {
        const res = await pool.query(
            `SELECT COUNT(*)::int AS count FROM employees WHERE LOWER(department) = LOWER($1) AND status = 'Active'`,
            [department]
        );
        return {
            department,
            activeCount: res.rows[0].count
        };
    }

    const totalRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM employees WHERE status = 'Active'`
    );

    const deptRes = await pool.query(`
        SELECT department, COUNT(*)::int AS count
        FROM employees
        WHERE status = 'Active' AND department IS NOT NULL AND TRIM(department) <> ''
        GROUP BY department
        ORDER BY count DESC
    `);

    return {
        totalActiveEmployees: totalRes.rows[0].total,
        departmentBreakdown: deptRes.rows
    };
}

// 4. Get Attendance Overview (Present, Late, Absent for given date)
export async function getAttendanceOverview({ date } = {}) {
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const countsRes = await pool.query(`
        SELECT 
            COUNT(DISTINCT CASE WHEN LOWER(a.status) IN ('present', 'late') THEN a.employee_id END)::int AS present_count,
            COUNT(DISTINCT CASE WHEN LOWER(a.status) = 'late' THEN a.employee_id END)::int AS late_count
        FROM attendance a
        WHERE a.attendance_date = $1
    `, [targetDate]);

    const totalActiveRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM employees WHERE status = 'Active'`
    );
    const totalActive = totalActiveRes.rows[0].total;
    const presentCount = countsRes.rows[0].present_count;
    const lateCount = countsRes.rows[0].late_count;
    const absentCount = Math.max(0, totalActive - presentCount);

    // Get list of absent employees
    const absentEmployeesRes = await pool.query(`
        SELECT e.employee_id, e.name, e.department
        FROM employees e
        WHERE e.status = 'Active'
          AND e.employee_id NOT IN (
              SELECT DISTINCT a.employee_id 
              FROM attendance a 
              WHERE a.attendance_date = $1 AND LOWER(a.status) IN ('present', 'late')
          )
        ORDER BY e.name ASC
        LIMIT 15
    `, [targetDate]);

    return {
        date: targetDate,
        totalActiveEmployees: totalActive,
        presentToday: presentCount,
        lateToday: lateCount,
        absentToday: absentCount,
        absentEmployeesSample: absentEmployeesRes.rows
    };
}

// 5. Get Leave Requests Across Company
export async function getLeaveRequests({ status = "Pending", limit = 15 }) {
    let query = `
        SELECT 
            l.id,
            l.employee_id,
            e.name AS employee_name,
            e.department,
            l.leave_type,
            l.from_date,
            l.to_date,
            l.days,
            l.reason,
            l.status,
            l.created_at
        FROM leaves l
        LEFT JOIN employees e ON l.employee_id = e.employee_id
        WHERE 1=1
    `;
    const params = [];

    if (status && status.toLowerCase() !== "all") {
        params.push(status);
        query += ` AND LOWER(l.status) = LOWER($${params.length})`;
    }

    params.push(limit);
    query += ` ORDER BY l.id DESC LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    return {
        filterStatus: status,
        totalReturned: result.rows.length,
        leaves: result.rows.map(row => ({
            id: row.id,
            employeeId: row.employee_id,
            employeeName: row.employee_name || "Unknown",
            department: row.department || "-",
            leaveType: row.leave_type,
            fromDate: row.from_date ? new Date(row.from_date).toISOString().slice(0, 10) : null,
            toDate: row.to_date ? new Date(row.to_date).toISOString().slice(0, 10) : null,
            days: row.days,
            reason: row.reason || "None",
            status: row.status,
            appliedAt: row.created_at
        }))
    };
}

// 6. Prepare Approve or Reject Leave (Requires Confirmation)
export async function prepareLeaveStatusChange({ leaveId, action }) {
    if (!leaveId || !action) {
        return { error: "Both leaveId and action ('Approve' or 'Reject') are required." };
    }

    const normalizedAction = action.trim().toLowerCase() === "approve" ? "Approved" : "Rejected";

    const leaveRes = await pool.query(`
        SELECT l.id, l.employee_id, e.name AS employee_name, l.leave_type, l.from_date, l.to_date, l.days, l.status
        FROM leaves l
        LEFT JOIN employees e ON l.employee_id = e.employee_id
        WHERE l.id = $1
    `, [leaveId]);

    if (leaveRes.rows.length === 0) {
        return { error: `Leave request #${leaveId} does not exist.` };
    }

    const leave = leaveRes.rows[0];
    if (leave.status !== "Pending") {
        return { error: `Leave request #${leaveId} is already marked as '${leave.status}'. Only 'Pending' requests can be approved or rejected.` };
    }

    const fromDateStr = leave.from_date ? new Date(leave.from_date).toISOString().slice(0, 10) : "";
    const toDateStr = leave.to_date ? new Date(leave.to_date).toISOString().slice(0, 10) : "";

    return {
        requiresConfirmation: true,
        actionType: "UPDATE_LEAVE_STATUS",
        title: `Confirm Leave ${normalizedAction}`,
        summary: `${normalizedAction} ${leave.leave_type} request (#${leave.id}) for ${leave.employee_name || leave.employee_id} (${leave.days} days: ${fromDateStr} to ${toDateStr})`,
        payload: {
            leaveId: leave.id,
            newStatus: normalizedAction,
            employeeName: leave.employee_name || leave.employee_id
        }
    };
}

// 7. Execute Confirmed Leave Status Change
export async function executeLeaveStatusChange({ leaveId, newStatus }) {
    const updateRes = await pool.query(`
        UPDATE leaves
        SET status = $1
        WHERE id = $2 AND status = 'Pending'
        RETURNING id, employee_id, status
    `, [newStatus, leaveId]);

    if (updateRes.rows.length === 0) {
        return {
            success: false,
            message: `Could not update leave request #${leaveId}. It may have already been reviewed.`
        };
    }

    return {
        success: true,
        message: `Leave request #${leaveId} has been successfully ${newStatus.toLowerCase()}.`
    };
}

// 8. Get Active Job Postings
export async function getJobOpenings() {
    try {
        const result = await pool.query(`
            SELECT job_id, title, department, openings, experience, location, status
            FROM public.jobs
            WHERE LOWER(status) IN ('open', 'active')
            ORDER BY id DESC
        `);

        return {
            totalOpenings: result.rows.reduce((sum, r) => sum + (Number(r.openings) || 1), 0),
            jobs: result.rows
        };
    } catch (err) {
        return { error: "Job postings table not accessible: " + err.message };
    }
}

// 9. Get New Joiners
export async function getNewJoiners() {
    const result = await pool.query(`
        SELECT employee_id, name, department, designation, joining_date
        FROM employees
        WHERE status = 'Active'
          AND joining_date >= DATE_TRUNC('month', CURRENT_DATE)
          AND joining_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
        ORDER BY joining_date DESC
    `);

    return {
        count: result.rows.length,
        newJoiners: result.rows.map(r => ({
            employeeId: r.employee_id,
            name: r.name,
            department: r.department,
            designation: r.designation,
            joiningDate: r.joining_date ? new Date(r.joining_date).toISOString().slice(0, 10) : null
        }))
    };
}

// 10. Get Payroll Overview
export async function getPayrollOverview({ employeeId, limit = 10 } = {}) {
    let query = `
        SELECT 
            p.payroll_id,
            p.employee_id,
            e.name AS employee_name,
            e.department,
            p.basic_salary,
            p.allowances,
            p.deductions,
            p.net_salary,
            p.status,
            p.salary_month
        FROM employee_payroll p
        LEFT JOIN employees e ON p.employee_id = e.employee_id
        WHERE 1=1
    `;
    const params = [];

    if (employeeId) {
        params.push(employeeId);
        query += ` AND p.employee_id = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY p.salary_month DESC NULLS LAST LIMIT $${params.length}`;

    try {
        const result = await pool.query(query, params);
        return {
            totalRecords: result.rows.length,
            records: result.rows.map(r => ({
                payrollId: r.payroll_id,
                employeeId: r.employee_id,
                employeeName: r.employee_name,
                department: r.department,
                basicSalary: r.basic_salary,
                allowances: r.allowances,
                deductions: r.deductions,
                netSalary: r.net_salary,
                status: r.status,
                salaryMonth: r.salary_month ? new Date(r.salary_month).toISOString().slice(0, 7) : null
            }))
        };
    } catch (err) {
        return { error: "Unable to retrieve payroll records: " + err.message };
    }
}

