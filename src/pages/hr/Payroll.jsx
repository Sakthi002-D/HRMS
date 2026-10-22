import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useAlert, useConfirm } from "../../components/common/dialog/dialogContext";
import API_URL from "../../config/api";
import "./Payroll.css";

const initialPayrollData = [
    { employeeID: "EMP001", employeeName: "Sakthivel", department: "IT", designation: "Developer", email: "sakthivel@example.com", phone: "+91 73971 52991", joiningDate: "12 Sep 2024", basicSalary: 30000, allowances: 5000, deductions: 2000, netSalary: 33000, status: "Processed" },
    { employeeID: "EMP002", employeeName: "Sundhar", department: "IT", designation: "Developer", email: "sundhar@company.com", phone: "+91 98765 43202", joiningDate: "24 Oct 2024", basicSalary: 28000, allowances: 4000, deductions: 1500, netSalary: 30500, status: "Processed" },
    { employeeID: "EMP003", employeeName: "John Doe", department: "HR", designation: "HR Executive", email: "john@company.com", phone: "+91 98765 43203", joiningDate: "18 Feb 2024", basicSalary: 35000, allowances: 6000, deductions: 2500, netSalary: 38500, status: "Pending" },
    { employeeID: "EMP004", employeeName: "Rahul", department: "Finance", designation: "Accountant", email: "rahul@company.com", phone: "+91 98765 43204", joiningDate: "17 Oct 2024", basicSalary: 32000, allowances: 4500, deductions: 2000, netSalary: 34500, status: "Processed" },
];

const formatCurrency = (value) => `₹${Number(value).toLocaleString("en-IN")}`;
const dateInputValue = (value) => value ? String(value).slice(0, 10) : "";
const formatDisplayDate = (value) => {
    const normalized = dateInputValue(value);
    if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return value || "-";
    const [year, month, day] = normalized.split("-");
    return `${day} ${new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-IN", { month: "short" })} ${year}`;
};

function Payroll() {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const showAlert = useAlert();
    const [payrollData, setPayrollData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("August 2026");
    const [selectedDesignation, setSelectedDesignation] = useState("All");
    const [sortBy, setSortBy] = useState("recent");
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);

    useEffect(() => {
        fetch(`${API_URL}/api/payroll`)
            .then((response) => response.ok ? response.json() : Promise.reject(new Error("Failed to load payroll")))
            .then(setPayrollData)
            .catch((error) => console.error("Payroll loading error:", error))
            .finally(() => setLoading(false));
    }, []);

    const designations = [...new Set(payrollData.map((employee) => employee.designation))].sort();

    const filteredPayroll = useMemo(() => {
        const searchValue = search.trim().toLowerCase();
        const result = payrollData.filter((employee) => {
            const matchesSearch = !searchValue || [employee.employeeID, employee.employeeName, employee.email, employee.department]
                .some((value) => value.toLowerCase().includes(searchValue));
            const matchesDesignation = selectedDesignation === "All" || employee.designation === selectedDesignation;
            return matchesSearch && matchesDesignation;
        });

        return result.sort((first, second) => {
            if (sortBy === "salary") return second.netSalary - first.netSalary;
            if (sortBy === "name") return first.employeeName.localeCompare(second.employeeName);
            return first.employeeID.localeCompare(second.employeeID, undefined, { numeric: true });
        });
    }, [payrollData, search, selectedDesignation, sortBy]);

    const totalPages = Math.max(1, Math.ceil(filteredPayroll.length / rowsPerPage));
    const visiblePayroll = filteredPayroll.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
    const totalSalary = payrollData.reduce((total, employee) => total + employee.netSalary, 0);
    const processedCount = payrollData.filter((employee) => employee.status === "Processed").length;
    const pendingCount = payrollData.filter((employee) => employee.status === "Pending").length;

    const exportPayroll = (format) => {
        const headers = ["Employee ID", "Name", "Email", "Phone", "Designation", "Joining Date", "Salary"];
        const rows = filteredPayroll.map((employee) => [employee.employeeID, employee.employeeName, employee.email, employee.phone, employee.designation, formatDisplayDate(employee.joiningDate), employee.netSalary]);
        const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
        const content = format === "excel"
            ? `<table><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>${rows.map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join("")}</tr>`).join("")}</table>`
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

    const deleteSalary = (employee) => confirm({
        variant: "danger",
        title: t("hrPayroll.delete.title", { defaultValue: "Delete salary record?" }),
        message: <Trans i18nKey="hrPayroll.delete.message" values={{ name: employee.employeeName }} components={{ strong: <strong /> }} defaults="The salary record for <strong>{{name}}</strong> will be permanently deleted." />,
        confirmText: t("hrPayroll.delete.confirm", { defaultValue: "Delete" }),
        cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
        loadingText: t("hrPayroll.delete.deleting", { defaultValue: "Deleting…" }),
        onConfirm: async () => {
            const response = await fetch(`${API_URL}/api/payroll/${employee.id}`, { method: "DELETE" });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || t("hrPayroll.errors.deleteFailed", { defaultValue: "Unable to delete salary record" }));
            }
            setPayrollData((previous) => previous.filter((item) => item.id !== employee.id));
        },
    });

    const saveSalary = async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const basicSalary = Number(form.get("basicSalary"));
        const allowances = Number(form.get("allowances"));
        const deductions = Number(form.get("deductions"));
        const employee = {
            id: editingEmployee?.id,
            employeeID: form.get("employeeID").toUpperCase(),
            employeeName: form.get("employeeName"),
            department: form.get("department"),
            designation: form.get("designation"),
            email: form.get("email"),
            phone: form.get("phone"),
            joiningDate: form.get("joiningDate"),
            salaryMonth: form.get("salaryMonth"),
            basicSalary,
            allowances,
            deductions,
            netSalary: basicSalary + allowances - deductions,
            status: "Pending",
        };
        const response = await fetch(`${API_URL}/api/payroll${editingEmployee?.id ? `/${editingEmployee.id}` : ""}`, {
            method: editingEmployee?.id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(employee),
        });
        if (!response.ok) {
            const error = await response.json();
            showAlert({ variant: "danger", message: error.message || t("hrPayroll.errors.saveFailed", { defaultValue: "Unable to save salary" }), buttonText: t("employeesList.alerts.ok", { defaultValue: "OK" }) });
            return;
        }
        const saved = await response.json();
        setPayrollData((previous) => editingEmployee?.id
            ? previous.map((item) => item.id === editingEmployee.id ? { ...item, ...saved, ...employee } : item)
            : [{ ...saved, ...employee }, ...previous]);
        setEditingEmployee(null);
        setCurrentPage(1);
    };

    const downloadPayslip = (employee) => {
        const payslip = `Employee Salary Slip\n\nEmployee: ${employee.employeeName}\nEmployee ID: ${employee.employeeID}\nDesignation: ${employee.designation}\nBasic Salary: ${formatCurrency(employee.basicSalary)}\nAllowances: ${formatCurrency(employee.allowances)}\nDeductions: ${formatCurrency(employee.deductions)}\nNet Salary: ${formatCurrency(employee.netSalary)}`;
        const url = URL.createObjectURL(new Blob([payslip], { type: "text/plain" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${employee.employeeID}-payslip.txt`;
        link.click();
        URL.revokeObjectURL(url);
    };

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
                        <button type="button" className="add-salary-btn" onClick={() => setEditingEmployee({})}><PlusCircle size={15} /> {t("hrPayroll.addSalary", { defaultValue: "Add Salary" })}</button>
                    </div>
                </div>

                <div className="payroll-table-container">
                    <div className="payroll-list-header">
                        <h2>{t("hrPayroll.listTitle", { defaultValue: "Employee Salary List" })}</h2>
                        <div className="payroll-list-filters">
                            <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}><option value="August 2026">August 2026</option><option value="July 2026">July 2026</option><option value="June 2026">June 2026</option></select>
                            <select value={selectedDesignation} onChange={(event) => setSelectedDesignation(event.target.value)}><option value="All">{t("hrPayroll.designation", { defaultValue: "Designation" })}</option>{designations.map((designation) => <option key={designation} value={designation}>{designation}</option>)}</select>
                            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="recent">{t("hrPayroll.sortBy", { option: t("hrPayroll.sort.employeeId", { defaultValue: "Employee ID" }), defaultValue: "Sort By: {{option}}" })}</option><option value="name">{t("hrPayroll.sortBy", { option: t("hrPayroll.sort.name", { defaultValue: "Name" }), defaultValue: "Sort By: {{option}}" })}</option><option value="salary">{t("hrPayroll.sortBy", { option: t("hrPayroll.sort.salary", { defaultValue: "Salary" }), defaultValue: "Sort By: {{option}}" })}</option></select>
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
                            <thead><tr><th>{t("hrPayroll.table.empId", { defaultValue: "Emp ID" })}</th><th>{t("hrPayroll.table.name", { defaultValue: "Name" })}</th><th>{t("hrPayroll.table.email", { defaultValue: "Email" })}</th><th>{t("hrPayroll.table.phone", { defaultValue: "Phone" })}</th><th>{t("hrPayroll.table.designation", { defaultValue: "Designation" })}</th><th>{t("hrPayroll.table.joiningDate", { defaultValue: "Joining Date" })}</th><th>{t("hrPayroll.table.salary", { defaultValue: "Salary" })}</th><th>{t("hrPayroll.table.payslip", { defaultValue: "Payslip" })}</th><th>{t("hrPayroll.table.actions", { defaultValue: "Actions" })}</th></tr></thead>
                            <tbody>{loading ? <tr><td colSpan="9" className="payroll-empty">{t("hrPayroll.loading", { defaultValue: "Loading salary records..." })}</td></tr> : visiblePayroll.length ? visiblePayroll.map((employee) => <tr key={employee.id || employee.employeeID}>
                                <td><span dir="ltr" className="ltr-text">{employee.employeeID}</span></td><td>{employee.employeeName}</td><td><span dir="ltr" className="ltr-text">{employee.email}</span></td><td><span dir="ltr" className="ltr-text">{employee.phone}</span></td>
                                <td>{employee.designation}</td>
                                <td><span dir="ltr" className="ltr-text">{formatDisplayDate(employee.joiningDate)}</span></td><td><span dir="ltr" className="ltr-text">{formatCurrency(employee.netSalary)}</span></td><td><button type="button" className="payslip-btn" onClick={() => downloadPayslip(employee)}>{t("hrPayroll.generateSlip", { defaultValue: "Generate Slip" })}</button></td>
                                <td className="payroll-actions"><button type="button" aria-label={t("hrPayroll.editSalaryLabel", { defaultValue: "Edit salary" })} onClick={() => setEditingEmployee(employee)}><Pencil size={15} /></button><button type="button" aria-label={t("hrPayroll.deleteSalaryLabel", { defaultValue: "Delete salary" })} onClick={() => deleteSalary(employee)}><Trash2 size={15} /></button></td>
                            </tr>) : <tr><td colSpan="9" className="payroll-empty">{t("hrPayroll.empty", { defaultValue: "No salary records found" })}</td></tr>}</tbody>
                        </table>
                    </div>
                    <div className="payroll-pagination"><span>{t("hrPayroll.records", { count: filteredPayroll.length, defaultValue: "{{count}} records" })}</span><button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)}>{t("hrPayroll.pagination.previous", { defaultValue: "Previous" })}</button><strong dir="ltr">{currentPage} / {totalPages}</strong><button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => page + 1)}>{t("hrPayroll.pagination.next", { defaultValue: "Next" })}</button></div>
                </div>
            </div>

            {editingEmployee && <div className="salary-modal-overlay" onClick={() => setEditingEmployee(null)}><form className="salary-modal" onSubmit={saveSalary} onClick={(event) => event.stopPropagation()}>
                <h2>{editingEmployee.employeeID ? t("hrPayroll.form.editTitle", { defaultValue: "Edit Salary" }) : t("hrPayroll.addSalary", { defaultValue: "Add Salary" })}</h2>
                <div className="salary-form-grid">{[["employeeID", t("hrPayroll.form.empId", { defaultValue: "Emp ID" }), editingEmployee.employeeID || ""], ["employeeName", t("hrPayroll.form.name", { defaultValue: "Name" }), editingEmployee.employeeName || ""], ["email", t("hrPayroll.form.email", { defaultValue: "Email" }), editingEmployee.email || ""], ["phone", t("hrPayroll.form.phone", { defaultValue: "Phone" }), editingEmployee.phone || ""], ["department", t("hrPayroll.form.department", { defaultValue: "Department" }), editingEmployee.department || ""], ["designation", t("hrPayroll.form.designation", { defaultValue: "Designation" }), editingEmployee.designation || "Developer"], ["joiningDate", t("hrPayroll.form.joiningDate", { defaultValue: "Joining Date" }), dateInputValue(editingEmployee.joiningDate)], ["salaryMonth", t("hrPayroll.form.salaryMonth", { defaultValue: "Salary Month" }), dateInputValue(editingEmployee.salaryMonth) || "2026-08-01"], ["basicSalary", t("hrPayroll.form.basicSalary", { defaultValue: "Basic Salary" }), editingEmployee.basicSalary || ""], ["allowances", t("hrPayroll.form.allowances", { defaultValue: "Allowances" }), editingEmployee.allowances || ""], ["deductions", t("hrPayroll.form.deductions", { defaultValue: "Deductions" }), editingEmployee.deductions || ""]].map(([name, label, value]) => <label key={name}>{label}<input name={name} type={name.includes("Date") || name === "salaryMonth" ? "date" : "text"} defaultValue={value} required /></label>)}</div>
                <div className="salary-modal-actions"><button type="button" onClick={() => setEditingEmployee(null)}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button><button type="submit">{t("hrPayroll.form.save", { defaultValue: "Save Salary" })}</button></div>
            </form></div>}
        </DashboardLayout>
    );
}

export default Payroll;
