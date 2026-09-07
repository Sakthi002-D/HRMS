import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import DatePicker from "../components/layout/common/DatePicker";
import "./EmployeeDashboard.css";

const API_URL = "http://localhost:5000";

function EmployeeDashboard() {
    const navigate = useNavigate();

    const [employee, setEmployee] = useState(null);
    const [leaves, setLeaves] = useState([]);

    const [showApplyLeave, setShowApplyLeave] = useState(false);
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
        document.getElementById("employee-leave-section")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    };

    const openProfile = () => {
        setActiveSection("profile");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (!employee) {
        return <div className="employee-loading">Loading...</div>;
    }

    const pendingLeaves = leaves.filter(
        (leave) => leave.status === "Pending"
    ).length;

    const approvedLeaves = leaves.filter(
        (leave) => leave.status === "Approved"
    ).length;

    const rejectedLeaves = leaves.filter(
        (leave) => leave.status === "Rejected"
    ).length;

    const profileValue = (value) => value || "-";
    const formatProfileDate = (value) => {
        if (!value) return "-";
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? value
            : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    };

    return (
        <div className={`employee-dashboard ${activeSection}-view`}>

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
                        <h1>Employee Dashboard</h1>
                        <p>
                            Welcome back, {employee.name}
                        </p>
                    </div>

                    <div className="employee-profile">

                        <div className="employee-avatar">
                            {employee.name
                                ?.charAt(0)
                                ?.toUpperCase()}
                        </div>

                        <div>
                            <strong>{employee.name}</strong>
                            <small>
                                {employee.designation}
                            </small>
                        </div>

                    </div>

                </header>


                {/* PROFILE VIEW */}
                <section className="employee-profile-view">
                    <div className="employee-section-heading">
                        <div>
                            <h2>My Profile</h2>
                            <p>Complete employee information from HR records</p>
                        </div>
                        <span className="active-badge">{profileValue(employee.status)}</span>
                    </div>
                    <div className="employee-detail-group">
                        <h3>Basic Information</h3>
                        <div className="employee-detail-grid">
                            <div><label>Employee ID</label><strong>{profileValue(employee.employee_id)}</strong></div>
                            <div><label>Full Name</label><strong>{profileValue(employee.name)}</strong></div>
                            <div><label>Phone</label><strong>{profileValue(employee.phone)}</strong></div>
                            <div><label>Email</label><strong>{profileValue(employee.email)}</strong></div>
                            <div><label>Department</label><strong>{profileValue(employee.department)}</strong></div>
                            <div><label>Designation</label><strong>{profileValue(employee.designation)}</strong></div>
                            <div><label>Gender</label><strong>{profileValue(employee.gender)}</strong></div>
                            <div><label>Date of Birth</label><strong>{formatProfileDate(employee.date_of_birth)}</strong></div>
                            <div><label>Joining Date</label><strong>{formatProfileDate(employee.joining_date)}</strong></div>
                            <div><label>Employment Type</label><strong>{profileValue(employee.employment_type)}</strong></div>
                            <div className="detail-wide"><label>Address</label><strong>{profileValue(employee.address)}</strong></div>
                        </div>
                    </div>
                    <div className="employee-detail-group">
                        <h3>Personal Information</h3>
                        <div className="employee-detail-grid">
                            <div><label>Passport No</label><strong>{profileValue(employee.passport_no)}</strong></div>
                            <div><label>Passport Expiry</label><strong>{formatProfileDate(employee.passport_exp_date)}</strong></div>
                            <div><label>Nationality</label><strong>{profileValue(employee.nationality || employee.country)}</strong></div>
                            <div><label>Religion</label><strong>{profileValue(employee.religion)}</strong></div>
                            <div><label>Marital Status</label><strong>{profileValue(employee.marital_status)}</strong></div>
                            <div><label>No. of Children</label><strong>{profileValue(employee.children_count)}</strong></div>
                            <div><label>Emergency Contact</label><strong>{profileValue(employee.emergency_contact)}</strong></div>
                        </div>
                    </div>
                    <div className="employee-detail-group">
                        <h3>Additional HR Information</h3>
                        <div className="employee-detail-grid">
                            <div><label>Bank Name</label><strong>{profileValue(employee.bank?.bank_name)}</strong></div>
                            <div><label>Account Number</label><strong>{profileValue(employee.bank?.account_number)}</strong></div>
                            <div><label>Qualification</label><strong>{profileValue(employee.education?.qualification)}</strong></div>
                            <div><label>Institution</label><strong>{profileValue(employee.education?.institution)}</strong></div>
                            <div><label>Previous Company</label><strong>{profileValue(employee.experience?.company_name)}</strong></div>
                            <div><label>Previous Role</label><strong>{profileValue(employee.experience?.designation)}</strong></div>
                        </div>
                    </div>
                </section>

                {/* SUMMARY */}
                <section className="employee-summary">

                    <div className="employee-stat-card">
                        <span>📋</span>
                        <div>
                            <small>Total Requests</small>
                            <strong>{leaves.length}</strong>
                        </div>
                    </div>

                    <div className="employee-stat-card">
                        <span>⏳</span>
                        <div>
                            <small>Pending</small>
                            <strong>{pendingLeaves}</strong>
                        </div>
                    </div>

                    <div className="employee-stat-card">
                        <span>✓</span>
                        <div>
                            <small>Approved</small>
                            <strong>{approvedLeaves}</strong>
                        </div>
                    </div>

                    <div className="employee-stat-card">
                        <span>✕</span>
                        <div>
                            <small>Rejected</small>
                            <strong>{rejectedLeaves}</strong>
                        </div>
                    </div>

                </section>


                {/* LEAVE REQUESTS */}
                <section id="employee-leave-section" className="employee-leave-section">

                    <div className="employee-section-header">

                        <div>
                            <h2>My Leave Requests</h2>
                            <p>
                                Check the status of your leave applications
                            </p>
                        </div>

                        <button
                            className="apply-leave-btn"
                            onClick={() => setShowApplyLeave(true)}
                        >
                            + Apply Leave
                        </button>

                    </div>


                    <div className="employee-table-card">

                        <table>

                            <thead>
                                <tr>
                                    <th>Leave Type</th>
                                    <th>From Date</th>
                                    <th>To Date</th>
                                    <th>Days</th>
                                    <th>Reason</th>
                                    <th>Status</th>
                                </tr>
                            </thead>

                            <tbody>

                                {leaves.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan="6"
                                            className="no-leaves"
                                        >
                                            No leave requests found
                                        </td>
                                    </tr>
                                ) : (
                                    leaves.map((leave) => (
                                        <tr key={leave.id}>

                                            <td>
                                                {leave.leave_type}
                                            </td>

                                            <td>
                                                {leave.from_date}
                                            </td>

                                            <td>
                                                {leave.to_date}
                                            </td>

                                            <td>
                                                {leave.days}
                                            </td>

                                            <td>
                                                {leave.reason || "-"}
                                            </td>

                                            <td>
                                                <span
                                                    className={`employee-status ${leave.status?.toLowerCase()}`}
                                                >
                                                    {leave.status}
                                                </span>
                                            </td>

                                        </tr>
                                    ))
                                )}

                            </tbody>

                        </table>

                    </div>

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

        </div>
    );
}

export default EmployeeDashboard;