import { useEffect, useMemo, useState } from "react";
import {
    AlertCircle, Banknote, CheckCircle2, ChevronDown, Download, FileText, Loader2,
    Pencil, PlusCircle, Trash2, UserRound, Users, Wallet, X,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { jsPDF } from "jspdf";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useAlert, useConfirm } from "../../components/common/dialog/dialogContext";
import API_URL from "../../config/api";
import { formatAppDate, getAppSettings } from "../../utils/appSettings";
import "./Payroll.css";

const monthKey = (value) => String(value || "").slice(0, 7);
const monthLabel = (value) => {
    const key = monthKey(value);
    if (!/^\d{4}-\d{2}$/.test(key)) return key || "-";
    const [year, month] = key.split("-");
    return `${new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-GB", { month: "short" })} ${year}`;
};
const currentMonth = () => new Date().toISOString().slice(0, 7);

const emptyForm = { employeeID: "", salaryMonth: currentMonth(), basicSalary: "", allowances: "", deductions: "", status: "Pending" };
const toAmount = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? amount : 0;
};

function Payroll() {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const showAlert = useAlert();
    const settings = getAppSettings();
    const symbol = settings.currencySymbol || "QR";
    const formatCurrency = (value) => `${symbol} ${Number(value || 0).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

    const [records, setRecords] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [search, setSearch] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("all");
    const [selectedDesignation, setSelectedDesignation] = useState("All");
    const [sortBy, setSortBy] = useState("recent");
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [editing, setEditing] = useState(null); // null | record ({} = new)
    const [processing, setProcessing] = useState(false);
    const [statusBusyId, setStatusBusyId] = useState(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetch(`${API_URL}/api/payroll`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Failed to load payroll"))),
            fetch(`${API_URL}/api/employees`).then((response) => response.ok ? response.json() : []),
        ])
            .then(([payrollRows, employeeRows]) => {
                if (cancelled) return;
                setRecords(payrollRows);
                setEmployees(Array.isArray(employeeRows) ? employeeRows : []);
            })
            .catch((error) => { if (!cancelled) setLoadError(error.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const months = useMemo(
        () => [...new Set(records.map((record) => monthKey(record.salaryMonth)).filter(Boolean))].sort().reverse(),
        [records]
    );
    const designations = useMemo(
        () => [...new Set(records.map((record) => record.designation).filter(Boolean))].sort(),
        [records]
    );

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        const result = records.filter((record) => {
            const matchesSearch = !query || [record.employeeID, record.employeeName, record.email, record.department]
                .some((value) => String(value || "").toLowerCase().includes(query));
            const matchesMonth = selectedMonth === "all" || monthKey(record.salaryMonth) === selectedMonth;
            const matchesDesignation = selectedDesignation === "All" || record.designation === selectedDesignation;
            return matchesSearch && matchesMonth && matchesDesignation;
        });
        return result.sort((first, second) => {
            if (sortBy === "salary") return Number(second.netSalary) - Number(first.netSalary);
            if (sortBy === "name") return String(first.employeeName).localeCompare(second.employeeName);
            return String(first.employeeID).localeCompare(second.employeeID, undefined, { numeric: true });
        });
    }, [records, search, selectedMonth, selectedDesignation, sortBy]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
    const visible = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    const stats = useMemo(() => ({
        total: filtered.reduce((sum, record) => sum + Number(record.netSalary || 0), 0),
        processed: filtered.filter((record) => record.status === "Processed").length,
        pending: filtered.filter((record) => record.status !== "Processed").length,
        people: new Set(filtered.map((record) => record.employeeID)).size,
    }), [filtered]);

    const replaceRecord = (saved) => setRecords((current) => current.map((record) => (record.id === saved.id ? saved : record)));

    const toggleStatus = async (record) => {
        const status = record.status === "Processed" ? "Pending" : "Processed";
        setStatusBusyId(record.id);
        try {
            const response = await fetch(`${API_URL}/api/payroll/${record.id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || t("hrPayroll.errors.statusFailed", { defaultValue: "Unable to update status" }));
            replaceRecord(data);
        } catch (error) {
            showAlert({ variant: "danger", message: error.message, buttonText: t("employeesList.alerts.ok", { defaultValue: "OK" }) });
        } finally {
            setStatusBusyId(null);
        }
    };

    const processMonth = () => {
        const month = selectedMonth === "all" ? currentMonth() : selectedMonth;
        const pendingCount = records.filter((record) => monthKey(record.salaryMonth) === month && record.status !== "Processed").length;
        confirm({
            title: t("hrPayroll.process.title", { defaultValue: "Process this month's salaries?" }),
            message: <Trans i18nKey="hrPayroll.process.message" count={pendingCount} values={{ month: monthLabel(month), count: pendingCount }} components={{ strong: <strong /> }} defaults="<strong>{{count}}</strong> pending salary record(s) for <strong>{{month}}</strong> will be marked as Processed. Employees will see them as Transferred." />,
            confirmText: t("hrPayroll.process.confirm", { defaultValue: "Process" }),
            cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
            loadingText: t("hrPayroll.process.processing", { defaultValue: "Processing…" }),
            onConfirm: async () => {
                setProcessing(true);
                try {
                    const response = await fetch(`${API_URL}/api/payroll/process`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ salaryMonth: month }),
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(data.message || t("hrPayroll.errors.processFailed", { defaultValue: "Unable to process salaries" }));
                    setRecords((current) => current.map((record) => (
                        monthKey(record.salaryMonth) === month && record.status !== "Processed"
                            ? { ...record, status: "Processed" }
                            : record
                    )));
                } finally {
                    setProcessing(false);
                }
            },
        });
    };

    const deleteSalary = (record) => confirm({
        variant: "danger",
        title: t("hrPayroll.delete.title", { defaultValue: "Delete salary record?" }),
        message: <Trans i18nKey="hrPayroll.delete.message" values={{ name: record.employeeName }} components={{ strong: <strong /> }} defaults="The salary record for <strong>{{name}}</strong> will be permanently deleted." />,
        confirmText: t("hrPayroll.delete.confirm", { defaultValue: "Delete" }),
        cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
        loadingText: t("hrPayroll.delete.deleting", { defaultValue: "Deleting…" }),
        onConfirm: async () => {
            const response = await fetch(`${API_URL}/api/payroll/${record.id}`, { method: "DELETE" });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || t("hrPayroll.errors.deleteFailed", { defaultValue: "Unable to delete salary record" }));
            }
            setRecords((previous) => previous.filter((item) => item.id !== record.id));
        },
    });

    const exportPayroll = (format) => {
        const headers = ["Employee ID", "Name", "Department", "Designation", "Salary Month", "Basic", "Allowances", "Deductions", "Net Salary", "Status"];
        const rows = filtered.map((record) => [record.employeeID, record.employeeName, record.department, record.designation, monthLabel(record.salaryMonth), record.basicSalary, record.allowances, record.deductions, record.netSalary, record.status]);
        const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
        const content = format === "excel"
            ? `<table><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>${rows.map((row) => `<tr>${row.map((value) => `<td>${value ?? ""}</td>`).join("")}</tr>`).join("")}</table>`
            : csv;
        const blob = new Blob([content], { type: format === "excel" ? "application/vnd.ms-excel" : "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `employee-salary.${format === "excel" ? "xls" : "csv"}`;
        link.click();
        URL.revokeObjectURL(url);
        setIsExportOpen(false);
    };

    // PDF payslip, same layout the employee portal uses (jsPDF's font is Latin-only, so it stays English)
    const downloadPayslip = (record) => {
        const pdf = new jsPDF();
        pdf.setFillColor(4, 35, 48);
        pdf.rect(0, 0, 210, 34, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(20);
        pdf.setFont("helvetica", "bold");
        pdf.text(`${settings.companyName || "HRMS"} — Payslip`, 20, 21);
        pdf.setTextColor(18, 48, 74);
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Salary Month: ${monthLabel(record.salaryMonth)}`, 20, 50);
        pdf.text(`Employee: ${record.employeeName} (${record.employeeID})`, 20, 60);
        pdf.text(`Designation: ${record.designation || "-"}  |  Department: ${record.department || "-"}`, 20, 68);
        pdf.setDrawColor(210, 222, 232);
        pdf.line(20, 78, 190, 78);
        const rows = [
            ["Basic Salary", formatCurrency(record.basicSalary)],
            ["Allowances", formatCurrency(record.allowances)],
            ["Deductions", `- ${formatCurrency(record.deductions)}`],
            ["Net Salary", formatCurrency(record.netSalary)],
            ["Status", record.status],
        ];
        rows.forEach(([label, value], index) => {
            const y = 94 + index * 15;
            pdf.setFont("helvetica", label === "Net Salary" ? "bold" : "normal");
            pdf.text(label, 20, y);
            pdf.text(String(value), 140, y);
        });
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100, 116, 139);
        pdf.setFontSize(9);
        pdf.text(`Generated from ${settings.companyName || ""} HRMS on ${formatAppDate(new Date())}`, 20, 185);
        pdf.save(`${record.employeeID}-${monthKey(record.salaryMonth)}-payslip.pdf`);
    };

    const statCards = [
        { label: t("hrPayroll.stats.total", { defaultValue: "Total Net Salary" }), value: formatCurrency(stats.total), icon: Wallet, tone: "blue" },
        { label: t("hrPayroll.stats.employees", { defaultValue: "Employees Paid" }), value: stats.people, icon: Users, tone: "navy" },
        { label: t("hrPayroll.stats.processed", { defaultValue: "Processed" }), value: stats.processed, icon: CheckCircle2, tone: "green" },
        { label: t("hrPayroll.stats.pending", { defaultValue: "Pending" }), value: stats.pending, icon: Banknote, tone: "amber" },
    ];

    return (
        <DashboardLayout>
            <div className="payroll-page">
                <div className="payroll-header">
                    <div>
                        <h1>{t("hrPayroll.title", { defaultValue: "Employee Salary" })}</h1>
                        <p>{t("hrPayroll.subtitle", { defaultValue: "Manage employee salary records" })}</p>
                    </div>
                    <div className="payroll-header-actions">
                        <div className="payroll-export-menu">
                            <button type="button" className="payroll-export-btn" onClick={() => setIsExportOpen((open) => !open)} aria-expanded={isExportOpen}>
                                <Download size={14} /> {t("employeesList.export.button", { defaultValue: "Export" })} <ChevronDown size={14} />
                            </button>
                            {isExportOpen && <div className="payroll-export-options"><button type="button" onClick={() => exportPayroll("excel")}>{t("hrPayroll.export.excel", { defaultValue: "Excel" })}</button><button type="button" onClick={() => exportPayroll("csv")}>{t("hrPayroll.export.csv", { defaultValue: "CSV" })}</button></div>}
                        </div>
                        <button type="button" className="payroll-process-btn" onClick={processMonth} disabled={processing || loading}>
                            {processing ? <Loader2 size={15} className="payroll-spin" /> : <CheckCircle2 size={15} />} {t("hrPayroll.process.button", { defaultValue: "Process Month" })}
                        </button>
                        <button type="button" className="add-salary-btn" onClick={() => setEditing({})}><PlusCircle size={15} /> {t("hrPayroll.addSalary", { defaultValue: "Add Salary" })}</button>
                    </div>
                </div>

                {loadError && <div className="payroll-error-banner" role="alert"><AlertCircle size={16} /> {loadError}</div>}

                <section className="payroll-stats">
                    {statCards.map(({ label, value, icon: Icon, tone }) => (
                        <article className={`payroll-stat ${tone}`} key={label}>
                            <span className="payroll-stat-icon"><Icon size={19} /></span>
                            <div><small>{label}</small><strong dir="ltr">{value}</strong></div>
                        </article>
                    ))}
                </section>

                <div className="payroll-table-container">
                    <div className="payroll-list-header">
                        <h2>{t("hrPayroll.listTitle", { defaultValue: "Employee Salary List" })}</h2>
                        <div className="payroll-list-filters">
                            <select value={selectedMonth} onChange={(event) => { setSelectedMonth(event.target.value); setCurrentPage(1); }} aria-label={t("hrPayroll.form.salaryMonth", { defaultValue: "Salary Month" })}>
                                <option value="all">{t("hrPayroll.allMonths", { defaultValue: "All months" })}</option>
                                {months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
                            </select>
                            <select value={selectedDesignation} onChange={(event) => { setSelectedDesignation(event.target.value); setCurrentPage(1); }}>
                                <option value="All">{t("hrPayroll.designation", { defaultValue: "Designation" })}</option>
                                {designations.map((designation) => <option key={designation} value={designation}>{designation}</option>)}
                            </select>
                            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                                <option value="recent">{t("hrPayroll.sortBy", { option: t("hrPayroll.sort.employeeId", { defaultValue: "Employee ID" }), defaultValue: "Sort By: {{option}}" })}</option>
                                <option value="name">{t("hrPayroll.sortBy", { option: t("hrPayroll.sort.name", { defaultValue: "Name" }), defaultValue: "Sort By: {{option}}" })}</option>
                                <option value="salary">{t("hrPayroll.sortBy", { option: t("hrPayroll.sort.salary", { defaultValue: "Salary" }), defaultValue: "Sort By: {{option}}" })}</option>
                            </select>
                        </div>
                    </div>

                    <div className="payroll-table-controls">
                        <input type="text" placeholder={t("hrPayroll.search", { defaultValue: "Search" })} value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} />
                        <div className="payroll-controls-spacer" />
                        <label htmlFor="payroll-rows">{t("employeeAttendance.rowsPerPage", { defaultValue: "Rows per page" })}</label>
                        <select id="payroll-rows" value={rowsPerPage} onChange={(event) => { setRowsPerPage(Number(event.target.value)); setCurrentPage(1); }}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select>
                    </div>

                    <div className="payroll-table-scroll">
                        <table className="payroll-table">
                            <thead><tr>
                                <th>{t("hrPayroll.table.empId", { defaultValue: "Emp ID" })}</th>
                                <th>{t("hrPayroll.table.name", { defaultValue: "Name" })}</th>
                                <th>{t("hrPayroll.table.designation", { defaultValue: "Designation" })}</th>
                                <th>{t("hrPayroll.table.month", { defaultValue: "Month" })}</th>
                                <th>{t("hrPayroll.form.basicSalary", { defaultValue: "Basic Salary" })}</th>
                                <th>{t("hrPayroll.form.allowances", { defaultValue: "Allowances" })}</th>
                                <th>{t("hrPayroll.form.deductions", { defaultValue: "Deductions" })}</th>
                                <th>{t("hrPayroll.table.salary", { defaultValue: "Salary" })}</th>
                                <th>{t("hrPayroll.table.status", { defaultValue: "Status" })}</th>
                                <th>{t("hrPayroll.table.payslip", { defaultValue: "Payslip" })}</th>
                                <th>{t("hrPayroll.table.actions", { defaultValue: "Actions" })}</th>
                            </tr></thead>
                            <tbody>{loading ? <tr><td colSpan="11" className="payroll-empty">{t("hrPayroll.loading", { defaultValue: "Loading salary records..." })}</td></tr> : visible.length ? visible.map((record) => <tr key={record.id}>
                                <td><span dir="ltr" className="ltr-text">{record.employeeID}</span></td>
                                <td className="payroll-name-cell">{record.employeeName}<small>{record.department || ""}</small></td>
                                <td>{record.designation}</td>
                                <td><span dir="ltr" className="ltr-text">{monthLabel(record.salaryMonth)}</span></td>
                                <td><span dir="ltr" className="ltr-text">{formatCurrency(record.basicSalary)}</span></td>
                                <td><span dir="ltr" className="ltr-text">{formatCurrency(record.allowances)}</span></td>
                                <td><span dir="ltr" className="ltr-text">{formatCurrency(record.deductions)}</span></td>
                                <td><span dir="ltr" className="ltr-text payroll-net">{formatCurrency(record.netSalary)}</span></td>
                                <td>
                                    <button
                                        type="button"
                                        className={`payroll-status ${record.status === "Processed" ? "processed" : "pending"}`}
                                        onClick={() => toggleStatus(record)}
                                        disabled={statusBusyId === record.id}
                                        title={t("hrPayroll.status.toggleHint", { defaultValue: "Click to switch between Pending and Processed" })}
                                    >
                                        {statusBusyId === record.id
                                            ? <Loader2 size={12} className="payroll-spin" />
                                            : record.status === "Processed"
                                                ? t("hrPayroll.status.processed", { defaultValue: "Processed" })
                                                : t("hrPayroll.status.pending", { defaultValue: "Pending" })}
                                    </button>
                                </td>
                                <td><button type="button" className="payslip-btn" onClick={() => downloadPayslip(record)}><FileText size={13} /> {t("hrPayroll.generateSlip", { defaultValue: "Generate Slip" })}</button></td>
                                <td className="payroll-actions">
                                    <button type="button" aria-label={t("hrPayroll.editSalaryLabel", { defaultValue: "Edit salary" })} onClick={() => setEditing(record)}><Pencil size={15} /></button>
                                    <button type="button" aria-label={t("hrPayroll.deleteSalaryLabel", { defaultValue: "Delete salary" })} onClick={() => deleteSalary(record)}><Trash2 size={15} /></button>
                                </td>
                            </tr>) : <tr><td colSpan="11" className="payroll-empty">{t("hrPayroll.empty", { defaultValue: "No salary records found" })}</td></tr>}</tbody>
                        </table>
                    </div>
                    <div className="payroll-pagination"><span>{t("hrPayroll.records", { count: filtered.length, defaultValue: "{{count}} records" })}</span><button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)}>{t("hrPayroll.pagination.previous", { defaultValue: "Previous" })}</button><strong dir="ltr">{currentPage} / {totalPages}</strong><button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => page + 1)}>{t("hrPayroll.pagination.next", { defaultValue: "Next" })}</button></div>
                </div>
            </div>

            {editing && (
                <SalaryFormModal
                    record={editing.id ? editing : null}
                    employees={employees}
                    existing={records}
                    symbol={symbol}
                    formatCurrency={formatCurrency}
                    onClose={() => setEditing(null)}
                    onSaved={(saved, isNew) => {
                        setRecords((previous) => isNew ? [saved, ...previous] : previous.map((item) => (item.id === saved.id ? saved : item)));
                        setEditing(null);
                        setCurrentPage(1);
                    }}
                />
            )}
        </DashboardLayout>
    );
}

// The "Save anyway?" duplicate check runs client-side too so HR gets the message before submitting
function SalaryFormModal({ record, employees, existing, symbol, formatCurrency, onClose, onSaved }) {
    const { t } = useTranslation();
    const [form, setForm] = useState(() => record
        ? {
            employeeID: record.employeeID,
            salaryMonth: monthKey(record.salaryMonth) || currentMonth(),
            basicSalary: String(record.basicSalary ?? ""),
            allowances: String(record.allowances ?? ""),
            deductions: String(record.deductions ?? ""),
            status: record.status === "Processed" ? "Processed" : "Pending",
        }
        : { ...emptyForm });
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const employee = employees.find((item) => item.employee_id === form.employeeID);
    const net = toAmount(form.basicSalary) + toAmount(form.allowances) - toAmount(form.deductions);
    const duplicate = existing.some((item) =>
        item.employeeID === form.employeeID
        && monthKey(item.salaryMonth) === form.salaryMonth
        && item.id !== record?.id);

    const setField = (field) => (event) => {
        setForm((current) => ({ ...current, [field]: event.target.value }));
        setError("");
    };

    const submit = async (event) => {
        event.preventDefault();
        if (!form.employeeID) return setError(t("hrPayroll.form.errors.employee", { defaultValue: "Select an employee." }));
        if (!/^\d{4}-\d{2}$/.test(form.salaryMonth)) return setError(t("hrPayroll.form.errors.month", { defaultValue: "Select a salary month." }));
        if (toAmount(form.basicSalary) <= 0) return setError(t("hrPayroll.form.errors.basic", { defaultValue: "Basic salary is required." }));
        if (net < 0) return setError(t("hrPayroll.form.errors.net", { defaultValue: "Deductions cannot be larger than basic salary plus allowances." }));
        if (duplicate) return setError(t("hrPayroll.form.errors.duplicate", { defaultValue: "This employee already has a salary record for this month." }));

        setSaving(true);
        try {
            const response = await fetch(`${API_URL}/api/payroll${record ? `/${record.id}` : ""}`, {
                method: record ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeID: form.employeeID,
                    salaryMonth: form.salaryMonth,
                    basicSalary: toAmount(form.basicSalary),
                    allowances: toAmount(form.allowances),
                    deductions: toAmount(form.deductions),
                    status: form.status,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || t("hrPayroll.errors.saveFailed", { defaultValue: "Unable to save salary" }));
            onSaved(data, !record);
        } catch (submitError) {
            setError(submitError.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="salary-modal-overlay" onClick={() => !saving && onClose()}>
            <form className="salary-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
                <div className="salary-modal-head">
                    <span className="salary-modal-icon"><Wallet size={20} /></span>
                    <div>
                        <h2>{record ? t("hrPayroll.form.editTitle", { defaultValue: "Edit Salary" }) : t("hrPayroll.addSalary", { defaultValue: "Add Salary" })}</h2>
                        <p>{t("hrPayroll.form.subtitle", { defaultValue: "Employee details fill in automatically from the employee record." })}</p>
                    </div>
                    <button type="button" className="salary-modal-close" aria-label={t("recruitment.common.close", { defaultValue: "Close" })} onClick={onClose} disabled={saving}><X size={16} /></button>
                </div>

                <div className="salary-modal-body">
                    <div className="salary-form-grid">
                        <label className="salary-field salary-field-wide">
                            <span>{t("hrPayroll.form.employee", { defaultValue: "Employee" })}</span>
                            <select value={form.employeeID} onChange={setField("employeeID")} autoFocus={!record}>
                                <option value="">{t("hrPayroll.form.selectEmployee", { defaultValue: "Select employee…" })}</option>
                                {employees.map((item) => (
                                    <option key={item.employee_id} value={item.employee_id}>{item.name} ({item.employee_id})</option>
                                ))}
                            </select>
                        </label>
                        <label className="salary-field">
                            <span>{t("hrPayroll.form.salaryMonth", { defaultValue: "Salary Month" })}</span>
                            <input type="month" dir="ltr" value={form.salaryMonth} onChange={setField("salaryMonth")} required />
                        </label>
                    </div>

                    {employee && (
                        <div className="salary-employee-chip">
                            <span className="salary-employee-avatar"><UserRound size={16} /></span>
                            <div>
                                <strong>{employee.name}</strong>
                                <small>{[employee.designation, employee.department].filter(Boolean).join(" · ")}{employee.email ? <> · <bdi dir="ltr">{employee.email}</bdi></> : null}</small>
                            </div>
                            {duplicate && <span className="salary-duplicate-flag"><AlertCircle size={13} /> {t("hrPayroll.form.duplicateFlag", { defaultValue: "Already has this month" })}</span>}
                        </div>
                    )}

                    <div className="salary-form-grid three">
                        {[["basicSalary", t("hrPayroll.form.basicSalary", { defaultValue: "Basic Salary" })], ["allowances", t("hrPayroll.form.allowances", { defaultValue: "Allowances" })], ["deductions", t("hrPayroll.form.deductions", { defaultValue: "Deductions" })]].map(([name, label]) => (
                            <label className="salary-field" key={name}>
                                <span>{label}</span>
                                <div className="salary-amount">
                                    <i>{symbol}</i>
                                    <input type="number" dir="ltr" min="0" step="0.01" inputMode="decimal" placeholder="0" value={form[name]} onChange={setField(name)} />
                                </div>
                            </label>
                        ))}
                    </div>

                    <div className="salary-net-bar">
                        <div>
                            <small>{t("hrPayroll.form.netSalary", { defaultValue: "Net Salary" })}</small>
                            <strong dir="ltr" className={net < 0 ? "negative" : ""}>{formatCurrency(net)}</strong>
                        </div>
                        <label className="salary-field salary-status-field">
                            <span>{t("hrPayroll.table.status", { defaultValue: "Status" })}</span>
                            <select value={form.status} onChange={setField("status")}>
                                <option value="Pending">{t("hrPayroll.status.pending", { defaultValue: "Pending" })}</option>
                                <option value="Processed">{t("hrPayroll.status.processed", { defaultValue: "Processed" })}</option>
                            </select>
                        </label>
                    </div>

                    {error && <p className="salary-form-error" role="alert"><AlertCircle size={14} /> {error}</p>}
                </div>

                <div className="salary-modal-actions">
                    <button type="button" className="salary-btn-ghost" onClick={onClose} disabled={saving}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
                    <button type="submit" className="salary-btn-primary" disabled={saving}>
                        {saving ? <Loader2 size={15} className="payroll-spin" /> : <CheckCircle2 size={15} />} {saving ? t("hrPayroll.form.saving", { defaultValue: "Saving…" }) : t("hrPayroll.form.save", { defaultValue: "Save Salary" })}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default Payroll;
