// Employee portal → Resignation (FRD SHELTER-HCM-SSP-20-001)
// No active resignation: the form. Otherwise: status card, tracker, tracking log, Withdraw.
// Line Managers also get "My Approvals" for resignations awaiting them.
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import DatePicker from "../components/layout/common/DatePicker";
import { useConfirm } from "../components/common/dialog/dialogContext";
import "../pages/hr/Recruitment.css";
import "../components/recruitment/recruitment.css";
import "../components/resignation/resignation.css";
import ResignationDetail, { EarlyReleaseNote, ResignationLog } from "../components/resignation/ResignationDetail";
import ResignationTracker from "../components/resignation/ResignationTracker";
import {
    LETTER_ACCEPT,
    LETTER_MAX_BYTES,
    LETTER_TYPES,
    REASON_CATEGORIES,
    api,
    daysLabel,
    formatDate,
    isServingNotice,
    postForm,
    reasonCategoryLabel,
    resignationStatusLabel,
    resignationTone,
} from "../components/resignation/resignationApi";

const emptyForm = (lastWorkingDay = "") => ({
    last_working_day: lastWorkingDay,
    early_release_reason: "",
    reason_category: "",
    details: "",
    acknowledged: false,
    letter: null,
});

// Notice period source from the backend (e.g. "default"); English shown if no key exists
const noticeSourceLabel = (t, source) => source
    ? t(`resignation.noticeSource.${String(source).trim().toLowerCase().replace(/[\s-]+/g, "_")}`, { defaultValue: String(source) })
    : "";

function validate(form, info, t) {
    const errors = {};
    if (!form.last_working_day) errors.last_working_day = t("resignation.errors.chooseLastDay", { defaultValue: "Choose your last working day" });
    else if (form.last_working_day < info.today) errors.last_working_day = t("resignation.errors.lastDayPast", { defaultValue: "Last working day can't be in the past" });
    else if (form.last_working_day > info.calculatedLastWorkingDay) {
        errors.last_working_day = t("resignation.errors.lastDayAfter", { date: formatDate(info.calculatedLastWorkingDay), defaultValue: "Last working day can't be after {{date}}" });
    }
    if (form.last_working_day && form.last_working_day < info.calculatedLastWorkingDay && !form.early_release_reason.trim()) {
        errors.early_release_reason = t("resignation.errors.earlyReasonRequired", { defaultValue: "Enter a reason for the early release" });
    }
    if (!form.reason_category) errors.reason_category = t("resignation.errors.reasonRequired", { defaultValue: "Choose a reason category" });
    if (!form.details.trim()) errors.details = t("resignation.errors.detailsRequired", { defaultValue: "Enter the details" });
    if (form.letter && !LETTER_TYPES.includes(form.letter.type)) errors.letter = t("resignation.errors.letterType", { defaultValue: "Upload a PDF, Word document or image" });
    else if (form.letter && form.letter.size > LETTER_MAX_BYTES) errors.letter = t("resignation.errors.letterSize", { defaultValue: "The letter must be 5 MB or smaller" });
    if (!form.acknowledged) errors.acknowledged = t("resignation.errors.confirmRequired", { defaultValue: "Please confirm to continue" });
    return errors;
}

function ResignationForm({ employee, info, onSubmitted, onCancel }) {
    const { t } = useTranslation();
    const [form, setForm] = useState(() => emptyForm(info.calculatedLastWorkingDay));
    const [errors, setErrors] = useState({});
    const [submitError, setSubmitError] = useState("");
    const [saving, setSaving] = useState(false);

    const earlyRelease = Boolean(form.last_working_day) && form.last_working_day < info.calculatedLastWorkingDay;
    const setField = (field, value) => {
        setForm((current) => ({ ...current, [field]: value }));
        setErrors((current) => ({ ...current, [field]: undefined }));
    };

    const submit = async (event) => {
        event.preventDefault();
        const found = validate(form, info, t);
        setErrors(found);
        if (Object.values(found).some(Boolean)) return;

        const body = new FormData();
        body.append("employee_id", employee.employee_id);
        body.append("last_working_day", form.last_working_day);
        if (earlyRelease) body.append("early_release_reason", form.early_release_reason.trim());
        body.append("reason_category", form.reason_category);
        body.append("details", form.details.trim());
        body.append("acknowledged", String(form.acknowledged));
        if (form.letter) body.append("letter", form.letter);

        setSaving(true);
        setSubmitError("");
        try {
            await postForm("/api/resignations", body);
            onSubmitted();
        } catch (error) {
            setSubmitError(error.message);
        } finally {
            setSaving(false);
        }
    };

    const cancel = () => {
        setForm(emptyForm(info.calculatedLastWorkingDay));
        setErrors({});
        setSubmitError("");
        onCancel();
    };

    const fieldError = (field) => errors[field] && <small className="resignation-field-error">{errors[field]}</small>;
    const noticeSource = noticeSourceLabel(t, info.noticePeriodSource);

    return (
        <form className="resignation-card resignation-form" onSubmit={submit} noValidate>
            <div className="resignation-card-heading">
                <div>
                    <h2>{t("resignation.form.title", { defaultValue: "Submit Resignation" })}</h2>
                    <p>{t("resignation.form.subtitle", { defaultValue: "Your resignation goes to your Line Manager, then HR." })}</p>
                </div>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label htmlFor="resignation-date">{t("resignation.form.resignationDate", { defaultValue: "Resignation Date" })}</label>
                    <input id="resignation-date" value={formatDate(info.today)} readOnly />
                </div>
                <div className="form-group">
                    <label htmlFor="resignation-notice">{t("resignation.form.noticePeriod", { defaultValue: "Notice Period" })}</label>
                    <input id="resignation-notice" value={noticeSource ? `${daysLabel(info.noticePeriodDays)} (${noticeSource})` : daysLabel(info.noticePeriodDays)} readOnly />
                </div>
            </div>

            <div className="form-group">
                <label>{t("resignation.form.lastWorkingDay", { defaultValue: "Last Working Day" })}</label>
                <DatePicker value={form.last_working_day} onChange={(value) => setField("last_working_day", value)} minDate={info.today} today={info.today} autoPosition />
                <small className="resignation-hint">
                    {t("resignation.form.noticeEnds", { date: formatDate(info.calculatedLastWorkingDay), defaultValue: "Notice ends {{date}}. You may request an earlier date." })}
                </small>
                {fieldError("last_working_day")}
            </div>

            {earlyRelease && (
                <div className="form-group">
                    <div className="resignation-early-note"><strong>{t("resignation.form.earlyReleaseNote", { defaultValue: "Early release requested – subject to approval" })}</strong></div>
                    <label htmlFor="resignation-early-reason">{t("resignation.form.earlyReason", { defaultValue: "Reason for early release *" })}</label>
                    <textarea id="resignation-early-reason" rows="2" value={form.early_release_reason} onChange={(event) => setField("early_release_reason", event.target.value)} placeholder={t("resignation.form.earlyReasonPlaceholder", { defaultValue: "Why do you need to leave before the notice period ends?" })} />
                    {fieldError("early_release_reason")}
                </div>
            )}

            <div className="form-group">
                <label htmlFor="resignation-reason">{t("resignation.form.reasonCategory", { defaultValue: "Reason Category *" })}</label>
                <select id="resignation-reason" value={form.reason_category} onChange={(event) => setField("reason_category", event.target.value)}>
                    <option value="">{t("resignation.form.selectReason", { defaultValue: "Select reason" })}</option>
                    {(info.reasonCategories || REASON_CATEGORIES).map((reason) => <option key={reason} value={reason}>{reasonCategoryLabel(reason)}</option>)}
                </select>
                {fieldError("reason_category")}
            </div>

            <div className="form-group">
                <label htmlFor="resignation-details">{t("resignation.form.details", { defaultValue: "Details *" })}</label>
                <textarea id="resignation-details" rows="4" value={form.details} onChange={(event) => setField("details", event.target.value)} placeholder={t("resignation.form.detailsPlaceholder", { defaultValue: "Tell us more about your decision" })} />
                {fieldError("details")}
            </div>

            <div className="form-group">
                <label htmlFor="resignation-letter">{t("resignation.form.letter", { defaultValue: "Resignation Letter (optional)" })}</label>
                <input id="resignation-letter" type="file" accept={LETTER_ACCEPT} onChange={(event) => setField("letter", event.target.files?.[0] || null)} />
                <small className="resignation-hint">{t("resignation.form.letterHint", { defaultValue: "PDF, DOC/DOCX or image, up to 5 MB." })}</small>
                {fieldError("letter")}
            </div>

            <div className="form-group profile-checkbox-field">
                <label>
                    <input type="checkbox" checked={form.acknowledged} onChange={(event) => setField("acknowledged", event.target.checked)} />
                    {t("resignation.form.acknowledge", { defaultValue: "I understand my final settlement will be processed by HR after my last working day." })}
                </label>
                {fieldError("acknowledged")}
            </div>

            {submitError && <p className="mpr-form-error">{submitError}</p>}

            <div className="employee-request-modal-actions">
                <button type="button" className="employee-request-cancel" onClick={cancel} disabled={saving}>{t("resignation.form.cancel", { defaultValue: "Cancel" })}</button>
                <button type="submit" className="submit-leave-btn" disabled={saving}>{saving ? t("resignation.form.submitting", { defaultValue: "Submitting..." }) : t("resignation.form.submit", { defaultValue: "Submit" })}</button>
            </div>
        </form>
    );
}

function ResignationStatus({ resignation, actorId, onWithdrawn }) {
    const { t } = useTranslation();
    const confirm = useConfirm();

    const withdraw = async () => {
        const number = resignation.resignation_no;
        const date = formatDate(resignation.last_working_day);
        // The dialog stays open (spinner / error) until the request finishes
        const withdrawn = await confirm({
            variant: "danger",
            title: t("resignation.withdrawDialog.title", { defaultValue: "Withdraw resignation?" }),
            message: (
                <>
                    <p><Trans i18nKey="resignation.withdrawDialog.line1" values={{ number }} components={{ b: <strong /> }} defaults="You are about to withdraw resignation <b>{{number}}</b>." /></p>
                    <p><Trans i18nKey="resignation.withdrawDialog.line2" values={{ date }} components={{ b: <strong /> }} defaults="Your employment will continue as normal and the last working day of <b>{{date}}</b> will be cancelled." /></p>
                </>
            ),
            cancelText: t("resignation.withdrawDialog.keep", { defaultValue: "Keep Resignation" }),
            confirmText: t("resignation.withdrawDialog.confirm", { defaultValue: "Yes, Withdraw" }),
            loadingText: t("resignation.withdrawDialog.loading", { defaultValue: "Withdrawing…" }),
            onConfirm: () => api(`/api/resignations/${resignation.id}/withdraw`, { method: "POST", body: { actor_id: actorId } }),
        });
        if (withdrawn) onWithdrawn(t("resignation.withdrawDialog.done", { number, defaultValue: "Resignation {{number}} withdrawn. Your employment continues as normal." }));
    };

    return (
        <div className="resignation-card">
            <div className="resignation-card-heading">
                <div>
                    <h2>{t("resignation.status.heading", { number: resignation.resignation_no, defaultValue: "Resignation {{number}}" })}</h2>
                    <p>{t("resignation.status.submittedOn", { date: formatDate(resignation.resignation_date), defaultValue: "Submitted on {{date}}" })}</p>
                </div>
                <span className={`mpr-status ${resignationTone(resignation.status)}`}>{resignationStatusLabel(resignation.status)}</span>
            </div>

            <div className="resignation-facts">
                <div><label>{t("resignation.form.resignationDate", { defaultValue: "Resignation Date" })}</label><strong>{formatDate(resignation.resignation_date)}</strong></div>
                <div><label>{t("resignation.form.noticePeriod", { defaultValue: "Notice Period" })}</label><strong>{daysLabel(resignation.notice_period_days)}</strong></div>
                <div><label>{t("resignation.form.lastWorkingDay", { defaultValue: "Last Working Day" })}</label><strong>{formatDate(resignation.last_working_day)}</strong></div>
                <div><label>{t("resignation.status.reason", { defaultValue: "Reason" })}</label><strong>{reasonCategoryLabel(resignation.reason_category)}</strong></div>
            </div>

            <EarlyReleaseNote resignation={resignation} />
            {isServingNotice(resignation) && (
                <div className="resignation-banner inline">
                    {t("resignation.servingNotice", { days: daysLabel(resignation.days_remaining), date: formatDate(resignation.last_working_day), defaultValue: "Serving notice – {{days}} remaining. Last working day: {{date}}" })}
                </div>
            )}

            <ResignationTracker resignation={resignation} />

            <h3 className="resignation-subheading">{t("resignation.status.trackingDetails", { defaultValue: "Tracking details" })}</h3>
            <ResignationLog actions={resignation.actions} />

            {resignation.permissions?.canWithdraw && (
                <div className="mpr-owner-actions resignation-actions">
                    <button type="button" className="mpr-btn danger" onClick={withdraw}>
                        {t("resignation.status.withdraw", { defaultValue: "Withdraw Resignation" })}
                    </button>
                </div>
            )}
        </div>
    );
}

function ResignationApprovals({ approvals, actorId, onChanged }) {
    const { t } = useTranslation();
    const [selectedId, setSelectedId] = useState(null);

    return (
        <div className="jobs-section">
            <div className="jobs-table-container">
                <table className="jobs-table">
                    <thead>
                        <tr>
                            <th>{t("resignation.approvals.no", { defaultValue: "No" })}</th>
                            <th>{t("resignation.approvals.employee", { defaultValue: "Employee" })}</th>
                            <th>{t("resignation.approvals.department", { defaultValue: "Department" })}</th>
                            <th>{t("resignation.form.resignationDate", { defaultValue: "Resignation Date" })}</th>
                            <th>{t("resignation.form.lastWorkingDay", { defaultValue: "Last Working Day" })}</th>
                            <th>{t("resignation.approvals.status", { defaultValue: "Status" })}</th>
                            <th>{t("resignation.approvals.action", { defaultValue: "Action" })}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {approvals.length === 0 ? (
                            <tr><td colSpan="7">{t("resignation.approvals.empty", { defaultValue: "Nothing is waiting for your approval." })}</td></tr>
                        ) : approvals.map((row) => (
                            <tr key={row.id} className="mpr-row-awaiting">
                                <td>{row.resignation_no}</td>
                                <td><strong>{row.employee_name}</strong><br /><small>{row.employee_id}</small></td>
                                <td>{row.department || "—"}</td>
                                <td>{formatDate(row.resignation_date)}</td>
                                <td>
                                    {formatDate(row.last_working_day)}
                                    {row.early_release && <><br /><span className="mpr-budget-pill exception">{t("resignation.approvals.earlyRelease", { defaultValue: "Early release requested" })}</span></>}
                                </td>
                                <td><span className={`mpr-status ${resignationTone(row.status)}`}>{resignationStatusLabel(row.status)}</span></td>
                                <td><button type="button" className="create-job-btn" onClick={() => setSelectedId(row.id)}>{t("resignation.approvals.review", { defaultValue: "Review" })}</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {selectedId && (
                <ResignationDetail resignationId={selectedId} actorId={actorId} onClose={() => setSelectedId(null)} onChanged={onChanged} />
            )}
        </div>
    );
}

function EmployeeResignation({ employee, info, error, onReload, onCancel }) {
    const { t } = useTranslation();
    const [selectedTab, setTab] = useState("mine");
    const [notice, setNotice] = useState("");

    if (error) return <section className="employee-resignation-view"><p className="mpr-form-error">{error}</p></section>;
    if (!info) return <section className="employee-resignation-view"><p className="mpr-muted">{t("resignation.loading", { defaultValue: "Loading resignation..." })}</p></section>;

    const tab = info.isApprover ? selectedTab : "mine";
    const lastClosed = !info.active ? info.history.find((row) => ["Rejected", "Withdrawn"].includes(row.status)) : null;

    return (
        <section className="employee-resignation-view">
            {info.isApprover && (
                <div className="mpr-subtabs" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>
                        {t("resignation.tabs.mine", { defaultValue: "My Resignation" })}
                    </button>
                    <button type="button" role="tab" aria-selected={tab === "approvals"} className={tab === "approvals" ? "active" : ""} onClick={() => setTab("approvals")}>
                        {t("resignation.tabs.approvals", { defaultValue: "My Approvals" })} {info.approvals.length > 0 && <span className="mpr-count">{info.approvals.length}</span>}
                    </button>
                </div>
            )}

            {notice && <p className="mpr-notice">{notice}</p>}

            {tab === "approvals" ? (
                <ResignationApprovals approvals={info.approvals} actorId={employee.employee_id} onChanged={onReload} />
            ) : info.active ? (
                <ResignationStatus resignation={info.active} actorId={employee.employee_id} onWithdrawn={(message) => { setNotice(message); onReload(); }} />
            ) : (
                <>
                    {lastClosed && !notice && (
                        <div
                            className={`resignation-previous-alert ${lastClosed.status === "Rejected" ? "rejected" : "withdrawn"}`}
                            role="alert"
                        >
                            <span className="resignation-previous-alert-icon" aria-hidden="true">
                                {lastClosed.status === "Rejected" ? "!" : "i"}
                            </span>
                            <div>
                                <strong>
                                    {lastClosed.status === "Rejected"
                                        ? t("resignation.previous.rejected", { number: lastClosed.resignation_no, defaultValue: "Your previous resignation {{number}} was rejected" })
                                        : t("resignation.previous.withdrawn", { number: lastClosed.resignation_no, defaultValue: "Your previous resignation {{number}} was withdrawn" })}
                                </strong>
                                {lastClosed.rejection_reason && (
                                    <p>{t("resignation.previous.reason", { reason: lastClosed.rejection_reason, defaultValue: "Reason: {{reason}}" })}</p>
                                )}
                            </div>
                        </div>
                    )}
                    <ResignationForm
                        key={info.calculatedLastWorkingDay}
                        employee={employee}
                        info={info}
                        onCancel={onCancel}
                        onSubmitted={() => { setNotice(t("resignation.form.submitted", { defaultValue: "Resignation submitted. You'll be notified at every step." })); onReload(); }}
                    />
                </>
            )}
        </section>
    );
}

export default EmployeeResignation;