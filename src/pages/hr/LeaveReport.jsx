import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ReportChart from "../../components/layout/common/ReportChart";
import "./LeaveReport.css";

function LeaveReport() {

    const [leaveData, setLeaveData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("http://localhost:5000/api/leaves")
            .then((response) => {
                if (!response.ok) throw new Error("Unable to load leaves");
                return response.json();
            })
            .then((data) => setLeaveData(Array.isArray(data) ? data : []))
            .catch(() => setLeaveData([]))
            .finally(() => setLoading(false));
    }, []);

    const leaveTypes = useMemo(() => [...new Set(leaveData.map((leave) => leave.leave_type).filter(Boolean))].slice(0, 8), [leaveData]);
    const statusCount = (status) => leaveData.filter((leave) => String(leave.status).toLowerCase() === status.toLowerCase()).length;

    return (
        <DashboardLayout>

            <div className="leave-report-page">

                <div className="leave-report-header">
                    <div>
                        <h1>Leave Report</h1>
                        <p>View leave requests, approvals and leave usage.</p>
                    </div>
                    <Link className="report-back-button" to="/reports">Back to Reports</Link>
                </div>

                <div className="leave-report-summary">

                    <div className="leave-report-card">
                        <h3>Total Leave Requests</h3>
                        <h2>{loading ? "—" : leaveData.length}</h2>
                        <p>This month</p>
                    </div>

                    <div className="leave-report-card">
                        <h3>Approved</h3>
                        <h2>{statusCount("Approved")}</h2>
                        <p>Approved requests</p>
                    </div>

                    <div className="leave-report-card">
                        <h3>Pending</h3>
                        <h2>{statusCount("Pending")}</h2>
                        <p>Waiting for approval</p>
                    </div>

                    <div className="leave-report-card">
                        <h3>Rejected</h3>
                        <h2>{statusCount("Rejected")}</h2>
                        <p>Rejected requests</p>
                    </div>

                </div>

                <ReportChart
                    title="Leave Usage"
                    labels={leaveTypes.length ? leaveTypes : ["No data"]}
                    series={[{ name: "Approved", color: "#00bf65", values: leaveTypes.map((type) => leaveData.filter((leave) => leave.leave_type === type && String(leave.status).toLowerCase() === "approved").length) }, { name: "Pending", color: "#ffbd12", values: leaveTypes.map((type) => leaveData.filter((leave) => leave.leave_type === type && String(leave.status).toLowerCase() === "pending").length) }, { name: "Rejected", color: "#202b36", values: leaveTypes.map((type) => leaveData.filter((leave) => leave.leave_type === type && String(leave.status).toLowerCase() === "rejected").length) }]}
                />

                <div className="leave-report-table-container">

                    <h2>Employee Leave Balance</h2>

                    <table className="leave-report-table">

                        <thead>
                            <tr>
                                <th>Employee ID</th>
                                <th>Employee Name</th>
                                <th>Department</th>
                                <th>Days</th>
                                <th>Status</th>
                                <th>Reason</th>
                                <th>Status</th>
                            </tr>
                        </thead>

                        <tbody>

                            {loading ? (
                                <tr><td colSpan="7">Loading leave data...</td></tr>
                            ) : leaveData.length === 0 ? (
                                <tr><td colSpan="7">No leave data available.</td></tr>
                            ) : leaveData.map((employee) => (
                                <tr key={employee.employeeID}>

                                    <td>{employee.employee_id}</td>

                                    <td>{employee.employee_name}</td>

                                    <td>{employee.department}</td>

                                    <td>{employee.days}</td>

                                    <td>{employee.status}</td>

                                    <td>{employee.reason || "-"}</td>

                                    <td>
                                        <span className={`leave-report-status ${String(employee.status).toLowerCase()}`}>
                                            {employee.status}
                                        </span>
                                    </td>

                                </tr>
                            ))}

                        </tbody>

                    </table>

                </div>

            </div>

        </DashboardLayout>
    );
}

export default LeaveReport;