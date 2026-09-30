// MPR detail: request fields, budget badge, approval tracker, tracking log and approver actions.
import { useEffect, useState } from "react";
import "../../pages/hr/Recruitment.css";
import "./recruitment.css";
import MprTracker from "./MprTracker";
import { useConfirm } from "../common/dialog/dialogContext";
import { BudgetDetails, BudgetStatusPill } from "./MprBudget";
import { api, formatDate, formatDateTime, formatMoney, getCompanyCurrency, statusTone } from "./recruitmentApi";

const yesNo = (value) => (value ? "Yes" : "No");

function MprDetail({ mprId, actorId, meta, onClose, onChanged, onEdit }) {
    const confirm = useConfirm();
    const [version, setVersion] = useState(0);
    const [loaded, setLoaded] = useState({ key: null, mpr: null, error: "" });
    const [remark, setRemark] = useState("");
    const [busy, setBusy] = useState("");
    const [actionError, setActionError] = useState("");

    const loadKey = `${mprId}:${version}`;

    useEffect(() => {
        let ignore = false;
        api(`/api/mprs/${mprId}?employee_id=${encodeURIComponent(actorId)}`)
            .then((mpr) => !ignore && setLoaded({ key: loadKey, mpr, error: "" }))
            .catch((err) => !ignore && setLoaded({ key: loadKey, mpr: null, error: err.message }));
        return () => { ignore = true; };
    }, [mprId, actorId, loadKey]);

    // Keep showing the previous data while refreshing after an action
    const mpr = loaded.mpr;
    const loading = loaded.key !== loadKey && !mpr;

    const runAction = async (action) => {
        if ((action === "reject" || action === "send-back") && !remark.trim()) {
            setActionError(action === "reject" ? "Enter the reason for rejecting." : "Enter a remark for the coordinator.");
            return;
        }
        if (action === "cancel") {
            const cancelled = await confirm({
                variant: "danger",
                title: "Cancel manpower request?",
                message: <>Manpower request <strong>{mpr.mpr_no}</strong> will be cancelled. This can't be undone.</>,
                cancelText: "Keep MPR",
                confirmText: "Yes, Cancel MPR",
            });
            if (!cancelled) return;
        }

        setBusy(action);
        setActionError("");
        try {
            await api(`/api/mprs/${mprId}/${action}`, { method: "POST", body: { actor_id: actorId, remark } });
            setRemark("");
            setVersion((value) => value + 1);
            onChanged?.();
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy("");
        }
    };

    const assets = (mpr?.assets || []).map((asset) => (asset === "Other" && mpr.asset_other ? `Other: ${mpr.asset_other}` : asset));
    const currency = mpr?.currency || getCompanyCurrency(meta.currency);

    return (
        <div className="candidate-modal-overlay" onClick={onClose}>
            <div className="candidate-modal mpr-detail" onClick={(event) => event.stopPropagation()}>
                <div className="candidate-modal-header">
                    <div>
                        <h2>{mpr ? `${mpr.mpr_no} · ${mpr.title || "Untitled"}` : "Manpower Request"}</h2>
                        {mpr && (
                            <span>
                                {mpr.request_type} · {mpr.department} · raised by {mpr.requested_by_name || mpr.requested_by}
                            </span>
                        )}
                    </div>
                    <button type="button" className="candidate-modal-close" onClick={onClose}>×</button>
                </div>

                {loading && <p className="mpr-muted">Loading...</p>}
                {loaded.error && !mpr && <p className="mpr-form-error">{loaded.error}</p>}

                {mpr && (
                    <>
                        <div className="mpr-detail-status">
                            <span className={`mpr-status ${statusTone(mpr.status)}`}>{mpr.status}</span>
                            {mpr.job_id && <span className="mpr-chip">Job {mpr.job_id}</span>}
                        </div>

                        {mpr.request_type === "New Position" && mpr.budget_snapshot && (
                            <section className="mpr-budget-summary">
                                <BudgetStatusPill budget={mpr.budget_snapshot} />
                                <BudgetDetails budget={mpr.budget_snapshot} currency={currency} audience="approver" />
                                {mpr.budget_status === "exception" && mpr.justification && (
                                    <p className="mpr-budget-justification"><strong>Justification:</strong> {mpr.justification}</p>
                                )}
                            </section>
                        )}

                        <MprTracker mpr={mpr} />

                        {/* APPROVER ACTIONS */}
                        {mpr.permissions?.canApprove && (
                            <section className="candidate-section mpr-actions-panel">
                                <h3>Your decision</h3>
                                {mpr.budget_status === "exception" && (
                                    <p className="mpr-warning">
                                        {mpr.budget_snapshot?.status === "no_budget" ? "No budget set" : "Budget exceeded"}: review the budget details above and the justification before approving.
                                    </p>
                                )}
                                <textarea
                                    rows="3"
                                    value={remark}
                                    onChange={(event) => setRemark(event.target.value)}
                                    placeholder="Remark (required to reject or send back)"
                                />
                                {actionError && <p className="mpr-form-error">{actionError}</p>}
                                <div className="mpr-action-buttons">
                                    <button type="button" className="mpr-btn danger" onClick={() => runAction("reject")} disabled={Boolean(busy)}>
                                        {busy === "reject" ? "Rejecting..." : "Reject"}
                                    </button>
                                    <button type="button" className="mpr-btn warning" onClick={() => runAction("send-back")} disabled={Boolean(busy)}>
                                        {busy === "send-back" ? "Sending back..." : "Send Back"}
                                    </button>
                                    <button type="button" className="mpr-btn success" onClick={() => runAction("approve")} disabled={Boolean(busy)}>
                                        {busy === "approve" ? "Approving..." : "Approve"}
                                    </button>
                                </div>
                            </section>
                        )}

                        {(mpr.permissions?.canEdit || mpr.permissions?.canCancel) && (
                            <div className="mpr-owner-actions">
                                {!mpr.permissions?.canApprove && actionError && <p className="mpr-form-error">{actionError}</p>}
                                {mpr.permissions.canCancel && (
                                    <button type="button" className="cancel-btn" onClick={() => runAction("cancel")} disabled={Boolean(busy)}>
                                        Cancel MPR
                                    </button>
                                )}
                                {mpr.permissions.canEdit && (
                                    <button type="button" className="save-job-btn" onClick={() => onEdit(mpr)}>
                                        {mpr.status === "Sent Back" ? "Edit & Resubmit" : "Edit Draft"}
                                    </button>
                                )}
                            </div>
                        )}

                        <section className="candidate-section">
                            <h3>Position</h3>
                            <div className="candidate-grid">
                                <div><label>Job Title</label><p>{mpr.title || "—"}</p></div>
                                <div><label>No. of Openings</label><p>{mpr.openings ?? "—"}</p></div>
                                <div><label>Experience</label><p>{mpr.experience || "—"}</p></div>
                                <div><label>Location</label><p>{mpr.location || "—"}</p></div>
                                <div><label>Employment Type</label><p>{mpr.employment_type || "—"}</p></div>
                                <div><label>Grade</label><p>{mpr.grade || "—"}</p></div>
                                <div><label>Required By</label><p>{formatDate(mpr.required_by)}</p></div>
                                <div><label>Required Skills</label><p>{mpr.skills || "—"}</p></div>
                                {mpr.request_type === "Replacement" && (
                                    <>
                                        <div><label>Replacing</label><p>{mpr.replaced_employee_name ? `${mpr.replaced_employee_name} (${mpr.replaced_employee_id})` : "—"}</p></div>
                                        <div><label>Replacement Reason</label><p>{mpr.replacement_reason || "—"}</p></div>
                                    </>
                                )}
                                <div className="full-width"><label>Job Description</label><p>{mpr.job_description || "—"}</p></div>
                                <div className="full-width"><label>Justification</label><p>{mpr.justification || "—"}</p></div>
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>Compensation, Benefits & Assets</h3>
                            <div className="candidate-grid">
                                <div><label>Salary (per month)</label><p>{currency} {formatMoney(mpr.salary_min)} – {formatMoney(mpr.salary_max)}</p></div>
                                <div><label>Air Ticket</label><p>{yesNo(mpr.benefits?.air_ticket)}</p></div>
                                <div><label>Vehicle</label><p>{yesNo(mpr.benefits?.vehicle)}</p></div>
                                <div><label>Accommodation</label><p>{yesNo(mpr.benefits?.accommodation)}</p></div>
                                <div><label>Medical Insurance</label><p>{mpr.benefits?.medical_insurance_category || "—"}</p></div>
                                <div><label>Allowances</label><p>{mpr.benefits?.allowances || "—"}</p></div>
                                <div className="full-width"><label>Assets Required</label><p>{assets.length ? assets.join(", ") : "None"}</p></div>
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>Approvers</h3>
                            <div className="candidate-grid">
                                {mpr.workflow.map((step, index) => (
                                    <div key={`${step.role}-${index}`}>
                                        <label>{index + 1}. {step.label}</label>
                                        <p className={step.approvers.length ? "" : "mpr-warning-text"}>
                                            {step.approvers.length ? step.approvers.map((person) => person.name).join(", ") : "No approver assigned (Settings → Approval Workflows)"}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>Tracking details</h3>
                            <table className="jobs-table mpr-log">
                                <thead>
                                    <tr><th>Date</th><th>Action</th><th>By</th><th>Remark</th></tr>
                                </thead>
                                <tbody>
                                    {mpr.actions.map((action) => (
                                        <tr key={action.id}>
                                            <td>{formatDateTime(action.created_at)}</td>
                                            <td>
                                                <strong>{action.action}</strong>
                                                {action.step_role && <small> · {meta.roleLabels[action.step_role] || action.step_role}</small>}
                                            </td>
                                            <td>{action.actor_name || "System"}</td>
                                            <td>{action.remark || "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}

export default MprDetail;
