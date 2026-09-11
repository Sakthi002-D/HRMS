import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import DatePicker from "../../components/layout/common/DatePicker";
import Modal from "../../components/layout/common/Modal";
import "./EmployeeDetails.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function readApiResponse(response) {
    const responseText = await response.text();
    try {
        return responseText ? JSON.parse(responseText) : {};
    } catch {
        throw new Error(
            `Employee details API is unavailable (${response.status}). Restart or redeploy the backend.`
        );
    }
}

function EmployeeDetails() {
    const { employeeSlug } = useParams();
    const navigate = useNavigate();

    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [sectionEditor, setSectionEditor] = useState(null);
    const [sectionForm, setSectionForm] = useState({});
    const [educationEditorId, setEducationEditorId] = useState(null);
    const [educationDeleteId, setEducationDeleteId] = useState(null);
    const [notification, setNotification] = useState("");
    const [resetPasswordResult, setResetPasswordResult] = useState(null);
    const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [repeatPassword, setRepeatPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [activeWorkTab, setActiveWorkTab] = useState("projects");
    const [openPanels, setOpenPanels] = useState({
        about: true,
        bank: false,
        family: false,
        education: false,
        experience: false,
        employment: true,
        position: true,
    });

    useEffect(() => {
        fetchEmployee();
    }, [employeeSlug]);

    const createSlug = (name) => {
        return String(name || "")
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");
    };

    const fetchEmployee = async () => {
        try {
            setLoading(true);
            setError("");

            const response = await fetch(
                `${API_URL}/api/employees`
            );

            if (!response.ok) {
                throw new Error("Failed to fetch employees");
            }

            const employees = await response.json();

            const foundEmployee = employees.find(
                (item) => createSlug(item.name) === employeeSlug
            );

            if (!foundEmployee) {
                setError("Employee not found");
                return;
            }

            setEmployee(foundEmployee);
            const detailsResponse = await fetch(
                `${API_URL}/api/employees/${foundEmployee.employee_id}/details`
            );
            if (!detailsResponse.ok) {
                throw new Error(
                    `Employee details API is unavailable (${detailsResponse.status}). Restart or redeploy the backend.`
                );
            }
            const details = await readApiResponse(detailsResponse);
            setEmployee((current) => ({ ...current, ...details }));
        } catch (error) {
            console.error("Employee details error:", error);
            setError("Unable to connect to backend");
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (date) => {
        if (!date) return "-";

        const parsedDate = new Date(date);

        if (isNaN(parsedDate.getTime())) {
            return date;
        }

        return parsedDate.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    };

    const formatQid = (employeeId) => {
        const idNumber = String(employeeId || "").replace(/^EMP/i, "");
        return idNumber ? idNumber.padStart(3, "0") : "-";
    };

    const openEditor = () => {
        setEditForm({
            employee_id: employee.employee_id || "",
            name: employee.name || "",
            date_of_birth: employee.date_of_birth ? String(employee.date_of_birth).slice(0, 10) : "",
            gender: employee.gender || "",
            phone: employee.phone || "",
            email: employee.email || "",
            address: employee.address || "",
            designation: employee.designation || "",
            department: employee.department || "",
            joining_date: employee.joining_date ? String(employee.joining_date).slice(0, 10) : "",
            employment_type: employee.employment_type || "",
            status: employee.status || "Active",
            emergency_contact: employee.emergency_contact || "",
            passport_no: employee.passport_no || "",
            passport_exp_date: employee.passport_exp_date ? String(employee.passport_exp_date).slice(0, 10) : "",
            nationality: employee.nationality || employee.country || "Indian",
            religion: employee.religion || "",
            marital_status: employee.marital_status || "",
            children_count: employee.children_count ?? "",
            legal_entity: employee.legal_entity || "SHLT",
            worker_type: employee.worker_type || "Employee",
            profile_photo: employee.profile_photo || "",
            employment_category: employee.employment_category || "",
            project_role_id: employee.project_role_id || "",
            employment_end_date: employee.employment_end_date || "Never",
            termination_reason: employee.termination_reason || "",
            last_date_worked: employee.last_date_worked || "",
            position: employee.position || employee.designation || "",
            position_title: employee.position_title || employee.designation || "",
            assignment_start: employee.assignment_start ? String(employee.assignment_start).slice(0, 10) : "",
            assignment_end: employee.assignment_end ? String(employee.assignment_end).slice(0, 10) : "",
            make_primary: employee.make_primary || false,
        });
        setIsEditing(true);
    };

    const updateFormField = ({ target }) => {
        setEditForm((current) => ({ ...current, [target.name]: target.value }));
    };

    const saveEmployee = async (event) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            const response = await fetch(`${API_URL}/api/employees/${employee.employee_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm),
            });
            const data = await readApiResponse(response);
            if (!response.ok) {
                throw new Error(
                    [data.message, data.details].filter(Boolean).join(": ") ||
                    "Failed to update employee"
                );
            }
            setEmployee((current) => ({ ...current, ...data }));
            setIsEditing(false);
        } catch (saveError) {
            console.error("Employee update error:", saveError);
            setNotification(saveError.message);
        } finally {
            setIsSaving(false);
        }
    };

    const sectionFields = {
        about: [["about", "About Employee"]],
        bank: [["account_holder_name", "Account Holder Name"], ["account_number", "Account Number"], ["bank_name", "Bank Name"], ["branch_name", "Branch Name"], ["ifsc_code", "IFSC Code"], ["account_type", "Account Type"]],
        family: [["father_name", "Father Name"], ["mother_name", "Mother Name"], ["spouse_name", "Spouse Name"], ["spouse_employment", "Spouse Employment"], ["marital_status", "Marital Status"], ["children_count", "Children Count"]],
        employment: [["legal_entity", "Legal Entity"], ["worker_type", "Worker Type"], ["employee_id", "Personnel Number"], ["employment_category", "Employment Category"], ["joining_date", "Employment Start Date"], ["employment_end_date", "Employment End Date"], ["employment_type", "Employment Type"], ["project_role_id", "Project Role ID"], ["termination_reason", "Termination Reason"], ["last_date_worked", "Last Date Worked"]],
        position: [["position", "Position"], ["position_title", "Position Title"], ["assignment_start", "Assignment Start"], ["assignment_end", "Assignment End"], ["make_primary", "Make Primary"]],
        education: [["qualification", "Degree / Qualification"], ["institution", "Institution / University"], ["field_of_study", "Field of Study"], ["specialization", "Specialization"], ["start_year", "Start Year"], ["end_year", "End Year"], ["grade", "Grade / CGPA"], ["education_type", "Education Type"], ["location", "Location"]],
        experience: [["company_name", "Company Name"], ["designation", "Designation"], ["start_date", "Start Date"], ["end_date", "End Date"], ["description", "Description"]],
        project: [["project_name", "Project Name"], ["description", "Description"], ["project_lead", "Project Lead"], ["start_date", "Start Date"], ["deadline", "Deadline"], ["status", "Status"]],
    };

    const openSectionEditor = (section, recordId = null) => {
        const records = section === "education" ? (Array.isArray(employee.education) ? employee.education : []) : [];
        const source = section === "education" ? (records.find((record) => record.id === recordId) || {}) : ["about", "employment", "position"].includes(section) ? employee : employee[section] || {};

        const nextSectionForm = Object.fromEntries((sectionFields[section] || []).map(([name]) => {
            const value = source[name] ?? "";
            return [name, name.includes("date") && value !== "Never" ? String(value).slice(0, 10) : value === "Never" ? "" : value];
        }));
        if (section === "education") {
            nextSectionForm.currently_pursuing = Boolean(source.currently_pursuing);
        }

        setSectionForm(nextSectionForm);
        setEducationEditorId(recordId);
        setSectionEditor(section);
    };

    const addEducation = () => openSectionEditor("education");

    const saveSection = async (event) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            const isEducation = sectionEditor === "education";
            const isEmployeeSection = ["employment", "position"].includes(sectionEditor);
            const method = isEducation && !educationEditorId ? "POST" : "PUT";
            const endpoint = isEducation
                ? `${API_URL}/api/employees/${employee.employee_id}/education${educationEditorId ? `/${educationEditorId}` : ""}`
                : isEmployeeSection
                    ? `${API_URL}/api/employees/${employee.employee_id}`
                    : `${API_URL}/api/employees/${employee.employee_id}/${sectionEditor}`;

            const body = isEducation
                ? { ...sectionForm, currently_pursuing: Boolean(sectionForm.currently_pursuing) }
                : isEmployeeSection
                    ? { ...employee, ...sectionForm, employment_end_date: sectionForm.employment_end_date || "Never", employee_id: employee.employee_id }
                    : { ...sectionForm };
            const response = await fetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await readApiResponse(response);
            if (!response.ok) throw new Error(data.message || "Failed to save details");

            setEmployee((current) => ({
                ...current,
                ...(isEducation
                    ? {
                        education: educationEditorId
                            ? (current.education || []).map((record) => record.id === educationEditorId ? data : record)
                            : [...(current.education || []), data],
                    }
                    : isEmployeeSection ? data : { [sectionEditor]: data }),
            }));
            setSectionEditor(null);
            setEducationEditorId(null);
        } catch (saveError) {
            setNotification(saveError.message);
        } finally {
            setIsSaving(false);
        }
    };

    const deleteEducation = async (educationId) => {
        try {
            const response = await fetch(`${API_URL}/api/employees/${employee.employee_id}/education/${educationId}`, {
                method: "DELETE",
            });
            if (!response.ok) {
                throw new Error("Unable to delete education record");
            }
            setEmployee((current) => ({
                ...current,
                education: (current.education || []).filter((record) => record.id !== educationId),
            }));
        } catch (deleteError) {
            setNotification(deleteError.message || "Unable to delete education record");
        } finally {
            setEducationDeleteId(null);
        }
    };

    const confirmDeleteEducation = async () => {
        if (educationDeleteId) await deleteEducation(educationDeleteId);
    };

    const resetEmployeePassword = async () => {
        try {
            const submittedNewPassword = newPassword.trim();
            const submittedRepeatPassword = repeatPassword.trim();
            if (submittedNewPassword.length < 6) {
                setNotification("New password must be at least 6 characters.");
                return;
            }
            if (submittedNewPassword !== submittedRepeatPassword) {
                setNotification("New password and repeat password do not match.");
                return;
            }

            const response = await fetch(
                `${API_URL}/api/employees/${employee.employee_id}/reset-password`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ custom_password: submittedNewPassword }),
                }
            );
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Failed to reset employee password");
            }

            setResetPasswordResult({
                ...data,
                is_custom_password: true,
            });
            setNewPassword("");
            setRepeatPassword("");
        } catch (resetError) {
            setNotification(resetError.message || "Unable to reset employee password");
        }
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div className="employee-details-loading">
                    <div className="loading-spinner"></div>
                    <p>Loading employee details...</p>
                </div>
            </DashboardLayout>
        );
    }

    if (error || !employee) {
        return (
            <DashboardLayout>
                <div className="employee-details-error">
                    <div className="error-icon">!</div>

                    <h2>Employee Not Found</h2>

                    <p>
                        {error ||
                            "The requested employee could not be found."}
                    </p>

                    <button
                        onClick={() => navigate("/employees")}
                    >
                        ← Back to Employees
                    </button>
                </div>
            </DashboardLayout>
        );
    }

    const initials = employee.name
        ?.split(" ")
        .map((word) => word.charAt(0))
        .join("")
        .substring(0, 2)
        .toUpperCase();

    const detailRows = [
        ["Phone", employee.phone],
        ["QID", formatQid(employee.employee_id)],
        ["Email", employee.email],
        ["Gender", employee.gender],
        ["Birthday", formatDate(employee.date_of_birth)],
        ["Joining Date", formatDate(employee.joining_date)],
        ["Employment Type", employee.employment_type],
        ["Address", employee.address],
    ];

    const renderEducationContent = () => {
        const educationRecords = Array.isArray(employee.education) ? employee.education : [];

        if (educationRecords.length === 0) {
            return (
                <div className="education-records">
                    <button type="button" className="add-education-button" onClick={addEducation}>+ Add Education</button>
                </div>
            );
        }

        return (
            <div className="education-records">
                {educationRecords.map((education) => (
                    <article className="education-record" key={education.id || `${education.qualification}-${education.institution}`}>
                        <div>
                            <strong>{education.qualification || "Qualification"}{education.specialization ? ` ${education.specialization}` : ""}</strong>
                            <span>{education.institution || "-"}</span>
                            <small>
                                {education.start_year || "-"} - {education.currently_pursuing ? "Present" : education.end_year || "-"}
                                {education.grade ? ` • ${education.grade}` : ""}
                            </small>
                        </div>
                        <div>
                            <button type="button" className="education-action-button edit" onClick={() => openSectionEditor("education", education.id)}>Edit</button>
                            <button type="button" className="education-action-button delete" onClick={() => setEducationDeleteId(education.id)}>Delete</button>
                        </div>
                    </article>
                ))}
                <button type="button" className="add-education-button" onClick={addEducation}>+ Add Education</button>
            </div>
        );
    };

    const renderExperienceContent = () => {
        return (
            <div className="detail-content-grid">
                <div className="detail-content-cell">
                    <span>Company</span>
                    <strong>{employee.experience?.company_name || "-"}</strong>
                </div>
                <div className="detail-content-cell">
                    <span>Role</span>
                    <strong>{employee.experience?.designation || "-"}</strong>
                </div>
                <div className="detail-content-cell">
                    <span>Start</span>
                    <strong>{formatDate(employee.experience?.start_date) || "-"}</strong>
                </div>
                <div className="detail-content-cell">
                    <span>End</span>
                    <strong>{formatDate(employee.experience?.end_date) || "-"}</strong>
                </div>
            </div>
        );
    };

    return (
        <>
            <DashboardLayout>
                <div className="employee-details-page">
                <div className="employee-details-topbar">
                    <button className="back-btn" onClick={() => navigate("/employees")}>
                        ← Employee Details
                    </button>
                    <div className="topbar-actions">
                        <span className="details-heading">Employee Overview</span>
                        <button
                            className="collapse-btn"
                            type="button"
                            onClick={() => setOpenPanels((current) => {
                                const shouldOpen = Object.values(current).some(Boolean) === false;
                                return Object.fromEntries(Object.keys(current).map((key) => [key, shouldOpen]));
                            })}
                            aria-label="Expand or collapse all employee details"
                        >
                            {Object.values(openPanels).some(Boolean) ? "⌃" : "⌄"}
                        </button>
                    </div>
                </div>

                <div className="employee-details-layout">
                    <aside className="employee-summary">
                        <div className="profile-cover"></div>
                        <div className="profile-avatar-large">
                            {employee.profile_photo ? (
                                <img src={employee.profile_photo} alt={employee.name} />
                            ) : initials}
                        </div>
                        <h1>{employee.name}</h1>
                        <span className="verified-name">●</span>
                        <div className="profile-tags">
                            <span>● {employee.designation || "Employee"}</span>
                            <span>{employee.employment_type || "Full time"}</span>
                        </div>
                        <div className="summary-actions">
                            <button type="button" onClick={openEditor}>✎ Edit Info</button>
                            <a href={`mailto:${employee.email}`}>▣ Message</a>
                        </div>
                        <InfoSection title="Basic information" rows={detailRows} />
                        <InfoSection
                            title="Personal Information"
                            rows={[
                                ["Passport No", employee.passport_no],
                                ["Passport Exp Date", formatDate(employee.passport_exp_date)],
                                ["Nationality", employee.nationality || employee.country || "Indian"],
                                ["Religion", employee.religion],
                                ["Marital status", employee.marital_status],
                                ["No. of children", employee.children_count],
                            ]}
                        />
                        <div className="info-section emergency-section">
                            <h3>Emergency Contact Number</h3>
                            <p><b>Primary</b><strong>{employee.emergency_contact || "-"}</strong></p>
                        </div>
                    </aside>

                    <main className="employee-detail-content">
                        <DetailPanel panelKey="about" isOpen={openPanels.about} onToggle={() => setOpenPanels((current) => ({ ...current, about: !current.about }))} title="About Employee" content={`Employee ${employee.name} is part of the ${employee.department || "organization"} team as a ${employee.designation || "valued employee"}.`} onEdit={() => openSectionEditor("about")} />
                        <DetailPanel panelKey="bank" isOpen={openPanels.bank} onToggle={() => setOpenPanels((current) => ({ ...current, bank: !current.bank }))} title="Bank Information" onEdit={() => openSectionEditor("bank")} content={formatSection(employee.bank)} />
                        <DetailPanel panelKey="family" isOpen={openPanels.family} onToggle={() => setOpenPanels((current) => ({ ...current, family: !current.family }))} title="Family Information" onEdit={() => openSectionEditor("family")} content={formatSection(employee.family)} />
                        <DetailPanel panelKey="employment" isOpen={openPanels.employment} onToggle={() => setOpenPanels((current) => ({ ...current, employment: !current.employment }))} title="Employment Details" content={formatSection({
                            "Legal Entity": employee.legal_entity || "SHLT",
                            "Worker Type": employee.worker_type || "Employee",
                            "Personnel Number": employee.employee_id,
                            "Employment Category": employee.employment_category,
                            "Employment Start Date": formatDate(employee.joining_date),
                            "Employment End Date": employee.employment_end_date || "Never",
                            "Employment Type": employee.employment_type,
                            "Project Role ID": employee.project_role_id,
                            "Termination Reason": employee.termination_reason,
                            "Last Date Worked": employee.last_date_worked,
                        })} onEdit={() => openSectionEditor("employment")} />
                        <DetailPanel panelKey="position" isOpen={openPanels.position} onToggle={() => setOpenPanels((current) => ({ ...current, position: !current.position }))} title="Position Details" content={formatSection({
                            "Position": employee.position || employee.designation,
                            "Position Title": employee.position_title || employee.designation,
                            "Assignment Start": formatDate(employee.assignment_start || employee.joining_date),
                            "Assignment End": formatDate(employee.assignment_end),
                            "Make Primary": employee.make_primary ? "Yes" : "No",
                        })} onEdit={() => openSectionEditor("position")} />
                        <div className="detail-panel-row">
                            <DetailPanel panelKey="education" isOpen={openPanels.education} onToggle={() => setOpenPanels((current) => ({ ...current, education: !current.education }))} title="Education Details" onEdit={() => openSectionEditor("education")} content={renderEducationContent()} />
                            <DetailPanel panelKey="experience" isOpen={openPanels.experience} onToggle={() => setOpenPanels((current) => ({ ...current, experience: !current.experience }))} title="Experience" onEdit={() => openSectionEditor("experience")} content={renderExperienceContent()} />
                        </div>
                        <section className="projects-panel">
                            <div className="project-tabs" role="tablist" aria-label="Employee work details">
                                <button type="button" role="tab" aria-selected={activeWorkTab === "projects"} className={activeWorkTab === "projects" ? "active" : ""} onClick={() => setActiveWorkTab("projects")}>Projects</button>
                                <button type="button" role="tab" aria-selected={activeWorkTab === "assets"} className={activeWorkTab === "assets" ? "active" : ""} onClick={() => setActiveWorkTab("assets")}>Assets</button>
                            </div>
                            {activeWorkTab === "projects" ? (
                                <div className="project-list" role="tabpanel">
                                    <article><span className="project-icon blue">C</span><div><b>{employee.department || "Workforce"} Management</b><p>Employee responsibilities and assigned work</p></div></article>
                                    <article><span className="project-icon purple">●</span><div><b>{employee.designation || "Employee"} Operations</b><p>Current role and organizational activities</p></div></article>
                                </div>
                            ) : (
                                <div className="assets-empty-state" role="tabpanel">
                                    <span className="assets-empty-icon">▣</span>
                                    <div><b>No assets assigned</b><p>Company assets assigned to this employee will appear here.</p></div>
                                </div>
                            )}
                            {activeWorkTab === "projects" && (
                                <button className="section-edit-button" type="button" onClick={() => openSectionEditor("project")} aria-label="Edit projects">✎</button>
                            )}
                        </section>
                        <section className="password-management-panel">
                            <div>
                                <h2>Password Management</h2>
                                <p>
                                    Generate a temporary password for this employee when they cannot access their account.
                                </p>
                                <small>
                                    The employee should change this temporary password after logging in.
                                </small>
                            </div>
                            <button type="button" onClick={() => setShowResetPasswordConfirm(true)}>
                                Reset Password
                            </button>
                        </section>
                    </main>
                </div>

                {isEditing && (
                    <div className="employee-edit-overlay">
                        <form className="employee-edit-form" onSubmit={saveEmployee}>
                            <div className="edit-form-header">
                                <h2>Edit Employee Details</h2>
                                <button type="button" onClick={() => setIsEditing(false)}>×</button>
                            </div>
                            <div className="edit-form-grid">
                                <h3 className="employee-edit-section-title">Basic information</h3>
                                {[
                                    ["employee_id", "QID", "text"],
                                    ["name", "Full Name", "text"],
                                    ["date_of_birth", "Date of Birth", "date"],
                                    ["phone", "Phone", "tel"],
                                    ["email", "Email", "email"],
                                    ["address", "Address", "text"],
                                    ["designation", "Designation", "text"],
                                    ["department", "Department", "text"],
                                    ["joining_date", "Joining Date", "date"],
                                    ["designation", "Designation / Role", "text"],
                                    ["department", "Department", "text"],
                                ].map(([name, label, type]) => (
                                    <label key={name}>{label}
                                        {type === "date" ? (
                                            <DatePicker value={editForm[name] || ""} onChange={(value) => setEditForm((current) => ({ ...current, [name]: value }))} />
                                        ) : (
                                            <input name={name} type={type} value={editForm[name] || ""} onChange={updateFormField} />
                                        )}
                                    </label>
                                ))}
                                <label>Gender
                                    <select name="gender" value={editForm.gender || ""} onChange={updateFormField}>
                                        <option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option>
                                    </select>
                                </label>
                                <label>Employment Type
                                    <select name="employment_type" value={editForm.employment_type || ""} onChange={updateFormField}>
                                        <option value="">Select employment type</option><option>Full Time</option><option>Part Time</option><option>Contract</option><option>Intern</option>
                                    </select>
                                </label>
                                <label>Status
                                    <select name="status" value={editForm.status || "Active"} onChange={updateFormField}>
                                        <option>Active</option><option>Inactive</option>
                                    </select>
                                </label>
                                <h3 className="employee-edit-section-title">Personal Information</h3>
                                <label>Passport No
                                    <input name="passport_no" type="text" value={editForm.passport_no || ""} onChange={updateFormField} />
                                </label>
                                <label>Passport Exp Date
                                    <DatePicker value={editForm.passport_exp_date || ""} onChange={(value) => setEditForm((current) => ({ ...current, passport_exp_date: value }))} />
                                </label>
                                <label>Nationality
                                    <input name="nationality" type="text" value={editForm.nationality || ""} onChange={updateFormField} />
                                </label>
                                <label>Religion
                                    <input name="religion" type="text" value={editForm.religion || ""} onChange={updateFormField} />
                                </label>
                                <label>Marital Status
                                    <select name="marital_status" value={editForm.marital_status || ""} onChange={updateFormField}>
                                        <option value="">Select marital status</option>
                                        <option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option>
                                    </select>
                                </label>
                                <label>No. of Children
                                    <input name="children_count" type="number" min="0" value={editForm.children_count ?? ""} onChange={updateFormField} />
                                </label>
                                <h3 className="employee-edit-section-title">Emergency Contact Number</h3>
                                <label>Primary
                                    <input name="emergency_contact" type="tel" value={editForm.emergency_contact || ""} onChange={updateFormField} />
                                </label>
                                <h3 className="employee-edit-section-title">Work information</h3>
                                <label>Profile Photo
                                    <input type="file" accept="image/*" onChange={(event) => {
                                        const file = event.target.files[0];
                                        if (!file) return;
                                        const reader = new FileReader();
                                        reader.onload = () => setEditForm((current) => ({ ...current, profile_photo: reader.result }));
                                        reader.readAsDataURL(file);
                                    }} />
                                    {editForm.profile_photo && <img className="employee-edit-photo-preview" src={editForm.profile_photo} alt="Profile preview" />}
                                </label>
                            </div>
                            <div className="edit-form-actions">
                                <button type="button" onClick={() => setIsEditing(false)}>Cancel</button>
                                <button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</button>
                            </div>
                        </form>
                    </div>
                )}
                {sectionEditor && (
                    <div className="employee-edit-overlay">
                        <form className="employee-edit-form" onSubmit={saveSection}>
                            <div className="edit-form-header">
                                <h2>Edit {sectionEditor} Details</h2>
                                <button type="button" onClick={() => { setSectionEditor(null); setEducationEditorId(null); }}>×</button>
                            </div>
                            <div className="edit-form-grid">
                                {sectionFields[sectionEditor].map(([name, label]) => (
                                    <label key={name}>{label}
                                        {name === "make_primary" ? (
                                            <select name={name} value={sectionForm[name] ? "true" : "false"} onChange={({ target }) => setSectionForm((current) => ({ ...current, [target.name]: target.value === "true" }))}>
                                                <option value="false">No</option>
                                                <option value="true">Yes</option>
                                            </select>
                                        ) : name.includes("date") || name === "deadline" ? (
                                            <DatePicker value={sectionForm[name] || ""} onChange={(value) => setSectionForm((current) => ({ ...current, [name]: value }))} />
                                        ) : name === "start_year" || name === "end_year" ? (
                                            <select name={name} value={sectionForm[name] || ""} onChange={({ target }) => setSectionForm((current) => ({ ...current, [target.name]: target.value }))}>
                                                <option value="">Select year</option>
                                                {Array.from({ length: 81 }, (_, index) => String(new Date().getFullYear() - index)).map((year) => <option key={year} value={year}>{year}</option>)}
                                            </select>
                                        ) : name === "education_type" ? (
                                            <select name={name} value={sectionForm[name] || "Full Time"} onChange={({ target }) => setSectionForm((current) => ({ ...current, [target.name]: target.value }))}>
                                                <option>Full Time</option>
                                                <option>Part Time</option>
                                                <option>Distance</option>
                                            </select>
                                        ) : (
                                            <input name={name} type="text" value={sectionForm[name] || ""} onChange={({ target }) => setSectionForm((current) => ({ ...current, [target.name]: target.value }))} />
                                        )}
                                    </label>
                                ))}
                            </div>
                            <div className="edit-form-actions">
                                <button type="button" onClick={() => { setSectionEditor(null); setEducationEditorId(null); }}>Cancel</button>
                                <button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</button>
                            </div>
                        </form>
                    </div>
                )}
                </div>
            </DashboardLayout>
            <Modal
                isOpen={Boolean(notification)}
                onClose={() => setNotification("")}
                title="Unable to save changes"
            >
                <div className="employee-notification">
                    <div className="employee-notification-icon">!</div>
                    <p>{notification}</p>
                    <button type="button" onClick={() => setNotification("")}>OK</button>
                </div>
            </Modal>
            <Modal
                isOpen={showResetPasswordConfirm}
                onClose={() => {
                    setShowResetPasswordConfirm(false);
                    setNewPassword("");
                    setRepeatPassword("");
                    setShowPassword(false);
                }}
                title="Reset employee password"
            >
                <div className="password-confirmation">
                    <div className="password-confirmation-icon">
                        <KeyRound size={42} strokeWidth={2.2} />
                    </div>
                    <p>Set a new password for {employee.name}</p>
                    <label className="custom-password-field">
                        New password
                        <span className="password-input-wrap">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                placeholder="Enter new password"
                                minLength={6}
                                required
                            />
                            <button
                                type="button"
                                className="password-visibility-button"
                                onClick={() => setShowPassword((visible) => !visible)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </span>
                    </label>
                    <label className="custom-password-field">
                        Repeat password
                        <span className="password-input-wrap">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={repeatPassword}
                                onChange={(event) => setRepeatPassword(event.target.value)}
                                placeholder="Repeat new password"
                                minLength={6}
                                required
                            />
                        </span>
                    </label>
                    <small className="password-helper-text">
                        <span>Minimum 6 characters</span>
                        <span className="helper-divider">|</span>
                        <span>Both passwords must match</span>
                    </small>
                    <div className="password-confirmation-actions">
                        <button type="button" className="cancel-button" onClick={() => setShowResetPasswordConfirm(false)}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShowResetPasswordConfirm(false);
                                resetEmployeePassword();
                            }}
                        >
                            Reset Password
                        </button>
                    </div>
                </div>
            </Modal>
            {educationDeleteId && (
                <div className="education-delete-overlay" onClick={() => setEducationDeleteId(null)}>
                    <div className="education-delete-card" role="dialog" aria-modal="true" aria-labelledby="education-delete-title" onClick={(event) => event.stopPropagation()}>
                        <div className="education-delete-icon">🗑</div>
                        <h2 id="education-delete-title">Delete education record?</h2>
                        <p>This education record will be permanently removed from this employee profile.</p>
                        <div className="education-delete-actions">
                            <button type="button" className="education-delete-cancel" onClick={() => setEducationDeleteId(null)}>Cancel</button>
                            <button type="button" className="education-delete-confirm" onClick={confirmDeleteEducation}>Delete Record</button>
                        </div>
                    </div>
                </div>
            )}
            <Modal
                isOpen={Boolean(resetPasswordResult)}
                onClose={() => setResetPasswordResult(null)}
                title="Password updated successfully"
            >
                <div className="password-reset-result">
                    <div className="password-success-icon">✓</div>
                    <p>
                        The password for {resetPasswordResult?.employee_name} was updated successfully.
                    </p>
                    <small>
                        The employee can now log in with the new password.
                    </small>
                    <button type="button" onClick={() => setResetPasswordResult(null)}>Done</button>
                </div>
            </Modal>
        </>
    );
}

function InfoSection({ title, rows }) {
    return (
        <section className="info-section">
            <h3>{title}</h3>
            {rows.map(([label, value]) => (
                <p key={label}><span>{label}</span><strong>{value || "-"}</strong></p>
            ))}
        </section>
    );
}

function DetailPanel({ title, content, isOpen, onToggle, onEdit }) {
    return (
        <section className={`detail-panel ${isOpen ? "open" : "collapsed"}`}>
            <header>
                <h2>{title}</h2>
                <button type="button" className="panel-edit-button" onClick={onEdit} aria-label={`Edit ${title}`}>✎</button>
                <button type="button" className="panel-toggle-button" onClick={onToggle} aria-label={`${isOpen ? "Collapse" : "Expand"} ${title}`}>
                    {isOpen ? "⌃" : "⌄"}
                </button>
            </header>
            {isOpen && content && (
                <div className={`detail-panel-content ${typeof content === "string" ? "plain" : ""} ${["Education Details", "Experience"].includes(title) ? "wide" : ""}`}>
                    {content}
                </div>
            )}
        </section>
    );
}

function formatSection(section) {
    if (!section) {
        return "No details added yet.";
    }

    if (Array.isArray(section)) {
        if (section.length === 0) {
            return "No details added yet.";
        }

        return section.map((item, index) => {
            const entries = Object.entries(item || {})
                .filter(([key, value]) => !["id", "employee_id", "created_at", "updated_at"].includes(key) && value !== null && value !== "")
                .map(([key, value]) => (
                    <div className="detail-field" key={`${index}-${key}`}>
                        <span>{key.replaceAll("_", " ")}</span>
                        <strong>{typeof value === "object" ? JSON.stringify(value) : value}</strong>
                    </div>
                ));

            return entries.length > 0 ? (
                <div className="detail-section-group" key={`section-${index}`}>
                    {entries}
                </div>
            ) : "No details added yet.";
        });
    }

    if (typeof section !== "object") {
        return String(section || "No details added yet.");
    }

    const entries = Object.entries(section)
        .filter(([key, value]) => !["id", "employee_id", "created_at", "updated_at"].includes(key) && value !== null && value !== "")
        .map(([key, value]) => (
            <div className="detail-field" key={key}>
                <span>{key.replaceAll("_", " ")}</span>
                <strong>{typeof value === "object" ? JSON.stringify(value) : value}</strong>
            </div>
        ));

    return entries.length > 0 ? entries : "No details added yet.";
}

export default EmployeeDetails;