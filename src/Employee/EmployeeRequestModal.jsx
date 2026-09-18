import { useState } from "react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = [new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2];

const REQUEST_FIELDS = {
    "Salary Certificate": [
        { name: "purpose", label: "Purpose", type: "text", placeholder: "Why do you need the certificate?" },
        { name: "salary_period", label: "Salary Period", type: "month-year" },
    ],
    "NOC Request": [
        { name: "purpose", label: "Purpose", type: "text", placeholder: "Why do you need the NOC?" },
        { name: "destination", label: "Destination / Organization", type: "text", placeholder: "Enter destination or organization" },
    ],
    "Letter Request": [
        { name: "letter_type", label: "Letter Type", type: "select", options: ["Employment Letter", "Experience Letter", "Promotion Letter", "Other"] },
        { name: "purpose", label: "Purpose", type: "text", placeholder: "Why do you need this letter?" },
    ],
    "Expense Reimbursement": [
        { name: "expense_date", label: "Expense Date", type: "date" },
        { name: "amount", label: "Amount", type: "number", placeholder: "Enter amount" },
        { name: "description", label: "Description", type: "textarea", placeholder: "Describe the expense" },
    ],
};

function EmployeeRequestModal({ requestType, onClose, onSubmit }) {
    const [form, setForm] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const fields = REQUEST_FIELDS[requestType] || [];

    const updateField = (event) => {
        const { name, value } = event.target;
        setForm((current) => ({ ...current, [name]: value }));
    };

    const submitRequest = async (event) => {
        event.preventDefault();
        await onSubmit({ requestType, ...form });
        setSubmitted(true);
    };

    return (
        <div className="employee-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <div className="employee-modal-card employee-request-modal-card" role="dialog" aria-modal="true" aria-labelledby="employee-request-title">
                <button type="button" className="modal-close" onClick={onClose} aria-label="Close request form">x</button>
                {submitted ? (
                    <div className="employee-request-success" role="status">
                        <div className="employee-request-success-icon">&#10003;</div>
                        <h2 id="employee-request-title">Request submitted</h2>
                        <p>Your {requestType.toLowerCase()} has been sent to HR for review.</p>
                        <span className="employee-request-success-status">Pending review</span>
                        <button type="button" className="submit-leave-btn" onClick={onClose}>Done</button>
                    </div>
                ) : <>
                <h2 id="employee-request-title">{requestType}</h2>
                <p>Submit your request to HR for review.</p>
                <form onSubmit={submitRequest}>
                    {fields.map((field) => (
                        <div className="form-group" key={field.name}>
                            <label htmlFor={`request-${field.name}`}>{field.label}</label>
                            {field.type === "textarea" ? (
                                <textarea id={`request-${field.name}`} name={field.name} rows="4" placeholder={field.placeholder} value={form[field.name] || ""} onChange={updateField} required />
                            ) : field.type === "month-year" ? (
                                <div className="request-period-fields">
                                    <select name="salary_month" value={form.salary_month || ""} onChange={updateField} required>
                                        <option value="">Select month</option>
                                        {MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
                                    </select>
                                    <select name="salary_year" value={form.salary_year || ""} onChange={updateField} required>
                                        <option value="">Select year</option>
                                        {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
                                    </select>
                                </div>
                            ) : field.type === "select" ? (
                                <select id={`request-${field.name}`} name={field.name} value={form[field.name] || ""} onChange={updateField} required>
                                    <option value="">Select {field.label}</option>
                                    {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                            ) : (
                                <input id={`request-${field.name}`} name={field.name} type={field.type} placeholder={field.placeholder} value={form[field.name] || ""} onChange={updateField} required />
                            )}
                        </div>
                    ))}
                    <div className="employee-request-modal-actions">
                        <button type="button" className="employee-request-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="submit-leave-btn">Submit Request</button>
                    </div>
                </form>
                </>}
            </div>
        </div>
    );
}

export default EmployeeRequestModal;
