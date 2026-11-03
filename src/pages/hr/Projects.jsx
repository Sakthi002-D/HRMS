import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Check, FolderKanban, Pencil, Plus, Search, Trash2, UserPlus, Users, X } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import DatePicker from "../../components/layout/common/DatePicker";
import { useConfirm } from "../../components/common/dialog/dialogContext";
import { PROJECT_STATUSES, formatProjectDate, isCurrentAssignment, projectStatusLabel, projectsRequest, statusTone, todayKey } from "./projectsApi";
import "./EmployeeEditPage.css";
import "./Projects.css";

const EMPTY_PROJECT = { name: "", client: "", status: "Active", start_date: "", end_date: "", description: "" };

function Projects() {
    const { t } = useTranslation();
    const [projects, setProjects] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [projectForm, setProjectForm] = useState(null);
    const [team, setTeam] = useState([]);
    const [assignForm, setAssignForm] = useState({ employee_id: "", role: "", assigned_from: todayKey(), assigned_to: "" });
    const [editingAssignment, setEditingAssignment] = useState(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [message, setMessage] = useState({ text: "", error: false });
    const [busy, setBusy] = useState(false);
    const confirm = useConfirm();

    const showError = (error) => setMessage({ text: error.message, error: true });
    const showDone = (text) => setMessage({ text, error: false });

    const loadProjects = () => projectsRequest("/api/projects").then(setProjects).catch((error) => {
        setProjects([]);
        showError(error);
    });

    useEffect(() => {
        projectsRequest("/api/projects").then(setProjects).catch((error) => {
            setProjects([]);
            setMessage({ text: error.message, error: true });
        });
        projectsRequest("/api/employees")
            .then((rows) => setEmployees(rows
                .filter((row) => String(row.role || "employee").toLowerCase() !== "hr")
                .sort((a, b) => String(a.name).localeCompare(String(b.name)))))
            .catch(() => setEmployees([]));
    }, []);

    useEffect(() => {
        if (!selectedId) return undefined;
        let ignore = false;
        projectsRequest(`/api/projects/${selectedId}/assignments`)
            .then((rows) => !ignore && setTeam(rows))
            .catch((error) => !ignore && showError(error));
        return () => { ignore = true; };
    }, [selectedId]);

    const selected = projects?.find((project) => project.id === selectedId) || null;
    const statuses = useMemo(() => [...new Set([...PROJECT_STATUSES, ...(projects || []).map((project) => project.status)])], [projects]);
    const visibleProjects = (projects || []).filter((project) => {
        const query = search.trim().toLowerCase();
        const matchesSearch = !query || [project.name, project.client].some((value) => String(value || "").toLowerCase().includes(query));
        return matchesSearch && (statusFilter === "all" || project.status === statusFilter);
    });
    const count = (status) => (projects || []).filter((project) => statusTone(project.status) === statusTone(status)).length;

    const selectProject = (id) => {
        setSelectedId(id);
        setProjectForm(null);
        setEditingAssignment(null);
        setTeam([]);
        setMessage({ text: "", error: false });
    };

    const saveProject = async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
            const saved = await projectsRequest(projectForm.id ? `/api/projects/${projectForm.id}` : "/api/projects", {
                method: projectForm.id ? "PUT" : "POST",
                body: projectForm,
            });
            await loadProjects();
            setSelectedId(saved.id);
            setProjectForm(null);
            showDone(t("projects.saved", { defaultValue: "Project saved" }));
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    };

    const deleteProject = async () => {
        const confirmed = await confirm({
            variant: "danger",
            title: t("projects.deleteTitle", { defaultValue: "Delete Project" }),
            message: t("projects.confirmDelete", { name: selected.name, defaultValue: "Delete {{name}}? Its team assignments are removed too." }),
            confirmText: t("projects.deleteButton", { defaultValue: "Delete" }),
            cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
        });
        if (!confirmed) return;
        try {
            await projectsRequest(`/api/projects/${selected.id}`, { method: "DELETE" });
            setSelectedId(null);
            await loadProjects();
            showDone(t("projects.deleted", { defaultValue: "Project deleted" }));
        } catch (error) {
            showError(error);
        }
    };

    // Team changes return the updated team; the list's member counts are refreshed as well
    const changeTeam = async (path, options, doneText) => {
        setBusy(true);
        try {
            setTeam(await projectsRequest(`/api/projects/${selected.id}/assignments${path}`, options));
            await loadProjects();
            showDone(doneText);
            return true;
        } catch (error) {
            showError(error);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const assignEmployee = async (event) => {
        event.preventDefault();
        const done = await changeTeam("", { method: "POST", body: assignForm }, t("projects.assigned", { defaultValue: "Employee added to the project" }));
        if (done) setAssignForm((current) => ({ ...current, employee_id: "", role: "", assigned_to: "" }));
    };

    const saveAssignment = async (event) => {
        event.preventDefault();
        const done = await changeTeam(`/${editingAssignment.id}`, { method: "PUT", body: editingAssignment }, t("projects.assignmentSaved", { defaultValue: "Assignment updated" }));
        if (done) setEditingAssignment(null);
    };

    const removeAssignment = async (row) => {
        const confirmed = await confirm({
            variant: "danger",
            title: t("projects.removeTitle", { defaultValue: "Remove from Project" }),
            message: t("projects.confirmRemove", { name: row.employee_name, defaultValue: "Remove {{name}} from this project?" }),
            confirmText: t("projects.removeButton", { defaultValue: "Remove" }),
            cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
        });
        if (!confirmed) return;
        changeTeam(`/${row.id}`, { method: "DELETE" }, t("projects.removed", { defaultValue: "Employee removed from the project" }));
    };

    const setProjectField = (name, value) => setProjectForm((current) => ({ ...current, [name]: value }));
    const employeeName = (id) => employees.find((employee) => String(employee.employee_id) === String(id))?.name;

    const renderProjectForm = () => (
        <form className="prj-card prj-form" onSubmit={saveProject}>
            <h2>{projectForm.id ? t("projects.editProject", { defaultValue: "Edit project" }) : t("projects.newProject", { defaultValue: "New project" })}</h2>
            <div className="eep-grid">
                <label>
                    <span>{t("projects.fields.name", { defaultValue: "Project name" })}</span>
                    <input dir="auto" required maxLength={120} value={projectForm.name} onChange={({ target }) => setProjectField("name", target.value)} />
                </label>
                <label>
                    <span>{t("projects.fields.client", { defaultValue: "Client" })}</span>
                    <input dir="auto" value={projectForm.client || ""} onChange={({ target }) => setProjectField("client", target.value)} />
                </label>
                <label>
                    <span>{t("projects.fields.status", { defaultValue: "Status" })}</span>
                    <input list="prj-status-options" dir="auto" maxLength={40} value={projectForm.status} onChange={({ target }) => setProjectField("status", target.value)} />
                    <datalist id="prj-status-options">
                        {statuses.map((status) => <option key={status} value={status}>{projectStatusLabel(t, status)}</option>)}
                    </datalist>
                </label>
                <span aria-hidden="true" />
                <label>
                    <span>{t("projects.fields.start", { defaultValue: "Start date" })}</span>
                    <DatePicker value={projectForm.start_date || ""} onChange={(value) => setProjectField("start_date", value)} />
                </label>
                <label>
                    <span>{t("projects.fields.end", { defaultValue: "End date" })}</span>
                    <DatePicker value={projectForm.end_date || ""} onChange={(value) => setProjectField("end_date", value)} />
                </label>
                <label className="eep-wide">
                    <span>{t("projects.fields.description", { defaultValue: "Description" })}</span>
                    <textarea dir="auto" rows={4} value={projectForm.description || ""} onChange={({ target }) => setProjectField("description", target.value)} />
                </label>
            </div>
            <footer className="eep-actions">
                <button type="button" className="eep-cancel" onClick={() => setProjectForm(null)}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
                <button type="submit" className="eep-save" disabled={busy}>{busy ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("profileEdit.save", { defaultValue: "Save Changes" })}</button>
            </footer>
        </form>
    );

    const renderDetail = () => (
        <div className="prj-detail">
            <section className="prj-card">
                <div className="prj-detail-head">
                    <div>
                        <span className={`prj-status prj-status--${statusTone(selected.status)}`}>{projectStatusLabel(t, selected.status)}</span>
                        <h2 dir="auto">{selected.name}</h2>
                        {selected.client && <p dir="auto">{selected.client}</p>}
                    </div>
                    <div className="prj-icon-actions">
                        <button type="button" onClick={() => setProjectForm({ ...EMPTY_PROJECT, ...selected })} aria-label={t("projects.editProject", { defaultValue: "Edit project" })}><Pencil size={16} /></button>
                        <button type="button" className="danger" onClick={deleteProject} aria-label={t("projects.deleteProject", { defaultValue: "Delete project" })}><Trash2 size={16} /></button>
                    </div>
                </div>
                <dl className="prj-facts">
                    <div><dt>{t("projects.fields.start", { defaultValue: "Start date" })}</dt><dd dir="ltr">{formatProjectDate(selected.start_date) || "-"}</dd></div>
                    <div><dt>{t("projects.fields.end", { defaultValue: "End date" })}</dt><dd dir="ltr">{formatProjectDate(selected.end_date) || "-"}</dd></div>
                    <div><dt>{t("projects.team", { defaultValue: "Team" })}</dt><dd>{selected.active_members}</dd></div>
                </dl>
                {selected.description && <p className="prj-description" dir="auto">{selected.description}</p>}
            </section>

            <section className="prj-card">
                <h2 className="prj-section-title"><Users size={18} aria-hidden="true" />{t("projects.team", { defaultValue: "Team" })}</h2>

                <form className="prj-assign" onSubmit={assignEmployee}>
                    <label>
                        <span>{t("projects.fields.employee", { defaultValue: "Employee" })}</span>
                        <input
                            list="prj-employee-options"
                            dir="ltr"
                            required
                            placeholder={t("projects.employeePlaceholder", { defaultValue: "Type a name or ID" })}
                            value={assignForm.employee_id}
                            onChange={({ target }) => setAssignForm((current) => ({ ...current, employee_id: target.value }))}
                        />
                        <datalist id="prj-employee-options">
                            {employees.map((employee) => <option key={employee.employee_id} value={employee.employee_id}>{employee.name}</option>)}
                        </datalist>
                        {assignForm.employee_id && <small dir="auto">{employeeName(assignForm.employee_id) || t("projects.unknownEmployee", { defaultValue: "No employee with this ID" })}</small>}
                    </label>
                    <label>
                        <span>{t("projects.fields.role", { defaultValue: "Role" })}</span>
                        <input dir="auto" maxLength={80} value={assignForm.role} onChange={({ target }) => setAssignForm((current) => ({ ...current, role: target.value }))} />
                    </label>
                    <label>
                        <span>{t("projects.fields.from", { defaultValue: "From" })}</span>
                        <DatePicker value={assignForm.assigned_from} onChange={(value) => setAssignForm((current) => ({ ...current, assigned_from: value }))} />
                    </label>
                    <label>
                        <span>{t("projects.fields.to", { defaultValue: "To (optional)" })}</span>
                        <DatePicker value={assignForm.assigned_to} onChange={(value) => setAssignForm((current) => ({ ...current, assigned_to: value }))} />
                    </label>
                    <button type="submit" className="eep-save prj-assign-button" disabled={busy || !employeeName(assignForm.employee_id) || !assignForm.assigned_from}>
                        <UserPlus size={16} aria-hidden="true" />{t("projects.assign", { defaultValue: "Add" })}
                    </button>
                </form>

                {team.length === 0 ? (
                    <p className="prj-empty">{t("projects.noTeam", { defaultValue: "No one is assigned to this project yet." })}</p>
                ) : (
                    <ul className="prj-team">
                        {team.map((row) => (editingAssignment?.id === row.id ? (
                            <li key={row.id} className="editing">
                                <form className="prj-assign prj-assign--edit" onSubmit={saveAssignment}>
                                    <strong dir="auto">{row.employee_name}</strong>
                                    <label>
                                        <span>{t("projects.fields.role", { defaultValue: "Role" })}</span>
                                        <input dir="auto" maxLength={80} value={editingAssignment.role || ""} onChange={({ target }) => setEditingAssignment((current) => ({ ...current, role: target.value }))} />
                                    </label>
                                    <label>
                                        <span>{t("projects.fields.from", { defaultValue: "From" })}</span>
                                        <DatePicker value={editingAssignment.assigned_from} onChange={(value) => setEditingAssignment((current) => ({ ...current, assigned_from: value }))} />
                                    </label>
                                    <label>
                                        <span>{t("projects.fields.to", { defaultValue: "To (optional)" })}</span>
                                        <DatePicker value={editingAssignment.assigned_to || ""} onChange={(value) => setEditingAssignment((current) => ({ ...current, assigned_to: value }))} />
                                    </label>
                                    <div className="prj-icon-actions">
                                        <button type="submit" disabled={busy} aria-label={t("profileEdit.save", { defaultValue: "Save Changes" })}><Check size={16} /></button>
                                        <button type="button" onClick={() => setEditingAssignment(null)} aria-label={t("profileEdit.cancel", { defaultValue: "Cancel" })}><X size={16} /></button>
                                    </div>
                                </form>
                            </li>
                        ) : (
                            <li key={row.id} className={isCurrentAssignment(row) ? "" : "ended"}>
                                <span className="prj-avatar" aria-hidden="true">{String(row.employee_name || "?").split(" ").map((word) => word.charAt(0)).join("").slice(0, 2).toUpperCase()}</span>
                                <div className="prj-member">
                                    <strong dir="auto">{row.employee_name}</strong>
                                    <span><bdi dir="ltr">{row.employee_id}</bdi>{row.role && <> · <bdi>{row.role}</bdi></>}</span>
                                </div>
                                <span className="prj-period" dir="ltr">
                                    <CalendarDays size={14} aria-hidden="true" />
                                    {formatProjectDate(row.assigned_from)} → {row.assigned_to ? formatProjectDate(row.assigned_to) : t("projects.ongoing", { defaultValue: "Ongoing" })}
                                </span>
                                <div className="prj-icon-actions">
                                    <button type="button" onClick={() => setEditingAssignment({ ...row, assigned_to: row.assigned_to || "" })} aria-label={t("projects.editAssignment", { defaultValue: "Edit assignment" })}><Pencil size={15} /></button>
                                    <button type="button" className="danger" onClick={() => removeAssignment(row)} aria-label={t("projects.removeAssignment", { defaultValue: "Remove from project" })}><Trash2 size={15} /></button>
                                </div>
                            </li>
                        )))}
                    </ul>
                )}
            </section>
        </div>
    );

    return (
        <DashboardLayout>
            <div className="prj-page">
                <header className="prj-hero">
                    <div>
                        <span className="prj-kicker">{t("projects.kicker", { defaultValue: "Workforce" })}</span>
                        <h1>{t("projects.title", { defaultValue: "Projects" })}</h1>
                        <p>{t("projects.subtitle", { defaultValue: "Create projects and choose who works on them, and for which period." })}</p>
                    </div>
                    <div className="prj-hero-stats">
                        <div><strong>{projects?.length ?? 0}</strong><span>{t("projects.total", { defaultValue: "Projects" })}</span></div>
                        <div><strong>{count("Active")}</strong><span>{projectStatusLabel(t, "Active")}</span></div>
                        <div><strong>{count("On Hold")}</strong><span>{projectStatusLabel(t, "On Hold")}</span></div>
                        <div><strong>{count("Completed")}</strong><span>{projectStatusLabel(t, "Completed")}</span></div>
                    </div>
                </header>

                {message.text && <p className={message.error ? "prj-message error" : "prj-message"} role={message.error ? "alert" : "status"}>{message.text}</p>}

                <div className="prj-toolbar">
                    <label className="prj-search">
                        <Search size={16} aria-hidden="true" />
                        <input
                            value={search}
                            onChange={({ target }) => setSearch(target.value)}
                            placeholder={t("projects.search", { defaultValue: "Search projects or clients" })}
                            aria-label={t("projects.search", { defaultValue: "Search projects or clients" })}
                        />
                    </label>
                    <select value={statusFilter} onChange={({ target }) => setStatusFilter(target.value)} aria-label={t("projects.fields.status", { defaultValue: "Status" })}>
                        <option value="all">{t("projects.allStatuses", { defaultValue: "All statuses" })}</option>
                        {statuses.map((status) => <option key={status} value={status}>{projectStatusLabel(t, status)}</option>)}
                    </select>
                    <button type="button" className="eep-save prj-new" onClick={() => { setSelectedId(null); setProjectForm(EMPTY_PROJECT); setMessage({ text: "", error: false }); }}>
                        <Plus size={16} aria-hidden="true" />{t("projects.newProject", { defaultValue: "New project" })}
                    </button>
                </div>

                <div className="prj-layout">
                    <div className="prj-list">
                        {projects === null && <p className="prj-empty">{t("projects.loading", { defaultValue: "Loading projects..." })}</p>}
                        {projects !== null && visibleProjects.length === 0 && (
                            <p className="prj-empty">{projects.length ? t("projects.noMatch", { defaultValue: "No projects match your search." }) : t("projects.none", { defaultValue: "No projects yet. Create the first one." })}</p>
                        )}
                        {visibleProjects.map((project) => (
                            <button type="button" key={project.id} className={`prj-item${project.id === selectedId ? " active" : ""}`} onClick={() => selectProject(project.id)}>
                                <span className="prj-item-icon" aria-hidden="true"><FolderKanban size={18} /></span>
                                <span className="prj-item-main">
                                    <strong dir="auto">{project.name}</strong>
                                    <small dir="auto">{project.client || t("projects.noClient", { defaultValue: "No client" })}</small>
                                </span>
                                <span className="prj-item-side">
                                    <span className={`prj-status prj-status--${statusTone(project.status)}`}>{projectStatusLabel(t, project.status)}</span>
                                    <small><Users size={13} aria-hidden="true" /> {project.active_members}</small>
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="prj-side">
                        {projectForm ? renderProjectForm() : selected ? renderDetail() : (
                            <div className="prj-card prj-placeholder">
                                <FolderKanban size={34} aria-hidden="true" />
                                <strong>{t("projects.pickTitle", { defaultValue: "Select a project" })}</strong>
                                <span>{t("projects.pickHint", { defaultValue: "See its details and team, or create a new project." })}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

export default Projects;
