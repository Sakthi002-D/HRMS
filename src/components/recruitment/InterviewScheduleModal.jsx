// HR: schedule an interview for a shortlisted application (saves it and emails the candidate).
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Building2, CalendarDays, Clock, Link as LinkIcon, MapPin, Phone, Send, User, Video } from "lucide-react";
import DatePicker from "../layout/common/DatePicker";
import "../../pages/hr/Recruitment.css";
import "./recruitment.css";
import { INTERVIEW_MODES, INTERVIEW_PLACE_LABELS, INTERVIEW_TIME_SLOTS, formatInterviewTime } from "./applicationFormat";
import { api, recruitmentValueLabel } from "./recruitmentApi";

const MODE_ICONS = { "In-person": Building2, Online: Video, Phone };
const PLACE_ICONS = { "In-person": MapPin, Online: LinkIcon, Phone };

function Field({ label, htmlFor, required = false, error, full = false, children }) {
    return (
        <div className={`app-iv-field${full ? " full" : ""}${error ? " has-error" : ""}`}>
            <label htmlFor={htmlFor}>{label}{required && " *"}</label>
            {children}
            {error && <small className="app-iv-error" role="alert">{error}</small>}
        </div>
    );
}

// The menu is drawn in document.body (position: fixed) so the form's scroll box can't clip it
function TimeSlotSelect({ value, onChange, placeholder }) {
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState(null);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);

    useLayoutEffect(() => {
        if (!open) return undefined;

        const placeMenu = () => {
            const rect = buttonRef.current.getBoundingClientRect();
            const gap = 4;
            const edge = 8;
            setMenuStyle({
                left: rect.left,
                width: rect.width,
                top: rect.bottom + gap,
                maxHeight: Math.max(120, Math.min(240, window.innerHeight - rect.bottom - gap - edge)),
            });
        };

        const closeOnOutsideClick = (event) => {
            if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
            setOpen(false);
        };

        const closeOnEscape = (event) => {
            if (event.key === "Escape") setOpen(false);
        };

        placeMenu();
        window.addEventListener("scroll", placeMenu, true);
        window.addEventListener("resize", placeMenu);
        document.addEventListener("pointerdown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);

        return () => {
            window.removeEventListener("scroll", placeMenu, true);
            window.removeEventListener("resize", placeMenu);
            document.removeEventListener("pointerdown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [open]);

    return (
        <>
            <button
                ref={buttonRef}
                id="interview_time"
                type="button"
                className={`app-iv-control app-iv-time${value ? "" : " is-placeholder"}${open ? " is-open" : ""}`}
                onClick={() => setOpen((current) => !current)}
                aria-expanded={open}
            >
                <Clock size={16} aria-hidden="true" />
                <span dir="ltr">{value ? formatInterviewTime(value) : placeholder}</span>
                <span className="app-iv-chevron" aria-hidden="true">{open ? "⌃" : "⌄"}</span>
            </button>

            {open && menuStyle && createPortal(
                <div ref={menuRef} className="mpr-dept-menu" style={menuStyle}>
                    {INTERVIEW_TIME_SLOTS.map((slot) => (
                        <button
                            key={slot}
                            type="button"
                            className={`mpr-dept-option${value === slot ? " is-selected" : ""}`}
                            dir="ltr"
                            onClick={() => {
                                onChange(slot);
                                setOpen(false);
                            }}
                        >
                            {formatInterviewTime(slot)}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}

function InterviewScheduleModal({ application, actorId, onClose, onSaved }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({ interview_date: "", interview_time: "", mode: "", location_or_link: "", interviewer_name: "", notes: "" });
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});
    const [error, setError] = useState("");

    const text = (key, defaultValue, options) => t(`recruitment.applicationDetail.interview.${key}`, { ...options, defaultValue });
    const [placeKey, placeLabel] = INTERVIEW_PLACE_LABELS[form.mode] || ["locationOrLink", "Location or Meeting Link"];
    const PlaceIcon = PLACE_ICONS[form.mode] || MapPin;
    const place = text(placeKey, placeLabel);
    const placePlaceholder = {
        "In-person": text("locationPlaceholder", "e.g. Shelter Group Head Office, Doha"),
        Online: "https://",
        Phone: "+974 5555 1234",
    }[form.mode] || text("chooseModeFirst", "Choose a mode first");

    const set = (name, value) => {
        setForm((current) => ({ ...current, [name]: value }));
        setErrors((current) => ({ ...current, [name]: "" }));
    };

    const chooseMode = (mode) => {
        setForm((current) => ({ ...current, mode, location_or_link: "" }));
        setErrors((current) => ({ ...current, mode: "", location_or_link: "" }));
    };

    // Same rules as the server (validateInterview in careerApplications.js)
    const validate = () => {
        const found = {};
        if (!form.interview_date) found.interview_date = text("errorDate", "Choose the interview date");
        else if (form.interview_date < application.company_today) found.interview_date = text("errorDatePast", "Interview date can't be in the past");
        if (!form.interview_time) found.interview_time = text("errorTime", "Choose the interview time");
        if (!form.mode) found.mode = text("errorMode", "Choose the interview mode");
        else if (!form.location_or_link.trim()) found.location_or_link = text("errorPlace", "{{label}} is required", { label: place });
        else if (form.mode === "Online" && !/^https:\/\/\S+$/i.test(form.location_or_link.trim())) found.location_or_link = text("errorLink", "Enter a meeting link starting with https://");
        if (!form.interviewer_name.trim()) found.interviewer_name = text("errorInterviewer", "Enter the interviewer's name");
        return found;
    };

    const save = async (event) => {
        event.preventDefault();
        if (saving) return;
        const found = validate();
        setErrors(found);
        setError("");
        if (Object.keys(found).length) return;

        setSaving(true);
        try {
            onSaved(await api(`/api/hr/job-applications/${application.id}/interview`, {
                method: "POST",
                body: { ...form, actor_id: actorId },
            }));
        } catch (err) {
            if (err.fields) setErrors(err.fields);
            else setError(err.message);
            setSaving(false);
        }
    };

    const close = () => {
        if (!saving) onClose();
    };

    return (
        <div className="candidate-modal-overlay" onClick={close}>
            <div className="candidate-modal app-interview-modal" role="dialog" aria-modal="true" aria-label={t("recruitment.applicationDetail.scheduleInterview", { defaultValue: "Schedule Interview" })} onClick={(event) => event.stopPropagation()}>
                <div className="candidate-modal-header">
                    <div className="app-iv-title">
                        <i className="app-iv-title-icon"><CalendarDays size={20} aria-hidden="true" /></i>
                        <div>
                            <h2>{t("recruitment.applicationDetail.scheduleInterview", { defaultValue: "Schedule Interview" })}</h2>
                            <span>{application.candidate_name} · {application.job_title}</span>
                        </div>
                    </div>
                    <button type="button" className="candidate-modal-close" onClick={close} aria-label={t("recruitment.common.close", { defaultValue: "Close" })}>×</button>
                </div>

                <form className="app-iv-form" onSubmit={save} noValidate>
                    <div className="app-iv-body">
                        <div className="app-iv-candidate">
                            <strong>{application.candidate_name}</strong>
                            <span dir="ltr" className="ltr-text">{application.application_id}</span>
                            <span dir="ltr" className="ltr-text">{application.email}</span>
                        </div>

                        <div className="app-iv-grid">
                            <Field label={text("date", "Interview Date")} required error={errors.interview_date}>
                                <DatePicker
                                    value={form.interview_date}
                                    onChange={(value) => set("interview_date", value)}
                                    minDate={application.company_today}
                                    today={application.company_today}
                                    autoPosition
                                />
                            </Field>

                            <Field label={text("time", "Time")} htmlFor="interview_time" required error={errors.interview_time}>
                                <TimeSlotSelect
                                    value={form.interview_time}
                                    onChange={(value) => set("interview_time", value)}
                                    placeholder={text("selectTime", "Select time")}
                                />
                            </Field>

                            <Field label={text("mode", "Mode")} required full error={errors.mode}>
                                <div className="app-iv-modes" role="radiogroup" aria-label={text("mode", "Mode")}>
                                    {INTERVIEW_MODES.map((mode) => {
                                        const Icon = MODE_ICONS[mode];
                                        return (
                                            <button
                                                key={mode}
                                                type="button"
                                                role="radio"
                                                aria-checked={form.mode === mode}
                                                className={`app-iv-mode${form.mode === mode ? " selected" : ""}`}
                                                onClick={() => chooseMode(mode)}
                                            >
                                                <Icon size={18} aria-hidden="true" />
                                                {recruitmentValueLabel("interviewMode", mode)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </Field>

                            <Field label={place} htmlFor="interview_place" required error={errors.location_or_link}>
                                <div className="app-iv-input">
                                    <PlaceIcon size={16} aria-hidden="true" />
                                    <input
                                        id="interview_place"
                                        className="app-iv-control"
                                        dir={form.mode === "In-person" ? undefined : "ltr"}
                                        value={form.location_or_link}
                                        onChange={(event) => set("location_or_link", event.target.value)}
                                        placeholder={placePlaceholder}
                                        disabled={!form.mode}
                                        maxLength={500}
                                    />
                                </div>
                            </Field>

                            <Field label={text("interviewer", "Interviewer Name")} htmlFor="interview_interviewer" required error={errors.interviewer_name}>
                                <div className="app-iv-input">
                                    <User size={16} aria-hidden="true" />
                                    <input
                                        id="interview_interviewer"
                                        className="app-iv-control"
                                        value={form.interviewer_name}
                                        onChange={(event) => set("interviewer_name", event.target.value)}
                                        maxLength={120}
                                    />
                                </div>
                            </Field>

                            <Field label={text("notes", "Notes")} htmlFor="interview_notes" full>
                                <textarea
                                    id="interview_notes"
                                    className="app-iv-control"
                                    rows="3"
                                    value={form.notes}
                                    onChange={(event) => set("notes", event.target.value)}
                                    placeholder={text("notesPlaceholder", "e.g. Bring QID copy and original certificates")}
                                    maxLength={1000}
                                />
                            </Field>
                        </div>

                        {error && <p className="mpr-form-error">{error}</p>}
                    </div>

                    <div className="app-iv-footer">
                        <button type="button" className="cancel-btn" onClick={close} disabled={saving}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
                        <button type="submit" className="save-job-btn" disabled={saving}>
                            <Send size={15} aria-hidden="true" />
                            {saving ? text("sending", "Sending...") : text("save", "Save & Send Invitation")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default InterviewScheduleModal;
