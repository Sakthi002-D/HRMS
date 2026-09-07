import { Link } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ReportChart from "../../components/layout/common/ReportChart";
import "./PayrollReport.css";

function PayrollReport() {

    const payrollData = [];

    return (
        <DashboardLayout>

            <div className="payroll-report-page">

                <div className="payroll-report-header">
                    <div>
                        <h1>Payroll Report</h1>
                        <p>View salary, deductions and payroll information.</p>
                    </div>
                    <Link className="report-back-button" to="/reports">Back to Reports</Link>
                </div>

                <div className="payroll-report-summary">

                    <div className="payroll-report-card">
                        <h3>Total Payroll</h3>
                        <h2>—</h2>
                        <p>No payroll data</p>
                    </div>

                    <div className="payroll-report-card">
                        <h3>Processed</h3>
                        <h2>—</h2>
                        <p>No payroll data</p>
                    </div>

                    <div className="payroll-report-card">
                        <h3>Pending</h3>
                        <h2>—</h2>
                        <p>No payroll data</p>
                    </div>

                    <div className="payroll-report-card">
                        <h3>Employees</h3>
                        <h2>—</h2>
                        <p>No payroll data</p>
                    </div>

                </div>

                <ReportChart
                    title="Payroll Trend"
                    labels={["No data"]}
                    series={[{ name: "Net Payroll", color: "#ff7055", values: [0] }]}
                />

                <div className="payroll-report-table-container">

                    <h2>Employee Payroll</h2>

                    <table className="payroll-report-table">

                        <thead>
                            <tr>
                                <th>Employee ID</th>
                                <th>Employee Name</th>
                                <th>Department</th>
                                <th>Basic Salary</th>
                                <th>Allowances</th>
                                <th>Deductions</th>
                                <th>Net Salary</th>
                            </tr>
                        </thead>

                        <tbody>

                            {payrollData.length === 0 ? (
                                <tr><td colSpan="7">No payroll data available.</td></tr>
                            ) : payrollData.map((employee) => (
                                <tr key={employee.employeeID}>

                                    <td>{employee.employeeID}</td>

                                    <td>{employee.employeeName}</td>

                                    <td>{employee.department}</td>

                                    <td>{employee.basicSalary}</td>

                                    <td>{employee.allowances}</td>

                                    <td>{employee.deductions}</td>

                                    <td>
                                        <strong>{employee.netSalary}</strong>
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

export default PayrollReport;