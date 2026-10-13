import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ReportChart from "../../components/layout/common/ReportChart";
import "./EmployeeReport.css";

function EmployeeReport() {
    const { t } = useTranslation();

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
                        <h1>{t("reports.hub.cards.employee.title", { defaultValue: "Employee Report" })}</h1>
                        <p>{t("reports.hub.cards.employee.description", { defaultValue: "View employee details and department information." })}</p>
                    </div>
                    <Link className="report-back-button" to="/reports">{t("reports.common.backToReports", { defaultValue: "Back to Reports" })}</Link>
                </div>

                {/* Summary */}
                <div className="report-summary">

                    <div className="report-card">
                        <h3>{t("reports.common.totalEmployees", { defaultValue: "Total Employees" })}</h3>
                        <h2>{loading ? "—" : employees.length}</h2>
                        <p>{t("reports.employee.allEmployees", { defaultValue: "All employees" })}</p>
                    </div>

                    <div className="report-card">
                        <h3>{t("reports.employee.activeEmployees", { defaultValue: "Active Employees" })}</h3>
                        <h2>
                            {employees.filter(
                                employee => employee.status === "Active"
                            ).length}
                        </h2>
                        <p>{t("reports.employee.currentlyWorking", { defaultValue: "Currently working" })}</p>
                    </div>

                    <div className="report-card">
                        <h3>{t("reports.employee.departments", { defaultValue: "Departments" })}</h3>
                        <h2>{departments.length}</h2>
                        <p>{t("reports.employee.activeDepartments", { defaultValue: "Active departments" })}</p>
                    </div>

                    <div className="report-card">
                        <h3>{t("reports.employee.inactive", { defaultValue: "Inactive" })}</h3>
                        <h2>
                            {employees.filter(
                                employee => employee.status === "Inactive"
                            ).length}
                        </h2>
                        <p>{t("reports.employee.inactiveEmployees", { defaultValue: "Inactive employees" })}</p>
                    </div>

                </div>

                <ReportChart
                    title={t("reports.employee.chartTitle", { defaultValue: "Employee Growth" })}
                    labels={chartLabels.length ? chartLabels : [t("reports.common.noData", { defaultValue: "No data" })]}
                    series={[{ name: t("reports.employee.activeEmployees", { defaultValue: "Active Employees" }), color: "#08bf5b", values: activeByDepartment.length ? activeByDepartment : [0] }, { name: t("reports.employee.inactiveSeries", { defaultValue: "Inactive Employees" }), color: "#dce2e7", values: inactiveByDepartment.length ? inactiveByDepartment : [0] }]}
                />

                {/* Employee Table */}
                <div className="employee-report-table">

                    <h2>{t("reports.employee.tableTitle", { defaultValue: "Employee Details" })}</h2>

                    <table>

                        <thead>
                            <tr>
                                <th>{t("reports.common.employeeId", { defaultValue: "Employee ID" })}</th>
                                <th>{t("reports.common.employeeName", { defaultValue: "Employee Name" })}</th>
                                <th>{t("reports.common.department", { defaultValue: "Department" })}</th>
                                <th>{t("reports.common.designation", { defaultValue: "Designation" })}</th>
                                <th>{t("reports.common.joiningDate", { defaultValue: "Joining Date" })}</th>
                                <th>{t("reports.common.status", { defaultValue: "Status" })}</th>
                            </tr>
                        </thead>

                        <tbody>

                            {loading ? (
                                <tr><td colSpan="6">{t("reports.employee.loading", { defaultValue: "Loading employee data..." })}</td></tr>
                            ) : employees.length === 0 ? (
                                <tr><td colSpan="6">{t("reports.employee.empty", { defaultValue: "No employee data available." })}</td></tr>
                            ) : employees.map((employee) => (

                                <tr key={employee.id}>

                                    <td><span dir="ltr" className="ltr-text">{employee.id}</span></td>

                                    <td>{employee.name}</td>

                                    <td>{employee.department}</td>

                                    <td>{employee.designation}</td>

                                    <td><span dir="ltr" className="ltr-text">{employee.joiningDate}</span></td>

                                    <td>
                                        <span
                                            className={`employee-status ${employee.status.toLowerCase()}`}
                                        >
                                            {t(`employeeProfile.values.status.${employee.status.toLowerCase()}`, { defaultValue: employee.status })}
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