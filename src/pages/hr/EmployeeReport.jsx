import { useEffect, useMemo, useState } from "react";
import { Building2, UserCheck, UserX, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
    Avatar,
    ReportChart,
    ReportHero,
    ReportPage,
    ReportTable,
    StatCard,
    StatGrid,
    StatusPill,
} from "../../components/reports/ReportKit";
import API_URL from "../../config/api";
import { formatAppDate } from "../../utils/appSettings";

const formatDate = (value) => formatAppDate(String(value ?? "").slice(0, 10), { empty: "-" });

function EmployeeReport() {
    const { t } = useTranslation();

    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API_URL}/api/employees`)
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

    const activeCount = employees.filter((employee) => employee.status === "Active").length;
    const inactiveCount = employees.length - activeCount;

    const departmentCount = useMemo(() => new Set(employees.map((employee) => employee.department)).size, [employees]);

    const departmentStats = useMemo(() => {
        const stats = new Map();
        employees.forEach((employee) => {
            const entry = stats.get(employee.department) || { active: 0, inactive: 0 };
            if (employee.status === "Active") entry.active += 1;
            else entry.inactive += 1;
            stats.set(employee.department, entry);
        });
        return [...stats.entries()]
            .sort((a, b) => (b[1].active + b[1].inactive) - (a[1].active + a[1].inactive))
            .slice(0, 8);
    }, [employees]);

    const columns = [
        {
            key: "id",
            header: t("reports.common.employeeId", { defaultValue: "Employee ID" }),
            render: (employee) => <span dir="ltr" className="rp-cell-id">{employee.id}</span>,
            nowrap: true,
        },
        {
            key: "name",
            header: t("reports.common.employeeName", { defaultValue: "Employee Name" }),
            render: (employee) => (
                <div className="rp-person">
                    <Avatar name={employee.name} />
                    <span className="rp-cell-main">{employee.name}</span>
                </div>
            ),
        },
        { key: "department", header: t("reports.common.department", { defaultValue: "Department" }) },
        { key: "designation", header: t("reports.common.designation", { defaultValue: "Designation" }) },
        {
            key: "joiningDate",
            header: t("reports.common.joiningDate", { defaultValue: "Joining Date" }),
            render: (employee) => <span dir="ltr" className="rp-cell-muted">{formatDate(employee.joiningDate)}</span>,
            nowrap: true,
        },
        {
            key: "status",
            header: t("reports.common.status", { defaultValue: "Status" }),
            render: (employee) => (
                <StatusPill tone={employee.status === "Active" ? "green" : "rose"}>
                    {t(`employeeProfile.values.status.${employee.status.toLowerCase()}`, { defaultValue: employee.status })}
                </StatusPill>
            ),
        },
    ];

    return (
        <DashboardLayout>
            <ReportPage tone="blue">

                <ReportHero
                    icon={Users}
                    title={t("reports.hub.cards.employee.title", { defaultValue: "Employee Report" })}
                    subtitle={t("reports.hub.cards.employee.description", { defaultValue: "View employee details and department information." })}
                />

                <StatGrid>
                    <StatCard
                        icon={Users}
                        tone="blue"
                        loading={loading}
                        label={t("reports.common.totalEmployees", { defaultValue: "Total Employees" })}
                        value={employees.length}
                        hint={t("reports.employee.allEmployees", { defaultValue: "All employees" })}
                    />
                    <StatCard
                        icon={UserCheck}
                        tone="green"
                        loading={loading}
                        label={t("reports.employee.activeEmployees", { defaultValue: "Active Employees" })}
                        value={activeCount}
                        progress={employees.length ? (activeCount / employees.length) * 100 : 0}
                        hint={t("reports.employee.currentlyWorking", { defaultValue: "Currently working" })}
                    />
                    <StatCard
                        icon={Building2}
                        tone="violet"
                        loading={loading}
                        label={t("reports.employee.departments", { defaultValue: "Departments" })}
                        value={departmentCount}
                        hint={t("reports.employee.activeDepartments", { defaultValue: "Active departments" })}
                    />
                    <StatCard
                        icon={UserX}
                        tone="rose"
                        loading={loading}
                        label={t("reports.employee.inactive", { defaultValue: "Inactive" })}
                        value={inactiveCount}
                        hint={t("reports.employee.inactiveEmployees", { defaultValue: "Inactive employees" })}
                    />
                </StatGrid>

                <ReportChart
                    title={t("reports.employee.chartTitle", { defaultValue: "Employees by Department" })}
                    subtitle={t("reports.employee.chartSubtitle", { defaultValue: "Top departments by headcount" })}
                    labels={departmentStats.map(([department]) => department)}
                    series={[
                        { name: t("reports.employee.activeEmployees", { defaultValue: "Active Employees" }), color: "#2f9e52", values: departmentStats.map(([, entry]) => entry.active) },
                        { name: t("reports.employee.inactiveSeries", { defaultValue: "Inactive Employees" }), color: "#e0476f", values: departmentStats.map(([, entry]) => entry.inactive) },
                    ]}
                />

                <ReportTable
                    title={t("reports.employee.tableTitle", { defaultValue: "Employee Details" })}
                    columns={columns}
                    rows={employees}
                    rowKey={(employee) => employee.id}
                    loading={loading}
                    loadingText={t("reports.employee.loading", { defaultValue: "Loading employee data..." })}
                    emptyText={t("reports.employee.empty", { defaultValue: "No employee data available." })}
                />

            </ReportPage>
        </DashboardLayout>
    );
}

export default EmployeeReport;
