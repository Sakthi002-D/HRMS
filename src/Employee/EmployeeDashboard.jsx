import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CalendarDays, Check, Clock3, ClipboardList, FileText, Hourglass, KeyRound, LayoutDashboard, LogOut, Moon, Settings as SettingsIcon, UserRound, X } from "lucide-react";
import DatePicker from "../components/layout/common/DatePicker";
import "./EmployeeDashboard.css";

const API_URL = "http://localhost:5000";

function EmployeeDashboard() {
    const navigate = useNavigate();

    const [employee, setEmployee] = useState(null);
    const [leaves, setLeaves] = useState([]);
    const [attendance, setAttendance] = useState([]);

    const [showApplyLeave, setShowApplyLeave] = useState(false);
    const [showEditProfile, setShowEditProfile] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", repeat_password: "" });
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [compactMode, setCompactMode] = useState(false);
    const [profileDraft, setProfileDraft] = useState(null);
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
        leave_type: "Casual Leave",
        from_date: "",
        to_date: "",
        reason: ""
    });

    const [loading, setLoading] = useState(false);

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
        const dates = Array.from({ length: 7 }, (_, index) => {
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

            setAttendance(records.flat().filter((record) => String(record.employee_id) === String(employeeId)));
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
                leave_type: "Casual Leave",
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
            name: employee.name || "",
            phone: employee.phone || "",
            email: employee.email || "",
            address: employee.address || "",
            gender: employee.gender || "",
            date_of_birth: employee.date_of_birth || "",
            emergency_contact: employee.emergency_contact || "",
            nationality: employee.nationality || employee.country || "",
            religion: employee.religion || "",
            marital_status: employee.marital_status || "",
            children_count: employee.children_count ?? "",
        });
        setShowEditProfile(true);
    };

    const updateProfileDraft = (field, value) => {
        setProfileDraft((previous) => ({ ...previous, [field]: value }));
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
                    department: employee.department,
                    designation: employee.designation,
                    joining_date: employee.joining_date,
                    employment_type: employee.employment_type,
                    status: employee.status,
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
    const todayAttendance = attendance.find((record) => {
        const recordDate = new Date(record.attendance_date).toISOString().slice(0, 10);
        return recordDate === currentDate.toISOString().slice(0, 10);
    });
    const todayHours = Number(todayAttendance?.working_minutes || 0) / 60;
    const weekHours = attendance.reduce(
        (total, record) => total + Number(record.working_minutes || 0) / 60,
        0
    );
    const formatHours = (hours) => hours.toFixed(2).replace(/\.00$/, "");
    const attendanceProgress = Math.min((todayHours / 9) * 100, 100);
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

            {/* SIDEBAR */}
            <aside className="employee-sidebar">

                <div className="employee-brand">
                    <img src="/shelter logo.png" alt="Shelter Group" />
                </div>

                <div className="employee-menu-title">
                    EMPLOYEE PORTAL
                </div>

                <div className="employee-menu">

                    <button className={`employee-menu-item ${activeSection === "dashboard" ? "active" : ""}`} onClick={() => setActiveSection("dashboard")}>
                        <LayoutDashboard size={19} strokeWidth={2} />
                        <span>Dashboard</span>
                    </button>

                    <button
                        className={`employee-menu-item ${activeSection === "profile" ? "active" : ""}`}
                        onClick={openProfile}
                    >
                        <UserRound size={19} strokeWidth={2} />
                        <span>Profile</span>
                    </button>

                    <button className="employee-menu-item" onClick={() => setShowChangePassword(true)}>
                        <KeyRound size={19} strokeWidth={2} />
                        <span>Change Password</span>
                    </button>

                    <button className={`employee-menu-item ${activeSection === "settings" ? "active" : ""}`} onClick={() => setActiveSection("settings")}>
                        <SettingsIcon size={19} strokeWidth={2} />
                        <span>Settings</span>
                    </button>

                    <button
                        className={`employee-menu-item ${activeSection === "leave" ? "active" : ""}`}
                        onClick={openLeaveDetails}
                    >
                        <CalendarDays size={19} strokeWidth={2} />
                        <span>Apply Leave</span>
                    </button>

                </div>

                <button
                    className="employee-logout"
                    onClick={logout}
                >
                    <LogOut size={19} strokeWidth={2} />
                    <span>Logout</span>
                </button>

            </aside>


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
                                    : "Employee Dashboard"}
                        </h1>
                        <p>
                            {activeSection === "profile"
                                ? "Complete employee information from HR records"
                                : activeSection === "leave"
                                    ? "View and manage your leave requests"
                                    : activeSection === "settings"
                                        ? "Manage your account and dashboard preferences"
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
                                </tr>
                            </thead>
                            <tbody>
                                {leaves.length > 0 ? leaves.map((leave) => {
                                    const status = leave.status?.trim().toLowerCase() || "pending";
                                    return (
                                        <tr key={leave.id}>
                                            <td>{leave.leave_type}</td>
                                            <td>{formatProfileDate(leave.from_date)}</td>
                                            <td>{formatProfileDate(leave.to_date)}</td>
                                            <td>{leave.days}</td>
                                            <td>{leave.reason || "-"}</td>
                                            <td><span className={`employee-status ${status}`}>{leave.status}</span></td>
                                        </tr>
                                    );
                                }) : (
                                    <tr><td className="no-leaves" colSpan="6">No leave requests found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>


                {/* PROFILE VIEW */}
                <section className="employee-profile-view">
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

                <section className="employee-settings-view">
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


            {/* APPLY LEAVE MODAL */}
            {showApplyLeave && (

                <div className="employee-modal">

                    <div className="employee-modal-card">

                        <button
                            className="modal-close"
                            onClick={() =>
                                setShowApplyLeave(false)
                            }
                        >
                            ×
                        </button>

                        <h2>Apply for Leave</h2>

                        <p>
                            Submit a new leave request
                        </p>

                        <form onSubmit={applyLeave}>

                            <div className="form-group">

                                <label>Leave Type</label>

                                <select
                                    name="leave_type"
                                    value={formData.leave_type}
                                    onChange={handleChange}
                                >
                                    <option>
                                        Casual Leave
                                    </option>

                                    <option>
                                        Sick Leave
                                    </option>

                                    <option>
                                        Earned Leave
                                    </option>

                                    <option>
                                        Emergency Leave
                                    </option>
                                </select>

                            </div>


                            <div className="form-row">

                                <div className="form-group">

                                    <label>From Date</label>

                                    <DatePicker
                                        value={formData.from_date}
                                        onChange={(value) => setFormData((previous) => ({ ...previous, from_date: value }))}
                                    />

                                </div>

                                <div className="form-group">

                                    <label>To Date</label>

                                    <DatePicker
                                        value={formData.to_date}
                                        onChange={(value) => setFormData((previous) => ({ ...previous, to_date: value }))}
                                    />

                                </div>

                            </div>


                            <div className="form-group">

                                <label>Reason</label>

                                <textarea
                                    name="reason"
                                    rows="4"
                                    placeholder="Enter reason for leave..."
                                    value={formData.reason}
                                    onChange={handleChange}
                                />

                            </div>


                            <button
                                type="submit"
                                className="submit-leave-btn"
                                disabled={loading}
                            >
                                {loading
                                    ? "Submitting..."
                                    : "Submit Leave Request"}
                            </button>

                        </form>

                    </div>

                </div>

            )}

            {showEditProfile && profileDraft && (
                <div className="employee-modal">
                    <div className="employee-modal-card profile-edit-modal">
                        <button className="modal-close" onClick={() => setShowEditProfile(false)}>×</button>
                        <h2>Edit Profile</h2>
                        <p>Update your personal contact information</p>
                        <form onSubmit={saveProfile}>
                            <div className="profile-edit-grid">
                                <div className="form-group"><label>Full Name</label><input value={profileDraft.name} onChange={(e) => updateProfileDraft("name", e.target.value)} required /></div>
                                <div className="form-group"><label>Phone</label><input value={profileDraft.phone} onChange={(e) => updateProfileDraft("phone", e.target.value)} required /></div>
                                <div className="form-group"><label>Email</label><input type="email" value={profileDraft.email} onChange={(e) => updateProfileDraft("email", e.target.value)} required /></div>
                                <div className="form-group"><label>Gender</label><select value={profileDraft.gender} onChange={(e) => updateProfileDraft("gender", e.target.value)}><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></select></div>
                                <div className="form-group"><label>Date of Birth</label><DatePicker value={profileDraft.date_of_birth} onChange={(value) => updateProfileDraft("date_of_birth", value)} /></div>
                                <div className="form-group"><label>Nationality</label><input value={profileDraft.nationality} onChange={(e) => updateProfileDraft("nationality", e.target.value)} /></div>
                                <div className="form-group"><label>Religion</label><input value={profileDraft.religion} onChange={(e) => updateProfileDraft("religion", e.target.value)} /></div>
                                <div className="form-group"><label>Marital Status</label><select value={profileDraft.marital_status} onChange={(e) => updateProfileDraft("marital_status", e.target.value)}><option value="">Select status</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option></select></div>
                                <div className="form-group"><label>No. of Children</label><input type="number" min="0" value={profileDraft.children_count} onChange={(e) => updateProfileDraft("children_count", e.target.value)} /></div>
                                <div className="form-group"><label>Emergency Contact</label><input value={profileDraft.emergency_contact} onChange={(e) => updateProfileDraft("emergency_contact", e.target.value)} /></div>
                                <div className="form-group profile-edit-wide"><label>Address</label><textarea value={profileDraft.address} onChange={(e) => updateProfileDraft("address", e.target.value)} /></div>
                            </div>
                            <div className="profile-edit-actions"><button type="button" className="profile-cancel-btn" onClick={() => setShowEditProfile(false)}>Cancel</button><button type="submit" className="profile-save-btn" disabled={loading}>{loading ? "Saving..." : "Save Changes"}</button></div>
                        </form>
                    </div>
                </div>
            )}

            {showChangePassword && (
                <div className="employee-modal">
                    <div className="employee-modal-card password-change-modal">
                        <button className="modal-close" onClick={() => setShowChangePassword(false)}>×</button>
                        <div className="password-change-heading"><KeyRound size={22} /><div><h2>Change Password</h2><p>Update your employee account password</p></div></div>
                        <form onSubmit={changePassword}>
                            <div className="form-group"><label>Current Password</label><input type="password" value={passwordForm.current_password} onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))} required /></div>
                            <div className="form-group"><label>New Password</label><input type="password" minLength="6" value={passwordForm.new_password} onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))} required /></div>
                            <div className="form-group"><label>Repeat Password</label><input type="password" minLength="6" value={passwordForm.repeat_password} onChange={(event) => setPasswordForm((current) => ({ ...current, repeat_password: event.target.value }))} required /></div>
                            <div className="profile-edit-actions"><button type="button" className="profile-cancel-btn" onClick={() => setShowChangePassword(false)}>Cancel</button><button type="submit" className="profile-save-btn" disabled={loading}>{loading ? "Updating..." : "Update Password"}</button></div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}

function DashboardProfilePanel({ title, open, onToggle, onEdit, content }) {
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