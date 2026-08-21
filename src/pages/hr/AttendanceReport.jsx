import DashboardLayout from "../../components/layout/DashboardLayout";
import "./AttendanceReport.css";

function AttendanceReport() {
    const attendanceData = [
        {
            employeeID: "EMP001",
            employeeName: "Sakthivel",
            department: "IT",
            workingDays: 22,
            presentDays: 20,
            absentDays: 2,
            attendance: "91%"
        },
        {
            employeeID: "EMP002",
            employeeName: "Sundhar",
            department: "IT",
            workingDays: 22,
            presentDays: 21,
            absentDays: 1,
            attendance: "95%"
        },
        {
            employeeID: "EMP003",
            employeeName: "John Doe",
            department: "HR",
            workingDays: 22,
            presentDays: 19,
            absentDays: 3,
            attendance: "86%"
        },
        {
            employeeID: "EMP004",
            employeeName: "Rahul",
            department: "Finance",
            workingDays: 22,
            presentDays: 20,
            absentDays: 2,
            attendance: "91%"
        }
    ];

    return (
        <DashboardLayout>
            <div className="report-page">

                <div className="report-header">
                    <h1>Attendance Report</h1>
                    <p>View employee attendance and working hours.</p>
                </div>

                <div className="report-summary">

                    <div className="report-card">
                        <h3>Total Employees</h3>
                        <h2>50</h2>
                        <p>Active employees</p>
                    </div>

                    <div className="report-card">
                        <h3>Average Attendance</h3>
                        <h2>92%</h2>
                        <p>Current month</p>
                    </div>

                    <div className="report-card">
                        <h3>Total Present</h3>
                        <h2>80</h2>
                        <p>Recorded attendance</p>
                    </div>

                    <div className="report-card">
                        <h3>Total Absent</h3>
                        <h2>8</h2>
                        <p>Current month</p>
                    </div>

                </div>

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
                            {attendanceData.map((employee) => (
                                <tr key={employee.employeeID}>

                                    <td>{employee.employeeID}</td>
                                    <td>{employee.employeeName}</td>
                                    <td>{employee.department}</td>
                                    <td>{employee.workingDays}</td>
                                    <td>{employee.presentDays}</td>
                                    <td>{employee.absentDays}</td>

                                    <td>
                                        <span className="attendance-badge">
                                            {employee.attendance}
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

export default AttendanceReport;