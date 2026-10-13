import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ReportChart from "../../components/layout/common/ReportChart";
import "./AttendanceReport.css";

// D365 rows are identified by the full D365 identity so they never merge with HRMS employee IDs
const getPersonKey = (item) => item.source === "D365"
    ? `D365|${item.personnel_number}|${item.employment_legal_entity_id}|${item.employment_id}`
    : `HRMS|${item.employee_id}`;

function AttendanceReport() {
    const { t } = useTranslation();
    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("http://localhost:5000/api/attendance")
            .then((response) => {
                if (!response.ok) throw new Error("Unable to load attendance");
                return response.json();
            })
            .then((data) => setAttendanceData(Array.isArray(data) ? data : []))
            .catch(() => setAttendanceData([]))
            .finally(() => setLoading(false));
    }, []);

    const presentCount = attendanceData.filter((item) => ["present", "late"].includes(String(item.status).toLowerCase())).length;
    const absentCount = attendanceData.filter((item) => String(item.status).toLowerCase() === "absent").length;
    const attendancePercentage = attendanceData.length ? Math.round((presentCount / attendanceData.length) * 100) : 0;
    const departments = useMemo(() => [...new Set(attendanceData.map((item) => item.department).filter(Boolean))].slice(0, 8), [attendanceData]);
    const totalPeople = new Set(attendanceData.map(getPersonKey)).size;

    return (
        <DashboardLayout>
            <div className="report-page">

                <div className="report-header">
                    <div>
                        <h1>{t("reports.hub.cards.attendance.title", { defaultValue: "Attendance Report" })}</h1>
                        <p>{t("reports.hub.cards.attendance.description", { defaultValue: "View employee attendance and working hours." })}</p>
                    </div>
                    <Link className="report-back-button" to="/reports">{t("reports.common.backToReports", { defaultValue: "Back to Reports" })}</Link>
                </div>

                <div className="report-summary">

                    <div className="report-card">
                        <h3>{t("reports.common.totalEmployees", { defaultValue: "Total Employees" })}</h3>
                        <h2>{loading ? "—" : totalPeople}</h2>
                        <p>{t("reports.attendance.activeEmployees", { defaultValue: "Active employees" })}</p>
                    </div>

                    <div className="report-card">
                        <h3>{t("reports.attendance.averageAttendance", { defaultValue: "Average Attendance" })}</h3>
                        <h2>{loading ? "—" : <span dir="ltr" className="ltr-text">{`${attendancePercentage}%`}</span>}</h2>
                        <p>{t("reports.attendance.currentMonth", { defaultValue: "Current month" })}</p>
                    </div>

                    <div className="report-card">
                        <h3>{t("reports.attendance.totalPresent", { defaultValue: "Total Present" })}</h3>
                        <h2>{loading ? "—" : presentCount}</h2>
                        <p>{t("reports.attendance.recordedAttendance", { defaultValue: "Recorded attendance" })}</p>
                    </div>

                    <div className="report-card">
                        <h3>{t("reports.attendance.totalAbsent", { defaultValue: "Total Absent" })}</h3>
                        <h2>{loading ? "—" : absentCount}</h2>
                        <p>{t("reports.attendance.currentMonth", { defaultValue: "Current month" })}</p>
                    </div>

                </div>

                <ReportChart
                    title={t("reports.attendance.chartTitle", { defaultValue: "Attendance" })}
                    labels={departments.length ? departments : [t("reports.common.noData", { defaultValue: "No data" })]}
                    series={[{ name: t("employeeAttendance.status.present", { defaultValue: "Present" }), color: "#42ad61", values: departments.map((department) => attendanceData.filter((item) => item.department === department && ["present", "late"].includes(String(item.status).toLowerCase())).length) }, { name: t("employeeAttendance.status.absent", { defaultValue: "Absent" }), color: "#f36ca5", values: departments.map((department) => attendanceData.filter((item) => item.department === department && String(item.status).toLowerCase() === "absent").length) }]}
                />

                <div className="report-table-container">

                    <h2>{t("reports.attendance.tableTitle", { defaultValue: "Employee Attendance" })}</h2>

                    <table className="report-table">

                        <thead>
                            <tr>
                                <th>{t("reports.common.employeeId", { defaultValue: "Employee ID" })}</th>
                                <th>{t("reports.common.employeeName", { defaultValue: "Employee Name" })}</th>
                                <th>{t("reports.common.department", { defaultValue: "Department" })}</th>
                                <th>{t("reports.attendance.workingDays", { defaultValue: "Working Days" })}</th>
                                <th>{t("employeeAttendance.status.present", { defaultValue: "Present" })}</th>
                                <th>{t("employeeAttendance.status.absent", { defaultValue: "Absent" })}</th>
                                <th>{t("reports.attendance.chartTitle", { defaultValue: "Attendance" })}</th>
                            </tr>
                        </thead>

                        <tbody>
                            {loading ? (
                                <tr><td colSpan="7">{t("reports.attendance.loading", { defaultValue: "Loading attendance data..." })}</td></tr>
                            ) : attendanceData.length === 0 ? (
                                <tr><td colSpan="7">{t("reports.attendance.empty", { defaultValue: "No attendance data available." })}</td></tr>
                            ) : attendanceData.map((employee) => {
                                const isPresent = ["present", "late"].includes(String(employee.status).toLowerCase());
                                const attendance = isPresent ? 100 : 0;
                                return (
                                <tr key={employee.id ?? getPersonKey(employee)}>

                                    <td><span dir="ltr" className="ltr-text">{employee.employee_id}</span></td>
                                    <td>{employee.employee_name}{employee.source === "D365" && <small> (D365)</small>}</td>
                                    <td>{employee.department}</td>
                                    <td>1</td>
                                    <td>{isPresent ? 1 : 0}</td>
                                    <td>{isPresent ? 0 : 1}</td>

                                    <td>
                                        <span className="attendance-badge" dir="ltr">
                                            {attendance}%
                                        </span>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>

                    </table>

                </div>

            </div>
        </DashboardLayout>
    );
}

export default AttendanceReport;