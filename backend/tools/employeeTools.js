import pool from "../db.js";

/**
 * Employee Tools - Authorized functions strictly scoped to the authenticated employee.
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
        joiningDate: emp.joining_date,
        dateOfBirth: emp.date_of_birth,
        gender: emp.gender,
        address: emp.address,
        employmentType: emp.employment_type,
        emergencyContact: emp.emergency_contact,
        nationality: emp.nationality,
        maritalStatus: emp.marital_status,
        bank: emp.bank?.bank_name ? { bankName: emp.bank.bank_name, accountType: emp.bank.account_type } : null,
        education: emp.education?.qualification ? { qualification: emp.education.qualification, institution: emp.education.institution } : null
    };
}

// 2. Get Employee Leave Balance & Stats
export async function getMyLeaveBalance({ employeeId }) {
    if (!employeeId) throw new Error("Employee ID is required");

    const leavesRes = await pool.query(`
        SELECT id, leave_type, from_date, to_date, days, status
        FROM leaves
        WHERE employee_id = $1
    `, [employeeId]);

    const leaves = leavesRes.rows;
    const totalEntitlement = 42; // Standard annual entitlement in Shelter HRMS
    const approvedLeaveDays = leaves
        .filter(l => (l.status || "").toLowerCase() === "approved")
        .reduce((sum, l) => sum + (Number(l.days) || 0), 0);

    const pendingRequests = leaves.filter(l => (l.status || "").toLowerCase() === "pending").length;
    const approvedRequests = leaves.filter(l => (l.status || "").toLowerCase() === "approved").length;
    const rejectedRequests = leaves.filter(l => (l.status || "").toLowerCase() === "rejected").length;
    const remainingBalance = Math.max(totalEntitlement - approvedLeaveDays, 0);

    return {
        employeeId,
        totalEntitlementDays: totalEntitlement,
        approvedLeaveDays,
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
            appliedAt: row.created_at
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

// 5. Prepare Apply Leave (Returns confirmation proposal, does NOT write to DB)
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
            reason: reason.trim()
        }
    };
}

// 6. Execute Confirmed Apply Leave
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
        reason || "Applied via Shelter HR Assistant"
    ]);

    const newLeave = result.rows[0];
    return {
        success: true,
        message: `Leave application submitted successfully for ${newLeave.days} day(s) (${newLeave.from_date.toISOString().slice(0, 10)} to ${newLeave.to_date.toISOString().slice(0, 10)}). Status is currently 'Pending'.`,
        leave: newLeave
    };
}

// 7. Prepare Cancel Leave (Requires Confirmation)
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

// 8. Execute Confirmed Cancel Leave
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

