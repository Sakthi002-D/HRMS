import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderKanban } from "lucide-react";
import "./Projects.css";
import { formatProjectDate, isCurrentAssignment, projectStatusLabel, projectsRequest, statusTone } from "./projectsApi";

// Projects the employee is assigned to, shown on the HR employee page and the employee's own profile
function EmployeeProjectList({ employeeId }) {
    const { t } = useTranslation();
    const [projects, setProjects] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let ignore = false;
        projectsRequest(`/api/employees/${encodeURIComponent(employeeId)}/projects`)
            .then((rows) => !ignore && setProjects(rows))
            .catch((loadError) => {
                if (ignore) return;
                setProjects([]);
                setError(loadError.message);
            });
        return () => { ignore = true; };
    }, [employeeId]);

    if (projects === null) return <p className="epl-empty">{t("projects.loading", { defaultValue: "Loading projects..." })}</p>;
    if (error) return <p className="epl-empty" role="alert">{error}</p>;
    if (projects.length === 0) {
        return <p className="epl-empty">{t("projects.noneForEmployee", { defaultValue: "Not assigned to any project yet." })}</p>;
    }

    return (
        <ul className="epl-list" role="tabpanel">
            {projects.map((project) => {
                const current = isCurrentAssignment(project);
                return (
                    <li key={project.id} className={current ? "" : "ended"}>
                        <span className="epl-icon" aria-hidden="true"><FolderKanban size={18} /></span>
                        <div className="epl-main">
                            <strong dir="auto">{project.name}</strong>
                            <span>
                                {project.role ? <bdi>{project.role}</bdi> : t("projects.noRole", { defaultValue: "Team member" })}
                                {project.client && <> · <bdi>{project.client}</bdi></>}
                            </span>
                            <small dir="ltr">
                                {formatProjectDate(project.assigned_from)} → {project.assigned_to ? formatProjectDate(project.assigned_to) : t("projects.ongoing", { defaultValue: "Ongoing" })}
                            </small>
                        </div>
                        <span className={`prj-status prj-status--${statusTone(project.status)}`}>{projectStatusLabel(t, project.status)}</span>
                    </li>
                );
            })}
        </ul>
    );
}

export default EmployeeProjectList;
