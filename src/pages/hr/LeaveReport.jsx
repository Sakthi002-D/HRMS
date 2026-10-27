import { useEffect, useMemo, useState } from "react";
import { CalendarRange, CircleCheck, CircleX, FileText, Hourglass } from "lucide-react";
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

const STATUS_TONE = { approved: "green", pending: "amber", rejected: "rose", cancelled: "slate" };

function LeaveReport() {
    const { t } = useTranslation();

    const [leaveData, setLeaveData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API_URL}/api/leaves`)
            .then((response) => {
                if (!response.ok) throw new Error("Unable to load leaves");
                return response.json();
            })
            .then((data) => setLeaveData(Array.isArray(data) ? data : []))
            .catch(() => setLeaveData([]))
            .finally(() => setLoading(false));
    }, []);

    const leaveTypes = useMemo(() => [...new Set(leaveData.map((leave) => leave.leave_type).filter(Boolean))].slice(0, 8), [leaveData]);
    const statusOf = (leave) => String(leave.status).toLowerCase();
    const statusLabel = (status) => t(`leaveDetails.status.${status}`, { defaultValue: status.charAt(0).toUpperCase() + status.slice(1) });
    const typeLabel = (type) => t(`leaveTypes.${type}`, { defaultValue: type });
    const statusCount = (status) => leaveData.filter((leave) => statusOf(leave) === status).length;
    const typeCount = (type, status) => leaveData.filter((leave) => leave.leave_type === type && statusOf(leave) === status).length;

    const columns = [
        {
            key: "employee_id",
            header: t("reports.common.employeeId", { defaultValue: "Employee ID" }),
            render: (leave) => <span dir="ltr" className="rp-cell-id">{leave.employee_id}</span>,
            nowrap: true,
        },
        {
            key: "employee_name",
            header: t("reports.common.employeeName", { defaultValue: "Employee Name" }),
            render: (leave) => (
                <div className="rp-person">
                    <Avatar name={leave.employee_name} />
                    <span className="rp-cell-main">{leave.employee_name}</span>
                </div>
            ),
        },
        {
            key: "leave_type",
            header: t("reports.leave.type", { defaultValue: "Leave Type" }),
            render: (leave) => typeLabel(leave.leave_type),
        },
        {
            key: "period",
            header: t("reports.leave.period", { defaultValue: "Period" }),
            render: (leave) => (
                <span dir="ltr" className="rp-cell-muted">
                    {leave.from_day || "-"}{leave.to_day && leave.to_day !== leave.from_day ? ` → ${leave.to_day}` : ""}
                </span>
            ),
            nowrap: true,
        },
        {
            key: "days",
            header: t("reports.leave.days", { defaultValue: "Days" }),
            align: "center",
            render: (leave) => <span className="rp-cell-num">{leave.days}</span>,
        },
        {
            key: "reason",
            header: t("reports.leave.reason", { defaultValue: "Reason" }),
            render: (leave) => <span className="rp-cell-muted">{leave.reason || "-"}</span>,
        },
        {
            key: "status",
            header: t("reports.common.status", { defaultValue: "Status" }),
            render: (leave) => <StatusPill tone={STATUS_TONE[statusOf(leave)] || "slate"}>{statusLabel(statusOf(leave))}</StatusPill>,
        },
    ];

    return (
        <DashboardLayout>
            <ReportPage tone="violet">

                <ReportHero
                    icon={CalendarRange}
                    title={t("reports.hub.cards.leave.title", { defaultValue: "Leave Report" })}
                    subtitle={t("reports.hub.cards.leave.description", { defaultValue: "View leave requests, approvals and leave usage." })}
                />

                <StatGrid>
                    <StatCard
                        icon={FileText}
                        tone="violet"
                        loading={loading}
                        label={t("reports.leave.totalRequests", { defaultValue: "Total Leave Requests" })}
                        value={leaveData.length}
                        hint={t("reports.leave.allRequests", { defaultValue: "All requests" })}
                    />
                    <StatCard
                        icon={CircleCheck}
                        tone="green"
                        loading={loading}
                        label={t("leaveDetails.status.approved", { defaultValue: "Approved" })}
                        value={statusCount("approved")}
                        progress={leaveData.length ? (statusCount("approved") / leaveData.length) * 100 : 0}
                        hint={t("reports.leave.approvedRequests", { defaultValue: "Approved requests" })}
                    />
                    <StatCard
                        icon={Hourglass}
                        tone="amber"
                        loading={loading}
                        label={t("leaveDetails.status.pending", { defaultValue: "Pending" })}
                        value={statusCount("pending")}
                        hint={t("reports.leave.waitingApproval", { defaultValue: "Waiting for approval" })}
                    />
                    <StatCard
                        icon={CircleX}
                        tone="rose"
                        loading={loading}
                        label={t("leaveDetails.status.rejected", { defaultValue: "Rejected" })}
                        value={statusCount("rejected")}
                        hint={t("reports.leave.rejectedRequests", { defaultValue: "Rejected requests" })}
                    />
                </StatGrid>

                <ReportChart
                    title={t("reports.leave.chartTitle", { defaultValue: "Leave Usage" })}
                    subtitle={t("reports.leave.chartSubtitle", { defaultValue: "Requests by leave type and status" })}
                    labels={leaveTypes.map(typeLabel)}
                    series={[
                        { name: statusLabel("approved"), color: "#2f9e52", values: leaveTypes.map((type) => typeCount(type, "approved")) },
                        { name: statusLabel("pending"), color: "#e3a21a", values: leaveTypes.map((type) => typeCount(type, "pending")) },
                        { name: statusLabel("rejected"), color: "#e0476f", values: leaveTypes.map((type) => typeCount(type, "rejected")) },
                    ]}
                />

                <ReportTable
                    title={t("reports.leave.tableTitle", { defaultValue: "Leave Requests" })}
                    columns={columns}
                    rows={leaveData}
                    rowKey={(leave) => leave.id}
                    loading={loading}
                    loadingText={t("reports.leave.loading", { defaultValue: "Loading leave data..." })}
                    emptyText={t("reports.leave.empty", { defaultValue: "No leave data available." })}
                    searchText={(leave) => `${leave.employee_id} ${leave.employee_name} ${leave.leave_type} ${leave.reason ?? ""} ${leave.status}`}
                    minWidth={900}
                />

            </ReportPage>
        </DashboardLayout>
    );
}

export default LeaveReport;
