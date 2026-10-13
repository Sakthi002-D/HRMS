// Settings → Approval Workflows: MPR approval steps, COO/CTO by department,
// Job ID department codes and who holds each workflow role.
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, getSessionEmployeeId, recruitmentRoleLabel, recruitmentValueLabel } from "../../../components/recruitment/recruitmentApi";
import { ResignationWorkflowSettings } from "./ResignationSettings";
import "./RecruitmentSettings.css";

const REQUEST_TYPES = ["Replacement", "New Position"];

function ApprovalWorkflowSettings() {
    const { t } = useTranslation();
    const actorId = getSessionEmployeeId();
    const [data, setData] = useState(null);
    const [draft, setDraft] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [assignments, setAssignments] = useState({ assignments: [], assignableRoles: [], departmentScopedRoles: [] });
    const [newAssignment, setNewAssignment] = useState({ role_key: "", department: "", employee_id: "" });
    const [message, setMessage] = useState({ text: "", error: false });
    const [saving, setSaving] = useState(false);

    const loadAssignments = () =>
        api("/api/recruitment/role-assignments").then(setAssignments).catch((err) => setMessage({ text: err.message, error: true }));

    useEffect(() => {
        let ignore = false;
        Promise.all([
            api("/api/recruitment/settings"),
            api("/api/recruitment/employees"),
            api(`/api/recruitment/meta?employee_id=${encodeURIComponent(actorId || "")}`),
            api("/api/recruitment/role-assignments"),
        ])
            .then(([settingsData, employeeList, meta, assignmentData]) => {
                if (ignore) return;
                setData(settingsData);
                setDraft(settingsData.settings);
                setEmployees(employeeList);
                setDepartments(meta.departments);
                setAssignments(assignmentData);
            })
            .catch((err) => !ignore && setMessage({ text: err.message, error: true }));
        return () => { ignore = true; };
    }, [actorId]);

    if (!draft) return <div className="rs-panel">{message.text ? <p className="rs-error">{message.text}</p> : t("settings.workflows.loading", { defaultValue: "Loading approval workflows..." })}</div>;

    const labels = data.roleLabels;
    const roleLabel = (role) => recruitmentRoleLabel(role, labels[role] || role);
    const scoped = assignments.departmentScopedRoles;

    const updateSteps = (type, steps) => setDraft((current) => ({ ...current, workflows: { ...current.workflows, [type]: steps } }));
    const moveStep = (type, index, offset) => {
        const steps = [...draft.workflows[type]];
        const target = index + offset;
        if (target < 0 || target >= steps.length) return;
        [steps[index], steps[target]] = [steps[target], steps[index]];
        updateSteps(type, steps);
    };

    const saveSettings = async () => {
        setSaving(true);
        setMessage({ text: "", error: false });
        try {
            const result = await api("/api/recruitment/settings", {
                method: "PUT",
                body: {
                    actor_id: actorId,
                    settings: {
                        workflows: draft.workflows,
                        execByDepartment: draft.execByDepartment,
                        defaultExec: draft.defaultExec,
                        departmentCodes: draft.departmentCodes,
                    },
                },
            });
            setDraft(result.settings);
            setMessage({ text: t("settings.workflows.saved", { defaultValue: "Approval workflows saved. New submissions use these steps; MPRs already in approval keep theirs." }), error: false });
        } catch (err) {
            setMessage({ text: err.message, error: true });
        } finally {
            setSaving(false);
        }
    };

    const addAssignment = async () => {
        setMessage({ text: "", error: false });
        try {
            await api("/api/recruitment/role-assignments", { method: "POST", body: { ...newAssignment, actor_id: actorId } });
            setNewAssignment({ role_key: newAssignment.role_key, department: "", employee_id: "" });
            await loadAssignments();
        } catch (err) {
            setMessage({ text: err.message, error: true });
        }
    };

    const removeAssignment = async (id) => {
        try {
            await api(`/api/recruitment/role-assignments/${id}?actor_id=${encodeURIComponent(actorId || "")}`, { method: "DELETE" });
            await loadAssignments();
        } catch (err) {
            setMessage({ text: err.message, error: true });
        }
    };

    return (
        <div className="rs-panel">
            {message.text && <p className={message.error ? "rs-error" : "rs-success"}>{message.text}</p>}

            <section className="rs-section">
                <h3>{t("settings.workflows.mprSteps", { defaultValue: "Manpower Request approval steps" })}</h3>
                <p>{t("settings.workflows.mprStepsHint", { defaultValue: "Approvers act in this order. \"COO/CTO\" is picked per department below." })}</p>
                <div className="rs-workflows">
                    {REQUEST_TYPES.map((type) => (
                        <div className="rs-workflow" key={type}>
                            <h4>{recruitmentValueLabel("requestType", type)}</h4>
                            <ol>
                                {draft.workflows[type].map((step, index) => (
                                    <li key={`${step}-${index}`}>
                                        <span>{index + 1}. {roleLabel(step)}</span>
                                        <div>
                                            <button type="button" aria-label={t("settings.workflows.moveUp", { defaultValue: "Move up" })} onClick={() => moveStep(type, index, -1)} disabled={index === 0}><ArrowUp size={14} /></button>
                                            <button type="button" aria-label={t("settings.workflows.moveDown", { defaultValue: "Move down" })} onClick={() => moveStep(type, index, 1)} disabled={index === draft.workflows[type].length - 1}><ArrowDown size={14} /></button>
                                            <button
                                                type="button"
                                                aria-label={t("settings.workflows.removeStep", { defaultValue: "Remove step" })}
                                                onClick={() => updateSteps(type, draft.workflows[type].filter((_, i) => i !== index))}
                                                disabled={draft.workflows[type].length === 1}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                            <select
                                value=""
                                onChange={(event) => event.target.value && updateSteps(type, [...draft.workflows[type], event.target.value])}
                            >
                                <option value="">{t("settings.workflows.addStep", { defaultValue: "+ Add approver step" })}</option>
                                {data.stepRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
            </section>

            <section className="rs-section">
                <h3>{t("settings.workflows.execByDepartment", { defaultValue: "COO / CTO by department" })}</h3>
                <div className="rs-grid">
                    {departments.map((department) => (
                        <label className="settings-field" key={department}>
                            <span>{department}</span>
                            <select
                                value={Object.entries(draft.execByDepartment || {}).find(([name]) => name.toLowerCase() === department.toLowerCase())?.[1] || ""}
                                onChange={(event) => {
                                    const next = Object.fromEntries(Object.entries(draft.execByDepartment || {}).filter(([name]) => name.toLowerCase() !== department.toLowerCase()));
                                    if (event.target.value) next[department] = event.target.value;
                                    setDraft((current) => ({ ...current, execByDepartment: next }));
                                }}
                            >
                                <option value="">{t("settings.workflows.defaultExec", { exec: roleLabel(draft.defaultExec), defaultValue: "Default ({{exec}})" })}</option>
                                <option value="COO">{roleLabel("COO")}</option>
                                <option value="CTO">{roleLabel("CTO")}</option>
                            </select>
                        </label>
                    ))}
                    <label className="settings-field">
                        <span>{t("settings.workflows.defaultForOthers", { defaultValue: "Default for other departments" })}</span>
                        <select value={draft.defaultExec} onChange={(event) => setDraft((current) => ({ ...current, defaultExec: event.target.value }))}>
                            <option value="COO">{roleLabel("COO")}</option>
                            <option value="CTO">{roleLabel("CTO")}</option>
                        </select>
                    </label>
                </div>
            </section>

            <section className="rs-section">
                <h3>{t("settings.workflows.jobCodes", { defaultValue: "Job ID department codes" })}</h3>
                <p>{t("settings.workflows.jobCodesHint", { defaultValue: "New job openings get IDs like IT001, FIN001. Existing JOB001 / JOB002 are unchanged." })}</p>
                <div className="rs-grid">
                    {departments.map((department) => (
                        <label className="settings-field" key={department}>
                            <span>{department}</span>
                            <input
                                value={Object.entries(draft.departmentCodes || {}).find(([name]) => name.toLowerCase() === department.toLowerCase())?.[1] || ""}
                                placeholder={department.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()}
                                maxLength={5}
                                onChange={(event) => {
                                    const code = event.target.value.toUpperCase().replace(/[^A-Z]/g, "");
                                    const next = Object.fromEntries(Object.entries(draft.departmentCodes || {}).filter(([name]) => name.toLowerCase() !== department.toLowerCase()));
                                    if (code) next[department] = code;
                                    setDraft((current) => ({ ...current, departmentCodes: next }));
                                }}
                            />
                        </label>
                    ))}
                </div>
            </section>

            <div className="rs-actions">
                <button type="button" className="settings-save-button" onClick={saveSettings} disabled={saving}>
                    {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("settings.workflows.save", { defaultValue: "Save Workflows" })}
                </button>
            </div>

            <ResignationWorkflowSettings />

            <section className="rs-section">
                <h3>{t("settings.workflows.whoHolds", { defaultValue: "Who holds each role" })}</h3>
                <p>
                    {t("settings.workflows.whoHoldsHint", { defaultValue: "Coordinators raise MPRs for their department; approvers act from the Employee portal (Manpower Requests → My Approvals). Line Managers approve resignations for their department (Resignation → My Approvals); Payroll is notified when HR accepts one. HR portal users are always HR approvers." })}
                </p>
                <div className="rs-add-row">
                    <select value={newAssignment.role_key} onChange={(event) => setNewAssignment({ ...newAssignment, role_key: event.target.value })}>
                        <option value="">{t("settings.workflows.role", { defaultValue: "Role" })}</option>
                        {assignments.assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                    </select>
                    {scoped.includes(newAssignment.role_key) && (
                        <select value={newAssignment.department} onChange={(event) => setNewAssignment({ ...newAssignment, department: event.target.value })}>
                            <option value="">{t("reports.common.department", { defaultValue: "Department" })}</option>
                            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                        </select>
                    )}
                    <select value={newAssignment.employee_id} onChange={(event) => setNewAssignment({ ...newAssignment, employee_id: event.target.value })}>
                        <option value="">{t("settings.workflows.employee", { defaultValue: "Employee" })}</option>
                        {employees.map((employee) => (
                            <option key={employee.employee_id} value={employee.employee_id}>{employee.name} ({employee.employee_id}) – {employee.department}</option>
                        ))}
                    </select>
                    <button type="button" className="settings-save-button" onClick={addAssignment}><Plus size={14} /> {t("settings.workflows.assign", { defaultValue: "Assign" })}</button>
                </div>
                <table className="rs-table">
                    <thead><tr><th>{t("settings.workflows.role", { defaultValue: "Role" })}</th><th>{t("reports.common.department", { defaultValue: "Department" })}</th><th>{t("settings.workflows.employee", { defaultValue: "Employee" })}</th><th /></tr></thead>
                    <tbody>
                        {assignments.assignments.length === 0 && <tr><td colSpan="4">{t("settings.workflows.noRoles", { defaultValue: "No roles assigned yet." })}</td></tr>}
                        {assignments.assignments.map((row) => (
                            <tr key={row.id}>
                                <td>{roleLabel(row.role_key)}</td>
                                <td>{row.department || t("settings.workflows.allDepartments", { defaultValue: "All" })}</td>
                                <td>{row.employee_name} ({row.employee_id})</td>
                                <td><button type="button" className="rs-icon-button" aria-label={t("settings.common.remove", { defaultValue: "Remove" })} onClick={() => removeAssignment(row.id)}><Trash2 size={14} /></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}

export default ApprovalWorkflowSettings;
