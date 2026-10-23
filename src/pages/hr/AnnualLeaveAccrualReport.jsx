import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import i18n from "i18next";
import { Trans, useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useConfirm } from "../../components/common/dialog/dialogContext";
import API_BASE_URL from "../../config/api";
import "./LeaveReport.css";
import "./AnnualLeaveAccrualReport.css";

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

    return (
        <DashboardLayout>
            <div className="leave-report-page">

                <div className="leave-report-header accrual-report-header">
                    <div>
                        <h1>{t("reports.hub.cards.accrual.title", { defaultValue: "Annual Leave Accrual" })}</h1>
                        <p>{t("reports.accrual.subtitle", { defaultValue: "Monthly annual leave days and leave liability amount per employee, for Finance." })}</p>
                    </div>
                    <Link className="report-back-button" to="/reports">{t("reports.common.backToReports", { defaultValue: "Back to Reports" })}</Link>
                </div>

                <div className="accrual-report-toolbar">
                    <label>
                        {t("reports.accrual.month", { defaultValue: "Month" })}
                        <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                    </label>
                    <button type="button" className="accrual-link-button" onClick={() => setMonth("")} disabled={!month}>
                        {t("reports.accrual.allMonths", { defaultValue: "All months" })}
                    </button>
                    <div className="accrual-report-actions">
                        <button
                            type="button"
                            className="accrual-secondary-button"
                            onClick={() => downloadExcel(report, `annual-leave-accrual-${month || "all"}.xls`)}
                            disabled={!rows.length}
                        >
                            {t("reports.accrual.exportExcel", { defaultValue: "Export to Excel" })}
                        </button>
                        <button
                            type="button"
                            className="accrual-primary-button"
                            onClick={exportForFinance}
                            disabled={!month || !rows.length || exporting}
                            title={month ? "" : t("reports.accrual.selectMonth", { defaultValue: "Select a month to export for Finance" })}
                        >
                            {exporting ? t("reports.accrual.exporting", { defaultValue: "Exporting..." }) : t("reports.accrual.exportFinance", { defaultValue: "Export for Finance" })}
                        </button>
                    </div>
                </div>

                {message && <p className="accrual-report-message">{message}</p>}

                <div className="leave-report-summary">
                    <div className="leave-report-card">
                        <h3>{t("reports.common.employees", { defaultValue: "Employees" })}</h3>
                        <h2>{loading ? "—" : totals?.employees ?? 0}</h2>
                        <p>{month ? <span dir="ltr" className="ltr-text">{month}</span> : t("reports.accrual.allMonths", { defaultValue: "All months" })}</p>
                    </div>
                    <div className="leave-report-card">
                        <h3>{t("reports.accrual.daysAccrued", { defaultValue: "Days Accrued" })}</h3>
                        <h2>{loading ? "—" : totals?.days ?? 0}</h2>
                        <p>{t("reports.accrual.annualLeaveDays", { defaultValue: "Annual leave days" })}</p>
                    </div>
                    <div className="leave-report-card">
                        <h3>{t("reports.accrual.amountAccrued", { defaultValue: "Amount Accrued" })}</h3>
                        <h2>{loading ? "—" : <span dir="ltr" className="ltr-text">{formatAmount(totals?.amount ?? 0)}</span>}</h2>
                        <p>{t("reports.accrual.leaveLiability", { defaultValue: "Leave liability" })}</p>
                    </div>
                    <div className="leave-report-card">
                        <h3>{t("reports.accrual.postedToFinance", { defaultValue: "Posted to Finance" })}</h3>
                        <h2>{loading ? "—" : <span dir="ltr" className="ltr-text">{`${totals?.posted ?? 0} / ${rows.length}`}</span>}</h2>
                        <p>{totals?.missingSalary ? t("reports.accrual.withoutSalary", { count: totals.missingSalary, defaultValue: "{{count}} without salary record" }) : t("reports.accrual.allRowsHaveAmount", { defaultValue: "All rows have an amount" })}</p>
                    </div>
                </div>

                <div className="leave-report-table-container">
                    <h2>{t("reports.accrual.tableTitle", { defaultValue: "Accrual Ledger" })}</h2>
                    <table className="leave-report-table">
                        <thead>
                            <tr>
                                <th>{t("reports.common.employeeId", { defaultValue: "Employee ID" })}</th>
                                <th>{t("reports.common.employeeName", { defaultValue: "Employee Name" })}</th>
                                <th>{t("reports.common.department", { defaultValue: "Department" })}</th>
                                <th>{t("reports.accrual.grade", { defaultValue: "Grade" })}</th>
                                <th>{t("reports.accrual.month", { defaultValue: "Month" })}</th>
                                <th>{t("reports.accrual.accrualDate", { defaultValue: "Accrual Date" })}</th>
                                <th className="accrual-number">{t("reports.leave.days", { defaultValue: "Days" })}</th>
                                <th>{t("reports.accrual.basis", { defaultValue: "Basis" })}</th>
                                <th className="accrual-number">{t("reports.accrual.salary", { defaultValue: "Salary" })}</th>
                                <th className="accrual-number">{t("reports.accrual.amount", { defaultValue: "Amount" })}</th>
                                <th>{t("reports.accrual.finance", { defaultValue: "Finance" })}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="11">{t("reports.accrual.loading", { defaultValue: "Loading accrual ledger..." })}</td></tr>
                            ) : error ? (
                                <tr><td colSpan="11">{error}</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan="11">{t("reports.accrual.empty", { defaultValue: "No accruals for this month." })}</td></tr>
                            ) : rows.map((row) => (
                                <tr key={row.id}>
                                    <td><span dir="ltr" className="ltr-text">{row.employee_id}</span></td>
                                    <td>{row.employee_name}</td>
                                    <td>{row.department || "-"}</td>
                                    <td>{row.grade || "-"}</td>
                                    <td><span dir="ltr" className="ltr-text">{row.accrual_month}</span></td>
                                    <td><span dir="ltr" className="ltr-text">{row.accrual_date}</span></td>
                                    <td className="accrual-number"><span dir="ltr" className="ltr-text">{row.days_accrued}</span></td>
                                    <td className="accrual-basis">{t(`reports.accrual.basisValues.${row.salary_basis}`, { defaultValue: String(row.salary_basis) })}</td>
                                    <td className="accrual-number"><span dir="ltr" className="ltr-text">{formatAmount(row.salary_amount)}</span></td>
                                    <td className="accrual-number"><span dir="ltr" className="ltr-text">{formatAmount(row.amount_accrued)}</span></td>
                                    <td>
                                        {row.posted_to_finance ? (
                                            <span className="accrual-status posted" title={row.posting_reference}>{t("reports.accrual.status.posted", { defaultValue: "Posted" })}</span>
                                        ) : row.amount_accrued === null ? (
                                            <span className="accrual-status missing">{t("reports.accrual.status.noSalary", { defaultValue: "No salary" })}</span>
                                        ) : (
                                            <span className="accrual-status open">{t("reports.accrual.status.notPosted", { defaultValue: "Not posted" })}</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {!loading && !error && rows.length > 0 && (
                            <tfoot>
                                <tr>
                                    <td colSpan="6">{t("reports.accrual.total", { count: totals.employees, defaultValue: "Total ({{count}} employees)" })}</td>
                                    <td className="accrual-number"><span dir="ltr" className="ltr-text">{totals.days}</span></td>
                                    <td />
                                    <td />
                                    <td className="accrual-number"><span dir="ltr" className="ltr-text">{formatAmount(totals.amount)}</span></td>
                                    <td />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

            </div>
        </DashboardLayout>
    );
}

export default AnnualLeaveAccrualReport;
