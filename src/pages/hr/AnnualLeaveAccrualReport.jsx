import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useConfirm } from "../../components/common/dialog/dialogContext";
import "./LeaveReport.css";
import "./AnnualLeaveAccrualReport.css";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
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
                if (!response.ok) throw new Error("Unable to load the accrual report");
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
            title: `Export ${month} for Finance?`,
            message: (
                <>
                    <p>Rows with an amount will be marked as <strong>posted to Finance</strong> and frozen.</p>
                    <p>GL posting (SHELTER-HCM-AP-16-002) is not connected yet; this downloads the Excel file for Finance.</p>
                </>
            ),
            confirmText: "Export for Finance",
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
            if (!response.ok) throw new Error(exported.message || "Export failed");

            downloadExcel(exported, `annual-leave-accrual-${month}-${exported.postingReference}.xls`);
            setResult({ month, report: exported, error: "" });
            setMessage(`${exported.postedCount} row(s) marked as posted • Reference ${exported.postingReference}`);
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
                        <h1>Annual Leave Accrual</h1>
                        <p>Monthly annual leave days and leave liability amount per employee, for Finance.</p>
                    </div>
                    <Link className="report-back-button" to="/reports">Back to Reports</Link>
                </div>

                <div className="accrual-report-toolbar">
                    <label>
                        Month
                        <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                    </label>
                    <button type="button" className="accrual-link-button" onClick={() => setMonth("")} disabled={!month}>
                        All months
                    </button>
                    <div className="accrual-report-actions">
                        <button
                            type="button"
                            className="accrual-secondary-button"
                            onClick={() => downloadExcel(report, `annual-leave-accrual-${month || "all"}.xls`)}
                            disabled={!rows.length}
                        >
                            Export to Excel
                        </button>
                        <button
                            type="button"
                            className="accrual-primary-button"
                            onClick={exportForFinance}
                            disabled={!month || !rows.length || exporting}
                            title={month ? "" : "Select a month to export for Finance"}
                        >
                            {exporting ? "Exporting..." : "Export for Finance"}
                        </button>
                    </div>
                </div>

                {message && <p className="accrual-report-message">{message}</p>}

                <div className="leave-report-summary">
                    <div className="leave-report-card">
                        <h3>Employees</h3>
                        <h2>{loading ? "—" : totals?.employees ?? 0}</h2>
                        <p>{month || "All months"}</p>
                    </div>
                    <div className="leave-report-card">
                        <h3>Days Accrued</h3>
                        <h2>{loading ? "—" : totals?.days ?? 0}</h2>
                        <p>Annual leave days</p>
                    </div>
                    <div className="leave-report-card">
                        <h3>Amount Accrued</h3>
                        <h2>{loading ? "—" : formatAmount(totals?.amount ?? 0)}</h2>
                        <p>Leave liability</p>
                    </div>
                    <div className="leave-report-card">
                        <h3>Posted to Finance</h3>
                        <h2>{loading ? "—" : `${totals?.posted ?? 0} / ${rows.length}`}</h2>
                        <p>{totals?.missingSalary ? `${totals.missingSalary} without salary record` : "All rows have an amount"}</p>
                    </div>
                </div>

                <div className="leave-report-table-container">
                    <h2>Accrual Ledger</h2>
                    <table className="leave-report-table">
                        <thead>
                            <tr>
                                <th>Employee ID</th>
                                <th>Employee Name</th>
                                <th>Department</th>
                                <th>Grade</th>
                                <th>Month</th>
                                <th>Accrual Date</th>
                                <th className="accrual-number">Days</th>
                                <th>Basis</th>
                                <th className="accrual-number">Salary</th>
                                <th className="accrual-number">Amount</th>
                                <th>Finance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="11">Loading accrual ledger...</td></tr>
                            ) : error ? (
                                <tr><td colSpan="11">{error}</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan="11">No accruals for this month.</td></tr>
                            ) : rows.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.employee_id}</td>
                                    <td>{row.employee_name}</td>
                                    <td>{row.department || "-"}</td>
                                    <td>{row.grade || "-"}</td>
                                    <td>{row.accrual_month}</td>
                                    <td>{row.accrual_date}</td>
                                    <td className="accrual-number">{row.days_accrued}</td>
                                    <td className="accrual-basis">{row.salary_basis}</td>
                                    <td className="accrual-number">{formatAmount(row.salary_amount)}</td>
                                    <td className="accrual-number">{formatAmount(row.amount_accrued)}</td>
                                    <td>
                                        {row.posted_to_finance ? (
                                            <span className="accrual-status posted" title={row.posting_reference}>Posted</span>
                                        ) : row.amount_accrued === null ? (
                                            <span className="accrual-status missing">No salary</span>
                                        ) : (
                                            <span className="accrual-status open">Not posted</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {!loading && !error && rows.length > 0 && (
                            <tfoot>
                                <tr>
                                    <td colSpan="6">Total ({totals.employees} employees)</td>
                                    <td className="accrual-number">{totals.days}</td>
                                    <td />
                                    <td />
                                    <td className="accrual-number">{formatAmount(totals.amount)}</td>
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
