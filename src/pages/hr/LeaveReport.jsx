import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ReportChart from "../../components/layout/common/ReportChart";
import "./LeaveReport.css";

function LeaveReport() {
    const { t } = useTranslation();

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
    const leaveStatusLabel = (status) => t(`leaveDetails.status.${String(status).toLowerCase()}`, { defaultValue: String(status) });
    const statusCount = (status) => leaveData.filter((leave) => String(leave.status).toLowerCase() === status.toLowerCase()).length;

    return (
        <DashboardLayout>

            <div className="leave-report-page">

                <div className="leave-report-header">
                    <div>
                        <h1>{t("reports.hub.cards.leave.title", { defaultValue: "Leave Report" })}</h1>
                        <p>{t("reports.hub.cards.leave.description", { defaultValue: "View leave requests, approvals and leave usage." })}</p>
                    </div>
                    <Link className="report-back-button" to="/reports">{t("reports.common.backToReports", { defaultValue: "Back to Reports" })}</Link>
                </div>

                <div className="leave-report-summary">

                    <div className="leave-report-card">
                        <h3>{t("reports.leave.totalRequests", { defaultValue: "Total Leave Requests" })}</h3>
                        <h2>{loading ? "—" : leaveData.length}</h2>
                        <p>{t("reports.leave.thisMonth", { defaultValue: "This month" })}</p>
                    </div>

                    <div className="leave-report-card">
                        <h3>{t("leaveDetails.status.approved", { defaultValue: "Approved" })}</h3>
                        <h2>{statusCount("Approved")}</h2>
                        <p>{t("reports.leave.approvedRequests", { defaultValue: "Approved requests" })}</p>
                    </div>

                    <div className="leave-report-card">
                        <h3>{t("leaveDetails.status.pending", { defaultValue: "Pending" })}</h3>
                        <h2>{statusCount("Pending")}</h2>
                        <p>{t("reports.leave.waitingApproval", { defaultValue: "Waiting for approval" })}</p>
                    </div>

                    <div className="leave-report-card">
                        <h3>{t("leaveDetails.status.rejected", { defaultValue: "Rejected" })}</h3>
                        <h2>{statusCount("Rejected")}</h2>
                        <p>{t("reports.leave.rejectedRequests", { defaultValue: "Rejected requests" })}</p>
                    </div>

                </div>

                <ReportChart
                    title={t("reports.leave.chartTitle", { defaultValue: "Leave Usage" })}
                    labels={leaveTypes.length ? leaveTypes.map((type) => t(`leaveTypes.${type}`, { defaultValue: type })) : [t("reports.common.noData", { defaultValue: "No data" })]}
                    series={[{ name: t("leaveDetails.status.approved", { defaultValue: "Approved" }), color: "#00bf65", values: leaveTypes.map((type) => leaveData.filter((leave) => leave.leave_type === type && String(leave.status).toLowerCase() === "approved").length) }, { name: t("leaveDetails.status.pending", { defaultValue: "Pending" }), color: "#ffbd12", values: leaveTypes.map((type) => leaveData.filter((leave) => leave.leave_type === type && String(leave.status).toLowerCase() === "pending").length) }, { name: t("leaveDetails.status.rejected", { defaultValue: "Rejected" }), color: "#202b36", values: leaveTypes.map((type) => leaveData.filter((leave) => leave.leave_type === type && String(leave.status).toLowerCase() === "rejected").length) }]}
                />

                <div className="leave-report-table-container">

                    <h2>{t("reports.leave.tableTitle", { defaultValue: "Employee Leave Balance" })}</h2>

                    <table className="leave-report-table">

                        <thead>
                            <tr>
                                <th>{t("reports.common.employeeId", { defaultValue: "Employee ID" })}</th>
                                <th>{t("reports.common.employeeName", { defaultValue: "Employee Name" })}</th>
                                <th>{t("reports.common.department", { defaultValue: "Department" })}</th>
                                <th>{t("reports.leave.days", { defaultValue: "Days" })}</th>
                                <th>{t("reports.common.status", { defaultValue: "Status" })}</th>
                                <th>{t("reports.leave.reason", { defaultValue: "Reason" })}</th>
                                <th>{t("reports.common.status", { defaultValue: "Status" })}</th>
                            </tr>
                        </thead>

                        <tbody>

                            {loading ? (
                                <tr><td colSpan="7">{t("reports.leave.loading", { defaultValue: "Loading leave data..." })}</td></tr>
                            ) : leaveData.length === 0 ? (
                                <tr><td colSpan="7">{t("reports.leave.empty", { defaultValue: "No leave data available." })}</td></tr>
                            ) : leaveData.map((employee) => (
                                <tr key={employee.employeeID}>

                                    <td><span dir="ltr" className="ltr-text">{employee.employee_id}</span></td>

                                    <td>{employee.employee_name}</td>

                                    <td>{employee.department}</td>

                                    <td>{employee.days}</td>

                                    <td>{leaveStatusLabel(employee.status)}</td>

                                    <td>{employee.reason || "-"}</td>

                                    <td>
                                        <span className={`leave-report-status ${String(employee.status).toLowerCase()}`}>
                                            {leaveStatusLabel(employee.status)}
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