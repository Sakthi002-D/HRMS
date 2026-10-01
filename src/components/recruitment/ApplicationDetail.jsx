// Job application detail (HR): all form details, CV preview/download, HR decision and tracking log.
import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Download, Eye, EyeOff, FileText } from "lucide-react";
import "../../pages/hr/Recruitment.css";
import "./recruitment.css";
import { useConfirm } from "../common/dialog/dialogContext";
import { experienceText, monthText, salaryText, sourceText } from "./applicationFormat";
import {
    api,
    applicationTone,
    fetchApplicationCv,
    formatDate,
    formatDateTime,
    notifyApplicationsChanged,
} from "./recruitmentApi";

const yesNo = (value) => (value === true ? "Yes" : value === false ? "No" : "—");
const show = (value) => (value === null || value === undefined || value === "" ? "—" : value);

const ACTIONS = {
    shortlist: { label: "Shortlist", className: "success", variant: "success", title: "Shortlist this candidate?", busy: "Shortlisting..." },
    hold: { label: "Put On Hold", className: "warning", variant: "warning", title: "Put this application on hold?", busy: "Saving..." },
    reject: { label: "Reject", className: "danger", variant: "danger", title: "Reject this application?", busy: "Rejecting..." },
};

function Item({ label, children, full = false }) {
    return (
        <div className={full ? "full-width" : ""}>
            <label>{label}</label>
            <p>{children}</p>
        </div>
    );
}

function CvPanel({ application, actorId }) {
    const [cvUrl, setCvUrl] = useState("");
    const [previewOpen, setPreviewOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const urlRef = useRef("");

    useEffect(() => () => urlRef.current && URL.revokeObjectURL(urlRef.current), []);

    const isPdf = application.cv_mime === "application/pdf";

    const loadCv = async () => {
        if (urlRef.current) return urlRef.current;
        setBusy(true);
        setError("");
        try {
            urlRef.current = await fetchApplicationCv(application.id, actorId);
            setCvUrl(urlRef.current);
            return urlRef.current;
        } catch (err) {
            setError(err.message);
            return "";
        } finally {
            setBusy(false);
        }
    };

    const download = async () => {
        const url = await loadCv();
        if (!url) return;
        const link = document.createElement("a");
        link.href = url;
        link.download = `${application.application_id}-${application.cv_name || "cv"}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    const togglePreview = async () => {
        if (previewOpen) return setPreviewOpen(false);
        if (await loadCv()) setPreviewOpen(true);
    };

    if (!application.has_cv) {
        return application.resume_url ? (
            <div className="candidate-resume">
                <span>Resume (uploaded before the Careers page)</span>
                <a href={application.resume_url} target="_blank" rel="noreferrer">View Resume →</a>
            </div>
        ) : (
            <p className="mpr-muted">No CV was uploaded with this application.</p>
        );
    }

    return (
        <div className="app-cv">
            <div className="app-cv-head">
                <FileText size={20} aria-hidden="true" />
                <div>
                    <strong>{application.cv_name || "CV"}</strong>
                    <small>{application.cv_size ? `${(application.cv_size / 1024).toFixed(0)} KB` : ""}</small>
                </div>
                <div className="app-cv-actions">
                    {isPdf && (
                        <button type="button" className="mpr-btn" onClick={togglePreview} disabled={busy}>
                            {previewOpen ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                            {previewOpen ? "Hide preview" : "Preview"}
                        </button>
                    )}
                    <button type="button" className="mpr-btn success" onClick={download} disabled={busy}>
                        <Download size={15} aria-hidden="true" /> {busy ? "Loading..." : "Download"}
                    </button>
                </div>
            </div>
            {!isPdf && <small className="mpr-muted">Word documents can't be previewed in the browser; download to open.</small>}
            {error && <p className="mpr-form-error">{error}</p>}
            {previewOpen && cvUrl && <iframe className="app-cv-frame" src={cvUrl} title={`CV of ${application.candidate_name}`} />}
        </div>
    );
}

function ApplicationDetail({ applicationId, actorId, onClose, onChanged }) {
    const confirm = useConfirm();
    const [loaded, setLoaded] = useState({ id: null, application: null, error: "" });
    const [remark, setRemark] = useState("");
    const [actionError, setActionError] = useState("");

    useEffect(() => {
        let ignore = false;
        api(`/api/hr/job-applications/${applicationId}?employee_id=${encodeURIComponent(actorId || "")}`)
            .then((application) => !ignore && setLoaded({ id: applicationId, application, error: "" }))
            .catch((err) => !ignore && setLoaded({ id: applicationId, application: null, error: err.message }));
        return () => { ignore = true; };
    }, [applicationId, actorId]);

    const application = loaded.id === applicationId ? loaded.application : null;
    const loading = loaded.id !== applicationId;

    const runAction = async (action) => {
        const rule = ACTIONS[action];
        if (action === "reject" && !remark.trim()) {
            setActionError("Enter the reason for rejecting.");
            return;
        }
        setActionError("");
        await confirm({
            variant: rule.variant,
            title: rule.title,
            message: (
                <>
                    <strong>{application.candidate_name}</strong> ({application.application_id}) for {application.job_title}.
                    {remark.trim() && <><br />Remark: {remark.trim()}</>}
                </>
            ),
            confirmText: rule.label,
            loadingText: rule.busy,
            onConfirm: async () => {
                const updated = await api(`/api/hr/job-applications/${applicationId}/${action}`, {
                    method: "POST",
                    body: { actor_id: actorId, remark: remark.trim() },
                });
                setLoaded({ id: applicationId, application: updated, error: "" });
                setRemark("");
                notifyApplicationsChanged();
                onChanged?.();
            },
        });
    };

    const isExperienced = application?.candidate_type === "Experienced";
    const history = Array.isArray(application?.employment_history) ? application.employment_history : [];
    const skills = String(application?.skills || "").split(",").map((skill) => skill.trim()).filter(Boolean);

    return (
        <div className="candidate-modal-overlay" onClick={onClose}>
            <div className="candidate-modal app-detail" role="dialog" aria-modal="true" aria-label="Application details" onClick={(event) => event.stopPropagation()}>
                <div className="candidate-modal-header">
                    <div>
                        <h2>{application ? application.candidate_name : "Job Application"}</h2>
                        {application && (
                            <span>
                                {application.application_id} · {application.job_id} {application.job_title} · applied {formatDateTime(application.applied_at)}
                            </span>
                        )}
                    </div>
                    <button type="button" className="candidate-modal-close" onClick={onClose} aria-label="Close">×</button>
                </div>

                {loading && <p className="mpr-muted app-pad">Loading...</p>}
                {loaded.error && !application && <p className="mpr-form-error app-pad">{loaded.error}</p>}

                {application && (
                    <>
                        <div className="mpr-detail-status">
                            <span className={`mpr-status ${applicationTone(application.status)}`}>{application.status}</span>
                            {application.candidate_type && (
                                <span className={`app-type ${application.candidate_type === "Fresher" ? "fresher" : "experienced"}`}>{application.candidate_type}</span>
                            )}
                            {application.mpr_no && <span className="mpr-chip">MPR {application.mpr_no}</span>}
                        </div>

                        {/* HR DECISION */}
                        <section className="candidate-section mpr-actions-panel">
                            <h3>HR decision</h3>
                            {application.status_remark && (
                                <p className="app-last-remark"><strong>Last remark:</strong> {application.status_remark}</p>
                            )}
                            {application.allowed_actions.length > 0 ? (
                                <>
                                    <textarea
                                        rows="3"
                                        value={remark}
                                        onChange={(event) => setRemark(event.target.value)}
                                        placeholder="Remarks (required to reject)"
                                        maxLength={1000}
                                    />
                                    {actionError && <p className="mpr-form-error">{actionError}</p>}
                                    <div className="mpr-action-buttons">
                                        {application.allowed_actions.map((action) => (
                                            <button key={action} type="button" className={`mpr-btn ${ACTIONS[action].className}`} onClick={() => runAction(action)}>
                                                {ACTIONS[action].label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <p className="mpr-muted">No further review actions: this application is {application.status}.</p>
                            )}
                            <div className="app-next-phase">
                                <button type="button" className="mpr-btn" disabled title="Coming in the next phase (FRD 1.2)">
                                    <CalendarPlus size={15} aria-hidden="true" /> Schedule Interview
                                </button>
                                <small>Interview scheduling (FRD 1.2) comes in the next phase.</small>
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>Application</h3>
                            <div className="candidate-grid">
                                <Item label="Application No">{application.application_id}</Item>
                                <Item label="Job">{application.job_id} – {show(application.job_title)}</Item>
                                <Item label="Department">{show(application.department)}</Item>
                                <Item label="Applied On">{formatDateTime(application.applied_at)}</Item>
                                <Item label="Source / Agency">{sourceText(application)}</Item>
                                <Item label="Submitted via">{application.submitted_via === "careers" ? "Careers page" : "Earlier application form"}</Item>
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>Personal Details</h3>
                            <div className="candidate-grid">
                                <Item label="Full Name">{application.candidate_name}</Item>
                                <Item label="Email"><a href={`mailto:${application.email}`}>{application.email}</a></Item>
                                <Item label="Phone">{show(application.phone)}</Item>
                                <Item label="Date of Birth">{formatDate(application.date_of_birth)}</Item>
                                <Item label="Gender">{show(application.gender)}</Item>
                                <Item label="Nationality">{show(application.nationality)}</Item>
                                <Item label="Current Location">{show(application.location)}</Item>
                                <Item label="Currently in Qatar">{yesNo(application.in_qatar)}{application.in_qatar && application.visa_status ? ` · ${application.visa_status}` : ""}</Item>
                                <Item label="Willing to Relocate">{yesNo(application.willing_to_relocate)}</Item>
                                <Item label="LinkedIn">
                                    {application.linkedin_url
                                        ? <a href={application.linkedin_url} target="_blank" rel="noreferrer noopener">{application.linkedin_url}</a>
                                        : "—"}
                                </Item>
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>Education</h3>
                            <div className="candidate-grid">
                                <Item label="Highest Qualification">{show(application.highest_education)}</Item>
                                <Item label="Institution">{show(application.college)}</Item>
                                <Item label="Year of Passing">{show(application.graduation_year)}</Item>
                                <Item label="Percentage / CGPA">{show(application.cgpa_percentage)}</Item>
                            </div>
                        </section>

                        {isExperienced ? (
                            <section className="candidate-section">
                                <h3>Work Experience</h3>
                                <div className="candidate-grid">
                                    <Item label="Total Experience">{experienceText(application)}</Item>
                                    <Item label="Notice Period">{show(application.notice_period)}</Item>
                                    <Item label="Current / Last Company">{show(application.current_company)}</Item>
                                    <Item label="Current / Last Designation">{show(application.current_designation)}</Item>
                                    <Item label="Current Monthly Salary">{salaryText(application.current_salary, application.salary_currency, application.current_ctc)}</Item>
                                    <Item label="Expected Monthly Salary">{salaryText(application.expected_salary, application.salary_currency, application.expected_ctc)}</Item>
                                </div>
                                {history.length > 0 && (
                                    <table className="jobs-table mpr-log app-history">
                                        <thead><tr><th>Company</th><th>Designation</th><th>From</th><th>To</th></tr></thead>
                                        <tbody>
                                            {history.map((row, index) => (
                                                <tr key={`${row.company}-${index}`}>
                                                    <td>{row.company}</td>
                                                    <td>{row.designation}</td>
                                                    <td>{monthText(row.from)}</td>
                                                    <td>{monthText(row.to)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </section>
                        ) : (
                            <section className="candidate-section">
                                <h3>Fresher Details</h3>
                                <div className="candidate-grid">
                                    <Item label="Available to Join From">{formatDate(application.joining_date)}</Item>
                                    <Item label="Internships / Projects" full>{show(application.internships_projects || application.project_description)}</Item>
                                    <Item label="Certifications" full>{show(application.certifications)}</Item>
                                </div>
                            </section>
                        )}

                        <section className="candidate-section">
                            <h3>Skills &amp; Cover Letter</h3>
                            {skills.length ? (
                                <div className="app-skills">{skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
                            ) : (
                                <p className="mpr-muted">No skills listed.</p>
                            )}
                            <div className="candidate-grid app-cover">
                                <Item label="Cover Letter" full>{show(application.cover_letter)}</Item>
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>CV / Resume</h3>
                            <CvPanel application={application} actorId={actorId} />
                        </section>

                        <section className="candidate-section">
                            <h3>Tracking details</h3>
                            <table className="jobs-table mpr-log">
                                <thead>
                                    <tr><th>Date</th><th>Action</th><th>By</th><th>Remark</th></tr>
                                </thead>
                                <tbody>
                                    {application.actions.length === 0 && (
                                        <tr><td colSpan="4">No tracking entries (application received before tracking was added).</td></tr>
                                    )}
                                    {application.actions.map((action) => (
                                        <tr key={action.id}>
                                            <td>{formatDateTime(action.created_at)}</td>
                                            <td>
                                                <strong>{action.action}</strong>
                                                {action.from_status && action.to_status && <small> · {action.from_status} → {action.to_status}</small>}
                                            </td>
                                            <td>{action.actor_name || (action.action === "Applied" ? "Candidate" : "System")}</td>
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

export default ApplicationDetail;
