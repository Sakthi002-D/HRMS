import { useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Payroll.css";

function Payroll() {
    const [search, setSearch] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("August 2026");

    const payrollData = [
        {
            employeeID: "EMP001",
            employeeName: "Sakthivel",
            department: "IT",
            basicSalary: 30000,
            allowances: 5000,
            deductions: 2000,
            netSalary: 33000,
            status: "Processed",
        },
        {
            employeeID: "EMP002",
            employeeName: "Sundhar",
            department: "IT",
            basicSalary: 28000,
            allowances: 4000,
            deductions: 1500,
            netSalary: 30500,
            status: "Processed",
        },
        {
            employeeID: "EMP003",
            employeeName: "John Doe",
            department: "HR",
            basicSalary: 35000,
            allowances: 6000,
            deductions: 2500,
            netSalary: 38500,
            status: "Pending",
        },
        {
            employeeID: "EMP004",
            employeeName: "Rahul",
            department: "Finance",
            basicSalary: 32000,
            allowances: 4500,
            deductions: 2000,
            netSalary: 34500,
            status: "Processed",
        },
    ];

    const filteredPayroll = payrollData.filter((employee) =>
        employee.employeeName
            .toLowerCase()
            .includes(search.toLowerCase()) ||
        employee.employeeID
            .toLowerCase()
            .includes(search.toLowerCase())
    );

    const totalSalary = payrollData.reduce(
        (total, employee) => total + employee.netSalary,
        0
    );

    const processedCount = payrollData.filter(
        (employee) => employee.status === "Processed"
    ).length;

    const pendingCount = payrollData.filter(
        (employee) => employee.status === "Pending"
    ).length;

    return (
        <DashboardLayout>

            <div className="payroll-page">

                {/* Page Header */}
                <div className="payroll-header">
                    <h1>Payroll</h1>
                    <p>Manage Employee Payroll</p>
                </div>

                {/* Filters */}
                <div className="payroll-tools">

                    <input
                        type="text"
                        placeholder="Search employee..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                    >
                        <option>August 2026</option>
                        <option>July 2026</option>
                        <option>June 2026</option>
                    </select>

                </div>

                {/* Summary Cards */}
                <div className="payroll-summary">

                    <div className="payroll-card">
                        <h3>Total Payroll</h3>
                        <h2>₹{totalSalary.toLocaleString()}</h2>
                        <p>Current month payroll</p>
                    </div>

                    <div className="payroll-card">
                        <h3>Processed</h3>
                        <h2>{processedCount}</h2>
                        <p>Employees processed</p>
                    </div>

                    <div className="payroll-card">
                        <h3>Pending</h3>
                        <h2>{pendingCount}</h2>
                        <p>Payroll pending</p>
                    </div>

                    <div className="payroll-card">
                        <h3>Employees</h3>
                        <h2>{payrollData.length}</h2>
                        <p>Total employees</p>
                    </div>

                </div>

                {/* Payroll Table */}
                <div className="payroll-table-container">

                    <h2>Employee Payroll</h2>

                    <table className="payroll-table">

                        <thead>
                            <tr>
                                <th>Employee ID</th>
                                <th>Employee Name</th>
                                <th>Department</th>
                                <th>Basic Salary</th>
                                <th>Allowances</th>
                                <th>Deductions</th>
                                <th>Net Salary</th>
                                <th>Status</th>
                            </tr>
                        </thead>

                        <tbody>

                            {filteredPayroll.map((employee) => (

                                <tr key={employee.employeeID}>

                                    <td>{employee.employeeID}</td>

                                    <td>{employee.employeeName}</td>

                                    <td>{employee.department}</td>

                                    <td>₹{employee.basicSalary.toLocaleString()}</td>

                                    <td>₹{employee.allowances.toLocaleString()}</td>

                                    <td>₹{employee.deductions.toLocaleString()}</td>

                                    <td>
                                        <strong>
                                            ₹{employee.netSalary.toLocaleString()}
                                        </strong>
                                    </td>

                                    <td>
                                        <span
                                            className={`payroll-status ${employee.status.toLowerCase()}`}
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

export default Payroll;