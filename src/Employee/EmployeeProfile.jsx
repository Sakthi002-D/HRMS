import { useTranslation } from "react-i18next";

function EmployeeProfile({ employee, profilePanels, toggleProfilePanel, setProfilePanels, profilePanelFields, profileWorkTab, setProfileWorkTab, onEditProfile, onEditSection, onAddEducation, onAddExperience, onDeleteEducation, formatProfileDate }) {
    const { t } = useTranslation();
    const qid = String(employee.employee_id || "").replace(/^EMP/i, "").padStart(3, "0");

    // Short form for this page's texts: p("title", "My Profile") = t("employeeProfile.title", { defaultValue: "My Profile" })
    const p = (key, defaultValue) => t(`employeeProfile.${key}`, { defaultValue });

    // Displayed text for saved list values (Active, Male, Married, Full Time...). The saved value itself stays English.
    const valueLabel = (group, value) => {
        if (value === null || value === undefined || String(value).trim() === "") return "";
        const key = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
        return t(`employeeProfile.values.${group}.${key}`, { defaultValue: String(value) });
    };

    const employmentEnd = !employee.employment_end_date || employee.employment_end_date === "Never"
        ? p("values.never", "Never")
        : employee.employment_end_date;

    const defaultAbout = t("employeeProfile.defaultAbout", {
        name: employee.name,
        department: employee.department || p("defaultDepartment", "organization"),
        designation: employee.designation || p("defaultDesignation", "valued employee"),
        defaultValue: "Employee {{name}} is part of the {{department}} team as a {{designation}}.",
    });

    return (
        <section className="employee-profile-view">
            <div className="employee-profile-topbar">
                <span>{p("overview", "Employee Overview")}</span>
                <button type="button" onClick={() => { const shouldOpen = Object.values(profilePanels).every((open) => !open); setProfilePanels(Object.fromEntries(Object.keys(profilePanels).map((key) => [key, shouldOpen]))); }} aria-label={p("toggleAll", "Expand or collapse all profile sections")}>{Object.values(profilePanels).some(Boolean) ? "⌃" : "⌄"}</button>
            </div>
            <div className="employee-section-heading"><div><h2>{p("title", "My Profile")}</h2><p>{p("subtitle", "Complete employee information from HR records")}</p></div></div>
            <aside className="profile-summary-card">
                <div className="profile-summary-cover" />
                <div className="profile-summary-avatar">{employee.profile_photo ? <img src={employee.profile_photo} alt={employee.name} /> : employee.name?.charAt(0)?.toUpperCase()}</div>
                <h2>{employee.name}</h2>
                <span className={`profile-summary-status ${String(employee.status || "Active").trim().toLowerCase() === "inactive" ? "inactive" : ""}`}>● {valueLabel("status", employee.status || "Active")}</span>
                <div className="profile-summary-tags">
                    <span>{employee.designation || p("employee", "Employee")}</span>
                    <span>{valueLabel("employmentType", employee.employment_type || "Full time")}</span>
                </div>
                <div className="profile-summary-actions">
                    <button type="button" onClick={onEditProfile}>✎ {p("editInfo", "Edit Info")}</button>
                    <a href={`mailto:${employee.email}`}>▣ {p("message", "Message")}</a>
                </div>
                <div className="profile-summary-info-section profile-summary-basic-information"><h3>{p("basic.title", "Basic information")}</h3>
                    <div><span>{p("basic.phone", "Phone")}</span><strong>{employee.phone || "-"}</strong></div>
                    <div><span>{p("basic.qid", "QID")}</span><strong>{qid === "000" ? "-" : qid}</strong></div>
                    <div><span>{p("basic.email", "Email")}</span><strong>{employee.email || "-"}</strong></div>
                    <div><span>{p("basic.gender", "Gender")}</span><strong>{valueLabel("gender", employee.gender) || "-"}</strong></div>
                    <div><span>{p("basic.birthday", "Birthday")}</span><strong>{formatProfileDate(employee.date_of_birth)}</strong></div>
                    <div><span>{p("basic.joiningDate", "Joining Date")}</span><strong>{formatProfileDate(employee.joining_date)}</strong></div>
                    <div><span>{p("basic.employmentType", "Employment Type")}</span><strong>{valueLabel("employmentType", employee.employment_type) || "-"}</strong></div>
                    <div><span>{p("basic.address", "Address")}</span><strong>{employee.address || "-"}</strong></div>
                </div>
                <div className="profile-summary-info-section"><h3>{p("personal.title", "Personal Information")}</h3>
                    <div><span>{p("personal.nationality", "Nationality")}</span><strong>{employee.nationality || employee.country || "-"}</strong></div>
                    <div><span>{p("personal.religion", "Religion")}</span><strong>{employee.religion || "-"}</strong></div>
                    <div><span>{p("personal.maritalStatus", "Marital status")}</span><strong>{valueLabel("maritalStatus", employee.marital_status) || "-"}</strong></div>
                    <div><span>{p("personal.childrenCount", "No. of children")}</span><strong>{employee.children_count ?? "-"}</strong></div>
                </div>
                <div className="profile-summary-info-section profile-summary-emergency"><h3>{p("emergency.title", "Emergency Contact Number")}</h3>
                    <div><span>{p("emergency.primary", "Primary")}</span><strong>{employee.emergency_contact || "-"}</strong></div>
                </div>
            </aside>
            <div className="dashboard-profile-panels">
                <DashboardProfilePanel title={p("panels.about", "About Employee")} open={profilePanels.about} onToggle={() => toggleProfilePanel("about")} onEdit={() => onEditSection("about")} content={<p>{employee.about || defaultAbout}</p>} />
                <DashboardProfilePanel title={p("panels.bank", "Bank Information")} open={profilePanels.bank} onToggle={() => toggleProfilePanel("bank")} onEdit={() => onEditSection("bank")} content={<div className="dashboard-profile-grid">{profilePanelFields([
                    [p("bank.accountHolder", "Account Holder"), employee.bank?.account_holder_name],
                    [p("bank.bankName", "Bank Name"), employee.bank?.bank_name],
                    [p("bank.accountNumber", "Account Number"), employee.bank?.account_number],
                    [p("bank.branchName", "Branch Name"), employee.bank?.branch_name],
                    [p("bank.ifscCode", "IFSC Code"), employee.bank?.ifsc_code],
                    [p("bank.accountType", "Account Type"), employee.bank?.account_type],
                ])}</div>} />
                <DashboardProfilePanel title={p("panels.family", "Family Information")} open={profilePanels.family} onToggle={() => toggleProfilePanel("family")} onEdit={() => onEditSection("family")} content={<div className="dashboard-profile-grid">{profilePanelFields([
                    [p("family.fatherName", "Father Name"), employee.family?.father_name],
                    [p("family.motherName", "Mother Name"), employee.family?.mother_name],
                    [p("family.spouseName", "Spouse Name"), employee.family?.spouse_name],
                    [p("family.spouseEmployment", "Spouse Employment"), employee.family?.spouse_employment],
                    [p("family.maritalStatus", "Marital Status"), valueLabel("maritalStatus", employee.marital_status)],
                    [p("family.children", "Children"), employee.children_count],
                ])}</div>} />
                <DashboardProfilePanel title={p("panels.employment", "Employment Details")} open={profilePanels.employment} onToggle={() => toggleProfilePanel("employment")} onEdit={() => onEditSection("employment")} content={<div className="dashboard-profile-grid">{profilePanelFields([
                    [p("employment.legalEntity", "Legal Entity"), employee.legal_entity || "SHLT"],
                    [p("employment.workerType", "Worker Type"), valueLabel("workerType", employee.worker_type || "Employee")],
                    [p("employment.personnelNumber", "Personnel Number"), employee.employee_id],
                    [p("employment.employmentCategory", "Employment Category"), employee.employment_category],
                    [p("employment.employmentStart", "Employment Start"), formatProfileDate(employee.joining_date)],
                    [p("employment.employmentEnd", "Employment End"), employmentEnd],
                    [p("employment.employmentType", "Employment Type"), valueLabel("employmentType", employee.employment_type)],
                    [p("employment.projectRoleId", "Project Role ID"), employee.project_role_id],
                    [p("employment.terminationReason", "Termination Reason"), employee.termination_reason],
                    [p("employment.lastDateWorked", "Last Date Worked"), employee.last_date_worked],
                ])}</div>} />
                <DashboardProfilePanel title={p("panels.position", "Position Details")} open={profilePanels.position} onToggle={() => toggleProfilePanel("position")} onEdit={() => onEditSection("position")} content={<div className="dashboard-profile-grid">{profilePanelFields([
                    [p("position.position", "Position"), employee.position || employee.designation],
                    [p("position.positionTitle", "Position Title"), employee.position_title || employee.designation],
                    [p("position.assignmentStart", "Assignment Start"), formatProfileDate(employee.assignment_start || employee.joining_date)],
                    [p("position.assignmentEnd", "Assignment End"), formatProfileDate(employee.assignment_end)],
                    [p("position.makePrimary", "Make Primary"), employee.make_primary ? p("values.yes", "Yes") : p("values.no", "No")],
                ])}</div>} />
                <div className="dashboard-profile-panel-row">
                    <DashboardProfilePanel title={p("panels.education", "Education Details")} open={profilePanels.education} onToggle={() => toggleProfilePanel("education")} onEdit={() => onEditSection("education")} content={<div className="education-records">
                        {(Array.isArray(employee.education) ? employee.education : []).map((education) => <article className="education-record" key={education.id}>
                            <div>
                                <strong>{education.qualification || p("education.qualification", "Qualification")}{education.specialization ? ` ${education.specialization}` : ""}</strong>
                                <span>{education.institution || "-"}</span>
                                <small>{education.start_year || "-"} - {education.currently_pursuing ? p("education.present", "Present") : education.end_year || "-"} {education.grade ? `• ${education.grade}` : ""}</small>
                            </div>
                            <div>
                                <button type="button" onClick={() => onEditSection("education", education.id)}>{p("edit", "Edit")}</button>
                                <button type="button" onClick={() => onDeleteEducation(education.id)}>{p("delete", "Delete")}</button>
                            </div>
                        </article>)}
                        <button type="button" className="add-education-button" onClick={onAddEducation}>{p("education.add", "+ Add Education")}</button>
                    </div>} />
                    <DashboardProfilePanel title={p("panels.experience", "Experience")} open={profilePanels.experience} onToggle={() => toggleProfilePanel("experience")} onEdit={() => onAddExperience()} content={<div className="education-records">
                        {(Array.isArray(employee.experience) ? employee.experience : []).map((experience) => <article className="education-record" key={experience.id}>
                            <div>
                                <strong>{experience.company_name || p("experience.company", "Company")}</strong>
                                <span>{experience.designation || "-"}{experience.department ? ` • ${experience.department}` : ""}</span>
                                <small>{formatProfileDate(experience.start_date)} - {experience.currently_working ? p("experience.currentlyWorking", "Currently working") : formatProfileDate(experience.end_date)}</small>
                            </div>
                            <div>
                                <button type="button" onClick={() => onEditSection("experience", experience.id)}>{p("edit", "Edit")}</button>
                            </div>
                        </article>)}
                        <button type="button" className="add-education-button" onClick={onAddExperience}>{p("experience.add", "+ Add Experience")}</button>
                    </div>} />
                </div>
                <section className="dashboard-projects-panel">
                    <div className="dashboard-project-tabs">
                        <button className={profileWorkTab === "projects" ? "active" : ""} onClick={() => setProfileWorkTab("projects")}>{p("work.projects", "Projects")}</button>
                        <button className={profileWorkTab === "assets" ? "active" : ""} onClick={() => setProfileWorkTab("assets")}>{p("work.assets", "Assets")}</button>
                    </div>
                    {profileWorkTab === "projects" ? <div className="dashboard-project-list">
                        <article><span className="dashboard-project-icon blue">C</span><div>
                            <b>{t("employeeProfile.work.management", { name: employee.department || p("work.workforce", "Workforce"), defaultValue: "{{name}} Management" })}</b>
                            <p>{p("work.managementHint", "Employee responsibilities and assigned work")}</p>
                        </div></article>
                        <article><span className="dashboard-project-icon purple">●</span><div>
                            <b>{t("employeeProfile.work.operations", { name: employee.designation || p("employee", "Employee"), defaultValue: "{{name}} Operations" })}</b>
                            <p>{p("work.operationsHint", "Current role and organizational activities")}</p>
                        </div></article>
                    </div> : <div className="dashboard-assets-empty">{p("work.noAssets", "No assets assigned")}</div>}
                </section>
            </div>
        </section>
    );
}

function DashboardProfilePanel({ title, open, onToggle, onEdit, content }) {
    const { t } = useTranslation();
    return <section className={`dashboard-profile-panel ${open ? "open" : "collapsed"}`}>
        <header>
            <h3>{title}</h3>
            {onEdit && <button type="button" className="dashboard-profile-edit-button" onClick={onEdit} aria-label={t("employeeProfile.editPanel", { title, defaultValue: "Edit {{title}}" })}>✎</button>}
            <button type="button" className="dashboard-profile-toggle-button" onClick={onToggle} aria-label={open ? t("employeeProfile.collapsePanel", { title, defaultValue: "Collapse {{title}}" }) : t("employeeProfile.expandPanel", { title, defaultValue: "Expand {{title}}" })}>{open ? "⌃" : "⌄"}</button>
        </header>
        {open && <div className="dashboard-profile-panel-content">{content}</div>}
    </section>;
}

export default EmployeeProfile;