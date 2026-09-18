import pool from "../db.js";

/**
 * HR / Admin Tools - Authorized functions available strictly to users with role === 'hr'.
 * Provides company-wide read and administrative write preparation for HR managers.
 */

// 1. Get Employee Listing
export async function getEmployees({ department, status = "Active", limit = 20 } = {}) {
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
            e.passport_no,
            e.passport_exp_date,
            e.nationality,
            e.marital_status,
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

    const emp = result.rows[0];
    return {
        employeeId: emp.employee_id,
        name: emp.name,
        department: emp.department,
        designation: emp.designation,
        email: emp.email,
        phone: emp.phone,
        status: emp.status,
        role: emp.role,
        joiningDate: emp.joining_date ? new Date(emp.joining_date).toISOString().slice(0, 10) : null,
        dateOfBirth: emp.date_of_birth ? new Date(emp.date_of_birth).toISOString().slice(0, 10) : null,
        gender: emp.gender,
        address: emp.address,
        employmentType: emp.employment_type,
        emergencyContact: emp.emergency_contact,
        nationality: emp.nationality,
        maritalStatus: emp.marital_status,
        passportNumber: emp.passport_no || "None",
        passportExpiryDate: emp.passport_exp_date ? new Date(emp.passport_exp_date).toISOString().slice(0, 10) : "None",
        bank: emp.bank?.bank_name ? { bankName: emp.bank.bank_name, accountType: emp.bank.account_type } : null,
        education: emp.education?.qualification ? { qualification: emp.education.qualification, institution: emp.education.institution } : null
    };
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

    // Sample list of absent employees
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

// 5. Get Attendance Details for a Specific Employee
export async function getEmployeeAttendanceDetails({ employeeId, limit = 15 }) {
    if (!employeeId) throw new Error("Employee ID is required");

    const [summaryRes, recordsRes] = await Promise.all([
        pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) IN ('present', 'on time') AND COALESCE(late_minutes, 0) = 0) AS on_time,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'late' OR COALESCE(late_minutes, 0) > 0) AS late_attendance,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) IN ('work from home', 'wfh')) AS work_from_home,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'absent') AS absent,
                COUNT(*) AS total_recorded_days,
                COALESCE(SUM(late_minutes), 0) AS total_late_minutes
            FROM attendance
            WHERE employee_id = $1
        `, [employeeId]),
        pool.query(`
            SELECT id, attendance_date, punch_in, punch_out, status, late_minutes, shift, project
            FROM attendance
            WHERE employee_id = $1
            ORDER BY attendance_date DESC, id DESC
            LIMIT $2
        `, [employeeId, limit])
    ]);

    return {
        employeeId,
        summary: summaryRes.rows[0],
        recentRecords: recordsRes.rows.map(r => ({
            date: r.attendance_date ? new Date(r.attendance_date).toISOString().slice(0, 10) : null,
            status: r.status,
            punchIn: r.punch_in,
            punchOut: r.punch_out,
            lateMinutes: r.late_minutes || 0,
            shift: r.shift,
            project: r.project
        }))
    };
}

// 6. Get Leave Requests Across Company
export async function getLeaveRequests({ status = "Pending", limit = 15 } = {}) {
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
            appliedAt: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : null
        }))
    };
}

// 7. Prepare Approve or Reject Leave (Requires Confirmation)
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

// 8. Execute Confirmed Leave Status Change
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

// 9. Get Active Job Postings
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

// 10. Get New Joiners
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

// 11. Get Payroll Overview (Company-Wide or Specific Employee)
export async function getPayrollOverview({ employeeId, limit = 15 } = {}) {
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
    query += ` ORDER BY p.salary_month DESC NULLS LAST, p.payroll_id DESC LIMIT $${params.length}`;

    try {
        const result = await pool.query(query, params);
        return {
            totalRecords: result.rows.length,
            records: result.rows.map(r => ({
                payrollId: r.payroll_id,
                employeeId: r.employee_id,
                employeeName: r.employee_name,
                department: r.department,
                basicSalary: Number(r.basic_salary) || 0,
                allowances: Number(r.allowances) || 0,
                deductions: Number(r.deductions) || 0,
                netSalary: Number(r.net_salary) || 0,
                status: r.status,
                salaryMonth: r.salary_month ? new Date(r.salary_month).toISOString().slice(0, 7) : null
            }))
        };
    } catch (err) {
        return { error: "Unable to retrieve payroll records: " + err.message };
    }
}

// 12. Get Company-Wide Employee Requests (NOC, Letters, etc.)
export async function getCompanyEmployeeRequests({ status = "all", employeeId, limit = 15 } = {}) {
    let query = `
        SELECT 
            r.id,
            r.employee_id,
            e.name AS employee_name,
            e.department,
            r.request_type,
            r.details,
            r.status,
            r.hr_response,
            r.created_at,
            r.updated_at
        FROM employee_requests r
        LEFT JOIN employees e ON e.employee_id = r.employee_id
        WHERE 1=1
    `;
    const params = [];

    if (status && status.toLowerCase() !== "all") {
        params.push(status);
        query += ` AND LOWER(r.status) = LOWER($${params.length})`;
    }

    if (employeeId) {
        params.push(employeeId);
        query += ` AND r.employee_id = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY r.created_at DESC, r.id DESC LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    return {
        filterStatus: status,
        totalReturned: result.rows.length,
        requests: result.rows.map(r => ({
            requestId: r.id,
            employeeId: r.employee_id,
            employeeName: r.employee_name || "Unknown",
            department: r.department || "-",
            requestType: r.request_type,
            details: r.details,
            status: r.status,
            hrResponse: r.hr_response || "None",
            submittedAt: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : null
        }))
    };
}

// 13. Prepare Employee Request Status Change (NOC/Letter approval)
export async function prepareEmployeeRequestStatusChange({ requestId, action, hrResponse = "" }) {
    if (!requestId || !action) {
        return { error: "Both requestId and action ('Approve' or 'Reject') are required." };
    }

    const normalizedAction = action.trim().toLowerCase() === "approve" ? "Approved" : "Rejected";

    const checkRes = await pool.query(`
        SELECT r.id, r.employee_id, e.name AS employee_name, r.request_type, r.status
        FROM employee_requests r
        LEFT JOIN employees e ON e.employee_id = r.employee_id
        WHERE r.id = $1
    `, [requestId]);

    if (checkRes.rows.length === 0) {
        return { error: `Employee request #${requestId} does not exist.` };
    }

    const req = checkRes.rows[0];
    if (req.status !== "Pending") {
        return { error: `Employee request #${requestId} is already marked as '${req.status}'.` };
    }

    return {
        requiresConfirmation: true,
        actionType: "UPDATE_EMPLOYEE_REQUEST_STATUS",
        title: `Confirm Request ${normalizedAction}`,
        summary: `${normalizedAction} ${req.request_type} request (#${req.id}) for ${req.employee_name || req.employee_id}`,
        payload: {
            requestId: req.id,
            newStatus: normalizedAction,
            hrResponse: (hrResponse || "").trim(),
            employeeName: req.employee_name || req.employee_id
        }
    };
}

// 14. Execute Confirmed Employee Request Status Change
export async function executeEmployeeRequestStatusChange({ requestId, newStatus, hrResponse }) {
    const updateRes = await pool.query(`
        UPDATE employee_requests
        SET status = $1, hr_response = $2, updated_at = NOW()
        WHERE id = $3 AND status = 'Pending'
        RETURNING id, employee_id, request_type, status, hr_response
    `, [newStatus, hrResponse || `Request ${newStatus.toLowerCase()} by HR`, requestId]);

    if (updateRes.rows.length === 0) {
        return { success: false, message: `Could not update request #${requestId}. It may have already been reviewed.` };
    }

    return {
        success: true,
        message: `Request #${requestId} has been successfully ${newStatus.toLowerCase()}.`,
        request: updateRes.rows[0]
    };
}

// 15. Get Employee Documents Admin View
export async function getEmployeeDocumentsAdmin({ employeeId }) {
    if (!employeeId) throw new Error("Employee ID is required");

    const res = await pool.query(`
        SELECT employee_id, name, department, designation, passport_no, passport_exp_date,
               employment_contract_url, offer_letter_url, visa_copy_url, qid_copy_url, passport_copy_url
        FROM employees WHERE employee_id = $1
    `, [employeeId]);

    if (res.rows.length === 0) return { error: `Employee not found with ID ${employeeId}` };

    const emp = res.rows[0];
    const expDate = emp.passport_exp_date ? new Date(emp.passport_exp_date) : null;

    return {
        employeeId: emp.employee_id,
        name: emp.name,
        department: emp.department,
        designation: emp.designation,
        passportNumber: emp.passport_no || "None",
        passportExpiryDate: expDate ? expDate.toISOString().slice(0, 10) : "None",
        documentsUploaded: {
            employmentContract: Boolean(emp.employment_contract_url),
            offerLetter: Boolean(emp.offer_letter_url),
            visaCopy: Boolean(emp.visa_copy_url),
            qidCopy: Boolean(emp.qid_copy_url),
            passportCopy: Boolean(emp.passport_copy_url)
        }
    };
}
