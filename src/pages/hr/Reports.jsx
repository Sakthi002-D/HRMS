import { useState } from "react";
import { Grid2X2, LayoutList } from "lucide-react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Reports.css";

function Reports() {

    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState("list");
    return (
        <DashboardLayout>

            <div className="reports-page">

                {/* Header */}
                <div className="reports-header">
                    <div>
                        <h1>Reports</h1>
                        <p>View and analyze HR reports</p>
                    </div>
                    <div className="reports-header-actions">
                        <button className={`report-view-toggle ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")} aria-label="List view">
                            <LayoutList size={16} />
                        </button>
                        <button className={`report-view-toggle ${viewMode === "grid" ? "active" : ""}`} onClick={() => setViewMode("grid")} aria-label="Grid view">
                            <Grid2X2 size={15} />
                        </button>
                    </div>
                </div>

                {/* Report Sections */}
                <div className="reports-container">
                    <div className={`report-grid ${viewMode === "grid" ? "report-grid-view" : ""}`}>

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