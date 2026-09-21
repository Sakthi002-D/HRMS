import * as employeeTools from "../tools/employeeTools.js";
import * as hrTools from "../tools/hrTools.js";

// Standard JSON-schema definitions for all HRMS tools

export const UNIVERSAL_EMPLOYEE_TOOLS = [
    {
        name: "getMyProfile",
        description: "Retrieve personal, contact, and employment profile details for the logged-in employee.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "getMyLeaveBalance",
        description: "Retrieve the employee's cumulative Annual Leave balance. Annual Leave accrues at 1.75 days per completed month for employees under five years and carries forward; other leave types have separate policy entitlements.",
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
        description: "Retrieve daily attendance logs (punch-in, punch-out, status, late minutes, shift) for the logged-in employee.",
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
        name: "getMyAttendanceSummary",
        description: "Retrieve overall attendance metrics (number of on-time days, late days, work from home days, absent days, and total late minutes) for the logged-in employee.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "getMyPayroll",
        description: "Retrieve monthly salary details, payslips, basic salary, allowances, deductions, net pay, and payment transfer status for the logged-in employee.",
        parameters: {
            type: "object",
            properties: {
                limit: {
                    type: "integer",
                    description: "Number of recent monthly payslips to retrieve (default 6)."
                }
            }
        }
    },
    {
        name: "getMyDocuments",
        description: "Retrieve list of uploaded documents on file (employment contract, offer letter, visa copy, QID, passport copy) and passport expiration details for the logged-in employee.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "getMyRequests",
        description: "Retrieve status of employee requests submitted to HR (such as NOC requests, experience letters, salary certificates).",
        parameters: {
            type: "object",
            properties: {
                status: {
                    type: "string",
                    description: "Filter by status: 'Pending', 'Approved', 'Rejected', or 'all'."
                },
                limit: {
                    type: "integer",
                    description: "Maximum number of records to return (default 10)."
                }
            }
        }
    },
    {
        name: "getMyNotifications",
        description: "Retrieve active notifications and alerts (leave approvals/rejections, released payroll, passport expiration alerts, request responses) for the logged-in employee.",
        parameters: {
            type: "object",
            properties: {},
            required: []
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
    },
    {
        name: "prepareSubmitRequest",
        description: "Prepare submission of a formal employee request to HR (e.g. NOC Request, Experience Letter, Salary Certificate). Requires user confirmation before submitting.",
        parameters: {
            type: "object",
            properties: {
                requestType: {
                    type: "string",
                    description: "Type of request: 'NOC Request', 'Experience Letter', 'Salary Certificate', or 'General Request'."
                },
                reason: {
                    type: "string",
                    description: "Optional details or purpose for the request."
                }
            },
            required: ["requestType"]
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
                    description: "The unique employee ID (e.g. EMP001)."
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
        description: "Retrieve overall company attendance metrics for a specific date (present count, late count, absent count, and list of absent employees).",
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
        name: "getEmployeeAttendanceDetails",
        description: "Retrieve attendance history and attendance summary for any specific employee by ID.",
        parameters: {
            type: "object",
            properties: {
                employeeId: {
                    type: "string",
                    description: "The unique employee ID (e.g. EMP001)."
                },
                limit: {
                    type: "integer",
                    description: "Number of attendance records to retrieve (default 15)."
                }
            },
            required: ["employeeId"]
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
        description: "Retrieve company payroll records, salaries, allowances, and deductions across the organization or for a specific employee ID.",
        parameters: {
            type: "object",
            properties: {
                employeeId: {
                    type: "string",
                    description: "Optional employee ID to inspect payroll for a specific employee."
                },
                limit: {
                    type: "integer",
                    description: "Maximum records to return (default 15)."
                }
            }
        }
    },
    {
        name: "getCompanyEmployeeRequests",
        description: "Retrieve formal employee requests (NOC, Experience Letters, etc.) across the company.",
        parameters: {
            type: "object",
            properties: {
                status: {
                    type: "string",
                    description: "Filter by status: 'Pending', 'Approved', 'Rejected', or 'all'."
                },
                employeeId: {
                    type: "string",
                    description: "Optional employee ID filter."
                },
                limit: {
                    type: "integer",
                    description: "Maximum records to return (default 15)."
                }
            }
        }
    },
    {
        name: "prepareEmployeeRequestStatusChange",
        description: "Prepare an approval or rejection of an employee request (e.g. NOC or Letter). Requires user confirmation before updating.",
        parameters: {
            type: "object",
            properties: {
                requestId: {
                    type: "integer",
                    description: "The ID of the employee request."
                },
                action: {
                    type: "string",
                    description: "Action to take: 'Approve' or 'Reject'."
                },
                hrResponse: {
                    type: "string",
                    description: "Optional response note or message from HR."
                }
            },
            required: ["requestId", "action"]
        }
    },
    {
        name: "getEmployeeDocumentsAdmin",
        description: "Inspect uploaded documents (contracts, visas, QID, passport) and passport expiry for any employee.",
        parameters: {
            type: "object",
            properties: {
                employeeId: {
                    type: "string",
                    description: "The unique employee ID (e.g. EMP001)."
                }
            },
            required: ["employeeId"]
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

// Unified Dispatcher: Executes the requested function against PostgreSQL
export async function executeToolByName(name, args = {}, authUser) {
    const isHR = authUser.role === "hr";

    // Employee tools (Strictly self-service: employeeId ALWAYS enforced from authUser)
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
    if (name === "getMyAttendanceSummary") {
        return await employeeTools.getMyAttendanceSummary({ employeeId: authUser.employee_id });
    }
    if (name === "getMyPayroll") {
        return await employeeTools.getMyPayroll({ employeeId: authUser.employee_id, ...args });
    }
    if (name === "getMyDocuments") {
        return await employeeTools.getMyDocuments({ employeeId: authUser.employee_id });
    }
    if (name === "getMyRequests") {
        return await employeeTools.getMyRequests({ employeeId: authUser.employee_id, ...args });
    }
    if (name === "getMyNotifications") {
        return await employeeTools.getMyNotifications({ employeeId: authUser.employee_id });
    }
    if (name === "prepareApplyLeave") {
        return await employeeTools.prepareApplyLeave({ employeeId: authUser.employee_id, ...args });
    }
    if (name === "prepareCancelLeave") {
        return await employeeTools.prepareCancelLeave({ employeeId: authUser.employee_id, ...args });
    }
    if (name === "prepareSubmitRequest") {
        return await employeeTools.prepareSubmitRequest({ employeeId: authUser.employee_id, ...args });
    }

    // HR tools (Strictly rejected if caller is not HR)
    if (!isHR) {
        return {
            error: "Access denied. You do not have HR privileges to access other employees' records or company-wide data."
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
    if (name === "getEmployeeAttendanceDetails") {
        return await hrTools.getEmployeeAttendanceDetails(args);
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
    if (name === "getCompanyEmployeeRequests") {
        return await hrTools.getCompanyEmployeeRequests(args);
    }
    if (name === "prepareEmployeeRequestStatusChange") {
        return await hrTools.prepareEmployeeRequestStatusChange(args);
    }
    if (name === "getEmployeeDocumentsAdmin") {
        return await hrTools.getEmployeeDocumentsAdmin(args);
    }

    return { error: `Tool function '${name}' not found.` };
}

// Unified System Instruction across all AI models
export function buildUnifiedSystemPrompt(authUser) {
    const isHR = authUser.role === "hr";
    const today = new Date().toISOString().slice(0, 10);

    return `You are the Shelter Assistant, a production-grade AI assistant embedded inside the Shelter Group HRMS.
Today's Date: ${today}.

Current Authenticated User:
- Name: ${authUser.name || "User"}
- Employee ID: ${authUser.employee_id}
- Role: ${authUser.role} (${isHR ? "HR / Administrator" : "Regular Employee"})

Core Responsibilities:
1. You MUST ALWAYS identify yourself strictly as "Shelter Assistant". NEVER refer to yourself as "Shelter Employee Assistant", "Shelter HR Assistant", "Employee Assistant", or "HR Assistant".
2. Provide accurate, helpful answers based STRICTLY on real HRMS data retrieved using tools. NEVER invent, guess, or hallucinate employee records, leave days, attendance records, salaries, or policies.
3. If the user asks about their profile, leaves, attendance, payroll, salary, documents, or requests, always invoke the corresponding tool to retrieve live data.

4. ROLE-BASED ACCESS CONTROL (CRITICAL SECURITY):
${isHR ? `
- The user is an HR / Administrator (${authUser.name}, ID: ${authUser.employee_id}).
- Authorized to view company-wide employee lists, department statistics, attendance overviews, individual employee profiles and attendance, company payroll, job postings, and review/approve leaves and employee requests.
` : `
- The user is a regular Employee (${authUser.name}, ID: ${authUser.employee_id}).
- STRICT SELF-SERVICE ONLY: The employee can ONLY access their own records (leave balance, their attendance, their salary/payslips, their uploaded documents, and their requests).
- FORBIDDEN: The employee CANNOT view other employees' records, salaries, attendance, documents, or company-wide statistics.
- If this employee asks for another employee's private details, attendance, or salary (e.g., "What is EMP002's salary?", "Show EMP003's attendance", "Who is EMP005?"), YOU MUST REFUSE IMMEDIATELY:
  "Access denied. As an employee, you only have permission to view your own records. You cannot access details or salaries of other employees."
`}

5. TICKETS & HOLIDAYS:
- Support tickets and holiday calendar tables are not configured in the active database yet. If asked, politely inform the user that ticket tracking and holiday calendars are not yet connected to the live database.

6. SENSITIVE ACTIONS & CONFIRMATION:
- For write actions (applying for leave, cancelling leave, submitting an NOC/letter request, approving or rejecting leaves/requests), always invoke the appropriate 'prepare...' tool.
- When a prepare tool is invoked, present the details clearly and instruct the user to review and confirm using the confirmation button.

7. Response Style:
- Professional, warm, and concise. Format lists cleanly. Present financial and attendance figures clearly.`;
}
