import DashboardLayout from "../../components/layout/DashboardLayout";
import "./EmployeeReport.css";

function EmployeeReport() {

    const employees = [
        {
            id: "EMP001",
            name: "Sakthivel",
            department: "IT",
            designation: "Frontend Developer",
            joiningDate: "10 Jan 2025",
            status: "Active",
        },
        {
            id: "EMP002",
            name: "Sundhar",
            department: "IT",
            designation: "Backend Developer",
            joiningDate: "15 Feb 2025",
            status: "Active",
        },
        {
            id: "EMP003",
            name: "John Doe",
            department: "HR",
            designation: "HR Executive",
            joiningDate: "20 Mar 2025",
            status: "Active",
        },
        {
            id: "EMP004",
            name: "Rahul",
            department: "Finance",
            designation: "Accountant",
            joiningDate: "05 Apr 2025",
            status: "Inactive",
        },
    ];

    return (
        <DashboardLayout>

            <div className="employee-report">

                {/* Header */}
                <div className="report-header">
                    <h1>Employee Report</h1>
                    <p>View employee details and department information.</p>
                </div>

                {/* Summary */}
                <div className="report-summary">

                    <div className="report-card">
                        <h3>Total Employees</h3>
                        <h2>{employees.length}</h2>
                        <p>All employees</p>
                    </div>

                    <div className="report-card">
                        <h3>Active Employees</h3>
                        <h2>
                            {employees.filter(
                                employee => employee.status === "Active"
                            ).length}
                        </h2>
                        <p>Currently working</p>
                    </div>

                    <div className="report-card">
                        <h3>Departments</h3>
                        <h2>3</h2>
                        <p>Active departments</p>
                    </div>

                    <div className="report-card">
                        <h3>Inactive</h3>
                        <h2>
                            {employees.filter(
                                employee => employee.status === "Inactive"
                            ).length}
                        </h2>
                        <p>Inactive employees</p>
                    </div>

                </div>

                {/* Employee Table */}
                <div className="employee-report-table">

                    <h2>Employee Details</h2>

                    <table>

                        <thead>
                            <tr>
                                <th>Employee ID</th>
                                <th>Employee Name</th>
                                <th>Department</th>
                                <th>Designation</th>
                                <th>Joining Date</th>
                                <th>Status</th>
                            </tr>
                        </thead>

                        <tbody>

                            {employees.map((employee) => (

                                <tr key={employee.id}>

                                    <td>{employee.id}</td>

                                    <td>{employee.name}</td>

                                    <td>{employee.department}</td>

                                    <td>{employee.designation}</td>

                                    <td>{employee.joiningDate}</td>

                                    <td>
                                        <span
                                            className={`employee-status ${employee.status.toLowerCase()}`}
                                        >
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

export default EmployeeReport;