// Employee portal → Resignation (FRD SHELTER-HCM-SSP-20-001)
// No active resignation: the form (also after a rejection / withdrawal). Otherwise: the tracker card
// (8 steps, last working day, days left, stage line), clearance items, tracking log, Withdraw.
// Line Managers get "My Approvals → Resignations"; clearance owners "My Approvals → Clearance".
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import DatePicker from "../components/layout/common/DatePicker";
import "../pages/hr/Recruitment.css";
import "../components/recruitment/recruitment.css";
import "../components/resignation/resignation.css";
import ClearanceList from "../components/resignation/ClearanceList";
import ResignationDetail, { EarlyReleaseNote, ResignationLog } from "../components/resignation/ResignationDetail";
import ResignationProgress from "../components/resignation/ResignationProgress";
import SettlementTable from "../components/resignation/SettlementTable";
import { EXIT_LETTER_TITLES, exitLetterPdf, pdfFileName, settlementStatementPdf } from "../components/resignation/resignationPdf";
import { DAYS_LEFT_WARNING } from "../components/resignation/resignationListState";
import {
    LETTER_ACCEPT,
    LETTER_MAX_BYTES,
    LETTER_TYPES,
    REASON_CATEGORIES,
    api,
    daysLabel,
    employeeSettlementLabel,
    employeeStageLine,
    formatDate,
    formatQar,
    ltrText,
    postForm,
    reasonCategoryLabel,
    resignationStatusLabel,
    resignationTone,
    settlementTone,
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

// After submitting: tracker card (number, status, 8 steps, last working day, days left, stage line),
// clearance items, tracking log and an in-page "Withdraw resignation" confirmation.
function ResignationStatus({ resignation, actorId, onWithdrawn }) {
    const { t } = useTranslation();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const confirmRef = useRef(null);
    const withdrawButtonRef = useRef(null);

    useEffect(() => {
        if (confirming) confirmRef.current?.focus();
    }, [confirming]);

    const number = resignation.resignation_no;
    const stageLine = employeeStageLine(resignation);
    const daysLeft = resignation.days_remaining;
    const settlementLabel = employeeSettlementLabel(resignation);
    const documents = resignation.exit_documents || {};
    const downloads = [
        ...(resignation.settlement && resignation.settlement_status === "Approved" ? [{
            key: "statement",
            label: t("resignation.settlement.download", { defaultValue: "Download settlement statement" }),
            onClick: () => settlementStatementPdf(resignation, resignation.settlement).save(pdfFileName(resignation, "settlement_statement")),
        }] : []),
        ...["experience_certificate", "relieving_letter"].filter((type) => documents[type]).map((type) => ({
            key: type,
            label: EXIT_LETTER_TITLES[type],
            onClick: () => exitLetterPdf(type, resignation, documents[type].issued_on).save(pdfFileName(resignation, type)),
        })),
    ];

    const cancelWithdraw = () => {
        setConfirming(false);
        setError("");
        withdrawButtonRef.current?.focus();
    };

    const withdraw = async () => {
        setBusy(true);
        setError("");
        try {
            await api(`/api/resignations/${resignation.id}/withdraw`, { method: "POST", body: { actor_id: actorId } });
            onWithdrawn(t("resignation.withdrawDialog.done", { number, defaultValue: "Resignation {{number}} withdrawn. Your employment continues as normal." }));
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="resignation-card resignation-tracker-card">
            <div className="resignation-card-heading">
                <div>
                    <h2>{t("resignation.status.heading", { number: ltrText(number), defaultValue: "Resignation {{number}}" })}</h2>
                    <p>{t("resignation.status.submittedOn", { date: formatDate(resignation.resignation_date), defaultValue: "Submitted on {{date}}" })}</p>
                </div>
                <span className={`mpr-status ${resignationTone(resignation.status)}`}>{resignationStatusLabel(resignation.status)}</span>
            </div>

            <div className="resignation-tracker-steps"><ResignationProgress resignation={resignation} /></div>

            {stageLine && <p className="resignation-stage-line" role="status">{stageLine}</p>}

            <div className="resignation-facts">
                <div><label>{t("resignation.form.lastWorkingDay", { defaultValue: "Last Working Day" })}</label><strong dir="ltr">{formatDate(resignation.last_working_day)}</strong></div>
                {daysLeft !== null && daysLeft !== undefined && (
                    <div>
                        <label>{t("resignation.detail.daysRemaining", { defaultValue: "Days Remaining" })}</label>
                        <strong className={daysLeft <= DAYS_LEFT_WARNING ? "resignation-days-left urgent" : ""}>
                            {t("resignation.case.daysLeft", { count: daysLeft, defaultValue: daysLeft === 1 ? "{{count}} day left" : "{{count}} days left" })}
                        </strong>
                    </div>
                )}
                <div><label>{t("resignation.form.noticePeriod", { defaultValue: "Notice Period" })}</label><strong>{daysLabel(resignation.notice_period_days)}</strong></div>
                <div><label>{t("resignation.status.reason", { defaultValue: "Reason" })}</label><strong>{reasonCategoryLabel(resignation.reason_category)}</strong></div>
            </div>

            <EarlyReleaseNote resignation={resignation} />

            {resignation.clearance?.length > 0 && (
                <>
                    <h3 className="resignation-subheading">{t("resignation.clearance.yourItems", { defaultValue: "Your clearance items" })}</h3>
                    <ClearanceList departments={resignation.clearance} idPrefix="my-clearance" showOwners={false} />
                </>
            )}

            {settlementLabel && (
                <section className="employee-settlement" aria-labelledby="employee-settlement-title">
                    <div className="employee-settlement-head">
                        <h3 id="employee-settlement-title" className="resignation-subheading">{t("resignation.settlement.title", { defaultValue: "Final settlement" })}</h3>
                        <span className={`mpr-status ${settlementTone(resignation.settlement_status === "Approved" ? "Approved" : resignation.settlement_status === "With Finance" ? "With Finance" : "Draft")}`}>{settlementLabel}</span>
                    </div>
                    {resignation.settlement && resignation.settlement_status === "Approved" && (
                        <p className={`employee-settlement-net${resignation.settlement.net < 0 ? " owes" : ""}`}>
                            <span>{resignation.settlement.net < 0
                                ? t("resignation.settlement.toRecover", { defaultValue: "Amount to be recovered" })
                                : t("resignation.settlement.net", { defaultValue: "Net amount payable" })}</span>
                            <strong dir="ltr">{formatQar(Math.abs(resignation.settlement.net))}</strong>
                        </p>
                    )}
                    {downloads.length > 0 && (
                        <div className="resignation-downloads">
                            {downloads.map((item) => (
                                <button key={item.key} type="button" className="hiring-btn ghost" onClick={item.onClick}>
                                    <Download size={15} aria-hidden="true" /> {item.label}
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            )}

            <h3 className="resignation-subheading">{t("resignation.status.trackingDetails", { defaultValue: "Tracking details" })}</h3>
            <div className="resignation-log-scroll"><ResignationLog actions={resignation.actions} /></div>

            {resignation.permissions?.canWithdraw && !confirming && (
                <div className="mpr-owner-actions resignation-actions">
                    <button ref={withdrawButtonRef} type="button" className="mpr-btn danger" onClick={() => setConfirming(true)}>
                        {t("resignation.status.withdraw", { defaultValue: "Withdraw Resignation" })}
                    </button>
                </div>
            )}

            {resignation.permissions?.canWithdraw && confirming && (
                <div
                    ref={confirmRef}
                    className="resignation-withdraw-confirm"
                    role="group"
                    aria-labelledby="resignation-withdraw-title"
                    tabIndex={-1}
                    onKeyDown={(event) => event.key === "Escape" && !busy && cancelWithdraw()}
                >
                    <h3 id="resignation-withdraw-title">{t("resignation.withdrawDialog.title", { defaultValue: "Withdraw resignation?" })}</h3>
                    <p><Trans i18nKey="resignation.withdrawDialog.line1" values={{ number }} components={{ b: <strong /> }} defaults="You are about to withdraw resignation <b>{{number}}</b>." /></p>
                    <p><Trans i18nKey="resignation.withdrawDialog.line2" values={{ date: formatDate(resignation.last_working_day) }} components={{ b: <strong /> }} defaults="Your employment will continue as normal and the last working day of <b>{{date}}</b> will be cancelled." /></p>
                    {error && <p className="mpr-form-error" role="alert">{error}</p>}
                    <div className="resignation-withdraw-buttons">
                        <button type="button" className="employee-request-cancel" onClick={cancelWithdraw} disabled={busy}>
                            {t("resignation.withdrawDialog.keep", { defaultValue: "Keep Resignation" })}
                        </button>
                        <button type="button" className="mpr-btn danger" onClick={withdraw} disabled={busy}>
                            {busy ? t("resignation.withdrawDialog.loading", { defaultValue: "Withdrawing…" }) : t("resignation.withdrawDialog.confirm", { defaultValue: "Yes, Withdraw" })}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ResignationApprovals({ approvals, actorId, onChanged }) {
    const { t } = useTranslation();
    const [selectedId, setSelectedId] = useState(null);

    if (approvals.length === 0) {
        return <p className="mpr-muted resignation-empty">{t("resignation.approvals.empty", { defaultValue: "Nothing is waiting for your approval." })}</p>;
    }

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
                        {approvals.map((row) => (
                            <tr key={row.id} className="mpr-row-awaiting">
                                <td><span dir="ltr">{row.resignation_no}</span></td>
                                <td><strong>{row.employee_name}</strong><br /><small dir="ltr">{row.employee_id}</small></td>
                                <td>{row.department || "—"}</td>
                                <td><span dir="ltr">{formatDate(row.resignation_date)}</span></td>
                                <td>
                                    <span dir="ltr">{formatDate(row.last_working_day)}</span>
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

// My Approvals → Clearance: departments this person owns for resignations in Exit Clearance
function ClearanceTasks({ tasks, onChanged }) {
    const { t } = useTranslation();
    const [notice, setNotice] = useState("");

    if (tasks.length === 0) {
        return <p className="mpr-muted resignation-empty">{t("resignation.clearance.noTasks", { defaultValue: "No exit clearance is waiting for you." })}</p>;
    }

    const saveItem = async (resignationId, item, { status, amount }) => {
        await api(`/api/resignations/${resignationId}/clearance/items/${item.id}`, { method: "PUT", body: { status, amount } });
        setNotice(t("resignation.clearance.savedNotice", { item: item.name, defaultValue: "{{item}} updated." }));
        onChanged();
    };

    return (
        <div className="clearance-tasks">
            {notice && <p className="mpr-notice" role="status">{notice}</p>}
            {tasks.map(({ resignation, departments }) => (
                <article key={resignation.id} className="resignation-card clearance-task" aria-labelledby={`clearance-task-${resignation.id}`}>
                    <div className="resignation-card-heading">
                        <div>
                            <h2 id={`clearance-task-${resignation.id}`}>{resignation.employee_name}</h2>
                            <p>
                                <span dir="ltr">{resignation.employee_id}</span>
                                {resignation.designation ? ` · ${resignation.designation}` : ""}
                                {resignation.department ? ` · ${resignation.department}` : ""}
                            </p>
                        </div>
                        <span className="mpr-chip">
                            {t("resignation.case.lastDay", { date: ltrText(formatDate(resignation.last_working_day)), defaultValue: "Last day {{date}}" })}
                            {resignation.days_left !== null && resignation.days_left !== undefined && (
                                <span className={resignation.days_left <= DAYS_LEFT_WARNING ? "resignation-days-left urgent" : ""}>
                                    {" · "}{t("resignation.case.daysLeft", { count: resignation.days_left, defaultValue: resignation.days_left === 1 ? "{{count}} day left" : "{{count}} days left" })}
                                </span>
                            )}
                        </span>
                    </div>
                    <ClearanceList
                        departments={departments}
                        canEdit={() => true}
                        onSave={(item, change) => saveItem(resignation.id, item, change)}
                        idPrefix={`task-${resignation.id}`}
                        showOwners={false}
                    />
                </article>
            ))}
        </div>
    );
}

// My Approvals → Settlements: Finance approves or returns final settlements (frozen figures)
function SettlementTask({ task, onChanged }) {
    const { t } = useTranslation();
    const [remark, setRemark] = useState("");
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [confirming, setConfirming] = useState("");
    const remarkId = `settlement-remark-${task.id}`;

    const decide = async (action) => {
        if (action === "return" && !remark.trim()) {
            setError(t("resignation.settlement.errors.returnRemark", { defaultValue: "Enter a remark so HR knows what to change." }));
            return;
        }
        setBusy(action);
        setError("");
        try {
            await api(`/api/resignations/${task.id}/settlement/${action}`, { method: "POST", body: { remark: remark.trim() } });
            onChanged(action === "approve"
                ? t("resignation.settlement.done.approvedFor", { name: task.employee_name, defaultValue: "Settlement for {{name}} approved." })
                : t("resignation.settlement.done.returnedFor", { name: task.employee_name, defaultValue: "Settlement for {{name}} returned to HR." }));
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy("");
            setConfirming("");
        }
    };

    return (
        <article className="resignation-card settlement-task" aria-labelledby={`settlement-task-${task.id}`}>
            <div className="resignation-card-heading">
                <div>
                    <h2 id={`settlement-task-${task.id}`}>{task.employee_name}</h2>
                    <p>
                        <span dir="ltr">{task.employee_id}</span>
                        {task.designation ? ` · ${task.designation}` : ""}
                        {task.grade ? <> · <span dir="ltr">{task.grade}</span></> : ""}
                        {" · "}<span dir="ltr">{task.resignation_no}</span>
                    </p>
                </div>
                <span className="mpr-chip">{t("resignation.case.lastDay", { date: ltrText(formatDate(task.last_working_day)), defaultValue: "Last day {{date}}" })}</span>
            </div>
            <SettlementTable settlement={task.settlement} idPrefix={`finance-${task.id}`} />
            <label className="hiring-label" htmlFor={remarkId}>{t("resignation.case.remark", { defaultValue: "Remark" })} <small>{t("resignation.settlement.remarkHint", { defaultValue: "Required to return" })}</small></label>
            <textarea id={remarkId} className="settlement-remark" rows="2" value={remark} onChange={(event) => { setRemark(event.target.value); setError(""); }} aria-invalid={Boolean(error)} />
            {error && <p className="mpr-form-error" role="alert">{error}</p>}
            {confirming ? (
                <div className="resignation-withdraw-confirm settlement-confirm" role="group" aria-label={t("resignation.settlement.confirm", { defaultValue: "Confirm" })}>
                    <p>{confirming === "approve"
                        ? t("resignation.settlement.approveMessage", { amount: formatQar(task.settlement?.net), defaultValue: "Net payable {{amount}}. The resignation moves to Exit Formalities." })
                        : t("resignation.settlement.returnMessage", { defaultValue: "HR is notified with your remark and can send it again." })}</p>
                    <div className="resignation-withdraw-buttons">
                        <button type="button" className="employee-request-cancel" onClick={() => setConfirming("")} disabled={Boolean(busy)}>{t("resignation.form.cancel", { defaultValue: "Cancel" })}</button>
                        <button type="button" className={`mpr-btn ${confirming === "approve" ? "success" : "danger"}`} onClick={() => decide(confirming)} disabled={Boolean(busy)}>
                            {busy ? t("profileEdit.saving", { defaultValue: "Saving..." }) : confirming === "approve" ? t("resignation.settlement.approve", { defaultValue: "Approve" }) : t("resignation.settlement.return", { defaultValue: "Return" })}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="resignation-withdraw-buttons">
                    <button type="button" className="hiring-btn ghost" onClick={() => settlementStatementPdf(task, task.settlement).save(pdfFileName(task, "settlement_statement"))}>
                        <Download size={15} aria-hidden="true" /> {t("resignation.settlement.download", { defaultValue: "Download settlement statement" })}
                    </button>
                    <button type="button" className="mpr-btn danger" onClick={() => (remark.trim() ? setConfirming("return") : decide("return"))}>{t("resignation.settlement.return", { defaultValue: "Return" })}</button>
                    <button type="button" className="mpr-btn success" onClick={() => setConfirming("approve")}>{t("resignation.settlement.approve", { defaultValue: "Approve" })}</button>
                </div>
            )}
        </article>
    );
}

function SettlementTasks({ tasks, onChanged }) {
    const { t } = useTranslation();
    const [notice, setNotice] = useState("");
    if (tasks.length === 0 && !notice) {
        return <p className="mpr-muted resignation-empty">{t("resignation.settlement.noTasks", { defaultValue: "No final settlement is waiting for you." })}</p>;
    }
    return (
        <div className="clearance-tasks">
            {notice && <p className="mpr-notice" role="status">{notice}</p>}
            {tasks.map((task) => <SettlementTask key={task.id} task={task} onChanged={(message) => { setNotice(message); onChanged(); }} />)}
        </div>
    );
}

function EmployeeResignation({ employee, info, error, onReload, onCancel }) {
    const { t } = useTranslation();
    const [selectedTab, setTab] = useState("mine");
    const [approvalTab, setApprovalTab] = useState(null);
    const [notice, setNotice] = useState("");

    if (error) return <section className="employee-resignation-view"><p className="mpr-form-error">{error}</p></section>;
    if (!info) return <section className="employee-resignation-view"><p className="mpr-muted">{t("resignation.loading", { defaultValue: "Loading resignation..." })}</p></section>;

    const tab = info.isApprover ? selectedTab : "mine";
    const approvals = info.approvals || [];
    const clearanceTasks = info.clearanceTasks || [];
    const settlementTasks = info.settlementTasks || [];
    const pendingClearance = clearanceTasks.reduce((sum, task) => sum + task.departments.reduce((count, department) => count + department.items.filter((item) => item.status === "Pending").length, 0), 0);
    // Opens on Clearance when only clearance is waiting
    const subTab = approvalTab
        || (approvals.length > 0 ? "resignations" : clearanceTasks.length > 0 ? "clearance" : settlementTasks.length > 0 ? "settlements" : "resignations");
    const lastClosed = !info.active ? info.history.find((row) => ["Rejected", "Withdrawn"].includes(row.status)) : null;

    return (
        <section className="employee-resignation-view">
            {info.isApprover && (
                <div className="mpr-subtabs" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>
                        {t("resignation.tabs.mine", { defaultValue: "My Resignation" })}
                    </button>
                    <button type="button" role="tab" aria-selected={tab === "approvals"} className={tab === "approvals" ? "active" : ""} onClick={() => setTab("approvals")}>
                        {t("resignation.tabs.approvals", { defaultValue: "My Approvals" })} {approvals.length + clearanceTasks.length + settlementTasks.length > 0 && <span className="mpr-count">{approvals.length + clearanceTasks.length + settlementTasks.length}</span>}
                    </button>
                </div>
            )}

            {notice && <p className="mpr-notice">{notice}</p>}

            {tab === "approvals" ? (
                <>
                    <div className="mpr-subtabs resignation-approval-tabs" role="tablist" aria-label={t("resignation.tabs.approvals", { defaultValue: "My Approvals" })}>
                        <button type="button" role="tab" aria-selected={subTab === "resignations"} className={subTab === "resignations" ? "active" : ""} onClick={() => setApprovalTab("resignations")}>
                            {t("resignation.tabs.resignations", { defaultValue: "Resignations" })} {approvals.length > 0 && <span className="mpr-count">{approvals.length}</span>}
                        </button>
                        <button type="button" role="tab" aria-selected={subTab === "clearance"} className={subTab === "clearance" ? "active" : ""} onClick={() => setApprovalTab("clearance")}>
                            {t("resignation.tabs.clearance", { defaultValue: "Clearance" })} {pendingClearance > 0 && <span className="mpr-count">{pendingClearance}</span>}
                        </button>
                        {(settlementTasks.length > 0 || subTab === "settlements") && (
                            <button type="button" role="tab" aria-selected={subTab === "settlements"} className={subTab === "settlements" ? "active" : ""} onClick={() => setApprovalTab("settlements")}>
                                {t("resignation.tabs.settlements", { defaultValue: "Settlements" })} {settlementTasks.length > 0 && <span className="mpr-count">{settlementTasks.length}</span>}
                            </button>
                        )}
                    </div>
                    {subTab === "settlements"
                        ? <SettlementTasks tasks={settlementTasks} onChanged={onReload} />
                        : subTab === "clearance"
                        ? <ClearanceTasks tasks={clearanceTasks} onChanged={onReload} />
                        : <ResignationApprovals approvals={approvals} actorId={employee.employee_id} onChanged={onReload} />}
                </>
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
