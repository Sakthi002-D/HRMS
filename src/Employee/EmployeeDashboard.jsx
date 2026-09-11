import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CalendarDays, Check, ChevronDown, Clock3, ClipboardList, FileText, Hourglass, KeyRound, Moon, Settings as SettingsIcon, Trash2, UserRound, X } from "lucide-react";
import DatePicker from "../components/layout/common/DatePicker";
import "./EmployeeDashboard.css";
import ApplyLeaveModal from "./ApplyLeaveModal";
import ChangePasswordModal from "./ChangePasswordModal";
import EmployeeAttendance from "./EmployeeAttendance";
import EmployeeEditModal from "./EmployeeEditModal";
import EmployeeProfile from "./EmployeeProfile";
import EmployeeSectionEditModal, { sectionFields } from "./EmployeeSectionEditModal";
import EmployeeSettings from "./EmployeeSettings";
import EmployeeSidebar from "./EmployeeSidebar";

const API_URL = "http://localhost:5000";
const DEFAULT_QATAR_HOLIDAYS = [
    { name: "National Day", date: "18 December", days: 1 },
    { name: "National Sports Day", date: "Second Tuesday of February", days: 1 },
    { name: "Eid al-Fitr", date: "Islamic calendar", days: 3 },
    { name: "Eid al-Adha", date: "Islamic calendar", days: 3 },
    { name: "Islamic New Year", date: "Islamic calendar", days: 1 },
    { name: "Prophet's Birthday", date: "Islamic calendar", days: 1 },
];
const EMPLOYEE_LEAVE_TYPES = ["Annual Leave", "Sick Leave", "Maternity Leave", "Paternity Leave", "Hajj Leave", "Emergency Leave", "Unpaid Leave (LOP)", "Compensatory Off", "Bereavement Leave"];
const LEAVE_RULES = {
    annual: { eligibleMonths: 12, underFiveYears: { annual: 21, monthly: 1.75 }, fiveYearsAndAbove: { annual: 28, monthly: 28 / 12 } },
    sick: { eligibleMonths: 3, totalDays: 84 }, maternity: { days: 50 }, bereavement: { days: 3 }, compensatory: { validityDays: 90 },
};
const parseDateOnly = (value) => {
    if (!value) return null;
    const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
};
const completedMonthsBetween = (startDate, endDate) => {
    if (!startDate || !endDate || endDate < startDate) return 0;
    return Math.max(0, (endDate.getFullYear() - startDate.getFullYear()) * 12 + endDate.getMonth() - startDate.getMonth() + (endDate.getDate() >= startDate.getDate() ? 1 : 0));
};
const daysBetweenInclusive = (fromDate, toDate) => {
    if (!fromDate || !toDate || toDate < fromDate) return 0;
    return Math.floor((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
};
const formatAttendanceTime = (time) => {
    if (!time || time === "-") return "-";
    const match = String(time).match(/^(\d{1,2}):(\d{2})/);
    if (!match) return time;
    const hours = Number(match[1]);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${String(displayHours).padStart(2, "0")}:${match[2]} ${period}`;
};

function EmployeeDashboard() {
    const navigate = useNavigate();

    const [employee, setEmployee] = useState(null);
    const [leaves, setLeaves] = useState([]);
    const [attendance, setAttendance] = useState([]);
    const [monthlyAttendance, setMonthlyAttendance] = useState([]);
    const [holidays, setHolidays] = useState(DEFAULT_QATAR_HOLIDAYS);
    const [holidaysExpanded, setHolidaysExpanded] = useState(true);
    const [openTrackingId, setOpenTrackingId] = useState(null);
    const [cancelLeaveId, setCancelLeaveId] = useState(null);
    const [liveNow, setLiveNow] = useState(new Date());
    const [attendanceSearch, setAttendanceSearch] = useState("");
    const [attendanceStatus, setAttendanceStatus] = useState("all");
    const [attendanceMonth, setAttendanceMonth] = useState("all");
    const [attendanceYear, setAttendanceYear] = useState("all");
    const [attendanceRows, setAttendanceRows] = useState(10);
    const [attendancePage, setAttendancePage] = useState(1);

    const [showApplyLeave, setShowApplyLeave] = useState(false);
    const [showEditProfile, setShowEditProfile] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", repeat_password: "" });
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [compactMode, setCompactMode] = useState(false);
    const [profileDraft, setProfileDraft] = useState(null);
    const [sectionEditor, setSectionEditor] = useState(null);
    const [educationEditorId, setEducationEditorId] = useState(null);
        const [educationDeleteId, setEducationDeleteId] = useState(null);
    const [sectionForm, setSectionForm] = useState({});
    const [profilePanels, setProfilePanels] = useState({
        about: true,
        bank: false,
        family: false,
        employment: false,
        position: false,
        education: false,
        experience: false,
    });
    const [profileWorkTab, setProfileWorkTab] = useState("projects");
    const [activeSection, setActiveSection] = useState("dashboard");

    const [formData, setFormData] = useState({
        leave_type: "Annual Leave",
        from_date: "",
        to_date: "",
        reason: ""
    });

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const clock = window.setInterval(() => setLiveNow(new Date()), 1000);
        return () => window.clearInterval(clock);
    }, []);

    useEffect(() => {
    const savedEmployee =
        sessionStorage.getItem("loggedInEmployee");

    if (!savedEmployee) {
        navigate("/login", { replace: true });
        return;
    }

    const employeeData = JSON.parse(savedEmployee);

    setEmployee(employeeData);

    fetchLeaves(employeeData.employee_id);
    fetchAttendance(employeeData.employee_id);
    fetchHolidayPolicy();

    fetch(`${API_URL}/api/employees/${employeeData.employee_id}/details`)
        .then((response) => response.ok ? response.json() : null)
        .then((details) => {
            if (details) {
                setEmployee((current) => ({ ...current, ...details }));
            }
        })
        .catch(() => {
            // Basic session details remain available if the optional profile request fails.
        });

    // Prevent browser Back from reopening dashboard
    window.history.pushState(null, "", window.location.href);

    const handleBackButton = () => {
        sessionStorage.removeItem("loggedInEmployee");

        navigate("/login", { replace: true });
    };

    window.addEventListener("popstate", handleBackButton);

    return () => {
        window.removeEventListener("popstate", handleBackButton);
    };

}, [navigate]);

    const fetchHolidayPolicy = async () => {
        try {
            const response = await fetch(`${API_URL}/api/leave-policies`);
            if (!response.ok) return;
            const data = await response.json();
            const configuredHolidays = data.policy?.qatarHolidayCalendar;
            if (Array.isArray(configuredHolidays) && configuredHolidays.length > 0) {
                setHolidays(configuredHolidays);
            }
        } catch (error) {
            console.error("Error fetching holiday policy:", error);
        }
    };

    const fetchLeaves = async (employeeId) => {
        try {
            const response = await fetch(
                `${API_URL}/api/leaves/employee/${employeeId}`
            );

            if (!response.ok) {
                throw new Error("Failed to fetch leaves");
            }

            const data = await response.json();

            setLeaves(data);

        } catch (error) {
            console.error("Error fetching leaves:", error);
        }
    };

    const fetchAttendance = async (employeeId) => {
        const today = new Date();
        const dates = Array.from({ length: 30 }, (_, index) => {
            const date = new Date(today);
            date.setDate(today.getDate() - index);
            return date.toISOString().slice(0, 10);
        });

        try {
            const responses = await Promise.all(
                dates.map((date) => fetch(`${API_URL}/api/attendance?date=${date}`))
            );
            const records = await Promise.all(
                responses.map((response) => response.ok ? response.json() : [])
            );

            const employeeRecords = records.flat().filter((record) => String(record.employee_id) === String(employeeId));
            setAttendance(employeeRecords);
            setMonthlyAttendance(employeeRecords);
        } catch (error) {
            console.error("Error fetching attendance:", error);
        }
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const applyLeave = async (e) => {
        e.preventDefault();

        if (!formData.from_date || !formData.to_date) {
            alert("Please select From Date and To Date");
            return;
        }

        if (formData.to_date < formData.from_date) {
            alert("To Date must be after From Date");
            return;
        }

        if (!selectedLeaveInfo.eligible) {
            alert(`${formData.leave_type} is not eligible yet. Please complete the required service period.`);
            return;
        }

        if (selectedLeaveInfo.remaining !== null && requestedDays > selectedLeaveInfo.remaining) {
            alert(`Only ${selectedLeaveInfo.remaining} day(s) remaining for ${formData.leave_type}.`);
            return;
        }

        try {
            setLoading(true);

            const response = await fetch(
                `${API_URL}/api/leaves`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        employee_id: employee.employee_id,
                        leave_type: formData.leave_type,
                        from_date: formData.from_date,
                        to_date: formData.to_date,
                        reason: formData.reason
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                alert(data.message || "Failed to apply leave");
                return;
            }

            alert("Leave applied successfully!");

            setFormData({
                leave_type: "Annual Leave",
                from_date: "",
                to_date: "",
                reason: ""
            });

            setShowApplyLeave(false);

            fetchLeaves(employee.employee_id);

        } catch (error) {
            console.error("Apply leave error:", error);
            alert("Unable to connect to backend");
        } finally {
            setLoading(false);
        }
    };

    const cancelLeave = async (leaveId) => {
        try {
            const response = await fetch(`${API_URL}/api/leaves/${leaveId}/cancel`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employee_id: employee.employee_id }),
            });
            const data = await response.json();
            if (!response.ok) {
                alert(data.message || "Unable to cancel leave request");
                return;
            }
            setOpenTrackingId(null);
            fetchLeaves(employee.employee_id);
        } catch (error) {
            alert("Unable to cancel leave request");
            console.error("Cancel leave error:", error);
        }
    };

    const logout = () => {
     sessionStorage.removeItem("loggedInEmployee");
     navigate("/login", { replace: true });
    };

    const openLeaveDetails = () => {
        setActiveSection("leave");
        setShowApplyLeave(false);
    };

    const openProfile = () => {
        setActiveSection("profile");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const openEditProfile = () => {
        setProfileDraft({
            employee_id: employee.employee_id || "",
            name: employee.name || "",
            phone: employee.phone || "",
            email: employee.email || "",
            address: employee.address || "",
            gender: employee.gender || "",
            date_of_birth: employee.date_of_birth ? String(employee.date_of_birth).slice(0, 10) : "",
            emergency_contact: employee.emergency_contact || "",
            nationality: employee.nationality || employee.country || "",
            religion: employee.religion || "",
            marital_status: employee.marital_status || "",
            children_count: employee.children_count ?? "",
            designation: employee.designation || "",
            department: employee.department || "",
            joining_date: employee.joining_date ? String(employee.joining_date).slice(0, 10) : "",
            employment_type: employee.employment_type || "",
            status: employee.status || "Active",
            passport_no: employee.passport_no || "",
            passport_exp_date: employee.passport_exp_date ? String(employee.passport_exp_date).slice(0, 10) : "",
            position: employee.position || employee.designation || "",
            position_title: employee.position_title || employee.designation || "",
            employment_category: employee.employment_category || "",
            project_role_id: employee.project_role_id || "",
            employment_end_date: employee.employment_end_date || "Never",
            termination_reason: employee.termination_reason || "",
            last_date_worked: employee.last_date_worked || "",
            legal_entity: employee.legal_entity || "SHLT",
            worker_type: employee.worker_type || "Employee",
            profile_photo: employee.profile_photo || "",
            assignment_start: employee.assignment_start ? String(employee.assignment_start).slice(0, 10) : "",
            assignment_end: employee.assignment_end ? String(employee.assignment_end).slice(0, 10) : "",
            make_primary: employee.make_primary || false,
        });
        setShowEditProfile(true);
    };

    const updateProfileDraft = (field, value) => {
        setProfileDraft((previous) => ({ ...previous, [field]: value }));
    };

    const openSectionEditor = (section, recordId = null) => {
        const records = section === "education" ? (Array.isArray(employee.education) ? employee.education : []) : [];
        const source = section === "about" || section === "employment" || section === "position" ? employee : section === "education" ? (records.find((record) => record.id === recordId) || {}) : (employee[section] || {});
        const defaultAbout = `Employee ${employee.name} is part of the ${employee.department || "organization"} team as a ${employee.designation || "valued employee"}.`;
        const nextSectionForm = Object.fromEntries(sectionFields[section].map(([name]) => {
            const value = source[name] ?? (name === "about" ? defaultAbout : "");
            return [name, name.includes("date") && value !== "Never" ? String(value).slice(0, 10) : value === "Never" ? "" : value];
        }));
        if (section === "education") nextSectionForm.currently_pursuing = Boolean(source.currently_pursuing);
        setSectionForm(nextSectionForm);
        setEducationEditorId(recordId);
        setSectionEditor(section);
    };

    const addEducation = () => openSectionEditor("education");

    const updateSectionForm = (field, value) => {
        setSectionForm((current) => ({ ...current, [field]: value }));
    };


    const saveSection = async (event) => {
        event.preventDefault();
        try {
            setLoading(true);
            const isEmployeeSection = ["employment", "position"].includes(sectionEditor);
            const isEducation = sectionEditor === "education";
            const endpoint = sectionEditor === "about" ? `${employee.employee_id}/about` : isEmployeeSection ? employee.employee_id : `${employee.employee_id}/${sectionEditor}`;
            const body = isEmployeeSection ? { ...employee, ...sectionForm, employment_end_date: sectionForm.employment_end_date || "Never", employee_id: employee.employee_id } : { ...sectionForm };
            if (isEducation) body.currently_pursuing = Boolean(body.currently_pursuing);
            ["children_count", "start_year", "end_year"].forEach((field) => {
                if (field in body) body[field] = body[field] === "" ? null : Number(body[field]);
            });
            const response = await fetch(`${API_URL}/api/employees/${employee.employee_id}${isEducation ? `/education${educationEditorId ? `/${educationEditorId}` : ""}` : `/${sectionEditor === "about" ? "about" : isEmployeeSection ? "" : sectionEditor}`}`, { method: isEducation && !educationEditorId ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await response.json();
            if (!response.ok) throw new Error([data.message, data.details].filter(Boolean).join(": ") || "Unable to save section");
            setEmployee((current) => ({
                ...current,
                ...(isEmployeeSection ? data : sectionEditor === "about" ? { about: data.about } : isEducation ? { education: educationEditorId ? current.education.map((record) => record.id === educationEditorId ? data : record) : [...(current.education || []), data] } : { [sectionEditor]: data }),
            }));
            setSectionEditor(null);
        } catch (error) {
            alert(error.message || "Unable to save section");
        } finally {
            setLoading(false);
        }
    };

    const deleteEducation = async (educationId) => {
        const response = await fetch(`${API_URL}/api/employees/${employee.employee_id}/education/${educationId}`, { method: "DELETE" });
        if (!response.ok) return alert("Unable to delete education");
        setEmployee((current) => ({ ...current, education: (current.education || []).filter((record) => record.id !== educationId) }));
    };

    const confirmDeleteEducation = async () => {
        const educationId = educationDeleteId;
        setEducationDeleteId(null);
        if (educationId) await deleteEducation(educationId);
    };

    const changePassword = async (event) => {
        event.preventDefault();
        try {
            setLoading(true);
            const response = await fetch(`${API_URL}/api/employees/${employee.employee_id}/change-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(passwordForm),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Unable to change password");
            alert("Password changed successfully");
            setPasswordForm({ current_password: "", new_password: "", repeat_password: "" });
            setShowChangePassword(false);
        } catch (error) {
            alert(error.message || "Unable to change password");
        } finally {
            setLoading(false);
        }
    };

    const saveProfile = async (event) => {
        event.preventDefault();
        try {
            setLoading(true);
            const response = await fetch(`${API_URL}/api/employees/${employee.employee_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...profileDraft,
                    employee_id: employee.employee_id,
                    name: profileDraft.name.trim(),
                    phone: profileDraft.phone.trim(),
                    email: profileDraft.email.trim(),
                    address: profileDraft.address.trim(),
                    gender: profileDraft.gender || null,
                    date_of_birth: profileDraft.date_of_birth || null,
                    emergency_contact: profileDraft.emergency_contact.trim() || null,
                    nationality: profileDraft.nationality.trim() || null,
                    religion: profileDraft.religion.trim() || null,
                    marital_status: profileDraft.marital_status || null,
                    children_count: profileDraft.children_count === "" ? null : Number(profileDraft.children_count),
                    profile_photo: profileDraft.profile_photo || null,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Unable to update profile");
            setEmployee((current) => ({ ...current, ...data }));
            sessionStorage.setItem("loggedInEmployee", JSON.stringify({ ...employee, ...data }));
            setShowEditProfile(false);
        } catch (error) {
            alert(error.message || "Unable to update profile");
        } finally {
            setLoading(false);
        }
    };

    if (!employee) {
        return <div className="employee-loading">Loading...</div>;
    }

    const pendingLeaves = leaves.filter(
        (leave) => leave.status?.trim().toLowerCase() === "pending"
    ).length;

    const approvedLeaveRequests = leaves.filter(
        (leave) => leave.status?.trim().toLowerCase() === "approved"
    );

    const approvedLeaves = approvedLeaveRequests.length;

    const rejectedLeaves = leaves.filter(
        (leave) => leave.status?.trim().toLowerCase() === "rejected"
    ).length;

    const profileValue = (value) => value || "-";
    const formatProfileDate = (value) => {
        if (!value) return "-";
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? value
            : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    };

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const approvedLeaveDays = approvedLeaveRequests.reduce(
        (total, leave) => total + Number(leave.days || 0),
        0
    );
    const approvedLeaveDaysThisYear = approvedLeaveRequests
        .filter((leave) => new Date(leave.from_date).getFullYear() === currentYear)
        .reduce((total, leave) => total + Number(leave.days || 0), 0);
    const joiningDate = parseDateOnly(employee.joining_date);
    const serviceMonths = completedMonthsBetween(joiningDate, currentDate);
    const serviceYears = Math.floor(serviceMonths / 12);
    const annualRule = serviceYears >= 5 ? LEAVE_RULES.annual.fiveYearsAndAbove : LEAVE_RULES.annual.underFiveYears;
    const yearStart = new Date(currentYear, 0, 1);
    const annualAccruedMonths = joiningDate && joiningDate > yearStart
        ? Math.min(12, completedMonthsBetween(joiningDate, currentDate))
        : currentDate.getMonth() + 1;
    const annualAccrued = serviceMonths >= LEAVE_RULES.annual.eligibleMonths
        ? Number((annualRule.monthly * annualAccruedMonths).toFixed(2))
        : 0;
    const annualTaken = approvedLeaveRequests
        .filter((leave) => leave.leave_type === "Annual Leave" && parseDateOnly(leave.from_date)?.getFullYear() === currentYear)
        .reduce((total, leave) => total + Number(leave.days || 0), 0);
    const sickTaken = approvedLeaveRequests
        .filter((leave) => leave.leave_type === "Sick Leave" && parseDateOnly(leave.from_date)?.getFullYear() === currentYear)
        .reduce((total, leave) => total + Number(leave.days || 0), 0);
    const maternityTaken = approvedLeaveRequests
        .filter((leave) => leave.leave_type === "Maternity Leave")
        .reduce((total, leave) => total + Number(leave.days || 0), 0);
    const bereavementTaken = approvedLeaveRequests
        .filter((leave) => leave.leave_type === "Bereavement Leave")
        .reduce((total, leave) => total + Number(leave.days || 0), 0);
    const selectedFromDate = parseDateOnly(formData.from_date);
    const selectedToDate = parseDateOnly(formData.to_date);
    const requestedDays = daysBetweenInclusive(selectedFromDate, selectedToDate);
    const selectedLeaveType = formData.leave_type;
    const selectedTrackingLeave = leaves.find((leave) => String(leave.id) === String(openTrackingId));
    const annualEligible = serviceMonths >= LEAVE_RULES.annual.eligibleMonths;
    const sickEligible = serviceMonths >= LEAVE_RULES.sick.eligibleMonths;
    const annualEligibleDate = joiningDate
        ? new Date(joiningDate.getFullYear() + 1, joiningDate.getMonth(), joiningDate.getDate())
        : null;
    const sickEligibleDate = joiningDate
        ? new Date(joiningDate.getFullYear(), joiningDate.getMonth() + 3, joiningDate.getDate())
        : null;
    const formatRuleDate = (date) => date?.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const leaveTypeDetails = {
        "Paternity Leave": {
            detail: "Entitlement is based on the company HR policy.",
            entitlement: "HR policy",
            approval: "HR approval",
            document: "As required by HR",
            pay: "As per policy",
        },
        "Hajj Leave": {
            detail: "One-time religious leave, subject to company policy and approval.",
            entitlement: "HR policy",
            approval: "HR approval",
            document: "Supporting document may be required",
            pay: "As per policy",
        },
        "Emergency Leave": {
            detail: "For urgent personal or family emergencies.",
            entitlement: "HR policy",
            approval: "Manager / HR approval",
            document: "Supporting document may be required",
            pay: "As per policy",
        },
        "Unpaid Leave (LOP)": {
            detail: "No paid leave balance is consumed.",
            entitlement: "No fixed balance",
            approval: "Manager / HR approval",
            document: "As required by HR",
            pay: "Unpaid",
        },
        "Compensatory Off": {
            detail: "Available for approved work on a public holiday or weekend.",
            entitlement: "Valid for 90 days",
            approval: "Manager approval",
            document: "Work proof required",
            pay: "Paid time off",
        },
    };
    const selectedLeaveInfo = selectedLeaveType === "Annual Leave"
        ? { eligible: annualEligible, remaining: annualEligible ? Math.max(0, annualAccrued - annualTaken) : null, used: annualTaken, entitlement: `${annualRule.annual} days/year`, approval: "HR approval", document: "Not required", pay: "Paid leave", detail: annualEligible ? `${annualRule.monthly.toFixed(2)} days/month accrual` : `Eligible after: ${formatRuleDate(annualEligibleDate)}` }
        : selectedLeaveType === "Sick Leave"
            ? { eligible: sickEligible, remaining: sickEligible ? Math.max(0, LEAVE_RULES.sick.totalDays - sickTaken) : null, used: sickTaken, entitlement: "84 days maximum", approval: "HR approval", document: "Medical certificate mandatory", pay: "14 full + 28 half + 42 unpaid", detail: sickEligible ? "14 days full pay • 28 days half pay • 42 days unpaid" : `Eligible after: ${formatRuleDate(sickEligibleDate)}` }
            : selectedLeaveType === "Maternity Leave"
                ? { eligible: true, remaining: Math.max(0, LEAVE_RULES.maternity.days - maternityTaken), used: maternityTaken, entitlement: "50 days", approval: "HR approval", document: "Medical certificate mandatory", pay: "Full pay", detail: "Maternity leave entitlement" }
                : selectedLeaveType === "Bereavement Leave"
                    ? { eligible: true, remaining: Math.max(0, LEAVE_RULES.bereavement.days - bereavementTaken), used: bereavementTaken, entitlement: "3 days", approval: "Manager approval", document: "Proof may be required", pay: "As per policy", detail: "Immediate family" }
                    : selectedLeaveType === "Compensatory Off"
                        ? { eligible: true, remaining: null, ...leaveTypeDetails["Compensatory Off"] }
                        : { eligible: true, remaining: null, ...leaveTypeDetails[selectedLeaveType] };
    const todayAttendance = attendance.find((record) => {
        const recordDate = new Date(record.attendance_date).toISOString().slice(0, 10);
        return recordDate === currentDate.toISOString().slice(0, 10);
    });
    const todayHours = Number(todayAttendance?.working_minutes || 0) / 60;
    const weekHours = attendance.reduce(
        (total, record) => {
            const recordDate = parseDateOnly(record.attendance_date);
            const daysAgo = recordDate ? Math.floor((currentDate - recordDate) / (1000 * 60 * 60 * 24)) : 99;
            return daysAgo < 7 ? total + Number(record.working_minutes || 0) / 60 : total;
        },
        0
    );
    const currentMonthAttendance = monthlyAttendance.filter((record) => {
        const recordDate = parseDateOnly(record.attendance_date);
        return recordDate
            && recordDate.getFullYear() === currentDate.getFullYear()
            && recordDate.getMonth() === currentDate.getMonth();
    });
    const monthHours = currentMonthAttendance.reduce(
        (total, record) => total + Number(record.working_minutes || 0) / 60,
        0
    );
    const attendanceDays = attendance.filter((record) => record.punch_in).length;
    const formatHours = (hours) => hours.toFixed(2).replace(/\.00$/, "");
    const attendanceProgress = Math.min((todayHours / 9) * 100, 100);
    const attendanceMonthOptions = Array.from({ length: 12 }, (_, index) => {
        const monthValue = String(index + 1).padStart(2, "0");
        const monthLabel = new Date(2000, index, 1).toLocaleDateString("en-IN", { month: "long" });
        return { value: monthValue, label: monthLabel };
    });
    const attendanceYearOptions = [...new Set(
        attendance
            .map((record) => String(record.attendance_date || "").slice(0, 4))
            .filter(Boolean)
    )].sort().reverse();
    const filteredEmployeeAttendance = attendance.filter((record) => {
        const search = attendanceSearch.trim().toLowerCase();
        const status = String(record.status || "").toLowerCase();
        const recordDate = String(record.attendance_date || "");
        return (!search || `${record.attendance_date} ${record.status}`.toLowerCase().includes(search))
            && (attendanceMonth === "all" || recordDate.slice(5, 7) === attendanceMonth)
            && (attendanceYear === "all" || recordDate.slice(0, 4) === attendanceYear)
            && (attendanceStatus === "all" || status === attendanceStatus);
    });
    const attendancePageCount = Math.max(1, Math.ceil(filteredEmployeeAttendance.length / attendanceRows));
    const visibleEmployeeAttendance = filteredEmployeeAttendance.slice(
        (attendancePage - 1) * attendanceRows,
        attendancePage * attendanceRows
    );
    const greeting = liveNow.getHours() < 12 ? "Good Morning" : liveNow.getHours() < 17 ? "Good Afternoon" : "Good Evening";
    const liveTime = liveNow.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    const liveDate = liveNow.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const toggleProfilePanel = (panel) => {
        setProfilePanels((current) => ({ ...current, [panel]: !current[panel] }));
    };
    const profilePanelFields = (fields) => fields.map(([label, value]) => (
        <div className="dashboard-profile-field" key={label}>
            <span>{label}</span>
            <strong>{profileValue(value)}</strong>
        </div>
    ));
    const displayDate = currentDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
    const leaveBreakdown = [
        { label: "Approved", value: approvedLeaves, color: "#00be63" },
        { label: "Pending", value: pendingLeaves, color: "#f7b500" },
        { label: "Rejected", value: rejectedLeaves, color: "#e11d2e" },
    ];
    const chartTotal = leaves.length;
    const chartGradient = leaveBreakdown.reduce((gradient, item) => {
        const end = gradient.end + (item.value / (chartTotal || 1)) * 100;
        gradient.parts.push(`${item.color} ${gradient.end}% ${end}%`);
        gradient.end = end;
        return gradient;
    }, { parts: [], end: 0 }).parts.join(", ");
    const chartBackground = chartTotal ? `conic-gradient(${chartGradient})` : "#dce5eb";

    return (
        <div className={`employee-dashboard ${activeSection}-view ${compactMode ? "compact-mode" : ""}`}>

            <EmployeeSidebar
                activeSection={activeSection}
                onSectionChange={setActiveSection}
                onProfile={openProfile}
                onChangePassword={() => setShowChangePassword(true)}
                onLeave={openLeaveDetails}
                onLogout={logout}
            />


            {/* MAIN */}
            <main className="employee-main">

                {/* HEADER */}
                <header className="employee-header">

                    <div>
                        <h1>
                            {activeSection === "profile"
                                ? "My Profile"
                                : activeSection === "leave"
                                    ? "Leave Details"
                                    : activeSection === "settings"
                                        ? "Settings"
                                        : activeSection === "attendance"
                                            ? "Employee Attendance"
                                    : "Employee Dashboard"}
                        </h1>
                        <p>
                            {activeSection === "profile"
                                ? "Complete employee information from HR records"
                                : activeSection === "leave"
                                    ? "View and manage your leave requests"
                                    : activeSection === "settings"
                                        ? "Manage your account and dashboard preferences"
                                    : activeSection === "attendance"
                                        ? "Review your recent attendance records"
                                    : `Welcome back, ${employee.name}`}
                        </p>
                    </div>

                </header>

                <section className="employee-overview-grid">
                    <article className="employee-identity-card">
                        <div className="identity-banner">
                            <div className="large-avatar">{employee.name?.charAt(0)?.toUpperCase()}</div>
                            <div><h2>{employee.name}</h2><p>{employee.designation || "Employee"}</p></div>
                        </div>
                        <div className="identity-details">
                            <div><label>Phone Number</label><strong>{profileValue(employee.phone)}</strong></div>
                            <div><label>Email Address</label><strong>{profileValue(employee.email)}</strong></div>
                            <div><label>Department</label><strong>{profileValue(employee.department)}</strong></div>
                            <div><label>Joined on</label><strong>{formatProfileDate(employee.joining_date)}</strong></div>
                        </div>
                    </article>

                    <article className="employee-leave-chart-card">
                        <div className="overview-card-heading"><h2>Leave Details</h2><span><CalendarDays size={14} /> {currentYear}</span></div>
                        <div className="leave-chart-content">
                            <div className="leave-legend">
                                {leaveBreakdown.map((item) => {
                                    const percentage = chartTotal ? Math.round((item.value / chartTotal) * 100) : 0;
                                    return <div key={item.label}><i style={{ backgroundColor: item.color }} /><strong>{item.value}</strong> {item.label} <em>({percentage}%)</em></div>;
                                })}
                                <div className="leave-legend-total"><i /><strong>{leaves.length}</strong> Requests</div>
                            </div>
                            <div className="leave-bar-chart" aria-label={`${leaves.length} leave requests: ${approvedLeaves} approved, ${pendingLeaves} pending, ${rejectedLeaves} rejected`}>
                                {leaveBreakdown.map((item) => {
                                    const height = chartTotal ? Math.max((item.value / chartTotal) * 100, item.value ? 18 : 0) : 0;
                                    return (
                                        <div className="leave-bar-column" key={item.label}>
                                            <div className="leave-bar-track">
                                                <span className="leave-bar-fill" style={{ height: `${height}%`, background: item.color }} />
                                            </div>
                                            <small>{item.label}</small>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </article>

                    <article className="employee-leave-summary-card">
                        <div className="overview-card-heading"><h2>Leave Summary</h2><span><CalendarDays size={14} /> {currentYear}</span></div>
                        <div className="leave-summary-grid">
                            <div><label>Total Requests</label><strong>{leaves.length}</strong></div><div><label>Taken Days</label><strong>{approvedLeaveDays}</strong></div>
                            <div><label>Pending</label><strong>{pendingLeaves}</strong></div><div><label>Rejected</label><strong>{rejectedLeaves}</strong></div>
                            <div><label>Approved Days</label><strong>{approvedLeaveDays}</strong></div><div><label>Requests</label><strong>{leaves.length}</strong></div>
                        </div>
                    </article>
                </section>

                <section className="employee-work-metrics">
                    <div className="work-metric-card attendance-metric"><div className="metric-icon"><Clock3 size={15} /></div><strong>{displayDate}</strong><small>Attendance</small><div className="metric-progress"><span style={{ width: `${attendanceProgress}%` }} /></div><b>{todayAttendance ? "Attendance recorded" : "No attendance recorded"}</b></div>
                    <div className="work-metric-card"><div className="metric-icon dark"><Clock3 size={15} /></div><strong>{formatHours(todayHours)} <em>/ 9</em></strong><small>Total Hours Today</small><b className="metric-up">Actual attendance hours</b></div>
                    <div className="work-metric-card"><div className="metric-icon blue"><CalendarDays size={15} /></div><strong>{formatHours(weekHours)} <em>/ 40</em></strong><small>Total Hours Week</small><b className="metric-up">Last 7 days</b></div>
                    <div className="work-metric-card"><div className="metric-icon pink"><FileText size={15} /></div><strong>{approvedLeaveDaysThisYear}</strong><small>Approved Days This Year</small><b className="metric-up">From approved requests</b></div>
                </section>

                <EmployeeAttendance
                    employee={employee} greeting={greeting} liveTime={liveTime} liveDate={liveDate}
                    todayHours={todayHours} todayAttendance={todayAttendance} weekHours={weekHours}
                    attendanceDays={attendanceDays} monthHours={monthHours} currentMonthAttendance={currentMonthAttendance}
                    formatAttendanceTime={formatAttendanceTime} attendanceRows={attendanceRows} setAttendanceRows={setAttendanceRows}
                    attendanceMonth={attendanceMonth} setAttendanceMonth={setAttendanceMonth} attendanceMonthOptions={attendanceMonthOptions}
                    attendanceYear={attendanceYear} setAttendanceYear={setAttendanceYear} attendanceYearOptions={attendanceYearOptions}
                    attendanceSearch={attendanceSearch} setAttendanceSearch={setAttendanceSearch} attendanceStatus={attendanceStatus}
                    setAttendanceStatus={setAttendanceStatus} filteredEmployeeAttendance={filteredEmployeeAttendance}
                    visibleEmployeeAttendance={visibleEmployeeAttendance} formatProfileDate={formatProfileDate}
                    attendancePage={attendancePage} attendancePageCount={attendancePageCount} setAttendancePage={setAttendancePage}
                />

                <section className="employee-leave-section">
                    <div className="employee-section-header">
                        <span />
                        <button className="apply-leave-btn" onClick={() => setShowApplyLeave(true)}>
                            <CalendarDays size={15} /> Apply Leave
                        </button>
                    </div>
                    <section className="employee-summary">
                        <div className="employee-stat-card">
                            <span><ClipboardList size={18} /></span>
                            <div><small>Total Requests</small><strong>{leaves.length}</strong></div>
                        </div>
                        <div className="employee-stat-card">
                            <span><Hourglass size={18} /></span>
                            <div><small>Pending</small><strong>{pendingLeaves}</strong></div>
                        </div>
                        <div className="employee-stat-card">
                            <span><Check size={18} /></span>
                            <div><small>Approved</small><strong>{approvedLeaves}</strong></div>
                        </div>
                        <div className="employee-stat-card">
                            <span><X size={18} /></span>
                            <div><small>Rejected</small><strong>{rejectedLeaves}</strong></div>
                        </div>
                    </section>
                    <section className="employee-holiday-section">
                        <div className="overview-card-heading">
                            <h2>Qatar Holiday Calendar</h2>
                            <div className="holiday-heading-actions">
                                <span><CalendarDays size={14} /> {currentYear}</span>
                                <button
                                    type="button"
                                    className="holiday-toggle"
                                    aria-label={holidaysExpanded ? "Collapse holiday calendar" : "Expand holiday calendar"}
                                    aria-expanded={holidaysExpanded}
                                    onClick={() => setHolidaysExpanded((expanded) => !expanded)}
                                >
                                    <ChevronDown size={17} className={holidaysExpanded ? "expanded" : ""} />
                                </button>
                            </div>
                        </div>
                        {holidaysExpanded && (
                            <div className="employee-holiday-list">
                                {holidays.map((holiday) => (
                                    <div className="employee-holiday-row" key={`${holiday.name}-${holiday.date}`}>
                                        <strong>{holiday.name}</strong>
                                        <span>{holiday.date}</span>
                                        <b>{holiday.days} {Number(holiday.days) === 1 ? "day" : "days"}</b>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                    <div className="employee-table-card">
                        <table>
                            <thead>
                                <tr>
                                    <th>Leave Type</th>
                                    <th>From</th>
                                    <th>To</th>
                                    <th>Days</th>
                                    <th>Reason</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaves.length > 0 ? leaves.map((leave) => {
                                    const status = leave.status?.trim().toLowerCase() || "pending";
                                    return (
                                        <tr
                                            key={leave.id}
                                            className="leave-row-clickable"
                                            role="button"
                                            tabIndex="0"
                                            onClick={() => setOpenTrackingId(leave.id)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") setOpenTrackingId(leave.id);
                                            }}
                                        >
                                            <td>{leave.leave_type}</td>
                                            <td>{formatProfileDate(leave.from_date)}</td>
                                            <td>{formatProfileDate(leave.to_date)}</td>
                                            <td>{leave.days}</td>
                                            <td>{leave.reason || "-"}</td>
                                            <td>
                                                <div className="leave-status-cell">
                                                    <span className={`employee-status ${status}`}>{leave.status}</span>
                                                </div>
                                            </td>
                                            <td>
                                                {status === "pending" && (
                                                    <button
                                                        type="button"
                                                        className="cancel-leave-btn"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setCancelLeaveId(leave.id);
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr><td className="no-leaves" colSpan="7">No leave requests found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {selectedTrackingLeave && (
                        <div className="leave-tracking-modal">
                            <div className="leave-tracking-panel" onClick={(event) => event.stopPropagation()}>
                                <button type="button" className="leave-tracking-close" onClick={() => setOpenTrackingId(null)} aria-label="Close leave tracking">×</button>
                                <p className="leave-tracking-kicker">Leave request tracking</p>
                                <h2>{selectedTrackingLeave.leave_type}</h2>
                                <div className="leave-tracking-meta">
                                    <span>{formatProfileDate(selectedTrackingLeave.from_date)} - {formatProfileDate(selectedTrackingLeave.to_date)}</span>
                                    <span>{selectedTrackingLeave.days} day(s)</span>
                                    <span>{selectedTrackingLeave.reason || "No reason provided"}</span>
                                </div>
                                <div className={`leave-tracker ${selectedTrackingLeave.status?.trim().toLowerCase()}`}>
                                    <div className="leave-tracker-step complete"><span><ClipboardList size={16} /></span><small>Submitted</small></div>
                                    <i />
                                    <div className={`leave-tracker-step ${selectedTrackingLeave.status?.trim().toLowerCase() === "pending" ? "current" : "complete"}`}><span><Hourglass size={16} /></span><small>Under review</small></div>
                                    <i />
                                    <div className={`leave-tracker-step ${selectedTrackingLeave.status?.trim().toLowerCase() === "pending" ? "" : "current"}`}><span>{selectedTrackingLeave.status?.trim().toLowerCase() === "rejected" ? <X size={17} /> : <Check size={17} />}</span><small>{selectedTrackingLeave.status?.trim().toLowerCase() === "rejected" ? "Rejected" : selectedTrackingLeave.status?.trim().toLowerCase() === "approved" ? "Approved" : "Pending"}</small></div>
                                </div>
                                <strong className={`leave-tracking-result ${selectedTrackingLeave.status?.trim().toLowerCase()}`}>{selectedTrackingLeave.status}</strong>
                            </div>
                        </div>
                    )}
                </section>


                <EmployeeProfile employee={employee} profilePanels={profilePanels} toggleProfilePanel={toggleProfilePanel} setProfilePanels={setProfilePanels} profilePanelFields={profilePanelFields} profileWorkTab={profileWorkTab} setProfileWorkTab={setProfileWorkTab} onEditProfile={openEditProfile} onEditSection={openSectionEditor} onAddEducation={addEducation} onDeleteEducation={deleteEducation} formatProfileDate={formatProfileDate} />
                <section className="employee-profile-view legacy-profile-view">
                    <div className="employee-section-heading">
                        <div>
                            <h2>My Profile</h2>
                            <p>Complete employee information from HR records</p>
                        </div>
                    </div>
                    <aside className="profile-summary-card">
                        <div className="profile-summary-cover" />
                        <div className="profile-summary-avatar">{employee.name?.charAt(0)?.toUpperCase()}</div>
                        <h2>{employee.name}</h2>
                        <span className="profile-summary-status">● Active</span>
                        <div className="profile-summary-tags">
                            <span>{employee.designation || "Employee"}</span>
                            <span>{employee.employment_type || "Full Time"}</span>
                        </div>
                        <button className="profile-summary-edit" onClick={openEditProfile}>✎ Edit Info</button>
                    </aside>
                    <div className="dashboard-profile-panels">
                        <DashboardProfilePanel title="About Employee" open={profilePanels.about} onToggle={() => toggleProfilePanel("about")} onEdit={openEditProfile} content={<p>Employee {employee.name} is part of the {employee.department || "organization"} team as a {employee.designation || "valued employee"}.</p>} />
                        <DashboardProfilePanel title="Bank Information" open={profilePanels.bank} onToggle={() => toggleProfilePanel("bank")} onEdit={openEditProfile} content={<div className="dashboard-profile-grid">{profilePanelFields([["Account Holder", employee.bank?.account_holder_name], ["Bank Name", employee.bank?.bank_name], ["Account Number", employee.bank?.account_number], ["Branch Name", employee.bank?.branch_name], ["IFSC Code", employee.bank?.ifsc_code], ["Account Type", employee.bank?.account_type]])}</div>} />
                        <DashboardProfilePanel title="Family Information" open={profilePanels.family} onToggle={() => toggleProfilePanel("family")} onEdit={openEditProfile} content={<div className="dashboard-profile-grid">{profilePanelFields([["Father Name", employee.family?.father_name], ["Mother Name", employee.family?.mother_name], ["Spouse Name", employee.family?.spouse_name], ["Spouse Employment", employee.family?.spouse_employment], ["Marital Status", employee.marital_status], ["Children", employee.children_count]])}</div>} />
                        <DashboardProfilePanel title="Employment Details" open={profilePanels.employment} onToggle={() => toggleProfilePanel("employment")} onEdit={openEditProfile} content={<div className="dashboard-profile-grid">{profilePanelFields([["Legal Entity", employee.legal_entity || "SHLT"], ["Worker Type", employee.worker_type || "Employee"], ["Personnel Number", employee.employee_id], ["Employment Category", employee.employment_category], ["Employment Start", formatProfileDate(employee.joining_date)], ["Employment End", employee.employment_end_date || "Never"], ["Employment Type", employee.employment_type], ["Project Role ID", employee.project_role_id], ["Termination Reason", employee.termination_reason], ["Last Date Worked", employee.last_date_worked]])}</div>} />
                        <DashboardProfilePanel title="Position Details" open={profilePanels.position} onToggle={() => toggleProfilePanel("position")} onEdit={openEditProfile} content={<div className="dashboard-profile-grid">{profilePanelFields([["Position", employee.position || employee.designation], ["Position Title", employee.position_title || employee.designation], ["Assignment Start", formatProfileDate(employee.assignment_start || employee.joining_date)], ["Assignment End", formatProfileDate(employee.assignment_end)], ["Make Primary", employee.make_primary ? "Yes" : "No"]])}</div>} />
                        <div className="dashboard-profile-panel-row">
                            <DashboardProfilePanel title="Education Details" open={profilePanels.education} onToggle={() => toggleProfilePanel("education")} onEdit={openEditProfile} content={<div className="dashboard-profile-grid">{profilePanelFields([["Qualification", employee.education?.qualification], ["Institution", employee.education?.institution], ["Field", employee.education?.field_of_study], ["Grade", employee.education?.grade]])}</div>} />
                            <DashboardProfilePanel title="Experience" open={profilePanels.experience} onToggle={() => toggleProfilePanel("experience")} onEdit={openEditProfile} content={<div className="dashboard-profile-grid">{profilePanelFields([["Company", employee.experience?.company_name], ["Role", employee.experience?.designation], ["Start", formatProfileDate(employee.experience?.start_date)], ["End", formatProfileDate(employee.experience?.end_date)]])}</div>} />
                        </div>
                        <section className="dashboard-projects-panel">
                            <div className="dashboard-project-tabs"><button className={profileWorkTab === "projects" ? "active" : ""} onClick={() => setProfileWorkTab("projects")}>Projects</button><button className={profileWorkTab === "assets" ? "active" : ""} onClick={() => setProfileWorkTab("assets")}>Assets</button></div>
                            {profileWorkTab === "projects" ? <div className="dashboard-project-list"><article><span className="dashboard-project-icon blue">C</span><div><b>{employee.department || "Workforce"} Management</b><p>Employee responsibilities and assigned work</p></div></article><article><span className="dashboard-project-icon purple">●</span><div><b>{employee.designation || "Employee"} Operations</b><p>Current role and organizational activities</p></div></article></div> : <div className="dashboard-assets-empty">No assets assigned</div>}
                        </section>
                    </div>
                </section>

                <EmployeeSettings employee={employee} notificationsEnabled={notificationsEnabled} setNotificationsEnabled={setNotificationsEnabled} compactMode={compactMode} setCompactMode={setCompactMode} onEditProfile={openEditProfile} onChangePassword={() => setShowChangePassword(true)} onLogout={logout} />
                <section className="employee-settings-view legacy-settings-view">
                    <div className="settings-grid">
                        <article className="settings-card">
                            <div className="settings-card-heading"><span className="settings-icon blue"><KeyRound size={18} /></span><div><h3>Account &amp; Security</h3><p>Protect your account access</p></div></div>
                            <div className="settings-row"><div><strong>Password</strong><small>Change your account password anytime</small></div><button type="button" onClick={() => setShowChangePassword(true)}>Change Password</button></div>
                            <div className="settings-row"><div><strong>Account status</strong><small>Your employee account is active</small></div><span className="settings-status">Active</span></div>
                        </article>
                        <article className="settings-card">
                            <div className="settings-card-heading"><span className="settings-icon purple"><UserRound size={18} /></span><div><h3>Profile preferences</h3><p>Manage your personal information</p></div></div>
                            <div className="settings-row"><div><strong>Personal details</strong><small>Update your contact and profile details</small></div><button type="button" onClick={openEditProfile}>Edit Profile</button></div>
                            <div className="settings-row"><div><strong>Employee ID</strong><small>Used for signing in to HRMS</small></div><span className="settings-value">{employee.employee_id}</span></div>
                        </article>
                        <article className="settings-card">
                            <div className="settings-card-heading"><span className="settings-icon green"><Bell size={18} /></span><div><h3>Notifications</h3><p>Control dashboard alerts</p></div></div>
                            <div className="settings-row"><div><strong>Leave updates</strong><small>Show updates about your leave requests</small></div><button type="button" className={`settings-toggle ${notificationsEnabled ? "on" : ""}`} onClick={() => setNotificationsEnabled((enabled) => !enabled)} aria-pressed={notificationsEnabled}><span /></button></div>
                        </article>
                        <article className="settings-card">
                            <div className="settings-card-heading"><span className="settings-icon orange"><Moon size={18} /></span><div><h3>Appearance</h3><p>Choose your dashboard layout</p></div></div>
                            <div className="settings-row"><div><strong>Compact cards</strong><small>Use a tighter dashboard layout</small></div><button type="button" className={`settings-toggle ${compactMode ? "on" : ""}`} onClick={() => setCompactMode((enabled) => !enabled)} aria-pressed={compactMode}><span /></button></div>
                        </article>
                    </div>
                    <div className="settings-session"><span><SettingsIcon size={17} /> Signed in as {employee.employee_id}</span><button type="button" onClick={logout}>Log out</button></div>
                </section>

            </main>

            {educationDeleteId && (
                <div className="education-delete-overlay" onClick={() => setEducationDeleteId(null)}>
                    <div className="education-delete-card" role="dialog" aria-modal="true" aria-labelledby="education-delete-title" onClick={(event) => event.stopPropagation()}>
                        <div className="education-delete-icon"><Trash2 size={22} /></div>
                        <h2 id="education-delete-title">Delete education record?</h2>
                        <p>This education record will be permanently removed from your profile.</p>
                        <div className="education-delete-actions">
                            <button type="button" className="education-delete-cancel" onClick={() => setEducationDeleteId(null)}>Cancel</button>
                            <button type="button" className="education-delete-confirm" onClick={confirmDeleteEducation}>Delete Record</button>
                        </div>
                    </div>
                </div>
            )}

            {cancelLeaveId && (
                <div className="cancel-confirm-overlay">
                    <div className="cancel-confirm-card" role="dialog" aria-modal="true" aria-labelledby="cancel-confirm-title">
                        <div className="cancel-confirm-icon">!</div>
                        <h2 id="cancel-confirm-title">Cancel leave request?</h2>
                        <p>This pending leave request will be cancelled and sent to HR as <strong>Cancelled by Employee</strong>.</p>
                        <div className="cancel-confirm-actions">
                            <button type="button" className="cancel-keep-btn" onClick={() => setCancelLeaveId(null)}>Keep Request</button>
                            <button type="button" className="cancel-confirm-btn" onClick={async () => { const leaveId = cancelLeaveId; setCancelLeaveId(null); await cancelLeave(leaveId); }}>Yes, Cancel Leave</button>
                        </div>
                    </div>
                </div>
            )}


            {showApplyLeave && <ApplyLeaveModal formData={formData} handleChange={handleChange} setFormData={setFormData} leaveTypes={EMPLOYEE_LEAVE_TYPES} selectedLeaveInfo={selectedLeaveInfo} requestedDays={requestedDays} loading={loading} onSubmit={applyLeave} onClose={() => setShowApplyLeave(false)} />}

            {showEditProfile && profileDraft && <EmployeeEditModal draft={profileDraft} updateDraft={updateProfileDraft} onSubmit={saveProfile} loading={loading} onClose={() => setShowEditProfile(false)} />}
            {sectionEditor && <EmployeeSectionEditModal section={sectionEditor} form={sectionForm} updateForm={updateSectionForm} onSubmit={saveSection} loading={loading} onClose={() => setSectionEditor(null)} />}

            {showChangePassword && <ChangePasswordModal passwordForm={passwordForm} setPasswordForm={setPasswordForm} onSubmit={changePassword} loading={loading} onClose={() => setShowChangePassword(false)} />}

        </div>
    );
}

function DashboardProfilePanel({ title, open, onEdit, content }) {
    return (
        <section className={`dashboard-profile-panel ${open ? "open" : "collapsed"}`}>
            <header>
                <h3>{title}</h3>
                <button type="button" onClick={onEdit} aria-label={`Edit ${title}`}>✎</button>
            </header>
            <div className="dashboard-profile-panel-content">{content}</div>
        </section>
    );
}

export default EmployeeDashboard;