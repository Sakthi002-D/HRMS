import { Download, WalletCards } from "lucide-react";
import { jsPDF } from "jspdf";
import "./EmployeePayroll.css";

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const dateInputValue = (value) => value ? String(value).slice(0, 10) : "";
const formatMonth = (value) => value ? new Date(value).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "-";

function EmployeePayroll({ records, loading }) {
    const latest = records[0];
    const downloadPayslip = (record) => {
        const pdf = new jsPDF();
        pdf.setFillColor(18, 48, 74);
        pdf.rect(0, 0, 210, 34, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(22);
        pdf.setFont("helvetica", "bold");
        pdf.text("Employee Payslip", 20, 21);
        pdf.setTextColor(18, 48, 74);
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Salary Month: ${formatMonth(record.salaryMonth)}`, 20, 50);
        pdf.text(`Employee: ${record.employeeName}`, 20, 62);
        pdf.text(`Employee ID: ${record.employeeID}`, 20, 70);
        pdf.setDrawColor(210, 222, 232);
        pdf.line(20, 80, 190, 80);
        const rows = [["Basic Salary", formatCurrency(record.basicSalary)], ["Allowances", formatCurrency(record.allowances)], ["Deductions", formatCurrency(record.deductions)], ["Net Salary", formatCurrency(record.netSalary)], ["Bank Transfer Status", record.transferStatus]];
        rows.forEach(([label, value], index) => {
            const y = 96 + index * 16;
            pdf.setFont("helvetica", label === "Net Salary" ? "bold" : "normal");
            pdf.text(label, 20, y);
            pdf.text(value, 145, y);
        });
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100, 116, 139);
        pdf.setFontSize(9);
        pdf.text("Generated from HRMS", 20, 190);
        pdf.save(`${record.employeeID}-${dateInputValue(record.salaryMonth) || "payslip"}.pdf`);
    };

    return <section className="employee-payroll-view">
        <div className="employee-payroll-heading"><div><span className="employee-payroll-kicker">Salary &amp; benefits</span><h2>My Payroll</h2><p>View your salary, deductions and monthly payslips</p></div><WalletCards size={34} /></div>
        {loading ? <div className="employee-payroll-empty">Loading payroll details...</div> : !records.length ? <div className="employee-payroll-empty">No payroll records available yet.</div> : <>
            <div className="employee-payroll-summary">
                <article><span>Net Salary</span><strong>{formatCurrency(latest.netSalary)}</strong><small>{formatMonth(latest.salaryMonth)}</small></article>
                <article><span>Allowances</span><strong>{formatCurrency(latest.allowances)}</strong><small>Current month</small></article>
                <article><span>Deductions</span><strong>{formatCurrency(latest.deductions)}</strong><small>Current month</small></article>
                <article><span>Bank Transfer Status</span><strong className={latest.transferStatus.toLowerCase()}>{latest.transferStatus}</strong><small>{formatMonth(latest.salaryMonth)}</small></article>
            </div>
            <div className="employee-payroll-breakdown"><div><span>Basic Salary</span><strong>{formatCurrency(latest.basicSalary)}</strong></div><div><span>Allowances</span><strong>{formatCurrency(latest.allowances)}</strong></div><div><span>Deductions</span><strong>- {formatCurrency(latest.deductions)}</strong></div><div className="net"><span>Net Salary</span><strong>{formatCurrency(latest.netSalary)}</strong></div></div>
            <section className="employee-salary-history"><div className="employee-payroll-section-heading"><h3>Salary History</h3><span>{records.length} record(s)</span></div><div className="employee-payroll-table-wrap"><table><thead><tr><th>Salary Month</th><th>Basic Salary</th><th>Allowances</th><th>Deductions</th><th>Net Salary</th><th>Transfer Status</th><th>Payslip</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td>{formatMonth(record.salaryMonth)}</td><td>{formatCurrency(record.basicSalary)}</td><td>{formatCurrency(record.allowances)}</td><td>{formatCurrency(record.deductions)}</td><td><strong>{formatCurrency(record.netSalary)}</strong></td><td><span className={`employee-payroll-status ${record.transferStatus.toLowerCase()}`}>{record.transferStatus}</span></td><td><button type="button" className="employee-payslip-button" onClick={() => downloadPayslip(record)}><Download size={14} /> Download</button></td></tr>)}</tbody></table></div></section>
        </>}
    </section>;
}

export default EmployeePayroll;
