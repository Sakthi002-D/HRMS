import DashboardLayout from "../../components/layout/DashboardLayout";
import "./LeaveReport.css";

function LeaveReport() {

    const leaveData = [
        {
            employeeID: "EMP001",
            employeeName: "Sakthivel",
            department: "IT",
            totalLeave: 12,
            usedLeave: 4,
            remainingLeave: 8,
            status: "Good"
        },
        {
            employeeID: "EMP002",
            employeeName: "Sundhar",
            department: "IT",
            totalLeave: 12,
            usedLeave: 5,
            remainingLeave: 7,
            status: "Good"
        },
        {
            employeeID: "EMP003",
            employeeName: "John Doe",
            department: "HR",
            totalLeave: 12,
            usedLeave: 8,
            remainingLeave: 4,
            status: "Low"
        },
        {
            employeeID: "EMP004",
            employeeName: "Rahul",
            department: "Finance",
            totalLeave: 12,
            usedLeave: 3,
            remainingLeave: 9,
            status: "Good"
        }
    ];

    return (
        <DashboardLayout>

            <div className="leave-report-page">

                <div className="leave-report-header">
                    <h1>Leave Report</h1>
                    <p>View leave requests, approvals and leave usage.</p>
                </div>

                <div className="leave-report-summary">

                    <div className="leave-report-card">
                        <h3>Total Leave Requests</h3>
                        <h2>12</h2>
                        <p>This month</p>
                    </div>

                    <div className="leave-report-card">
                        <h3>Approved</h3>
                        <h2>8</h2>
                        <p>Approved requests</p>
                    </div>

                    <div className="leave-report-card">
                        <h3>Pending</h3>
                        <h2>2</h2>
                        <p>Waiting for approval</p>
                    </div>

                    <div className="leave-report-card">
                        <h3>Rejected</h3>
                        <h2>2</h2>
                        <p>Rejected requests</p>
                    </div>

                </div>

                <div className="leave-report-table-container">

                    <h2>Employee Leave Balance</h2>

                    <table className="leave-report-table">

                        <thead>
                            <tr>
                                <th>Employee ID</th>
                                <th>Employee Name</th>
                                <th>Department</th>
                                <th>Total Leave</th>
                                <th>Used Leave</th>
                                <th>Remaining Leave</th>
                                <th>Status</th>
                            </tr>
                        </thead>

                        <tbody>

                            {leaveData.map((employee) => (
                                <tr key={employee.employeeID}>

                                    <td>{employee.employeeID}</td>

                                    <td>{employee.employeeName}</td>

                                    <td>{employee.department}</td>

                                    <td>{employee.totalLeave}</td>

                                    <td>{employee.usedLeave}</td>

                                    <td>{employee.remainingLeave}</td>

                                    <td>
                                        <span className={`leave-report-status ${employee.status.toLowerCase()}`}>
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