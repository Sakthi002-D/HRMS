import API_URL from "../../config/api";

// HR notifications built from employee activity:
//   - Employee requests (Salary Certificate, NOC, Letter, Expense) → opens that request
//   - Visa / Passport uploaded or replaced by the employee        → opens their Employee Documents
// Used by the HR Dashboard bell and the HR Notifications page, so both show the same list.

const RECENT_DAYS = 60;

const DOCUMENT_LABELS = {
    visa_copy: "Visa Copy",
    passport_copy: "Passport Copy",
    employment_contract: "Employment Contract",
    offer_letter: "Offer Letter",
    qid_copy: "QID Copy",
};

// Same URL format the Employees list uses for employee pages
const employeeSlug = (name) =>
    String(name || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

const shortDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
};

const fetchJson = (url) =>
    fetch(url, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : []))
        .catch(() => []);

export async function loadEmployeeActivityNotifications(hrId) {
    const since = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;

    const [requests, uploads] = await Promise.all([
        fetchJson(`${API_URL}/api/hr/employee-requests`),
        hrId ? fetchJson(`${API_URL}/api/hr/document-uploads?actor_id=${encodeURIComponent(hrId)}`) : [],
    ]);

    const requestNotifications = (Array.isArray(requests) ? requests : [])
        .filter((request) => new Date(request.created_at).getTime() >= since)
        .map((request) => ({
            id: `employee-request-${request.id}`,
            type: "request",
            module: "Employee Requests",
            title: `${request.employee_name || request.employee_id} requested ${request.request_type}`,
            message: `${request.request_type} request from ${request.employee_name || ""} (${request.employee_id}). Open Employee Requests to review it.`,
            date: request.created_at,
            time: shortDate(request.created_at),
            path: `/hr/employee-requests?request=${request.id}`,
        }));

    const uploadNotifications = (Array.isArray(uploads) ? uploads : []).map((upload) => {
        const label = DOCUMENT_LABELS[upload.doc_type] || upload.doc_type;
        return {
            // The upload time is part of the id, so every replacement is a NEW notification
            id: `document-upload-${upload.employee_id}-${upload.doc_type}-${new Date(upload.uploaded_at).getTime()}`,
            type: "document",
            module: "Documents",
            title: `${upload.employee_name} updated ${label}`,
            message: `New file "${upload.original_file_name}" was uploaded from the Employee portal.`,
            date: upload.uploaded_at,
            time: shortDate(upload.uploaded_at),
            path: `/employees/employeedetails/${employeeSlug(upload.employee_name)}#employee-documents`,
        };
    });

    return [...requestNotifications, ...uploadNotifications];
}