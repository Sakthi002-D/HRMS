import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ReportChart from "../../components/layout/common/ReportChart";
import "./EmployeeReport.css";

function EmployeeReport() {

    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("http://localhost:5000/api/employees")
            .then((response) => {
                if (!response.ok) throw new Error("Unable to load employees");
                return response.json();
            })
            .then((data) => setEmployees(Array.isArray(data) ? data.map((employee) => ({
                id: employee.id ?? employee.employee_id,
                name: employee.name ?? "Unknown Employee",
                department: employee.department ?? "Unassigned",
                designation: employee.designation ?? "Employee",
                joiningDate: employee.joining_date ?? employee.joiningDate ?? "",
                status: employee.status ?? "Inactive",
            })) : []))
            .catch(() => setEmployees([]))
            .finally(() => setLoading(false));
    }, []);

    const departments = useMemo(
        () => [...new Set(employees.map((employee) => employee.department).filter(Boolean))],
        [employees]
    );

    const chartLabels = departments.slice(0, 8);
    const activeByDepartment = chartLabels.map((department) => employees.filter((employee) => employee.department === department && employee.status === "Active").length);
    const inactiveByDepartment = chartLabels.map((department) => employees.filter((employee) => employee.department === department && employee.status !== "Active").length);

    return (
        <DashboardLayout>

            <div className="employee-report">

                {/* Header */}
                <div className="report-header">
                    <div>
                        <h1>Employee Report</h1>
                        <p>View employee details and department information.</p>
                    </div>
                    <Link className="report-back-button" to="/reports">Back to Reports</Link>
                </div>

                {/* Summary */}
                <div className="report-summary">

                    <div className="report-card">
                        <h3>Total Employees</h3>
                        <h2>{loading ? "—" : employees.length}</h2>
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
                        <h2>{departments.length}</h2>
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

                <ReportChart
                    title="Employee Growth"
                    labels={chartLabels.length ? chartLabels : ["No data"]}
                    series={[{ name: "Active Employees", color: "#08bf5b", values: activeByDepartment.length ? activeByDepartment : [0] }, { name: "Inactive Employees", color: "#dce2e7", values: inactiveByDepartment.length ? inactiveByDepartment : [0] }]}
                />

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

                            {loading ? (
                                <tr><td colSpan="6">Loading employee data...</td></tr>
                            ) : employees.length === 0 ? (
                                <tr><td colSpan="6">No employee data available.</td></tr>
                            ) : employees.map((employee) => (

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