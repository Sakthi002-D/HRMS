import { useEffect, useState } from "react";
import { Banknote, CalendarDays, CircleCheck, PiggyBank, Users } from "lucide-react";
import i18n from "i18next";
import { Trans, useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
    Avatar,
    ReportAlert,
    ReportHero,
    ReportPage,
    ReportPanel,
    ReportTable,
    StatCard,
    StatGrid,
    StatusPill,
} from "../../components/reports/ReportKit";
import { useConfirm } from "../../components/common/dialog/dialogContext";
import API_BASE_URL from "../../config/api";

const REPORT_URL = `${API_BASE_URL}/api/reports/annual-leave-accrual`;
const COMPANY_TIMEZONE = "Asia/Qatar";

// Current month (YYYY-MM) in the company timezone
const currentCompanyMonth = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: COMPANY_TIMEZONE, year: "numeric", month: "2-digit" }).format(new Date());

const formatAmount = (value) =>
    value === null || value === undefined
        ? "—"
        : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);

const EXPORT_HEADERS = [
    "Employee ID", "Employee Name", "Department", "Grade", "Accrual Month", "Accrual Date",
    "Days Accrued", "Salary Basis", "Salary", "Amount Accrued", "Posted to Finance", "Posting Reference",
];

// Excel download (HTML table .xls, same approach as the Leave Management export)
const downloadExcel = (report, fileName) => {
    const rows = report.rows.map((row) => [
        row.employee_id, row.employee_name, row.department, row.grade || "", row.accrual_month, row.accrual_date,
        row.days_accrued, row.salary_basis, row.salary_amount ?? "", row.amount_accrued ?? "",
        row.posted_to_finance ? "Yes" : "No", row.posting_reference || "",
    ]);
    const totalsRow = ["TOTAL", `${report.totals.employees} employees`, "", "", report.month || "All", "", report.totals.days, "", "", report.totals.amount, "", ""];
    const html = `<table><thead><tr>${EXPORT_HEADERS.map((header) => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${[...rows, totalsRow]
        .map((row) => `<tr>${row.map((value) => `<td>${escapeHTML(value)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
};

function AnnualLeaveAccrualReport() {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const [month, setMonth] = useState(currentCompanyMonth);
    // Result of the last load, tagged with the month it belongs to
    const [result, setResult] = useState({ month: undefined, report: null, error: "" });
    const [exporting, setExporting] = useState(false);
    const [message, setMessage] = useState("");

    const loading = result.month !== month;
    const report = loading ? null : result.report;
    const error = loading ? "" : result.error;

    useEffect(() => {
        let ignore = false;
        const query = month ? `?month=${month}` : "";

        fetch(`${REPORT_URL}${query}`, { cache: "no-store" })
            .then((response) => {
                if (!response.ok) throw new Error(i18n.t("reports.accrual.loadFailed", { defaultValue: "Unable to load the accrual report" }));
                return response.json();
            })
            .then((data) => {
                if (!ignore) setResult({ month, report: data, error: "" });
            })
            .catch((err) => {
                if (!ignore) setResult({ month, report: null, error: err.message });
            });

        return () => {
            ignore = true;
        };
    }, [month]);

    const exportForFinance = async () => {
        if (!month) return;
        const confirmed = await confirm({
            variant: "warning",
            title: t("reports.accrual.confirmTitle", { month: `\u2066${month}\u2069`, defaultValue: "Export {{month}} for Finance?" }),
            message: (
                <>
                    <p><Trans i18nKey="reports.accrual.confirmPosted" components={{ strong: <strong /> }} defaults="Rows with an amount will be marked as <strong>posted to Finance</strong> and frozen." /></p>
                    <p>{t("reports.accrual.confirmGl", { code: "\u2066SHELTER-HCM-AP-16-002\u2069", defaultValue: "GL posting ({{code}}) is not connected yet; this downloads the Excel file for Finance." })}</p>
                </>
            ),
            confirmText: t("reports.accrual.exportFinance", { defaultValue: "Export for Finance" }),
            cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
        });
        if (!confirmed) return;

        try {
            setExporting(true);
            setMessage("");
            const response = await fetch(`${REPORT_URL}/export-finance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month }),
            });
            const exported = await response.json();
            if (!response.ok) throw new Error(exported.message || t("reports.accrual.exportFailed", { defaultValue: "Export failed" }));

            downloadExcel(exported, `annual-leave-accrual-${month}-${exported.postingReference}.xls`);
            setResult({ month, report: exported, error: "" });
            setMessage(t("reports.accrual.postedMessage", { count: exported.postedCount, reference: `\u2066${exported.postingReference}\u2069`, defaultValue: "{{count}} row(s) marked as posted • Reference {{reference}}" }));
        } catch (err) {
            setMessage(err.message);
        } finally {
            setExporting(false);
        }
    };

    const totals = report?.totals;
    const rows = report?.rows || [];
    const monthLabel = month || t("reports.accrual.allMonths", { defaultValue: "All months" });

    const columns = [
        {
            key: "employee_id",
            header: t("reports.common.employeeId", { defaultValue: "Employee ID" }),
            render: (row) => <span dir="ltr" className="rp-cell-id">{row.employee_id}</span>,
            nowrap: true,
        },
        {
            key: "employee_name",
            header: t("reports.common.employeeName", { defaultValue: "Employee Name" }),
            render: (row) => (
                <div className="rp-person">
                    <Avatar name={row.employee_name} />
                    <span className="rp-cell-main">{row.employee_name}</span>
                </div>
            ),
        },
        { key: "department", header: t("reports.common.department", { defaultValue: "Department" }), render: (row) => row.department || "-" },
        { key: "grade", header: t("reports.accrual.grade", { defaultValue: "Grade" }), render: (row) => row.grade || "-" },
        {
            key: "accrual_month",
            header: t("reports.accrual.month", { defaultValue: "Month" }),
            render: (row) => <span dir="ltr" className="rp-cell-muted">{row.accrual_month}</span>,
            nowrap: true,
        },
        {
            key: "accrual_date",
            header: t("reports.accrual.accrualDate", { defaultValue: "Accrual Date" }),
            render: (row) => <span dir="ltr" className="rp-cell-muted">{row.accrual_date}</span>,
            nowrap: true,
        },
        {
            key: "days_accrued",
            header: t("reports.leave.days", { defaultValue: "Days" }),
            align: "end",
            render: (row) => <span dir="ltr" className="rp-cell-num">{row.days_accrued}</span>,
            nowrap: true,
        },
        {
            key: "salary_basis",
            header: t("reports.accrual.basis", { defaultValue: "Basis" }),
            render: (row) => <span className="rp-cell-muted">{t(`reports.accrual.basisValues.${row.salary_basis}`, { defaultValue: String(row.salary_basis) })}</span>,
        },
        {
            key: "salary_amount",
            header: t("reports.accrual.salary", { defaultValue: "Salary" }),
            align: "end",
            render: (row) => <span dir="ltr" className="rp-cell-muted">{formatAmount(row.salary_amount)}</span>,
            nowrap: true,
        },
        {
            key: "amount_accrued",
            header: t("reports.accrual.amount", { defaultValue: "Amount" }),
            align: "end",
            render: (row) => <span dir="ltr" className="rp-cell-num">{formatAmount(row.amount_accrued)}</span>,
            nowrap: true,
        },
        {
            key: "finance",
            header: t("reports.accrual.finance", { defaultValue: "Finance" }),
            render: (row) => {
                if (row.posted_to_finance) {
                    return <StatusPill tone="green" title={row.posting_reference}>{t("reports.accrual.status.posted", { defaultValue: "Posted" })}</StatusPill>;
                }
                if (row.amount_accrued === null) {
                    return <StatusPill tone="amber">{t("reports.accrual.status.noSalary", { defaultValue: "No salary" })}</StatusPill>;
                }
                return <StatusPill tone="slate">{t("reports.accrual.status.notPosted", { defaultValue: "Not posted" })}</StatusPill>;
            },
        },
    ];

    const footer = !loading && !error && rows.length > 0 && totals ? (
        <tr>
            <td colSpan="6">
                <span>{t("reports.accrual.total", { count: totals.employees, defaultValue: "Total ({{count}} employees)" })}</span>
            </td>
            <td className="is-end"><span dir="ltr">{totals.days}</span></td>
            <td />
            <td />
            <td className="is-end"><span dir="ltr">{formatAmount(totals.amount)}</span></td>
            <td />
        </tr>
    ) : null;

    return (
        <DashboardLayout>
            <ReportPage tone="green">

                <ReportHero
                    icon={PiggyBank}
                    title={t("reports.hub.cards.accrual.title", { defaultValue: "Annual Leave Accrual" })}
                    subtitle={t("reports.accrual.subtitle", { defaultValue: "Monthly annual leave days and leave liability amount per employee, for Finance." })}
                />

                <ReportPanel>
                    <div className="rp-toolbar">
                        <label className="rp-field">
                            <span>{t("reports.accrual.month", { defaultValue: "Month" })}</span>
                            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                        </label>
                        <button type="button" className="rp-btn rp-btn-text" onClick={() => setMonth("")} disabled={!month}>
                            {t("reports.accrual.allMonths", { defaultValue: "All months" })}
                        </button>
                        <span className="rp-toolbar-spacer" />
                        <div className="rp-toolbar-actions">
                            <button
                                type="button"
                                className="rp-btn rp-btn-light"
                                onClick={() => downloadExcel(report, `annual-leave-accrual-${month || "all"}.xls`)}
                                disabled={!rows.length}
                            >
                                {t("reports.accrual.exportExcel", { defaultValue: "Export to Excel" })}
                            </button>
                            <button
                                type="button"
                                className="rp-btn rp-btn-primary"
                                onClick={exportForFinance}
                                disabled={!month || !rows.length || exporting}
                                title={month ? "" : t("reports.accrual.selectMonth", { defaultValue: "Select a month to export for Finance" })}
                            >
                                {exporting ? t("reports.accrual.exporting", { defaultValue: "Exporting..." }) : t("reports.accrual.exportFinance", { defaultValue: "Export for Finance" })}
                            </button>
                        </div>
                    </div>
                </ReportPanel>

                {message && <ReportAlert tone="success">{message}</ReportAlert>}

                <StatGrid>
                    <StatCard
                        icon={Users}
                        tone="blue"
                        loading={loading}
                        label={t("reports.common.employees", { defaultValue: "Employees" })}
                        value={totals?.employees ?? 0}
                        hint={month ? <span dir="ltr">{month}</span> : monthLabel}
                    />
                    <StatCard
                        icon={CalendarDays}
                        tone="violet"
                        loading={loading}
                        label={t("reports.accrual.daysAccrued", { defaultValue: "Days Accrued" })}
                        value={totals?.days ?? 0}
                        hint={t("reports.accrual.annualLeaveDays", { defaultValue: "Annual leave days" })}
                    />
                    <StatCard
                        icon={Banknote}
                        tone="green"
                        loading={loading}
                        label={t("reports.accrual.amountAccrued", { defaultValue: "Amount Accrued" })}
                        value={<span dir="ltr">{formatAmount(totals?.amount ?? 0)}</span>}
                        hint={t("reports.accrual.leaveLiability", { defaultValue: "Leave liability" })}
                    />
                    <StatCard
                        icon={CircleCheck}
                        tone="teal"
                        loading={loading}
                        label={t("reports.accrual.postedToFinance", { defaultValue: "Posted to Finance" })}
                        value={<span dir="ltr">{`${totals?.posted ?? 0} / ${rows.length}`}</span>}
                        progress={rows.length ? ((totals?.posted ?? 0) / rows.length) * 100 : 0}
                        hint={totals?.missingSalary
                            ? t("reports.accrual.withoutSalary", { count: totals.missingSalary, defaultValue: "{{count}} without salary record" })
                            : t("reports.accrual.allRowsHaveAmount", { defaultValue: "All rows have an amount" })}
                    />
                </StatGrid>

                <ReportTable
                    title={t("reports.accrual.tableTitle", { defaultValue: "Accrual Ledger" })}
                    columns={columns}
                    rows={rows}
                    rowKey={(row) => row.id}
                    loading={loading}
                    error={error}
                    loadingText={t("reports.accrual.loading", { defaultValue: "Loading accrual ledger..." })}
                    emptyText={t("reports.accrual.empty", { defaultValue: "No accruals for this month." })}
                    searchText={(row) => `${row.employee_id} ${row.employee_name} ${row.department ?? ""} ${row.grade ?? ""}`}
                    footer={footer}
                    minWidth={1080}
                />

            </ReportPage>
        </DashboardLayout>
    );
}

export default AnnualLeaveAccrualReport;
