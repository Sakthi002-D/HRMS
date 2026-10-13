// Resignation detail for approvers (Line Manager in the Employee portal, HR in the HR portal):
// request fields, progress tracker, tracking log and Approve/Accept/Reject actions.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "../common/dialog/dialogContext";
import useScrollLock from "../common/dialog/useScrollLock";
import DatePicker from "../layout/common/DatePicker";
import "../../pages/hr/Recruitment.css";
import "../recruitment/recruitment.css";
import "./resignation.css";
import ResignationTracker from "./ResignationTracker";
import {
    api,
    daysLabel,
    formatDate,
    formatDateTime,
    ltrText,
    noticeSourceLabel,
    reasonCategoryLabel,
    resignationActionLabel,
    resignationRoleLabel,
    resignationStatusLabel,
    resignationTone,
} from "./resignationApi";

// Same English fallbacks the log showed before
const logRoleFallback = (role) => (role === "HR" ? "HR" : role === "LINE_MANAGER" ? "Line Manager" : "Department Head");

export function ResignationLog({ actions }) {
    const { t } = useTranslation();
    return (
        <table className="jobs-table mpr-log">
            <thead>
                <tr>
                    <th>{t("resignation.log.dateTime", { defaultValue: "Date & time" })}</th>
                    <th>{t("resignation.log.action", { defaultValue: "Action" })}</th>
                    <th>{t("resignation.log.by", { defaultValue: "By" })}</th>
                    <th>{t("resignation.log.remark", { defaultValue: "Remark" })}</th>
                </tr>
            </thead>
            <tbody>
                {actions.map((action) => (
                    <tr key={action.id}>
                        <td><span dir="ltr" className="ltr-text">{formatDateTime(action.created_at)}</span></td>
                        <td><strong>{resignationActionLabel(action.action)}</strong>{action.step_role && <small> · {resignationRoleLabel(action.step_role, logRoleFallback(action.step_role))}</small>}</td>
                        <td>{action.actor_name || t("resignation.log.system", { defaultValue: "System" })}</td>
                        <td>{action.remark || "—"}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export function EarlyReleaseNote({ resignation }) {
    // Hook first: it must run before the early "return null"
    const { t } = useTranslation();
    if (!resignation.early_release) return null;
    const pending = resignation.status.startsWith("Pending ");
    return (
        <div className="resignation-early-note">
            <strong>{pending
                ? t("resignation.form.earlyReleaseNote", { defaultValue: "Early release requested – subject to approval" })
                : t("resignation.early.requested", { defaultValue: "Early release requested" })}</strong>
            <span>
                {t("resignation.early.text", { requested: ltrText(formatDate(resignation.requested_last_working_day)), calculated: ltrText(formatDate(resignation.calculated_last_working_day)), defaultValue: "Last working day {{requested}} instead of {{calculated}}." })}
                {resignation.early_release_reason ? ` ${t("resignation.early.reason", { reason: resignation.early_release_reason, defaultValue: "Reason: {{reason}}" })}` : ""}
            </span>
        </div>
    );
}

// onDecided({ action, resignation }) runs after a successful decision; when given,
// the parent closes the modal (HR Resignations page). Otherwise it reloads in place.
function ResignationDetail({ resignationId, actorId, onClose, onChanged, onDecided }) {
    const { t } = useTranslation();
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
            setActionError(t("resignation.detail.errors.rejectReasonRequired", { defaultValue: "Enter a reason for rejecting" }));
            return;
        }
        if (action === "approve" && isFinalStep) {
            if (!lastWorkingDay) return setActionError(t("resignation.detail.errors.chooseLwd", { defaultValue: "Choose the last working day." }));
            if (lastWorkingDay < resignation.today) return setActionError(t("resignation.detail.errors.lwdPast", { defaultValue: "Last working day can't be in the past." }));
            if (lwdChanged && !remark.trim()) return setActionError(t("resignation.detail.errors.lwdRemark", { defaultValue: "Enter a remark explaining the changed last working day." }));
        }

        setActionError("");
        const accepting = action === "approve" && isFinalStep;
        const reason = remark.trim();
        let updated = null;
        const confirmed = await confirm({
            variant: action === "reject" ? "danger" : "success",
            title: action === "reject"
                ? t("resignation.detail.dialog.rejectTitle", { defaultValue: "Reject resignation?" })
                : accepting
                    ? t("resignation.detail.dialog.acceptTitle", { defaultValue: "Accept resignation?" })
                    : t("resignation.detail.dialog.approveTitle", { defaultValue: "Approve resignation?" }),
            message: action === "reject" ? (
                <>
                    <p>{t("resignation.detail.dialog.rejectMessage", { number: ltrText(resignation.resignation_no), name: resignation.employee_name, defaultValue: "{{number}} for {{name}} will be rejected and the employee will be notified." })}</p>
                    <p className="resignation-dialog-reason">{t("resignation.detail.dialog.reason", { reason, defaultValue: "Reason: {{reason}}" })}</p>
                </>
            ) : accepting ? (
                <>
                    <p>{t("resignation.detail.dialog.acceptMessage", { name: resignation.employee_name, date: ltrText(formatDate(lastWorkingDay)), defaultValue: "{{name}} will start serving notice with the last working day on {{date}}." })}</p>
                    {reason && <p className="resignation-dialog-reason">{t("resignation.detail.dialog.remark", { remark: reason, defaultValue: "Remark: {{remark}}" })}</p>}
                </>
            ) : t("resignation.detail.dialog.approveMessage", { number: ltrText(resignation.resignation_no), defaultValue: "{{number}} will move to the next approver." }),
            confirmText: action === "reject"
                ? t("resignation.detail.dialog.reject", { defaultValue: "Reject" })
                : accepting
                    ? t("resignation.detail.dialog.accept", { defaultValue: "Accept" })
                    : t("resignation.detail.dialog.approve", { defaultValue: "Approve" }),
            loadingText: action === "reject"
                ? t("resignation.detail.dialog.rejecting", { defaultValue: "Rejecting..." })
                : t("resignation.detail.dialog.saving", { defaultValue: "Saving..." }),
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
                        <h2>{resignation
                            ? <><span dir="ltr" className="ltr-text">{resignation.resignation_no}</span> · {resignation.employee_name}</>
                            : t("resignation.detail.title", { defaultValue: "Resignation" })}</h2>
                        {resignation && (
                            <span><span dir="ltr" className="ltr-text">{resignation.employee_id}</span> · {resignation.department || "—"} · {resignation.designation || t("resignation.detail.employee", { defaultValue: "Employee" })}</span>
                        )}
                    </div>
                    <button type="button" className="candidate-modal-close" onClick={onClose}>×</button>
                </div>

                {loading && <p className="mpr-muted">{t("resignation.detail.loading", { defaultValue: "Loading..." })}</p>}
                {loaded.error && !resignation && <p className="mpr-form-error">{loaded.error}</p>}

                {resignation && (
                    <>
                        <div className="mpr-detail-status">
                            <span className={`mpr-status ${resignationTone(resignation.status)}`}>{resignationStatusLabel(resignation.status)}</span>
                            {resignation.early_release && <span className="mpr-budget-pill exception">{t("resignation.early.requested", { defaultValue: "Early release requested" })}</span>}
                        </div>

                        <EarlyReleaseNote resignation={resignation} />
                        <ResignationTracker resignation={resignation} />

                        {resignation.permissions?.canApprove && (
                            <section className="candidate-section mpr-actions-panel">
                                <h3>{t("resignation.detail.decision", { defaultValue: "Your decision" })}</h3>
                                {isFinalStep && (
                                    <div className="resignation-lwd-field">
                                        <label>{t("resignation.detail.lwd", { defaultValue: "Last working day" })}</label>
                                        <DatePicker value={lastWorkingDay} onChange={setLastWorkingDay} minDate={resignation.today} today={resignation.today} autoPosition />
                                        <small>
                                            {t("resignation.detail.requestedHint", { date: ltrText(formatDate(resignation.requested_last_working_day)), defaultValue: "Requested: {{date}}. Change it only if agreed with the employee; a remark is required and it's shown in the log." })}
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
                                    placeholder={lwdChanged
                                        ? t("resignation.detail.remarkRequired", { defaultValue: "Remark (required: why the last working day changed)" })
                                        : t("resignation.detail.remarkOptional", { defaultValue: "Remarks (optional; required to reject)" })}
                                />
                                {actionError && <p className="mpr-form-error">{actionError}</p>}
                                <div className="mpr-action-buttons">
                                    <button type="button" className="mpr-btn danger" onClick={() => runAction("reject")} disabled={Boolean(busy)}>
                                        {busy === "reject" ? t("resignation.detail.dialog.rejecting", { defaultValue: "Rejecting..." }) : t("resignation.detail.dialog.reject", { defaultValue: "Reject" })}
                                    </button>
                                    <button type="button" className="mpr-btn success" onClick={() => runAction("approve")} disabled={Boolean(busy)}>
                                        {busy === "approve"
                                            ? t("resignation.detail.dialog.saving", { defaultValue: "Saving..." })
                                            : isFinalStep
                                                ? t("resignation.detail.dialog.accept", { defaultValue: "Accept" })
                                                : t("resignation.detail.dialog.approve", { defaultValue: "Approve" })}
                                    </button>
                                </div>
                            </section>
                        )}

                        <section className="candidate-section">
                            <h3>{t("resignation.detail.title", { defaultValue: "Resignation" })}</h3>
                            <div className="candidate-grid">
                                <div><label>{t("resignation.form.resignationDate", { defaultValue: "Resignation Date" })}</label><p><span dir="ltr">{formatDate(resignation.resignation_date)}</span></p></div>
                                <div><label>{t("resignation.form.noticePeriod", { defaultValue: "Notice Period" })}</label><p>{daysLabel(resignation.notice_period_days)}{resignation.notice_period_source ? ` (${noticeSourceLabel(resignation.notice_period_source)})` : ""}</p></div>
                                <div><label>{t("resignation.detail.noticeEnds", { defaultValue: "Notice Ends" })}</label><p><span dir="ltr">{formatDate(resignation.calculated_last_working_day)}</span></p></div>
                                <div><label>{t("resignation.form.lastWorkingDay", { defaultValue: "Last Working Day" })}</label><p><strong dir="ltr">{formatDate(resignation.last_working_day)}</strong></p></div>
                                {resignation.days_remaining !== null && <div><label>{t("resignation.detail.daysRemaining", { defaultValue: "Days Remaining" })}</label><p>{resignation.days_remaining}</p></div>}
                                <div><label>{t("resignation.detail.reasonCategory", { defaultValue: "Reason Category" })}</label><p>{reasonCategoryLabel(resignation.reason_category)}</p></div>
                                <div><label>{t("resignation.detail.earlyRelease", { defaultValue: "Early Release" })}</label><p>{resignation.early_release ? t("resignation.detail.yes", { defaultValue: "Yes" }) : t("resignation.detail.no", { defaultValue: "No" })}</p></div>
                                <div>
                                    <label>{t("resignation.detail.letter", { defaultValue: "Resignation Letter" })}</label>
                                    <p>
                                        {resignation.letter_url ? (
                                            <a href={resignation.letter_url} download={resignation.letter_name || true} target="_blank" rel="noreferrer">
                                                {resignation.letter_name || t("resignation.detail.letterDefault", { defaultValue: "Resignation letter" })} {t("resignation.detail.download", { defaultValue: "(Download)" })}
                                            </a>
                                        ) : t("resignation.detail.notAttached", { defaultValue: "Not attached" })}
                                    </p>
                                </div>
                                {resignation.early_release && resignation.early_release_reason && (
                                    <div className="full-width"><label>{t("resignation.detail.earlyReason", { defaultValue: "Early Release Reason" })}</label><p>{resignation.early_release_reason}</p></div>
                                )}
                                <div className="full-width"><label>{t("resignation.detail.details", { defaultValue: "Details" })}</label><p>{resignation.details}</p></div>
                                {resignation.rejection_reason && <div className="full-width"><label>{t("resignation.detail.rejectionReason", { defaultValue: "Rejection Reason" })}</label><p>{resignation.rejection_reason}</p></div>}
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>{t("resignation.detail.approvers", { defaultValue: "Approvers" })}</h3>
                            <div className="candidate-grid">
                                {resignation.workflow.map((step, index) => (
                                    <div key={`${step.role}-${index}`}>
                                        <label>{index + 1}. {resignationRoleLabel(step.role, step.label)}</label>
                                        <p className={step.via ? "mpr-warning-text" : ""}>
                                            {step.approvers.length ? step.approvers.map((person) => person.name).join(", ") : t("resignation.detail.noApprover", { defaultValue: "No approver assigned (Settings → Approval Workflows)" })}
                                            {step.via && <small className="resignation-via"><br />{t("resignation.detail.routedTo", { via: step.via, defaultValue: "Routed to {{via}}" })}</small>}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>{t("resignation.status.trackingDetails", { defaultValue: "Tracking details" })}</h3>
                            <ResignationLog actions={resignation.actions} />
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}

export default ResignationDetail;