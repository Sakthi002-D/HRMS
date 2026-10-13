// Job application detail (HR): all form details, CV preview/download, HR decision and tracking log.
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { CalendarPlus, Download, Eye, EyeOff, FileText } from "lucide-react";
import "../../pages/hr/Recruitment.css";
import "./recruitment.css";
import { useConfirm } from "../common/dialog/dialogContext";
import { experienceText, monthText, salaryText, sourceText } from "./applicationFormat";
import {
    api,
    applicationStatusLabel,
    applicationTone,
    fetchApplicationCv,
    formatDate,
    formatDateTime,
    notifyApplicationsChanged,
    recruitmentActionLabel,
    recruitmentValueLabel,
} from "./recruitmentApi";

const yesNo = (t, value) => (value === true
    ? t("employeeProfile.values.yes", { defaultValue: "Yes" })
    : value === false ? t("employeeProfile.values.no", { defaultValue: "No" }) : "—");
const show = (value) => (value === null || value === undefined || value === "" ? "—" : value);

// English texts; shown through t("recruitment.applicationDetail.actions.<action>.<field>")
const ACTIONS = {
    shortlist: { label: "Shortlist", className: "success", variant: "success", title: "Shortlist this candidate?", busy: "Shortlisting..." },
    hold: { label: "Put On Hold", className: "warning", variant: "warning", title: "Put this application on hold?", busy: "Saving..." },
    reject: { label: "Reject", className: "danger", variant: "danger", title: "Reject this application?", busy: "Rejecting..." },
};
const actionText = (t, action, field) =>
    t(`recruitment.applicationDetail.actions.${action}.${field}`, { defaultValue: ACTIONS[action][field] });

function Item({ label, children, full = false }) {
    return (
        <div className={full ? "full-width" : ""}>
            <label>{label}</label>
            <p>{children}</p>
        </div>
    );
}

function CvPanel({ application, actorId }) {
    const { t } = useTranslation();
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
                <span>{t("recruitment.applicationDetail.legacyResume", { defaultValue: "Resume (uploaded before the Careers page)" })}</span>
                <a href={application.resume_url} target="_blank" rel="noreferrer">{t("recruitment.applicationDetail.viewResume", { defaultValue: "View Resume →" })}</a>
            </div>
        ) : (
            <p className="mpr-muted">{t("recruitment.applicationDetail.noCv", { defaultValue: "No CV was uploaded with this application." })}</p>
        );
    }

    return (
        <div className="app-cv">
            <div className="app-cv-head">
                <FileText size={20} aria-hidden="true" />
                <div>
                    <strong>{application.cv_name || t("recruitment.applicationDetail.cv", { defaultValue: "CV" })}</strong>
                    <small>{application.cv_size ? t("recruitment.applicationDetail.fileSizeKb", { size: (application.cv_size / 1024).toFixed(0), defaultValue: "{{size}} KB" }) : ""}</small>
                </div>
                <div className="app-cv-actions">
                    {isPdf && (
                        <button type="button" className="mpr-btn" onClick={togglePreview} disabled={busy}>
                            {previewOpen ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                            {previewOpen
                                ? t("recruitment.applicationDetail.hidePreview", { defaultValue: "Hide preview" })
                                : t("recruitment.applicationDetail.preview", { defaultValue: "Preview" })}
                        </button>
                    )}
                    <button type="button" className="mpr-btn success" onClick={download} disabled={busy}>
                        <Download size={15} aria-hidden="true" /> {busy
                            ? t("recruitment.common.loading", { defaultValue: "Loading..." })
                            : t("recruitment.applicationDetail.download", { defaultValue: "Download" })}
                    </button>
                </div>
            </div>
            {!isPdf && <small className="mpr-muted">{t("recruitment.applicationDetail.wordNoPreview", { defaultValue: "Word documents can't be previewed in the browser; download to open." })}</small>}
            {error && <p className="mpr-form-error">{error}</p>}
            {previewOpen && cvUrl && <iframe className="app-cv-frame" src={cvUrl} title={t("recruitment.applicationDetail.cvOf", { name: application.candidate_name, defaultValue: "CV of {{name}}" })} />}
        </div>
    );
}

function ApplicationDetail({ applicationId, actorId, onClose, onChanged }) {
    const { t } = useTranslation();
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
            setActionError(t("recruitment.detail.errors.rejectReason", { defaultValue: "Enter the reason for rejecting." }));
            return;
        }
        setActionError("");
        await confirm({
            variant: rule.variant,
            title: actionText(t, action, "title"),
            message: (
                <>
                    <Trans
                        i18nKey="recruitment.applicationDetail.confirmMessage"
                        values={{ name: application.candidate_name, id: application.application_id, job: application.job_title }}
                        components={{ b: <strong />, ltr: <span dir="ltr" /> }}
                        defaults="<b>{{name}}</b> (<ltr>{{id}}</ltr>) for {{job}}."
                    />
                    {remark.trim() && <><br />{t("resignation.detail.dialog.remark", { remark: remark.trim(), defaultValue: "Remark: {{remark}}" })}</>}
                </>
            ),
            confirmText: actionText(t, action, "label"),
            loadingText: actionText(t, action, "busy"),
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
            <div className="candidate-modal app-detail" role="dialog" aria-modal="true" aria-label={t("recruitment.applicationDetail.ariaLabel", { defaultValue: "Application details" })} onClick={(event) => event.stopPropagation()}>
                <div className="candidate-modal-header">
                    <div>
                        <h2>{application ? application.candidate_name : t("recruitment.applicationDetail.title", { defaultValue: "Job Application" })}</h2>
                        {application && (
                            <span>
                                <span dir="ltr" className="ltr-text">{application.application_id}</span> · <span dir="ltr" className="ltr-text">{application.job_id}</span> {application.job_title} · {t("recruitment.applicationDetail.appliedAt", { defaultValue: "applied" })} <span dir="ltr" className="ltr-text">{formatDateTime(application.applied_at)}</span>
                            </span>
                        )}
                    </div>
                    <button type="button" className="candidate-modal-close" onClick={onClose} aria-label={t("recruitment.common.close", { defaultValue: "Close" })}>×</button>
                </div>

                {loading && <p className="mpr-muted app-pad">{t("recruitment.common.loading", { defaultValue: "Loading..." })}</p>}
                {loaded.error && !application && <p className="mpr-form-error app-pad">{loaded.error}</p>}

                {application && (
                    <>
                        <div className="mpr-detail-status">
                            <span className={`mpr-status ${applicationTone(application.status)}`}>{applicationStatusLabel(application.status)}</span>
                            {application.candidate_type && (
                                <span className={`app-type ${application.candidate_type === "Fresher" ? "fresher" : "experienced"}`}>{recruitmentValueLabel("candidateType", application.candidate_type)}</span>
                            )}
                            {application.mpr_no && <span className="mpr-chip" dir="ltr">MPR {application.mpr_no}</span>}
                        </div>

                        {/* HR DECISION */}
                        <section className="candidate-section mpr-actions-panel">
                            <h3>{t("recruitment.applicationDetail.hrDecision", { defaultValue: "HR decision" })}</h3>
                            {application.status_remark && (
                                <p className="app-last-remark"><strong>{t("recruitment.applicationDetail.lastRemark", { defaultValue: "Last remark:" })}</strong> {application.status_remark}</p>
                            )}
                            {application.allowed_actions.length > 0 ? (
                                <>
                                    <textarea
                                        rows="3"
                                        value={remark}
                                        onChange={(event) => setRemark(event.target.value)}
                                        placeholder={t("recruitment.applicationDetail.remarkPlaceholder", { defaultValue: "Remarks (required to reject)" })}
                                        maxLength={1000}
                                    />
                                    {actionError && <p className="mpr-form-error">{actionError}</p>}
                                    <div className="mpr-action-buttons">
                                        {application.allowed_actions.map((action) => (
                                            <button key={action} type="button" className={`mpr-btn ${ACTIONS[action].className}`} onClick={() => runAction(action)}>
                                                {actionText(t, action, "label")}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <p className="mpr-muted">{t("recruitment.applicationDetail.noFurtherActions", { status: applicationStatusLabel(application.status), defaultValue: "No further review actions: this application is {{status}}." })}</p>
                            )}
                            <div className="app-next-phase">
                                <button type="button" className="mpr-btn" disabled title={t("recruitment.applicationDetail.nextPhaseTitle", { defaultValue: "Coming in the next phase (FRD 1.2)" })}>
                                    <CalendarPlus size={15} aria-hidden="true" /> {t("recruitment.applicationDetail.scheduleInterview", { defaultValue: "Schedule Interview" })}
                                </button>
                                <small>{t("recruitment.applicationDetail.nextPhaseNote", { defaultValue: "Interview scheduling (FRD 1.2) comes in the next phase." })}</small>
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>{t("recruitment.applicationDetail.application", { defaultValue: "Application" })}</h3>
                            <div className="candidate-grid">
                                <Item label={t("recruitment.applications.applicationNo", { defaultValue: "Application No" })}><span dir="ltr" className="ltr-text">{application.application_id}</span></Item>
                                <Item label={t("recruitment.applications.job", { defaultValue: "Job" })}><span dir="ltr" className="ltr-text">{application.job_id}</span> – {show(application.job_title)}</Item>
                                <Item label={t("profileEdit.fields.department", { defaultValue: "Department" })}>{show(application.department)}</Item>
                                <Item label={t("recruitment.applications.appliedOn", { defaultValue: "Applied On" })}><span dir="ltr" className="ltr-text">{formatDateTime(application.applied_at)}</span></Item>
                                <Item label={t("recruitment.applications.sourceAgency", { defaultValue: "Source / Agency" })}>{sourceText(application)}</Item>
                                <Item label={t("recruitment.applicationDetail.submittedVia", { defaultValue: "Submitted via" })}>{application.submitted_via === "careers"
                                    ? t("recruitment.applicationDetail.careersPage", { defaultValue: "Careers page" })
                                    : t("recruitment.applicationDetail.earlierForm", { defaultValue: "Earlier application form" })}</Item>
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>{t("employeesList.form.personalDetails", { defaultValue: "Personal Details" })}</h3>
                            <div className="candidate-grid">
                                <Item label={t("profileEdit.fields.name", { defaultValue: "Full Name" })}>{application.candidate_name}</Item>
                                <Item label={t("profileEdit.fields.email", { defaultValue: "Email" })}><a href={`mailto:${application.email}`} dir="ltr">{application.email}</a></Item>
                                <Item label={t("profileEdit.fields.phone", { defaultValue: "Phone" })}><span dir="ltr">{show(application.phone)}</span></Item>
                                <Item label={t("employeesList.form.dateOfBirth", { defaultValue: "Date of Birth" })}><span dir="ltr" className="ltr-text">{formatDate(application.date_of_birth)}</span></Item>
                                <Item label={t("profileEdit.fields.gender", { defaultValue: "Gender" })}>{show(recruitmentValueLabel("gender", application.gender))}</Item>
                                <Item label={t("profileEdit.fields.nationality", { defaultValue: "Nationality" })}>{show(application.nationality)}</Item>
                                <Item label={t("recruitment.applicationDetail.currentLocation", { defaultValue: "Current Location" })}>{show(application.location)}</Item>
                                <Item label={t("recruitment.applicationDetail.inQatar", { defaultValue: "Currently in Qatar" })}>{yesNo(t, application.in_qatar)}{application.in_qatar && application.visa_status ? ` · ${recruitmentValueLabel("visaStatus", application.visa_status)}` : ""}</Item>
                                <Item label={t("recruitment.applicationDetail.willingToRelocate", { defaultValue: "Willing to Relocate" })}>{yesNo(t, application.willing_to_relocate)}</Item>
                                <Item label={t("recruitment.applicationDetail.linkedin", { defaultValue: "LinkedIn" })}>
                                    {application.linkedin_url
                                        ? <a href={application.linkedin_url} target="_blank" rel="noreferrer noopener" dir="ltr">{application.linkedin_url}</a>
                                        : "—"}
                                </Item>
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>{t("recruitment.applicationDetail.education", { defaultValue: "Education" })}</h3>
                            <div className="candidate-grid">
                                <Item label={t("recruitment.applicationDetail.highestQualification", { defaultValue: "Highest Qualification" })}>{show(recruitmentValueLabel("qualification", application.highest_education))}</Item>
                                <Item label={t("recruitment.applicationDetail.institution", { defaultValue: "Institution" })}>{show(application.college)}</Item>
                                <Item label={t("recruitment.applicationDetail.yearOfPassing", { defaultValue: "Year of Passing" })}>{show(application.graduation_year)}</Item>
                                <Item label={t("recruitment.applicationDetail.percentageCgpa", { defaultValue: "Percentage / CGPA" })}>{show(application.cgpa_percentage)}</Item>
                            </div>
                        </section>

                        {isExperienced ? (
                            <section className="candidate-section">
                                <h3>{t("recruitment.applicationDetail.workExperience", { defaultValue: "Work Experience" })}</h3>
                                <div className="candidate-grid">
                                    <Item label={t("recruitment.applicationDetail.totalExperience", { defaultValue: "Total Experience" })}>{experienceText(application)}</Item>
                                    <Item label={t("recruitment.applications.noticePeriod", { defaultValue: "Notice Period" })}>{show(recruitmentValueLabel("noticePeriod", application.notice_period))}</Item>
                                    <Item label={t("recruitment.applicationDetail.currentCompany", { defaultValue: "Current / Last Company" })}>{show(application.current_company)}</Item>
                                    <Item label={t("recruitment.applicationDetail.currentDesignation", { defaultValue: "Current / Last Designation" })}>{show(application.current_designation)}</Item>
                                    <Item label={t("recruitment.applicationDetail.currentSalary", { defaultValue: "Current Monthly Salary" })}><span dir="ltr">{salaryText(application.current_salary, application.salary_currency, application.current_ctc)}</span></Item>
                                    <Item label={t("recruitment.applicationDetail.expectedSalary", { defaultValue: "Expected Monthly Salary" })}><span dir="ltr">{salaryText(application.expected_salary, application.salary_currency, application.expected_ctc)}</span></Item>
                                </div>
                                {history.length > 0 && (
                                    <table className="jobs-table mpr-log app-history">
                                        <thead>
                                            <tr>
                                                <th>{t("recruitment.applicationDetail.company", { defaultValue: "Company" })}</th>
                                                <th>{t("employeesList.table.designation", { defaultValue: "Designation" })}</th>
                                                <th>{t("recruitment.applicationDetail.from", { defaultValue: "From" })}</th>
                                                <th>{t("recruitment.applicationDetail.to", { defaultValue: "To" })}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((row, index) => (
                                                <tr key={`${row.company}-${index}`}>
                                                    <td>{row.company}</td>
                                                    <td>{row.designation}</td>
                                                    <td><span dir="ltr" className="ltr-text">{monthText(row.from)}</span></td>
                                                    <td><span dir={row.to ? "ltr" : undefined} className="ltr-text">{monthText(row.to)}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </section>
                        ) : (
                            <section className="candidate-section">
                                <h3>{t("recruitment.applicationDetail.fresherDetails", { defaultValue: "Fresher Details" })}</h3>
                                <div className="candidate-grid">
                                    <Item label={t("recruitment.applicationDetail.availableFrom", { defaultValue: "Available to Join From" })}><span dir="ltr" className="ltr-text">{formatDate(application.joining_date)}</span></Item>
                                    <Item label={t("recruitment.applicationDetail.internships", { defaultValue: "Internships / Projects" })} full>{show(application.internships_projects || application.project_description)}</Item>
                                    <Item label={t("recruitment.applicationDetail.certifications", { defaultValue: "Certifications" })} full>{show(application.certifications)}</Item>
                                </div>
                            </section>
                        )}

                        <section className="candidate-section">
                            <h3>{t("recruitment.applicationDetail.skillsCover", { defaultValue: "Skills & Cover Letter" })}</h3>
                            {skills.length ? (
                                <div className="app-skills">{skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
                            ) : (
                                <p className="mpr-muted">{t("recruitment.applicationDetail.noSkills", { defaultValue: "No skills listed." })}</p>
                            )}
                            <div className="candidate-grid app-cover">
                                <Item label={t("recruitment.applicationDetail.coverLetter", { defaultValue: "Cover Letter" })} full>{show(application.cover_letter)}</Item>
                            </div>
                        </section>

                        <section className="candidate-section">
                            <h3>{t("recruitment.applicationDetail.cvResume", { defaultValue: "CV / Resume" })}</h3>
                            <CvPanel application={application} actorId={actorId} />
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
                                    {application.actions.length === 0 && (
                                        <tr><td colSpan="4">{t("recruitment.log.noApplicationEntries", { defaultValue: "No tracking entries (application received before tracking was added)." })}</td></tr>
                                    )}
                                    {application.actions.map((action) => (
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
                    </>
                )}
            </div>
        </div>
    );
}

export default ApplicationDetail;
