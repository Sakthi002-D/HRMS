import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
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

const statusTone = (status = "") => {
    const normalized = status.toLowerCase();
    if (normalized === "pending") return "pending";
    if (normalized === "approved") return "approved";
    if (normalized === "rejected") return "rejected";
    return "other";
};

function EmployeeRequests() {
    const confirm = useConfirm();
    const [loaded, setLoaded] = useState({ rows: [], loading: true, error: "" });
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        let ignore = false;
        fetch(`${API_URL}/api/hr/employee-requests`)
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "Unable to load employee requests");
                return data;
            })
            .then((rows) => !ignore && setLoaded({ rows, loading: false, error: "" }))
            .catch((error) => !ignore && setLoaded({ rows: [], loading: false, error: error.message }));
        return () => { ignore = true; };
    }, []);

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

    const decideRequest = async (request, status) => {
        const approved = await confirm({
            variant: status === "Rejected" ? "danger" : "warning",
            title: `${status} ${request.request_type.toLowerCase()}?`,
            message: `${request.employee_name} (${request.employee_id}) requested a ${request.request_type.toLowerCase()}. This will mark the request as ${status.toLowerCase()}.`,
            cancelText: "Cancel",
            confirmText: status,
            loadingText: `${status}...`,
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
                    if (!response.ok) throw new Error(updated.message || "Unable to update employee request");
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
                        <h1>Employee Requests</h1>
                        <p>Review and respond to employee document and certificate requests.</p>
                    </div>
                </header>

                <section className="hrreq-section" aria-label="Employee requests">
                    <div className="hrreq-filters">
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search employee name or ID"
                            aria-label="Search employee name or ID"
                        />
                        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by request type">
                            <option value="all">All request types</option>
                            {requestTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
                            <option value="all">All statuses</option>
                            {REQUEST_STATUSES.map((status) => <option key={status} value={status.toLowerCase()}>{status}</option>)}
                        </select>
                    </div>

                    {loaded.error && <p className="hrreq-error" role="alert">{loaded.error}</p>}

                    <div className="hrreq-table-wrap">
                        <table className="hrreq-table">
                            <thead>
                                <tr>
                                    <th>Employee ID</th>
                                    <th>Employee Name</th>
                                    <th>Department</th>
                                    <th>Request Type</th>
                                    <th>Requested On</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loaded.loading ? (
                                    <tr><td colSpan="7" className="hrreq-empty">Loading employee requests...</td></tr>
                                ) : visibleRequests.length === 0 ? (
                                    <tr><td colSpan="7" className="hrreq-empty">{loaded.rows.length === 0 ? "No employee requests yet." : "No requests match these filters."}</td></tr>
                                ) : visibleRequests.map((request) => (
                                    <tr key={request.id}>
                                        <td>{request.employee_id}</td>
                                        <td>{request.employee_name}</td>
                                        <td>{request.department || "—"}</td>
                                        <td>{request.request_type}</td>
                                        <td>{formatRequestedDate(request.created_at)}</td>
                                        <td><span className={`hrreq-status ${statusTone(request.status)}`}>{request.status}</span></td>
                                        <td>
                                            <button type="button" className="employee-view-button" onClick={() => setSelectedRequest(request)} aria-label={`View request from ${request.employee_name}`} title="View">
                                                <Eye size={18} strokeWidth={2} aria-hidden="true" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <Modal isOpen={Boolean(selectedRequest)} onClose={() => !actionLoading && setSelectedRequest(null)} title="Employee Request Details">
                    {selectedRequest && (
                        <div className="employee-request-detail">
                            <div className="employee-request-detail-summary">
                                <div><span>Employee</span><strong>{selectedRequest.employee_name}</strong></div>
                                <div><span>Employee ID</span><strong>{selectedRequest.employee_id}</strong></div>
                                <div><span>Department</span><strong>{selectedRequest.department || "—"}</strong></div>
                                <div><span>Request Type</span><strong>{selectedRequest.request_type}</strong></div>
                                <div><span>Requested On</span><strong>{formatRequestedDate(selectedRequest.created_at)}</strong></div>
                                <div><span>Status</span><strong><span className={`hrreq-status ${statusTone(selectedRequest.status)}`}>{selectedRequest.status}</span></strong></div>
                            </div>
                            <h3>Request Details</h3>
                            {requestDetails(selectedRequest.details).length ? (
                                <dl>
                                    {requestDetails(selectedRequest.details).map(([key, value]) => (
                                        <div key={key}>
                                            <dt>{formatFieldLabel(key)}</dt>
                                            <dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : <p className="employee-request-no-details">No additional details provided.</p>}
                            {selectedRequest.hr_response && <p className="employee-request-hr-response"><strong>HR response:</strong> {selectedRequest.hr_response}</p>}
                            {String(selectedRequest.status).toLowerCase() === "pending" && (
                                <div className="employee-request-detail-actions">
                                    <button type="button" className="reject-request-button" onClick={() => decideRequest(selectedRequest, "Rejected")} disabled={actionLoading}>Reject</button>
                                    <button type="button" className="approve-request-button" onClick={() => decideRequest(selectedRequest, "Approved")} disabled={actionLoading}>Approve</button>
                                </div>
                            )}
                        </div>
                    )}
                </Modal>
            </div>
        </DashboardLayout>
    );
}

export default EmployeeRequests;