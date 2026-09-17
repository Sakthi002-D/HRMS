import express from "express";
import pool from "../db.js";
import { processUnifiedAIMessage } from "../services/aiService.js";
import { executeApplyLeave, executeCancelLeave } from "../tools/employeeTools.js";
import { executeLeaveStatusChange } from "../tools/hrTools.js";

const router = express.Router();

/**
 * Helper to authenticate user against the database.
 * Does NOT trust client-supplied role.
 */
async function authenticateUser(employeeId) {
    if (!employeeId || typeof employeeId !== "string") {
        return null;
    }

    const result = await pool.query(
        `SELECT id, employee_id, name, department, designation, email, role, status, access_disabled
         FROM employees 
         WHERE employee_id = $1`,
        [employeeId.trim()]
    );

    if (result.rows.length === 0) {
        return null;
    }

    const employee = result.rows[0];
    if (employee.access_disabled === true || (employee.status && employee.status.toLowerCase() === "inactive")) {
        return { disabled: true };
    }

    return {
        id: employee.id,
        employee_id: employee.employee_id,
        name: employee.name,
        department: employee.department,
        designation: employee.designation,
        email: employee.email,
        role: String(employee.role || "employee").trim().toLowerCase()
    };
}

/**
 * POST /api/assistant
 * Main AI Assistant endpoint
 */
router.post("/", async (req, res) => {
    try {
        const { message, history, employee_id, actionConfirmation } = req.body;

        // 1. Authenticate user from database
        const authUser = await authenticateUser(employee_id);

        if (!authUser) {
            return res.status(401).json({
                success: false,
                message: "Authentication failed. Please log in again to interact with the Shelter HR Assistant."
            });
        }

        if (authUser.disabled) {
            return res.status(403).json({
                success: false,
                message: "Your account is disabled. Please contact HR."
            });
        }

        // 2. Handle Confirmed Action Execution (Write operations)
        if (actionConfirmation) {
            const { actionType, payload } = actionConfirmation;

            // 2A. Apply Leave
            if (actionType === "APPLY_LEAVE") {
                const result = await executeApplyLeave({
                    employeeId: authUser.employee_id,
                    leaveType: payload.leaveType,
                    fromDate: payload.fromDate,
                    toDate: payload.toDate,
                    days: payload.days,
                    reason: payload.reason
                });

                return res.json({
                    success: result.success,
                    message: result.message,
                    actionCompleted: true,
                    leave: result.leave
                });
            }

            // 2B. Cancel Leave
            if (actionType === "CANCEL_LEAVE") {
                const result = await executeCancelLeave({
                    employeeId: authUser.employee_id,
                    leaveId: payload.leaveId
                });

                return res.json({
                    success: result.success,
                    message: result.message,
                    actionCompleted: true
                });
            }

            // 2C. Update Leave Status (HR Only)
            if (actionType === "UPDATE_LEAVE_STATUS") {
                if (authUser.role !== "hr") {
                    return res.status(403).json({
                        success: false,
                        message: "Unauthorized. Only HR administrators can approve or reject leaves."
                    });
                }

                const result = await executeLeaveStatusChange({
                    leaveId: payload.leaveId,
                    newStatus: payload.newStatus
                });

                return res.json({
                    success: result.success,
                    message: result.message,
                    actionCompleted: true
                });
            }

            return res.status(400).json({
                success: false,
                message: `Unknown action type: ${actionType}`
            });
        }

        // 3. Handle Regular Conversational Message
        if (!message || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid message for the assistant."
            });
        }

        const result = await processUnifiedAIMessage({
            message: message.trim(),
            history: Array.isArray(history) ? history : [],
            authUser
        });

        return res.json(result);

    } catch (error) {
        console.error("Error in /api/assistant route:", error);
        return res.status(500).json({
            success: false,
            message: "An internal server error occurred while processing your request. Please try again."
        });
    }
});

export default router;

