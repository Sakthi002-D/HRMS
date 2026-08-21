import DashboardLayout from "../../components/layout/DashboardLayout";
import "./PayrollReport.css";

function PayrollReport() {

    const payrollData = [
        {
            employeeID: "EMP001",
            employeeName: "Sakthivel",
            department: "IT",
            basicSalary: "₹30,000",
            allowances: "₹5,000",
            deductions: "₹2,000",
            netSalary: "₹33,000"
        },
        {
            employeeID: "EMP002",
            employeeName: "Sundhar",
            department: "IT",
            basicSalary: "₹28,000",
            allowances: "₹4,000",
            deductions: "₹1,500",
            netSalary: "₹30,500"
        },
        {
            employeeID: "EMP003",
            employeeName: "John Doe",
            department: "HR",
            basicSalary: "₹35,000",
            allowances: "₹6,000",
            deductions: "₹2,500",
            netSalary: "₹38,500"
        },
        {
            employeeID: "EMP004",
            employeeName: "Rahul",
            department: "Finance",
            basicSalary: "₹32,000",
            allowances: "₹4,500",
            deductions: "₹2,000",
            netSalary: "₹34,500"
        }
    ];

    return (
        <DashboardLayout>

            <div className="payroll-report-page">

                <div className="payroll-report-header">
                    <h1>Payroll Report</h1>
                    <p>View salary, deductions and payroll information.</p>
                </div>

                <div className="payroll-report-summary">

                    <div className="payroll-report-card">
                        <h3>Total Payroll</h3>
                        <h2>₹13.6L</h2>
                        <p>Current month</p>
                    </div>

                    <div className="payroll-report-card">
                        <h3>Processed</h3>
                        <h2>3</h2>
                        <p>Employees processed</p>
                    </div>

                    <div className="payroll-report-card">
                        <h3>Pending</h3>
                        <h2>1</h2>
                        <p>Payroll pending</p>
                    </div>

                    <div className="payroll-report-card">
                        <h3>Employees</h3>
                        <h2>4</h2>
                        <p>Total employees</p>
                    </div>

                </div>

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

                            {payrollData.map((employee) => (
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