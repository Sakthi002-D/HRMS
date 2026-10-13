import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, Upload } from "lucide-react";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { uploadEmployeeRequestFile } from "../../components/documents/employeeDocumentApi";
import { EmployeeDocumentPreviewModal } from "../../components/documents/EmployeeDocumentOverlays";
import DashboardLayout from "../../components/layout/DashboardLayout";
import Modal from "../../components/layout/common/Modal";
import { useConfirm } from "../../components/common/dialog/dialogContext";
import API_URL from "../../config/api";
import "./EmployeeRequests.css";

const REQUEST_STATUSES = ["Pending", "Approved", "Rejected"];

const formatRequestedDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Qatar",
    }).format(date);
};

const formatFieldLabel = (value) => String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const requestDetails = (details) => {
    if (!details || typeof details !== "object" || Array.isArray(details)) return [];
    return Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== "");
};

// Saved request types → the Employee portal's translation keys (same as REQUEST_KEYS in EmployeeRequestModal)
const REQUEST_KEYS = {
    "Salary Certificate": "salaryCertificate",
    "NOC Request": "nocRequest",
    "Letter Request": "letterRequest",
    "Expense Reimbursement": "expenseReimbursement",
};
const valueKey = (value) => String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");

const statusTone = (status = "") => {
    const normalized = status.toLowerCase();
    if (normalized === "pending") return "pending";
    if (normalized === "approved") return "approved";
    if (normalized === "rejected") return "rejected";
    return "other";
};

function EmployeeRequests() {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const [loaded, setLoaded] = useState({ rows: [], loading: true, error: "" });
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [uploadingId, setUploadingId] = useState(null);
    const [fileNotice, setFileNotice] = useState({ text: "", error: false });
    const [filePreview, setFilePreview] = useState(null);
    const [searchParams] = useSearchParams();
    const requestToOpen = searchParams.get("request");
    const openedFromLink = useRef(false);

    useEffect(() => {
        let ignore = false;
        fetch(`${API_URL}/api/hr/employee-requests`)
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || i18n.t("hrEmployeeRequests.errors.loadFailed", { defaultValue: "Unable to load employee requests" }));
                return data;
            })
            .then((rows) => !ignore && setLoaded({ rows, loading: false, error: "" }))
            .catch((error) => !ignore && setLoaded({ rows: [], loading: false, error: error.message }));
        return () => { ignore = true; };
    }, []);
        // Coming from a notification (?request=12): open that request's details once
    useEffect(() => {
        if (!requestToOpen || openedFromLink.current || loaded.loading) return;
        const match = loaded.rows.find((row) => String(row.id) === String(requestToOpen));
        if (match) {
            setSelectedRequest(match);
            openedFromLink.current = true;
        }
    }, [requestToOpen, loaded.loading, loaded.rows]);

    // Shown text only: saved types / statuses / detail values stay English (filters, colours and checks use them)
    const typeLabel = (type) => (REQUEST_KEYS[type] ? t(`employeeDocuments.requests.${REQUEST_KEYS[type]}.title`, { defaultValue: type }) : type);
    // Inside a sentence English shows the type in lower case ("salary certificate"); a translated title is kept as is
    const typeInSentence = (type) => (typeLabel(type) === type ? type.toLowerCase() : typeLabel(type));
    const statusLabel = (status) => (status ? t(`employeeDocuments.requestStatus.${valueKey(status)}`, { defaultValue: String(status) }) : status);
    // Detail labels: Arabic names live only in ar.json, so English keeps "Salary Month", "Destination"…
    const fieldLabel = (key) => t(`hrEmployeeRequests.fieldLabels.${key}`, { defaultValue: formatFieldLabel(key) });
    const detailValue = (key, value) => {
        if (typeof value === "object") return JSON.stringify(value);
        const text = String(value);
        if (key === "salary_month") return t(`employeeRequest.months.${valueKey(text)}`, { defaultValue: text });
        if (key === "letter_type") return t(`employeeRequest.options.letter_type.${valueKey(text)}`, { defaultValue: text });
        if (["amount", "expense_date", "salary_year"].includes(key)) return <span dir="ltr" className="ltr-text">{text}</span>;
        return <span dir="auto" className="hrreq-free-text">{text}</span>;
    };

    const requestTypes = useMemo(
        () => [...new Set(loaded.rows.map((request) => request.request_type).filter(Boolean))].sort((first, second) => first.localeCompare(second)),
        [loaded.rows]
    );

    const visibleRequests = useMemo(() => {
        const query = search.trim().toLowerCase();
        return loaded.rows.filter((request) => {
            const matchesSearch = !query || [request.employee_name, request.employee_id]
                .some((value) => String(value || "").toLowerCase().includes(query));
            const matchesType = typeFilter === "all" || request.request_type === typeFilter;
            const matchesStatus = statusFilter === "all" || String(request.status).toLowerCase() === statusFilter;
            return matchesSearch && matchesType && matchesStatus;
        });
    }, [loaded.rows, search, typeFilter, statusFilter]);
        // HR attaches the issued document (certificate / letter / receipt) to a request
    const attachFile = async (request, file) => {
        if (!file) return;
        setUploadingId(request.id);
        setFileNotice({ text: "", error: false });
        try {
            const saved = await uploadEmployeeRequestFile(request.id, file);
            const fileInfo = { file_name: saved.original_file_name, file_uploaded_at: saved.uploaded_at };
            setLoaded((current) => ({
                ...current,
                rows: current.rows.map((row) => (row.id === request.id ? { ...row, ...fileInfo } : row)),
            }));
            setSelectedRequest((current) => (current?.id === request.id ? { ...current, ...fileInfo } : current));
            setFileNotice({ text: t("hrEmployeeRequests.documentUploaded", { type: typeLabel(request.request_type), name: `\u2068${request.employee_name}\u2069`, defaultValue: "{{type}} document uploaded for {{name}}" }), error: false });
        } catch (error) {
            setFileNotice({ text: error.message, error: true });
        } finally {
            setUploadingId(null);
        }
    };

    const viewFile = (request) => {
        setFilePreview({
            requestId: request.id,
            original_file_name: request.file_name,
            displayName: t("hrEmployeeRequests.previewTitle", { type: typeLabel(request.request_type), name: `\u2068${request.employee_name}\u2069`, defaultValue: "{{type}} – {{name}}" }),
        });
    };

    const decideRequest = async (request, status) => {
        const approved = await confirm({
            variant: status === "Rejected" ? "danger" : "warning",
            title: status === "Rejected"
                ? t("hrEmployeeRequests.confirm.rejectTitle", { type: typeInSentence(request.request_type), defaultValue: "Rejected {{type}}?" })
                : t("hrEmployeeRequests.confirm.approveTitle", { type: typeInSentence(request.request_type), defaultValue: "Approved {{type}}?" }),
            message: status === "Rejected"
                ? t("hrEmployeeRequests.confirm.rejectMessage", { name: `\u2068${request.employee_name}\u2069`, id: `\u2066${request.employee_id}\u2069`, type: typeInSentence(request.request_type), defaultValue: "{{name}} ({{id}}) requested a {{type}}. This will mark the request as rejected." })
                : t("hrEmployeeRequests.confirm.approveMessage", { name: `\u2068${request.employee_name}\u2069`, id: `\u2066${request.employee_id}\u2069`, type: typeInSentence(request.request_type), defaultValue: "{{name}} ({{id}}) requested a {{type}}. This will mark the request as approved." }),
            cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
            confirmText: status === "Rejected" ? t("hrEmployeeRequests.confirm.reject", { defaultValue: "Rejected" }) : t("hrEmployeeRequests.confirm.approve", { defaultValue: "Approved" }),
            loadingText: status === "Rejected" ? t("hrEmployeeRequests.confirm.rejecting", { defaultValue: "Rejected..." }) : t("hrEmployeeRequests.confirm.approving", { defaultValue: "Approved..." }),
            onConfirm: async () => {
                setActionLoading(true);
                try {
                    const response = await fetch(`${API_URL}/api/hr/employee-requests/${request.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            status,
                            hr_response: status === "Approved"
                                ? "Your request has been approved."
                                : "Your request was rejected. Please contact HR for details.",
                        }),
                    });
                    const updated = await response.json();
                    if (!response.ok) throw new Error(updated.message || t("hrEmployeeRequests.errors.updateFailed", { defaultValue: "Unable to update employee request" }));
                    setLoaded((current) => ({
                        ...current,
                        rows: current.rows.map((row) => row.id === updated.id ? { ...row, ...updated } : row),
                    }));
                    setSelectedRequest((current) => current?.id === updated.id ? { ...current, ...updated } : current);
                } finally {
                    setActionLoading(false);
                }
            },
        });
        if (approved) setActionLoading(false);
    };

    return (
        <DashboardLayout>
            <div className="hrreq-page">
                <header className="hrreq-header">
                    <div>
                        <h1>{t("hrEmployeeRequests.title", { defaultValue: "Employee Requests" })}</h1>
                        <p>{t("hrEmployeeRequests.subtitle", { defaultValue: "Review and respond to employee document and certificate requests." })}</p>
                    </div>
                </header>

                <section className="hrreq-section" aria-label={t("hrEmployeeRequests.sectionLabel", { defaultValue: "Employee requests" })}>
                    <div className="hrreq-filters">
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t("hrEmployeeRequests.search", { defaultValue: "Search employee name or ID" })}
                            aria-label={t("hrEmployeeRequests.search", { defaultValue: "Search employee name or ID" })}
                        />
                        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label={t("hrEmployeeRequests.filterType", { defaultValue: "Filter by request type" })}>
                            <option value="all">{t("hrEmployeeRequests.allTypes", { defaultValue: "All request types" })}</option>
                            {requestTypes.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}
                        </select>
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label={t("hrEmployeeRequests.filterStatus", { defaultValue: "Filter by status" })}>
                            <option value="all">{t("hrEmployeeRequests.allStatuses", { defaultValue: "All statuses" })}</option>
                            {REQUEST_STATUSES.map((status) => <option key={status} value={status.toLowerCase()}>{statusLabel(status)}</option>)}
                        </select>
                    </div>

                    {loaded.error && <p className="hrreq-error" role="alert">{loaded.error}</p>}
                    {fileNotice.text && (
                        <p className={fileNotice.error ? "hrreq-error" : "hrreq-success"} role="status">{fileNotice.text}</p>
                    )}

                    <div className="hrreq-table-wrap">
                        <table className="hrreq-table">
                            <thead>
                                <tr>
                                    <th>{t("reports.common.employeeId", { defaultValue: "Employee ID" })}</th>
                                    <th>{t("reports.common.employeeName", { defaultValue: "Employee Name" })}</th>
                                    <th>{t("reports.common.department", { defaultValue: "Department" })}</th>
                                    <th>{t("hrEmployeeRequests.requestType", { defaultValue: "Request Type" })}</th>
                                    <th>{t("hrEmployeeRequests.requestedOn", { defaultValue: "Requested On" })}</th>
                                    <th>{t("reports.common.status", { defaultValue: "Status" })}</th>
                                    <th>{t("hrEmployeeRequests.action", { defaultValue: "Action" })}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loaded.loading ? (
                                    <tr><td colSpan="7" className="hrreq-empty">{t("hrEmployeeRequests.loading", { defaultValue: "Loading employee requests..." })}</td></tr>
                                ) : visibleRequests.length === 0 ? (
                                    <tr><td colSpan="7" className="hrreq-empty">{loaded.rows.length === 0 ? t("hrEmployeeRequests.empty", { defaultValue: "No employee requests yet." }) : t("hrEmployeeRequests.noMatch", { defaultValue: "No requests match these filters." })}</td></tr>
                                ) : visibleRequests.map((request) => (
                                    <tr key={request.id}>
                                        <td><span dir="ltr" className="ltr-text">{request.employee_id}</span></td>
                                        <td>{request.employee_name}</td>
                                        <td>{request.department || "—"}</td>
                                        <td>{typeLabel(request.request_type)}</td>
                                        <td><span dir="ltr" className="ltr-text">{formatRequestedDate(request.created_at)}</span></td>
                                        <td><span className={`hrreq-status ${statusTone(request.status)}`}>{statusLabel(request.status)}</span></td>
                                        <td>
                                            <div className="hrreq-actions">
                                                <button type="button" className="employee-view-button" onClick={() => setSelectedRequest(request)} aria-label={t("hrEmployeeRequests.viewRequestFrom", { name: request.employee_name, defaultValue: "View request from {{name}}" })} title={t("employeeDocuments.view", { defaultValue: "View" })}>
                                                    <Eye size={18} strokeWidth={2} aria-hidden="true" />
                                                </button>
                                                {String(request.status).toLowerCase() === "approved" && (
                                                    <label
                                                        className={`employee-view-button hrreq-upload-button${uploadingId === request.id ? " is-busy" : ""}${request.file_name ? " has-file" : ""}`}
                                                        title={request.file_name ? t("hrEmployeeRequests.replaceDocumentFile", { file: `\u2068${request.file_name}\u2069`, defaultValue: "Replace document ({{file}})" }) : t("hrEmployeeRequests.uploadForEmployee", { defaultValue: "Upload document for the employee" })}
                                                        aria-label={request.file_name ? t("hrEmployeeRequests.replaceDocument", { defaultValue: "Replace document" }) : t("hrEmployeeRequests.uploadDocument", { defaultValue: "Upload document" })}
                                                    >
                                                        <Upload size={17} strokeWidth={2} aria-hidden="true" />
                                                        <input
                                                            type="file"
                                                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                                            hidden
                                                            disabled={uploadingId === request.id}
                                                            onChange={(event) => {
                                                                const file = event.target.files?.[0];
                                                                event.target.value = "";
                                                                attachFile(request, file);
                                                            }}
                                                        />
                                                    </label>
                                                )}
                                                {String(request.status).toLowerCase() === "pending" && (
                                                    <span
                                                        className="employee-view-button hrreq-upload-button is-locked"
                                                        title={t("hrEmployeeRequests.approveFirst", { defaultValue: "Approve the request first, then upload the document" })}
                                                        aria-label={t("hrEmployeeRequests.uploadLocked", { defaultValue: "Upload locked until the request is approved" })}
                                                    >
                                                        <Upload size={17} strokeWidth={2} aria-hidden="true" />
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <Modal isOpen={Boolean(selectedRequest)} onClose={() => !actionLoading && setSelectedRequest(null)} title={t("hrEmployeeRequests.detailsTitle", { defaultValue: "Employee Request Details" })}>
                    {selectedRequest && (
                        <div className="employee-request-detail">
                            <div className="employee-request-detail-summary">
                                <div><span>{t("hrEmployeeRequests.employee", { defaultValue: "Employee" })}</span><strong>{selectedRequest.employee_name}</strong></div>
                                <div><span>{t("reports.common.employeeId", { defaultValue: "Employee ID" })}</span><strong><span dir="ltr" className="ltr-text">{selectedRequest.employee_id}</span></strong></div>
                                <div><span>{t("reports.common.department", { defaultValue: "Department" })}</span><strong>{selectedRequest.department || "—"}</strong></div>
                                <div><span>{t("hrEmployeeRequests.requestType", { defaultValue: "Request Type" })}</span><strong>{typeLabel(selectedRequest.request_type)}</strong></div>
                                <div><span>{t("hrEmployeeRequests.requestedOn", { defaultValue: "Requested On" })}</span><strong><span dir="ltr" className="ltr-text">{formatRequestedDate(selectedRequest.created_at)}</span></strong></div>
                                <div><span>{t("reports.common.status", { defaultValue: "Status" })}</span><strong><span className={`hrreq-status ${statusTone(selectedRequest.status)}`}>{statusLabel(selectedRequest.status)}</span></strong></div>
                            </div>
                            <h3>{t("hrEmployeeRequests.requestDetails", { defaultValue: "Request Details" })}</h3>
                            {requestDetails(selectedRequest.details).length ? (
                                <dl>
                                    {requestDetails(selectedRequest.details).map(([key, value]) => (
                                        <div key={key}>
                                            <dt>{fieldLabel(key)}</dt>
                                            <dd>{detailValue(key, value)}</dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : <p className="employee-request-no-details">{t("hrEmployeeRequests.noDetails", { defaultValue: "No additional details provided." })}</p>}
                            {selectedRequest.hr_response && <p className="employee-request-hr-response"><strong>{t("hrEmployeeRequests.hrResponse", { defaultValue: "HR response:" })}</strong> <span dir="auto" className="hrreq-free-text">{selectedRequest.hr_response}</span></p>}
                                                        <div className="hrreq-file-row">
                                <span>{t("hrEmployeeRequests.issuedDocument", { defaultValue: "Issued document" })}</span>
                                {selectedRequest.file_name ? (
                                    <>
                                        <strong><span dir="ltr" className="ltr-text">{selectedRequest.file_name}</span></strong>
                                        <button type="button" className="hrreq-file-view" onClick={() => viewFile(selectedRequest)}>
                                            <Eye size={14} aria-hidden="true" /> {t("employeeDocuments.view", { defaultValue: "View" })}
                                        </button>
                                    </>
                                ) : (
                                    <em>
                                        {String(selectedRequest.status).toLowerCase() === "approved"
                                            ? t("hrEmployeeRequests.notUploadedYet", { defaultValue: "Not uploaded yet. Use the upload icon in the table." })
                                            : String(selectedRequest.status).toLowerCase() === "rejected"
                                                ? t("hrEmployeeRequests.rejectedNoDocument", { defaultValue: "Request rejected – no document will be issued" })
                                                : t("hrEmployeeRequests.approveFirst", { defaultValue: "Approve the request first, then upload the document" })}
                                    </em>
                                )}
                            </div>
                            {String(selectedRequest.status).toLowerCase() === "pending" && (
                                <div className="employee-request-detail-actions">
                                    <button type="button" className="reject-request-button" onClick={() => decideRequest(selectedRequest, "Rejected")} disabled={actionLoading}>{t("hrEmployeeRequests.reject", { defaultValue: "Reject" })}</button>
                                    <button type="button" className="approve-request-button" onClick={() => decideRequest(selectedRequest, "Approved")} disabled={actionLoading}>{t("hrEmployeeRequests.approve", { defaultValue: "Approve" })}</button>
                                </div>
                            )}
                        </div>
                    )}
                </Modal>
                
                <EmployeeDocumentPreviewModal
                    document={filePreview}
                    isHR
                    onClose={() => setFilePreview(null)}
                    onError={(message) => setFileNotice({ text: message, error: true })}
                />
            </div>
        </DashboardLayout>
    );
}

export default EmployeeRequests;