import express from "express";
import { processUnifiedAIMessage } from "../services/aiService.js";
import { executeApplyLeave, executeCancelLeave, executeSubmitRequest } from "../tools/employeeTools.js";
import { executeLeaveStatusChange, executeEmployeeRequestStatusChange } from "../tools/hrTools.js";

const router = express.Router();

/**
 * POST /api/assistant
 * Main AI Assistant endpoint
 */
router.post("/", async (req, res) => {
    try {
        const { message, history, actionConfirmation } = req.body;
        const authUser = {
            employee_id: req.auth.employeeId,
            name: req.auth.name,
            department: req.auth.department,
            designation: req.auth.designation,
            email: req.auth.email,
            role: req.auth.role,
        };

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

            // 2C. Submit Employee Request (NOC, Letter)
            if (actionType === "SUBMIT_REQUEST") {
                const result = await executeSubmitRequest({
                    employeeId: authUser.employee_id,
                    requestType: payload.requestType,
                    reason: payload.reason
                });

                return res.json({
                    success: result.success,
                    message: result.message,
                    actionCompleted: true,
                    request: result.request
                });
            }

            // 2D. Update Leave Status (HR Only)
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

            // 2E. Update Employee Request Status (HR Only)
            if (actionType === "UPDATE_EMPLOYEE_REQUEST_STATUS") {
                if (authUser.role !== "hr") {
                    return res.status(403).json({
                        success: false,
                        message: "Unauthorized. Only HR administrators can approve or reject employee requests."
                    });
                }

                const result = await executeEmployeeRequestStatusChange({
                    requestId: payload.requestId,
                    newStatus: payload.newStatus,
                    hrResponse: payload.hrResponse
                });

                return res.json({
                    success: result.success,
                    message: result.message,
                    actionCompleted: true,
                    request: result.request
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

        // Sanitize conversation history: only retain valid user/assistant messages for the authenticated user
        const sanitizedHistory = Array.isArray(history)
            ? history
                .filter(item => item && typeof item.text === "string" && (item.sender === "user" || item.sender === "assistant"))
                .slice(-6)
            : [];

        const result = await processUnifiedAIMessage({
            message: message.trim(),
            history: sanitizedHistory,
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
