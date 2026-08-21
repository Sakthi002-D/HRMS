import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Reports.css";

function Reports() {

    const navigate = useNavigate();
    return (
        <DashboardLayout>

            <div className="reports-page">

                {/* Header */}
                <div className="reports-header">
                    <h1>Reports</h1>
                    <p>View and analyze HR reports</p>
                </div>

                {/* Summary Cards */}
                <div className="reports-summary">

                    <div className="report-card">
                        <h3>Total Employees</h3>
                        <h2>50</h2>
                        <p>Active employees</p>
                    </div>

                    <div className="report-card">
                        <h3>Attendance</h3>
                        <h2>92%</h2>
                        <p>Current month</p>
                    </div>

                    <div className="report-card">
                        <h3>Leave Requests</h3>
                        <h2>12</h2>
                        <p>This month</p>
                    </div>

                    <div className="report-card">
                        <h3>Payroll</h3>
                        <h2>₹13.6L</h2>
                        <p>Current month</p>
                    </div>

                </div>

                {/* Report Sections */}
                <div className="reports-container">

                    <h2>HR Reports</h2>

                    <div className="report-grid">

                        <div className="report-item">
                            <h3>Employee Report</h3>
                            <p>View employee details and department information.</p>
                            <button onClick={() => navigate("/employee-report")}>
                                View Report
                            </button>
                        </div>

                        <div className="report-item">
                            <h3>Attendance Report</h3>
                            <p>View employee attendance and working hours.</p>
                            <button onClick={() => navigate("/attendance-report")}>
                                View Report
                            </button>
                        </div>

                        <div className="report-item">
                            <h3>Leave Report</h3>
                            <p>View leave requests, approvals and leave usage.</p>
                            <button onClick={() => navigate("/leave-report")}>
                                View Report
                            </button>
                        </div>

                        <div className="report-item">
                            <h3>Payroll Report</h3>
                            <p>View salary, deductions and payroll information.</p>
                            <button onClick={() => navigate("/payroll-report")}>
                                View Report
                            </button>
                        </div>

                    </div>

                </div>

            </div>

        </DashboardLayout>
    );
}

export default Reports;