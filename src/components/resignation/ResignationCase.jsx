// HR portal → Resignations → View: the resignation case window (same shell as the Hiring
// candidate window). Sticky header, 8 progress steps, then the action card for the current
// status (left) and Details / Letter / History tabs (right). Full screen on phones.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    CalendarClock,
    CheckCircle2,
    ClipboardCheck,
    Download,
    FileText,
    Hourglass,
    LogOut,
    Send,
    ShieldCheck,
    Undo2,
    UserCheck,
    UserX,
    Wallet,
    XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { useConfirm } from "../common/dialog/dialogContext";
import DatePicker from "../layout/common/DatePicker";
import "../../pages/hr/Recruitment.css";
import "../recruitment/recruitment.css";
import "./resignation.css";
import ClearanceList from "./ClearanceList";
import ResignationProgress from "./ResignationProgress";
import SettlementTable from "./SettlementTable";
import { leaveDaysLabel, settlementTotals } from "./settlementFormat";
import { applyInputOverrides, calculateSettlement } from "../../../backend/services/settlementCalculation.js";
import { EXIT_LETTER_TITLES, exitLetterPdf, pdfBase64, pdfFileName, settlementStatementPdf } from "./resignationPdf";
import {
    addDaysToKey,
    api,
    daysBetweenKeys,
    daysLabel,
    formatDate,
    formatDateTime,
    formatQar,
    initialsOf,
    openResignationLetter,
    ltrText,
    noticeSourceLabel,
    reasonCategoryLabel,
    resignationActionLabel,
    resignationStatusLabel,
    resignationTone,
    settlementStatusLabel,
    settlementTone,
} from "./resignationApi";
import { DAYS_LEFT_WARNING } from "./resignationListState";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const show = (value) => (value === null || value === undefined || value === "" ? "—" : value);
const money = (value) => (value === null || value === undefined ? "—" : formatQar(value));
// Grade / Line manager: "Not set" in muted text instead of a dash
const showOrNotSet = (value) => (value === null || value === undefined || String(value).trim() === ""
    ? <span className="case-not-set">{i18n.t("resignation.case.notSet", { defaultValue: "Not set" })}</span>
    : value);

// ===================== SHARED CARD SHELL (Hiring window styles) =====================

function CaseCard({ icon: Icon, tone = "info", title, description, footer, children }) {
    return (
        <section className="hiring-card" aria-labelledby="resignation-card-title">
            <header className="hiring-card-head">
                <span className={`hiring-card-icon ${tone}`} aria-hidden="true"><Icon size={18} /></span>
                <div>
                    <h3 id="resignation-card-title">{title}</h3>
                    {description && <p>{description}</p>}
                </div>
            </header>
            {children && <div className="hiring-card-body">{children}</div>}
            {footer && <footer className="hiring-card-footer">{footer}</footer>}
        </section>
    );
}

function Countdown({ resignation }) {
    const { t } = useTranslation();
    const left = resignation.days_remaining;
    if (left === null || left === undefined) return null;
    const total = Math.max(1, daysBetweenKeys(resignation.resignation_date, resignation.last_working_day));
    const done = Math.min(total, Math.max(0, total - left));
    const percent = Math.round((done / total) * 100);
    return (
        <div className={`resignation-countdown${left <= DAYS_LEFT_WARNING ? " urgent" : ""}`}>
            <div className="resignation-countdown-head">
                <strong>{t("resignation.case.daysLeft", { count: left, defaultValue: left === 1 ? "{{count}} day left" : "{{count}} days left" })}</strong>
                <span>{t("resignation.case.lastDay", { date: ltrText(formatDate(resignation.last_working_day)), defaultValue: "Last day {{date}}" })}</span>
            </div>
            <div
                className="resignation-progressbar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label={t("resignation.case.noticeProgress", { defaultValue: "Notice period progress" })}
            >
                <span style={{ width: `${percent}%` }} />
            </div>
            <small>{t("resignation.case.noticeServed", { done, total, defaultValue: "{{done}} of {{total}} notice days served" })}</small>
        </div>
    );
}

// ===================== ACTION CARDS =====================

// Pending Line Manager / Department Head: HR only acts when it holds the step (no manager assigned)
function PendingManagerCard({ resignation, run }) {
    const { t } = useTranslation();
    const [remark, setRemark] = useState("");
    const [error, setError] = useState("");
    const step = resignation.workflow[resignation.current_step];
    const names = step?.approvers.map((person) => person.name).join(", ");

    if (!resignation.permissions.canApprove) {
        return (
            <CaseCard
                icon={Hourglass}
                tone="warning"
                title={t("resignation.case.waitingManager", { role: step?.label || "Line Manager", defaultValue: "Waiting for the {{role}}" })}
                description={names
                    ? t("resignation.case.waitingNames", { names, defaultValue: "{{names}} approves first in Employee portal → Resignation → My Approvals. HR accepts after that." })
                    : t("resignation.case.noApprover", { defaultValue: "No approver is assigned. Set one in Settings → Approval Workflows." })}
            />
        );
    }

    const decide = (action) => {
        if (action === "reject" && !remark.trim()) return setError(t("resignation.detail.errors.rejectReasonRequired", { defaultValue: "Enter a reason for rejecting" }));
        setError("");
        run({
            path: `decision/${action}`,
            body: { remark: remark.trim() },
            variant: action === "reject" ? "danger" : "success",
            title: action === "reject" ? t("resignation.detail.dialog.rejectTitle", { defaultValue: "Reject resignation?" }) : t("resignation.detail.dialog.approveTitle", { defaultValue: "Approve resignation?" }),
            message: action === "reject"
                ? t("resignation.detail.dialog.rejectMessage", { number: ltrText(resignation.resignation_no), name: resignation.employee_name, defaultValue: "{{number}} for {{name}} will be rejected and the employee will be notified." })
                : t("resignation.detail.dialog.approveMessage", { number: ltrText(resignation.resignation_no), defaultValue: "{{number}} will move to the next approver." }),
            confirmText: action === "reject" ? t("resignation.detail.dialog.reject", { defaultValue: "Reject" }) : t("resignation.detail.dialog.approve", { defaultValue: "Approve" }),
            done: action === "reject" ? t("resignation.case.done.rejected", { defaultValue: "Resignation rejected. The employee has been emailed." }) : t("resignation.case.done.approved", { defaultValue: "Approved. It now waits for HR." }),
        });
    };

    return (
        <CaseCard
            icon={UserCheck}
            title={t("resignation.case.managerDecision", { role: step?.label, defaultValue: "{{role}} decision" })}
            description={step?.via ? t("resignation.detail.routedTo", { via: step.via, defaultValue: "Routed to {{via}}" }) : null}
            footer={(
                <div className="hiring-card-buttons">
                    <button type="button" className="hiring-btn danger" onClick={() => decide("reject")}><XCircle size={15} aria-hidden="true" /> {t("resignation.detail.dialog.reject", { defaultValue: "Reject" })}</button>
                    <button type="button" className="hiring-btn primary" onClick={() => decide("approve")}><CheckCircle2 size={15} aria-hidden="true" /> {t("resignation.detail.dialog.approve", { defaultValue: "Approve" })}</button>
                </div>
            )}
        >
            <label className="hiring-label" htmlFor="resignation-manager-remark">{t("resignation.case.remark", { defaultValue: "Remark" })} <small>{t("resignation.case.remarkRejectHint", { defaultValue: "Required to reject" })}</small></label>
            <textarea id="resignation-manager-remark" rows="3" value={remark} onChange={(event) => { setRemark(event.target.value); setError(""); }} aria-invalid={Boolean(error)} aria-describedby={error ? "resignation-manager-error" : undefined} />
            {error && <p className="mpr-form-error" id="resignation-manager-error" role="alert">{error}</p>}
        </CaseCard>
    );
}

// Pending HR: notice period (from Settings, editable), last working day (resignation date + notice, editable), remarks
function AcceptCard({ resignation, run }) {
    const { t } = useTranslation();
    const suggested = resignation.suggested_notice || { days: resignation.notice_period_days, last_working_day: resignation.last_working_day };
    const [noticeDays, setNoticeDays] = useState(String(suggested.days));
    const [lastDay, setLastDay] = useState(suggested.last_working_day);
    const [lastDayEdited, setLastDayEdited] = useState(false);
    const [remarks, setRemarks] = useState("");
    const [errors, setErrors] = useState({});

    if (!resignation.permissions.canApprove) {
        return <CaseCard icon={Hourglass} tone="warning" title={t("resignation.case.waitingHR", { defaultValue: "Waiting for HR" })} description={t("resignation.case.notYourStep", { defaultValue: "Another HR user accepts this resignation." })} />;
    }

    const changeNotice = (value) => {
        setNoticeDays(value);
        setErrors((current) => ({ ...current, notice: undefined }));
        const days = Number(value);
        if (!lastDayEdited && Number.isInteger(days) && days >= 0 && days <= 365) setLastDay(addDaysToKey(resignation.resignation_date, days));
    };

    const validate = (forAccept) => {
        const found = {};
        const days = Number(noticeDays);
        if (forAccept) {
            if (noticeDays === "" || !Number.isInteger(days) || days < 0 || days > 365) found.notice = t("resignation.case.errors.notice", { defaultValue: "Enter a notice period of 0–365 days" });
            if (!lastDay) found.lastDay = t("resignation.detail.errors.chooseLwd", { defaultValue: "Choose the last working day." });
            else if (lastDay < resignation.today) found.lastDay = t("resignation.detail.errors.lwdPast", { defaultValue: "Last working day can't be in the past." });
        } else if (!remarks.trim()) {
            found.remarks = t("resignation.case.errors.rejectRemark", { defaultValue: "Enter a remark to reject. The employee receives it by email." });
        }
        setErrors(found);
        return !Object.values(found).some(Boolean);
    };

    const accept = () => validate(true) && run({
        path: "approve",
        body: { notice_period_days: Number(noticeDays), last_working_day: lastDay, remark: remarks.trim() },
        variant: "success",
        title: t("resignation.detail.dialog.acceptTitle", { defaultValue: "Accept resignation?" }),
        message: t("resignation.case.acceptMessage", { name: resignation.employee_name, date: ltrText(formatDate(lastDay)), days: daysLabel(noticeDays), defaultValue: "{{name}} starts serving a {{days}} notice. Last working day {{date}}. An acceptance letter is emailed to the employee." }),
        confirmText: t("resignation.case.accept", { defaultValue: "Accept resignation" }),
        done: t("resignation.case.done.accepted", { defaultValue: "Resignation accepted. The acceptance letter was emailed to the employee." }),
    });

    const reject = () => validate(false) && run({
        path: "reject",
        body: { remark: remarks.trim() },
        variant: "danger",
        title: t("resignation.detail.dialog.rejectTitle", { defaultValue: "Reject resignation?" }),
        message: t("resignation.detail.dialog.rejectMessage", { number: ltrText(resignation.resignation_no), name: resignation.employee_name, defaultValue: "{{number}} for {{name}} will be rejected and the employee will be notified." }),
        confirmText: t("resignation.detail.dialog.reject", { defaultValue: "Reject" }),
        done: t("resignation.case.done.rejected", { defaultValue: "Resignation rejected. The employee has been emailed." }),
    });

    const requestedDiffers = resignation.requested_last_working_day && resignation.requested_last_working_day !== lastDay;

    return (
        <CaseCard
            icon={ShieldCheck}
            title={t("resignation.case.acceptTitle", { defaultValue: "HR acceptance" })}
            description={t("resignation.case.acceptHint", { defaultValue: "Confirm the notice period and last working day. Accepting starts the notice period and emails the employee an acceptance letter." })}
            footer={(
                <>
                    <p className="hiring-card-note">{t("resignation.case.rejectNote", { defaultValue: "Rejecting needs a remark; the employee is emailed." })}</p>
                    <div className="hiring-card-buttons">
                        <button type="button" className="hiring-btn danger" onClick={reject}><XCircle size={15} aria-hidden="true" /> {t("resignation.detail.dialog.reject", { defaultValue: "Reject" })}</button>
                        <button type="button" className="hiring-btn primary" onClick={accept}><CheckCircle2 size={15} aria-hidden="true" /> {t("resignation.case.accept", { defaultValue: "Accept resignation" })}</button>
                    </div>
                </>
            )}
        >
            <div className="resignation-form-grid">
                <div>
                    <label className="hiring-label" htmlFor="resignation-notice-days">{t("resignation.case.noticeDays", { defaultValue: "Notice period (days)" })} <span className="required-mark">*</span></label>
                    <input id="resignation-notice-days" type="number" min="0" max="365" inputMode="numeric" value={noticeDays} onChange={(event) => changeNotice(event.target.value)} aria-invalid={Boolean(errors.notice)} aria-describedby="resignation-notice-hint" />
                    <small className="hiring-hint" id="resignation-notice-hint">
                        {t("resignation.case.noticeFrom", { source: noticeSourceLabel(suggested.source) || "Settings", days: daysLabel(suggested.days), defaultValue: "From Settings: {{days}} ({{source}})" })}
                    </small>
                    {errors.notice && <p className="mpr-form-error" role="alert">{errors.notice}</p>}
                </div>
                <div>
                    <span className="hiring-label" id="resignation-lwd-label">{t("resignation.detail.lwd", { defaultValue: "Last working day" })} <span className="required-mark">*</span></span>
                    <DatePicker value={lastDay} onChange={(value) => { setLastDay(value); setLastDayEdited(true); setErrors((current) => ({ ...current, lastDay: undefined })); }} minDate={resignation.today} today={resignation.today} autoPosition />
                    <small className="hiring-hint">
                        {t("resignation.case.lwdHint", { date: ltrText(formatDate(resignation.resignation_date)), defaultValue: "Resignation date {{date}} + notice period" })}
                    </small>
                    {requestedDiffers && (
                        <small className="hiring-hint resignation-requested">
                            {t("resignation.case.requested", { date: ltrText(formatDate(resignation.requested_last_working_day)), defaultValue: "Employee asked for {{date}}" })}
                            {" "}
                            <button type="button" className="resignation-link-button" onClick={() => { setLastDay(resignation.requested_last_working_day); setLastDayEdited(true); }}>
                                {t("resignation.case.useRequested", { defaultValue: "Use this date" })}
                            </button>
                        </small>
                    )}
                    {errors.lastDay && <p className="mpr-form-error" role="alert">{errors.lastDay}</p>}
                </div>
            </div>
            <label className="hiring-label" htmlFor="resignation-hr-remarks">{t("resignation.case.hrRemarks", { defaultValue: "HR remarks" })}</label>
            <textarea id="resignation-hr-remarks" rows="3" value={remarks} onChange={(event) => { setRemarks(event.target.value); setErrors((current) => ({ ...current, remarks: undefined })); }} aria-invalid={Boolean(errors.remarks)} />
            {errors.remarks && <p className="mpr-form-error" role="alert">{errors.remarks}</p>}
        </CaseCard>
    );
}

function NoticeCard({ resignation, run, save, reasons }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({
        handover_notes: resignation.handover_notes || "",
        exit_main_reason: resignation.exit_main_reason || "",
        eligible_for_rehire: resignation.eligible_for_rehire === null || resignation.eligible_for_rehire === undefined ? "" : resignation.eligible_for_rehire ? "Yes" : "No",
        exit_internal_notes: resignation.exit_internal_notes || "",
    });
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const set = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setDirty(true); };

    const saveDetails = async () => {
        setSaving(true);
        const ok = await save("notice-details", form, t("resignation.case.done.saved", { defaultValue: "Handover notes and exit interview saved." }));
        setSaving(false);
        if (ok) setDirty(false);
    };

    const withdrew = () => run({
        path: "employee-withdrew",
        body: {},
        variant: "danger",
        title: t("resignation.case.withdrewTitle", { defaultValue: "Employee withdrew?" }),
        message: t("resignation.case.withdrewMessage", { name: resignation.employee_name, defaultValue: "The resignation becomes Withdrawn and {{name}} stays an active employee. The employee is emailed." }),
        confirmText: t("resignation.case.withdrewConfirm", { defaultValue: "Yes, mark withdrawn" }),
        done: t("resignation.case.done.withdrawn", { defaultValue: "Marked withdrawn. The employee stays active." }),
    });

    const startClearance = () => run({
        path: "start-clearance",
        body: {},
        variant: "success",
        title: t("resignation.case.startClearanceTitle", { defaultValue: "Start exit clearance?" }),
        message: t("resignation.case.startClearanceMessage", { defaultValue: "Each department in Settings → Resignation → Exit clearance gets its items, and its owner is notified by email and in the app." }),
        confirmText: t("resignation.case.startClearance", { defaultValue: "Start exit clearance" }),
        done: t("resignation.case.done.clearance", { defaultValue: "Exit clearance started. Department owners have been notified." }),
        before: dirty ? saveDetails : null,
    });

    return (
        <CaseCard
            icon={CalendarClock}
            title={t("resignation.case.servingTitle", { defaultValue: "Serving notice" })}
            description={t("resignation.case.servingHint", { defaultValue: "Record the handover and the exit interview. Start exit clearance near the last working day." })}
            footer={(
                <div className="hiring-card-buttons">
                    <button type="button" className="hiring-btn danger" onClick={withdrew}><UserX size={15} aria-hidden="true" /> {t("resignation.case.withdrew", { defaultValue: "Employee withdrew" })}</button>
                    <button type="button" className="hiring-btn primary" onClick={startClearance}><ClipboardCheck size={15} aria-hidden="true" /> {t("resignation.case.startClearance", { defaultValue: "Start exit clearance" })}</button>
                </div>
            )}
        >
            <Countdown resignation={resignation} />

            <label className="hiring-label" htmlFor="resignation-handover">{t("resignation.case.handover", { defaultValue: "Handover notes" })}</label>
            <textarea id="resignation-handover" rows="3" value={form.handover_notes} onChange={(event) => set("handover_notes", event.target.value)} placeholder={t("resignation.case.handoverPlaceholder", { defaultValue: "Who takes over which work, open items, documents handed over" })} />

            <h4 className="resignation-card-subtitle">{t("resignation.case.exitInterview", { defaultValue: "Exit interview" })}</h4>
            <div className="resignation-form-grid">
                <div>
                    <label className="hiring-label" htmlFor="resignation-exit-reason">{t("resignation.case.mainReason", { defaultValue: "Main reason" })}</label>
                    <select id="resignation-exit-reason" className="resignation-select" value={form.exit_main_reason} onChange={(event) => set("exit_main_reason", event.target.value)}>
                        <option value="">{t("resignation.form.selectReason", { defaultValue: "Select reason" })}</option>
                        {reasons.map((reason) => <option key={reason} value={reason}>{t(`resignation.exitReasons.${reason.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, { defaultValue: reason })}</option>)}
                    </select>
                </div>
                <fieldset className="resignation-radio-group">
                    <legend className="hiring-label">{t("resignation.case.rehire", { defaultValue: "Eligible for rehire" })}</legend>
                    {["Yes", "No"].map((value) => (
                        <label key={value}>
                            <input type="radio" name="resignation-rehire" value={value} checked={form.eligible_for_rehire === value} onChange={() => set("eligible_for_rehire", value)} />
                            {value === "Yes" ? t("resignation.detail.yes", { defaultValue: "Yes" }) : t("resignation.detail.no", { defaultValue: "No" })}
                        </label>
                    ))}
                </fieldset>
            </div>
            <label className="hiring-label" htmlFor="resignation-internal-notes">{t("resignation.case.internalNotes", { defaultValue: "Internal notes" })} <small>{t("resignation.case.internalHint", { defaultValue: "HR only – never shown to the employee" })}</small></label>
            <textarea id="resignation-internal-notes" rows="3" value={form.exit_internal_notes} onChange={(event) => set("exit_internal_notes", event.target.value)} />
            <div className="resignation-inline-actions">
                <button type="button" className="hiring-btn ghost" onClick={saveDetails} disabled={saving || !dirty}>
                    {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("resignation.case.saveNotes", { defaultValue: "Save notes" })}
                </button>
            </div>
        </CaseCard>
    );
}

function ClearanceCard({ resignation, run, saveItem }) {
    const { t } = useTranslation();
    const departments = resignation.clearance || [];
    const pending = departments.filter((department) => !department.cleared);
    const allCleared = pending.length === 0;

    const proceed = () => run({
        path: "final-settlement",
        body: {},
        variant: "success",
        title: t("resignation.case.settlementTitle", { defaultValue: "Proceed to final settlement?" }),
        message: t("resignation.case.settlementMessage", { name: resignation.employee_name, defaultValue: "Exit clearance for {{name}} closes and the resignation moves to Final Settlement." }),
        confirmText: t("resignation.case.proceed", { defaultValue: "Proceed to final settlement" }),
        done: t("resignation.case.done.settlement", { defaultValue: "Moved to Final Settlement." }),
    });

    return (
        <CaseCard
            icon={ClipboardCheck}
            tone="warning"
            title={t("resignation.case.clearanceTitle", { defaultValue: "Exit clearance" })}
            description={t("resignation.case.clearanceHint", { defaultValue: "Owners clear their items in Employee portal → My Approvals → Clearance. HR can clear any item on their behalf." })}
            footer={(
                <>
                    <p className="hiring-card-note" id="resignation-proceed-note">
                        {allCleared
                            ? t("resignation.case.allCleared", { defaultValue: "Every department is cleared." })
                            : t("resignation.case.stillPending", { names: pending.map((department) => department.name).join(", "), defaultValue: "Still pending: {{names}}" })}
                    </p>
                    <div className="hiring-card-buttons">
                        <button type="button" className="hiring-btn primary" onClick={proceed} disabled={!allCleared} aria-describedby="resignation-proceed-note">
                            <Wallet size={15} aria-hidden="true" /> {t("resignation.case.proceed", { defaultValue: "Proceed to final settlement" })}
                        </button>
                    </div>
                </>
            )}
        >
            <Countdown resignation={resignation} />
            <ClearanceList departments={departments} canEdit={() => true} onSave={saveItem} idPrefix="hr-clearance" />
        </CaseCard>
    );
}

const FALLBACK_CHECKLIST = [
    { key: "final_payment", label: "Final payment released" },
    { key: "visa_cancellation", label: "Work visa / QID cancellation submitted" },
    { key: "air_ticket", label: "Air ticket to home country booked", optional: true },
    { key: "experience_certificate", label: "Experience certificate issued" },
    { key: "relieving_letter", label: "Relieving letter issued" },
    { key: "payroll_access", label: "Payroll stopped and HRMS access removed" },
];
const LETTER_TYPES = ["experience_certificate", "relieving_letter"];

const amountText = (value) => (value === null || value === undefined ? "" : String(value));
const toManualDraft = (manual) => ({
    earnings: (manual?.earnings || []).map((row) => ({ description: row.description, amount: String(row.amount) })),
    deductions: (manual?.deductions || []).map((row) => ({ description: row.description, amount: String(row.amount) })),
    inputs: {
        basic: amountText(manual?.inputs?.basic),
        allowances: amountText(manual?.inputs?.allowances),
        joining_date: manual?.inputs?.joining_date || "",
    },
    save_to_record: manual?.save_to_record !== false,
});
const typedInputs = (draft) => ({
    ...(draft.inputs.basic.trim() !== "" ? { basic: Number(draft.inputs.basic) } : {}),
    ...(draft.inputs.allowances.trim() !== "" ? { allowances: Number(draft.inputs.allowances) } : {}),
    ...(draft.inputs.joining_date ? { joining_date: draft.inputs.joining_date } : {}),
});
const fromManualDraft = (draft) => ({
    earnings: draft.earnings.map((row) => ({ description: row.description.trim(), amount: Number(row.amount) })),
    deductions: draft.deductions.map((row) => ({ description: row.description.trim(), amount: Number(row.amount) })),
    inputs: typedInputs(draft),
    save_to_record: draft.save_to_record,
});

function downloadStatement(resignation, settlement) {
    const pdf = settlementStatementPdf(resignation, settlement);
    pdf.save(pdfFileName(resignation, "settlement_statement"));
}

// "QAR 1,200.00", or for a negative net "QAR 20.00 owed by the employee"
const netSummary = (t, net) => (Number(net) < 0
    ? t("resignation.settlement.owedSummary", { amount: formatQar(-net), defaultValue: "{{amount}} owed by the employee" })
    : formatQar(net));

// Basic salary / allowances / joining date missing on the employee record: typed here, the table
// recalculates as HR types; optionally saved to the record on Save draft / Approve
function MissingInputs({ editor, draft, onChange }) {
    const { t } = useTranslation();
    const missing = editor.record_missing || [];
    const salaryMissing = missing.includes("basic") || missing.includes("allowances");
    const joiningMissing = missing.includes("joining_date");
    if (!salaryMissing && !joiningMissing) return null;
    const setInput = (key, value) => onChange({ ...draft, inputs: { ...draft.inputs, [key]: value } });

    return (
        <div className="settlement-missing-card" role="group" aria-labelledby="settlement-missing-title">
            <p id="settlement-missing-title">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>
                    {[
                        salaryMissing && t("resignation.settlement.salaryMissing", { defaultValue: "Basic salary or allowances are missing for this employee." }),
                        joiningMissing && t("resignation.settlement.joiningMissing", { defaultValue: "The joining date is missing for this employee." }),
                    ].filter(Boolean).join(" ")}
                </span>
            </p>
            <div className="settlement-missing-fields">
                {missing.includes("basic") && (
                    <label htmlFor="settlement-input-basic">
                        {t("resignation.settlement.basicQar", { defaultValue: "Basic salary (QAR)" })}
                        <input id="settlement-input-basic" type="number" min="0" step="0.01" inputMode="decimal" value={draft.inputs.basic} onChange={(event) => setInput("basic", event.target.value)} />
                    </label>
                )}
                {missing.includes("allowances") && (
                    <label htmlFor="settlement-input-allowances">
                        {t("resignation.settlement.allowancesQar", { defaultValue: "Allowances (QAR)" })}
                        <input id="settlement-input-allowances" type="number" min="0" step="0.01" inputMode="decimal" value={draft.inputs.allowances} onChange={(event) => setInput("allowances", event.target.value)} />
                    </label>
                )}
                {joiningMissing && (
                    <div className="settlement-missing-date">
                        <label htmlFor="settlement-input-joining">{t("resignation.settlement.inputs.joiningDate", { defaultValue: "Joining date" })}</label>
                        <input id="settlement-input-joining" type="date" max={editor.last_working_day} value={draft.inputs.joining_date} onChange={(event) => setInput("joining_date", event.target.value)} />
                    </div>
                )}
            </div>
            <label className="settlement-missing-check">
                <input type="checkbox" checked={draft.save_to_record} onChange={(event) => onChange({ ...draft, save_to_record: event.target.checked })} />
                {t("resignation.settlement.saveToRecord", { defaultValue: "Also save to the employee record" })}
            </label>
            {salaryMissing && draft.save_to_record && !editor.has_salary_record && (
                <small>{t("resignation.settlement.noSalaryRecord", { defaultValue: "This employee has no salary record in Payroll, so the salary is kept on this settlement only. Add a salary record in Payroll to store it." })}</small>
            )}
        </div>
    );
}

// Final Settlement. Settings → Resignation → Final settlement → "Settlement approved by":
// HR (default): HR approves here (confirmation inside the window) → Exit Formalities.
// Finance (coming soon): HR sends to Finance; Finance approves or returns.
function SettlementCard({ resignation, run, save }) {
    const { t } = useTranslation();
    const [manual, setManual] = useState(() => toManualDraft(resignation.settlement_manual));
    const [remark, setRemark] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(null); // "approve" | "return"
    const status = resignation.settlement_status || "Draft";
    const withFinance = status === "With Finance";
    const hrApproves = resignation.settlement_approver !== "FINANCE";
    const editor = resignation.settlement_editor;
    const finance = resignation.finance_approvers || [];

    // Recalculated in the browser with the same function the server uses
    const typed = typedInputs(manual);
    const live = useMemo(() => (editor && !withFinance
        ? calculateSettlement({
            inputs: applyInputOverrides(editor.record_inputs, typed),
            settings: editor.rules,
            lastWorkingDay: editor.last_working_day,
            clearanceDeductions: editor.clearance_deductions,
        })
        : null), [editor, withFinance, typed.basic, typed.allowances, typed.joining_date]); // eslint-disable-line react-hooks/exhaustive-deps
    const settlement = live || resignation.settlement_view;
    const editable = !withFinance;
    const blocking = (settlement?.missing || []).filter((key) => ["basic", "joining_date"].includes(key));
    const totals = settlement ? settlementTotals(settlement, editable ? manual : null) : { net: 0 };
    const blockedHint = blocking.includes("basic")
        ? t("resignation.settlement.enterBasic", { defaultValue: "Enter the basic salary to approve." })
        : blocking.includes("joining_date")
            ? t("resignation.settlement.enterJoining", { defaultValue: "Enter the joining date to approve." })
            : "";

    const validManual = () => {
        const rows = [...manual.earnings, ...manual.deductions];
        if (rows.some((row) => !row.description.trim() || !(Number(row.amount) > 0))) {
            setError(t("resignation.settlement.errors.manual", { defaultValue: "Each other earning / deduction needs a description and an amount above 0." }));
            return false;
        }
        const values = [manual.inputs.basic, manual.inputs.allowances].filter((value) => value.trim() !== "");
        if (values.some((value) => !(Number(value) >= 0))) {
            setError(t("resignation.settlement.errors.inputs", { defaultValue: "Basic salary and allowances must be 0 or more." }));
            return false;
        }
        setError("");
        return true;
    };

    const saveDraft = async () => {
        if (!validManual()) return;
        setSaving(true);
        await save("settlement-draft", { manual: fromManualDraft(manual) }, t("resignation.settlement.done.draft", { defaultValue: "Settlement draft saved." }));
        setSaving(false);
    };

    const openConfirm = (kind) => {
        if (kind === "approve" && !validManual()) return;
        setRemark("");
        setConfirming(kind);
    };

    const confirmApprove = async () => {
        setSaving(true);
        const ok = await save("approve-settlement", { manual: fromManualDraft(manual), remark: remark.trim() }, t("resignation.settlement.done.approvedHr", { defaultValue: "Final settlement approved. Moved to Exit Formalities." }));
        setSaving(false);
        if (ok) setConfirming(null);
    };

    const confirmReturn = async () => {
        setSaving(true);
        const body = { remark: remark.trim(), ...(validManual() ? { manual: fromManualDraft(manual) } : {}) };
        const ok = await save("return-to-clearance", body, t("resignation.settlement.done.returnedClearance", { defaultValue: "Returned to exit clearance. Correct the deduction, then proceed to final settlement again." }));
        setSaving(false);
        if (ok) setConfirming(null);
    };

    const send = () => validManual() && run({
        path: "send-to-finance",
        body: { manual: fromManualDraft(manual) },
        variant: "success",
        title: t("resignation.settlement.sendTitle", { defaultValue: "Send to Finance?" }),
        message: t("resignation.settlement.sendMessage", { names: finance.join(", ") || "Finance", defaultValue: "The figures are frozen and {{names}} is notified to approve them." }),
        confirmText: t("resignation.settlement.send", { defaultValue: "Send to Finance" }),
        done: t("resignation.settlement.done.sent", { defaultValue: "Sent to Finance. The figures are now frozen." }),
    });

    const decide = (action) => {
        if (action === "return" && !remark.trim()) return setError(t("resignation.settlement.errors.returnRemark", { defaultValue: "Enter a remark so HR knows what to change." }));
        setError("");
        run({
            path: `settlement/${action}`,
            body: { remark: remark.trim() },
            variant: action === "return" ? "danger" : "success",
            title: action === "return" ? t("resignation.settlement.returnTitle", { defaultValue: "Return to HR?" }) : t("resignation.settlement.approveTitle", { defaultValue: "Approve final settlement?" }),
            message: action === "return"
                ? t("resignation.settlement.returnMessage", { defaultValue: "HR is notified with your remark and can send it again." })
                : t("resignation.settlement.approveMessage", { amount: netSummary(t, settlement?.net), defaultValue: "Net {{amount}}. The resignation moves to Exit Formalities." }),
            confirmText: action === "return" ? t("resignation.settlement.return", { defaultValue: "Return" }) : t("resignation.settlement.approve", { defaultValue: "Approve" }),
            done: action === "return" ? t("resignation.settlement.done.returned", { defaultValue: "Returned to HR." }) : t("resignation.settlement.done.approved", { defaultValue: "Settlement approved. Moved to Exit Formalities." }),
        });
    };

    let footer;
    if (withFinance) {
        footer = (
            <>
                <p className="hiring-card-note">
                    {resignation.permissions.canDecideSettlement
                        ? t("resignation.settlement.youDecide", { defaultValue: "You hold the Finance role: approve or return with a remark." })
                        : t("resignation.settlement.waitingFinance", { names: finance.join(", ") || "Finance", defaultValue: "Waiting for {{names}}." })}
                </p>
                <div className="hiring-card-buttons">
                    <button type="button" className="hiring-btn ghost" onClick={() => downloadStatement(resignation, settlement)}><Download size={15} aria-hidden="true" /> {t("resignation.settlement.download", { defaultValue: "Download settlement statement" })}</button>
                    {resignation.permissions.canDecideSettlement && (
                        <>
                            <button type="button" className="hiring-btn danger" onClick={() => decide("return")}><Undo2 size={15} aria-hidden="true" /> {t("resignation.settlement.return", { defaultValue: "Return" })}</button>
                            <button type="button" className="hiring-btn primary" onClick={() => decide("approve")}><CheckCircle2 size={15} aria-hidden="true" /> {t("resignation.settlement.approve", { defaultValue: "Approve" })}</button>
                        </>
                    )}
                </div>
            </>
        );
    } else if (hrApproves) {
        const canApprove = resignation.permissions.canApproveSettlement;
        footer = confirming ? null : (
            <>
                <p className="hiring-card-note" id="settlement-approve-note">
                    {blockedHint || (!canApprove
                        ? t("resignation.settlement.notOwn", { defaultValue: "You can't approve your own settlement." })
                        : t("resignation.settlement.hrApproves", { defaultValue: "Settlement approved by HR (Settings → Resignation → Final settlement)." }))}
                </p>
                <div className="hiring-card-buttons">
                    <button type="button" className="hiring-btn neutral" onClick={() => openConfirm("return")} disabled={saving}>
                        <Undo2 size={15} aria-hidden="true" /> {t("resignation.settlement.returnClearance", { defaultValue: "Return to clearance" })}
                    </button>
                    <button type="button" className="hiring-btn ghost" onClick={saveDraft} disabled={saving}>{saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("resignation.settlement.saveDraft", { defaultValue: "Save draft" })}</button>
                    <button type="button" className="hiring-btn approve" onClick={() => openConfirm("approve")} disabled={saving || blocking.length > 0 || !canApprove} aria-describedby="settlement-approve-note">
                        <CheckCircle2 size={15} aria-hidden="true" /> {t("resignation.settlement.approveSettlement", { defaultValue: "Approve settlement" })}
                    </button>
                </div>
            </>
        );
    } else {
        footer = (
            <>
                <p className="hiring-card-note" id="settlement-send-note">
                    {blocking.length
                        ? t("resignation.settlement.blocked", { defaultValue: "Add the missing basic salary / joining date before sending." })
                        : finance.length
                            ? t("resignation.settlement.financeNames", { names: finance.join(", "), defaultValue: "Finance approver: {{names}}" })
                            : t("resignation.settlement.noFinance", { defaultValue: "No Finance approver. Assign the Finance role in Settings → Approval Workflows → Who holds each role." })}
                </p>
                <div className="hiring-card-buttons">
                    <button type="button" className="hiring-btn ghost" onClick={saveDraft} disabled={saving}>{saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("resignation.settlement.saveDraft", { defaultValue: "Save draft" })}</button>
                    <button type="button" className="hiring-btn primary" onClick={send} disabled={blocking.length > 0 || finance.length === 0} aria-describedby="settlement-send-note">
                        <Send size={15} aria-hidden="true" /> {t("resignation.settlement.send", { defaultValue: "Send to Finance" })}
                    </button>
                </div>
            </>
        );
    }

    return (
        <CaseCard
            icon={Wallet}
            title={t("resignation.case.finalTitle", { defaultValue: "Final settlement" })}
            description={withFinance
                ? t("resignation.settlement.frozenHint", { date: ltrText(formatDate(resignation.settlement_sent_at)), defaultValue: "Sent to Finance on {{date}}. These figures are frozen." })
                : t("resignation.settlement.hint", { defaultValue: "Calculated from the employee record, the leave module and clearance. Add other earnings or deductions if needed." })}
            footer={footer}
        >
            {editable && editor && <MissingInputs editor={editor} draft={manual} onChange={setManual} />}
            <div className="settlement-status-line">
                <span className={`mpr-status ${settlementTone(status)}`}>{settlementStatusLabel(status)}</span>
            </div>
            {status === "Returned" && resignation.settlement_remark && (
                <p className="hiring-notice warning" role="status">
                    <Undo2 size={15} aria-hidden="true" />
                    <span>{t("resignation.settlement.returnedBy", { name: resignation.settlement_decided_by_name || "Finance", remark: resignation.settlement_remark, defaultValue: "Returned by {{name}}: {{remark}}" })}</span>
                </p>
            )}
            {settlement
                ? <SettlementTable settlement={settlement} manual={editable ? manual : null} onManualChange={editable && !confirming ? setManual : null} idPrefix="hr-settlement" showMissingWarning={!editor} />
                : <p className="mpr-muted">{t("resignation.detail.loading", { defaultValue: "Loading..." })}</p>}
            {withFinance && resignation.permissions.canDecideSettlement && (
                <>
                    <label className="hiring-label" htmlFor="settlement-finance-remark">{t("resignation.case.remark", { defaultValue: "Remark" })} <small>{t("resignation.settlement.remarkHint", { defaultValue: "Required to return" })}</small></label>
                    <textarea id="settlement-finance-remark" rows="2" value={remark} onChange={(event) => { setRemark(event.target.value); setError(""); }} aria-invalid={Boolean(error)} />
                </>
            )}
            {confirming && (
                <div className={`settlement-approve-confirm${confirming === "return" ? " return" : ""}`} role="group" aria-labelledby="settlement-confirm-title">
                    <p id="settlement-confirm-title">
                        {confirming === "approve"
                            ? (totals.net < 0
                                ? t("resignation.settlement.approveOwesConfirm", { amount: formatQar(-totals.net), name: resignation.employee_name, defaultValue: "Approve the settlement for {{name}}: the employee owes {{amount}}? The figures will be locked." })
                                : t("resignation.settlement.approveConfirm", { amount: formatQar(totals.net), name: resignation.employee_name, defaultValue: "Approve {{amount}} for {{name}}? The figures will be locked." }))
                            : t("resignation.settlement.returnClearanceConfirm", { defaultValue: "Return to exit clearance? Departments can correct their items; this draft is kept." })}
                    </p>
                    <label htmlFor="settlement-confirm-remark">
                        {t("resignation.case.remark", { defaultValue: "Remark" })} <small className="mpr-muted">{t("resignation.settlement.optional", { defaultValue: "(optional)" })}</small>
                    </label>
                    <textarea id="settlement-confirm-remark" rows="2" maxLength={1000} value={remark} onChange={(event) => setRemark(event.target.value)} autoFocus />
                    <div className="hiring-card-buttons">
                        <button type="button" className="hiring-btn ghost" onClick={() => setConfirming(null)} disabled={saving}>{t("resignation.form.cancel", { defaultValue: "Cancel" })}</button>
                        {confirming === "approve" ? (
                            <button type="button" className="hiring-btn approve" onClick={confirmApprove} disabled={saving}>
                                <CheckCircle2 size={15} aria-hidden="true" /> {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("resignation.settlement.approveSettlement", { defaultValue: "Approve settlement" })}
                            </button>
                        ) : (
                            <button type="button" className="hiring-btn neutral" onClick={confirmReturn} disabled={saving}>
                                <Undo2 size={15} aria-hidden="true" /> {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("resignation.settlement.returnClearance", { defaultValue: "Return to clearance" })}
                            </button>
                        )}
                    </div>
                </div>
            )}
            {error && <p className="mpr-form-error" role="alert">{error}</p>}
        </CaseCard>
    );
}

// Exit Formalities: checklist, letters (PDF generated here and emailed), Complete separation
function FormalitiesCard({ resignation, run, save, checklist }) {
    const { t } = useTranslation();
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const state = resignation.exit_checklist || {};
    const documents = resignation.exit_documents || {};
    const settlement = resignation.settlement_view;
    const isDone = (item) => Boolean(state[item.key]?.done || (item.optional && state[item.key]?.not_applicable));
    const open = checklist.filter((item) => !isDone(item));

    const toggle = async (item, changes) => {
        setBusy(item.key);
        setError("");
        await save("exit-checklist", { key: item.key, ...changes }, t("resignation.formalities.done.updated", { item: item.label, defaultValue: "{{item}} updated." }));
        setBusy("");
    };

    const generate = async (type) => {
        setBusy(type);
        setError("");
        try {
            const pdf = exitLetterPdf(type, resignation, resignation.today);
            await save(`documents/${type}`, { pdf: pdfBase64(pdf), issued_on: resignation.today }, t("resignation.formalities.done.issued", { title: EXIT_LETTER_TITLES[type], defaultValue: "{{title}} generated and emailed to the employee." }));
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy("");
        }
    };

    const download = (type) => exitLetterPdf(type, resignation, documents[type]?.issued_on || resignation.today).save(pdfFileName(resignation, type));

    const complete = () => run({
        path: "complete-separation",
        body: {},
        variant: "success",
        title: t("resignation.formalities.completeTitle", { defaultValue: "Complete separation?" }),
        message: resignation.last_working_day < resignation.today
            ? t("resignation.formalities.completeNow", { name: resignation.employee_name, defaultValue: "{{name}} becomes Resigned and can no longer sign in. The record and history are kept." })
            : t("resignation.formalities.completeLater", { name: resignation.employee_name, date: ltrText(formatDate(resignation.last_working_day)), defaultValue: "The resignation is completed now. {{name}} becomes Resigned and sign-in stops after {{date}}." }),
        confirmText: t("resignation.formalities.complete", { defaultValue: "Complete separation" }),
        done: t("resignation.formalities.done.completed", { defaultValue: "Separation completed." }),
    });

    return (
        <CaseCard
            icon={LogOut}
            title={t("resignation.formalities.title", { defaultValue: "Exit formalities" })}
            description={t("resignation.formalities.hint", { defaultValue: "Tick each step as it's done. Complete separation is enabled when every step is ticked." })}
            footer={(
                <>
                    <p className="hiring-card-note" id="formalities-complete-note">
                        {open.length
                            ? t("resignation.formalities.left", { count: open.length, defaultValue: "{{count}} step(s) left" })
                            : t("resignation.formalities.allDone", { defaultValue: "Every step is done." })}
                    </p>
                    <div className="hiring-card-buttons">
                        <button type="button" className="hiring-btn primary" onClick={complete} disabled={open.length > 0} aria-describedby="formalities-complete-note">
                            <UserCheck size={15} aria-hidden="true" /> {t("resignation.formalities.complete", { defaultValue: "Complete separation" })}
                        </button>
                    </div>
                </>
            )}
        >
            {settlement && (
                <div className="settlement-approved-summary">
                    <div>
                        <span>{settlement.net < 0
                            ? t("resignation.settlement.employeeOwes", { defaultValue: "Amount the employee owes" })
                            : t("resignation.settlement.approvedNet", { defaultValue: "Approved net settlement" })}</span>
                        <strong dir="ltr">{formatQar(Math.abs(settlement.net))}</strong>
                        {resignation.settlement_decided_by_name && <small>{t("resignation.settlement.approvedBy", { name: resignation.settlement_decided_by_name, date: ltrText(formatDate(resignation.settlement_decided_at)), defaultValue: "Approved by {{name}} on {{date}}" })}</small>}
                    </div>
                    <button type="button" className="hiring-btn ghost" onClick={() => downloadStatement(resignation, settlement)}><Download size={15} aria-hidden="true" /> {t("resignation.settlement.downloadShort", { defaultValue: "Statement" })}</button>
                </div>
            )}

            <ul className="exit-checklist">
                {checklist.map((item) => {
                    const entry = state[item.key];
                    const checkboxId = `exit-${item.key}`;
                    const letter = LETTER_TYPES.includes(item.key);
                    return (
                        <li key={item.key} className={isDone(item) ? "done" : ""}>
                            <div className="exit-checklist-main">
                                <input
                                    id={checkboxId}
                                    type="checkbox"
                                    checked={Boolean(entry?.done)}
                                    disabled={busy === item.key || Boolean(entry?.not_applicable)}
                                    onChange={(event) => toggle(item, { done: event.target.checked })}
                                />
                                <label htmlFor={checkboxId}>
                                    {t(`resignation.formalities.items.${item.key}`, { defaultValue: item.label })}
                                    {item.optional && <small> {t("resignation.formalities.ifEligible", { defaultValue: "(if eligible)" })}</small>}
                                </label>
                            </div>
                            <div className="exit-checklist-side">
                                {entry && <small>{entry.not_applicable ? t("resignation.formalities.notEligible", { defaultValue: "Not eligible" }) : t("resignation.formalities.doneBy", { name: entry.by_name, defaultValue: "Done by {{name}}" })}</small>}
                                {item.optional && !entry?.done && (
                                    <label className="exit-checklist-na">
                                        <input type="checkbox" checked={Boolean(entry?.not_applicable)} disabled={busy === item.key} onChange={(event) => toggle(item, { not_applicable: event.target.checked })} />
                                        {t("resignation.formalities.notEligible", { defaultValue: "Not eligible" })}
                                    </label>
                                )}
                                {letter && (
                                    <span className="exit-letter-buttons">
                                        <button type="button" className="hiring-btn ghost" onClick={() => generate(item.key)} disabled={Boolean(busy)}>
                                            <FileText size={15} aria-hidden="true" />
                                            {busy === item.key
                                                ? t("resignation.formalities.generating", { defaultValue: "Sending..." })
                                                : documents[item.key]
                                                    ? t("resignation.formalities.regenerate", { defaultValue: "Generate again" })
                                                    : item.key === "experience_certificate"
                                                        ? t("resignation.formalities.generateExperience", { defaultValue: "Generate experience certificate" })
                                                        : t("resignation.formalities.generateRelieving", { defaultValue: "Generate relieving letter" })}
                                        </button>
                                        {documents[item.key] && (
                                            <button type="button" className="hiring-btn ghost" onClick={() => download(item.key)} aria-label={t("resignation.formalities.downloadLetter", { title: EXIT_LETTER_TITLES[item.key], defaultValue: "Download {{title}}" })}>
                                                <Download size={15} aria-hidden="true" />
                                            </button>
                                        )}
                                    </span>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
            {error && <p className="mpr-form-error" role="alert">{error}</p>}
        </CaseCard>
    );
}

// Completed: green summary
function CompletedCard({ resignation }) {
    const { t } = useTranslation();
    const settlement = resignation.settlement_view || resignation.settlement;
    const documents = resignation.exit_documents || {};
    const loginEnded = resignation.last_working_day < resignation.today;
    return (
        <section className="hiring-card resignation-completed-card" aria-labelledby="resignation-completed-title">
            <header className="hiring-card-head">
                <span className="hiring-card-icon success" aria-hidden="true"><CheckCircle2 size={18} /></span>
                <div>
                    <h3 id="resignation-completed-title">{t("resignation.completed.title", { defaultValue: "Separation completed" })}</h3>
                    <p>{t("resignation.completed.hint", { name: resignation.employee_name, defaultValue: "{{name}}'s record and history are kept." })}</p>
                </div>
            </header>
            <dl className="resignation-completed-facts">
                <div><dt>{t("resignation.form.lastWorkingDay", { defaultValue: "Last working day" })}</dt><dd dir="ltr">{formatDate(resignation.last_working_day)}</dd></div>
                <div><dt>{t("resignation.completed.completedOn", { defaultValue: "Completed on" })}</dt><dd dir="ltr">{formatDate(resignation.completed_at)}</dd></div>
                <div><dt>{settlement?.net < 0 ? t("resignation.settlement.employeeOwes", { defaultValue: "Amount the employee owes" }) : t("resignation.completed.netPaid", { defaultValue: "Net settlement" })}</dt><dd dir="ltr">{settlement ? formatQar(Math.abs(settlement.net)) : "—"}</dd></div>
                <div>
                    <dt>{t("resignation.completed.employeeStatus", { defaultValue: "Employee status" })}</dt>
                    <dd>{loginEnded || resignation.employee_status === "Resigned"
                        ? t("resignation.completed.resigned", { defaultValue: "Resigned – sign-in blocked" })
                        : t("resignation.completed.resignsAfter", { date: ltrText(formatDate(resignation.last_working_day)), defaultValue: "Becomes Resigned after {{date}}" })}</dd>
                </div>
                {resignation.eligible_for_rehire !== null && resignation.eligible_for_rehire !== undefined && (
                    <div><dt>{t("resignation.case.rehire", { defaultValue: "Eligible for rehire" })}</dt><dd>{resignation.eligible_for_rehire ? t("resignation.detail.yes", { defaultValue: "Yes" }) : t("resignation.detail.no", { defaultValue: "No" })}</dd></div>
                )}
            </dl>
            <div className="resignation-downloads">
                {settlement && <button type="button" className="hiring-btn ghost" onClick={() => downloadStatement(resignation, settlement)}><Download size={15} aria-hidden="true" /> {t("resignation.settlement.download", { defaultValue: "Download settlement statement" })}</button>}
                {LETTER_TYPES.filter((type) => documents[type]).map((type) => (
                    <button key={type} type="button" className="hiring-btn ghost" onClick={() => exitLetterPdf(type, resignation, documents[type].issued_on).save(pdfFileName(resignation, type))}>
                        <Download size={15} aria-hidden="true" /> {EXIT_LETTER_TITLES[type]}
                    </button>
                ))}
            </div>
        </section>
    );
}

function StatusCard({ resignation }) {
    const { t } = useTranslation();
    const { status } = resignation;
    if (status === "Rejected") return <CaseCard icon={XCircle} tone="danger" title={resignationStatusLabel(status)} description={resignation.rejection_reason ? t("resignation.detail.dialog.reason", { reason: resignation.rejection_reason, defaultValue: "Reason: {{reason}}" }) : null} />;
    return <CaseCard icon={UserX} title={resignationStatusLabel(status)} description={t("resignation.case.withdrawnHint", { defaultValue: "The resignation was withdrawn. The employee stays active." })} />;
}


// ===================== SIDE TABS =====================

function SideTabs({ resignation }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState("details");
    const [letterState, setLetterState] = useState({ busy: false, error: "" });
    const tabRefs = useRef({});
    const profile = resignation.profile || {};
    const viewLetter = async () => {
        setLetterState({ busy: true, error: "" });
        const error = await openResignationLetter(resignation.id);
        setLetterState({ busy: false, error });
    };
    const tabs = [
        { id: "details", label: t("resignation.case.tabs.details", { defaultValue: "Details" }) },
        { id: "letter", label: t("resignation.case.tabs.letter", { defaultValue: "Letter" }) },
        { id: "history", label: t("resignation.case.tabs.history", { defaultValue: "History" }), count: resignation.actions.length },
    ];
    const onTabKey = (event, index) => {
        const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!offset && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length;
        setTab(tabs[next].id);
        tabRefs.current[tabs[next].id]?.focus();
    };

    const service = profile.service
        ? t("resignation.case.service", { years: profile.service.years, months: profile.service.months, defaultValue: "{{years}} y {{months}} m" })
        : "—";
    const details = [
        [t("employeeSettings.employeeId", { defaultValue: "Employee ID" }), <span dir="ltr">{resignation.employee_id}</span>],
        [t("employeeProfile.basic.grade", { defaultValue: "Grade" }), <span dir="ltr">{showOrNotSet(resignation.grade)}</span>],
        [t("resignation.approvals.department", { defaultValue: "Department" }), show(resignation.department)],
        [t("resignation.case.site", { defaultValue: "Site" }), show(resignation.work_location)],
        [t("resignation.case.lineManager", { defaultValue: "Line manager" }), showOrNotSet(profile.line_managers?.join(", "))],
        [t("resignation.case.joined", { defaultValue: "Joined" }), <span dir="ltr">{resignation.joining_date ? formatDate(resignation.joining_date) : "—"}</span>],
        [t("resignation.case.serviceLabel", { defaultValue: "Service" }), service],
        [t("resignation.case.leaveBalance", { defaultValue: "Leave balance" }), profile.leave_balance === null || profile.leave_balance === undefined ? "—" : (
            <span title={profile.leave_balance_as_of ? t("resignation.case.leaveAsOf", { date: formatDate(profile.leave_balance_as_of), defaultValue: "Annual leave balance on the last working day ({{date}})" }) : undefined}>
                {leaveDaysLabel(t, profile.leave_balance)}
                {profile.leave_balance_as_of && <small className="case-not-set"> · {t("resignation.case.onLastDay", { defaultValue: "on last working day" })}</small>}
            </span>
        )],
        [t("resignation.case.basic", { defaultValue: "Basic" }), <span dir="ltr">{money(profile.basic_salary)}</span>],
        [t("resignation.case.allowances", { defaultValue: "Allowances" }), <span dir="ltr">{money(profile.allowances)}</span>],
        [t("resignation.form.noticePeriod", { defaultValue: "Notice period" }), `${daysLabel(resignation.notice_period_days)}${resignation.notice_period_source ? ` (${noticeSourceLabel(resignation.notice_period_source)})` : ""}`],
        [t("resignation.case.reason", { defaultValue: "Reason" }), reasonCategoryLabel(resignation.reason_category)],
        [t("resignation.case.submitted", { defaultValue: "Submitted" }), <span dir="ltr" className="ltr-text">{formatDateTime(resignation.created_at)}</span>],
        ...(resignation.early_release ? [[t("resignation.early.requested", { defaultValue: "Early release requested" }), `${formatDate(resignation.requested_last_working_day)}${resignation.early_release_reason ? ` – ${resignation.early_release_reason}` : ""}`, true]] : []),
        ...(resignation.hr_remarks ? [[t("resignation.case.hrRemarks", { defaultValue: "HR remarks" }), resignation.hr_remarks, true]] : []),
    ];
    const history = [...resignation.actions].reverse();

    return (
        <section className="hiring-side-card">
            <div className="hiring-tabs" role="tablist" aria-label={t("resignation.case.tabs.label", { defaultValue: "Resignation information" })}>
                {tabs.map(({ id, label, count }, index) => (
                    <button
                        key={id}
                        ref={(element) => { tabRefs.current[id] = element; }}
                        type="button"
                        role="tab"
                        id={`resignation-tab-${id}`}
                        aria-selected={tab === id}
                        aria-controls={`resignation-tabpanel-${id}`}
                        tabIndex={tab === id ? 0 : -1}
                        className={tab === id ? "active" : ""}
                        onClick={() => setTab(id)}
                        onKeyDown={(event) => onTabKey(event, index)}
                    >
                        {label}
                        {count > 0 && <span className="hiring-tab-count">{count}</span>}
                    </button>
                ))}
            </div>

            <div className="hiring-tabpanel" role="tabpanel" id={`resignation-tabpanel-${tab}`} aria-labelledby={`resignation-tab-${tab}`} tabIndex={0}>
                {tab === "details" && (
                    <dl className="hiring-details">
                        {details.map(([label, value, full]) => (
                            <div key={label} className={full ? "full" : ""}>
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                )}
                {tab === "letter" && (
                    <div className="resignation-letter">
                        <p className="resignation-letter-text">{resignation.details}</p>
                        {resignation.has_letter ? (
                            <>
                                <button type="button" className="hiring-btn ghost" onClick={viewLetter} disabled={letterState.busy || !resignation.permissions?.canViewLetter}>
                                    <FileText size={15} aria-hidden="true" /> {letterState.busy
                                        ? t("resignation.detail.opening", { defaultValue: "Opening..." })
                                        : t("resignation.detail.viewLetter", { defaultValue: "View letter" }) + (resignation.letter_name ? " – " + resignation.letter_name : "")}
                                </button>
                                {letterState.error && <p className="mpr-form-error" role="alert">{letterState.error}</p>}
                            </>
                        ) : <p className="mpr-muted">{t("resignation.case.noFile", { defaultValue: "No letter file uploaded." })}</p>}
                    </div>
                )}
                {tab === "history" && (
                    <ol className="hiring-timeline">
                        {history.map((action) => (
                            <li key={action.id}>
                                <span className="hiring-timeline-dot" aria-hidden="true" />
                                <div>
                                    <strong>{resignationActionLabel(action.action)}</strong>
                                    <span className="hiring-timeline-meta">
                                        <small>{action.actor_name || t("resignation.log.system", { defaultValue: "System" })}</small>
                                        <small dir="ltr" className="ltr-text">{formatDateTime(action.created_at)}</small>
                                    </span>
                                    {action.remark && <span className="hiring-timeline-remark">{action.remark}</span>}
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </section>
    );
}

// ===================== WINDOW =====================

function ResignationCase({ resignationId, onClose, onChanged }) {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const dialogRef = useRef(null);
    const [loaded, setLoaded] = useState({ id: null, resignation: null, error: "" });
    const [reasons, setReasons] = useState([]);
    const [checklist, setChecklist] = useState(FALLBACK_CHECKLIST);
    const [notice, setNotice] = useState(null);

    const load = useCallback(() => api(`/api/resignations/${resignationId}`)
        .then((resignation) => setLoaded({ id: resignationId, resignation, error: "" }))
        .catch((err) => setLoaded((current) => ({ ...current, id: resignationId, error: err.message }))), [resignationId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        let ignore = false;
        api("/api/hr/resignations/meta").then((meta) => {
            if (ignore) return;
            setReasons(meta.exitMainReasons || []);
            if (meta.exitChecklist?.length) setChecklist(meta.exitChecklist);
        }).catch(() => {});
        return () => { ignore = true; };
    }, []);

    // Escape closes (not while a confirm dialog is open on top)
    useEffect(() => {
        const onKey = (event) => event.key === "Escape" && !document.querySelector(".app-alert-overlay") && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Page behind doesn't scroll; focus starts in the window and returns on close
    useEffect(() => {
        const previous = document.activeElement;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        dialogRef.current?.focus();
        return () => {
            document.body.style.overflow = overflow;
            if (previous instanceof HTMLElement) previous.focus();
        };
    }, []);

    // Success notice hides itself
    useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(null), 6000);
        return () => clearTimeout(timer);
    }, [notice]);

    const trapFocus = (event) => {
        const dialog = dialogRef.current;
        if (event.key !== "Tab" || !dialog?.contains(event.target)) return;
        const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((element) => element.getClientRects().length > 0);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const resignation = loaded.id === resignationId ? loaded.resignation : null;

    const applied = (updated, text) => {
        setLoaded({ id: resignationId, resignation: updated, error: "" });
        setNotice({ id: Date.now(), text, tone: "success" });
        onChanged?.();
    };

    // Confirmed status change (dialog stays open with a spinner / error until the request finishes)
    const run = async ({ path, body, variant, title, message, confirmText, done, before }) => {
        let updated = null;
        const ok = await confirm({
            variant,
            title,
            message,
            confirmText,
            cancelText: t("resignation.form.cancel", { defaultValue: "Cancel" }),
            loadingText: t("resignation.detail.dialog.saving", { defaultValue: "Saving..." }),
            onConfirm: async () => {
                if (before) await before();
                const result = await api(`/api/resignations/${resignationId}/${path}`, { method: "POST", body });
                updated = result?.settlementTasks ? result.resignation || await api(`/api/resignations/${resignationId}`) : result;
            },
        });
        if (ok && updated) applied(updated, done);
    };

    // Save without a dialog (notes); returns true on success
    const save = async (path, body, done) => {
        try {
            const result = await api(`/api/resignations/${resignationId}/${path}`, { method: "POST", body });
            applied(result?.settlementTasks ? result.resignation : result, done);
            return true;
        } catch (err) {
            setNotice({ id: Date.now(), text: err.message, tone: "error" });
            return false;
        }
    };

    const saveItem = async (item, { status, amount }) => {
        const result = await api(`/api/resignations/${resignationId}/clearance/items/${item.id}`, { method: "PUT", body: { status, amount } });
        if (result.resignation) setLoaded({ id: resignationId, resignation: result.resignation, error: "" });
        onChanged?.();
    };

    const status = resignation?.status || "";
    const card = !resignation ? null
        : status === "Pending HR" ? <AcceptCard key={`accept-${resignation.updated_at}`} resignation={resignation} run={run} />
            : status.startsWith("Pending ") ? <PendingManagerCard resignation={resignation} run={run} />
                : status === "Serving Notice" || status === "Accepted" ? <NoticeCard key={`notice-${resignation.updated_at}`} resignation={resignation} run={run} save={save} reasons={reasons} />
                    : status === "Exit Clearance" ? <ClearanceCard resignation={resignation} run={run} saveItem={saveItem} />
                        : status === "Final Settlement" ? <SettlementCard key={`settlement-${resignation.updated_at}`} resignation={resignation} run={run} save={save} />
                            : status === "Exit Formalities" ? <FormalitiesCard resignation={resignation} run={run} save={save} checklist={checklist} />
                                : status === "Completed" ? <CompletedCard resignation={resignation} />
                                    : <StatusCard resignation={resignation} />;

    return (
        <div className="candidate-modal-overlay hiring-modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
            <div
                ref={dialogRef}
                className="candidate-modal hiring-modal resignation-case"
                role="dialog"
                aria-modal="true"
                aria-labelledby="resignation-case-title"
                tabIndex={-1}
                onKeyDown={trapFocus}
            >
                <header className="hiring-modal-header">
                    {resignation && <span className="hiring-avatar" aria-hidden="true">{initialsOf(resignation.employee_name)}</span>}
                    <div className="hiring-modal-title">
                        <h2 id="resignation-case-title">{resignation ? resignation.employee_name : t("resignation.detail.title", { defaultValue: "Resignation" })}</h2>
                        {resignation && (
                            <p>
                                <span dir="ltr" className="ltr-text">{resignation.employee_id}</span>
                                {" · "}{resignation.designation || t("resignation.detail.employee", { defaultValue: "Employee" })}
                                {resignation.grade && <>{" · "}<span dir="ltr">{resignation.grade}</span></>}
                                {" · "}<span dir="ltr" className="ltr-text">{resignation.resignation_no}</span>
                            </p>
                        )}
                    </div>
                    {resignation && (
                        <div className="hiring-modal-meta">
                            <span className={`mpr-status ${resignationTone(resignation.status)}`}>{resignationStatusLabel(resignation.status)}</span>
                            <span className="mpr-chip">{t("resignation.case.lastDay", { date: ltrText(formatDate(resignation.last_working_day)), defaultValue: "Last day {{date}}" })}</span>
                        </div>
                    )}
                    <button type="button" className="candidate-modal-close" onClick={onClose} aria-label={t("recruitment.common.close", { defaultValue: "Close" })}>×</button>
                </header>

                <div className="hiring-modal-scroll">
                    {!resignation && !loaded.error && <p className="mpr-muted hiring-modal-state">{t("resignation.detail.loading", { defaultValue: "Loading..." })}</p>}
                    {loaded.error && !resignation && <p className="mpr-form-error hiring-modal-state">{loaded.error}</p>}

                    {resignation && (
                        <>
                            <div className="hiring-steps-bar"><ResignationProgress resignation={resignation} /></div>
                            <div className="hiring-modal-body">
                                <div className="hiring-main">
                                    {notice && (
                                        <p key={notice.id} className={`hiring-notice${notice.tone === "error" ? " error" : ""}`} role={notice.tone === "error" ? "alert" : "status"}>
                                            {notice.tone === "error" ? <XCircle size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
                                            <span>{notice.text}</span>
                                        </p>
                                    )}
                                    {card}
                                </div>
                                <aside className="hiring-side">
                                    <SideTabs resignation={resignation} />
                                </aside>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ResignationCase;
