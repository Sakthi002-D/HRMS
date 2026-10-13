import { isValidElement, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Eye, EyeOff, KeyRound, Upload } from "lucide-react";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import DatePicker from "../../components/layout/common/DatePicker";
import Modal from "../../components/layout/common/Modal";
import { DocumentToast, EmployeeDocumentPreviewModal } from "../../components/documents/EmployeeDocumentOverlays";
import {
    formatDocumentDate,
    listEmployeeDocuments,
    uploadEmployeeDocument as uploadSharedEmployeeDocument,
} from "../../components/documents/employeeDocumentApi";
import "./EmployeeDetails.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
import { authHeaders } from "../../utils/auth";
// [type, label, who uploads it] — must match DOCUMENT_TYPES in backend/routes/employeeDocuments.js
const EMPLOYEE_DOCUMENTS = [
    ["employment_contract", "Employment Contract", "HR"],
    ["offer_letter", "Offer Letter", "HR"],
    ["visa_copy", "Visa Copy", "EMPLOYEE"],
    ["qid_copy", "QID Copy", "HR"],
    ["passport_copy", "Passport Copy", "EMPLOYEE"],
];

// "Full Time" → full_time (translation key); the saved value itself stays English
const valueKey = (value) => String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");

async function readApiResponse(response) {
    const responseText = await response.text();
    try {
        return responseText ? JSON.parse(responseText) : {};
    } catch {
        throw new Error(
            i18n.t("employeeDetails.errors.apiUnavailable", { status: response.status, defaultValue: "Employee details API is unavailable ({{status}}). Restart or redeploy the backend." })
        );
    }
}

function EmployeeDetails() {
    const { t } = useTranslation();
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
    const [uploadingDocument, setUploadingDocument] = useState("");
    const [employeeDocuments, setEmployeeDocuments] = useState({});
    const [documentToast, setDocumentToast] = useState(null);
    const [previewDocument, setPreviewDocument] = useState(null);
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
    
    // Load this employee's uploaded documents once the employee is known
    const loadedEmployeeId = employee?.employee_id;
    useEffect(() => {
        if (!loadedEmployeeId) return undefined;
        let ignore = false;
        listEmployeeDocuments(loadedEmployeeId, true)
            .then((rows) => {
                if (!ignore) setEmployeeDocuments(Object.fromEntries(rows.map((row) => [row.doc_type, row])));
            })
            .catch((loadError) => {
                if (!ignore) setDocumentToast({ type: "error", message: loadError.message });
            });
        return () => { ignore = true; };
    }, [loadedEmployeeId]);
    
    // Coming from a "Visa / Passport updated" notification: scroll to Employee Documents
    const { hash } = useLocation();
    useEffect(() => {
        if (loading || hash !== "#employee-documents") return undefined;
        const timer = window.setTimeout(() => {
            window.document.getElementById("employee-documents")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
        return () => window.clearTimeout(timer);
    }, [loading, hash]);

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
                setError(t("employeeDetails.errors.notFound", { defaultValue: "Employee not found" }));
                return;
            }

            setEmployee(foundEmployee);
            const detailsResponse = await fetch(
                `${API_URL}/api/employees/${foundEmployee.employee_id}/details`
            );
            if (!detailsResponse.ok) {
                throw new Error(
                    t("employeeDetails.errors.apiUnavailable", { status: detailsResponse.status, defaultValue: "Employee details API is unavailable ({{status}}). Restart or redeploy the backend." })
                );
            }
            const details = await readApiResponse(detailsResponse);
            setEmployee((current) => ({ ...current, ...details }));
        } catch (error) {
            console.error("Employee details error:", error);
            setError(t("employeeDetails.errors.connection", { defaultValue: "Unable to connect to backend" }));
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

    // Saved values stay English; only the shown text is translated (Employees List keys as a second source)
    const valueLabel = (group, value) => (value === null || value === undefined || value === ""
        ? value
        : t([`employeeProfile.values.${group}.${valueKey(value)}`, `employeesList.values.${group}.${valueKey(value)}`], { defaultValue: String(value) }));
    // Phones, emails, IDs, codes and dates keep their left-to-right order inside the Arabic page
    const ltr = (value) => (value === null || value === undefined || value === "" ? value : <span dir="ltr" className="ltr-text">{value}</span>);
    // Text typed by people (address, names, about…) shows in its own direction, English or Arabic
    const auto = (value) => (value === null || value === undefined || value === "" ? value : <span dir="auto" className="details-free-text">{value}</span>);
    // Bank / Family panels: labels come from the saved field names; Arabic names live only in ar.json, so English is unchanged
    const sectionLabel = (key) => t(`employeeDetails.fieldLabels.${key}`, { defaultValue: key.replaceAll("_", " ") });
    const sectionValue = (value, key) => (key === "marital_status"
        ? valueLabel("maritalStatus", value)
        : key === "account_type"
            ? valueLabel("accountType", value)
            : ["account_number", "ifsc_code"].includes(key) ? ltr(value) : auto(value));

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
        setNotification("");
        try {
            const response = await fetch(`${API_URL}/api/employees/${employee.employee_id}`, {
                method: "PUT",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(editForm),
            });
            const data = await readApiResponse(response);
            if (!response.ok) {
                throw new Error(
                    [data.message, data.details].filter(Boolean).join(": ") ||
                    t("employeeDetails.errors.updateFailed", { defaultValue: "Failed to update employee" })
                );
            }
            setEmployee((current) => ({ ...current, ...data }));
            await fetchEmployee();
            setIsEditing(false);
        } catch (saveError) {
            console.error("Employee update error:", saveError);
            setNotification(saveError.message);
        } finally {
            setIsSaving(false);
        }
    };

    const uploadEmployeeDocument = async (documentType, documentName, file) => {
        if (!file) return;
        try {
            setUploadingDocument(documentType);
            const document = await uploadSharedEmployeeDocument(employee.employee_id, documentType, file, true);
            setEmployeeDocuments((current) => ({ ...current, [documentType]: document }));
            setDocumentToast({ type: "success", message: t("employeeDocuments.uploadedSuccess", { title: documentName, defaultValue: "{{title}} uploaded successfully" }) });
        } catch (uploadError) {
            setDocumentToast({ type: "error", message: uploadError.message });
        } finally {
            setUploadingDocument("");
        }
    };

    const sectionFields = {
        about: [["about", t("profileEdit.sectionFields.about", { defaultValue: "About Employee" })]],
        bank: [["account_holder_name", t("profileEdit.sectionFields.account_holder_name", { defaultValue: "Account Holder Name" })], ["account_number", t("profileEdit.sectionFields.account_number", { defaultValue: "Account Number" })], ["bank_name", t("profileEdit.sectionFields.bank_name", { defaultValue: "Bank Name" })], ["branch_name", t("profileEdit.sectionFields.branch_name", { defaultValue: "Branch Name" })], ["ifsc_code", t("profileEdit.sectionFields.ifsc_code", { defaultValue: "IFSC Code" })], ["account_type", t("profileEdit.sectionFields.account_type", { defaultValue: "Account Type" })]],
        family: [["father_name", t("profileEdit.sectionFields.father_name", { defaultValue: "Father Name" })], ["mother_name", t("profileEdit.sectionFields.mother_name", { defaultValue: "Mother Name" })], ["spouse_name", t("profileEdit.sectionFields.spouse_name", { defaultValue: "Spouse Name" })], ["spouse_employment", t("profileEdit.sectionFields.spouse_employment", { defaultValue: "Spouse Employment" })], ["marital_status", t("profileEdit.sectionFields.marital_status", { defaultValue: "Marital Status" })], ["children_count", t("profileEdit.sectionFields.children_count", { defaultValue: "Children Count" })]],
        employment: [["legal_entity", t("profileEdit.sectionFields.legal_entity", { defaultValue: "Legal Entity" })], ["worker_type", t("profileEdit.sectionFields.worker_type", { defaultValue: "Worker Type" })], ["employee_id", t("profileEdit.sectionFields.employee_id", { defaultValue: "Personnel Number" })], ["employment_category", t("profileEdit.sectionFields.employment_category", { defaultValue: "Employment Category" })], ["joining_date", t("profileEdit.sectionFields.joining_date", { defaultValue: "Employment Start Date" })], ["employment_end_date", t("profileEdit.sectionFields.employment_end_date", { defaultValue: "Employment End Date" })], ["employment_type", t("profileEdit.sectionFields.employment_type", { defaultValue: "Employment Type" })], ["project_role_id", t("profileEdit.sectionFields.project_role_id", { defaultValue: "Project Role ID" })], ["termination_reason", t("profileEdit.sectionFields.termination_reason", { defaultValue: "Termination Reason" })], ["last_date_worked", t("profileEdit.sectionFields.last_date_worked", { defaultValue: "Last Date Worked" })]],
        position: [["position", t("profileEdit.sectionFields.position", { defaultValue: "Position" })], ["position_title", t("profileEdit.sectionFields.position_title", { defaultValue: "Position Title" })], ["assignment_start", t("profileEdit.sectionFields.assignment_start", { defaultValue: "Assignment Start" })], ["assignment_end", t("profileEdit.sectionFields.assignment_end", { defaultValue: "Assignment End" })], ["make_primary", t("employeeProfile.position.makePrimary", { defaultValue: "Make Primary" })]],
        education: [["qualification", t("profileEdit.sectionFields.qualification", { defaultValue: "Degree / Qualification" })], ["institution", t("profileEdit.sectionFields.institution", { defaultValue: "Institution / University" })], ["field_of_study", t("profileEdit.sectionFields.field_of_study", { defaultValue: "Field of Study" })], ["specialization", t("profileEdit.sectionFields.specialization", { defaultValue: "Specialization" })], ["start_year", t("profileEdit.sectionFields.start_year", { defaultValue: "Start Year" })], ["end_year", t("profileEdit.sectionFields.end_year", { defaultValue: "End Year" })], ["grade", t("profileEdit.sectionFields.grade", { defaultValue: "Grade / CGPA" })], ["education_type", t("profileEdit.sectionFields.education_type", { defaultValue: "Education Type" })], ["location", t("profileEdit.sectionFields.location", { defaultValue: "Location" })]],
        experience: [["company_name", t("profileEdit.sectionFields.company_name", { defaultValue: "Company Name" })], ["designation", t("employeeDetails.fields.designation", { defaultValue: "Designation" })], ["start_date", t("profileEdit.sectionFields.start_date", { defaultValue: "Start Date" })], ["end_date", t("profileEdit.sectionFields.end_date", { defaultValue: "End Date" })], ["description", t("employeeDetails.fields.description", { defaultValue: "Description" })]],
        project: [["project_name", t("employeeDetails.fields.projectName", { defaultValue: "Project Name" })], ["description", t("employeeDetails.fields.description", { defaultValue: "Description" })], ["project_lead", t("employeeDetails.fields.projectLead", { defaultValue: "Project Lead" })], ["start_date", t("profileEdit.sectionFields.start_date", { defaultValue: "Start Date" })], ["deadline", t("employeeDetails.fields.deadline", { defaultValue: "Deadline" })], ["status", t("profileEdit.fields.status", { defaultValue: "Status" })]],
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
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(body),
            });
            const data = await readApiResponse(response);
            if (!response.ok) throw new Error(data.message || t("employeeDetails.errors.saveFailed", { defaultValue: "Failed to save details" }));

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
                headers: authHeaders(),
            });
            if (!response.ok) {
                throw new Error(t("employeeDetails.errors.deleteEducationFailed", { defaultValue: "Unable to delete education record" }));
            }
            setEmployee((current) => ({
                ...current,
                education: (current.education || []).filter((record) => record.id !== educationId),
            }));
        } catch (deleteError) {
            setNotification(deleteError.message || t("employeeDetails.errors.deleteEducationFailed", { defaultValue: "Unable to delete education record" }));
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
                setNotification(t("employeeDetails.password.tooShort", { defaultValue: "New password must be at least 6 characters." }));
                return;
            }
            if (submittedNewPassword !== submittedRepeatPassword) {
                setNotification(t("employeeDetails.password.mismatch", { defaultValue: "New password and repeat password do not match." }));
                return;
            }

            const response = await fetch(
                `${API_URL}/api/employees/${employee.employee_id}/reset-password`,
                {
                    method: "POST",
                    headers: authHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({ custom_password: submittedNewPassword }),
                }
            );
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || t("employeeDetails.password.resetFailed", { defaultValue: "Failed to reset employee password" }));
            }

            setResetPasswordResult({
                ...data,
                is_custom_password: true,
            });
            setNewPassword("");
            setRepeatPassword("");
        } catch (resetError) {
            setNotification(resetError.message || t("employeeDetails.password.resetError", { defaultValue: "Unable to reset employee password" }));
        }
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div className="employee-details-loading">
                    <div className="loading-spinner"></div>
                    <p>{t("employeeDetails.loading", { defaultValue: "Loading employee details..." })}</p>
                </div>
            </DashboardLayout>
        );
    }

    if (error || !employee) {
        return (
            <DashboardLayout>
                <div className="employee-details-error">
                    <div className="error-icon">!</div>

                    <h2>{t("employeeDetails.notFoundTitle", { defaultValue: "Employee Not Found" })}</h2>

                    <p>
                        {error ||
                            t("employeeDetails.notFoundMessage", { defaultValue: "The requested employee could not be found." })}
                    </p>

                    <button
                        onClick={() => navigate("/employees")}
                    >
                        <span className="details-back-arrow" aria-hidden="true">←</span> {t("employeeDetails.backToEmployees", { defaultValue: "Back to Employees" })}
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
        [t("employeeProfile.basic.phone", { defaultValue: "Phone" }), ltr(employee.phone)],
        [t("employeeProfile.basic.qid", { defaultValue: "QID" }), ltr(formatQid(employee.employee_id))],
        [t("employeeProfile.basic.email", { defaultValue: "Email" }), ltr(employee.email)],
        [t("employeeProfile.basic.gender", { defaultValue: "Gender" }), valueLabel("gender", employee.gender)],
        [t("employeeProfile.basic.birthday", { defaultValue: "Birthday" }), ltr(formatDate(employee.date_of_birth))],
        [t("employeeProfile.basic.joiningDate", { defaultValue: "Joining Date" }), ltr(formatDate(employee.joining_date))],
        [t("employeeProfile.basic.employmentType", { defaultValue: "Employment Type" }), valueLabel("employmentType", employee.employment_type)],
        [t("employeeProfile.basic.address", { defaultValue: "Address" }), auto(employee.address)],
    ];

    const renderEducationContent = () => {
        const educationRecords = Array.isArray(employee.education) ? employee.education : [];

        if (educationRecords.length === 0) {
            return (
                <div className="education-records">
                    <button type="button" className="add-education-button" onClick={addEducation}>{t("employeeProfile.education.add", { defaultValue: "+ Add Education" })}</button>
                </div>
            );
        }

        return (
            <div className="education-records">
                {educationRecords.map((education) => (
                    <article className="education-record" key={education.id || `${education.qualification}-${education.institution}`}>
                        <div>
                            <strong><span dir="auto" className="details-free-text">{education.qualification || t("employeeProfile.education.qualification", { defaultValue: "Qualification" })}{education.specialization ? ` ${education.specialization}` : ""}</span></strong>
                            <span>{auto(education.institution) || "-"}</span>
                            <small>
                                <bdi>{education.start_year || "-"}</bdi> - {education.currently_pursuing ? t("employeeProfile.education.present", { defaultValue: "Present" }) : <bdi>{education.end_year || "-"}</bdi>}
                                {education.grade ? <> • <bdi>{education.grade}</bdi></> : ""}
                            </small>
                        </div>
                        <div>
                            <button type="button" className="education-action-button edit" onClick={() => openSectionEditor("education", education.id)}>{t("employeeProfile.edit", { defaultValue: "Edit" })}</button>
                            <button type="button" className="education-action-button delete" onClick={() => setEducationDeleteId(education.id)}>{t("employeeProfile.delete", { defaultValue: "Delete" })}</button>
                        </div>
                    </article>
                ))}
                <button type="button" className="add-education-button" onClick={addEducation}>{t("employeeProfile.education.add", { defaultValue: "+ Add Education" })}</button>
            </div>
        );
    };

    const renderExperienceContent = () => {
        return (
            <div className="detail-content-grid">
                <div className="detail-content-cell">
                    <span>{t("employeeProfile.experience.company", { defaultValue: "Company" })}</span>
                    <strong>{auto(employee.experience?.company_name) || "-"}</strong>
                </div>
                <div className="detail-content-cell">
                    <span>{t("employeeDetails.experience.role", { defaultValue: "Role" })}</span>
                    <strong>{auto(employee.experience?.designation) || "-"}</strong>
                </div>
                <div className="detail-content-cell">
                    <span>{t("employeeDetails.experience.start", { defaultValue: "Start" })}</span>
                    <strong>{ltr(formatDate(employee.experience?.start_date)) || "-"}</strong>
                </div>
                <div className="detail-content-cell">
                    <span>{t("employeeDetails.experience.end", { defaultValue: "End" })}</span>
                    <strong>{ltr(formatDate(employee.experience?.end_date)) || "-"}</strong>
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
                        <span className="details-back-arrow" aria-hidden="true">←</span> {t("employeeDetails.backTitle", { defaultValue: "Employee Details" })}
                    </button>
                    <div className="topbar-actions">
                        <span className="details-heading">{t("employeeProfile.overview", { defaultValue: "Employee Overview" })}</span>
                        <button
                            className="collapse-btn"
                            type="button"
                            onClick={() => setOpenPanels((current) => {
                                const shouldOpen = Object.values(current).some(Boolean) === false;
                                return Object.fromEntries(Object.keys(current).map((key) => [key, shouldOpen]));
                            })}
                            aria-label={t("employeeDetails.toggleAll", { defaultValue: "Expand or collapse all employee details" })}
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
                        <h1>{auto(employee.name)}</h1>
                        <span className="verified-name">●</span>
                        <div className="profile-tags">
                            <span>● {employee.designation ? auto(employee.designation) : t("employeeProfile.employee", { defaultValue: "Employee" })}</span>
                            <span>{employee.employment_type ? valueLabel("employmentType", employee.employment_type) : t("employeeDetails.fullTimeFallback", { defaultValue: "Full time" })}</span>
                        </div>
                        <div className="summary-actions">
                            <button type="button" onClick={openEditor}>✎ {t("employeeProfile.editInfo", { defaultValue: "Edit Info" })}</button>
                            <a href={`mailto:${employee.email}`}>▣ {t("employeeProfile.message", { defaultValue: "Message" })}</a>
                        </div>
                        <InfoSection title={t("employeeProfile.basic.title", { defaultValue: "Basic information" })} rows={detailRows} />
                        <InfoSection
                            title={t("employeeProfile.personal.title", { defaultValue: "Personal Information" })}
                            rows={[
                                [t("profileEdit.fields.passport_no", { defaultValue: "Passport No" }), ltr(employee.passport_no)],
                                [t("profileEdit.fields.passport_exp_date", { defaultValue: "Passport Exp Date" }), ltr(formatDate(employee.passport_exp_date))],
                                [t("employeeProfile.personal.nationality", { defaultValue: "Nationality" }), auto(employee.nationality || employee.country || "Indian")],
                                [t("employeeProfile.personal.religion", { defaultValue: "Religion" }), auto(employee.religion)],
                                [t("employeeProfile.personal.maritalStatus", { defaultValue: "Marital status" }), valueLabel("maritalStatus", employee.marital_status)],
                                [t("employeeProfile.personal.childrenCount", { defaultValue: "No. of children" }), employee.children_count],
                            ]}
                        />
                        <div className="info-section emergency-section">
                            <h3>{t("employeeProfile.emergency.title", { defaultValue: "Emergency Contact Number" })}</h3>
                            <p><b>{t("employeeProfile.emergency.primary", { defaultValue: "Primary" })}</b><strong>{ltr(employee.emergency_contact) || "-"}</strong></p>
                        </div>
                    </aside>

                    <main className="employee-detail-content">
                        <DetailPanel panelKey="about" isOpen={openPanels.about} onToggle={() => setOpenPanels((current) => ({ ...current, about: !current.about }))} title={t("employeeProfile.panels.about", { defaultValue: "About Employee" })} content={t("employeeProfile.defaultAbout", { name: `\u2068${employee.name}\u2069`, department: `\u2068${employee.department || t("employeeProfile.defaultDepartment", { defaultValue: "organization" })}\u2069`, designation: `\u2068${employee.designation || t("employeeProfile.defaultDesignation", { defaultValue: "valued employee" })}\u2069`, defaultValue: "Employee {{name}} is part of the {{department}} team as a {{designation}}." })} onEdit={() => openSectionEditor("about")} />
                        <DetailPanel panelKey="bank" isOpen={openPanels.bank} onToggle={() => setOpenPanels((current) => ({ ...current, bank: !current.bank }))} title={t("employeeProfile.panels.bank", { defaultValue: "Bank Information" })} onEdit={() => openSectionEditor("bank")} content={formatSection(employee.bank, t, sectionValue, sectionLabel)} />
                        <DetailPanel panelKey="family" isOpen={openPanels.family} onToggle={() => setOpenPanels((current) => ({ ...current, family: !current.family }))} title={t("employeeProfile.panels.family", { defaultValue: "Family Information" })} onEdit={() => openSectionEditor("family")} content={formatSection(employee.family, t, sectionValue, sectionLabel)} />
                        <DetailPanel panelKey="employment" isOpen={openPanels.employment} onToggle={() => setOpenPanels((current) => ({ ...current, employment: !current.employment }))} title={t("employeeProfile.panels.employment", { defaultValue: "Employment Details" })} content={formatSection({
                            [t("employeeProfile.employment.legalEntity", { defaultValue: "Legal Entity" })]: ltr(employee.legal_entity || "SHLT"),
                            [t("employeeProfile.employment.workerType", { defaultValue: "Worker Type" })]: valueLabel("workerType", employee.worker_type || "Employee"),
                            [t("employeeProfile.employment.personnelNumber", { defaultValue: "Personnel Number" })]: ltr(employee.employee_id),
                            [t("employeeProfile.employment.employmentCategory", { defaultValue: "Employment Category" })]: valueLabel("employmentCategory", employee.employment_category),
                            [t("profileEdit.sectionFields.joining_date", { defaultValue: "Employment Start Date" })]: ltr(formatDate(employee.joining_date)),
                            [t("profileEdit.sectionFields.employment_end_date", { defaultValue: "Employment End Date" })]: (employee.employment_end_date || "Never") === "Never" ? t("employeeProfile.values.never", { defaultValue: "Never" }) : ltr(employee.employment_end_date),
                            [t("employeeProfile.employment.employmentType", { defaultValue: "Employment Type" })]: valueLabel("employmentType", employee.employment_type),
                            [t("employeeProfile.employment.projectRoleId", { defaultValue: "Project Role ID" })]: ltr(employee.project_role_id),
                            [t("employeeProfile.employment.terminationReason", { defaultValue: "Termination Reason" })]: auto(employee.termination_reason),
                            [t("employeeProfile.employment.lastDateWorked", { defaultValue: "Last Date Worked" })]: ltr(employee.last_date_worked),
                        }, t)} onEdit={() => openSectionEditor("employment")} />
                        <DetailPanel panelKey="position" isOpen={openPanels.position} onToggle={() => setOpenPanels((current) => ({ ...current, position: !current.position }))} title={t("employeeProfile.panels.position", { defaultValue: "Position Details" })} content={formatSection({
                            [t("employeeProfile.position.position", { defaultValue: "Position" })]: auto(employee.position || employee.designation),
                            [t("employeeProfile.position.positionTitle", { defaultValue: "Position Title" })]: auto(employee.position_title || employee.designation),
                            [t("employeeProfile.position.assignmentStart", { defaultValue: "Assignment Start" })]: ltr(formatDate(employee.assignment_start || employee.joining_date)),
                            [t("employeeProfile.position.assignmentEnd", { defaultValue: "Assignment End" })]: ltr(formatDate(employee.assignment_end)),
                            [t("employeeProfile.position.makePrimary", { defaultValue: "Make Primary" })]: employee.make_primary ? t("employeeProfile.values.yes", { defaultValue: "Yes" }) : t("employeeProfile.values.no", { defaultValue: "No" }),
                        }, t)} onEdit={() => openSectionEditor("position")} />
                        <div className="detail-panel-row">
                            <DetailPanel panelKey="education" isOpen={openPanels.education} onToggle={() => setOpenPanels((current) => ({ ...current, education: !current.education }))} title={t("employeeProfile.panels.education", { defaultValue: "Education Details" })} onEdit={() => openSectionEditor("education")} content={renderEducationContent()} />
                            <DetailPanel panelKey="experience" isOpen={openPanels.experience} onToggle={() => setOpenPanels((current) => ({ ...current, experience: !current.experience }))} title={t("employeeProfile.panels.experience", { defaultValue: "Experience" })} onEdit={() => openSectionEditor("experience")} content={renderExperienceContent()} />
                        </div>
                        <section className="projects-panel">
                            <div className="project-tabs" role="tablist" aria-label={t("employeeDetails.workDetails", { defaultValue: "Employee work details" })}>
                                <button type="button" role="tab" aria-selected={activeWorkTab === "projects"} className={activeWorkTab === "projects" ? "active" : ""} onClick={() => setActiveWorkTab("projects")}>{t("employeeProfile.work.projects", { defaultValue: "Projects" })}</button>
                                <button type="button" role="tab" aria-selected={activeWorkTab === "assets"} className={activeWorkTab === "assets" ? "active" : ""} onClick={() => setActiveWorkTab("assets")}>{t("employeeProfile.work.assets", { defaultValue: "Assets" })}</button>
                            </div>
                            {activeWorkTab === "projects" ? (
                                <div className="project-list" role="tabpanel">
                                    <article><span className="project-icon blue">C</span><div><b>{t("employeeProfile.work.management", { name: employee.department || t("employeeProfile.work.workforce", { defaultValue: "Workforce" }), defaultValue: "{{name}} Management" })}</b><p>{t("employeeProfile.work.managementHint", { defaultValue: "Employee responsibilities and assigned work" })}</p></div></article>
                                    <article><span className="project-icon purple">●</span><div><b>{t("employeeProfile.work.operations", { name: employee.designation || t("employeeProfile.employee", { defaultValue: "Employee" }), defaultValue: "{{name}} Operations" })}</b><p>{t("employeeProfile.work.operationsHint", { defaultValue: "Current role and organizational activities" })}</p></div></article>
                                </div>
                            ) : (
                                <div className="assets-empty-state" role="tabpanel">
                                    <span className="assets-empty-icon">▣</span>
                                    <div><b>{t("employeeProfile.work.noAssets", { defaultValue: "No assets assigned" })}</b><p>{t("employeeDetails.noAssetsHint", { defaultValue: "Company assets assigned to this employee will appear here." })}</p></div>
                                </div>
                            )}
                            {activeWorkTab === "projects" && (
                                <button className="section-edit-button" type="button" onClick={() => openSectionEditor("project")} aria-label={t("employeeDetails.editProjects", { defaultValue: "Edit projects" })}>✎</button>
                            )}
                        </section>
                        <section className="employee-documents-admin-panel" id="employee-documents">
                            <div className="employee-documents-admin-heading">
                                <div>
                                    <h2>{t("employeeDetails.documents.title", { defaultValue: "Employee Documents" })}</h2>
                                    <p>{t("employeeDetails.documents.subtitle", { defaultValue: "HR uploads the Employment Contract, Offer Letter and QID Copy. Visa and Passport copies are uploaded by the employee from the Employee portal." })}</p>
                                </div>
                            </div>
                            <div className="employee-documents-admin-grid">
                                {EMPLOYEE_DOCUMENTS.map(([type, englishLabel, uploadedBy]) => {
                                    const label = t(`employeeDocuments.items.${type}.title`, { defaultValue: englishLabel });
                                    const document = employeeDocuments[type];
                                    const isUploading = uploadingDocument === type;
                                    const hrUploads = uploadedBy === "HR";
                                    return <article className="employee-document-upload-field" key={type} aria-busy={isUploading}>
                                        <h3>{label}</h3>
                                        {hrUploads && <Upload className="employee-document-upload-icon" size={16} aria-hidden="true" />}
                                        {hrUploads && (
                                            <input
                                                type="file"
                                                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                                disabled={isUploading}
                                                onChange={(event) => {
                                                    const file = event.target.files?.[0];
                                                    event.target.value = "";
                                                    uploadEmployeeDocument(type, label, file);
                                                }}
                                            />
                                        )}
                                        <small role={isUploading ? "status" : undefined}>
                                            {isUploading
                                                ? t("employeeDocuments.uploading", { defaultValue: "Uploading..." })
                                                : document
                                                    ? document.uploaded_by_role === "EMPLOYEE"
                                                        ? t("employeeDetails.documents.uploadedByEmployee", { file: `\u2068${document.original_file_name}\u2069`, date: `\u2066${formatDocumentDate(document.uploaded_at)}\u2069`, defaultValue: "{{file}} · Uploaded by employee on {{date}}" })
                                                        : t("employeeDetails.documents.uploadedByHr", { file: `\u2068${document.original_file_name}\u2069`, date: `\u2066${formatDocumentDate(document.uploaded_at)}\u2069`, defaultValue: "{{file}} · Uploaded by HR on {{date}}" })
                                                    : hrUploads ? t("employeeDetails.documents.noDocument", { defaultValue: "No document uploaded" }) : t("employeeDetails.documents.waitingForEmployee", { defaultValue: "Waiting for employee upload" })}
                                        </small>
                                        {document && !isUploading && (
                                            <button
                                                type="button"
                                                className="employee-document-view-link"
                                                onClick={() => setPreviewDocument({ ...document, displayName: label })}
                                            >
                                                {t("employeeDocuments.view", { defaultValue: "View" })}
                                            </button>
                                        )}
                                    </article>;
                                })}
                            </div>
                        </section>
                        <section className="password-management-panel">
                            <div>
                                <h2>{t("employeeDetails.password.title", { defaultValue: "Password Management" })}</h2>
                                <p>
                                    {t("employeeDetails.password.description", { defaultValue: "Generate a temporary password for this employee when they cannot access their account." })}
                                </p>
                                <small>
                                    {t("employeeDetails.password.hint", { defaultValue: "The employee should change this temporary password after logging in." })}
                                </small>
                            </div>
                            <button type="button" onClick={() => setShowResetPasswordConfirm(true)}>
                                {t("employeeDetails.password.reset", { defaultValue: "Reset Password" })}
                            </button>
                        </section>
                    </main>
                </div>

                {isEditing && (
                    <div className="employee-edit-overlay">
                        <form className="employee-edit-form" onSubmit={saveEmployee}>
                            <div className="edit-form-header">
                                <h2>{t("employeeDetails.editTitle", { defaultValue: "Edit Employee Details" })}</h2>
                                <button type="button" onClick={() => setIsEditing(false)}>×</button>
                            </div>
                            <div className="edit-form-grid">
                                <h3 className="employee-edit-section-title">{t("profileEdit.sections.basic", { defaultValue: "Basic information" })}</h3>
                                {[
                                    ["employee_id", t("profileEdit.fields.employee_id", { defaultValue: "QID" }), "text"],
                                    ["name", t("profileEdit.fields.name", { defaultValue: "Full Name" }), "text"],
                                    ["date_of_birth", t("employeeDetails.fields.dateOfBirth", { defaultValue: "Date of Birth" }), "date"],
                                    ["phone", t("profileEdit.fields.phone", { defaultValue: "Phone" }), "tel"],
                                    ["email", t("profileEdit.fields.email", { defaultValue: "Email" }), "email"],
                                    ["address", t("profileEdit.fields.address", { defaultValue: "Address" }), "text"],
                                    ["designation", t("employeeDetails.fields.designation", { defaultValue: "Designation" }), "text"],
                                    ["department", t("profileEdit.fields.department", { defaultValue: "Department" }), "text"],
                                    ["joining_date", t("profileEdit.fields.joining_date", { defaultValue: "Joining Date" }), "date"],
                                    ["designation", t("profileEdit.fields.designation", { defaultValue: "Designation / Role" }), "text"],
                                    ["department", t("profileEdit.fields.department", { defaultValue: "Department" }), "text"],
                                ].map(([name, label, type]) => (
                                    <label key={name}>{label}
                                        {type === "date" ? (
                                            <DatePicker value={editForm[name] || ""} onChange={(value) => setEditForm((current) => ({ ...current, [name]: value }))} />
                                        ) : (
                                            <input name={name} type={type} dir={["employee_id", "phone", "email"].includes(name) ? "ltr" : "auto"} value={editForm[name] || ""} onChange={updateFormField} />
                                        )}
                                    </label>
                                ))}
                                <label>{t("profileEdit.fields.gender", { defaultValue: "Gender" })}
                                    <select name="gender" value={editForm.gender || ""} onChange={updateFormField}>
                                        <option value="">{t("profileEdit.selectGender", { defaultValue: "Select gender" })}</option><option value="Male">{valueLabel("gender", "Male")}</option><option value="Female">{valueLabel("gender", "Female")}</option><option value="Other">{valueLabel("gender", "Other")}</option>
                                    </select>
                                </label>
                                <label>{t("profileEdit.fields.employment_type", { defaultValue: "Employment Type" })}
                                    <select name="employment_type" value={editForm.employment_type || ""} onChange={updateFormField}>
                                        <option value="">{t("profileEdit.selectEmploymentType", { defaultValue: "Select employment type" })}</option><option value="Full Time">{valueLabel("employmentType", "Full Time")}</option><option value="Part Time">{valueLabel("employmentType", "Part Time")}</option><option value="Contract">{valueLabel("employmentType", "Contract")}</option><option value="Intern">{valueLabel("employmentType", "Intern")}</option>
                                    </select>
                                </label>
                                <label>{t("profileEdit.fields.status", { defaultValue: "Status" })}
                                    <select name="status" value={editForm.status || "Active"} onChange={updateFormField}>
                                        <option value="Active">{valueLabel("status", "Active")}</option>
                                        <option value="Inactive">{valueLabel("status", "Inactive")}</option>
                                        <option value="Resigned">{valueLabel("status", "Resigned")}</option>
                                        <option value="Retired">{valueLabel("status", "Retired")}</option>
                                        <option value="Dismissed">{valueLabel("status", "Dismissed")}</option>
                                        <option value="Terminated">{valueLabel("status", "Terminated")}</option>
                                    </select>
                                </label>
                                <h3 className="employee-edit-section-title">{t("profileEdit.sections.personal", { defaultValue: "Personal Information" })}</h3>
                                <label>{t("profileEdit.fields.passport_no", { defaultValue: "Passport No" })}
                                    <input name="passport_no" type="text" dir="ltr" value={editForm.passport_no || ""} onChange={updateFormField} />
                                </label>
                                <label>{t("profileEdit.fields.passport_exp_date", { defaultValue: "Passport Exp Date" })}
                                    <DatePicker value={editForm.passport_exp_date || ""} onChange={(value) => setEditForm((current) => ({ ...current, passport_exp_date: value }))} />
                                </label>
                                <label>{t("profileEdit.fields.nationality", { defaultValue: "Nationality" })}
                                    <input name="nationality" type="text" dir="auto" value={editForm.nationality || ""} onChange={updateFormField} />
                                </label>
                                <label>{t("profileEdit.fields.religion", { defaultValue: "Religion" })}
                                    <input name="religion" type="text" dir="auto" value={editForm.religion || ""} onChange={updateFormField} />
                                </label>
                                <label>{t("profileEdit.fields.marital_status", { defaultValue: "Marital Status" })}
                                    <select name="marital_status" value={editForm.marital_status || ""} onChange={updateFormField}>
                                        <option value="">{t("profileEdit.selectMaritalStatus", { defaultValue: "Select marital status" })}</option>
                                        <option value="Single">{valueLabel("maritalStatus", "Single")}</option><option value="Married">{valueLabel("maritalStatus", "Married")}</option><option value="Divorced">{valueLabel("maritalStatus", "Divorced")}</option><option value="Widowed">{valueLabel("maritalStatus", "Widowed")}</option>
                                    </select>
                                </label>
                                <label>{t("profileEdit.fields.children_count", { defaultValue: "No. of Children" })}
                                    <input name="children_count" type="number" min="0" value={editForm.children_count ?? ""} onChange={updateFormField} />
                                </label>
                                <h3 className="employee-edit-section-title">{t("profileEdit.sections.emergency", { defaultValue: "Emergency Contact Number" })}</h3>
                                <label>{t("profileEdit.fields.emergency_contact", { defaultValue: "Primary" })}
                                    <input name="emergency_contact" type="tel" dir="ltr" value={editForm.emergency_contact || ""} onChange={updateFormField} />
                                </label>
                                <h3 className="employee-edit-section-title">{t("profileEdit.sections.work", { defaultValue: "Work information" })}</h3>
                                <label>{t("profileEdit.fields.profile_photo", { defaultValue: "Profile Photo" })}
                                    <input type="file" accept="image/*" onChange={(event) => {
                                        const file = event.target.files[0];
                                        if (!file) return;
                                        const reader = new FileReader();
                                        reader.onload = () => setEditForm((current) => ({ ...current, profile_photo: reader.result }));
                                        reader.readAsDataURL(file);
                                    }} />
                                    {editForm.profile_photo && <img className="employee-edit-photo-preview" src={editForm.profile_photo} alt={t("profileEdit.photoPreview", { defaultValue: "Profile preview" })} />}
                                </label>
                            </div>
                            <div className="edit-form-actions">
                                <button type="button" onClick={() => setIsEditing(false)}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
                                <button type="submit" disabled={isSaving}>{isSaving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("profileEdit.save", { defaultValue: "Save Changes" })}</button>
                            </div>
                        </form>
                    </div>
                )}
                {sectionEditor && (
                    <div className="employee-edit-overlay">
                        <form className="employee-edit-form" onSubmit={saveSection}>
                            <div className="edit-form-header">
                                <h2>{t("employeeDetails.editSection", { section: t(`employeeDetails.sectionNames.${sectionEditor}`, { defaultValue: sectionEditor }), defaultValue: "Edit {{section}} Details" })}</h2>
                                <button type="button" onClick={() => { setSectionEditor(null); setEducationEditorId(null); }}>×</button>
                            </div>
                            <div className="edit-form-grid">
                                {sectionFields[sectionEditor].map(([name, label]) => {
                                    const isSingleField = sectionFields[sectionEditor].length === 1;

                                    return (
                                        <label key={name} className={isSingleField ? "wide-field" : ""}>
                                            {label}
                                            {name === "make_primary" ? (
                                                <select name={name} value={sectionForm[name] ? "true" : "false"} onChange={({ target }) => setSectionForm((current) => ({ ...current, [target.name]: target.value === "true" }))}>
                                                    <option value="false">{t("employeeProfile.values.no", { defaultValue: "No" })}</option>
                                                    <option value="true">{t("employeeProfile.values.yes", { defaultValue: "Yes" })}</option>
                                                </select>
                                            ) : name.includes("date") || name === "deadline" ? (
                                                <DatePicker value={sectionForm[name] || ""} onChange={(value) => setSectionForm((current) => ({ ...current, [name]: value }))} />
                                            ) : name === "start_year" || name === "end_year" ? (
                                                <select name={name} value={sectionForm[name] || ""} onChange={({ target }) => setSectionForm((current) => ({ ...current, [target.name]: target.value }))}>
                                                    <option value="">{t("profileEdit.selectYear", { defaultValue: "Select year" })}</option>
                                                    {Array.from({ length: 81 }, (_, index) => String(new Date().getFullYear() - index)).map((year) => <option key={year} value={year}>{year}</option>)}
                                                </select>
                                            ) : name === "education_type" ? (
                                                <select name={name} value={sectionForm[name] || "Full Time"} onChange={({ target }) => setSectionForm((current) => ({ ...current, [target.name]: target.value }))}>
                                                    <option value="Full Time">{valueLabel("educationType", "Full Time")}</option>
                                                    <option value="Part Time">{valueLabel("educationType", "Part Time")}</option>
                                                    <option value="Distance">{valueLabel("educationType", "Distance")}</option>
                                                </select>
                                            ) : name === "about" ? (
                                                <textarea
                                                    name={name}
                                                    dir="auto"
                                                    rows={4}
                                                    value={sectionForm[name] || ""}
                                                    onChange={({ target }) => setSectionForm((current) => ({ ...current, [target.name]: target.value }))}
                                                />
                                            ) : (
                                                <input name={name} type="text" dir={["account_number", "ifsc_code", "project_role_id", "employee_id"].includes(name) ? "ltr" : "auto"} value={sectionForm[name] || ""} onChange={({ target }) => setSectionForm((current) => ({ ...current, [target.name]: target.value }))} />
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                            <div className="edit-form-actions">
                                <button type="button" onClick={() => { setSectionEditor(null); setEducationEditorId(null); }}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
                                <button type="submit" disabled={isSaving}>{isSaving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("profileEdit.save", { defaultValue: "Save Changes" })}</button>
                            </div>
                        </form>
                    </div>
                )}
                </div>
            </DashboardLayout>
            <Modal
                isOpen={Boolean(notification)}
                onClose={() => setNotification("")}
                title={t("employeeDetails.unableToSave", { defaultValue: "Unable to save changes" })}
            >
                <div className="employee-notification">
                    <div className="employee-notification-icon">!</div>
                    <p>{notification}</p>
                    <button type="button" onClick={() => setNotification("")}>{t("employeesList.alerts.ok", { defaultValue: "OK" })}</button>
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
                title={t("employeeDetails.password.modalTitle", { defaultValue: "Reset employee password" })}
            >
                <div className="password-confirmation">
                    <div className="password-confirmation-icon">
                        <KeyRound size={42} strokeWidth={2.2} />
                    </div>
                    <p>{t("employeeDetails.password.setFor", { name: `\u2068${employee.name}\u2069`, defaultValue: "Set a new password for {{name}}" })}</p>
                    <label className="custom-password-field">
                        {t("employeeDetails.password.newPassword", { defaultValue: "New password" })}
                        <span className="password-input-wrap">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                placeholder={t("employeeDetails.password.enterNew", { defaultValue: "Enter new password" })}
                                minLength={6}
                                required
                            />
                            <button
                                type="button"
                                className="password-visibility-button"
                                onClick={() => setShowPassword((visible) => !visible)}
                                aria-label={showPassword ? t("employeeDetails.password.hide", { defaultValue: "Hide password" }) : t("employeeDetails.password.show", { defaultValue: "Show password" })}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </span>
                    </label>
                    <label className="custom-password-field">
                        {t("employeeDetails.password.repeatPassword", { defaultValue: "Repeat password" })}
                        <span className="password-input-wrap">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={repeatPassword}
                                onChange={(event) => setRepeatPassword(event.target.value)}
                                placeholder={t("employeeDetails.password.repeatNew", { defaultValue: "Repeat new password" })}
                                minLength={6}
                                required
                            />
                        </span>
                    </label>
                    <small className="password-helper-text">
                        <span>{t("employeeDetails.password.minimum", { defaultValue: "Minimum 6 characters" })}</span>
                        <span className="helper-divider">|</span>
                        <span>{t("employeeDetails.password.mustMatch", { defaultValue: "Both passwords must match" })}</span>
                    </small>
                    <div className="password-confirmation-actions">
                        <button type="button" className="cancel-button" onClick={() => setShowResetPasswordConfirm(false)}>
                            {t("profileEdit.cancel", { defaultValue: "Cancel" })}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShowResetPasswordConfirm(false);
                                resetEmployeePassword();
                            }}
                        >
                            {t("employeeDetails.password.reset", { defaultValue: "Reset Password" })}
                        </button>
                    </div>
                </div>
            </Modal>
            <DocumentToast toast={documentToast} onClose={() => setDocumentToast(null)} />
            <EmployeeDocumentPreviewModal
                employeeId={employee.employee_id}
                document={previewDocument}
                isHR
                onClose={() => setPreviewDocument(null)}
                onError={(message) => setDocumentToast({ type: "error", message })}
            />
            {educationDeleteId && (
                <div className="education-delete-overlay" onClick={() => setEducationDeleteId(null)}>
                    <div className="education-delete-card" role="dialog" aria-modal="true" aria-labelledby="education-delete-title" onClick={(event) => event.stopPropagation()}>
                        <div className="education-delete-icon">🗑</div>
                        <h2 id="education-delete-title">{t("employeeDetails.deleteEducation.title", { defaultValue: "Delete education record?" })}</h2>
                        <p>{t("employeeDetails.deleteEducation.message", { defaultValue: "This education record will be permanently removed from this employee profile." })}</p>
                        <div className="education-delete-actions">
                            <button type="button" className="education-delete-cancel" onClick={() => setEducationDeleteId(null)}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
                            <button type="button" className="education-delete-confirm" onClick={confirmDeleteEducation}>{t("employeeDetails.deleteEducation.confirm", { defaultValue: "Delete Record" })}</button>
                        </div>
                    </div>
                </div>
            )}
            <Modal
                isOpen={Boolean(resetPasswordResult)}
                onClose={() => setResetPasswordResult(null)}
                title={t("employeeDetails.password.updatedTitle", { defaultValue: "Password updated successfully" })}
            >
                <div className="password-reset-result">
                    <div className="password-success-icon">✓</div>
                    <p>
                        {t("employeeDetails.password.updatedMessage", { name: `\u2068${resetPasswordResult?.employee_name}\u2069`, defaultValue: "The password for {{name}} was updated successfully." })}
                    </p>
                    <small>
                        {t("employeeDetails.password.canLogIn", { defaultValue: "The employee can now log in with the new password." })}
                    </small>
                    <button type="button" onClick={() => setResetPasswordResult(null)}>{t("employeeDetails.password.done", { defaultValue: "Done" })}</button>
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

function DetailPanel({ panelKey, title, content, isOpen, onToggle, onEdit }) {
    const { t } = useTranslation();
    return (
        <section className={`detail-panel ${isOpen ? "open" : "collapsed"}`}>
            <header>
                <h2>{title}</h2>
                <button type="button" className="panel-edit-button" onClick={onEdit} aria-label={t("employeeProfile.editPanel", { title, defaultValue: "Edit {{title}}" })}>✎</button>
                <button type="button" className="panel-toggle-button" onClick={onToggle} aria-label={isOpen ? t("employeeProfile.collapsePanel", { title, defaultValue: "Collapse {{title}}" }) : t("employeeProfile.expandPanel", { title, defaultValue: "Expand {{title}}" })}>
                    {isOpen ? "⌃" : "⌄"}
                </button>
            </header>
            {isOpen && content && (
                <div className={`detail-panel-content ${typeof content === "string" ? "plain" : ""} ${["education", "experience"].includes(panelKey) ? "wide" : ""}`}>
                    {content}
                </div>
            )}
        </section>
    );
}

// label: shown name for a saved field (default "account_number" → "account number"); render: shown value
function formatSection(section, t, render = (value) => value, label = (key) => key.replaceAll("_", " ")) {
    const noDetails = t("employeeDetails.noDetails", { defaultValue: "No details added yet." });
    const show = (key, value) => (isValidElement(value) ? value : typeof value === "object" ? JSON.stringify(value) : render(value, key));

    if (!section) {
        return noDetails;
    }

    if (Array.isArray(section)) {
        if (section.length === 0) {
            return noDetails;
        }

        return section.map((item, index) => {
            const entries = Object.entries(item || {})
                .filter(([key, value]) => !["id", "employee_id", "created_at", "updated_at"].includes(key) && value !== null && value !== "")
                .map(([key, value]) => (
                    <div className="detail-field" key={`${index}-${key}`}>
                        <span>{label(key)}</span>
                        <strong>{show(key, value)}</strong>
                    </div>
                ));

            return entries.length > 0 ? (
                <div className="detail-section-group" key={`section-${index}`}>
                    {entries}
                </div>
            ) : noDetails;
        });
    }

    if (typeof section !== "object") {
        return String(section || noDetails);
    }

    const entries = Object.entries(section)
        .filter(([key, value]) => !["id", "employee_id", "created_at", "updated_at"].includes(key) && value !== null && value !== "")
        .map(([key, value]) => (
            <div className="detail-field" key={key}>
                <span>{label(key)}</span>
                <strong>{show(key, value)}</strong>
            </div>
        ));

    return entries.length > 0 ? entries : noDetails;
}

export default EmployeeDetails;