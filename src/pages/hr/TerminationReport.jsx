// Reports → Termination Report: employees who left (Resigned, Terminated, Dismissed, Retired,
// Inactive) with last working day, reason, service and the approved final settlement.
import { useEffect, useMemo, useState } from "react";
import { Download, LogOut, UserMinus, Users, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Avatar, ReportHero, ReportPage, ReportTable, StatCard, StatGrid, StatusPill } from "../../components/reports/ReportKit";
import { api, formatDate, formatQar } from "../../components/resignation/resignationApi";
import { exportTable } from "../../utils/tableExport";
import "../../components/recruitment/recruitment.css";
import "../../components/resignation/resignation.css";

const yearsBetween = (from, to) => {
    if (!from || !to) return null;
    const days = (Date.parse(`${String(to).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(from).slice(0, 10)}T00:00:00Z`)) / 86400000 + 1;
    return days > 0 ? days / 365 : null;
};

const STATUS_TONE = { Resigned: "amber", Terminated: "rose", Dismissed: "rose", Retired: "blue", Inactive: "slate" };

function TerminationReport() {
    const { t } = useTranslation();
    const [filters, setFilters] = useState({ from: "", to: "" });
    const [loaded, setLoaded] = useState({ key: null, rows: [], error: "" });
    const key = `${filters.from}|${filters.to}`;

    useEffect(() => {
        let ignore = false;
        const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
        api(`/api/hr/resignations/termination-report${query ? `?${query}` : ""}`)
            .then((rows) => !ignore && setLoaded({ key, rows, error: "" }))
            .catch((err) => !ignore && setLoaded({ key, rows: [], error: err.message }));
        return () => { ignore = true; };
    }, [filters, key]);

    const loading = loaded.key !== key;
    const rows = useMemo(() => loaded.rows.map((row) => ({ ...row, service: yearsBetween(row.joining_date, row.last_working_day) })), [loaded.rows]);
    const resigned = rows.filter((row) => row.status === "Resigned").length;
    const totalSettled = rows.reduce((sum, row) => sum + (row.settlement_status === "Approved" ? Number(row.settlement_net || 0) : 0), 0);

    const columns = [
        { key: "employee_id", header: t("reports.common.employeeId", { defaultValue: "Employee ID" }), render: (row) => <span dir="ltr" className="rp-cell-id">{row.employee_id}</span>, nowrap: true },
        {
            key: "name",
            header: t("reports.common.employeeName", { defaultValue: "Employee Name" }),
            render: (row) => <div className="rp-person"><Avatar name={row.name} /><span className="rp-cell-main">{row.name}</span></div>,
        },
        { key: "department", header: t("reports.common.department", { defaultValue: "Department" }) },
        { key: "designation", header: t("reports.common.designation", { defaultValue: "Designation" }) },
        { key: "joining_date", header: t("reports.common.joiningDate", { defaultValue: "Joining Date" }), render: (row) => <span dir="ltr" className="rp-cell-muted">{formatDate(row.joining_date)}</span>, nowrap: true },
        { key: "last_working_day", header: t("reports.termination.lastDay", { defaultValue: "Last Working Day" }), render: (row) => <span dir="ltr">{formatDate(row.last_working_day)}</span>, nowrap: true },
        { key: "service", header: t("reports.termination.service", { defaultValue: "Service" }), render: (row) => (row.service ? `${row.service.toFixed(1)} y` : "—"), nowrap: true },
        { key: "status", header: t("reports.common.status", { defaultValue: "Status" }), render: (row) => <StatusPill tone={STATUS_TONE[row.status] || "slate"}>{row.status}</StatusPill> },
        { key: "reason", header: t("reports.termination.reason", { defaultValue: "Reason" }), render: (row) => row.exit_main_reason || row.reason_category || row.termination_reason || "—" },
        { key: "rehire", header: t("reports.termination.rehire", { defaultValue: "Rehire" }), render: (row) => (row.eligible_for_rehire === null || row.eligible_for_rehire === undefined ? "—" : row.eligible_for_rehire ? t("resignation.detail.yes", { defaultValue: "Yes" }) : t("resignation.detail.no", { defaultValue: "No" })) },
        { key: "settlement", header: t("reports.termination.settlement", { defaultValue: "Final Settlement" }), render: (row) => (row.settlement_net !== null && row.settlement_net !== undefined ? <span dir="ltr">{formatQar(row.settlement_net)}</span> : "—"), nowrap: true },
    ];

    const exportRows = (format) => exportTable(format, {
        fileName: "termination-report",
        title: "Termination Report",
        headers: ["Employee ID", "Name", "Department", "Designation", "Joining Date", "Last Working Day", "Service (years)", "Status", "Reason", "Rehire", "Final Settlement (QAR)"],
        rows: rows.map((row) => [
            row.employee_id, row.name, row.department, row.designation, formatDate(row.joining_date), formatDate(row.last_working_day),
            row.service ? row.service.toFixed(1) : "", row.status, row.exit_main_reason || row.reason_category || row.termination_reason || "",
            row.eligible_for_rehire === null || row.eligible_for_rehire === undefined ? "" : row.eligible_for_rehire ? "Yes" : "No",
            row.settlement_net ?? "",
        ]),
    });

    return (
        <DashboardLayout>
            <ReportPage tone="rose">
                <ReportHero
                    icon={LogOut}
                    title={t("reports.hub.cards.termination.title", { defaultValue: "Termination Report" })}
                    subtitle={t("reports.hub.cards.termination.description", { defaultValue: "Employees who left, with last working day, reason and final settlement." })}
                    actions={(
                        <div className="termination-actions">
                            <button type="button" className="hiring-btn ghost" onClick={() => exportRows("excel")} disabled={!rows.length}><Download size={15} aria-hidden="true" /> Excel</button>
                            <button type="button" className="hiring-btn ghost" onClick={() => exportRows("pdf")} disabled={!rows.length}><Download size={15} aria-hidden="true" /> PDF</button>
                        </div>
                    )}
                />

                <div className="termination-filters">
                    <label>
                        <span>{t("reports.termination.from", { defaultValue: "Last day from" })}</span>
                        <input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
                    </label>
                    <label>
                        <span>{t("reports.termination.to", { defaultValue: "Last day to" })}</span>
                        <input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
                    </label>
                    {(filters.from || filters.to) && (
                        <button type="button" className="resignation-link-button" onClick={() => setFilters({ from: "", to: "" })}>{t("employeesList.filters.clear", { defaultValue: "Clear filters" })}</button>
                    )}
                </div>

                <StatGrid>
                    <StatCard icon={Users} tone="blue" loading={loading} label={t("reports.termination.leavers", { defaultValue: "Leavers" })} value={rows.length} hint={t("reports.termination.inPeriod", { defaultValue: "In the selected period" })} />
                    <StatCard icon={UserMinus} tone="amber" loading={loading} label={t("reports.termination.resigned", { defaultValue: "Resigned" })} value={resigned} hint={t("reports.termination.resignedHint", { defaultValue: "Through the resignation process" })} />
                    <StatCard icon={Wallet} tone="green" loading={loading} label={t("reports.termination.settled", { defaultValue: "Settlements approved" })} value={formatQar(totalSettled)} hint={t("reports.termination.settledHint", { defaultValue: "Net amount payable" })} />
                </StatGrid>

                <ReportTable
                    title={t("reports.termination.tableTitle", { defaultValue: "Leavers" })}
                    columns={columns}
                    rows={rows}
                    rowKey={(row) => row.employee_id}
                    loading={loading}
                    error={loaded.error}
                    minWidth={1100}
                    loadingText={t("reports.termination.loading", { defaultValue: "Loading leavers..." })}
                    emptyText={t("reports.termination.empty", { defaultValue: "No employees have left in this period." })}
                />
            </ReportPage>
        </DashboardLayout>
    );
}

export default TerminationReport;
