// HR: Edit Job Opening (Recruitment → Job Openings → "Edit Recruitment Plan").
// Updates the job opening only, never the MPR. Sourcing, agency, recruiter and
// interview panel are not edited here and keep their stored values.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Briefcase } from "lucide-react";
import DatePicker from "../layout/common/DatePicker";
import "../../pages/hr/Recruitment.css";
import "./recruitment.css";
import { api, recruitmentValueLabel } from "./recruitmentApi";

// Same lists as JOB_EMPLOYMENT_TYPES / JOB_EXPERIENCE_OPTIONS in backend/services/manpowerWorkflow.js
const JOB_EMPLOYMENT_TYPES = ["Full Time", "Part Time", "Contract", "Temporary", "Project-based"];
const JOB_EXPERIENCE_OPTIONS = ["Fresher", "0–2 years", "2–5 years", "5–10 years", "10+ years"];
const OPEN_STATUSES = ["open", "recruitment in progress", "active"];
const MAX_SKILLS = 30;

// Older jobs store experience as a number of years ("0", "3"): pre-select the matching range
function initialExperience(value) {
    const text = String(value || "").trim();
    if (!text || JOB_EXPERIENCE_OPTIONS.includes(text)) return text;
    if (/fresher/i.test(text)) return "Fresher";
    if (/^\d+(\.\d+)?$/.test(text)) {
        const years = Number(text);
        if (years === 0) return "Fresher";
        if (years < 2) return "0–2 years";
        if (years < 5) return "2–5 years";
        if (years < 10) return "5–10 years";
        return "10+ years";
    }
    return text; // kept as-is (shown as an extra option)
}

const splitSkills = (skills) =>
    [...new Map(String(skills || "").split(/[,\n;]/).map((skill) => skill.trim()).filter(Boolean).map((skill) => [skill.toLowerCase(), skill])).values()];

function Field({ label, htmlFor, required = false, error, full = false, hint, children }) {
    return (
        <div className={`app-iv-field${full ? " full" : ""}${error ? " has-error" : ""}`}>
            <label htmlFor={htmlFor}>{label}{required && " *"}</label>
            {children}
            {hint && <small className="jo-edit-hint">{hint}</small>}
            {error && <span className="app-iv-error" role="alert">{error}</span>}
        </div>
    );
}

function SkillTags({ id, value, onChange, invalid }) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState("");

    const add = (raw) => {
        const next = [...value];
        String(raw).split(",").map((part) => part.trim().slice(0, 50)).filter(Boolean).forEach((skill) => {
            if (next.length < MAX_SKILLS && !next.some((item) => item.toLowerCase() === skill.toLowerCase())) next.push(skill);
        });
        if (next.length !== value.length) onChange(next);
        setDraft("");
    };

    const keyDown = (event) => {
        if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add(draft);
        } else if (event.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
        }
    };

    return (
        <div className={`jo-edit-tags app-iv-control${invalid ? " invalid" : ""}`}>
            {value.map((skill) => (
                <span key={skill} className="jo-edit-tag">
                    {skill}
                    <button
                        type="button"
                        onClick={() => onChange(value.filter((item) => item !== skill))}
                        aria-label={t("recruitment.editJob.removeSkill", { skill, defaultValue: "Remove {{skill}}" })}
                    >
                        ×
                    </button>
                </span>
            ))}
            <input
                id={id}
                value={draft}
                onChange={(event) => (event.target.value.includes(",") ? add(event.target.value) : setDraft(event.target.value))}
                onKeyDown={keyDown}
                onBlur={() => draft.trim() && add(draft)}
                placeholder={value.length
                    ? t("recruitment.editJob.addSkill", { defaultValue: "Add another skill" })
                    : t("recruitment.editJob.skillPlaceholder", { defaultValue: "Type a skill and press Enter" })}
                disabled={value.length >= MAX_SKILLS}
                aria-invalid={invalid}
            />
        </div>
    );
}

function JobOpeningEditModal({ job, meta, actorId, onClose, onSaved }) {
    const { t } = useTranslation();
    const text = (key, fallback, options) => t(`recruitment.editJob.${key}`, { defaultValue: fallback, ...options });

    const masterLocation = meta.locations.find((item) => item.name.trim().toLowerCase() === String(job.location || "").trim().toLowerCase());
    const [form, setForm] = useState(() => ({
        title: job.title || "",
        location: masterLocation ? masterLocation.name : job.location || "",
        employment_type: job.employment_type || "",
        experience: initialExperience(job.experience),
        openings: job.openings != null ? String(job.openings) : "",
        qualification: job.qualification || "",
        skills: splitSkills(job.skills),
        job_description: job.job_description || "",
        application_deadline: job.application_deadline || "",
        status: OPEN_STATUSES.includes(String(job.status || "").toLowerCase()) ? "Open" : "Closed",
    }));
    const [errors, setErrors] = useState({});
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const filled = Number(job.filled || 0);
    const mprOpenings = job.mpr_openings ? Number(job.mpr_openings) : null;
    const today = meta.today;
    const minDeadline = job.application_start_date && job.application_start_date > today ? job.application_start_date : today;

    const set = (name, value) => {
        setForm((current) => ({ ...current, [name]: value }));
        setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
    };

    const close = () => {
        if (!saving) onClose();
    };

    useEffect(() => {
        const onKey = (event) => event.key === "Escape" && !saving && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [saving, onClose]);

    // Current values not in today's lists (inactive location, legacy type / experience) stay selectable
    const locations = meta.locations.map((item) => item.name);
    const locationOptions = job.location && !masterLocation ? [job.location, ...locations] : locations;
    const typeOptions = job.employment_type && !JOB_EMPLOYMENT_TYPES.includes(job.employment_type)
        ? [...JOB_EMPLOYMENT_TYPES, job.employment_type]
        : JOB_EMPLOYMENT_TYPES;
    const legacyExperience = initialExperience(job.experience);
    const experienceOptions = legacyExperience && !JOB_EXPERIENCE_OPTIONS.includes(legacyExperience)
        ? [...JOB_EXPERIENCE_OPTIONS, legacyExperience]
        : JOB_EXPERIENCE_OPTIONS;

    const validate = () => {
        const found = {};
        const required = (name, message) => {
            if (!String(form[name] || "").trim()) found[name] = message;
        };
        required("title", text("errors.title", "Job title is required"));
        required("location", text("errors.location", "Location / Site is required"));
        required("employment_type", text("errors.employmentType", "Employment type is required"));
        required("experience", text("errors.experience", "Experience is required"));
        required("qualification", text("errors.qualification", "Required qualification is required"));
        required("job_description", text("errors.description", "Job description is required"));

        const openings = String(form.openings).trim();
        if (!openings) found.openings = text("errors.openingsRequired", "Number of openings is required");
        else if (!/^\d+$/.test(openings) || Number(openings) < 1) found.openings = text("errors.openingsWhole", "Enter a whole number, 1 or more");
        else if (Number(openings) < filled) found.openings = text("errors.openingsMin", "Can't be less than the {{number}} position(s) already filled", { number: filled });
        else if (mprOpenings && Number(openings) > mprOpenings) found.openings = text("errors.openingsMax", "Can't be more than the {{number}} approved in the MPR", { number: mprOpenings });

        if (form.skills.length === 0) found.skills = text("errors.skills", "Add at least one key skill");

        if (!form.application_deadline) found.application_deadline = text("errors.deadline", "Application deadline is required");
        else if (form.application_deadline < minDeadline) {
            found.application_deadline = minDeadline === today
                ? text("errors.deadlinePast", "Application deadline must be today or later")
                : text("errors.deadlineStart", "Application deadline can't be before the application start date");
        }

        if (form.status === "Open" && !found.openings && filled >= Number(openings)) {
            found.status = text("errors.reopenFilled", "All positions are filled. Increase the number of openings to reopen this job");
        }
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
            const saved = await api(`/api/jobs/${job.id}`, {
                method: "PUT",
                body: { ...form, openings: Number(form.openings), actor_id: actorId },
            });
            onSaved(saved);
        } catch (err) {
            if (err.fields) setErrors(err.fields);
            else setError(err.message);
            setSaving(false);
        }
    };

    const mprLine = [job.mpr_grade, job.mpr_position, job.mpr_designation].filter(Boolean).join(" · ");
    const title = text("title", "Edit Job Opening");

    return (
        <div className="candidate-modal-overlay" onClick={close}>
            <div className="candidate-modal app-interview-modal jo-edit-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
                <div className="candidate-modal-header">
                    <div className="app-iv-title">
                        <i className="app-iv-title-icon"><Briefcase size={20} aria-hidden="true" /></i>
                        <div>
                            <h2>{title}</h2>
                            <span>
                                <span dir="ltr" className="ltr-text">{job.job_id}</span> · {job.mpr_no
                                    ? <span dir="ltr" className="ltr-text">{job.mpr_no}</span>
                                    : t("recruitment.jobs.noMprLegacy", { defaultValue: "No MPR (legacy)" })}
                            </span>
                        </div>
                    </div>
                    <button type="button" className="candidate-modal-close" onClick={close} aria-label={t("recruitment.common.close", { defaultValue: "Close" })}>
×</button>
                </div>

                <form className="app-iv-form" onSubmit={save} noValidate>
                    <div className="app-iv-body">
                        <div className="app-iv-candidate jo-edit-context">
                            <span><small>{t("profileEdit.fields.department", { defaultValue: "Department" })}</small><strong>{job.department || "—"}</strong></span>
                            <span><small>{text("gradeLine", "Grade · Position · Designation")}</small><strong>{mprLine || "—"}</strong></span>
                        </div>

                        <div className="app-iv-grid">
                            <Field label={text("jobTitle", "Job title")} htmlFor="jo_title" required error={errors.title}>
                                <input id="jo_title" className="app-iv-control" value={form.title} maxLength={150} onChange={(event) => set("title", event.target.value)} />
                            </Field>

                            <Field label={text("location", "Location / Site")} htmlFor="jo_location" required error={errors.location}>
                                <select id="jo_location" className="app-iv-control" value={form.location} onChange={(event) => set("location", event.target.value)}>
                                    <option value="">{locationOptions.length
                                        ? text("selectLocation", "Select location")
                                        : text("noLocations", "No locations — add one in Settings → Recruitment Masters")}</option>
                                    {locationOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                                </select>
                            </Field>

                            <Field label={text("employmentType", "Employment type")} htmlFor="jo_type" required error={errors.employment_type}>
                                <select id="jo_type" className="app-iv-control" value={form.employment_type} onChange={(event) => set("employment_type", event.target.value)}>
                                    <option value="">{text("selectType", "Select type")}</option>
                                    {typeOptions.map((option) => <option key={option} value={option}>{recruitmentValueLabel("employmentType", option)}</option>)}
                                </select>
                            </Field>

                            <Field label={text("experience", "Experience")} htmlFor="jo_experience" required error={errors.experience}>
                                <select id="jo_experience" className="app-iv-control" value={form.experience} onChange={(event) => set("experience", event.target.value)}>
                                    <option value="">{text("selectExperience", "Select experience")}</option>
                                    {experienceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                            </Field>

                            <Field
                                label={text("openings", "Number of openings")}
                                htmlFor="jo_openings"
                                required
                                error={errors.openings}
                                hint={[
                                    mprOpenings ? text("approvedInMpr", "Approved in MPR: {{number}}", { number: mprOpenings }) : null,
                                    filled > 0 ? text("alreadyFilled", "Filled: {{number}}", { number: filled }) : null,
                                ].filter(Boolean).join(" · ") || null}
                            >
                                <input
                                    id="jo_openings"
                                    className="app-iv-control"
                                    type="number"
                                    inputMode="numeric"
                                    step="1"
                                    min={Math.max(1, filled)}
                                    max={mprOpenings || undefined}
                                    value={form.openings}
                                    onChange={(event) => set("openings", event.target.value)}
                                />
                            </Field>

                            <Field label={text("qualification", "Required qualification")} htmlFor="jo_qualification" required error={errors.qualification}>
                                <input id="jo_qualification" className="app-iv-control" value={form.qualification} maxLength={300} onChange={(event) => set("qualification", event.target.value)} />
                            </Field>

                            <Field label={text("skills", "Key skills")} htmlFor="jo_skills" required full error={errors.skills} hint={text("skillsHint", "Press Enter or comma to add a skill")}>
                                <SkillTags id="jo_skills" value={form.skills} onChange={(value) => set("skills", value)} invalid={Boolean(errors.skills)} />
                            </Field>

                            <Field label={text("description", "Job description")} htmlFor="jo_description" required full error={errors.job_description}>
                                <textarea id="jo_description" className="app-iv-control" rows="7" maxLength={10000} value={form.job_description} onChange={(event) => set("job_description", event.target.value)} />
                            </Field>

                            <Field label={t("recruitment.fields.applicationDeadline", { defaultValue: "Application deadline" })} required error={errors.application_deadline}>
                                <DatePicker
                                    value={form.application_deadline}
                                    onChange={(value) => set("application_deadline", value)}
                                    minDate={minDeadline}
                                    today={today}
                                    autoPosition
                                />
                            </Field>

                            <Field label={text("status", "Job status")} error={errors.status}>
                                <div className="jo-edit-status" role="radiogroup" aria-label={text("status", "Job status")}>
                                    {["Open", "Closed"].map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            role="radio"
                                            aria-checked={form.status === option}
                                            className={`jo-edit-status-btn ${option.toLowerCase()}${form.status === option ? " selected" : ""}`}
                                            onClick={() => set("status", option)}
                                        >
                                            {text(`status${option}`, option)}
                                        </button>
                                    ))}
                                </div>
                            </Field>
                        </div>

                        {error && <p className="mpr-form-error">{error}</p>}
                    </div>

                    <div className="app-iv-footer">
                        <button type="button" className="cancel-btn" onClick={close} disabled={saving}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
                        <button type="submit" className="save-job-btn" disabled={saving}>
                            {saving ? text("saving", "Saving…") : text("save", "Save changes")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default JobOpeningEditModal;
