import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ReportChart from "../../components/layout/common/ReportChart";
import "./AttendanceReport.css";

function AttendanceReport() {
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

    return (
        <DashboardLayout>
            <div className="report-page">

                <div className="report-header">
                    <div>
                        <h1>Attendance Report</h1>
                        <p>View employee attendance and working hours.</p>
                    </div>
                    <Link className="report-back-button" to="/reports">Back to Reports</Link>
                </div>

                <div className="report-summary">

                    <div className="report-card">
                        <h3>Total Employees</h3>
                        <h2>{loading ? "—" : new Set(attendanceData.map((item) => item.employee_id)).size}</h2>
                        <p>Active employees</p>
                    </div>

                    <div className="report-card">
                        <h3>Average Attendance</h3>
                        <h2>{loading ? "—" : `${attendancePercentage}%`}</h2>
                        <p>Current month</p>
                    </div>

                    <div className="report-card">
                        <h3>Total Present</h3>
                        <h2>{loading ? "—" : presentCount}</h2>
                        <p>Recorded attendance</p>
                    </div>

                    <div className="report-card">
                        <h3>Total Absent</h3>
                        <h2>{loading ? "—" : absentCount}</h2>
                        <p>Current month</p>
                    </div>

                </div>

                <ReportChart
                    title="Attendance"
                    labels={departments.length ? departments : ["No data"]}
                    series={[{ name: "Present", color: "#42ad61", values: departments.map((department) => attendanceData.filter((item) => item.department === department && ["present", "late"].includes(String(item.status).toLowerCase())).length) }, { name: "Absent", color: "#f36ca5", values: departments.map((department) => attendanceData.filter((item) => item.department === department && String(item.status).toLowerCase() === "absent").length) }]}
                />

                <div className="report-table-container">

                    <h2>Employee Attendance</h2>

                    <table className="report-table">

                        <thead>
                            <tr>
                                <th>Employee ID</th>
                                <th>Employee Name</th>
                                <th>Department</th>
                                <th>Working Days</th>
                                <th>Present</th>
                                <th>Absent</th>
                                <th>Attendance</th>
                            </tr>
                        </thead>

                        <tbody>
                            {loading ? (
                                <tr><td colSpan="7">Loading attendance data...</td></tr>
                            ) : attendanceData.length === 0 ? (
                                <tr><td colSpan="7">No attendance data available.</td></tr>
                            ) : attendanceData.map((employee) => {
                                const isPresent = ["present", "late"].includes(String(employee.status).toLowerCase());
                                const attendance = isPresent ? 100 : 0;
                                return (
                                <tr key={employee.employeeID}>

                                    <td>{employee.employee_id}</td>
                                    <td>{employee.employee_name}</td>
                                    <td>{employee.department}</td>
                                    <td>1</td>
                                    <td>{isPresent ? 1 : 0}</td>
                                    <td>{isPresent ? 0 : 1}</td>

                                    <td>
                                        <span className="attendance-badge">
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