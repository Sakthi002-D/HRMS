// MPR detail: request fields, budget badge, approval tracker, tracking log and approver actions.
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import "../../pages/hr/Recruitment.css";
import "./recruitment.css";
import MprTracker from "./MprTracker";
import { useConfirm } from "../common/dialog/dialogContext";
import { BudgetDetails, BudgetStatusPill } from "./MprBudget";
import {
    api,
    formatDate,
    formatDateTime,
    formatMoney,
    getCompanyCurrency,
    mprStatusLabel,
    recruitmentActionLabel,
    recruitmentRoleLabel,
    recruitmentValueLabel,
    statusTone,
} from "./recruitmentApi";

const yesNo = (t, value) => (value ? t("employeeProfile.values.yes", { defaultValue: "Yes" }) : t("employeeProfile.values.no", { defaultValue: "No" }));

function MprDetail({ mprId, actorId, meta, onClose, onChanged, onEdit }) {
    const { t } = useTranslation();
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
            setActionError(action === "reject"
                ? t("recruitment.detail.errors.rejectReason", { defaultValue: "Enter the reason for rejecting." })
                : t("recruitment.detail.errors.sendBackRemark", { defaultValue: "Enter a remark for the coordinator." }));
            return;
        }
        if (action === "cancel") {
            const cancelled = await confirm({
                variant: "danger",
                title: t("recruitment.detail.cancelDialog.title", { defaultValue: "Cancel manpower request?" }),
                message: (
                    <Trans
                        i18nKey="recruitment.detail.cancelDialog.message"
                        values={{ number: mpr.mpr_no }}
                        components={{ b: <strong dir="ltr" /> }}
                        defaults="Manpower request <b>{{number}}</b> will be cancelled. This can't be undone."
                    />
                ),
                cancelText: t("recruitment.detail.cancelDialog.keep", { defaultValue: "Keep MPR" }),
                confirmText: t("recruitment.detail.cancelDialog.confirm", { defaultValue: "Yes, Cancel MPR" }),
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

    const assets = (mpr?.assets || []).map((asset) => (asset === "Other" && mpr.asset_other
        ? t("recruitment.detail.otherAsset", { name: mpr.asset_other, defaultValue: "Other: {{name}}" })
        : recruitmentValueLabel("asset", asset)));
    const currency = mpr?.currency || getCompanyCurrency(meta.currency);

    return (
        <div className="candidate-modal-overlay" onClick={onClose}>
            <div className="candidate-modal mpr-detail" onClick={(event) => event.stopPropagation()}>
                <div className="candidate-modal-header">
                    <div>
                        <h2>{mpr
                            ? <><span dir="ltr" className="ltr-text">{mpr.mpr_no}</span> · {mpr.title || t("recruitment.mpr.untitled", { defaultValue: "Untitled" })}</>
                            : t("recruitment.detail.title", { defaultValue: "Manpower Request" })}</h2>
                        {mpr && (
                            <span>
                                {recruitmentValueLabel("requestType", mpr.request_type)} · {mpr.department} · {t("recruitment.detail.raisedBy", { name: mpr.requested_by_name || mpr.requested_by, defaultValue: "raised by {{name}}" })}
                            </span>
                        )}
                    </div>
                    <button type="button" className="candidate-modal-close" onClick={onClose}>×</button>
                </div>

                {loading && <p className="mpr-muted">{t("recruitment.common.loading", { defaultValue: "Loading..." })}</p>}
                {loaded.error && !mpr && <p className="mpr-form-error">{loaded.error}</p>}

                {mpr && (
                    <>
                        <div className="mpr-detail-status">
                            <span className={`mpr-status ${statusTone(mpr.status)}`}>{mprStatusLabel(mpr.status)}</span>
                            {mpr.job_id && <span className="mpr-chip">{t("recruitment.detail.jobChip", { id: mpr.job_id, defaultValue: "Job {{id}}" })}</span>}
                        </div>

                        {mpr.request_type === "New Position" && mpr.budget_snapshot && (
                            <section className="mpr-budget-summary">
                                <BudgetStatusPill budget={mpr.budget_snapshot} />
                                <BudgetDetails budget={mpr.budget_snapshot} currency={currency} audience="approver" />
                                {mpr.budget_status === "exception" && mpr.justification && (
                                    <p className="mpr-budget-justification"><strong>{t("recruitment.fields.justification", { defaultValue: "Justification" })}:</strong> {mpr.justification}</p>
                                )}
                            </section>
                        )}

                        <MprTracker mpr={mpr} />

                        {/* APPROVER ACTIONS */}
                        {mpr.permissions?.canApprove && (
                            <section className="candidate-section mpr-actions-panel">
                                <h3>{t("recruitment.detail.yourDecision", { defaultValue: "Your decision" })}</h3>
                                {mpr.budget_status === "exception" && (
                                    <p className="mpr-warning">
                                        {mpr.budget_snapshot?.status === "no_budget"
                                            ? t("recruitment.detail.noBudgetWarning", { defaultValue: "No budget set: review the budget details above and the justification before approving." })
                                            : t("recruitment.detail.exceededWarning", { defaultValue: "Budget exceeded: review the budget details above and the justification before approving." })}
                                    </p>
                                )}
                                <textarea
                                    rows="3"
                                    value={remark}
                                    onChange={(event) => setRemark(event.target.value)}
                                    placeholder={t("recruitment.detail.remarkPlaceholder", { defaultValue: "Remark (required to reject or send back)" })}
                                />
                                {actionError && <p className="mpr-form-error">{actionError}</p>}
                                <div className="mpr-action-buttons">
                                    <button type="button" className="mpr-btn danger" onClick={() => runAction("reject")} disabled={Boolean(busy)}>
                                        {busy === "reject"
                                            ? t("resignation.detail.dialog.rejecting", { defaultValue: "Rejecting..." })
                                            : t("resignation.detail.dialog.reject", { defaultValue: "Reject" })}
                                    </button>
                                    <button type="button" className="mpr-btn warning" onClick={() => runAction("send-back")} disabled={Boolean(busy)}>
                                        {busy === "send-back"
                                            ? t("recruitment.detail.sendingBack", { defaultValue: "Sending back..." })
                                            : t("recruitment.detail.sendBack", { defaultValue: "Send Back" })}
                                    </button>
                                    <button type="button" className="mpr-btn success" onClick={() => runAction("approve")} disabled={Boolean(busy)}>
                                        {busy === "approve"
                                            ? t("recruitment.detail.approving", { defaultValue: "Approving..." })
                                            : t("resignation.detail.dialog.approve", { defaultValue: "Approve" })}
                                    </button>
                                </div>
                            </section>
                        )}

                        {(mpr.permissions?.canEdit || mpr.permissions?.canCancel) && (
                            <div className="mpr-owner-actions">
                                {!mpr.permissions?.canApprove && actionError && <p className="mpr-form-error">{actionError}</p>}
                                {mpr.permissions.canCancel && (
                                    <button type="button" className="cancel-btn" onClick={() => runAction("cancel")} disabled={Boolean(busy)}>
                                        {t("recruitment.detail.cancelMpr", { defaultValue: "Cancel MPR" })}
                                    </button>
                                )}
                                {mpr.permissions.canEdit && (
                                    <button type="button" className="save-job-btn" onClick={() => onEdit(mpr)}>
                                        {mpr.status === "Sent Back"
                                            ? t("recruitment.detail.editResubmit", { defaultValue: "Edit & Resubmit" })
                                            : t("recruitment.detail.editDraft", { defaultValue: "Edit Draft" })}
                                    </button>
                                )}
                            </div>
                        )}

                        <section className="candidate-section">
                            <h3>{t("recruitment.fields.position", { defaultValue: "Position" })}</h3>
                            <div className="candidate-grid">
                                <div><label>{t("recruitment.fields.jobTitle", { defaultValue: "Job Title" })}</label><p>{mpr.title || "—"}</p></div>
                                <div><label>{t("recruitment.fields.openingsCount", { defaultValue: "No. of Openings" })}</label><p>{mpr.openings ?? "—"}</p></div>
                                <div><label>{t("recruitment.fields.experience", { defaultValue: "Experience" })}</label><p>{mpr.experience || "—"}</p></div>
                                <div><label>{t("recruitment.fields.location", { defaultValue: "Location" })}</label><p>{mpr.location || "—"}</p></div>
                                <div><label>{t("profileEdit.sectionFields.employment_type", { defaultValue: "Employment Type" })}</label><p>{recruitmentValueLabel("employmentType", mpr.employment_type) || "—"}</p></div>
                                <div><label>{t("recruitment.fields.applicationStartDate", { defaultValue: "Application Start Date" })}</label><p><span dir="ltr" className="ltr-text">{formatDate(mpr.application_start_date)}</span></p></div>
                                <div><label>{t("recruitment.fields.applicationEndDate", { defaultValue: "Application End Date" })}</label><p><span dir="ltr" className="ltr-text">{formatDate(mpr.application_end_date)}</span></p></div>
                                <div><label>{t("recruitment.fields.requiredSkills", { defaultValue: "Required Skills" })}</label><p>{mpr.skills || "—"}</p></div>
                                {mpr.request_type === "Replacement" && (
                                    <>
                                        <div><label>{t("recruitment.detail.replacing", { defaultValue: "Replacing" })}</label><p>{mpr.replaced_employee_name ? <>{mpr.replaced_employee_name} (<span dir="ltr" className="ltr-text">{mpr.replaced_employee_id}</span>)</> : "—"}</p></div>
                                        <div><label>{t("recruitment.fields.replacementReason", { defaultValue: "Replacement Reason" })}</label><p>{mpr.replacement_reason || "—"}</p></div>
                                    </>
                                )}
                                <div className="full-width"><label>{t("recruitment.fields.jobDescription", { defaultValue: "Job Description" })}</label><p>{mpr.job_description || "—"}</p></div>
                                <div className="full-width"><label>{t("recruitment.fields.justification", { defaultValue: "Justification" })}</label><p>{mpr.justification || "—"}</p></div>
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>{t("recruitment.detail.compensationTitle", { defaultValue: "Compensation, Benefits & Assets" })}</h3>
                            <div className="candidate-grid">
                                <div><label>{t("recruitment.detail.salaryPerMonth", { defaultValue: "Salary (per month)" })}</label><p><span dir="ltr" className="ltr-text">{currency} {formatMoney(mpr.salary_min)} – {formatMoney(mpr.salary_max)}</span></p></div>
                                <div><label>{t("recruitment.fields.airTicket", { defaultValue: "Air Ticket" })}</label><p>{yesNo(t, mpr.benefits?.air_ticket)}</p></div>
                                <div><label>{t("recruitment.fields.vehicle", { defaultValue: "Vehicle" })}</label><p>{yesNo(t, mpr.benefits?.vehicle)}</p></div>
                                <div><label>{t("recruitment.fields.accommodation", { defaultValue: "Accommodation" })}</label><p>{yesNo(t, mpr.benefits?.accommodation)}</p></div>
                                <div><label>{t("recruitment.detail.medicalInsurance", { defaultValue: "Medical Insurance" })}</label><p>{mpr.benefits?.medical_insurance_category || "—"}</p></div>
                                <div><label>{t("recruitment.fields.allowances", { defaultValue: "Allowances" })}</label><p>{mpr.benefits?.allowances || "—"}</p></div>
                                <div className="full-width"><label>{t("recruitment.fields.assetsRequired", { defaultValue: "Assets Required" })}</label><p>{assets.length ? assets.join(t("recruitment.common.listSeparator", { defaultValue: ", " })) : t("recruitment.detail.none", { defaultValue: "None" })}</p></div>
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>{t("recruitment.detail.approvers", { defaultValue: "Approvers" })}</h3>
                            <div className="candidate-grid">
                                {mpr.workflow.map((step, index) => (
                                    <div key={`${step.role}-${index}`}>
                                        <label>{index + 1}. {recruitmentRoleLabel(step.role, step.label)}</label>
                                        <p className={step.approvers.length ? "" : "mpr-warning-text"}>
                                            {step.approvers.length
                                                ? step.approvers.map((person) => person.name).join(", ")
                                                : t("resignation.detail.noApprover", { defaultValue: "No approver assigned (Settings → Approval Workflows)" })}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>{t("recruitment.log.title", { defaultValue: "Tracking details" })}</h3>
                            <table className="jobs-table mpr-log">
                                <thead>
                                    <tr>
                                        <th>{t("recruitment.log.date", { defaultValue: "Date" })}</th>
                                        <th>{t("recruitment.fields.action", { defaultValue: "Action" })}</th>
                                        <th>{t("recruitment.log.by", { defaultValue: "By" })}</th>
                                        <th>{t("recruitment.log.remark", { defaultValue: "Remark" })}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mpr.actions.map((action) => (
                                        <tr key={action.id}>
                                            <td><span dir="ltr" className="ltr-text">{formatDateTime(action.created_at)}</span></td>
                                            <td>
                                                <strong>{recruitmentActionLabel(action.action)}</strong>
                                                {action.step_role && <small> · {recruitmentRoleLabel(action.step_role, meta.roleLabels[action.step_role] || action.step_role)}</small>}
                                            </td>
                                            <td>{action.actor_name || t("recruitment.log.system", { defaultValue: "System" })}</td>
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
