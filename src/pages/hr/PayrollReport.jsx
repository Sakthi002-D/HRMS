import { Banknote, CircleCheck, Hourglass, Users, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
    ReportChart,
    ReportHero,
    ReportPage,
    ReportTable,
    StatCard,
    StatGrid,
} from "../../components/reports/ReportKit";

const payrollData = [];

function PayrollReport() {
    const { t } = useTranslation();

    const noData = t("reports.payroll.noPayrollData", { defaultValue: "No payroll data" });

    const columns = [
        {
            key: "employeeID",
            header: t("reports.common.employeeId", { defaultValue: "Employee ID" }),
            render: (employee) => <span dir="ltr" className="rp-cell-id">{employee.employeeID}</span>,
        },
        {
            key: "employeeName",
            header: t("reports.common.employeeName", { defaultValue: "Employee Name" }),
            render: (employee) => <span className="rp-cell-main">{employee.employeeName}</span>,
        },
        { key: "department", header: t("reports.common.department", { defaultValue: "Department" }) },
        {
            key: "basicSalary",
            header: t("employeePayroll.basicSalary", { defaultValue: "Basic Salary" }),
            align: "end",
            render: (employee) => <span dir="ltr" className="rp-cell-num">{employee.basicSalary}</span>,
        },
        {
            key: "allowances",
            header: t("employeePayroll.allowances", { defaultValue: "Allowances" }),
            align: "end",
            render: (employee) => <span dir="ltr" className="rp-cell-num">{employee.allowances}</span>,
        },
        {
            key: "deductions",
            header: t("employeePayroll.deductions", { defaultValue: "Deductions" }),
            align: "end",
            render: (employee) => <span dir="ltr" className="rp-cell-num">{employee.deductions}</span>,
        },
        {
            key: "netSalary",
            header: t("employeePayroll.netSalary", { defaultValue: "Net Salary" }),
            align: "end",
            render: (employee) => <span dir="ltr" className="rp-cell-num">{employee.netSalary}</span>,
        },
    ];

    return (
        <DashboardLayout>
            <ReportPage tone="amber">

                <ReportHero
                    icon={Wallet}
                    title={t("reports.hub.cards.payroll.title", { defaultValue: "Payroll Report" })}
                    subtitle={t("reports.hub.cards.payroll.description", { defaultValue: "View salary, deductions and payroll information." })}
                />

                <StatGrid>
                    <StatCard icon={Banknote} tone="amber" label={t("reports.payroll.totalPayroll", { defaultValue: "Total Payroll" })} value="—" hint={noData} />
                    <StatCard icon={CircleCheck} tone="green" label={t("reports.payroll.processed", { defaultValue: "Processed" })} value="—" hint={noData} />
                    <StatCard icon={Hourglass} tone="violet" label={t("leaveDetails.status.pending", { defaultValue: "Pending" })} value="—" hint={noData} />
                    <StatCard icon={Users} tone="blue" label={t("reports.common.employees", { defaultValue: "Employees" })} value="—" hint={noData} />
                </StatGrid>

                <ReportChart
                    title={t("reports.payroll.chartTitle", { defaultValue: "Payroll Trend" })}
                    labels={[]}
                    series={[{ name: t("reports.payroll.netPayroll", { defaultValue: "Net Payroll" }), color: "#d18a12", values: [] }]}
                />

                <ReportTable
                    title={t("reports.payroll.tableTitle", { defaultValue: "Employee Payroll" })}
                    columns={columns}
                    rows={payrollData}
                    rowKey={(employee) => employee.employeeID}
                    emptyText={t("reports.payroll.empty", { defaultValue: "No payroll data available." })}
                    minWidth={860}
                />

            </ReportPage>
        </DashboardLayout>
    );
}

export default PayrollReport;
