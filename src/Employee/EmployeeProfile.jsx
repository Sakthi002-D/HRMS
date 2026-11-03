import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Briefcase, BriefcaseBusiness, CalendarDays, ChevronDown, ChevronsUpDown, Clock3, FileText, FolderKanban, GraduationCap, Landmark, Mail, MapPin, Network, Pencil, UsersRound } from "lucide-react";
import EmployeeEditPage from "../pages/hr/EmployeeEditPage";
import { serviceLength } from "../pages/hr/employeeProfileData";
import EmployeeProjectList from "../pages/hr/EmployeeProjectList";
import "../pages/hr/EmployeeDetails.css";

function EmployeeProfile({ employee, profilePanels, toggleProfilePanel, setProfilePanels, profileWorkTab, setProfileWorkTab, onSaved, formatProfileDate }) {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(false);
    const qid = String(employee.employee_id || "").replace(/^EMP/i, "").padStart(3, "0");

    // Short form for this page's texts: p("title", "My Profile") = t("employeeProfile.title", { defaultValue: "My Profile" })
    const p = (key, defaultValue) => t(`employeeProfile.${key}`, { defaultValue });

    // Displayed text for saved list values (Active, Male, Married, Full Time...). The saved value itself stays English.
    const valueLabel = (group, value) => {
        if (value === null || value === undefined || String(value).trim() === "") return "";
        const key = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
        return t(`employeeProfile.values.${group}.${key}`, { defaultValue: String(value) });
    };

    if (editing) {
        return (
            <section className="employee-profile-view epf-host">
                <EmployeeEditPage
                    employee={employee}
                    selfService
                    onClose={() => setEditing(false)}
                    onSaved={async () => {
                        await onSaved();
                        setEditing(false);
                    }}
                />
            </section>
        );
    }

    const initials = String(employee.name || "").split(" ").map((word) => word.charAt(0)).join("").substring(0, 2).toUpperCase();
    const isActive = String(employee.status || "Active").trim().toLowerCase() === "active";
    const anyPanelOpen = Object.values(profilePanels).some(Boolean);
    const educationRecords = Array.isArray(employee.education) ? employee.education : [];
    const experienceRecords = Array.isArray(employee.experience) ? employee.experience : [];

    const employmentEnd = !employee.employment_end_date || employee.employment_end_date === "Never"
        ? p("values.never", "Never")
        : employee.employment_end_date;

    const defaultAbout = t("employeeProfile.defaultAbout", {
        name: employee.name,
        department: employee.department || p("defaultDepartment", "organization"),
        designation: employee.designation || p("defaultDesignation", "valued employee"),
        defaultValue: "Employee {{name}} is part of the {{department}} team as a {{designation}}.",
    });

    const overviewStats = [
        [CalendarDays, p("basic.joiningDate", "Joining Date"), formatProfileDate(employee.joining_date)],
        [Clock3, p("basic.yearsOfService", "Years of Service"), serviceLength(t, employee.joining_date)],
        [MapPin, p("basic.officeLocation", "Office Location"), employee.work_location],
        [Network, t("profileEdit.fields.department", { defaultValue: "Department" }), employee.department],
    ];

    const fields = (rows) => rows.map(([label, value]) => (
        <div className="detail-field" key={label}>
            <span>{label}</span>
            <strong>{value || value === 0 ? value : "-"}</strong>
        </div>
    ));

    const panel = (key, Icon, title, content, className = "") => (
        <section className={`detail-panel ${profilePanels[key] ? "open" : "collapsed"}`}>
            <header>
                <i className="epf-panel-icon" aria-hidden="true"><Icon size={18} /></i>
                <h2>{title}</h2>
                <button
                    type="button"
                    className="panel-toggle-button"
                    onClick={() => toggleProfilePanel(key)}
                    aria-label={profilePanels[key]
                        ? t("employeeProfile.collapsePanel", { title, defaultValue: "Collapse {{title}}" })
                        : t("employeeProfile.expandPanel", { title, defaultValue: "Expand {{title}}" })}
                >
                    <ChevronDown size={17} aria-hidden="true" />
                </button>
            </header>
            {profilePanels[key] && <div className={`detail-panel-content ${className}`}>{content}</div>}
        </section>
    );

    return (
        <section className="employee-profile-view epf-host">
            <div className="employee-details-page epf">
                <header className="epf-hero">
                    <div className="epf-hero-top epf-hero-top--end">
                        <button
                            type="button"
                            className="epf-ghost"
                            onClick={() => setProfilePanels(Object.fromEntries(Object.keys(profilePanels).map((key) => [key, !anyPanelOpen])))}
                            aria-label={p("toggleAll", "Expand or collapse all employee details")}
                        >
                            <ChevronsUpDown size={16} aria-hidden="true" />
                            {anyPanelOpen
                                ? t("employeeDetails.edit.collapseAll", { defaultValue: "Collapse all" })
                                : t("employeeDetails.edit.expandAll", { defaultValue: "Expand all" })}
                        </button>
                    </div>
                    <div className="epf-hero-main">
                        <div className="epf-avatar">
                            {employee.profile_photo ? <img src={employee.profile_photo} alt={employee.name} /> : initials}
                        </div>
                        <div className="epf-hero-copy">
                            <span className="epf-kicker">{p("overview", "Employee Overview")}</span>
                            <h1 dir="auto">{employee.name}</h1>
                            <div className="epf-tags">
                                <span>{employee.designation || p("employee", "Employee")}</span>
                                <span>{valueLabel("employmentType", employee.employment_type || "Full time")}</span>
                                <span className={isActive ? "epf-tag-active" : "epf-tag-inactive"}>{valueLabel("status", employee.status || "Active")}</span>
                            </div>
                        </div>
                        <div className="epf-actions">
                            <button type="button" className="epf-primary" onClick={() => setEditing(true)}>
                                <Pencil size={15} aria-hidden="true" />
                                {p("editInfo", "Edit Info")}
                            </button>
                            {employee.email && (
                                <a className="epf-secondary" href={`mailto:${employee.email}`}>
                                    <Mail size={15} aria-hidden="true" />
                                    {p("message", "Message")}
                                </a>
                            )}
                        </div>
                    </div>
                    <div className="epf-stats">
                        {overviewStats.map(([Icon, label, value]) => (
                            <div key={label}>
                                <i aria-hidden="true"><Icon size={18} /></i>
                                <div>
                                    <span>{label}</span>
                                    <strong>{value || "-"}</strong>
                                </div>
                            </div>
                        ))}
                    </div>
                </header>

                <div className="employee-details-layout">
                    <aside className="epf-side">
                        <section className="info-section">
                            <h3>{p("basic.title", "Basic information")}</h3>
                            <p><span>{p("basic.phone", "Phone")}</span><strong>{employee.phone || "-"}</strong></p>
                            <p><span>{p("basic.qid", "QID")}</span><strong>{qid === "000" ? "-" : qid}</strong></p>
                            <p><span>{p("basic.email", "Email")}</span><strong>{employee.email || "-"}</strong></p>
                            <p><span>{p("basic.gender", "Gender")}</span><strong>{valueLabel("gender", employee.gender) || "-"}</strong></p>
                            <p><span>{p("basic.birthday", "Birthday")}</span><strong>{formatProfileDate(employee.date_of_birth)}</strong></p>
                            <p><span>{p("basic.employmentType", "Employment Type")}</span><strong>{valueLabel("employmentType", employee.employment_type) || "-"}</strong></p>
                            <p><span>{p("basic.grade", "Grade")}</span><strong dir="ltr">{employee.grade || "-"}</strong></p>
                            <p><span>{p("basic.address", "Address")}</span><strong>{employee.address || "-"}</strong></p>
                        </section>
                        <section className="info-section">
                            <h3>{p("personal.title", "Personal Information")}</h3>
                            <p><span>{t("profileEdit.fields.passport_no", { defaultValue: "Passport No" })}</span><strong>{employee.passport_no || "-"}</strong></p>
                            <p><span>{t("profileEdit.fields.passport_exp_date", { defaultValue: "Passport Exp Date" })}</span><strong>{formatProfileDate(employee.passport_exp_date)}</strong></p>
                            <p><span>{p("personal.nationality", "Nationality")}</span><strong>{employee.nationality || employee.country || "-"}</strong></p>
                            <p><span>{p("personal.religion", "Religion")}</span><strong>{employee.religion || "-"}</strong></p>
                            <p><span>{p("personal.maritalStatus", "Marital status")}</span><strong>{valueLabel("maritalStatus", employee.marital_status) || "-"}</strong></p>
                            <p><span>{p("personal.childrenCount", "No. of children")}</span><strong>{employee.children_count ?? "-"}</strong></p>
                        </section>
                        <section className="info-section emergency-section">
                            <h3>{p("emergency.title", "Emergency Contact Number")}</h3>
                            <p><b>{p("emergency.primary", "Primary")}</b><strong>{employee.emergency_contact || "-"}</strong></p>
                        </section>
                    </aside>

                    <div className="employee-detail-content">
                        {panel("about", FileText, p("panels.about", "About Employee"), employee.about || defaultAbout, "plain")}
                        {panel("bank", Landmark, p("panels.bank", "Bank Information"), fields([
                            [p("bank.accountHolder", "Account Holder"), employee.bank?.account_holder_name],
                            [p("bank.bankName", "Bank Name"), employee.bank?.bank_name],
                            [p("bank.accountNumber", "Account Number"), employee.bank?.account_number],
                            [p("bank.branchName", "Branch Name"), employee.bank?.branch_name],
                            [p("bank.ifscCode", "IFSC Code"), employee.bank?.ifsc_code],
                            [p("bank.accountType", "Account Type"), employee.bank?.account_type],
                        ]))}
                        {panel("family", UsersRound, p("panels.family", "Family Information"), fields([
                            [p("family.fatherName", "Father Name"), employee.family?.father_name],
                            [p("family.motherName", "Mother Name"), employee.family?.mother_name],
                            [p("family.spouseName", "Spouse Name"), employee.family?.spouse_name],
                            [p("family.spouseEmployment", "Spouse Employment"), employee.family?.spouse_employment],
                            [p("family.maritalStatus", "Marital Status"), valueLabel("maritalStatus", employee.marital_status)],
                            [p("family.children", "Children"), employee.children_count],
                        ]))}
                        {panel("employment", Briefcase, p("panels.employment", "Employment Details"), fields([
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
                        ]))}
                        {panel("position", FolderKanban, p("panels.position", "Position Details"), fields([
                            [p("position.position", "Position"), employee.position || employee.designation],
                            [p("position.positionTitle", "Position Title"), employee.position_title || employee.designation],
                            [p("position.assignmentStart", "Assignment Start"), formatProfileDate(employee.assignment_start || employee.joining_date)],
                            [p("position.assignmentEnd", "Assignment End"), formatProfileDate(employee.assignment_end)],
                            [p("position.makePrimary", "Make Primary"), employee.make_primary ? p("values.yes", "Yes") : p("values.no", "No")],
                        ]))}
                        <div className="detail-panel-row">
                            {panel("education", GraduationCap, p("panels.education", "Education Details"), educationRecords.length === 0
                                ? <p className="employee-record-empty">{t("employeeDetails.edit.empty.education", { defaultValue: "No education added yet" })}</p>
                                : (
                                    <div className="education-records">
                                        {educationRecords.map((education) => (
                                            <article className="education-record" key={education.id}>
                                                <div>
                                                    <strong>{education.qualification || p("education.qualification", "Qualification")}{education.specialization ? ` ${education.specialization}` : ""}</strong>
                                                    <span>{education.institution || "-"}</span>
                                                    <small>{education.start_year || "-"} - {education.currently_pursuing ? p("education.present", "Present") : education.end_year || "-"} {education.grade ? `• ${education.grade}` : ""}</small>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ), "wide")}
                            {panel("experience", BriefcaseBusiness, p("panels.experience", "Experience"), experienceRecords.length === 0
                                ? <p className="employee-record-empty">{t("employeeDetails.edit.empty.experience", { defaultValue: "No experience added yet" })}</p>
                                : (
                                    <div className="education-records">
                                        {experienceRecords.map((experience) => (
                                            <article className="education-record" key={experience.id}>
                                                <div>
                                                    <strong>{experience.company_name || p("experience.company", "Company")}</strong>
                                                    <span>{experience.designation || "-"}{experience.department ? ` • ${experience.department}` : ""}</span>
                                                    <small>{formatProfileDate(experience.start_date)} - {experience.currently_working ? p("experience.currentlyWorking", "Currently working") : formatProfileDate(experience.end_date)}</small>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ), "wide")}
                        </div>
                        <section className="projects-panel">
                            <div className="project-tabs">
                                <button type="button" className={profileWorkTab === "projects" ? "active" : ""} onClick={() => setProfileWorkTab("projects")}>{p("work.projects", "Projects")}</button>
                                <button type="button" className={profileWorkTab === "assets" ? "active" : ""} onClick={() => setProfileWorkTab("assets")}>{p("work.assets", "Assets")}</button>
                            </div>
                            {profileWorkTab === "projects" ? (
                                <EmployeeProjectList employeeId={employee.employee_id} />
                            ) : (
                                <div className="assets-empty-state">
                                    <span className="assets-empty-icon">▣</span>
                                    <div><b>{p("work.noAssets", "No assets assigned")}</b></div>
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default EmployeeProfile;
