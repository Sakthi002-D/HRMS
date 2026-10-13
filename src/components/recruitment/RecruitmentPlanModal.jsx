// HR: sourcing, agency, application deadline, recruiter and interview panel for a job opening.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "../../pages/hr/Recruitment.css";
import "./recruitment.css";
import { api, recruitmentValueLabel } from "./recruitmentApi";

function RecruitmentPlanModal({ job, meta, actorId, onClose, onSaved }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({
        sourcing: job.sourcing || "",
        agency_id: job.agency_id ? String(job.agency_id) : "",
        application_deadline: job.application_deadline || "",
        recruiter_employee_id: job.recruiter_employee_id || "",
        interview_panel: Array.isArray(job.interview_panel) ? job.interview_panel : [],
    });
    const [employees, setEmployees] = useState([]);
    const [panelSearch, setPanelSearch] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let ignore = false;
        api("/api/recruitment/employees")
            .then((list) => !ignore && setEmployees(list))
            .catch(() => !ignore && setEmployees([]));
        return () => { ignore = true; };
    }, []);

    const set = (name, value) => setForm((current) => ({ ...current, [name]: value }));
    const togglePanel = (employeeId) =>
        setForm((current) => ({
            ...current,
            interview_panel: current.interview_panel.includes(employeeId)
                ? current.interview_panel.filter((id) => id !== employeeId)
                : [...current.interview_panel, employeeId],
        }));

    const needsAgency = form.sourcing === "Agency" || form.sourcing === "Both";
    const search = panelSearch.trim().toLowerCase();
    const panelOptions = employees.filter(
        (employee) =>
            form.interview_panel.includes(employee.employee_id) ||
            !search ||
            `${employee.name} ${employee.employee_id} ${employee.department}`.toLowerCase().includes(search)
    );

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        try {
            const saved = await api(`/api/jobs/${job.id}/recruitment-plan`, {
                method: "PUT",
                body: { ...form, agency_id: needsAgency ? form.agency_id : null, actor_id: actorId },
            });
            onSaved(saved);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="candidate-modal-overlay" onClick={onClose}>
            <div className="candidate-modal mpr-plan-modal" onClick={(event) => event.stopPropagation()}>
                <div className="candidate-modal-header">
                    <div>
                        <h2>{t("recruitment.plan.title", { defaultValue: "Recruitment Plan" })}</h2>
                        <span>
                            <span dir="ltr" className="ltr-text">{job.job_id}</span> · {job.title} · {job.mpr_no
                                ? <span dir="ltr" className="ltr-text">MPR {job.mpr_no}</span>
                                : t("recruitment.jobs.noMprLegacy", { defaultValue: "No MPR (legacy)" })}
                        </span>
                    </div>
                    <button type="button" className="candidate-modal-close" onClick={onClose}>×</button>
                </div>

                <form onSubmit={save}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label>{t("recruitment.plan.sourcing", { defaultValue: "Sourcing" })} *</label>
                            <select value={form.sourcing} onChange={(event) => set("sourcing", event.target.value)} required>
                                <option value="">{t("recruitment.plan.selectSourcing", { defaultValue: "Select Sourcing" })}</option>
                                {meta.sourcingOptions.map((option) => <option key={option} value={option}>{recruitmentValueLabel("sourcing", option)}</option>)}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>{t("recruitment.plan.agency", { defaultValue: "Recruitment Agency" })} {needsAgency ? "*" : ""}</label>
                            <select
                                value={form.agency_id}
                                onChange={(event) => set("agency_id", event.target.value)}
                                required={needsAgency}
                                disabled={!needsAgency}
                            >
                                <option value="">{meta.agencies.length
                                    ? t("recruitment.plan.selectAgency", { defaultValue: "Select Agency" })
                                    : t("recruitment.plan.noAgencies", { defaultValue: "No agencies — add one in Settings → Recruitment Masters" })}</option>
                                {meta.agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>{t("recruitment.fields.applicationDeadline", { defaultValue: "Application Deadline" })} *</label>
                            <input
                                type="date"
                                min={meta.today}
                                value={form.application_deadline}
                                onChange={(event) => set("application_deadline", event.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>{t("recruitment.plan.recruiter", { defaultValue: "Assigned Recruiter" })}</label>
                            <select value={form.recruiter_employee_id} onChange={(event) => set("recruiter_employee_id", event.target.value)}>
                                <option value="">{t("recruitment.plan.selectRecruiter", { defaultValue: "Select Recruiter" })}</option>
                                {employees.map((employee) => (
                                    <option key={employee.employee_id} value={employee.employee_id}>
                                        {employee.name} ({employee.employee_id})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-group mpr-inline">
                        <label>{t("recruitment.plan.interviewPanel", { number: form.interview_panel.length, defaultValue: "Interview Panel ({{number}} selected)" })}</label>
                        <input
                            type="search"
                            value={panelSearch}
                            onChange={(event) => setPanelSearch(event.target.value)}
                            placeholder={t("employeesList.searchPlaceholder", { defaultValue: "Search employees" })}
                        />
                        <div className="mpr-panel-list">
                            {panelOptions.map((employee) => (
                                <label key={employee.employee_id} className={form.interview_panel.includes(employee.employee_id) ? "checked" : ""}>
                                    <input
                                        type="checkbox"
                                        checked={form.interview_panel.includes(employee.employee_id)}
                                        onChange={() => togglePanel(employee.employee_id)}
                                    />
                                    {employee.name} <small>{employee.employee_id} · {employee.department}</small>
                                </label>
                            ))}
                        </div>
                    </div>

                    <p className="mpr-muted">
                        {t("recruitment.plan.note", { defaultValue: "Saving the plan moves an Open job to Recruitment In Progress. After the deadline, new applications are no longer accepted." })}
                    </p>
                    {error && <p className="mpr-form-error">{error}</p>}

                    <div className="form-actions">
                        <button type="button" className="cancel-btn" onClick={onClose}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
                        <button type="submit" className="save-job-btn" disabled={saving}>
                            {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("recruitment.plan.save", { defaultValue: "Save Plan" })}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default RecruitmentPlanModal;
