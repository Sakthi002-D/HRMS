// Manpower Requests: list, "My Approvals", form and detail.
// Used on the HR Recruitment page and in the Employee portal (coordinators and approvers).
import { useEffect, useState } from "react";
import "../../pages/hr/Recruitment.css";
import "./recruitment.css";
import MprDetail from "./MprDetail";
import MprForm from "./MprForm";
import { api, formatDate, notifyMprsChanged, statusTone } from "./recruitmentApi";

function ManpowerRequests({ actorId, formOpen, onFormOpenChange, onChanged, showNewButton = true }) {
    const [meta, setMeta] = useState(null);
    const [metaError, setMetaError] = useState("");
    const [scope, setScope] = useState("all");
    const [version, setVersion] = useState(0);
    const [lists, setLists] = useState({ key: null, all: [], approvals: [] });
    const [selectedId, setSelectedId] = useState(null);
    const [editing, setEditing] = useState(null);
    const [internalFormOpen, setInternalFormOpen] = useState(false);
    const [notice, setNotice] = useState("");

    const isFormOpen = formOpen ?? internalFormOpen;
    const setFormOpen = onFormOpenChange ?? setInternalFormOpen;

    useEffect(() => {
        if (!actorId) return undefined;
        let ignore = false;
        api(`/api/recruitment/meta?employee_id=${encodeURIComponent(actorId)}`)
            .then((data) => !ignore && setMeta(data))
            .catch((err) => !ignore && setMetaError(err.message));
        return () => { ignore = true; };
    }, [actorId]);

    const listKey = `${actorId}:${version}`;

    useEffect(() => {
        if (!actorId) return undefined;
        let ignore = false;
        const id = encodeURIComponent(actorId);
        Promise.all([api(`/api/mprs?employee_id=${id}&scope=all`), api(`/api/mprs?employee_id=${id}&scope=approvals`)])
            .then(([all, approvals]) => !ignore && setLists({ key: listKey, all, approvals }))
            .catch(() => !ignore && setLists({ key: listKey, all: [], approvals: [] }));
        return () => { ignore = true; };
    }, [actorId, listKey]);

    const refresh = () => {
        setVersion((value) => value + 1);
        notifyMprsChanged();
        onChanged?.();
    };

    const closeForm = () => {
        setFormOpen(false);
        setEditing(null);
    };

    const handleSaved = (mpr, action) => {
        closeForm();
        setNotice(action === "submit" ? `${mpr.mpr_no} submitted: ${mpr.status}` : `${mpr.mpr_no} saved as draft`);
        refresh();
    };

    if (metaError) return <p className="mpr-form-error">{metaError}</p>;
    if (!meta) return <p className="mpr-muted">Loading manpower requests...</p>;

    const rows = scope === "approvals" ? lists.approvals : lists.all;
    const loading = lists.key !== listKey && rows.length === 0;
    const formVisible = (isFormOpen && meta.canRaise) || editing;

    return (
        <div className="mpr-module">
            {formVisible && (
                <MprForm
                    key={editing?.id || "new"}
                    meta={meta}
                    actorId={actorId}
                    mpr={editing}
                    onClose={closeForm}
                    onSaved={handleSaved}
                />
            )}

            {isFormOpen && !meta.canRaise && (
                <p className="mpr-form-error">
                    Only HR or a Department Coordinator can raise a Manpower Request. Ask HR to assign you in Settings → Approval Workflows.
                </p>
            )}

            {notice && <p className="mpr-notice">{notice}</p>}

            <div className="jobs-section">
                <div className="jobs-section-header">
                    <div className="mpr-subtabs" role="tablist">
                        <button type="button" role="tab" aria-selected={scope === "all"} className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>
                            Manpower Requests
                        </button>
                        <button type="button" role="tab" aria-selected={scope === "approvals"} className={scope === "approvals" ? "active" : ""} onClick={() => setScope("approvals")}>
                            My Approvals {lists.approvals.length > 0 && <span className="mpr-count">{lists.approvals.length}</span>}
                        </button>
                    </div>
                    {showNewButton && meta.canRaise && !formVisible && (
                        <button type="button" className="create-job-btn" onClick={() => setFormOpen(true)}>
                            + New Manpower Request
                        </button>
                    )}
                </div>

                <div className="jobs-table-container">
                    <table className="jobs-table">
                        <thead>
                            <tr>
                                <th>MPR No</th>
                                <th>Request Type</th>
                                <th>Job Title</th>
                                <th>Department</th>
                                <th>Openings</th>
                                <th>Budget</th>
                                <th>Status</th>
                                <th>Raised By</th>
                                <th>Required By</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="10">Loading...</td></tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan="10">
                                        {scope === "approvals" ? "Nothing is waiting for your approval." : "No manpower requests yet."}
                                    </td>
                                </tr>
                            ) : rows.map((mpr) => (
                                <tr key={mpr.id} className={mpr.awaiting_me ? "mpr-row-awaiting" : ""}>
                                    <td>{mpr.mpr_no}</td>
                                    <td>{mpr.request_type}</td>
                                    <td><strong>{mpr.title || "Untitled"}</strong></td>
                                    <td>{mpr.department}</td>
                                    <td>{mpr.openings ?? "—"}</td>
                                    <td>
                                        {mpr.budget_status ? (
                                            <span className={`mpr-budget-pill ${mpr.budget_status}`}>
                                                {mpr.budget_status === "within" ? "Within budget" : "Budget exception"}
                                            </span>
                                        ) : "—"}
                                    </td>
                                    <td><span className={`mpr-status ${statusTone(mpr.status)}`}>{mpr.status}</span></td>
                                    <td>{mpr.requested_by_name || mpr.requested_by || "—"}</td>
                                    <td>{formatDate(mpr.required_by)}</td>
                                    <td>
                                        <button type="button" className="create-job-btn" onClick={() => setSelectedId(mpr.id)}>
                                            {mpr.awaiting_me ? "Review" : "View"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedId && (
                <MprDetail
                    mprId={selectedId}
                    actorId={actorId}
                    meta={meta}
                    onClose={() => setSelectedId(null)}
                    onChanged={refresh}
                    onEdit={(mpr) => {
                        setSelectedId(null);
                        setEditing(mpr);
                    }}
                />
            )}
        </div>
    );
}

export default ManpowerRequests;
