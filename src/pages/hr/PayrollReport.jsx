import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ReportChart from "../../components/layout/common/ReportChart";
import "./PayrollReport.css";

function PayrollReport() {
    const { t } = useTranslation();

    const payrollData = [];

    return (
        <DashboardLayout>

            <div className="payroll-report-page">

                <div className="payroll-report-header">
                    <div>
                        <h1>{t("reports.hub.cards.payroll.title", { defaultValue: "Payroll Report" })}</h1>
                        <p>{t("reports.hub.cards.payroll.description", { defaultValue: "View salary, deductions and payroll information." })}</p>
                    </div>
                    <Link className="report-back-button" to="/reports">{t("reports.common.backToReports", { defaultValue: "Back to Reports" })}</Link>
                </div>

                <div className="payroll-report-summary">

                    <div className="payroll-report-card">
                        <h3>{t("reports.payroll.totalPayroll", { defaultValue: "Total Payroll" })}</h3>
                        <h2>—</h2>
                        <p>{t("reports.payroll.noPayrollData", { defaultValue: "No payroll data" })}</p>
                    </div>

                    <div className="payroll-report-card">
                        <h3>{t("reports.payroll.processed", { defaultValue: "Processed" })}</h3>
                        <h2>—</h2>
                        <p>{t("reports.payroll.noPayrollData", { defaultValue: "No payroll data" })}</p>
                    </div>

                    <div className="payroll-report-card">
                        <h3>{t("leaveDetails.status.pending", { defaultValue: "Pending" })}</h3>
                        <h2>—</h2>
                        <p>{t("reports.payroll.noPayrollData", { defaultValue: "No payroll data" })}</p>
                    </div>

                    <div className="payroll-report-card">
                        <h3>{t("reports.common.employees", { defaultValue: "Employees" })}</h3>
                        <h2>—</h2>
                        <p>{t("reports.payroll.noPayrollData", { defaultValue: "No payroll data" })}</p>
                    </div>

                </div>

                <ReportChart
                    title={t("reports.payroll.chartTitle", { defaultValue: "Payroll Trend" })}
                    labels={[t("reports.common.noData", { defaultValue: "No data" })]}
                    series={[{ name: t("reports.payroll.netPayroll", { defaultValue: "Net Payroll" }), color: "#ff7055", values: [0] }]}
                />

                <div className="payroll-report-table-container">

                    <h2>{t("reports.payroll.tableTitle", { defaultValue: "Employee Payroll" })}</h2>

                    <table className="payroll-report-table">

                        <thead>
                            <tr>
                                <th>{t("reports.common.employeeId", { defaultValue: "Employee ID" })}</th>
                                <th>{t("reports.common.employeeName", { defaultValue: "Employee Name" })}</th>
                                <th>{t("reports.common.department", { defaultValue: "Department" })}</th>
                                <th>{t("employeePayroll.basicSalary", { defaultValue: "Basic Salary" })}</th>
                                <th>{t("employeePayroll.allowances", { defaultValue: "Allowances" })}</th>
                                <th>{t("employeePayroll.deductions", { defaultValue: "Deductions" })}</th>
                                <th>{t("employeePayroll.netSalary", { defaultValue: "Net Salary" })}</th>
                            </tr>
                        </thead>

                        <tbody>

                            {payrollData.length === 0 ? (
                                <tr><td colSpan="7">{t("reports.payroll.empty", { defaultValue: "No payroll data available." })}</td></tr>
                            ) : payrollData.map((employee) => (
                                <tr key={employee.employeeID}>

                                    <td><span dir="ltr" className="ltr-text">{employee.employeeID}</span></td>

                                    <td>{employee.employeeName}</td>

                                    <td>{employee.department}</td>

                                    <td><span dir="ltr" className="ltr-text">{employee.basicSalary}</span></td>

                                    <td><span dir="ltr" className="ltr-text">{employee.allowances}</span></td>

                                    <td><span dir="ltr" className="ltr-text">{employee.deductions}</span></td>

                                    <td>
                                        <strong><span dir="ltr" className="ltr-text">{employee.netSalary}</span></strong>
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