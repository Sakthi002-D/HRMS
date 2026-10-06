import API_URL from "../../config/api";

// The logged-in user's ID (HR or employee). The backend uses it to decide what they may do.
function getActorId(isHR) {
    try {
        const session = JSON.parse(sessionStorage.getItem(isHR ? "loggedInHR" : "loggedInEmployee") || "{}");
        return session.employee_id || "";
    } catch {
        return "";
    }
}

const documentsRoot = (employeeId) => `/api/employees/${encodeURIComponent(employeeId)}/documents`;

// Adds ?actor_id=... to every request, then turns errors into readable messages
async function requestDocument(path, isHR, options = {}, extraQuery = "") {
    const separator = path.includes("?") ? "&" : "?";
    const url = `${API_URL}${path}${separator}actor_id=${encodeURIComponent(getActorId(isHR))}${extraQuery}`;
    const response = await fetch(url, options);
    if (!response.ok) {
        let message = "Document request failed";
        try {
            message = (await response.json()).message || message;
        } catch {
            // Keep the generic message when the server did not return JSON.
        }
        throw new Error(message);
    }
    return response;
}

// All uploaded documents of one employee → [{ doc_type, original_file_name, uploaded_at, ... }]
export async function listEmployeeDocuments(employeeId, isHR = false) {
    const response = await requestDocument(documentsRoot(employeeId), isHR, { cache: "no-store" });
    return response.json();
}

export async function uploadEmployeeDocument(employeeId, docType, file, isHR = false) {
    const formData = new FormData();
    formData.append("document", file);
    const response = await requestDocument(`${documentsRoot(employeeId)}/${encodeURIComponent(docType)}`, isHR, {
        method: "POST",
        body: formData,
    });
    return response.json();
}

export async function fetchEmployeeDocumentFile(employeeId, document, isHR = false, download = false) {
    const filePath = `${documentsRoot(employeeId)}/${encodeURIComponent(document.doc_type)}/file`;
    const response = await requestDocument(filePath, isHR, { cache: "no-store" }, download ? "&download=1" : "");
    return response.blob();
}

export async function downloadEmployeeDocument(employeeId, document, isHR = false) {
    const blob = await fetchEmployeeDocumentFile(employeeId, document, isHR, true);
    const objectUrl = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = objectUrl;
    link.download = document.original_file_name;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
}

export function formatDocumentDate(value) {
    if (!value) return "Unknown date";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Qatar",
    }).format(date);
}