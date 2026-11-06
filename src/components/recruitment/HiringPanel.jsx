// HR → Recruitment → Hiring: centred modal for one candidate. Progress steps, then two columns:
// the action card for the current status (interview result, offer, pre-joining, hire) on the left,
// and Details / Interviews / History tabs on the right.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    BadgeCheck,
    CalendarPlus,
    Check,
    ChevronDown,
    CircleCheck,
    CirclePause,
    ClipboardCheck,
    ClipboardList,
    Clock3,
    ExternalLink,
    FileText,
    Mail,
    Minus,
    Plus,
    RefreshCw,
    Send,
    TriangleAlert,
    UserCheck,
    UserX,
} from "lucide-react";
import { probationText } from "../../../backend/services/offerLetterContent.js";
import DatePicker from "../layout/common/DatePicker";
import { useConfirm } from "../common/dialog/dialogContext";
import { getAppSettings } from "../../utils/appSettings";
import ApplicationDetail from "./ApplicationDetail";
import InterviewScheduleModal from "./InterviewScheduleModal";
import OfferLetterPreview from "./OfferLetterPreview";
import { experienceText, formatInterviewTime, salaryText, sourceText } from "./applicationFormat";
import {
    api,
    applicationStatusLabel,
    applicationTone,
    formatDate,
    formatDateTime,
    formatMoney,
    notifyApplicationsChanged,
    recruitmentActionLabel,
    recruitmentValueLabel,
} from "./recruitmentApi";

const STEPS = ["Shortlist", "Interview", "Result", "Offer", "Accepted", "Pre-joining", "Hired"];

// Index of the step in progress (all before it are done); stoppedAt for Rejected / Offer Declined
function progressFor(status, interviews = []) {
    const hasInterview = interviews.length > 0;
    switch (status) {
        case "Shortlisted": return { current: 1 };
        case "Interview Scheduled": return { current: 2 };
        case "On Hold": return { current: hasInterview ? 2 : 0 };
        case "Selected": return { current: 3 };
        case "Offer Sent": return { current: 4 };
        case "Offer Accepted": return { current: 5 };
        case "Hired":
        case "Joined": return { current: STEPS.length };
        case "Offer Declined": return { current: 4, stoppedAt: 4 };
        case "Rejected": return hasInterview ? { current: 2, stoppedAt: 2 } : { current: 0, stoppedAt: 0 };
        default: return { current: 0 };
    }
}

const DECISIONS = [
    { value: "Selected", label: "Selected", tone: "success", icon: UserCheck },
    { value: "Next round", label: "Next round", tone: "info", icon: RefreshCw },
    { value: "On hold", label: "On hold", tone: "warning", icon: TriangleAlert },
    { value: "Rejected", label: "Rejected", tone: "danger", icon: UserX },
];

// What the candidate is told (backend/services/hiring.js → resultEmail); never the feedback or reason
const candidateMessage = (decision, job) => ({
    Selected: `Congratulations – you have been selected for ${job}. Our HR team will send your offer letter shortly.`,
    "Next round": `You have moved to the next interview round for ${job}. We will send you the details soon.`,
    "On hold": `Your application for ${job} is on hold while we complete our review. We will contact you soon.`,
    Rejected: "A polite regret email (no reason or feedback is included).",
})[decision];

const employeeSlug = (name = "") => name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

const show = (value) => (value === null || value === undefined || value === "" ? "—" : value);

function Progress({ application }) {
    const { t } = useTranslation();
    const { current, stoppedAt } = progressFor(application.status, application.interviews);
    return (
        <ol className="hiring-steps" aria-label={t("recruitment.hiring.progress", { defaultValue: "Hiring progress" })}>
            {STEPS.map((step, index) => {
                const state = stoppedAt === index ? "stopped" : index < current ? "done" : index === current && stoppedAt === undefined ? "current" : "todo";
                return (
                    <li key={step} className={`hiring-step ${state}`} aria-current={state === "current" ? "step" : undefined}>
                        <span className="hiring-step-dot" aria-hidden="true">{state === "done" ? <Check size={13} strokeWidth={3} /> : state === "stopped" ? "×" : index + 1}</span>
                        <span className="hiring-step-label">{t(`recruitment.hiring.steps.${index}`, { defaultValue: step })}</span>
                    </li>
                );
            })}
        </ol>
    );
}

const emailNotice = (t, email, sentText) => (email?.sent
    ? { tone: "success", text: sentText }
    : { tone: "warning", text: t("recruitment.hiring.emailFailed", { reason: email?.reason, defaultValue: "Saved, but the email could not be sent: {{reason}}" }) });

// ===================== STEP CARD =====================

// One shell for every step: banner, icon + title + description, body, footer row (note left,
// buttons right) and optional content after the footer (the offer letter preview).
function StepCard({ icon: Icon, tone = "info", title, description, notice, onNoticeClear, footer, after, className = "", children }) {
    return (
        <section className={`hiring-card ${className}`} aria-labelledby="hiring-card-title">
            {notice && <PanelNotice key={notice.id} notice={notice} onClear={onNoticeClear} />}
            <header className="hiring-card-head">
                <span className={`hiring-card-icon ${tone}`} aria-hidden="true"><Icon size={18} /></span>
                <div>
                    <h3 id="hiring-card-title">{title}</h3>
                    {description && <p>{description}</p>}
                </div>
            </header>
            {children && <div className="hiring-card-body">{children}</div>}
            {footer && <footer className="hiring-card-footer">{footer}</footer>}
            {after}
        </section>
    );
}

function CardFooter({ note, noteId, children }) {
    return (
        <>
            <p className="hiring-card-note" id={noteId}>{note}</p>
            <div className="hiring-card-buttons">{children}</div>
        </>
    );
}

// ===================== INTERVIEW RESULT =====================

const DECISION_HINTS = { Selected: "Go to offer", "Next round": "Schedule again", "On hold": "Decide later", Rejected: "Reason needed" };

function ResultBox({ application, onDone, card }) {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const [decision, setDecision] = useState("");
    const [feedback, setFeedback] = useState("");
    const [reason, setReason] = useState("");
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const decisionRefs = useRef([]);

    const reset = () => {
        setDecision("");
        setFeedback("");
        setReason("");
        setErrors({});
    };

    // Radio group: arrow keys move and select, like native radio buttons
    const onDecisionKey = (event, index) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        const next = (index + step + DECISIONS.length) % DECISIONS.length;
        setDecision(DECISIONS[next].value);
        decisionRefs.current[next]?.focus();
    };

    const submit = async () => {
        const found = {};
        if (!feedback.trim()) found.feedback = t("recruitment.hiring.result.feedbackRequired", { defaultValue: "Interview feedback is required" });
        if (!decision) found.decision = t("recruitment.hiring.result.decisionRequired", { defaultValue: "Choose a decision" });
        if (decision === "Rejected" && !reason.trim()) found.reason = t("recruitment.hiring.result.reasonRequired", { defaultValue: "Enter the internal reason for rejecting" });
        setErrors(found);
        if (Object.keys(found).length) return;

        const option = DECISIONS.find((item) => item.value === decision);
        await confirm({
            variant: option.tone === "info" ? "info" : option.tone,
            title: t("recruitment.hiring.result.confirmTitle", { decision: option.label, defaultValue: "Save result: {{decision}}?" }),
            message: (
                <>
                    {t("recruitment.hiring.result.confirmEmail", { email: application.email, defaultValue: "The candidate is emailed at {{email}}:" })}
                    <br /><em>{candidateMessage(decision, application.job_title)}</em>
                </>
            ),
            confirmText: t("recruitment.hiring.result.save", { defaultValue: "Save & email candidate" }),
            loadingText: t("recruitment.common.saving", { defaultValue: "Saving..." }),
            onConfirm: async () => {
                setSaving(true);
                try {
                    const result = await api(`/api/hr/hiring/${application.id}/result`, {
                        method: "POST",
                        body: { decision, feedback: feedback.trim(), reason: reason.trim() },
                    });
                    onDone(result.application, emailNotice(t, result.email, t("recruitment.hiring.result.saved", { email: application.email, defaultValue: "Result saved and emailed to {{email}}" })));
                } finally {
                    setSaving(false);
                }
            },
        });
    };

    const ready = feedback.trim() && decision;
    const internalOnly = t("recruitment.hiring.internalOnly", { defaultValue: "Internal only – never sent to the candidate" });

    return (
        <StepCard
            {...card}
            icon={ClipboardCheck}
            title={t("recruitment.hiring.box.result", { defaultValue: "Interview result" })}
            description={t("recruitment.hiring.result.hint", { defaultValue: "Record how the interview went. The candidate is emailed the decision only." })}
            footer={(
                <CardFooter note={t("recruitment.hiring.result.footer", { defaultValue: "The candidate gets an email with the decision" })}>
                    <button type="button" className="hiring-btn ghost" onClick={reset} disabled={saving || (!feedback && !decision && !reason)}>
                        {t("recruitment.common.cancel", { defaultValue: "Cancel" })}
                    </button>
                    <button type="button" className="hiring-btn primary" onClick={submit} disabled={!ready || saving}>
                        <Mail size={16} aria-hidden="true" />
                        {saving ? t("recruitment.common.saving", { defaultValue: "Saving..." }) : t("recruitment.hiring.result.save", { defaultValue: "Save & email candidate" })}
                    </button>
                </CardFooter>
            )}
        >
            <label className="hiring-label" htmlFor="hiring-feedback">
                {t("recruitment.hiring.result.feedback", { defaultValue: "Interview feedback" })} <span className="required-mark">*</span>
                <small>{internalOnly}</small>
            </label>
            <textarea
                id="hiring-feedback"
                className="hiring-feedback"
                rows="4"
                maxLength={3000}
                value={feedback}
                placeholder={t("recruitment.hiring.result.feedbackPlaceholder", { defaultValue: "Technical skills, site experience, communication…" })}
                onChange={(event) => setFeedback(event.target.value)}
                aria-invalid={Boolean(errors.feedback)}
            />
            {errors.feedback && <p className="mpr-form-error">{errors.feedback}</p>}

            <span className="hiring-label" id="hiring-decision-label">{t("recruitment.hiring.result.decision", { defaultValue: "Decision" })} <span className="required-mark">*</span></span>
            <div className="hiring-decisions" role="radiogroup" aria-labelledby="hiring-decision-label">
                {DECISIONS.map(({ value, label, tone, icon: Icon }, index) => {
                    const active = decision === value;
                    return (
                        <button
                            key={value}
                            ref={(element) => { decisionRefs.current[index] = element; }}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            tabIndex={active || (!decision && index === 0) ? 0 : -1}
                            className={`hiring-decision ${tone}${active ? " active" : ""}`}
                            onClick={() => setDecision(value)}
                            onKeyDown={(event) => onDecisionKey(event, index)}
                        >
                            <span className="hiring-decision-icon" aria-hidden="true"><Icon size={18} /></span>
                            <strong>{t(`recruitment.hiring.result.decisions.${value.replace(" ", "_").toLowerCase()}`, { defaultValue: label })}</strong>
                            <small>{t(`recruitment.hiring.result.decisionHints.${value.replace(" ", "_").toLowerCase()}`, { defaultValue: DECISION_HINTS[value] })}</small>
                        </button>
                    );
                })}
            </div>
            {errors.decision && <p className="mpr-form-error">{errors.decision}</p>}
            {decision === "Next round" && <p className="hiring-hint hiring-after-decisions">{t("recruitment.hiring.result.nextRoundHint", { defaultValue: "The application goes back to Shortlisted so you can schedule the next interview." })}</p>}

            {decision === "Rejected" && (
                <div className="hiring-reject-reason">
                    <label className="hiring-label" htmlFor="hiring-reason">
                        {t("recruitment.hiring.result.reason", { defaultValue: "Reason for rejecting" })} <span className="required-mark">*</span>
                        <small>{internalOnly}</small>
                    </label>
                    <textarea id="hiring-reason" rows="3" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={Boolean(errors.reason)} />
                    {errors.reason && <p className="mpr-form-error">{errors.reason}</p>}
                </div>
            )}
        </StepCard>
    );
}

// ===================== OFFER =====================

// "12500.5" → "12,500.5" (the form keeps the plain number; this is only what the field shows)
const groupDigits = (raw) => {
    const [whole, decimals] = String(raw).split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return decimals === undefined ? grouped : `${grouped}.${decimals}`;
};

// Salary field with the currency inside it and thousands separators while typing
function SalaryInput({ id, value, onChange, currency, invalid, describedBy }) {
    const ref = useRef(null);
    const caret = useRef(null); // digits before the caret, restored after the commas move

    useLayoutEffect(() => {
        const input = ref.current;
        if (caret.current === null || !input || document.activeElement !== input) return;
        let digits = 0;
        let position = 0;
        while (position < input.value.length && digits < caret.current) {
            if (input.value[position] !== ",") digits += 1;
            position += 1;
        }
        input.setSelectionRange(position, position);
        caret.current = null;
    });

    const change = (event) => {
        const typed = event.target.value;
        let raw = typed.replace(/[^\d.]/g, "");
        const dot = raw.indexOf(".");
        if (dot !== -1) raw = `${raw.slice(0, dot + 1)}${raw.slice(dot + 1).replace(/\./g, "").slice(0, 2)}`;
        raw = raw.replace(/^0+(?=\d)/, "");
        if (raw.split(".")[0].length > 8) return; // the backend accepts up to 99,999,999
        caret.current = Math.min(typed.slice(0, event.target.selectionStart ?? typed.length).replace(/[^\d.]/g, "").length, raw.length);
        onChange(raw);
    };

    return (
        <div className={`offer-money${invalid ? " invalid" : ""}`} dir="ltr">
            <span className="offer-money-currency" aria-hidden="true">{currency}</span>
            <input
                ref={ref}
                id={id}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={groupDigits(value)}
                onChange={change}
                aria-invalid={invalid}
                aria-describedby={describedBy}
            />
        </div>
    );
}

// MPR salary range as a bar, with a marker at the salary entered (warning only; sending is allowed)
function SalaryRange({ min, max, salary, currency }) {
    const { t } = useTranslation();
    const span = max - min || Math.max(max * 0.2, 1);
    const low = min - span * 0.35;
    const high = max + span * 0.35;
    const at = (value) => Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
    const entered = salary > 0;
    const inside = entered && salary >= min && salary <= max;
    const range = `${currency} ${formatMoney(min)} – ${formatMoney(max)}`;

    return (
        <div className={`offer-range${entered ? (inside ? " inside" : " outside") : ""}`} dir="ltr">
            <div className="offer-range-track" aria-hidden="true">
                <span className="offer-range-band" style={{ left: `${at(min)}%`, width: `${at(max) - at(min)}%` }} />
                {entered && <span className="offer-range-marker" style={{ left: `${at(salary)}%` }} />}
            </div>
            <div className="offer-range-scale">
                <span>{t("recruitment.hiring.offer.rangeLabel", { defaultValue: "MPR range" })}</span>
                <span>{range}</span>
            </div>
            {entered && !inside && (
                <p className="offer-range-message" role="status">
                    <TriangleAlert size={14} aria-hidden="true" />
                    {t("recruitment.hiring.offer.outsideRange", { range, defaultValue: "Outside the MPR range ({{range}})" })}
                </p>
            )}
        </div>
    );
}

// − / + months picker; empty until HR chooses (probation has no default)
function MonthsStepper({ id, labelId, value, onChange, max, invalid, describedBy }) {
    const { t } = useTranslation();
    const months = value === "" ? null : Number(value);
    const set = (next) => onChange(String(Math.min(max, Math.max(1, next))));
    const monthsText = (count) => t("recruitment.hiring.offer.monthsCount", { count, defaultValue: probationText(count) });

    const onKeyDown = (event) => {
        const keys = {
            ArrowUp: () => set((months ?? 0) + 1),
            ArrowRight: () => set((months ?? 0) + 1),
            ArrowDown: () => months !== null && set(months - 1),
            ArrowLeft: () => months !== null && set(months - 1),
            Home: () => set(1),
            End: () => set(max),
        };
        const digit = Number(event.key);
        if (keys[event.key]) keys[event.key]();
        else if (Number.isInteger(digit) && digit >= 1 && digit <= max) set(digit);
        else return;
        event.preventDefault();
    };

    return (
        <div className={`offer-stepper${invalid ? " invalid" : ""}`} dir="ltr">
            <button type="button" onClick={() => set(months - 1)} disabled={months === null || months <= 1} aria-label={t("recruitment.hiring.offer.fewerMonths", { defaultValue: "One month less" })}>
                <Minus size={16} aria-hidden="true" />
            </button>
            <div
                id={id}
                role="spinbutton"
                tabIndex={0}
                className={months === null ? "empty" : ""}
                aria-labelledby={labelId}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                aria-required="true"
                aria-valuemin={1}
                aria-valuemax={max}
                aria-valuenow={months ?? undefined}
                aria-valuetext={months === null ? t("recruitment.hiring.offer.notSet", { defaultValue: "Not set" }) : monthsText(months)}
                onKeyDown={onKeyDown}
            >
                {months === null ? t("recruitment.hiring.offer.choose", { defaultValue: "Select" }) : monthsText(months)}
            </div>
            <button type="button" onClick={() => set((months ?? 0) + 1)} disabled={months !== null && months >= max} aria-label={t("recruitment.hiring.offer.moreMonths", { defaultValue: "One month more" })}>
                <Plus size={16} aria-hidden="true" />
            </button>
        </div>
    );
}

// Read-only job + MPR values the offer takes, as one strip of chips
function OfferRole({ job }) {
    const { t } = useTranslation();
    const yes = t("employeeProfile.values.yes", { defaultValue: "Yes" });
    const no = t("employeeProfile.values.no", { defaultValue: "No" });
    const chips = [
        [t("recruitment.fields.position", { defaultValue: "Position" }), job.position],
        [t("recruitment.fields.designation", { defaultValue: "Designation" }), job.designation],
        [t("profileEdit.fields.department", { defaultValue: "Department" }), job.department],
        [t("recruitment.hiring.site", { defaultValue: "Site" }), job.site],
        [t("recruitment.fields.accommodation", { defaultValue: "Accommodation" }), job.accommodation ? yes : no],
        [t("recruitment.hiring.transport", { defaultValue: "Transport" }), job.transport ? yes : no],
    ];
    return (
        <section className="offer-role" aria-labelledby="offer-role-title">
            <div className="offer-role-head">
                <h4 id="offer-role-title">{t("recruitment.hiring.offer.roleFromMpr", { defaultValue: "Role from the MPR" })}</h4>
                {job.mpr_no && <span className="offer-role-mpr" dir="ltr">{job.mpr_no}</span>}
            </div>
            <ul className="offer-role-chips">
                <li className={`offer-grade${job.grade ? "" : " none"}`}>
                    <span className="sr-only">{t("recruitment.fields.grade", { defaultValue: "Grade" })}: </span>
                    {job.grade || t("recruitment.hiring.noGrade", { defaultValue: "No grade" })}
                </li>
                {chips.map(([label, value]) => (
                    <li key={label}>
                        <span>{label}</span>
                        <strong className={value ? "" : "empty"}>{show(value)}</strong>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function OfferBox({ application, onDone, card }) {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const { job } = application;
    const currency = application.offer_currency || "QAR";
    const today = application.company_today;
    const maxProbation = application.max_probation_months || 6;
    const [form, setForm] = useState({ salary: "", joining_date: "", probation_months: "" });
    const [errors, setErrors] = useState({});
    const [sending, setSending] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const set = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));

    const salary = Number(form.salary);
    const hasRange = job.salary_min !== null && job.salary_max !== null;
    const outsideRange = form.salary !== "" && salary > 0 && hasRange && (salary < job.salary_min || salary > job.salary_max);
    const missing = form.salary === "" || !form.joining_date || form.probation_months === "";

    const submit = async () => {
        const found = {};
        if (form.salary === "") found.salary = t("recruitment.hiring.offer.salaryRequired", { defaultValue: "Monthly salary is required" });
        else if (!(salary > 0)) found.salary = t("recruitment.hiring.offer.salaryInvalid", { defaultValue: "Enter a valid monthly salary" });
        if (!form.joining_date) found.joining_date = t("recruitment.hiring.offer.joiningRequired", { defaultValue: "Joining date is required" });
        else if (form.joining_date < today) found.joining_date = t("recruitment.hiring.offer.joiningPast", { defaultValue: "Joining date must be today or later" });
        const probation = Number(form.probation_months);
        if (form.probation_months === "") found.probation_months = t("recruitment.hiring.offer.probationRequired", { defaultValue: "Probation is required" });
        else if (!Number.isInteger(probation) || probation < 1 || probation > (application.max_probation_months || 6)) {
            found.probation_months = t("recruitment.hiring.offer.probationInvalid", { defaultValue: "Probation must be a whole number of months from 1 to 6" });
        }
        setErrors(found);
        if (Object.keys(found).length) return;

        await confirm({
            variant: outsideRange ? "warning" : "success",
            title: t("recruitment.hiring.offer.confirmTitle", { defaultValue: "Send the offer letter?" }),
            message: (
                <>
                    {t("recruitment.hiring.offer.confirmMessage", { name: application.candidate_name, email: application.email, salary: `${currency} ${formatMoney(salary)}`, defaultValue: "{{name}} ({{email}}) is emailed the offer of {{salary}} / month with Accept and Decline buttons." })}
                    {outsideRange && <><br /><strong>{t("recruitment.hiring.offer.outsideRange", { range: `${job.currency || currency} ${formatMoney(job.salary_min)} – ${formatMoney(job.salary_max)}`, defaultValue: "Outside the MPR range ({{range}})" })}</strong></>}
                </>
            ),
            confirmText: t("recruitment.hiring.offer.send", { defaultValue: "Send offer letter" }),
            loadingText: t("recruitment.hiring.sending", { defaultValue: "Sending..." }),
            onConfirm: async () => {
                setSending(true);
                try {
                    const result = await api(`/api/hr/hiring/${application.id}/offer`, {
                        method: "POST",
                        body: { salary: form.salary, joining_date: form.joining_date, probation_months: form.probation_months },
                    });
                    onDone(result.application, emailNotice(t, result.email, t("recruitment.hiring.offer.sent", { email: application.email, defaultValue: "Offer letter sent to {{email}}" })));
                } finally {
                    setSending(false);
                }
            },
        });
    };

    return (
        <StepCard
            {...card}
            className="offer-step"
            icon={FileText}
            title={t("recruitment.hiring.box.offer", { defaultValue: "Offer letter" })}
            description={<>{t("recruitment.hiring.offer.emailedTo", { defaultValue: "Emailed to" })} <span dir="ltr">{application.email}</span></>}
            footer={(
                <CardFooter
                    noteId={missing ? "offer-send-hint" : undefined}
                    note={missing
                        ? t("recruitment.hiring.offer.sendHint", { defaultValue: "Enter salary, joining date and probation to send the offer." })
                        : t("recruitment.hiring.offer.footer", { defaultValue: "The candidate gets the offer letter with Accept and Decline buttons" })}
                >
                    <button
                        type="button"
                        className="hiring-btn primary large"
                        onClick={submit}
                        disabled={missing || sending || !application.offer_link_ready}
                        aria-describedby={missing ? "offer-send-hint" : undefined}
                    >
                        <Send size={17} aria-hidden="true" />
                        {sending ? t("recruitment.hiring.sending", { defaultValue: "Sending..." }) : t("recruitment.hiring.offer.send", { defaultValue: "Send offer letter" })}
                    </button>
                </CardFooter>
            )}
            after={(
                <div className={`offer-preview-wrap${previewOpen ? " open" : ""}`}>
                    <button type="button" className="offer-preview-toggle" aria-expanded={previewOpen} aria-controls="offer-preview-region" onClick={() => setPreviewOpen((open) => !open)}>
                        {t("recruitment.hiring.offer.preview", { defaultValue: "Preview offer letter" })}
                        <ChevronDown size={16} aria-hidden="true" />
                    </button>
                    <div id="offer-preview-region" className="offer-preview-collapse" inert={!previewOpen}>
                        <div className="offer-preview-inner">
                            <OfferLetterPreview candidateName={application.candidate_name} company={getAppSettings().companyName} job={job} form={form} currency={currency} today={today} />
                        </div>
                    </div>
                </div>
            )}
        >
            {!application.offer_link_ready && (
                <p className="hiring-notice warning" role="status">
                    <TriangleAlert size={16} aria-hidden="true" />
                    <span>{t("recruitment.hiring.offer.noPublicUrl", { defaultValue: "Offer letters need APP_PUBLIC_URL in backend/.env for the Accept / Decline link. Ask your administrator to add it and restart the backend." })}</span>
                </p>
            )}

            <OfferRole job={job} />

            <section className="offer-details" aria-labelledby="offer-details-title">
                <h4 id="offer-details-title">{t("recruitment.hiring.offer.details", { defaultValue: "Offer details" })}</h4>
                <div className="hiring-form-grid">
                    <div className="offer-field">
                        <label className="hiring-label" htmlFor="offer-salary">{t("recruitment.hiring.offer.salaryShort", { defaultValue: "Monthly salary" })} <span className="required-mark">*</span></label>
                        <SalaryInput
                            id="offer-salary"
                            value={form.salary}
                            onChange={set("salary")}
                            currency={currency}
                            invalid={Boolean(errors.salary) || outsideRange}
                            describedBy={errors.salary ? "offer-salary-error" : undefined}
                        />
                        {errors.salary && <p id="offer-salary-error" className="mpr-form-error">{errors.salary}</p>}
                        {hasRange && <SalaryRange min={job.salary_min} max={job.salary_max} salary={salary} currency={job.currency || currency} />}
                    </div>
                    <div className="offer-field">
                        <span className="hiring-label">{t("recruitment.hiring.offer.joiningDate", { defaultValue: "Joining date" })} <span className="required-mark">*</span></span>
                        <DatePicker value={form.joining_date} onChange={set("joining_date")} minDate={today} today={today} autoPosition />
                        {errors.joining_date && <p className="mpr-form-error">{errors.joining_date}</p>}
                    </div>
                    <div className="offer-field">
                        <span className="hiring-label" id="offer-probation-label">{t("recruitment.hiring.offer.probationShort", { defaultValue: "Probation" })} <span className="required-mark">*</span></span>
                        <MonthsStepper
                            id="offer-probation"
                            labelId="offer-probation-label"
                            value={form.probation_months}
                            onChange={set("probation_months")}
                            max={maxProbation}
                            invalid={Boolean(errors.probation_months)}
                            describedBy="offer-probation-hint"
                        />
                        <small id="offer-probation-hint" className="hiring-hint">{t("recruitment.hiring.offer.probationHint", { defaultValue: "Qatar Labour Law allows up to 6 months" })}</small>
                        {errors.probation_months && <p className="mpr-form-error">{errors.probation_months}</p>}
                    </div>
                </div>
            </section>
        </StepCard>
    );
}

function OfferSummary({ offer }) {
    const { t } = useTranslation();
    if (!offer) return null;
    return (
        <div className="hiring-facts">
            <div><span>{t("recruitment.hiring.offer.salaryShort", { defaultValue: "Monthly salary" })}</span><strong dir="ltr">{offer.currency} {formatMoney(offer.salary)}</strong></div>
            <div><span>{t("recruitment.hiring.offer.joiningDate", { defaultValue: "Joining date" })}</span><strong dir="ltr">{formatDate(offer.joining_date)}</strong></div>
            <div><span>{t("recruitment.hiring.offer.probationShort", { defaultValue: "Probation" })}</span><strong>{t("recruitment.hiring.months", { count: offer.probation_months, defaultValue: `${offer.probation_months} month(s)` })}</strong></div>
            <div>
                <span>{t("recruitment.hiring.offer.email", { defaultValue: "Offer email" })}</span>
                <strong>{offer.sent_at
                    ? t("recruitment.applicationDetail.interview.sentOn", { date: formatDateTime(offer.sent_at), defaultValue: "Sent {{date}}" })
                    : offer.email_error
                        ? t("recruitment.applicationDetail.interview.notSent", { reason: offer.email_error, defaultValue: "Not sent: {{reason}}" })
                        : "—"}</strong>
            </div>
            {!offer.response && <div><span>{t("recruitment.hiring.offer.linkExpires", { defaultValue: "Link expires" })}</span><strong dir="ltr">{formatDateTime(offer.token_expires_at)}</strong></div>}
            {offer.response && (
                <div>
                    <span>{t("recruitment.hiring.offer.answer", { defaultValue: "Answer" })}</span>
                    <strong>
                        {offer.response === "Accepted" ? t("recruitment.hiring.offer.accepted", { defaultValue: "Accepted" }) : t("recruitment.hiring.offer.declined", { defaultValue: "Declined" })}
                        {" · "}{offer.responded_via === "hr" ? t("recruitment.hiring.offer.byHr", { defaultValue: "recorded by HR" }) : t("recruitment.hiring.offer.byCandidate", { defaultValue: "by the candidate" })}
                        {" · "}<span dir="ltr">{formatDateTime(offer.responded_at)}</span>
                    </strong>
                </div>
            )}
            {offer.response_reason && <div className="full"><span>{t("recruitment.hiring.offer.reasonGiven", { defaultValue: "Reason given" })}</span><strong>{offer.response_reason}</strong></div>}
        </div>
    );
}

function OfferSentBox({ application, onDone, card }) {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const [declining, setDeclining] = useState(false);
    const [reason, setReason] = useState("");

    const resend = () => confirm({
        variant: "info",
        title: t("recruitment.hiring.offer.resendTitle", { defaultValue: "Resend the offer email?" }),
        message: t("recruitment.hiring.offer.resendMessage", { email: application.email, defaultValue: "A new Accept / Decline link is sent to {{email}}. The previous link stops working." }),
        confirmText: t("recruitment.hiring.offer.resend", { defaultValue: "Resend offer email" }),
        loadingText: t("recruitment.hiring.sending", { defaultValue: "Sending..." }),
        onConfirm: async () => {
            const result = await api(`/api/hr/hiring/${application.id}/offer/resend`, { method: "POST", body: {} });
            onDone(result.application, emailNotice(t, result.email, t("recruitment.hiring.offer.sent", { email: application.email, defaultValue: "Offer letter sent to {{email}}" })));
        },
    });

    const record = (response) => confirm({
        variant: response === "Accepted" ? "success" : "danger",
        title: response === "Accepted"
            ? t("recruitment.hiring.offer.recordAcceptTitle", { defaultValue: "Record that the candidate accepted?" })
            : t("recruitment.hiring.offer.recordDeclineTitle", { defaultValue: "Record that the candidate declined?" }),
        message: t("recruitment.hiring.offer.recordMessage", { name: application.candidate_name, defaultValue: "Use this when {{name}} answered by phone or in person. The offer link stops working." }),
        confirmText: response === "Accepted"
            ? t("recruitment.hiring.offer.candidateAccepted", { defaultValue: "Candidate accepted" })
            : t("recruitment.hiring.offer.candidateDeclined", { defaultValue: "Candidate declined" }),
        loadingText: t("recruitment.common.saving", { defaultValue: "Saving..." }),
        onConfirm: async () => {
            const result = await api(`/api/hr/hiring/${application.id}/offer/response`, { method: "POST", body: { response, reason: reason.trim() } });
            onDone(result.application, { tone: "success", text: t("recruitment.hiring.offer.recorded", { defaultValue: "Answer recorded" }) });
        },
    });

    return (
        <StepCard
            {...card}
            icon={Clock3}
            title={t("recruitment.hiring.box.waiting", { defaultValue: "Waiting for the candidate's answer" })}
            description={t("recruitment.hiring.offer.waiting", { defaultValue: "Waiting for the candidate to accept or decline from the offer email." })}
            footer={(
                <CardFooter note={t("recruitment.hiring.offer.recordHint", { defaultValue: "Record the answer here if the candidate replies by phone or in person" })}>
                    <button type="button" className="hiring-btn ghost" onClick={resend}><RefreshCw size={15} aria-hidden="true" /> {t("recruitment.hiring.offer.resend", { defaultValue: "Resend offer email" })}</button>
                    {declining ? (
                        <>
                            <button type="button" className="hiring-btn ghost" onClick={() => { setDeclining(false); setReason(""); }}>{t("recruitment.common.cancel", { defaultValue: "Cancel" })}</button>
                            <button type="button" className="hiring-btn danger" onClick={() => record("Declined")}><UserX size={15} aria-hidden="true" /> {t("recruitment.hiring.offer.recordDecline", { defaultValue: "Record decline" })}</button>
                        </>
                    ) : (
                        <>
                            <button type="button" className="hiring-btn danger" onClick={() => setDeclining(true)}><UserX size={15} aria-hidden="true" /> {t("recruitment.hiring.offer.candidateDeclined", { defaultValue: "Candidate declined" })}</button>
                            <button type="button" className="hiring-btn primary" onClick={() => record("Accepted")}><UserCheck size={15} aria-hidden="true" /> {t("recruitment.hiring.offer.candidateAccepted", { defaultValue: "Candidate accepted" })}</button>
                        </>
                    )}
                </CardFooter>
            )}
        >
            <OfferSummary offer={application.offer} />
            {declining && (
                <>
                    <label className="hiring-label" htmlFor="hiring-decline-reason">{t("recruitment.hiring.offer.declineReason", { defaultValue: "Reason given by the candidate (optional)" })}</label>
                    <textarea id="hiring-decline-reason" rows="2" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
                </>
            )}
        </StepCard>
    );
}

// ===================== PRE-JOINING + HIRE =====================

function PrejoiningBox({ application, onDone, onChecklist, card }) {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const items = application.prejoining_items || [];
    const checklist = application.prejoining_checklist || {};
    const required = items.filter((item) => item.required);
    const done = required.filter((item) => checklist[item.key] === true).length;
    const complete = required.length > 0 && done === required.length;
    const [busyKey, setBusyKey] = useState("");
    const [error, setError] = useState("");
    const [employeeId, setEmployeeId] = useState("");

    useEffect(() => {
        let ignore = false;
        api(`/api/hr/hiring/${application.id}/next-employee-id`)
            .then((result) => !ignore && setEmployeeId((current) => current || result.employee_id))
            .catch(() => {});
        return () => { ignore = true; };
    }, [application.id]);

    const toggle = async (item) => {
        setBusyKey(item.key);
        setError("");
        try {
            const result = await api(`/api/hr/hiring/${application.id}/prejoining`, { method: "PUT", body: { key: item.key, done: checklist[item.key] !== true } });
            onChecklist(result.application);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusyKey("");
        }
    };

    const hire = () => {
        if (!employeeId.trim()) {
            setError(t("recruitment.hiring.hire.idRequired", { defaultValue: "Enter the employee ID" }));
            return;
        }
        setError("");
        return confirm({
            variant: "success",
            title: t("recruitment.hiring.hire.confirmTitle", { defaultValue: "Mark as hired?" }),
            message: t("recruitment.hiring.hire.confirmMessage", {
                name: application.candidate_name,
                id: employeeId.trim(),
                date: formatDate(application.offer?.joining_date),
                defaultValue: "{{name}} is added to Employees as {{id}} (joining {{date}}, on probation) and emailed a welcome message.",
            }),
            confirmText: t("recruitment.hiring.hire.button", { defaultValue: "Mark as hired" }),
            loadingText: t("recruitment.common.saving", { defaultValue: "Saving..." }),
            onConfirm: async () => {
                const result = await api(`/api/hr/hiring/${application.id}/hire`, { method: "POST", body: { employee_id: employeeId.trim() } });
                onDone(result.application, emailNotice(t, result.email, t("recruitment.hiring.hire.done", { id: result.employee.employee_id, defaultValue: "Hired as {{id}}; welcome email sent" })));
            },
        });
    };

    return (
        <StepCard
            {...card}
            icon={ClipboardList}
            title={t("recruitment.hiring.box.prejoining", { defaultValue: "Pre-joining" })}
            description={t("recruitment.hiring.prejoining.hint", { defaultValue: "Tick each document as it arrives, then add the candidate to Employees." })}
            footer={(
                <CardFooter
                    noteId="hire-note"
                    note={complete
                        ? t("recruitment.hiring.hire.footer", { defaultValue: "The new employee gets a welcome email" })
                        : t("recruitment.hiring.hire.notReady", { defaultValue: "Tick every required pre-joining item first" })}
                >
                    <button type="button" className="hiring-btn primary" onClick={hire} disabled={!complete} aria-describedby="hire-note">
                        <UserCheck size={16} aria-hidden="true" /> {t("recruitment.hiring.hire.button", { defaultValue: "Mark as hired" })}
                    </button>
                </CardFooter>
            )}
        >
            <OfferSummary offer={application.offer} />
            <div className="hiring-progress">
                <div className="hiring-progress-text">
                    <strong>{t("recruitment.hiring.prejoining.title", { defaultValue: "Pre-joining documents" })}</strong>
                    <span>{t("recruitment.hiring.prejoining.count", { done, total: required.length, defaultValue: "{{done}} of {{total}} required" })}</span>
                </div>
                <div className="hiring-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={required.length} aria-valuenow={done}>
                    <span style={{ width: `${required.length ? (done / required.length) * 100 : 0}%` }} />
                </div>
            </div>
            <ul className="hiring-checklist">
                {items.map((item) => (
                    <li key={item.key}>
                        <label className={checklist[item.key] === true ? "done" : ""}>
                            <input type="checkbox" checked={checklist[item.key] === true} disabled={Boolean(busyKey)} onChange={() => toggle(item)} />
                            <span>{t(`recruitment.hiring.prejoining.items.${item.key}`, { defaultValue: item.label })}{item.required && <span className="required-mark"> *</span>}</span>
                        </label>
                    </li>
                ))}
            </ul>
            {error && <p className="mpr-form-error">{error}</p>}

            <div className="hiring-hire">
                <label className="hiring-label" htmlFor="hire-employee-id">{t("employeeSettings.employeeId", { defaultValue: "Employee ID" })} <span className="required-mark">*</span></label>
                <input id="hire-employee-id" type="text" maxLength={30} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} dir="ltr" />
                <small className="hiring-hint">{t("recruitment.hiring.hire.idHint", { defaultValue: "Next free EMP number; you can change it." })}</small>
            </div>
        </StepCard>
    );
}

function HiredBox({ application, card }) {
    const { t } = useTranslation();
    const employee = application.employee;
    const employeeId = employee?.employee_id || application.hired_employee_id;
    return (
        <StepCard
            {...card}
            icon={BadgeCheck}
            tone="success"
            title={t("recruitment.hiring.box.hired", { defaultValue: "Hired" })}
            description={(
                <>
                    {t("recruitment.hiring.hire.employeeId", { id: employeeId || "—", defaultValue: "Employee ID: {{id}}" })}
                    {employee?.probation_end_date && <> · {t("recruitment.hiring.hire.probationUntil", { date: formatDate(employee.probation_end_date), defaultValue: "On probation until {{date}}" })}</>}
                </>
            )}
            footer={employee && (
                <CardFooter note={t("recruitment.hiring.hire.addedNote", { defaultValue: "Added to Employees" })}>
                    <Link className="hiring-btn ghost" to={`/employees/employeedetails/${employeeSlug(employee.name)}`}>
                        <ExternalLink size={15} aria-hidden="true" /> {t("recruitment.hiring.hire.openEmployee", { defaultValue: "Open employee record" })}
                    </Link>
                </CardFooter>
            )}
        >
            <OfferSummary offer={application.offer} />
        </StepCard>
    );
}

function ActionBox({ application, onDone, onChecklist, onSchedule, card }) {
    const { t } = useTranslation();
    const actions = application.hiring_actions || [];

    if (actions.includes("result")) return <ResultBox application={application} onDone={onDone} card={card} />;
    if (actions.includes("schedule")) {
        return (
            <StepCard
                {...card}
                icon={CalendarPlus}
                title={t("recruitment.hiring.box.schedule", { defaultValue: "Next: schedule the interview" })}
                description={t("recruitment.hiring.schedule.hint", { defaultValue: "Pick the date, time, mode and interviewer for this candidate." })}
                footer={(
                    <CardFooter note={t("recruitment.hiring.schedule.footer", { defaultValue: "The candidate gets an invitation email" })}>
                        <button type="button" className="hiring-btn primary" onClick={onSchedule}>
                            <CalendarPlus size={16} aria-hidden="true" /> {t("recruitment.applicationDetail.scheduleInterview", { defaultValue: "Schedule Interview" })}
                        </button>
                    </CardFooter>
                )}
            />
        );
    }
    if (actions.includes("offer")) return <OfferBox application={application} onDone={onDone} card={card} />;
    if (actions.includes("record")) return <OfferSentBox application={application} onDone={onDone} card={card} />;
    if (actions.includes("hire")) return <PrejoiningBox application={application} onDone={onDone} onChecklist={onChecklist} card={card} />;
    if (application.status === "Hired" || application.hired_employee_id) return <HiredBox application={application} card={card} />;

    // Closed or waiting outside Hiring: Rejected, Offer Declined, On Hold before an interview…
    const closed = {
        Rejected: { icon: UserX, tone: "danger", text: t("recruitment.hiring.box.rejectedHint", { defaultValue: "This application is closed. The candidate was sent a polite regret email." }) },
        "Offer Declined": { icon: UserX, tone: "danger", title: t("recruitment.hiring.box.declined", { defaultValue: "Offer declined" }), text: t("recruitment.hiring.box.declinedHint", { defaultValue: "The candidate declined the offer. This application is closed." }) },
        "On Hold": { icon: CirclePause, tone: "warning", text: t("recruitment.hiring.box.holdNoInterview", { defaultValue: "On hold before any interview. Shortlist it from Job Applications to continue." }) },
    }[application.status] || {
        icon: CircleCheck,
        tone: "info",
        text: t("recruitment.applicationDetail.noFurtherActions", { status: applicationStatusLabel(application.status), defaultValue: "No further review actions: this application is {{status}}." }),
    };
    return (
        <StepCard {...card} icon={closed.icon} tone={closed.tone} title={closed.title || applicationStatusLabel(application.status)} description={closed.text}>
            {application.status === "Offer Declined" && <OfferSummary offer={application.offer} />}
        </StepCard>
    );
}

// Initials for the header avatar ("Mohammed Al Thani" → "MA")
const initialsOf = (name = "") => String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((word) => Array.from(word)[0]).join("").toUpperCase() || "?";

// Slim banner at the top of the action card; fades out after 5 seconds
const NOTICE_MS = 5000;
const NOTICE_FADE_MS = 400;

function PanelNotice({ notice, onClear }) {
    const [fading, setFading] = useState(false);
    const success = notice.tone === "success";

    useEffect(() => {
        const fade = setTimeout(() => setFading(true), NOTICE_MS - NOTICE_FADE_MS);
        const clear = setTimeout(() => onClear(null), NOTICE_MS);
        return () => {
            clearTimeout(fade);
            clearTimeout(clear);
        };
    }, [onClear]);

    const Icon = success ? CircleCheck : TriangleAlert;
    return (
        <p className={`hiring-notice ${success ? "success" : "error"}${fading ? " fading" : ""}`} role={success ? "status" : "alert"}>
            <Icon size={16} aria-hidden="true" />
            <span>{notice.text}</span>
        </p>
    );
}

// ===================== RIGHT COLUMN: DETAILS / INTERVIEWS / HISTORY =====================

function SideTabs({ application, onOpenFull }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState("details");
    const tabRefs = useRef({});
    const tabs = [
        { id: "details", label: t("recruitment.hiring.tabs.details", { defaultValue: "Details" }) },
        { id: "interviews", label: t("recruitment.hiring.interviews", { defaultValue: "Interviews" }), count: application.interviews.length },
        { id: "history", label: t("recruitment.hiring.tabs.history", { defaultValue: "History" }), count: application.actions.length },
    ];

    // Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern)
    const onTabKey = (event, index) => {
        const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
        if (target === undefined) return;
        event.preventDefault();
        const next = tabs[(target + tabs.length) % tabs.length].id;
        setTab(next);
        tabRefs.current[next]?.focus();
    };

    const details = [
        [t("profileEdit.fields.email", { defaultValue: "Email" }), <a href={`mailto:${application.email}`} dir="ltr">{application.email}</a>, true],
        [t("profileEdit.fields.phone", { defaultValue: "Phone" }), <span dir="ltr">{show(application.phone)}</span>],
        [t("recruitment.applications.appliedOn", { defaultValue: "Applied On" }), <span dir="ltr" className="ltr-text">{formatDateTime(application.applied_at)}</span>],
        [t("recruitment.applications.sourceAgency", { defaultValue: "Source / Agency" }), sourceText(application)],
        [t("recruitment.fields.experience", { defaultValue: "Experience" }), experienceText(application)],
        [t("recruitment.applicationDetail.expectedSalary", { defaultValue: "Expected Monthly Salary" }), <span dir="ltr">{salaryText(application.expected_salary, application.salary_currency, application.expected_ctc)}</span>],
        [t("profileEdit.fields.nationality", { defaultValue: "Nationality" }), show(application.nationality)],
        [t("recruitment.applicationDetail.currentLocation", { defaultValue: "Current Location" }), show(application.location)],
    ];

    return (
        <section className="hiring-side-card">
            <div className="hiring-tabs" role="tablist" aria-label={t("recruitment.hiring.tabs.label", { defaultValue: "Candidate information" })}>
                {tabs.map(({ id, label, count }, index) => (
                    <button
                        key={id}
                        ref={(element) => { tabRefs.current[id] = element; }}
                        type="button"
                        role="tab"
                        id={`hiring-tab-${id}`}
                        aria-selected={tab === id}
                        aria-controls={`hiring-tabpanel-${id}`}
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

            <div className="hiring-tabpanel" role="tabpanel" id={`hiring-tabpanel-${tab}`} aria-labelledby={`hiring-tab-${tab}`} tabIndex={0}>
                {tab === "details" && (
                    <>
                        <dl className="hiring-details">
                            {details.map(([label, value, full]) => (
                                <div key={label} className={full ? "full" : ""}>
                                    <dt>{label}</dt>
                                    <dd>{value}</dd>
                                </div>
                            ))}
                        </dl>
                        <button type="button" className="hiring-btn ghost block" onClick={onOpenFull}>
                            <FileText size={15} aria-hidden="true" /> {t("recruitment.hiring.fullApplication", { defaultValue: "Full application & CV" })}
                        </button>
                    </>
                )}

                {tab === "interviews" && (application.interviews.length === 0
                    ? <p className="hiring-empty">{t("recruitment.hiring.noInterviews", { defaultValue: "No interviews yet." })}</p>
                    : (
                        <>
                            <ol className="hiring-rounds">
                                {application.interviews.map((round, index) => (
                                    <li key={round.id}>
                                        <div className="hiring-round-head">
                                            <strong>{t("recruitment.hiring.round", { number: index + 1, defaultValue: "Round {{number}}" })}</strong>
                                            {round.result
                                                ? <span className="hiring-round-result">{round.result}</span>
                                                : <span className="hiring-round-result pending">{t("recruitment.hiring.noResult", { defaultValue: "No result yet" })}</span>}
                                        </div>
                                        <span dir="ltr" className="ltr-text">{formatDate(round.interview_date)} · {formatInterviewTime(round.interview_time)}</span>
                                        <span>{recruitmentValueLabel("interviewMode", round.mode)}</span>
                                        <span className="hiring-round-muted">{round.interviewer_name}</span>
                                        {(round.feedback || round.reject_reason) && (
                                            <p className="hiring-round-feedback">
                                                {round.feedback}
                                                {round.reject_reason ? ` (${t("recruitment.hiring.result.reasonShort", { defaultValue: "reason" })}: ${round.reject_reason})` : ""}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ol>
                            <small className="hiring-hint">{t("recruitment.hiring.internalOnly", { defaultValue: "Internal only – never sent to the candidate" })}</small>
                        </>
                    ))}

                {tab === "history" && (application.actions.length === 0
                    ? <p className="hiring-empty">{t("recruitment.log.noApplicationEntries", { defaultValue: "No tracking entries (application received before tracking was added)." })}</p>
                    : (
                        <ol className="hiring-timeline">
                            {[...application.actions].reverse().map((action) => (
                                <li key={action.id}>
                                    <span className="hiring-timeline-dot" aria-hidden="true" />
                                    <div>
                                        <strong>{recruitmentActionLabel(action.action)}</strong>
                                        {action.from_status && action.to_status && <small> · {t("recruitment.log.statusChange", { from: applicationStatusLabel(action.from_status), to: applicationStatusLabel(action.to_status), defaultValue: "{{from}} → {{to}}" })}</small>}
                                        <span className="hiring-timeline-meta">
                                            {action.actor_name || (action.action === "Applied"
                                                ? t("recruitment.applications.candidate", { defaultValue: "Candidate" })
                                                : t("recruitment.log.system", { defaultValue: "System" }))}
                                            {" · "}<span dir="ltr" className="ltr-text">{formatDateTime(action.created_at)}</span>
                                        </span>
                                        {action.remark && <span className="hiring-timeline-remark">{action.remark}</span>}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    ))}
            </div>
        </section>
    );
}

// ===================== MODAL =====================

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function HiringPanel({ applicationId, actorId, newResponse = false, onClose, onChanged }) {
    const { t } = useTranslation();
    const [loaded, setLoaded] = useState({ id: null, application: null, error: "" });
    const [notice, setNotice] = useState(null);
    const [scheduling, setScheduling] = useState(false);
    const [fullOpen, setFullOpen] = useState(false);
    const dialogRef = useRef(null);

    const load = useCallback(() => api(`/api/hr/hiring/${applicationId}`)
        .then((application) => setLoaded({ id: applicationId, application, error: "" }))
        .catch((err) => setLoaded({ id: applicationId, application: null, error: err.message })), [applicationId]);

    useEffect(() => {
        load();
    }, [load]);

    // Opening a candidate who answered the offer clears the "New response" badge
    useEffect(() => {
        if (!newResponse) return;
        api(`/api/hr/hiring/${applicationId}/seen`, { method: "POST", body: {} })
            .then(() => {
                notifyApplicationsChanged();
                onChanged?.();
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [applicationId, newResponse]);

    useEffect(() => {
        const onKey = (event) => event.key === "Escape" && !scheduling && !fullOpen && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, scheduling, fullOpen]);

    // While open: the page behind doesn't scroll, focus starts in the modal and returns on close
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

    // Tab / Shift+Tab wrap around inside the modal
    const trapFocus = (event) => {
        const dialog = dialogRef.current;
        if (event.key !== "Tab" || !dialog?.contains(event.target)) return;
        const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((element) => !element.closest("[inert]") && element.getClientRects().length > 0);
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

    const application = loaded.id === applicationId ? loaded.application : null;

    // Each notice gets an id so a repeat message restarts its 5-second timer
    const showNotice = (next) => setNotice(next ? { ...next, id: Date.now() } : null);

    const changed = (updated, nextNotice) => {
        setLoaded({ id: applicationId, application: updated, error: "" });
        showNotice(nextNotice);
        notifyApplicationsChanged();
        onChanged?.();
    };

    const interviewSaved = ({ email }) => {
        setScheduling(false);
        load();
        showNotice(email.sent
            ? { tone: "success", text: t("recruitment.applicationDetail.interview.emailSent", { email: application.email, defaultValue: "Interview scheduled and invitation sent to {{email}}" }) }
            : { tone: "warning", text: t("recruitment.applicationDetail.interview.emailFailed", { reason: email.reason, defaultValue: "Interview saved, but the email could not be sent: {{reason}}" }) });
        notifyApplicationsChanged();
        onChanged?.();
    };

    return (
        <>
            <div className="candidate-modal-overlay hiring-modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
                <div
                    ref={dialogRef}
                    className="candidate-modal hiring-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="hiring-modal-title"
                    tabIndex={-1}
                    onKeyDown={trapFocus}
                >
                    <header className="hiring-modal-header">
                        {application && <span className="hiring-avatar" aria-hidden="true">{initialsOf(application.candidate_name)}</span>}
                        <div className="hiring-modal-title">
                            <h2 id="hiring-modal-title">{application ? application.candidate_name : t("recruitment.hiring.title", { defaultValue: "Hiring" })}</h2>
                            {application && (
                                <p>
                                    <span dir="ltr" className="ltr-text">{application.application_id}</span>
                                    {" · "}<span dir="ltr" className="ltr-text">{application.job_id}</span>
                                    {application.job_title && <>{" · "}{application.job_title}</>}
                                </p>
                            )}
                        </div>
                        {application && (
                            <div className="hiring-modal-meta">
                                <span className={`mpr-status ${applicationTone(application.status)}`}>{applicationStatusLabel(application.status)}</span>
                                <span className="mpr-chip" dir="ltr">
                                    {t("recruitment.hiring.filledChip", { filled: application.job.filled ?? 0, openings: application.job.openings ?? "—", defaultValue: "Filled {{filled}} / {{openings}}" })}
                                </span>
                            </div>
                        )}
                        <button type="button" className="candidate-modal-close" onClick={onClose} aria-label={t("recruitment.common.close", { defaultValue: "Close" })}>×</button>
                    </header>

                    <div className="hiring-modal-scroll">
                        {!application && !loaded.error && <p className="mpr-muted hiring-modal-state">{t("recruitment.common.loading", { defaultValue: "Loading..." })}</p>}
                        {loaded.error && !application && <p className="mpr-form-error hiring-modal-state">{loaded.error}</p>}

                        {application && (
                            <>
                                <div className="hiring-steps-bar"><Progress application={application} /></div>
                                <div className="hiring-modal-body">
                                    <div className="hiring-main">
                                        <ActionBox
                                            application={application}
                                            onDone={changed}
                                            onChecklist={(updated) => changed(updated, null)}
                                            onSchedule={() => setScheduling(true)}
                                            card={{ notice, onNoticeClear: setNotice }}
                                        />
                                    </div>
                                    <aside className="hiring-side">
                                        <SideTabs application={application} onOpenFull={() => setFullOpen(true)} />
                                    </aside>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
            {scheduling && application && (
                <InterviewScheduleModal application={application} actorId={actorId} onClose={() => setScheduling(false)} onSaved={interviewSaved} />
            )}
            {fullOpen && application && (
                <ApplicationDetail applicationId={application.id} actorId={actorId} onClose={() => { setFullOpen(false); load(); }} onChanged={onChanged} />
            )}
        </>
    );
}

export default HiringPanel;
