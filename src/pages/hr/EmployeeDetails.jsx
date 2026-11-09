import { isValidElement, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, BriefcaseBusiness, CalendarDays, ChevronDown, ChevronsUpDown, Clock3, Eye, EyeOff, FileText, FolderKanban, GraduationCap, KeyRound, Landmark, Mail, MapPin, Network, Pencil, RefreshCw, Upload, UsersRound } from "lucide-react";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import Modal from "../../components/layout/common/Modal";
import { DocumentToast, EmployeeDocumentPreviewModal } from "../../components/documents/EmployeeDocumentOverlays";
import EmployeeEditPage from "./EmployeeEditPage";
import EmployeeShiftPanel from "./EmployeeShiftPanel";
import EmployeeProjectList from "./EmployeeProjectList";
import { employeeValueLabel, serviceLength } from "./employeeProfileData";
import {
    formatDocumentDate,
    listEmployeeDocuments,
    uploadEmployeeDocument as uploadSharedEmployeeDocument,
} from "../../components/documents/employeeDocumentApi";
import "./EmployeeDetails.css";

import API_URL from "../../config/api";
import { authHeaders, getAuthRole } from "../../utils/auth";
import { formatAppDate } from "../../utils/appSettings";
import ResignationStagePill from "../../components/resignation/ResignationStagePill";
// [type, label, who uploads it] — must match DOCUMENT_TYPES in backend/routes/employeeDocuments.js
const EMPLOYEE_DOCUMENTS = [
    ["employment_contract", "Employment Contract", "HR"],
    ["offer_letter", "Offer Letter", "HR"],
    ["visa_copy", "Visa Copy", "EMPLOYEE"],
    ["qid_copy", "QID Copy", "HR"],
    ["passport_copy", "Passport Copy", "EMPLOYEE"],
];

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
    const [editSection, setEditSection] = useState(null);
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
    const [d365Syncing, setD365Syncing] = useState(false);
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

    const syncThisEmployee = async () => {
        if (d365Syncing || !employee?.employee_id) return;
        setD365Syncing(true);
        try {
            const response = await fetch(`${API_URL}/api/d365/sync/${encodeURIComponent(employee.employee_id)}`, { method: "POST" });
            const data = await readApiResponse(response);
            if (!response.ok) {
                throw new Error(data.message || t("employeeDetails.d365Sync.failed", { defaultValue: "D365 sync failed" }));
            }
            setDocumentToast({
                type: "success",
                message: data.updated
                    ? t("employeeDetails.d365Sync.updated", { defaultValue: "Synced from D365. Updated: {{fields}}", fields: data.fields.join(", ") })
                    : t("employeeDetails.d365Sync.upToDate", { defaultValue: "Already up to date with D365" }),
            });
            const newSlug = createSlug(data.name);
            if (data.updated && newSlug && newSlug !== employeeSlug) {
                navigate(`/employees/employeedetails/${newSlug}`, { replace: true });
            } else {
                await fetchEmployee();
            }
        } catch (syncError) {
            console.error("D365 single sync error:", syncError);
            setDocumentToast({ type: "error", message: syncError.message || t("employeeDetails.d365Sync.failed", { defaultValue: "D365 sync failed" }) });
        } finally {
            setD365Syncing(false);
        }
    };

    const formatDate = (date) => {
        if (!date) return "-";

        const parsedDate = new Date(date);

        if (isNaN(parsedDate.getTime())) {
            return date;
        }

        return formatAppDate(parsedDate);
    };

    const formatQid = (employeeId) => {
        const idNumber = String(employeeId || "").replace(/^EMP/i, "");
        return idNumber ? idNumber.padStart(3, "0") : "-";
    };

    // Saved values stay English; only the shown text is translated (Employees List keys as a second source)
    const valueLabel = (group, value) => employeeValueLabel(t, group, value);
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

    const openEditor = (section = "basic") => setEditSection(section);

    const finishEditing = async (name) => {
        setEditSection(null);
        setDocumentToast({ type: "success", message: t("employeeDetails.edit.saved", { defaultValue: "Employee details saved" }) });
        const newSlug = createSlug(name);
        if (newSlug && newSlug !== employeeSlug) {
            navigate(`/employees/employeedetails/${newSlug}`, { replace: true });
        } else {
            await fetchEmployee();
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

    if (editSection) {
        return (
            <DashboardLayout>
                <EmployeeEditPage
                    employee={employee}
                    initialSection={editSection}
                    onClose={() => setEditSection(null)}
                    onSaved={finishEditing}
                />
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
        [t("employeeProfile.basic.employmentType", { defaultValue: "Employment Type" }), valueLabel("employmentType", employee.employment_type)],
        [t("employeeProfile.basic.grade", { defaultValue: "Grade" }), ltr(employee.grade)],
        [t("employeeProfile.basic.address", { defaultValue: "Address" }), auto(employee.address)],
    ];

    const overviewStats = [
        [CalendarDays, t("employeeProfile.basic.joiningDate", { defaultValue: "Joining Date" }), ltr(formatDate(employee.joining_date))],
        [Clock3, t("employeeProfile.basic.yearsOfService", { defaultValue: "Years of Service" }), auto(serviceLength(t, employee.joining_date))],
        [MapPin, t("employeeProfile.basic.officeLocation", { defaultValue: "Office Location" }), auto(employee.work_location)],
        [Network, t("profileEdit.fields.department", { defaultValue: "Department" }), auto(employee.department)],
    ];
    const isActive = String(employee.status || "Active").toLowerCase() === "active";

    const renderEducationContent = () => {
        const records = Array.isArray(employee.education) ? employee.education : [];
        if (records.length === 0) return <p className="employee-record-empty">{t("employeeDetails.edit.empty.education", { defaultValue: "No education added yet" })}</p>;

        return (
            <div className="education-records">
                {records.map((education) => (
                    <article className="education-record" key={education.id}>
                        <div>
                            <strong>{auto(education.qualification) || t("employeeProfile.education.qualification", { defaultValue: "Qualification" })}</strong>
                            <span>{auto(education.institution) || "-"}</span>
                            <small>
                                <bdi>{education.start_year || "-"}</bdi> - {education.currently_pursuing ? t("employeeProfile.education.present", { defaultValue: "Present" }) : <bdi>{education.end_year || "-"}</bdi>}
                                {education.grade ? <> • <bdi>{education.grade}</bdi></> : ""}
                            </small>
                        </div>
                    </article>
                ))}
            </div>
        );
    };

    const renderExperienceContent = () => {
        const records = Array.isArray(employee.experience) ? employee.experience : [];
        if (records.length === 0) return <p className="employee-record-empty">{t("employeeDetails.edit.empty.experience", { defaultValue: "No experience added yet" })}</p>;

        return (
            <div className="education-records">
                {records.map((experience) => (
                    <article className="education-record" key={experience.id}>
                        <div>
                            <strong>{auto(experience.company_name) || "-"}</strong>
                            <span>{auto(experience.designation) || "-"}</span>
                            <small>
                                <bdi dir="ltr">{formatDate(experience.start_date)}</bdi> - {experience.currently_working ? t("employeeProfile.education.present", { defaultValue: "Present" }) : <bdi dir="ltr">{formatDate(experience.end_date)}</bdi>}
                            </small>
                        </div>
                    </article>
                ))}
            </div>
        );
    };

    return (
        <>
            <DashboardLayout>
                <div className="employee-details-page epf">
                <header className="epf-hero">
                    <div className="epf-hero-top">
                        <button type="button" className="epf-ghost" onClick={() => navigate("/employees")}>
                            <ArrowLeft className="epf-back-icon" size={16} aria-hidden="true" />
                            {t("employeeDetails.backToEmployees", { defaultValue: "Back to Employees" })}
                        </button>
                        <button
                            type="button"
                            className="epf-ghost"
                            onClick={() => setOpenPanels((current) => {
                                const shouldOpen = Object.values(current).some(Boolean) === false;
                                return Object.fromEntries(Object.keys(current).map((key) => [key, shouldOpen]));
                            })}
                            aria-label={t("employeeDetails.toggleAll", { defaultValue: "Expand or collapse all employee details" })}
                        >
                            <ChevronsUpDown size={16} aria-hidden="true" />
                            {Object.values(openPanels).some(Boolean)
                                ? t("employeeDetails.edit.collapseAll", { defaultValue: "Collapse all" })
                                : t("employeeDetails.edit.expandAll", { defaultValue: "Expand all" })}
                        </button>
                    </div>
                    <div className="epf-hero-main">
                        <div className="epf-avatar">
                            {employee.profile_photo ? <img src={employee.profile_photo} alt={employee.name} /> : initials}
                        </div>
                        <div className="epf-hero-copy">
                            <span className="epf-kicker">{t("employeeProfile.overview", { defaultValue: "Employee Overview" })}</span>
                            <h1>{auto(employee.name)}</h1>
                            <div className="epf-tags">
                                <span>{employee.designation ? auto(employee.designation) : t("employeeProfile.employee", { defaultValue: "Employee" })}</span>
                                <span>{employee.employment_type ? valueLabel("employmentType", employee.employment_type) : t("employeeDetails.fullTimeFallback", { defaultValue: "Full time" })}</span>
                                <span className={isActive ? "epf-tag-active" : "epf-tag-inactive"}>{valueLabel("status", employee.status || "Active")}</span>
                                <ResignationStagePill status={employee.resignation_status} />
                            </div>
                        </div>
                        <div className="epf-actions">
                            <button type="button" className="epf-primary" onClick={() => openEditor()}>
                                <Pencil size={15} aria-hidden="true" />
                                {t("employeeProfile.editInfo", { defaultValue: "Edit Info" })}
                            </button>
                            {employee.email && (
                                <a className="epf-secondary" href={`mailto:${employee.email}`}>
                                    <Mail size={15} aria-hidden="true" />
                                    {t("employeeProfile.message", { defaultValue: "Message" })}
                                </a>
                            )}
                            {getAuthRole() === "hr" && (
                                <button type="button" className="epf-secondary" onClick={syncThisEmployee} disabled={d365Syncing}>
                                    <RefreshCw size={15} aria-hidden="true" />
                                    {d365Syncing
                                        ? t("employeeDetails.d365Sync.syncing", { defaultValue: "Syncing..." })
                                        : t("employeeDetails.d365Sync.button", { defaultValue: "Sync this employee" })}
                                </button>
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
                    <aside className="employee-summary">
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
                        <DetailPanel panelKey="about" icon={FileText} isOpen={openPanels.about} onToggle={() => setOpenPanels((current) => ({ ...current, about: !current.about }))} title={t("employeeProfile.panels.about", { defaultValue: "About Employee" })} content={t("employeeProfile.defaultAbout", { name: `\u2068${employee.name}\u2069`, department: `\u2068${employee.department || t("employeeProfile.defaultDepartment", { defaultValue: "organization" })}\u2069`, designation: `\u2068${employee.designation || t("employeeProfile.defaultDesignation", { defaultValue: "valued employee" })}\u2069`, defaultValue: "Employee {{name}} is part of the {{department}} team as a {{designation}}." })} />
                        <DetailPanel panelKey="bank" icon={Landmark} isOpen={openPanels.bank} onToggle={() => setOpenPanels((current) => ({ ...current, bank: !current.bank }))} title={t("employeeProfile.panels.bank", { defaultValue: "Bank Information" })} content={formatSection(employee.bank, t, sectionValue, sectionLabel)} />
                        <DetailPanel panelKey="family" icon={UsersRound} isOpen={openPanels.family} onToggle={() => setOpenPanels((current) => ({ ...current, family: !current.family }))} title={t("employeeProfile.panels.family", { defaultValue: "Family Information" })} content={formatSection(employee.family, t, sectionValue, sectionLabel)} />
                        <DetailPanel panelKey="employment" icon={Briefcase} isOpen={openPanels.employment} onToggle={() => setOpenPanels((current) => ({ ...current, employment: !current.employment }))} title={t("employeeProfile.panels.employment", { defaultValue: "Employment Details" })} content={formatSection({
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
                        }, t)} />
                        <DetailPanel panelKey="position" icon={FolderKanban} isOpen={openPanels.position} onToggle={() => setOpenPanels((current) => ({ ...current, position: !current.position }))} title={t("employeeProfile.panels.position", { defaultValue: "Position Details" })} content={formatSection({
                            [t("employeeProfile.position.position", { defaultValue: "Position" })]: auto(employee.position || employee.designation),
                            [t("employeeProfile.position.positionTitle", { defaultValue: "Position Title" })]: auto(employee.position_title || employee.designation),
                            [t("employeeProfile.position.assignmentStart", { defaultValue: "Assignment Start" })]: ltr(formatDate(employee.assignment_start || employee.joining_date)),
                            [t("employeeProfile.position.assignmentEnd", { defaultValue: "Assignment End" })]: ltr(formatDate(employee.assignment_end)),
                            [t("employeeProfile.position.makePrimary", { defaultValue: "Make Primary" })]: employee.make_primary ? t("employeeProfile.values.yes", { defaultValue: "Yes" }) : t("employeeProfile.values.no", { defaultValue: "No" }),
                        }, t)} />
                        <EmployeeShiftPanel employeeId={employee.employee_id} formatDate={formatDate} />
                        <div className="detail-panel-row">
                            <DetailPanel panelKey="education" icon={GraduationCap} isOpen={openPanels.education} onToggle={() => setOpenPanels((current) => ({ ...current, education: !current.education }))} title={t("employeeProfile.panels.education", { defaultValue: "Education Details" })} content={renderEducationContent()} />
                            <DetailPanel panelKey="experience" icon={BriefcaseBusiness} isOpen={openPanels.experience} onToggle={() => setOpenPanels((current) => ({ ...current, experience: !current.experience }))} title={t("employeeProfile.panels.experience", { defaultValue: "Experience" })} content={renderExperienceContent()} />
                        </div>
                        <section className="projects-panel">
                            <div className="project-tabs" role="tablist" aria-label={t("employeeDetails.workDetails", { defaultValue: "Employee work details" })}>
                                <button type="button" role="tab" aria-selected={activeWorkTab === "projects"} className={activeWorkTab === "projects" ? "active" : ""} onClick={() => setActiveWorkTab("projects")}>{t("employeeProfile.work.projects", { defaultValue: "Projects" })}</button>
                                <button type="button" role="tab" aria-selected={activeWorkTab === "assets"} className={activeWorkTab === "assets" ? "active" : ""} onClick={() => setActiveWorkTab("assets")}>{t("employeeProfile.work.assets", { defaultValue: "Assets" })}</button>
                            </div>
                            {activeWorkTab === "projects" ? (
                                <EmployeeProjectList employeeId={employee.employee_id} />
                            ) : (
                                <div className="assets-empty-state" role="tabpanel">
                                    <span className="assets-empty-icon">▣</span>
                                    <div><b>{t("employeeProfile.work.noAssets", { defaultValue: "No assets assigned" })}</b><p>{t("employeeDetails.noAssetsHint", { defaultValue: "Company assets assigned to this employee will appear here." })}</p></div>
                                </div>
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

function DetailPanel({ panelKey, icon: Icon, title, content, isOpen, onToggle }) {
    const { t } = useTranslation();
    return (
        <section className={`detail-panel ${isOpen ? "open" : "collapsed"}`}>
            <header>
                <i className="epf-panel-icon" aria-hidden="true"><Icon size={18} /></i>
                <h2>{title}</h2>
                <button type="button" className="panel-toggle-button" onClick={onToggle} aria-label={isOpen ? t("employeeProfile.collapsePanel", { title, defaultValue: "Collapse {{title}}" }) : t("employeeProfile.expandPanel", { title, defaultValue: "Expand {{title}}" })}>
                    <ChevronDown size={17} aria-hidden="true" />
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