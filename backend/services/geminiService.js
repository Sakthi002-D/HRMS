import { GoogleGenAI, Type } from "@google/genai";
import * as employeeTools from "../tools/employeeTools.js";
import * as hrTools from "../tools/hrTools.js";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// Helper to get GoogleGenAI client safely
function getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return null;
    }
    return new GoogleGenAI({ apiKey });
}

// -------------------------------------------------------------
// Tool Function Declarations
// -------------------------------------------------------------

const EMPLOYEE_FUNCTION_DECLARATIONS = [
    {
        name: "getMyProfile",
        description: "Retrieve personal and professional profile details of the logged-in employee.",
        parameters: {
            type: Type.OBJECT,
            properties: {}
        }
    },
    {
        name: "getMyLeaveBalance",
        description: "Retrieve the leave balance, total entitlement, approved days, and counts of pending/approved/rejected leave requests for the logged-in employee.",
        parameters: {
            type: Type.OBJECT,
            properties: {}
        }
    },
    {
        name: "getMyLeaveRequests",
        description: "Retrieve past and active leave applications submitted by the logged-in employee.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                status: {
                    type: Type.STRING,
                    description: "Filter by leave status: 'Pending', 'Approved', 'Rejected', 'Cancelled', or 'all'."
                },
                limit: {
                    type: Type.INTEGER,
                    description: "Maximum number of leave records to return (default 10)."
                }
            }
        }
    },
    {
        name: "getMyAttendance",
        description: "Retrieve attendance history (punch-in, punch-out, status, late minutes) for the logged-in employee.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                limit: {
                    type: Type.INTEGER,
                    description: "Number of recent attendance days to retrieve (default 10)."
                }
            }
        }
    },
    {
        name: "prepareApplyLeave",
        description: "Prepare an application for leave. Does not write to DB immediately; requests user confirmation with dates, leave type, and reason.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                leaveType: {
                    type: Type.STRING,
                    description: "Type of leave: 'Casual Leave', 'Sick Leave', 'Earned Leave', or 'Emergency Leave'."
                },
                fromDate: {
                    type: Type.STRING,
                    description: "Start date of leave in YYYY-MM-DD format."
                },
                toDate: {
                    type: Type.STRING,
                    description: "End date of leave in YYYY-MM-DD format."
                },
                reason: {
                    type: Type.STRING,
                    description: "Reason for taking leave."
                }
            },
            required: ["fromDate", "toDate"]
        }
    },
    {
        name: "prepareCancelLeave",
        description: "Prepare cancellation of an existing Pending leave request. Requires user confirmation before deleting/cancelling.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                leaveId: {
                    type: Type.INTEGER,
                    description: "ID of the pending leave request to cancel."
                }
            },
            required: ["leaveId"]
        }
    }
];

const HR_FUNCTION_DECLARATIONS = [
    {
        name: "getEmployees",
        description: "Retrieve a list of employees filtered optionally by department or active status.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                department: {
                    type: Type.STRING,
                    description: "Filter by department name (e.g. IT, HR, Finance)."
                },
                status: {
                    type: Type.STRING,
                    description: "Filter by employee status: 'Active', 'Inactive', or 'all'."
                },
                limit: {
                    type: Type.INTEGER,
                    description: "Maximum records to return (default 20)."
                }
            }
        }
    },
    {
        name: "getEmployeeDetails",
        description: "Retrieve comprehensive details for a specific employee by their employee ID (e.g. EMP001).",
        parameters: {
            type: Type.OBJECT,
            properties: {
                employeeId: {
                    type: Type.STRING,
                    description: "The unique employee ID."
                }
            },
            required: ["employeeId"]
        }
    },
    {
        name: "getEmployeeCount",
        description: "Get total active employee count and breakdown by department across the company.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                department: {
                    type: Type.STRING,
                    description: "Optional department to filter count."
                }
            }
        }
    },
    {
        name: "getAttendanceOverview",
        description: "Retrieve overall attendance metrics for a specific date (present count, late count, absent count, and list of absent employees).",
        parameters: {
            type: Type.OBJECT,
            properties: {
                date: {
                    type: Type.STRING,
                    description: "Date in YYYY-MM-DD format. Defaults to current date if omitted."
                }
            }
        }
    },
    {
        name: "getLeaveRequests",
        description: "Retrieve leave requests across the company (useful for viewing pending leaves awaiting HR approval).",
        parameters: {
            type: Type.OBJECT,
            properties: {
                status: {
                    type: Type.STRING,
                    description: "Filter by status: 'Pending', 'Approved', 'Rejected', or 'all'."
                },
                limit: {
                    type: Type.INTEGER,
                    description: "Number of records to return (default 15)."
                }
            }
        }
    },
    {
        name: "prepareLeaveStatusChange",
        description: "Prepare an approval or rejection of an employee leave request. Requires confirmation before updating database.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                leaveId: {
                    type: Type.INTEGER,
                    description: "The ID of the leave request."
                },
                action: {
                    type: Type.STRING,
                    description: "Action to take: 'Approve' or 'Reject'."
                }
            },
            required: ["leaveId", "action"]
        }
    },
    {
        name: "getJobOpenings",
        description: "Get active recruitment job openings and positions currently posted in the HRMS.",
        parameters: {
            type: Type.OBJECT,
            properties: {}
        }
    },
    {
        name: "getNewJoiners",
        description: "Get employees who joined the company during the current month.",
        parameters: {
            type: Type.OBJECT,
            properties: {}
        }
    },
    {
        name: "getPayrollOverview",
        description: "Retrieve employee payroll information, salaries, allowances, and deductions.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                employeeId: {
                    type: Type.STRING,
                    description: "Optional employee ID to inspect payroll for a specific employee."
                }
            }
        }
    }
];

// -------------------------------------------------------------
// Tool Execution Dispatcher
// -------------------------------------------------------------

async function executeTool(name, args, authUser) {
    const isHR = authUser.role === "hr";

    // Employee tools (always available for the authenticated user)
    if (name === "getMyProfile") {
        return await employeeTools.getMyProfile({ employeeId: authUser.employee_id });
    }
    if (name === "getMyLeaveBalance") {
        return await employeeTools.getMyLeaveBalance({ employeeId: authUser.employee_id });
    }
    if (name === "getMyLeaveRequests") {
        return await employeeTools.getMyLeaveRequests({ employeeId: authUser.employee_id, ...args });
    }
    if (name === "getMyAttendance") {
        return await employeeTools.getMyAttendance({ employeeId: authUser.employee_id, ...args });
    }
    if (name === "prepareApplyLeave") {
        return await employeeTools.prepareApplyLeave({ employeeId: authUser.employee_id, ...args });
    }
    if (name === "prepareCancelLeave") {
        return await employeeTools.prepareCancelLeave({ employeeId: authUser.employee_id, ...args });
    }

    // HR tools (only available if authUser.role === 'hr')
    if (!isHR) {
        return {
            error: "Access denied. You do not have HR privileges to access company-wide records or perform administrative operations."
        };
    }

    if (name === "getEmployees") {
        return await hrTools.getEmployees(args);
    }
    if (name === "getEmployeeDetails") {
        return await hrTools.getEmployeeDetails(args);
    }
    if (name === "getEmployeeCount") {
        return await hrTools.getEmployeeCount(args);
    }
    if (name === "getAttendanceOverview") {
        return await hrTools.getAttendanceOverview(args);
    }
    if (name === "getLeaveRequests") {
        return await hrTools.getLeaveRequests(args);
    }
    if (name === "prepareLeaveStatusChange") {
        return await hrTools.prepareLeaveStatusChange(args);
    }
    if (name === "getJobOpenings") {
        return await hrTools.getJobOpenings();
    }
    if (name === "getNewJoiners") {
        return await hrTools.getNewJoiners();
    }
    if (name === "getPayrollOverview") {
        return await hrTools.getPayrollOverview(args);
    }

    return { error: `Tool function '${name}' not found.` };
}

// -------------------------------------------------------------
// System Instruction Generator
// -------------------------------------------------------------

function buildSystemInstruction(authUser) {
    const isHR = authUser.role === "hr";
    const today = new Date().toISOString().slice(0, 10);

    return `You are the Shelter Group HR Assistant, a production-grade AI assistant embedded inside the Shelter Group HRMS.
Today's Date: ${today}.

Current Authenticated User:
- Name: ${authUser.name || "User"}
- Employee ID: ${authUser.employee_id}
- Role: ${authUser.role} (${isHR ? "HR / Administrator" : "Regular Employee"})

Core Responsibilities:
1. Provide accurate, helpful answers based STRICTLY on real HRMS data retrieved using tools.
2. NEVER invent or fabricate employee records, leave days, attendance records, or policies.
3. If the user asks for their leave balance, profile, or attendance, invoke the corresponding getMy... tool.
4. ROLE SECURITY:
   ${isHR
     ? "- The user is an HR administrator and has access to company-wide employee lists, department statistics, attendance overviews, job postings, and leave approval tools."
     : "- The user is a regular Employee. NEVER attempt or provide access to other employees' private records, salaries, or HR-only administrative tools. Explain politely if something requires HR permission."
   }
5. TICKETS & HOLIDAYS:
   - Note: Company support tickets and company holidays tables are not configured in the database yet. If the user asks about tickets or holidays, politely inform them that ticket tracking and holiday calendars are not yet in the active database.
6. SENSITIVE ACTIONS & CONFIRMATION:
   - For sensitive operations (such as applying for leave, cancelling leave, approving or rejecting leave), always invoke the corresponding 'prepare...' tool.
   - When a prepare tool is invoked, present the details clearly and ask the user to review and confirm using the confirmation button.
7. Keep responses concise, clear, and professional. Avoid markdown walls; format lists cleanly.`;
}

// -------------------------------------------------------------
// Main Assistant Conversation Handler
// -------------------------------------------------------------

export async function processAssistantMessage({ message, history = [], authUser }) {
    const ai = getGeminiClient();

    if (!ai) {
        return {
            success: false,
            message: "GEMINI_API_KEY is not configured in backend/.env. Please add your Gemini API key to enable the AI HR Assistant."
        };
    }

    const isHR = authUser.role === "hr";
    const declarations = isHR
        ? [...EMPLOYEE_FUNCTION_DECLARATIONS, ...HR_FUNCTION_DECLARATIONS]
        : EMPLOYEE_FUNCTION_DECLARATIONS;

    const systemInstruction = buildSystemInstruction(authUser);

    // Format conversation history for Gemini API
    const contents = [];

    // Add previous history turns if valid
    if (Array.isArray(history) && history.length > 0) {
        for (const item of history.slice(-6)) { // keep last 6 turns for context
            if (item.sender === "user" && item.text) {
                contents.push({
                    role: "user",
                    parts: [{ text: item.text }]
                });
            } else if (item.sender === "assistant" && item.text) {
                contents.push({
                    role: "model",
                    parts: [{ text: item.text }]
                });
            }
        }
    }

    // Add current user prompt
    contents.push({
        role: "user",
        parts: [{ text: message }]
    });

    try {
        let turn = 0;
        const maxTurns = 5;

        while (turn < maxTurns) {
            turn++;

            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents,
                config: {
                    systemInstruction,
                    tools: [{ functionDeclarations: declarations }]
                }
            });

            const candidate = response.candidates?.[0];
            const functionCalls = response.functionCalls || 
                candidate?.content?.parts?.filter(p => p.functionCall).map(p => p.functionCall);

            // If Gemini decided to call one or more tools
            if (functionCalls && functionCalls.length > 0) {
                // Record model's functionCall turn
                contents.push(candidate.content);

                const responseParts = [];
                let pendingConfirmation = null;

                for (const call of functionCalls) {
                    const result = await executeTool(call.name, call.args || {}, authUser);

                    if (result && result.requiresConfirmation) {
                        pendingConfirmation = result;
                    }

                    responseParts.push({
                        functionResponse: {
                            name: call.name,
                            response: { output: result }
                        }
                    });
                }

                // Add function response turn
                contents.push({
                    role: "user",
                    parts: responseParts
                });

                // If any tool returned a confirmation proposal, prompt user for confirmation
                if (pendingConfirmation) {
                    const followUp = await ai.models.generateContent({
                        model: MODEL_NAME,
                        contents,
                        config: {
                            systemInstruction
                        }
                    });

                    return {
                        success: true,
                        message: followUp.text || `I have prepared this action. Please confirm below:`,
                        requiresConfirmation: true,
                        confirmation: pendingConfirmation
                    };
                }

                // Continue loop so Gemini can summarize the tool output
                continue;
            }

            // Normal text response
            return {
                success: true,
                message: response.text || "I processed your request.",
                requiresConfirmation: false
            };
        }

        return {
            success: true,
            message: "I processed your request, but the query required multiple steps. How else can I help?"
        };

    } catch (error) {
        console.error("Gemini Assistant Service Error:", error);

        // Friendly error message without exposing backend keys or internals
        let userFacingError = "Sorry, I encountered an issue processing your request. Please try again in a moment.";

        if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("API key not valid")) {
            userFacingError = "The configured Gemini API key appears to be invalid. Please check your backend/.env configuration.";
        } else if (error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
            userFacingError = "Gemini API quota has been reached. Please try again shortly.";
        }

        return {
            success: false,
            message: userFacingError
        };
    }
}

