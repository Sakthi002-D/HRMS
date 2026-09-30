// Resignation detail for approvers (Line Manager in the Employee portal, HR in the HR portal):
// request fields, progress tracker, tracking log and Approve/Accept/Reject actions.
import { useEffect, useState } from "react";
import { useConfirm } from "../common/dialog/dialogContext";
import useScrollLock from "../common/dialog/useScrollLock";
import DatePicker from "../layout/common/DatePicker";
import "../../pages/hr/Recruitment.css";
import "../recruitment/recruitment.css";
import "./resignation.css";
import ResignationTracker from "./ResignationTracker";
import { api, daysLabel, formatDate, formatDateTime, resignationTone } from "./resignationApi";

export function ResignationLog({ actions }) {
    return (
        <table className="jobs-table mpr-log">
            <thead>
                <tr><th>Date &amp; time</th><th>Action</th><th>By</th><th>Remark</th></tr>
            </thead>
            <tbody>
                {actions.map((action) => (
                    <tr key={action.id}>
                        <td>{formatDateTime(action.created_at)}</td>
                        <td><strong>{action.action}</strong>{action.step_role && <small> · {action.step_role === "HR" ? "HR" : action.step_role === "LINE_MANAGER" ? "Line Manager" : "Department Head"}</small>}</td>
                        <td>{action.actor_name || "System"}</td>
                        <td>{action.remark || "—"}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export function EarlyReleaseNote({ resignation }) {
    if (!resignation.early_release) return null;
    const pending = resignation.status.startsWith("Pending ");
    return (
        <div className="resignation-early-note">
            <strong>{pending ? "Early release requested – subject to approval" : "Early release requested"}</strong>
            <span>
                Last working day {formatDate(resignation.requested_last_working_day)} instead of {formatDate(resignation.calculated_last_working_day)}.
                {resignation.early_release_reason ? ` Reason: ${resignation.early_release_reason}` : ""}
            </span>
        </div>
    );
}

// onDecided({ action, resignation }) runs after a successful decision; when given,
// the parent closes the modal (HR Resignations page). Otherwise it reloads in place.
function ResignationDetail({ resignationId, actorId, onClose, onChanged, onDecided }) {
    const [version, setVersion] = useState(0);
    const [loaded, setLoaded] = useState({ key: null, resignation: null, error: "" });
    const [remark, setRemark] = useState("");
    const [lastWorkingDay, setLastWorkingDay] = useState("");
    const [busy, setBusy] = useState("");
    const [actionError, setActionError] = useState("");
    const confirm = useConfirm();
    useScrollLock(true);

    const loadKey = `${resignationId}:${version}`;

    useEffect(() => {
        let ignore = false;
        api(`/api/resignations/${resignationId}?employee_id=${encodeURIComponent(actorId)}`)
            .then((resignation) => {
                if (ignore) return;
                setLoaded({ key: loadKey, resignation, error: "" });
                setLastWorkingDay(resignation.last_working_day);
            })
            .catch((err) => !ignore && setLoaded({ key: loadKey, resignation: null, error: err.message }));
        return () => { ignore = true; };
    }, [resignationId, actorId, loadKey]);

    const resignation = loaded.resignation;
    const loading = loaded.key !== loadKey && !resignation;
    const isFinalStep = resignation?.permissions?.isFinalStep;
    const lwdChanged = isFinalStep && lastWorkingDay && lastWorkingDay !== resignation.last_working_day;

    const runAction = async (action) => {
        if (action === "reject" && !remark.trim()) {
            setActionError("Enter a reason for rejecting");
            return;
        }
        if (action === "approve" && isFinalStep) {
            if (!lastWorkingDay) return setActionError("Choose the last working day.");
            if (lastWorkingDay < resignation.today) return setActionError("Last working day can't be in the past.");
            if (lwdChanged && !remark.trim()) return setActionError("Enter a remark explaining the changed last working day.");
        }

        setActionError("");
        const accepting = action === "approve" && isFinalStep;
        const reason = remark.trim();
        let updated = null;
        const confirmed = await confirm({
            variant: action === "reject" ? "danger" : "success",
            title: action === "reject" ? "Reject resignation?" : accepting ? "Accept resignation?" : "Approve resignation?",
            message: action === "reject" ? (
                <>
                    <p>{resignation.resignation_no} for {resignation.employee_name} will be rejected and the employee will be notified.</p>
                    <p className="resignation-dialog-reason">Reason: {reason}</p>
                </>
            ) : accepting ? (
                <>
                    <p>{resignation.employee_name} will start serving notice with the last working day on {formatDate(lastWorkingDay)}.</p>
                    {reason && <p className="resignation-dialog-reason">Remark: {reason}</p>}
                </>
            ) : `${resignation.resignation_no} will move to the next approver.`,
            confirmText: action === "reject" ? "Reject" : accepting ? "Accept" : "Approve",
            loadingText: action === "reject" ? "Rejecting..." : "Saving...",
            onConfirm: async () => {
                setBusy(action);
                try {
                    updated = await api(`/api/resignations/${resignationId}/${action}`, {
                        method: "POST",
                        body: { actor_id: actorId, remark, ...(accepting ? { last_working_day: lastWorkingDay } : {}) },
                    });
                } finally {
                    setBusy("");
                }
            },
        });
        if (!confirmed) return;
        setRemark("");
        onChanged?.();
        if (onDecided) onDecided({ action, resignation: updated || resignation });
        else setVersion((value) => value + 1);
    };

    return (
        <div className="candidate-modal-overlay" onClick={onClose}>
            <div className="candidate-modal mpr-detail resignation-detail" onClick={(event) => event.stopPropagation()}>
                <div className="candidate-modal-header">
                    <div>
                        <h2>{resignation ? `${resignation.resignation_no} · ${resignation.employee_name}` : "Resignation"}</h2>
                        {resignation && (
                            <span>{resignation.employee_id} · {resignation.department || "—"} · {resignation.designation || "Employee"}</span>
                        )}
                    </div>
                    <button type="button" className="candidate-modal-close" onClick={onClose}>×</button>
                </div>

                {loading && <p className="mpr-muted">Loading...</p>}
                {loaded.error && !resignation && <p className="mpr-form-error">{loaded.error}</p>}

                {resignation && (
                    <>
                        <div className="mpr-detail-status">
                            <span className={`mpr-status ${resignationTone(resignation.status)}`}>{resignation.status}</span>
                            {resignation.early_release && <span className="mpr-budget-pill exception">Early release requested</span>}
                        </div>

                        <EarlyReleaseNote resignation={resignation} />
                        <ResignationTracker resignation={resignation} />

                        {resignation.permissions?.canApprove && (
                            <section className="candidate-section mpr-actions-panel">
                                <h3>Your decision</h3>
                                {isFinalStep && (
                                    <div className="resignation-lwd-field">
                                        <label>Last working day</label>
                                        <DatePicker value={lastWorkingDay} onChange={setLastWorkingDay} minDate={resignation.today} today={resignation.today} autoPosition />
                                        <small>
                                            Requested: {formatDate(resignation.requested_last_working_day)}. Change it only if agreed with the employee; a remark is required and it's shown in the log.
                                        </small>
                                    </div>
                                )}
                                <textarea
                                    rows="3"
                                    value={remark}
                                    onChange={(event) => {
                                        setRemark(event.target.value);
                                        if (actionError) setActionError("");
                                    }}
                                    aria-invalid={Boolean(actionError)}
                                    placeholder={lwdChanged ? "Remark (required: why the last working day changed)" : "Remarks (optional; required to reject)"}
                                />
                                {actionError && <p className="mpr-form-error">{actionError}</p>}
                                <div className="mpr-action-buttons">
                                    <button type="button" className="mpr-btn danger" onClick={() => runAction("reject")} disabled={Boolean(busy)}>
                                        {busy === "reject" ? "Rejecting..." : "Reject"}
                                    </button>
                                    <button type="button" className="mpr-btn success" onClick={() => runAction("approve")} disabled={Boolean(busy)}>
                                        {busy === "approve" ? "Saving..." : isFinalStep ? "Accept" : "Approve"}
                                    </button>
                                </div>
                            </section>
                        )}

                        <section className="candidate-section">
                            <h3>Resignation</h3>
                            <div className="candidate-grid">
                                <div><label>Resignation Date</label><p>{formatDate(resignation.resignation_date)}</p></div>
                                <div><label>Notice Period</label><p>{daysLabel(resignation.notice_period_days)}{resignation.notice_period_source ? ` (${resignation.notice_period_source})` : ""}</p></div>
                                <div><label>Notice Ends</label><p>{formatDate(resignation.calculated_last_working_day)}</p></div>
                                <div><label>Last Working Day</label><p><strong>{formatDate(resignation.last_working_day)}</strong></p></div>
                                {resignation.days_remaining !== null && <div><label>Days Remaining</label><p>{resignation.days_remaining}</p></div>}
                                <div><label>Reason Category</label><p>{resignation.reason_category}</p></div>
                                <div><label>Early Release</label><p>{resignation.early_release ? "Yes" : "No"}</p></div>
                                <div>
                                    <label>Resignation Letter</label>
                                    <p>
                                        {resignation.letter_url ? (
                                            <a href={resignation.letter_url} download={resignation.letter_name || true} target="_blank" rel="noreferrer">
                                                {resignation.letter_name || "Resignation letter"} (Download)
                                            </a>
                                        ) : "Not attached"}
                                    </p>
                                </div>
                                {resignation.early_release && resignation.early_release_reason && (
                                    <div className="full-width"><label>Early Release Reason</label><p>{resignation.early_release_reason}</p></div>
                                )}
                                <div className="full-width"><label>Details</label><p>{resignation.details}</p></div>
                                {resignation.rejection_reason && <div className="full-width"><label>Rejection Reason</label><p>{resignation.rejection_reason}</p></div>}
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>Approvers</h3>
                            <div className="candidate-grid">
                                {resignation.workflow.map((step, index) => (
                                    <div key={`${step.role}-${index}`}>
                                        <label>{index + 1}. {step.label}</label>
                                        <p className={step.via ? "mpr-warning-text" : ""}>
                                            {step.approvers.length ? step.approvers.map((person) => person.name).join(", ") : "No approver assigned (Settings → Approval Workflows)"}
                                            {step.via && <small className="resignation-via"><br />Routed to {step.via}</small>}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>Tracking details</h3>
                            <ResignationLog actions={resignation.actions} />
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}

export default ResignationDetail;
