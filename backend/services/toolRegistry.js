import * as employeeTools from "../tools/employeeTools.js";
import * as hrTools from "../tools/hrTools.js";

// Standard JSON-schema definitions for all HRMS tools
export const UNIVERSAL_EMPLOYEE_TOOLS = [
    {
        name: "getMyProfile",
        description: "Retrieve personal and professional profile details of the logged-in employee.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "getMyLeaveBalance",
        description: "Retrieve the leave balance, total annual entitlement (42 days), approved taken days, and counts of pending/approved/rejected leave requests for the logged-in employee.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "getMyLeaveRequests",
        description: "Retrieve past and active leave applications submitted by the logged-in employee.",
        parameters: {
            type: "object",
            properties: {
                status: {
                    type: "string",
                    description: "Filter by leave status: 'Pending', 'Approved', 'Rejected', 'Cancelled', or 'all'."
                },
                limit: {
                    type: "integer",
                    description: "Maximum number of leave records to return (default 10)."
                }
            }
        }
    },
    {
        name: "getMyAttendance",
        description: "Retrieve attendance history (punch-in, punch-out, status, late minutes) for the logged-in employee.",
        parameters: {
            type: "object",
            properties: {
                limit: {
                    type: "integer",
                    description: "Number of recent attendance days to retrieve (default 10)."
                }
            }
        }
    },
    {
        name: "prepareApplyLeave",
        description: "Prepare an application for leave. Does not write to DB immediately; requests user confirmation with dates, leave type, and reason.",
        parameters: {
            type: "object",
            properties: {
                leaveType: {
                    type: "string",
                    description: "Type of leave: 'Casual Leave', 'Sick Leave', 'Earned Leave', or 'Emergency Leave'."
                },
                fromDate: {
                    type: "string",
                    description: "Start date of leave in YYYY-MM-DD format."
                },
                toDate: {
                    type: "string",
                    description: "End date of leave in YYYY-MM-DD format."
                },
                reason: {
                    type: "string",
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
            type: "object",
            properties: {
                leaveId: {
                    type: "integer",
                    description: "ID of the pending leave request to cancel."
                }
            },
            required: ["leaveId"]
        }
    }
];

export const UNIVERSAL_HR_TOOLS = [
    {
        name: "getEmployees",
        description: "Retrieve a list of employees filtered optionally by department or active status.",
        parameters: {
            type: "object",
            properties: {
                department: {
                    type: "string",
                    description: "Filter by department name (e.g. IT, HR, Finance)."
                },
                status: {
                    type: "string",
                    description: "Filter by employee status: 'Active', 'Inactive', or 'all'."
                },
                limit: {
                    type: "integer",
                    description: "Maximum records to return (default 20)."
                }
            }
        }
    },
    {
        name: "getEmployeeDetails",
        description: "Retrieve comprehensive details for a specific employee by their employee ID (e.g. EMP001).",
        parameters: {
            type: "object",
            properties: {
                employeeId: {
                    type: "string",
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
            type: "object",
            properties: {
                department: {
                    type: "string",
                    description: "Optional department to filter count."
                }
            }
        }
    },
    {
        name: "getAttendanceOverview",
        description: "Retrieve overall attendance metrics for a specific date (present count, late count, absent count, and list of absent employees).",
        parameters: {
            type: "object",
            properties: {
                date: {
                    type: "string",
                    description: "Date in YYYY-MM-DD format. Defaults to current date if omitted."
                }
            }
        }
    },
    {
        name: "getLeaveRequests",
        description: "Retrieve leave requests across the company (useful for viewing pending leaves awaiting HR approval).",
        parameters: {
            type: "object",
            properties: {
                status: {
                    type: "string",
                    description: "Filter by status: 'Pending', 'Approved', 'Rejected', or 'all'."
                },
                limit: {
                    type: "integer",
                    description: "Number of records to return (default 15)."
                }
            }
        }
    },
    {
        name: "prepareLeaveStatusChange",
        description: "Prepare an approval or rejection of an employee leave request. Requires confirmation before updating database.",
        parameters: {
            type: "object",
            properties: {
                leaveId: {
                    type: "integer",
                    description: "The ID of the leave request."
                },
                action: {
                    type: "string",
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
            type: "object",
            properties: {}
        }
    },
    {
        name: "getNewJoiners",
        description: "Get employees who joined the company during the current month.",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "getPayrollOverview",
        description: "Retrieve employee payroll information, salaries, allowances, and deductions.",
        parameters: {
            type: "object",
            properties: {
                employeeId: {
                    type: "string",
                    description: "Optional employee ID to inspect payroll for a specific employee."
                }
            }
        }
    }
];

export function getToolsForRole(role) {
    if (role === "hr") {
        return [...UNIVERSAL_EMPLOYEE_TOOLS, ...UNIVERSAL_HR_TOOLS];
    }
    return [...UNIVERSAL_EMPLOYEE_TOOLS];
}

// Convert universal definitions to OpenAI format
export function formatToolsForOpenAI(tools) {
    return tools.map(t => ({
        type: "function",
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }
    }));
}

// Convert universal definitions to Anthropic format
export function formatToolsForAnthropic(tools) {
    return tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters
    }));
}

// Convert universal definitions to Gemini format
export function formatToolsForGemini(tools) {
    return [{
        functionDeclarations: tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }))
    }];
}

// Unified Dispatcher: Executes the requested function against Supabase / PostgreSQL
export async function executeToolByName(name, args = {}, authUser) {
    const isHR = authUser.role === "hr";

    // Employee tools
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

    // HR tools
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

// Unified System Instruction across all AI models
export function buildUnifiedSystemPrompt(authUser) {
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
3. If the user asks for their leave balance, profile, attendance, or any data, invoke the corresponding tool.
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

