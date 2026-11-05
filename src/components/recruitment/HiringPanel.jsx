// HR → Recruitment → Hiring: side panel for one candidate. Progress steps, the action box for the
// current status (interview result, offer, pre-joining, hire), application details and history.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarPlus, Check, ExternalLink, FileText, Mail, RefreshCw, TriangleAlert, UserCheck, UserX } from "lucide-react";
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

function Item({ label, children, full = false }) {
    return (
        <div className={full ? "full-width" : ""}>
            <label>{label}</label>
            <p>{children}</p>
        </div>
    );
}

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

// ===================== INTERVIEW RESULT =====================

function ResultBox({ application, onDone }) {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const [decision, setDecision] = useState("");
    const [feedback, setFeedback] = useState("");
    const [reason, setReason] = useState("");
    const [errors, setErrors] = useState({});

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
                const result = await api(`/api/hr/hiring/${application.id}/result`, {
                    method: "POST",
                    body: { decision, feedback: feedback.trim(), reason: reason.trim() },
                });
                onDone(result.application, emailNotice(t, result.email, t("recruitment.hiring.result.saved", { email: application.email, defaultValue: "Result saved and emailed to {{email}}" })));
            },
        });
    };

    return (
        <>
            <p className="hiring-hint">{t("recruitment.hiring.result.hint", { defaultValue: "Record how the interview went. The candidate is emailed the decision only." })}</p>
            <label className="hiring-label" htmlFor="hiring-feedback">
                {t("recruitment.hiring.result.feedback", { defaultValue: "Interview feedback" })} <span className="required-mark">*</span>
                <small>{t("recruitment.hiring.internalOnly", { defaultValue: "Internal only – never sent to the candidate" })}</small>
            </label>
            <textarea id="hiring-feedback" rows="4" maxLength={3000} value={feedback} onChange={(event) => setFeedback(event.target.value)} aria-invalid={Boolean(errors.feedback)} />
            {errors.feedback && <p className="mpr-form-error">{errors.feedback}</p>}

            <span className="hiring-label">{t("recruitment.hiring.result.decision", { defaultValue: "Decision" })} <span className="required-mark">*</span></span>
            <div className="hiring-decisions" role="radiogroup" aria-label={t("recruitment.hiring.result.decision", { defaultValue: "Decision" })}>
                {DECISIONS.map(({ value, label, tone, icon: Icon }) => (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={decision === value}
                        className={`hiring-decision ${tone}${decision === value ? " active" : ""}`}
                        onClick={() => setDecision(value)}
                    >
                        <Icon size={16} aria-hidden="true" /> {t(`recruitment.hiring.result.decisions.${value.replace(" ", "_").toLowerCase()}`, { defaultValue: label })}
                    </button>
                ))}
            </div>
            {errors.decision && <p className="mpr-form-error">{errors.decision}</p>}
            {decision === "Next round" && <p className="hiring-hint">{t("recruitment.hiring.result.nextRoundHint", { defaultValue: "The application goes back to Shortlisted so you can schedule the next interview." })}</p>}

            {decision === "Rejected" && (
                <>
                    <label className="hiring-label" htmlFor="hiring-reason">
                        {t("recruitment.hiring.result.reason", { defaultValue: "Reason for rejecting" })} <span className="required-mark">*</span>
                        <small>{t("recruitment.hiring.internalOnly", { defaultValue: "Internal only – never sent to the candidate" })}</small>
                    </label>
                    <textarea id="hiring-reason" rows="3" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={Boolean(errors.reason)} />
                    {errors.reason && <p className="mpr-form-error">{errors.reason}</p>}
                </>
            )}

            <div className="hiring-actions">
                <button type="button" className="mpr-btn success" onClick={submit}>
                    <Mail size={15} aria-hidden="true" /> {t("recruitment.hiring.result.save", { defaultValue: "Save & email candidate" })}
                </button>
            </div>
        </>
    );
}

// ===================== OFFER =====================

function OfferBox({ application, onDone }) {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const { job } = application;
    const currency = application.offer_currency || "QAR";
    const today = application.company_today;
    const [form, setForm] = useState({ salary: "", joining_date: "", probation_months: "" });
    const [errors, setErrors] = useState({});
    const set = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));

    const salary = Number(form.salary);
    const hasRange = job.salary_min !== null && job.salary_max !== null;
    const outsideRange = form.salary !== "" && salary > 0 && hasRange && (salary < job.salary_min || salary > job.salary_max);

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
                const result = await api(`/api/hr/hiring/${application.id}/offer`, {
                    method: "POST",
                    body: { salary: form.salary, joining_date: form.joining_date, probation_months: form.probation_months },
                });
                onDone(result.application, emailNotice(t, result.email, t("recruitment.hiring.offer.sent", { email: application.email, defaultValue: "Offer letter sent to {{email}}" })));
            },
        });
    };

    return (
        <>
            {!application.offer_link_ready && (
                <p className="app-interview-notice warning">{t("recruitment.hiring.offer.noPublicUrl", { defaultValue: "Offer letters need APP_PUBLIC_URL in backend/.env for the Accept / Decline link. Ask your administrator to add it and restart the backend." })}</p>
            )}
            <div className="hiring-facts">
                {[
                    [t("recruitment.fields.grade", { defaultValue: "Grade" }), job.grade],
                    [t("recruitment.fields.position", { defaultValue: "Position" }), job.position],
                    [t("recruitment.fields.designation", { defaultValue: "Designation" }), job.designation],
                    [t("profileEdit.fields.department", { defaultValue: "Department" }), job.department],
                    [t("recruitment.hiring.site", { defaultValue: "Site" }), job.site],
                    [t("recruitment.fields.accommodation", { defaultValue: "Accommodation" }), job.accommodation ? t("employeeProfile.values.yes", { defaultValue: "Yes" }) : t("employeeProfile.values.no", { defaultValue: "No" })],
                    [t("recruitment.hiring.transport", { defaultValue: "Transport" }), job.transport ? t("employeeProfile.values.yes", { defaultValue: "Yes" }) : t("employeeProfile.values.no", { defaultValue: "No" })],
                ].map(([label, value]) => (
                    <div key={label}><span>{label}</span><strong>{show(value)}</strong></div>
                ))}
            </div>
            <small className="hiring-hint">{t("recruitment.hiring.offer.fromMpr", { mpr: job.mpr_no || "—", defaultValue: "From MPR {{mpr}} (read-only)" })}</small>

            <div className="hiring-form-grid">
                <div>
                    <label className="hiring-label" htmlFor="offer-salary">{t("recruitment.hiring.offer.salary", { currency, defaultValue: "Monthly salary ({{currency}})" })} <span className="required-mark">*</span></label>
                    <input id="offer-salary" type="number" min="1" step="any" inputMode="decimal" value={form.salary} onChange={(event) => set("salary")(event.target.value)} aria-invalid={Boolean(errors.salary) || outsideRange} className={outsideRange ? "field-invalid" : ""} />
                    {outsideRange && (
                        <p className="hiring-range-warning">
                            {t("recruitment.hiring.offer.outsideRange", { range: `${job.currency || currency} ${formatMoney(job.salary_min)} – ${formatMoney(job.salary_max)}`, defaultValue: "Outside the MPR range ({{range}})" })}
                        </p>
                    )}
                    {errors.salary && <p className="mpr-form-error">{errors.salary}</p>}
                </div>
                <div>
                    <span className="hiring-label">{t("recruitment.hiring.offer.joiningDate", { defaultValue: "Joining date" })} <span className="required-mark">*</span></span>
                    <DatePicker value={form.joining_date} onChange={set("joining_date")} minDate={today} today={today} autoPosition />
                    {errors.joining_date && <p className="mpr-form-error">{errors.joining_date}</p>}
                </div>
                <div>
                    <label className="hiring-label" htmlFor="offer-probation">{t("recruitment.hiring.offer.probation", { defaultValue: "Probation (months)" })} <span className="required-mark">*</span></label>
                    <input id="offer-probation" type="number" min="1" max={application.max_probation_months || 6} step="1" inputMode="numeric" value={form.probation_months} onChange={(event) => set("probation_months")(event.target.value)} aria-invalid={Boolean(errors.probation_months)} aria-describedby="offer-probation-hint" />
                    <small id="offer-probation-hint" className="hiring-hint">{t("recruitment.hiring.offer.probationHint", { defaultValue: "Qatar Labour Law allows up to 6 months" })}</small>
                    {errors.probation_months && <p className="mpr-form-error">{errors.probation_months}</p>}
                </div>
            </div>

            <OfferLetterPreview candidateName={application.candidate_name} company={getAppSettings().companyName} job={job} form={form} currency={currency} today={today} />

            <div className="hiring-actions">
                <button type="button" className="mpr-btn success" onClick={submit} disabled={!application.offer_link_ready}>
                    <Mail size={15} aria-hidden="true" /> {t("recruitment.hiring.offer.send", { defaultValue: "Send offer letter" })}
                </button>
            </div>
        </>
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

function OfferSentBox({ application, onDone }) {
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
        <>
            <p className="hiring-hint">{t("recruitment.hiring.offer.waiting", { defaultValue: "Waiting for the candidate to accept or decline from the offer email." })}</p>
            <OfferSummary offer={application.offer} />
            {declining && (
                <>
                    <label className="hiring-label" htmlFor="hiring-decline-reason">{t("recruitment.hiring.offer.declineReason", { defaultValue: "Reason given by the candidate (optional)" })}</label>
                    <textarea id="hiring-decline-reason" rows="2" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
                </>
            )}
            <div className="hiring-actions">
                <button type="button" className="mpr-btn" onClick={resend}><RefreshCw size={15} aria-hidden="true" /> {t("recruitment.hiring.offer.resend", { defaultValue: "Resend offer email" })}</button>
                {!declining && <button type="button" className="mpr-btn success" onClick={() => record("Accepted")}><UserCheck size={15} aria-hidden="true" /> {t("recruitment.hiring.offer.candidateAccepted", { defaultValue: "Candidate accepted" })}</button>}
                {declining
                    ? <button type="button" className="mpr-btn danger" onClick={() => record("Declined")}><UserX size={15} aria-hidden="true" /> {t("recruitment.hiring.offer.recordDecline", { defaultValue: "Record decline" })}</button>
                    : <button type="button" className="mpr-btn danger" onClick={() => setDeclining(true)}><UserX size={15} aria-hidden="true" /> {t("recruitment.hiring.offer.candidateDeclined", { defaultValue: "Candidate declined" })}</button>}
                {declining && <button type="button" className="mpr-btn" onClick={() => { setDeclining(false); setReason(""); }}>{t("recruitment.common.cancel", { defaultValue: "Cancel" })}</button>}
            </div>
        </>
    );
}

// ===================== PRE-JOINING + HIRE =====================

function PrejoiningBox({ application, onDone, onChecklist }) {
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
        <>
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
                <div>
                    <label className="hiring-label" htmlFor="hire-employee-id">{t("employeeSettings.employeeId", { defaultValue: "Employee ID" })} <span className="required-mark">*</span></label>
                    <input id="hire-employee-id" type="text" maxLength={30} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} dir="ltr" />
                    <small className="hiring-hint">{t("recruitment.hiring.hire.idHint", { defaultValue: "Next free EMP number; you can change it." })}</small>
                </div>
                <button type="button" className="mpr-btn success" onClick={hire} disabled={!complete} title={complete ? undefined : t("recruitment.hiring.hire.notReady", { defaultValue: "Tick every required pre-joining item first" })}>
                    <UserCheck size={15} aria-hidden="true" /> {t("recruitment.hiring.hire.button", { defaultValue: "Mark as hired" })}
                </button>
            </div>
        </>
    );
}

function HiredBox({ application }) {
    const { t } = useTranslation();
    const employee = application.employee;
    const employeeId = employee?.employee_id || application.hired_employee_id;
    return (
        <>
            <OfferSummary offer={application.offer} />
            <div className="hiring-hired">
                <UserCheck size={22} aria-hidden="true" />
                <div>
                    <strong>{t("recruitment.hiring.hire.employeeId", { id: employeeId || "—", defaultValue: "Employee ID: {{id}}" })}</strong>
                    {employee?.probation_end_date && <span>{t("recruitment.hiring.hire.probationUntil", { date: formatDate(employee.probation_end_date), defaultValue: "On probation until {{date}}" })}</span>}
                </div>
                {employee && (
                    <Link className="mpr-btn" to={`/employees/employeedetails/${employeeSlug(employee.name)}`}>
                        <ExternalLink size={15} aria-hidden="true" /> {t("recruitment.hiring.hire.openEmployee", { defaultValue: "Open employee record" })}
                    </Link>
                )}
            </div>
        </>
    );
}

function ActionBox({ application, onDone, onChecklist, onSchedule }) {
    const { t } = useTranslation();
    const actions = application.hiring_actions || [];
    const titles = {
        "Shortlisted": t("recruitment.hiring.box.schedule", { defaultValue: "Next: schedule the interview" }),
        "Interview Scheduled": t("recruitment.hiring.box.result", { defaultValue: "Interview result" }),
        "On Hold": t("recruitment.hiring.box.result", { defaultValue: "Interview result" }),
        Selected: t("recruitment.hiring.box.offer", { defaultValue: "Offer letter" }),
        "Offer Sent": t("recruitment.hiring.box.offerSent", { defaultValue: "Offer sent" }),
        "Offer Accepted": t("recruitment.hiring.box.prejoining", { defaultValue: "Pre-joining" }),
        Hired: t("recruitment.hiring.box.hired", { defaultValue: "Hired" }),
        "Offer Declined": t("recruitment.hiring.box.declined", { defaultValue: "Offer declined" }),
    };
    let body;
    if (actions.includes("result")) body = <ResultBox application={application} onDone={onDone} />;
    else if (actions.includes("schedule")) body = (
        <div className="hiring-actions">
            <button type="button" className="mpr-btn success" onClick={onSchedule}><CalendarPlus size={15} aria-hidden="true" /> {t("recruitment.applicationDetail.scheduleInterview", { defaultValue: "Schedule Interview" })}</button>
        </div>
    );
    else if (actions.includes("offer")) body = <OfferBox application={application} onDone={onDone} />;
    else if (actions.includes("record")) body = <OfferSentBox application={application} onDone={onDone} />;
    else if (actions.includes("hire")) body = <PrejoiningBox application={application} onDone={onDone} onChecklist={onChecklist} />;
    else if (application.status === "Hired" || application.hired_employee_id) body = <HiredBox application={application} />;
    else if (application.status === "Offer Declined") body = <OfferSummary offer={application.offer} />;
    else body = (
        <p className="mpr-muted">
            {application.status === "On Hold"
                ? t("recruitment.hiring.box.holdNoInterview", { defaultValue: "On hold before any interview. Shortlist it from Job Applications to continue." })
                : t("recruitment.applicationDetail.noFurtherActions", { status: applicationStatusLabel(application.status), defaultValue: "No further review actions: this application is {{status}}." })}
        </p>
    );

    return (
        <section className="hiring-box">
            <h3>{titles[application.status] || applicationStatusLabel(application.status)}</h3>
            {body}
        </section>
    );
}

// ===================== PANEL =====================

function HiringPanel({ applicationId, actorId, newResponse = false, onClose, onChanged }) {
    const { t } = useTranslation();
    const [loaded, setLoaded] = useState({ id: null, application: null, error: "" });
    const [notice, setNotice] = useState(null);
    const [scheduling, setScheduling] = useState(false);
    const [fullOpen, setFullOpen] = useState(false);

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

    const application = loaded.id === applicationId ? loaded.application : null;

    const changed = (updated, nextNotice) => {
        setLoaded({ id: applicationId, application: updated, error: "" });
        setNotice(nextNotice || null);
        notifyApplicationsChanged();
        onChanged?.();
    };

    const interviewSaved = ({ email }) => {
        setScheduling(false);
        load();
        setNotice(email.sent
            ? { tone: "success", text: t("recruitment.applicationDetail.interview.emailSent", { email: application.email, defaultValue: "Interview scheduled and invitation sent to {{email}}" }) }
            : { tone: "warning", text: t("recruitment.applicationDetail.interview.emailFailed", { reason: email.reason, defaultValue: "Interview saved, but the email could not be sent: {{reason}}" }) });
        notifyApplicationsChanged();
        onChanged?.();
    };

    return (
        <>
            <div className="hiring-panel-overlay" onClick={onClose}>
                <aside className="hiring-panel" role="dialog" aria-modal="true" aria-label={t("recruitment.hiring.panelLabel", { defaultValue: "Hiring details" })} onClick={(event) => event.stopPropagation()}>
                    <header className="hiring-panel-header">
                        <div>
                            <h2>{application ? application.candidate_name : t("recruitment.hiring.title", { defaultValue: "Hiring" })}</h2>
                            {application && (
                                <span>
                                    <span dir="ltr" className="ltr-text">{application.application_id}</span> · <span dir="ltr" className="ltr-text">{application.job_id}</span> {application.job_title}
                                </span>
                            )}
                        </div>
                        <button type="button" className="candidate-modal-close" onClick={onClose} aria-label={t("recruitment.common.close", { defaultValue: "Close" })}>×</button>
                    </header>

                    {!application && !loaded.error && <p className="mpr-muted app-pad">{t("recruitment.common.loading", { defaultValue: "Loading..." })}</p>}
                    {loaded.error && !application && <p className="mpr-form-error app-pad">{loaded.error}</p>}

                    {application && (
                        <div className="hiring-panel-body">
                            <div className="hiring-panel-status">
                                <span className={`mpr-status ${applicationTone(application.status)}`}>{applicationStatusLabel(application.status)}</span>
                                {application.job.grade && <span className="mpr-chip">{application.job.grade}{application.job.designation ? ` · ${application.job.designation}` : ""}</span>}
                                {application.job.mpr_no && <span className="mpr-chip" dir="ltr">MPR {application.job.mpr_no}</span>}
                                <span className="mpr-chip" dir="ltr">{t("recruitment.jobs.filledOpenings", { defaultValue: "Filled / Openings" })}: {application.job.filled ?? 0}/{application.job.openings ?? "—"}</span>
                            </div>

                            <Progress application={application} />

                            {notice && <p className={`app-interview-notice ${notice.tone}`} role="status">{notice.text}</p>}

                            <ActionBox
                                application={application}
                                onDone={changed}
                                onChecklist={(updated) => changed(updated, null)}
                                onSchedule={() => setScheduling(true)}
                            />

                            {application.interviews.length > 0 && (
                                <section className="candidate-section hiring-section">
                                    <h3>{t("recruitment.hiring.interviews", { defaultValue: "Interviews" })}</h3>
                                    <ol className="hiring-rounds">
                                        {application.interviews.map((round, index) => (
                                            <li key={round.id}>
                                                <strong>{t("recruitment.hiring.round", { number: index + 1, defaultValue: "Round {{number}}" })}</strong>
                                                <span dir="ltr" className="ltr-text">{formatDate(round.interview_date)} · {formatInterviewTime(round.interview_time)}</span>
                                                <span>{recruitmentValueLabel("interviewMode", round.mode)} · {round.interviewer_name}</span>
                                                {round.result
                                                    ? <span className="hiring-round-result"><em>{round.result}</em>{round.feedback ? ` – ${round.feedback}` : ""}{round.reject_reason ? ` (${t("recruitment.hiring.result.reasonShort", { defaultValue: "reason" })}: ${round.reject_reason})` : ""}</span>
                                                    : <span className="mpr-muted">{t("recruitment.hiring.noResult", { defaultValue: "No result yet" })}</span>}
                                            </li>
                                        ))}
                                    </ol>
                                    <small className="hiring-hint">{t("recruitment.hiring.internalOnly", { defaultValue: "Internal only – never sent to the candidate" })}</small>
                                </section>
                            )}

                            <section className="candidate-section hiring-section">
                                <h3>{t("recruitment.applicationDetail.application", { defaultValue: "Application" })}</h3>
                                <div className="candidate-grid">
                                    <Item label={t("profileEdit.fields.email", { defaultValue: "Email" })}><a href={`mailto:${application.email}`} dir="ltr">{application.email}</a></Item>
                                    <Item label={t("profileEdit.fields.phone", { defaultValue: "Phone" })}><span dir="ltr">{show(application.phone)}</span></Item>
                                    <Item label={t("recruitment.applications.appliedOn", { defaultValue: "Applied On" })}><span dir="ltr" className="ltr-text">{formatDateTime(application.applied_at)}</span></Item>
                                    <Item label={t("recruitment.applications.sourceAgency", { defaultValue: "Source / Agency" })}>{sourceText(application)}</Item>
                                    <Item label={t("recruitment.fields.experience", { defaultValue: "Experience" })}>{experienceText(application)}</Item>
                                    <Item label={t("recruitment.applicationDetail.expectedSalary", { defaultValue: "Expected Monthly Salary" })}><span dir="ltr">{salaryText(application.expected_salary, application.salary_currency, application.expected_ctc)}</span></Item>
                                    <Item label={t("profileEdit.fields.nationality", { defaultValue: "Nationality" })}>{show(application.nationality)}</Item>
                                    <Item label={t("recruitment.applicationDetail.currentLocation", { defaultValue: "Current Location" })}>{show(application.location)}</Item>
                                </div>
                                <div className="hiring-actions">
                                    <button type="button" className="mpr-btn" onClick={() => setFullOpen(true)}>
                                        <FileText size={15} aria-hidden="true" /> {t("recruitment.hiring.fullApplication", { defaultValue: "Full application & CV" })}
                                    </button>
                                </div>
                            </section>

                            <section className="candidate-section hiring-section">
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
                                        {application.actions.length === 0 && (
                                            <tr><td colSpan="4">{t("recruitment.log.noApplicationEntries", { defaultValue: "No tracking entries (application received before tracking was added)." })}</td></tr>
                                        )}
                                        {[...application.actions].reverse().map((action) => (
                                            <tr key={action.id}>
                                                <td><span dir="ltr" className="ltr-text">{formatDateTime(action.created_at)}</span></td>
                                                <td>
                                                    <strong>{recruitmentActionLabel(action.action)}</strong>
                                                    {action.from_status && action.to_status && <small> · {t("recruitment.log.statusChange", { from: applicationStatusLabel(action.from_status), to: applicationStatusLabel(action.to_status), defaultValue: "{{from}} → {{to}}" })}</small>}
                                                </td>
                                                <td>{action.actor_name || (action.action === "Applied"
                                                    ? t("recruitment.applications.candidate", { defaultValue: "Candidate" })
                                                    : t("recruitment.log.system", { defaultValue: "System" }))}</td>
                                                <td>{action.remark || "—"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </section>
                        </div>
                    )}
                </aside>
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
