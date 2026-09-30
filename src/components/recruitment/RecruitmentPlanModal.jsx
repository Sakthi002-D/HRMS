// HR: sourcing, agency, application deadline, recruiter and interview panel for a job opening.
import { useEffect, useState } from "react";
import "../../pages/hr/Recruitment.css";
import "./recruitment.css";
import { api } from "./recruitmentApi";

function RecruitmentPlanModal({ job, meta, actorId, onClose, onSaved }) {
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
                        <h2>Recruitment Plan</h2>
                        <span>
                            {job.job_id} · {job.title} · {job.mpr_no ? `MPR ${job.mpr_no}` : "No MPR (legacy)"}
                        </span>
                    </div>
                    <button type="button" className="candidate-modal-close" onClick={onClose}>×</button>
                </div>

                <form onSubmit={save}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label>Sourcing *</label>
                            <select value={form.sourcing} onChange={(event) => set("sourcing", event.target.value)} required>
                                <option value="">Select Sourcing</option>
                                {meta.sourcingOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Recruitment Agency {needsAgency ? "*" : ""}</label>
                            <select
                                value={form.agency_id}
                                onChange={(event) => set("agency_id", event.target.value)}
                                required={needsAgency}
                                disabled={!needsAgency}
                            >
                                <option value="">{meta.agencies.length ? "Select Agency" : "No agencies — add one in Settings → Recruitment Masters"}</option>
                                {meta.agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Application Deadline *</label>
                            <input
                                type="date"
                                min={meta.today}
                                value={form.application_deadline}
                                onChange={(event) => set("application_deadline", event.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Assigned Recruiter</label>
                            <select value={form.recruiter_employee_id} onChange={(event) => set("recruiter_employee_id", event.target.value)}>
                                <option value="">Select Recruiter</option>
                                {employees.map((employee) => (
                                    <option key={employee.employee_id} value={employee.employee_id}>
                                        {employee.name} ({employee.employee_id})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-group mpr-inline">
                        <label>Interview Panel ({form.interview_panel.length} selected)</label>
                        <input
                            type="search"
                            value={panelSearch}
                            onChange={(event) => setPanelSearch(event.target.value)}
                            placeholder="Search employees"
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
                        Saving the plan moves an Open job to Recruitment In Progress. After the deadline, new applications are no longer accepted.
                    </p>
                    {error && <p className="mpr-form-error">{error}</p>}

                    <div className="form-actions">
                        <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
                        <button type="submit" className="save-job-btn" disabled={saving}>
                            {saving ? "Saving..." : "Save Plan"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default RecruitmentPlanModal;
