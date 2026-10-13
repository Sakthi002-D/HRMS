// Manpower Requests: list, "My Approvals", form and detail.
// Used on the HR Recruitment page and in the Employee portal (coordinators and approvers).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "../../pages/hr/Recruitment.css";
import "./recruitment.css";
import MprDetail from "./MprDetail";
import MprForm from "./MprForm";
import { Eye } from "lucide-react";
import { usePagination, RowsPerPage, Pagination } from "../common/TablePagination";
import { api, formatDateRange, mprStatusLabel, notifyMprsChanged, recruitmentValueLabel, statusTone } from "./recruitmentApi";

function ManpowerRequests({ actorId, formOpen, onFormOpenChange, onChanged, showNewButton = true }) {
    const { t } = useTranslation();
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
        setNotice(action === "submit"
            ? t("recruitment.mpr.submittedNotice", { number: mpr.mpr_no, status: mprStatusLabel(mpr.status), defaultValue: "{{number}} submitted: {{status}}" })
            : t("recruitment.mpr.draftNotice", { number: mpr.mpr_no, defaultValue: "{{number}} saved as draft" }));
        refresh();
    };
    const rows = scope === "approvals" ? lists.approvals : lists.all;
    const pager = usePagination(rows);
    const { setPage } = pager;

    // Switching between "Manpower Requests" and "My Approvals" goes back to page 1
    useEffect(() => { setPage(1); }, [scope, setPage]);

    if (metaError) return <p className="mpr-form-error">{metaError}</p>;
    if (!meta) return <p className="mpr-muted">{t("recruitment.mpr.loadingList", { defaultValue: "Loading manpower requests..." })}</p>;

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
                    {t("recruitment.mpr.cannotRaise", { defaultValue: "Only HR or a Department Coordinator can raise a Manpower Request. Ask HR to assign you in Settings → Approval Workflows." })}
                </p>
            )}

            {notice && <p className="mpr-notice">{notice}</p>}

            <div className="jobs-section">
                <div className="jobs-section-header">
                    <div className="mpr-subtabs" role="tablist">
                        <button type="button" role="tab" aria-selected={scope === "all"} className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>
                            {t("recruitment.tabs.manpower", { defaultValue: "Manpower Requests" })}
                        </button>
                        <button type="button" role="tab" aria-selected={scope === "approvals"} className={scope === "approvals" ? "active" : ""} onClick={() => setScope("approvals")}>
                            {t("recruitment.mpr.myApprovals", { defaultValue: "My Approvals" })} {lists.approvals.length > 0 && <span className="mpr-count">{lists.approvals.length}</span>}
                        </button>
                    </div>
                    <div className="tp-header-actions">
                        <RowsPerPage value={pager.pageSize} onChange={pager.setPageSize} />
                        {showNewButton && meta.canRaise && !formVisible && (
                            <button type="button" className="create-job-btn" onClick={() => setFormOpen(true)}>
                                {t("recruitment.mpr.newButton", { defaultValue: "+ New Manpower Request" })}
                            </button>
                        )}
                    </div>
                </div>


                <div className="jobs-table-container">
                    <table className="jobs-table">
                        <thead>
                            <tr>
                                <th>{t("recruitment.fields.mprNo", { defaultValue: "MPR No" })}</th>
                                <th>{t("recruitment.fields.requestType", { defaultValue: "Request Type" })}</th>
                                <th>{t("recruitment.fields.jobTitle", { defaultValue: "Job Title" })}</th>
                                <th>{t("profileEdit.fields.department", { defaultValue: "Department" })}</th>
                                <th>{t("recruitment.mpr.openings", { defaultValue: "Openings" })}</th>
                                <th>{t("recruitment.mpr.budget", { defaultValue: "Budget" })}</th>
                                <th>{t("profileEdit.fields.status", { defaultValue: "Status" })}</th>
                                <th>{t("recruitment.mpr.raisedBy", { defaultValue: "Raised By" })}</th>
                                <th>{t("recruitment.mpr.applicationPeriod", { defaultValue: "Application Period" })}</th>
                                <th>{t("recruitment.fields.action", { defaultValue: "Action" })}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="10">{t("recruitment.common.loading", { defaultValue: "Loading..." })}</td></tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan="10">
                                        {scope === "approvals"
                                            ? t("recruitment.mpr.nothingToApprove", { defaultValue: "Nothing is waiting for your approval." })
                                            : t("recruitment.mpr.noRequests", { defaultValue: "No manpower requests yet." })}
                                    </td>
                                </tr>
                            ) : pager.pageItems.map((mpr) => (
                                <tr key={mpr.id} className={mpr.awaiting_me ? "mpr-row-awaiting" : ""}>
                                    <td><span dir="ltr" className="ltr-text">{mpr.mpr_no}</span></td>
                                    <td>{recruitmentValueLabel("requestType", mpr.request_type)}</td>
                                    <td><strong>{mpr.title || t("recruitment.mpr.untitled", { defaultValue: "Untitled" })}</strong></td>
                                    <td>{mpr.department}</td>
                                    <td>{mpr.openings ?? "—"}</td>
                                    <td>
                                        {mpr.budget_status ? (
                                            <span className={`mpr-budget-pill ${mpr.budget_status}`}>
                                                {mpr.budget_status === "within"
                                                    ? t("recruitment.budget.within", { defaultValue: "Within budget" })
                                                    : t("recruitment.budget.exception", { defaultValue: "Budget exception" })}
                                            </span>
                                        ) : "—"}
                                    </td>
                                    <td><span className={`mpr-status ${statusTone(mpr.status)}`}>{mprStatusLabel(mpr.status)}</span></td>
                                    <td>{mpr.requested_by_name || mpr.requested_by || "—"}</td>
                                    <td><span dir="ltr" className="ltr-text">{formatDateRange(mpr.application_start_date, mpr.application_end_date)}</span></td>
                                    <td>
                                        <button type="button" className="employee-view-button" onClick={() => setSelectedId(mpr.id)} aria-label={t("recruitment.common.view", { defaultValue: "View" })} title={t("recruitment.common.view", { defaultValue: "View" })}>
                                            <Eye size={18} strokeWidth={2} aria-hidden="true" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <Pagination page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} />
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
