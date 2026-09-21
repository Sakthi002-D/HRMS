import pool from "../db.js";

/**
 * Employee Tools - Authorized functions strictly scoped to the authenticated employee.
 * All employee queries enforce employeeId === authUser.employee_id.
 */

// 1. Get Employee Profile
export async function getMyProfile({ employeeId }) {
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
            e.children_count,
            COALESCE((SELECT row_to_json(b) FROM employee_bank_details b WHERE b.employee_id = e.employee_id ORDER BY b.id DESC LIMIT 1), '{}'::json) AS bank,
            COALESCE((SELECT row_to_json(ed) FROM employee_education ed WHERE ed.employee_id = e.employee_id ORDER BY ed.id DESC LIMIT 1), '{}'::json) AS education,
            COALESCE((SELECT row_to_json(ex) FROM employee_experience ex WHERE ex.employee_id = e.id ORDER BY ex.id DESC LIMIT 1), '{}'::json) AS experience
        FROM employees e
        WHERE e.employee_id = $1
    `;

    const result = await pool.query(query, [employeeId]);
    if (result.rows.length === 0) {
        return { error: `Employee record not found for ID ${employeeId}` };
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
        joiningDate: emp.joining_date ? new Date(emp.joining_date).toISOString().slice(0, 10) : null,
        dateOfBirth: emp.date_of_birth ? new Date(emp.date_of_birth).toISOString().slice(0, 10) : null,
        gender: emp.gender,
        address: emp.address,
        employmentType: emp.employment_type,
        emergencyContact: emp.emergency_contact,
        nationality: emp.nationality,
        maritalStatus: emp.marital_status,
        passportNumber: emp.passport_no || "Not recorded",
        passportExpiryDate: emp.passport_exp_date ? new Date(emp.passport_exp_date).toISOString().slice(0, 10) : null,
        bank: emp.bank?.bank_name ? { bankName: emp.bank.bank_name, accountType: emp.bank.account_type } : null,
        education: emp.education?.qualification ? { qualification: emp.education.qualification, institution: emp.education.institution } : null
    };
}

// 2. Get Employee Leave Balance & Stats
export async function getMyLeaveBalance({ employeeId }) {
    if (!employeeId) throw new Error("Employee ID is required");

    const employeeRes = await pool.query(`
        SELECT joining_date
        FROM employees
        WHERE employee_id = $1
    `, [employeeId]);

    const leavesRes = await pool.query(`
        SELECT id, leave_type, from_date, to_date, days, status
        FROM leaves
        WHERE employee_id = $1
    `, [employeeId]);

    const leaves = leavesRes.rows;
    const joiningDateValue = employeeRes.rows[0]?.joining_date;
    const joiningDate = joiningDateValue
        ? new Date(`${String(joiningDateValue).slice(0, 10)}T00:00:00`)
        : null;
    const asOfDate = new Date();
    const serviceMonths = joiningDate
        ? Math.max(0, (asOfDate.getFullYear() - joiningDate.getFullYear()) * 12 + asOfDate.getMonth() - joiningDate.getMonth() - (asOfDate.getDate() < joiningDate.getDate() ? 1 : 0))
        : 0;
    const monthlyAccrual = Math.floor(serviceMonths / 12) >= 5 ? 28 / 12 : 1.75;
    const totalEntitlement = Number((serviceMonths * monthlyAccrual).toFixed(2));
    const approvedAnnualLeaveDays = leaves
        .filter(l => (l.status || "").toLowerCase() === "approved" && l.leave_type === "Annual Leave")
        .reduce((sum, l) => sum + (Number(l.days) || 0), 0);
    const approvedLeaveDays = leaves
        .filter(l => (l.status || "").toLowerCase() === "approved")
        .reduce((sum, l) => sum + (Number(l.days) || 0), 0);

    const pendingRequests = leaves.filter(l => (l.status || "").toLowerCase() === "pending").length;
    const approvedRequests = leaves.filter(l => (l.status || "").toLowerCase() === "approved").length;
    const rejectedRequests = leaves.filter(l => (l.status || "").toLowerCase() === "rejected").length;
    const remainingBalance = Math.max(totalEntitlement - approvedAnnualLeaveDays, 0);

    return {
        employeeId,
        totalEntitlementDays: totalEntitlement,
        approvedLeaveDays,
        annualLeaveEntitlementDays: totalEntitlement,
        approvedAnnualLeaveDays,
        remainingBalanceDays: remainingBalance,
        pendingRequestsCount: pendingRequests,
        approvedRequestsCount: approvedRequests,
        rejectedRequestsCount: rejectedRequests,
        totalRequestsCount: leaves.length
    };
}

// 3. Get Employee Leave Requests
export async function getMyLeaveRequests({ employeeId, status, limit = 10 }) {
    if (!employeeId) throw new Error("Employee ID is required");

    let query = `
        SELECT id, leave_type, from_date, to_date, days, reason, status, created_at
        FROM leaves
        WHERE employee_id = $1
    `;
    const params = [employeeId];

    if (status && status.toLowerCase() !== "all") {
        query += ` AND LOWER(status) = $2`;
        params.push(status.toLowerCase());
    }

    query += ` ORDER BY id DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return {
        employeeId,
        filterStatus: status || "all",
        total: result.rows.length,
        leaves: result.rows.map(row => ({
            id: row.id,
            leaveType: row.leave_type,
            fromDate: row.from_date ? new Date(row.from_date).toISOString().slice(0, 10) : null,
            toDate: row.to_date ? new Date(row.to_date).toISOString().slice(0, 10) : null,
            days: row.days,
            reason: row.reason || "Not specified",
            status: row.status,
            appliedAt: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : null
        }))
    };
}

// 4. Get Employee Attendance Records
export async function getMyAttendance({ employeeId, limit = 10 }) {
    if (!employeeId) throw new Error("Employee ID is required");

    const query = `
        SELECT 
            id,
            attendance_date,
            punch_in,
            punch_out,
            status,
            late_minutes,
            shift,
            project
        FROM attendance
        WHERE employee_id = $1
        ORDER BY attendance_date DESC, id DESC
        LIMIT $2
    `;

    const result = await pool.query(query, [employeeId, limit]);
    return {
        employeeId,
        recordsCount: result.rows.length,
        attendance: result.rows.map(row => ({
            date: row.attendance_date ? new Date(row.attendance_date).toISOString().slice(0, 10) : null,
            status: row.status,
            punchIn: row.punch_in,
            punchOut: row.punch_out,
            lateMinutes: row.late_minutes || 0,
            shift: row.shift,
            project: row.project
        }))
    };
}

// 5. Get Employee Attendance Summary (On time, Late, WFH, Absent, Total Days)
export async function getMyAttendanceSummary({ employeeId }) {
    if (!employeeId) throw new Error("Employee ID is required");

    const result = await pool.query(`
        SELECT
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(status, '')) IN ('present', 'on time')
                  AND COALESCE(late_minutes, 0) = 0
            ) AS on_time,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(status, '')) = 'late'
                   OR COALESCE(late_minutes, 0) > 0
            ) AS late_attendance,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(status, '')) IN ('work from home', 'wfh')
            ) AS work_from_home,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(status, '')) = 'absent'
            ) AS absent,
            COUNT(*) AS total_recorded_days,
            COALESCE(SUM(late_minutes), 0) AS total_late_minutes
        FROM attendance
        WHERE employee_id = $1
    `, [employeeId]);

    const row = result.rows[0];
    return {
        employeeId,
        onTimeDays: Number(row.on_time) || 0,
        lateDays: Number(row.late_attendance) || 0,
        workFromHomeDays: Number(row.work_from_home) || 0,
        absentDays: Number(row.absent) || 0,
        totalRecordedDays: Number(row.total_recorded_days) || 0,
        totalLateMinutes: Number(row.total_late_minutes) || 0
    };
}

// 6. Get Employee Payroll & Payslip Details
export async function getMyPayroll({ employeeId, limit = 6 }) {
    if (!employeeId) throw new Error("Employee ID is required");

    const query = `
        SELECT 
            s.payroll_id AS id,
            s.employee_id,
            e.name AS employee_name,
            s.salary_month,
            s.basic_salary,
            s.allowances,
            s.deductions,
            s.net_salary,
            s.status,
            CASE WHEN LOWER(COALESCE(s.status, '')) = 'processed' THEN 'Transferred' ELSE 'Pending' END AS transfer_status,
            s.created_at
        FROM employee_payroll s
        JOIN employees e ON e.employee_id = s.employee_id
        WHERE s.employee_id = $1
        ORDER BY s.salary_month DESC NULLS LAST, s.payroll_id DESC
        LIMIT $2
    `;

    const result = await pool.query(query, [employeeId, limit]);
    if (result.rows.length === 0) {
        return {
            employeeId,
            message: "No payroll records or payslips have been generated yet for your account. Please check back later or contact HR.",
            recordsCount: 0,
            latestPayslip: null,
            history: []
        };
    }

    const latest = result.rows[0];
    return {
        employeeId,
        recordsCount: result.rows.length,
        latestPayslip: {
            salaryMonth: latest.salary_month ? new Date(latest.salary_month).toISOString().slice(0, 7) : "Current",
            basicSalary: Number(latest.basic_salary) || 0,
            allowances: Number(latest.allowances) || 0,
            deductions: Number(latest.deductions) || 0,
            netSalary: Number(latest.net_salary) || 0,
            paymentStatus: latest.status,
            transferStatus: latest.transfer_status
        },
        history: result.rows.map(r => ({
            payrollId: r.id,
            salaryMonth: r.salary_month ? new Date(r.salary_month).toISOString().slice(0, 7) : null,
            basicSalary: Number(r.basic_salary) || 0,
            allowances: Number(r.allowances) || 0,
            deductions: Number(r.deductions) || 0,
            netSalary: Number(r.net_salary) || 0,
            status: r.status,
            transferStatus: r.transfer_status
        }))
    };
}

// 7. Get Employee Uploaded Documents and Expiry Status
export async function getMyDocuments({ employeeId }) {
    if (!employeeId) throw new Error("Employee ID is required");

    const result = await pool.query(`
        SELECT 
            employee_id,
            name,
            passport_no,
            passport_exp_date,
            employment_contract_url,
            offer_letter_url,
            visa_copy_url,
            qid_copy_url,
            passport_copy_url
        FROM employees
        WHERE employee_id = $1
    `, [employeeId]);

    if (result.rows.length === 0) {
        return { error: `Employee record not found for ID ${employeeId}` };
    }

    const emp = result.rows[0];
    const expDate = emp.passport_exp_date ? new Date(emp.passport_exp_date) : null;
    let isExpiringSoon = false;
    let daysUntilExpiry = null;

    if (expDate) {
        const today = new Date();
        const diffTime = expDate - today;
        daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        isExpiringSoon = daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
    }

    return {
        employeeId,
        passportNumber: emp.passport_no || "Not recorded",
        passportExpiryDate: expDate ? expDate.toISOString().slice(0, 10) : "Not recorded",
        daysUntilPassportExpiry: daysUntilExpiry,
        passportExpiringSoon: isExpiringSoon,
        documents: {
            employmentContract: Boolean(emp.employment_contract_url),
            offerLetter: Boolean(emp.offer_letter_url),
            visaCopy: Boolean(emp.visa_copy_url),
            qidCopy: Boolean(emp.qid_copy_url),
            passportCopy: Boolean(emp.passport_copy_url)
        }
    };
}

// 8. Get Employee Requests (NOC, Letters, etc.)
export async function getMyRequests({ employeeId, status, limit = 10 }) {
    if (!employeeId) throw new Error("Employee ID is required");

    let query = `
        SELECT id, employee_id, request_type, details, status, hr_response, created_at, updated_at
        FROM employee_requests
        WHERE employee_id = $1
    `;
    const params = [employeeId];

    if (status && status.toLowerCase() !== "all") {
        query += ` AND LOWER(status) = LOWER($2)`;
        params.push(status.toLowerCase());
    }

    query += ` ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return {
        employeeId,
        filterStatus: status || "all",
        totalRequests: result.rows.length,
        requests: result.rows.map(r => ({
            requestId: r.id,
            requestType: r.request_type,
            details: r.details,
            status: r.status,
            hrResponse: r.hr_response || "Awaiting HR review",
            submittedAt: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : null,
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 10) : null
        }))
    };
}

// 9. Prepare Submit Request (e.g. NOC, Letter)
export async function prepareSubmitRequest({ employeeId, requestType, reason = "" }) {
    if (!employeeId || !requestType) {
        return { error: "Employee ID and requestType (e.g., 'NOC Request', 'Experience Letter', 'Salary Certificate') are required." };
    }

    return {
        requiresConfirmation: true,
        actionType: "SUBMIT_REQUEST",
        title: "Confirm Request Submission",
        summary: `Submit a new ${requestType} request to HR`,
        payload: {
            employeeId,
            requestType,
            reason: (reason || "").trim()
        }
    };
}

// 10. Execute Confirmed Submit Request
export async function executeSubmitRequest({ employeeId, requestType, reason }) {
    const details = reason ? { reason } : {};
    const insertQuery = `
        INSERT INTO employee_requests (employee_id, request_type, details, status, created_at, updated_at)
        VALUES ($1, $2, $3::jsonb, 'Pending', NOW(), NOW())
        RETURNING id, employee_id, request_type, details, status, created_at
    `;

    const result = await pool.query(insertQuery, [employeeId, requestType, JSON.stringify(details)]);
    const newReq = result.rows[0];
    return {
        success: true,
        message: `Your ${requestType} request (#${newReq.id}) has been submitted successfully to HR. Current status is 'Pending'.`,
        request: newReq
    };
}

// 11. Get Employee Notifications
export async function getMyNotifications({ employeeId }) {
    if (!employeeId) throw new Error("Employee ID is required");

    const [leaveResult, payrollResult, documentResult, requestResult] = await Promise.all([
        pool.query(
            `SELECT id, leave_type, status, days, created_at 
             FROM leaves 
             WHERE employee_id = $1 AND LOWER(status) IN ('approved', 'rejected') 
             ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 5`,
            [employeeId]
        ),
        pool.query(
            `SELECT payroll_id AS id, salary_month, status, updated_at 
             FROM employee_payroll 
             WHERE employee_id = $1 AND LOWER(COALESCE(status, '')) IN ('processed', 'released') 
             ORDER BY updated_at DESC NULLS LAST, payroll_id DESC LIMIT 5`,
            [employeeId]
        ),
        pool.query(
            `SELECT passport_exp_date 
             FROM employees 
             WHERE employee_id = $1 AND passport_exp_date IS NOT NULL 
               AND passport_exp_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
            [employeeId]
        ),
        pool.query(
            `SELECT id, request_type, status, hr_response, updated_at 
             FROM employee_requests 
             WHERE employee_id = $1 AND status <> 'Pending' 
             ORDER BY updated_at DESC LIMIT 5`,
            [employeeId]
        )
    ]);

    const notifications = [
        ...leaveResult.rows.map(leave => ({
            type: "leave",
            title: `Leave ${leave.status}`,
            message: `${leave.leave_type} request (${leave.days || 1} days) has been ${leave.status}.`,
            date: leave.created_at ? new Date(leave.created_at).toISOString().slice(0, 10) : null
        })),
        ...payrollResult.rows.map(payroll => ({
            type: "payroll",
            title: "Payroll Released",
            message: `Your salary payslip is available for ${payroll.salary_month ? new Date(payroll.salary_month).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "the latest month"}.`,
            date: payroll.updated_at ? new Date(payroll.updated_at).toISOString().slice(0, 10) : null
        })),
        ...documentResult.rows.map(doc => ({
            type: "document",
            title: "Passport Expiring Soon",
            message: `Your passport is expiring on ${new Date(doc.passport_exp_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}. Please initiate renewal.`,
            date: new Date().toISOString().slice(0, 10)
        })),
        ...requestResult.rows.map(req => ({
            type: "request",
            title: `Request ${req.status}`,
            message: `Your ${req.request_type} request was ${req.status.toLowerCase()}.${req.hr_response ? ` HR Note: "${req.hr_response}"` : ""}`,
            date: req.updated_at ? new Date(req.updated_at).toISOString().slice(0, 10) : null
        }))
    ];

    return {
        employeeId,
        totalNotifications: notifications.length,
        notifications
    };
}

// 12. Prepare Apply Leave (Returns confirmation proposal, does NOT write to DB)
export async function prepareApplyLeave({ employeeId, leaveType = "Casual Leave", fromDate, toDate, reason = "" }) {
    if (!employeeId) throw new Error("Employee ID is required");
    if (!fromDate || !toDate) {
        return {
            error: "Both 'fromDate' and 'toDate' (YYYY-MM-DD) are required to apply for leave."
        };
    }

    if (toDate < fromDate) {
        return {
            error: "To Date must be equal to or after From Date."
        };
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);
    const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);

    return {
        requiresConfirmation: true,
        actionType: "APPLY_LEAVE",
        title: "Confirm Leave Application",
        summary: `Apply for ${days} day(s) of ${leaveType} from ${fromDate} to ${toDate}`,
        payload: {
            employeeId,
            leaveType,
            fromDate,
            toDate,
            days,
            reason: (reason || "").trim()
        }
    };
}

// 13. Execute Confirmed Apply Leave
export async function executeApplyLeave({ employeeId, leaveType, fromDate, toDate, days, reason }) {
    const calculatedDays = days || Math.max(1, Math.round((new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24)) + 1);

    const insertQuery = `
        INSERT INTO leaves (
            employee_id,
            leave_type,
            from_date,
            to_date,
            days,
            reason,
            status,
            created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'Pending', NOW())
        RETURNING id, employee_id, leave_type, from_date, to_date, days, reason, status, created_at
    `;

    const result = await pool.query(insertQuery, [
        employeeId,
        leaveType || "Casual Leave",
        fromDate,
        toDate,
        calculatedDays,
        reason || "Applied via Shelter Assistant"
    ]);

    const newLeave = result.rows[0];
    return {
        success: true,
        message: `Leave application submitted successfully for ${newLeave.days} day(s) (${newLeave.from_date ? new Date(newLeave.from_date).toISOString().slice(0, 10) : fromDate} to ${newLeave.to_date ? new Date(newLeave.to_date).toISOString().slice(0, 10) : toDate}). Status is currently 'Pending'.`,
        leave: newLeave
    };
}

// 14. Prepare Cancel Leave (Requires Confirmation)
export async function prepareCancelLeave({ employeeId, leaveId }) {
    if (!employeeId || !leaveId) {
        return { error: "Leave ID and Employee ID are required to cancel a leave request." };
    }

    const checkRes = await pool.query(
        `SELECT id, leave_type, from_date, to_date, days, status FROM leaves WHERE id = $1 AND employee_id = $2`,
        [leaveId, employeeId]
    );

    if (checkRes.rows.length === 0) {
        return { error: `No leave request found with ID ${leaveId} for your account.` };
    }

    const target = checkRes.rows[0];
    if (target.status !== "Pending") {
        return { error: `Only 'Pending' leave requests can be cancelled. Current status is '${target.status}'.` };
    }

    const fromStr = target.from_date ? new Date(target.from_date).toISOString().slice(0, 10) : "";
    const toStr = target.to_date ? new Date(target.to_date).toISOString().slice(0, 10) : "";

    return {
        requiresConfirmation: true,
        actionType: "CANCEL_LEAVE",
        title: "Confirm Leave Cancellation",
        summary: `Cancel pending ${target.leave_type} request (#${target.id}) from ${fromStr} to ${toStr} (${target.days} days).`,
        payload: {
            employeeId,
            leaveId: target.id
        }
    };
}

// 15. Execute Confirmed Cancel Leave
export async function executeCancelLeave({ employeeId, leaveId }) {
    const updateQuery = `
        UPDATE leaves
        SET 
            status = 'Cancelled',
            cancelled_by = $1,
            cancelled_at = NOW()
        WHERE id = $2 AND employee_id = $1 AND status = 'Pending'
        RETURNING id, status
    `;

    const result = await pool.query(updateQuery, [employeeId, leaveId]);
    if (result.rows.length === 0) {
        return {
            success: false,
            message: "Unable to cancel leave request. It may already be processed or cancelled."
        };
    }

    return {
        success: true,
        message: `Leave request #${leaveId} has been successfully cancelled.`
    };
}
