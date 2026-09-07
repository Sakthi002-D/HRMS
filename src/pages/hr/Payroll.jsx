import { useMemo, useState } from "react";
import { ChevronDown, Download, Pencil, PlusCircle, Trash2 } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Payroll.css";

const initialPayrollData = [
    { employeeID: "EMP001", employeeName: "Sakthivel", department: "IT", designation: "Developer", email: "sakthivel@example.com", phone: "+91 73971 52991", joiningDate: "12 Sep 2024", basicSalary: 30000, allowances: 5000, deductions: 2000, netSalary: 33000, status: "Processed" },
    { employeeID: "EMP002", employeeName: "Sundhar", department: "IT", designation: "Developer", email: "sundhar@company.com", phone: "+91 98765 43202", joiningDate: "24 Oct 2024", basicSalary: 28000, allowances: 4000, deductions: 1500, netSalary: 30500, status: "Processed" },
    { employeeID: "EMP003", employeeName: "John Doe", department: "HR", designation: "HR Executive", email: "john@company.com", phone: "+91 98765 43203", joiningDate: "18 Feb 2024", basicSalary: 35000, allowances: 6000, deductions: 2500, netSalary: 38500, status: "Pending" },
    { employeeID: "EMP004", employeeName: "Rahul", department: "Finance", designation: "Accountant", email: "rahul@company.com", phone: "+91 98765 43204", joiningDate: "17 Oct 2024", basicSalary: 32000, allowances: 4500, deductions: 2000, netSalary: 34500, status: "Processed" },
];

const formatCurrency = (value) => `₹${Number(value).toLocaleString("en-IN")}`;

function Payroll() {
    const [payrollData, setPayrollData] = useState(initialPayrollData);
    const [search, setSearch] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("August 2026");
    const [selectedDesignation, setSelectedDesignation] = useState("All");
    const [sortBy, setSortBy] = useState("recent");
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);

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
        const rows = filteredPayroll.map((employee) => [employee.employeeID, employee.employeeName, employee.email, employee.phone, employee.designation, employee.joiningDate, employee.netSalary]);
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

    const saveSalary = (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const basicSalary = Number(form.get("basicSalary"));
        const allowances = Number(form.get("allowances"));
        const deductions = Number(form.get("deductions"));
        const employee = {
            employeeID: form.get("employeeID").toUpperCase(),
            employeeName: form.get("employeeName"),
            department: form.get("department"),
            designation: form.get("designation"),
            email: form.get("email"),
            phone: form.get("phone"),
            joiningDate: form.get("joiningDate"),
            basicSalary,
            allowances,
            deductions,
            netSalary: basicSalary + allowances - deductions,
            status: "Pending",
        };
        setPayrollData((previous) => editingEmployee
            ? previous.map((item) => item.employeeID === editingEmployee.employeeID ? employee : item)
            : [...previous, employee]);
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
                        <h1>Employee Salary</h1>
                        <div className="payroll-breadcrumbs">⌂　›　Payroll　›　<strong>Salary Records</strong></div>
                    </div>
                    <div className="payroll-header-actions">
                        <div className="payroll-export-menu">
                            <button type="button" className="payroll-export-btn" onClick={() => setIsExportOpen((open) => !open)} aria-expanded={isExportOpen}>
                                <Download size={14} /> Export <ChevronDown size={14} />
                            </button>
                            {isExportOpen && <div className="payroll-export-options"><button type="button" onClick={() => exportPayroll("excel")}>Excel</button><button type="button" onClick={() => exportPayroll("csv")}>CSV</button></div>}
                        </div>
                        <button type="button" className="add-salary-btn" onClick={() => setEditingEmployee({})}><PlusCircle size={15} /> Add Salary</button>
                    </div>
                </div>

                <div className="payroll-table-container">
                    <div className="payroll-list-header">
                        <h2>Employee Salary List</h2>
                        <div className="payroll-list-filters">
                            <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}><option>August 2026</option><option>July 2026</option><option>June 2026</option></select>
                            <select value={selectedDesignation} onChange={(event) => setSelectedDesignation(event.target.value)}><option value="All">Designation</option>{designations.map((designation) => <option key={designation}>{designation}</option>)}</select>
                            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="recent">Sort By: Employee ID</option><option value="name">Sort By: Name</option><option value="salary">Sort By: Salary</option></select>
                        </div>
                    </div>

                    <div className="payroll-table-controls">
                        <input type="text" placeholder="Search" value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} />
                        <div className="payroll-controls-spacer" />
                        <label htmlFor="payroll-rows">Rows per page</label>
                        <select id="payroll-rows" value={rowsPerPage} onChange={(event) => { setRowsPerPage(Number(event.target.value)); setCurrentPage(1); }}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select>
                    </div>

                    <div className="payroll-table-scroll">
                        <table className="payroll-table">
                            <thead><tr><th>Emp ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Designation</th><th>Joining Date</th><th>Salary</th><th>Payslip</th><th>Actions</th></tr></thead>
                            <tbody>{visiblePayroll.length ? visiblePayroll.map((employee) => <tr key={employee.employeeID}>
                                <td>{employee.employeeID}</td><td>{employee.employeeName}</td><td>{employee.email}</td><td>{employee.phone}</td>
                                <td>{employee.designation}</td>
                                <td>{employee.joiningDate}</td><td>{formatCurrency(employee.netSalary)}</td><td><button type="button" className="payslip-btn" onClick={() => downloadPayslip(employee)}>Generate Slip</button></td>
                                <td className="payroll-actions"><button type="button" aria-label="Edit salary" onClick={() => setEditingEmployee(employee)}><Pencil size={15} /></button><button type="button" aria-label="Delete salary" onClick={() => { if (window.confirm(`Delete ${employee.employeeName} salary record?`)) setPayrollData((previous) => previous.filter((item) => item.employeeID !== employee.employeeID)); }}><Trash2 size={15} /></button></td>
                            </tr>) : <tr><td colSpan="9" className="payroll-empty">No salary records found</td></tr>}</tbody>
                        </table>
                    </div>
                    <div className="payroll-pagination"><span>{filteredPayroll.length} records</span><button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)}>Previous</button><strong>{currentPage} / {totalPages}</strong><button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => page + 1)}>Next</button></div>
                </div>
            </div>

            {editingEmployee && <div className="salary-modal-overlay" onClick={() => setEditingEmployee(null)}><form className="salary-modal" onSubmit={saveSalary} onClick={(event) => event.stopPropagation()}>
                <h2>{editingEmployee.employeeID ? "Edit Salary" : "Add Salary"}</h2>
                <div className="salary-form-grid">{[["employeeID", "Emp ID", editingEmployee.employeeID || ""], ["employeeName", "Name", editingEmployee.employeeName || ""], ["email", "Email", editingEmployee.email || ""], ["phone", "Phone", editingEmployee.phone || ""], ["department", "Department", editingEmployee.department || ""], ["designation", "Designation", editingEmployee.designation || "Developer"], ["joiningDate", "Joining Date", editingEmployee.joiningDate || ""], ["basicSalary", "Basic Salary", editingEmployee.basicSalary || ""], ["allowances", "Allowances", editingEmployee.allowances || ""], ["deductions", "Deductions", editingEmployee.deductions || ""]].map(([name, label, value]) => <label key={name}>{label}<input name={name} defaultValue={value} required /></label>)}</div>
                <div className="salary-modal-actions"><button type="button" onClick={() => setEditingEmployee(null)}>Cancel</button><button type="submit">Save Salary</button></div>
            </form></div>}
        </DashboardLayout>
    );
}

export default Payroll;
