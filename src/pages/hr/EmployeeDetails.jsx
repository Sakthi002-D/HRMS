import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./EmployeeDetails.css";

const API_URL = "https://hrms-cuoq.onrender.com";

function EmployeeDetails() {
    const { employeeSlug } = useParams();
    const navigate = useNavigate();

    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

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

    return (
        <DashboardLayout>
            <div className="employee-details-page">

                {/* TOP BAR */}
                <div className="employee-details-topbar">

                    <div>
                        <button
                            className="back-btn"
                            onClick={() => navigate("/employees")}
                        >
                            ← Back to Employees
                        </button>

                        <div className="breadcrumb">
                            Employees
                            <span>/</span>
                            {employee.name}
                        </div>
                    </div>

                    <button
                        className="edit-employee-btn"
                        onClick={() =>
                            navigate("/employees")
                        }
                    >
                        ✎ Edit Employee
                    </button>
                </div>

                {/* PROFILE HERO */}
                <section className="employee-profile-hero">

                    <div className="profile-avatar-large">
                        {employee.profile_photo ? (
                            <img
                                src={employee.profile_photo}
                                alt={employee.name}
                            />
                        ) : (
                            initials
                        )}
                    </div>

                    <div className="profile-main-info">

                        <div className="profile-name-row">
                            <h1>{employee.name}</h1>

                            <span
                                className={`employee-status-badge ${
                                    employee.status === "Active"
                                        ? "active"
                                        : "inactive"
                                }`}
                            >
                                <span className="status-dot"></span>
                                {employee.status}
                            </span>
                        </div>

                        <p className="profile-designation">
                            {employee.designation || "Employee"}
                        </p>

                        <div className="profile-meta">

                            <span>
                                <b>Employee ID</b>
                                {employee.employee_id}
                            </span>

                            <span>
                                <b>Department</b>
                                {employee.department || "-"}
                            </span>

                            <span>
                                <b>Joined</b>
                                {formatDate(employee.joining_date)}
                            </span>

                        </div>
                    </div>

                </section>

                {/* QUICK STATS */}
                <section className="employee-quick-stats">

                    <div className="quick-stat-card">
                        <div className="quick-stat-icon blue">
                            👤
                        </div>

                        <div>
                            <span>Employment Type</span>
                            <strong>
                                {employee.employment_type || "-"}
                            </strong>
                        </div>
                    </div>

                    <div className="quick-stat-card">
                        <div className="quick-stat-icon purple">
                            💼
                        </div>

                        <div>
                            <span>Department</span>
                            <strong>
                                {employee.department || "-"}
                            </strong>
                        </div>
                    </div>

                    <div className="quick-stat-card">
                        <div className="quick-stat-icon green">
                            📅
                        </div>

                        <div>
                            <span>Joining Date</span>
                            <strong>
                                {formatDate(employee.joining_date)}
                            </strong>
                        </div>
                    </div>

                    <div className="quick-stat-card">
                        <div className="quick-stat-icon orange">
                            📞
                        </div>

                        <div>
                            <span>Contact</span>
                            <strong>
                                {employee.phone || "-"}
                            </strong>
                        </div>
                    </div>

                </section>

                {/* DETAILS GRID */}
                <div className="employee-details-grid">

                    {/* PERSONAL DETAILS */}
                    <section className="details-card">

                        <div className="details-card-header">
                            <div className="section-icon">
                                👤
                            </div>

                            <div>
                                <h2>Personal Details</h2>
                                <p>
                                    Personal information of the employee
                                </p>
                            </div>
                        </div>

                        <div className="details-content">

                            <div className="detail-item">
                                <span>Employee ID</span>
                                <strong>
                                    {employee.employee_id}
                                </strong>
                            </div>

                            <div className="detail-item">
                                <span>Full Name</span>
                                <strong>
                                    {employee.name || "-"}
                                </strong>
                            </div>

                            <div className="detail-item">
                                <span>Date of Birth</span>
                                <strong>
                                    {formatDate(employee.date_of_birth)}
                                </strong>
                            </div>

                            <div className="detail-item">
                                <span>Gender</span>
                                <strong>
                                    {employee.gender || "-"}
                                </strong>
                            </div>

                            <div className="detail-item">
                                <span>Email</span>
                                <strong className="email-value">
                                    {employee.email || "-"}
                                </strong>
                            </div>

                            <div className="detail-item">
                                <span>Phone</span>
                                <strong>
                                    {employee.phone || "-"}
                                </strong>
                            </div>

                            <div className="detail-item full-width">
                                <span>Address</span>
                                <strong>
                                    {employee.address || "-"}
                                </strong>
                            </div>

                        </div>

                    </section>

                    {/* JOB DETAILS */}
                    <section className="details-card">

                        <div className="details-card-header">
                            <div className="section-icon purple-icon">
                                💼
                            </div>

                            <div>
                                <h2>Job Details</h2>
                                <p>
                                    Employment and organizational details
                                </p>
                            </div>
                        </div>

                        <div className="details-content">

                            <div className="detail-item">
                                <span>Designation</span>
                                <strong>
                                    {employee.designation || "-"}
                                </strong>
                            </div>

                            <div className="detail-item">
                                <span>Department</span>
                                <strong>
                                    {employee.department || "-"}
                                </strong>
                            </div>

                            <div className="detail-item">
                                <span>Joining Date</span>
                                <strong>
                                    {formatDate(employee.joining_date)}
                                </strong>
                            </div>

                            <div className="detail-item">
                                <span>Employment Type</span>
                                <strong>
                                    {employee.employment_type || "-"}
                                </strong>
                            </div>

                            <div className="detail-item">
                                <span>Employee Status</span>
                                <strong>
                                    <span
                                        className={`mini-status ${
                                            employee.status ===
                                            "Active"
                                                ? "active"
                                                : "inactive"
                                        }`}
                                    >
                                        {employee.status}
                                    </span>
                                </strong>
                            </div>

                        </div>

                    </section>

                    {/* OTHER DETAILS */}
                    <section className="details-card">

                        <div className="details-card-header">
                            <div className="section-icon orange-icon">
                                🛡
                            </div>

                            <div>
                                <h2>Other Details</h2>
                                <p>
                                    Additional employee information
                                </p>
                            </div>
                        </div>

                        <div className="details-content">

                            <div className="detail-item full-width">
                                <span>Emergency Contact</span>
                                <strong>
                                    {employee.emergency_contact || "-"}
                                </strong>
                            </div>

                            <div className="detail-item full-width">
                                <span>Country</span>
                                <strong>
                                    {employee.country || "India"}
                                </strong>
                            </div>

                        </div>

                    </section>

                    {/* CONTACT CARD */}
                    <section className="contact-card">

                        <div className="contact-card-icon">
                            ✉
                        </div>

                        <div>
                            <h2>Need to contact {employee.name}?</h2>

                            <p>
                                Use the employee's registered contact
                                information.
                            </p>

                            <div className="contact-actions">

                                <a
                                    href={`mailto:${employee.email}`}
                                    className="contact-btn primary"
                                >
                                    ✉ Send Email
                                </a>

                                {employee.phone && (
                                    <a
                                        href={`tel:${employee.phone}`}
                                        className="contact-btn secondary"
                                    >
                                        ☎ Call Employee
                                    </a>
                                )}

                            </div>
                        </div>

                    </section>

                </div>

            </div>
        </DashboardLayout>
    );
}

export default EmployeeDetails;