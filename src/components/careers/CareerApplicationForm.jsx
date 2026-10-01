// Careers "Apply Now" form. Step 1: Fresher or Experienced; the fields below change with the choice.
import { useMemo, useRef, useState } from "react";
import { Award, BriefcaseBusiness, FileText, GraduationCap, Plus, Trash2, Upload } from "lucide-react";
import DatePicker from "../layout/common/DatePicker";
import SkillTagInput from "./SkillTagInput";
import {
    COUNTRIES,
    CV_ACCEPT,
    PHONE_CODES,
    splitSkills,
    submitApplication,
    toPayload,
    validateCv,
    validateForm,
} from "./careersApi";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EMPTY_HISTORY_ROW = { company: "", designation: "", from: "", to: "" };

const initialForm = (meta) => ({
    candidate_type: "",
    full_name: "", email: "", phone_code: "+974", phone: "", date_of_birth: "", gender: "", nationality: "",
    current_city: "", current_country: "", in_qatar: "", visa_status: "", willing_to_relocate: "",
    highest_qualification: "", institution: "", year_of_passing: "", percentage_cgpa: "",
    key_skills: [], linkedin_url: "", cover_letter: "",
    source: "", agency_id: "", referrer: "", consent: false,
    internships_projects: "", certifications: "", available_from: "",
    experience_years: "", experience_months: "", current_company: "", current_designation: "",
    current_salary: "", expected_salary: "", salary_currency: meta.defaultCurrency || "QAR", notice_period: "",
    employment_history: [],
});

function Field({ label, field, required = false, error, hint, full = false, children }) {
    return (
        <div className={`career-field${full ? " full" : ""}${error ? " has-error" : ""}`} data-field={field}>
            <label htmlFor={field}>
                {label}
                {required && <span className="career-req" aria-hidden="true"> *</span>}
            </label>
            {children}
            {error ? <small className="career-error" role="alert">{error}</small> : hint && <small className="career-hint">{hint}</small>}
        </div>
    );
}

function YesNo({ name, value, onChange }) {
    return (
        <div className="career-yesno" role="radiogroup" id={name}>
            {["Yes", "No"].map((option) => (
                <label key={option} className={value === option ? "checked" : ""}>
                    <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
                    {option}
                </label>
            ))}
        </div>
    );
}

// "YYYY-MM" from a month + year select ("2020-" / "-05" while only one is chosen)
function MonthInput({ value, onChange, maxYear, emptyLabel, label }) {
    const [year = "", month = ""] = value ? value.split("-") : [];
    const years = Array.from({ length: maxYear - 1969 }, (_, index) => String(maxYear - index));
    const update = (nextYear, nextMonth) => onChange(nextYear || nextMonth ? `${nextYear}-${nextMonth}` : "");
    return (
        <div className="career-month">
            <select value={month} onChange={(event) => update(year, event.target.value)} aria-label={`${label} month`}>
                <option value="">{emptyLabel || "Month"}</option>
                {MONTHS.map((name, index) => <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>)}
            </select>
            <select value={year} onChange={(event) => update(event.target.value, month)} aria-label={`${label} year`}>
                <option value="">Year</option>
                {years.map((item) => <option key={item}>{item}</option>)}
            </select>
        </div>
    );
}

function CareerApplicationForm({ job, meta, onCancel, onClosed, onSubmitted }) {
    const [form, setForm] = useState(() => initialForm(meta));
    const [cv, setCv] = useState(null);
    const [honeypot, setHoneypot] = useState("");
    const [errors, setErrors] = useState({});
    const [showErrors, setShowErrors] = useState(false);
    const [formError, setFormError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const formRef = useRef(null);

    const today = meta.today;
    const thisYear = Number(today.slice(0, 4));
    const jobSkills = useMemo(() => splitSkills(job.skills).slice(0, 12), [job.skills]);
    const isFresher = form.candidate_type === "Fresher";
    const isExperienced = form.candidate_type === "Experienced";

    // Re-validate as the candidate fixes things, once they've tried to submit
    const update = (patch) => {
        const next = { ...form, ...patch };
        setForm(next);
        if (showErrors) setErrors(validateForm(next, { today, cv }));
    };
    const set = (field) => (event) => update({ [field]: event.target.value });
    const err = (field) => (showErrors ? errors[field] : "");

    const chooseCv = (event) => {
        const file = event.target.files?.[0] || null;
        setCv(file);
        const cvError = file ? validateCv(file) : "";
        setErrors((current) => {
            const next = { ...current };
            if (cvError || (showErrors && !file)) next.cv = cvError || "Upload your CV/Resume";
            else delete next.cv;
            return next;
        });
    };

    const updateHistory = (index, patch) =>
        update({ employment_history: form.employment_history.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) });

    const scrollToFirstError = (fieldErrors) => {
        const first = Object.keys(fieldErrors)[0];
        const node = first && formRef.current?.querySelector(`[data-field="${CSS.escape(first)}"]`);
        if (node) {
            node.scrollIntoView({ behavior: "smooth", block: "center" });
            node.querySelector("input, select, textarea, button")?.focus({ preventScroll: true });
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setFormError("");
        const fieldErrors = validateForm(form, { today, cv });
        setErrors(fieldErrors);
        setShowErrors(true);
        if (Object.keys(fieldErrors).length) {
            setFormError("Please fix the highlighted fields.");
            scrollToFirstError(fieldErrors);
            return;
        }

        setSubmitting(true);
        try {
            const result = await submitApplication(job.job_id, toPayload(form), cv, honeypot);
            onSubmitted(result);
        } catch (error) {
            if (error.status === 409 && /closed/i.test(error.message)) {
                onClosed(error.message.replace(/^Applications closed:\s*/i, ""));
                return;
            }
            setFormError(error.message);
            if (error.fields) {
                setErrors(error.fields);
                scrollToFirstError(error.fields);
            } else {
                formRef.current?.querySelector(".career-form-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form ref={formRef} className="career-form" onSubmit={handleSubmit} noValidate>
            <header className="career-form-head">
                <span className="career-dept">{job.department}</span>
                <h1>Apply for {job.title}</h1>
                <p className="careers-muted">Job ID {job.job_id} · {job.location} · {job.employment_type}</p>
            </header>

            {/* Honeypot: hidden from people, bots fill it in */}
            <div className="career-hp" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
            </div>

            <section className="career-form-section" data-field="candidate_type">
                <h2>1. Tell us about yourself</h2>
                <div className="career-type-cards" role="radiogroup" aria-label="Candidate type">
                    {[
                        { value: "Fresher", title: "I'm a Fresher", text: "Recently graduated or looking for my first job", Icon: GraduationCap },
                        { value: "Experienced", title: "I'm Experienced", text: "I have professional work experience", Icon: BriefcaseBusiness },
                    ].map(({ value, title, text, Icon }) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={form.candidate_type === value}
                            className={`career-type-card${form.candidate_type === value ? " selected" : ""}`}
                            onClick={() => update({ candidate_type: value })}
                        >
                            <Icon size={30} aria-hidden="true" />
                            <strong>{title}</strong>
                            <span>{text}</span>
                        </button>
                    ))}
                </div>
                {err("candidate_type") && <small className="career-error" role="alert">{err("candidate_type")}</small>}
            </section>

            {form.candidate_type && (
                <>
                    <section className="career-form-section">
                        <h2>2. Personal details</h2>
                        <div className="career-grid">
                            <Field label="Full name" field="full_name" required error={err("full_name")}>
                                <input id="full_name" value={form.full_name} onChange={set("full_name")} autoComplete="name" maxLength={120} />
                            </Field>
                            <Field label="Email" field="email" required error={err("email")}>
                                <input id="email" type="email" value={form.email} onChange={set("email")} autoComplete="email" maxLength={160} />
                            </Field>
                            <Field label="Phone" field="phone" required error={err("phone")}>
                                <div className="career-phone">
                                    <select value={form.phone_code} onChange={set("phone_code")} aria-label="Country code">
                                        {PHONE_CODES.map(([code, country]) => <option key={`${code}-${country}`} value={code}>{code} {country}</option>)}
                                    </select>
                                    <input id="phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="tel-national" maxLength={20} placeholder="5555 1234" />
                                </div>
                            </Field>
                            <Field label="Date of birth" field="date_of_birth" required error={err("date_of_birth")}>
                                <DatePicker value={form.date_of_birth} onChange={(value) => update({ date_of_birth: value })} today={today} autoPosition />
                            </Field>
                            <Field label="Gender" field="gender">
                                <select id="gender" value={form.gender} onChange={set("gender")}>
                                    <option value="">Select</option>
                                    {meta.genders.map((option) => <option key={option}>{option}</option>)}
                                </select>
                            </Field>
                            <Field label="Nationality" field="nationality" required error={err("nationality")}>
                                <select id="nationality" value={form.nationality} onChange={set("nationality")}>
                                    <option value="">Select</option>
                                    {COUNTRIES.map((country) => <option key={country}>{country}</option>)}
                                </select>
                            </Field>
                        </div>
                    </section>

                    <section className="career-form-section">
                        <h2>3. Location</h2>
                        <div className="career-grid">
                            <Field label="Current city" field="current_city" required error={err("current_city")}>
                                <input id="current_city" value={form.current_city} onChange={set("current_city")} autoComplete="address-level2" maxLength={80} />
                            </Field>
                            <Field label="Current country" field="current_country" required error={err("current_country")}>
                                <select id="current_country" value={form.current_country} onChange={set("current_country")}>
                                    <option value="">Select</option>
                                    {COUNTRIES.map((country) => <option key={country}>{country}</option>)}
                                </select>
                            </Field>
                            <Field label="Currently in Qatar?" field="in_qatar" required error={err("in_qatar")}>
                                <YesNo name="in_qatar" value={form.in_qatar} onChange={(value) => update({ in_qatar: value, visa_status: value === "Yes" ? form.visa_status : "" })} />
                            </Field>
                            {form.in_qatar === "Yes" && (
                                <Field label="Visa status" field="visa_status" required error={err("visa_status")}>
                                    <select id="visa_status" value={form.visa_status} onChange={set("visa_status")}>
                                        <option value="">Select</option>
                                        {meta.visaStatuses.map((option) => <option key={option}>{option}</option>)}
                                    </select>
                                </Field>
                            )}
                            <Field label="Willing to relocate?" field="willing_to_relocate" required error={err("willing_to_relocate")}>
                                <YesNo name="willing_to_relocate" value={form.willing_to_relocate} onChange={(value) => update({ willing_to_relocate: value })} />
                            </Field>
                        </div>
                    </section>

                    <section className="career-form-section">
                        <h2>4. Education</h2>
                        <div className="career-grid">
                            <Field label="Highest qualification" field="highest_qualification" required error={err("highest_qualification")}>
                                <select id="highest_qualification" value={form.highest_qualification} onChange={set("highest_qualification")}>
                                    <option value="">Select</option>
                                    {meta.qualifications.map((option) => <option key={option}>{option}</option>)}
                                </select>
                            </Field>
                            <Field label="Institution" field="institution" required error={err("institution")}>
                                <input id="institution" value={form.institution} onChange={set("institution")} maxLength={160} />
                            </Field>
                            <Field label="Year of passing" field="year_of_passing" required error={err("year_of_passing")}>
                                <select id="year_of_passing" value={form.year_of_passing} onChange={set("year_of_passing")}>
                                    <option value="">Select</option>
                                    {Array.from({ length: thisYear + 2 - 1960 }, (_, index) => String(thisYear + 1 - index)).map((year) => <option key={year}>{year}</option>)}
                                </select>
                            </Field>
                            <Field label="Percentage / CGPA" field="percentage_cgpa" hint="e.g. 78% or 8.2 CGPA">
                                <input id="percentage_cgpa" value={form.percentage_cgpa} onChange={set("percentage_cgpa")} maxLength={20} />
                            </Field>
                        </div>
                    </section>

                    {isFresher && (
                        <section className="career-form-section">
                            <h2><Award size={18} aria-hidden="true" /> 5. Internships, certifications &amp; availability</h2>
                            <div className="career-grid">
                                <Field label="Internships / projects" field="internships_projects" full hint="Company or project name, duration and what you worked on">
                                    <textarea id="internships_projects" rows="4" value={form.internships_projects} onChange={set("internships_projects")} maxLength={3000} />
                                </Field>
                                <Field label="Certifications" field="certifications" full>
                                    <textarea id="certifications" rows="3" value={form.certifications} onChange={set("certifications")} maxLength={2000} />
                                </Field>
                                <Field label="Available to join from" field="available_from" required error={err("available_from")}>
                                    <DatePicker value={form.available_from} onChange={(value) => update({ available_from: value })} minDate={today} today={today} autoPosition />
                                </Field>
                            </div>
                        </section>
                    )}

                    {isExperienced && (
                        <section className="career-form-section">
                            <h2><BriefcaseBusiness size={18} aria-hidden="true" /> 5. Work experience</h2>
                            <div className="career-grid">
                                <Field label="Total experience" field="experience_years" required error={err("experience_years")}>
                                    <div className="career-pair">
                                        <label>
                                            <input id="experience_years" type="number" min="0" max="50" step="1" inputMode="numeric" value={form.experience_years} onChange={set("experience_years")} />
                                            <span>years</span>
                                        </label>
                                        <label>
                                            <select value={form.experience_months} onChange={set("experience_months")} aria-label="Months">
                                                <option value="">0</option>
                                                {Array.from({ length: 11 }, (_, index) => String(index + 1)).map((month) => <option key={month}>{month}</option>)}
                                            </select>
                                            <span>months</span>
                                        </label>
                                    </div>
                                </Field>
                                <Field label="Notice period" field="notice_period" required error={err("notice_period")}>
                                    <select id="notice_period" value={form.notice_period} onChange={set("notice_period")}>
                                        <option value="">Select</option>
                                        {meta.noticePeriods.map((option) => <option key={option}>{option}</option>)}
                                    </select>
                                </Field>
                                <Field label="Current / last company" field="current_company" required error={err("current_company")}>
                                    <input id="current_company" value={form.current_company} onChange={set("current_company")} maxLength={160} autoComplete="organization" />
                                </Field>
                                <Field label="Current / last designation" field="current_designation" required error={err("current_designation")}>
                                    <input id="current_designation" value={form.current_designation} onChange={set("current_designation")} maxLength={120} autoComplete="organization-title" />
                                </Field>
                                <Field label="Current monthly salary" field="current_salary" required error={err("current_salary")}>
                                    <div className="career-money">
                                        <select value={form.salary_currency} onChange={set("salary_currency")} aria-label="Salary currency">
                                            {meta.currencies.map((currency) => <option key={currency}>{currency}</option>)}
                                        </select>
                                        <input id="current_salary" type="number" min="0" step="any" inputMode="decimal" value={form.current_salary} onChange={set("current_salary")} />
                                    </div>
                                </Field>
                                <Field label="Expected monthly salary" field="expected_salary" required error={err("expected_salary")}>
                                    <div className="career-money">
                                        <span className="career-money-currency">{form.salary_currency}</span>
                                        <input id="expected_salary" type="number" min="0" step="any" inputMode="decimal" value={form.expected_salary} onChange={set("expected_salary")} />
                                    </div>
                                </Field>
                            </div>

                            <div className="career-history">
                                <div className="career-history-head">
                                    <h3>Employment history <span className="careers-muted">(optional)</span></h3>
                                    {form.employment_history.length < 10 && (
                                        <button type="button" className="career-link-btn" onClick={() => update({ employment_history: [...form.employment_history, { ...EMPTY_HISTORY_ROW }] })}>
                                            <Plus size={15} aria-hidden="true" /> Add company
                                        </button>
                                    )}
                                </div>
                                {form.employment_history.map((row, index) => {
                                    const rowError = err(`employment_history.${index}`);
                                    return (
                                        <div key={index} className={`career-history-row${rowError ? " has-error" : ""}`} data-field={`employment_history.${index}`}>
                                            <input value={row.company} onChange={(event) => updateHistory(index, { company: event.target.value })} placeholder="Company" maxLength={160} aria-label={`Company ${index + 1}`} />
                                            <input value={row.designation} onChange={(event) => updateHistory(index, { designation: event.target.value })} placeholder="Designation" maxLength={120} aria-label={`Designation ${index + 1}`} />
                                            <div className="career-history-dates">
                                                <span>From</span>
                                                <MonthInput label={`From ${index + 1}`} value={row.from} maxYear={thisYear} onChange={(value) => updateHistory(index, { from: value })} />
                                                <span>To</span>
                                                <MonthInput label={`To ${index + 1}`} value={row.to} maxYear={thisYear} emptyLabel="Present" onChange={(value) => updateHistory(index, { to: value })} />
                                            </div>
                                            <button type="button" className="career-icon-btn" onClick={() => update({ employment_history: form.employment_history.filter((_, rowIndex) => rowIndex !== index) })} aria-label={`Remove company ${index + 1}`}>
                                                <Trash2 size={16} aria-hidden="true" />
                                            </button>
                                            {rowError && <small className="career-error" role="alert">{rowError}</small>}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    <section className="career-form-section">
                        <h2><FileText size={18} aria-hidden="true" /> 6. Skills &amp; CV</h2>
                        <div className="career-grid">
                            <Field label="Key skills" field="key_skills" required full error={err("key_skills")}>
                                <SkillTagInput id="key_skills" value={form.key_skills} onChange={(value) => update({ key_skills: value })} suggestions={jobSkills} invalid={Boolean(err("key_skills"))} />
                            </Field>
                            <Field label="CV / Resume" field="cv" required full error={errors.cv && (showErrors || cv) ? errors.cv : ""} hint="PDF, DOC or DOCX, up to 5 MB">
                                <label className={`career-file${cv ? " has-file" : ""}`}>
                                    <Upload size={18} aria-hidden="true" />
                                    <span>{cv ? `${cv.name} (${(cv.size / 1024 / 1024).toFixed(2)} MB)` : "Choose a file"}</span>
                                    <input id="cv" type="file" accept={CV_ACCEPT} onChange={chooseCv} />
                                </label>
                            </Field>
                            <Field label="LinkedIn profile URL" field="linkedin_url" full error={err("linkedin_url")}>
                                <input id="linkedin_url" type="url" value={form.linkedin_url} onChange={set("linkedin_url")} placeholder="https://www.linkedin.com/in/your-name" maxLength={300} />
                            </Field>
                            <Field label="Cover letter" field="cover_letter" full hint={`${form.cover_letter.length}/5000`}>
                                <textarea id="cover_letter" rows="5" value={form.cover_letter} onChange={set("cover_letter")} maxLength={5000} />
                            </Field>
                        </div>
                    </section>

                    <section className="career-form-section">
                        <h2>7. How did you hear about us?</h2>
                        <div className="career-grid">
                            <Field label="Source" field="source" required error={err("source")}>
                                <select id="source" value={form.source} onChange={(event) => update({ source: event.target.value, agency_id: "", referrer: "" })}>
                                    <option value="">Select</option>
                                    {meta.sources.map((option) => <option key={option}>{option}</option>)}
                                </select>
                            </Field>
                            {form.source === "Recruitment agency" && (
                                <Field label="Recruitment agency" field="agency_id" required error={err("agency_id")}>
                                    <select id="agency_id" value={form.agency_id} onChange={set("agency_id")}>
                                        <option value="">Select agency</option>
                                        {meta.agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
                                    </select>
                                </Field>
                            )}
                            {form.source === "Employee referral" && (
                                <Field label="Referrer's name or employee ID" field="referrer" required error={err("referrer")}>
                                    <input id="referrer" value={form.referrer} onChange={set("referrer")} maxLength={120} />
                                </Field>
                            )}
                        </div>
                    </section>

                    <section className="career-form-section">
                        <div className={`career-consent${err("consent") ? " has-error" : ""}`} data-field="consent">
                            <label>
                                <input type="checkbox" checked={form.consent} onChange={(event) => update({ consent: event.target.checked })} />
                                <span>
                                    I confirm the information is correct and agree to Shelter Group storing my data for recruitment.
                                    <span className="career-req" aria-hidden="true"> *</span>
                                </span>
                            </label>
                            {err("consent") && <small className="career-error" role="alert">{err("consent")}</small>}
                        </div>

                        {formError && <p className="career-form-error" role="alert">{formError}</p>}

                        <div className="career-form-actions">
                            <button type="button" className="career-secondary-btn" onClick={onCancel} disabled={submitting}>
                                Back to job details
                            </button>
                            <button type="submit" className="career-apply-btn" disabled={submitting}>
                                {submitting ? "Submitting..." : "Submit Application"}
                            </button>
                        </div>
                    </section>
                </>
            )}

            {!form.candidate_type && (
                <div className="career-form-actions start">
                    <button type="button" className="career-secondary-btn" onClick={onCancel}>Back to job details</button>
                </div>
            )}
        </form>
    );
}

export default CareerApplicationForm;
