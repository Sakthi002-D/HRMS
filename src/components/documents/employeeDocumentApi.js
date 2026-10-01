import API_URL from "../../config/api";

const documentApiRoot = (employeeId, isHR) => isHR
    ? `/api/employees/${encodeURIComponent(employeeId)}/documents`
    : "/api/employee/documents";

function getDocumentToken(isHR) {
    try {
        const session = JSON.parse(sessionStorage.getItem(isHR ? "loggedInHR" : "loggedInEmployee") || "{}");
        return session.document_auth_token || "";
    } catch {
        return "";
    }
}

async function requestDocument(path, isHR, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${getDocumentToken(isHR)}`,
        },
    });
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

export async function uploadEmployeeDocument(employeeId, docType, file, isHR = false) {
    const formData = new FormData();
    formData.append("document", file);
    const response = await requestDocument(`${documentApiRoot(employeeId, isHR)}/${encodeURIComponent(docType)}`, isHR, {
        method: "POST",
        body: formData,
    });
    return response.json();
}

export async function fetchEmployeeDocumentFile(employeeId, document, isHR = false, download = false) {
    const suffix = download ? "?download=1" : "";
    const filePath = `${documentApiRoot(employeeId, isHR)}/${encodeURIComponent(document.doc_type)}/file${suffix}`;
    const response = await requestDocument(filePath, isHR);
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