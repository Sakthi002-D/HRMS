import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CalendarClock, CalendarX, Percent, Users } from "lucide-react";
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

// D365 rows are identified by the full D365 identity so they never merge with HRMS employee IDs
const getPersonKey = (item) => item.source === "D365"
    ? `D365|${item.personnel_number}|${item.employment_legal_entity_id}|${item.employment_id}`
    : `HRMS|${item.employee_id}`;

const statusOf = (item) => String(item.status).toLowerCase();
const isPresent = (item) => ["present", "late"].includes(statusOf(item));

const formatTime = (value) => {
    const match = /(\d{1,2}:\d{2})/.exec(String(value ?? ""));
    return match ? match[1] : "-";
};

const formatHours = (minutes) => {
    if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return "-";
    const total = Number(minutes);
    return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
};

const STATUS_TONE = { present: "green", late: "amber", absent: "rose" };

function AttendanceReport() {
    const { t } = useTranslation();
    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API_URL}/api/attendance`)
            .then((response) => {
                if (!response.ok) throw new Error("Unable to load attendance");
                return response.json();
            })
            .then((data) => setAttendanceData(Array.isArray(data) ? data : []))
            .catch(() => setAttendanceData([]))
            .finally(() => setLoading(false));
    }, []);

    const presentCount = attendanceData.filter(isPresent).length;
    const absentCount = attendanceData.filter((item) => statusOf(item) === "absent").length;
    const attendancePercentage = attendanceData.length ? Math.round((presentCount / attendanceData.length) * 100) : 0;
    const totalPeople = useMemo(() => new Set(attendanceData.map(getPersonKey)).size, [attendanceData]);

    const departmentStats = useMemo(() => {
        const stats = new Map();
        attendanceData.forEach((item) => {
            if (!item.department) return;
            const entry = stats.get(item.department) || { present: 0, late: 0, absent: 0, total: 0 };
            const status = statusOf(item);
            if (status === "present") entry.present += 1;
            else if (status === "late") entry.late += 1;
            else if (status === "absent") entry.absent += 1;
            entry.total += 1;
            stats.set(item.department, entry);
        });
        return [...stats.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);
    }, [attendanceData]);

    const statusLabel = (status) => t(`employeeAttendance.status.${status}`, { defaultValue: status.charAt(0).toUpperCase() + status.slice(1) });

    const columns = [
        {
            key: "employee_id",
            header: t("reports.common.employeeId", { defaultValue: "Employee ID" }),
            render: (item) => <span dir="ltr" className="rp-cell-id">{item.employee_id}</span>,
            nowrap: true,
        },
        {
            key: "employee_name",
            header: t("reports.common.employeeName", { defaultValue: "Employee Name" }),
            render: (item) => (
                <div className="rp-person">
                    <Avatar name={item.employee_name} />
                    <span className="rp-cell-main">
                        {item.employee_name}
                        {item.source === "D365" && <span className="rp-tag">D365</span>}
                    </span>
                </div>
            ),
        },
        { key: "department", header: t("reports.common.department", { defaultValue: "Department" }), render: (item) => item.department || "-" },
        {
            key: "punch_in",
            header: t("reports.attendance.punchIn", { defaultValue: "Punch In" }),
            render: (item) => <span dir="ltr" className="rp-cell-num">{formatTime(item.punch_in)}</span>,
            nowrap: true,
        },
        {
            key: "punch_out",
            header: t("reports.attendance.punchOut", { defaultValue: "Punch Out" }),
            render: (item) => <span dir="ltr" className="rp-cell-num">{formatTime(item.punch_out)}</span>,
            nowrap: true,
        },
        {
            key: "working_minutes",
            header: t("reports.attendance.hours", { defaultValue: "Hours" }),
            render: (item) => <span dir="ltr" className="rp-cell-muted">{formatHours(item.working_minutes)}</span>,
            nowrap: true,
        },
        {
            key: "status",
            header: t("reports.common.status", { defaultValue: "Status" }),
            render: (item) => {
                const status = statusOf(item);
                return <StatusPill tone={STATUS_TONE[status] || "slate"}>{statusLabel(status)}</StatusPill>;
            },
        },
    ];

    return (
        <DashboardLayout>
            <ReportPage tone="teal">

                <ReportHero
                    icon={CalendarClock}
                    title={t("reports.hub.cards.attendance.title", { defaultValue: "Attendance Report" })}
                    subtitle={t("reports.hub.cards.attendance.description", { defaultValue: "View employee attendance and working hours." })}
                />

                <StatGrid>
                    <StatCard
                        icon={Users}
                        tone="blue"
                        loading={loading}
                        label={t("reports.common.totalEmployees", { defaultValue: "Total Employees" })}
                        value={totalPeople}
                        hint={t("reports.attendance.activeEmployees", { defaultValue: "Active employees" })}
                    />
                    <StatCard
                        icon={Percent}
                        tone="teal"
                        loading={loading}
                        label={t("reports.attendance.averageAttendance", { defaultValue: "Average Attendance" })}
                        value={<span dir="ltr">{`${attendancePercentage}%`}</span>}
                        progress={attendancePercentage}
                        hint={t("reports.attendance.today", { defaultValue: "Today" })}
                    />
                    <StatCard
                        icon={CalendarCheck}
                        tone="green"
                        loading={loading}
                        label={t("reports.attendance.totalPresent", { defaultValue: "Total Present" })}
                        value={presentCount}
                        hint={t("reports.attendance.recordedAttendance", { defaultValue: "Recorded attendance" })}
                    />
                    <StatCard
                        icon={CalendarX}
                        tone="rose"
                        loading={loading}
                        label={t("reports.attendance.totalAbsent", { defaultValue: "Total Absent" })}
                        value={absentCount}
                        hint={t("reports.attendance.today", { defaultValue: "Today" })}
                    />
                </StatGrid>

                <ReportChart
                    title={t("reports.attendance.chartTitle", { defaultValue: "Attendance by Department" })}
                    subtitle={t("reports.attendance.chartSubtitle", { defaultValue: "Today's status across departments" })}
                    labels={departmentStats.map(([department]) => department)}
                    series={[
                        { name: statusLabel("present"), color: "#2f9e52", values: departmentStats.map(([, entry]) => entry.present) },
                        { name: statusLabel("late"), color: "#e3a21a", values: departmentStats.map(([, entry]) => entry.late) },
                        { name: statusLabel("absent"), color: "#e0476f", values: departmentStats.map(([, entry]) => entry.absent) },
                    ]}
                />

                <ReportTable
                    title={t("reports.attendance.tableTitle", { defaultValue: "Employee Attendance" })}
                    columns={columns}
                    rows={attendanceData}
                    rowKey={(item) => item.id ?? getPersonKey(item)}
                    loading={loading}
                    loadingText={t("reports.attendance.loading", { defaultValue: "Loading attendance data..." })}
                    emptyText={t("reports.attendance.empty", { defaultValue: "No attendance data available." })}
                    searchText={(item) => `${item.employee_id} ${item.employee_name} ${item.department} ${item.status}`}
                    minWidth={860}
                />

            </ReportPage>
        </DashboardLayout>
    );
}

export default AttendanceReport;
