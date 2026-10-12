import { useState } from "react";
import { useTranslation } from "react-i18next";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = [new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2];

// Saved request type (English) → the key the Documents page already uses for its title
const REQUEST_KEYS = {
    "Salary Certificate": "salaryCertificate",
    "NOC Request": "nocRequest",
    "Letter Request": "letterRequest",
    "Expense Reimbursement": "expenseReimbursement",
};
const valueKey = (value) => String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");

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
    const { t } = useTranslation();
    const [form, setForm] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const fields = REQUEST_FIELDS[requestType] || [];

    const requestKey = REQUEST_KEYS[requestType];
    const title = requestKey ? t(`employeeDocuments.requests.${requestKey}.title`, { defaultValue: requestType }) : requestType;
    const fieldLabel = (field) => t(`employeeRequest.fields.${field.name}`, { defaultValue: field.label });
    const fieldPlaceholder = (field) => field.placeholder && t(`employeeRequest.placeholders.${requestKey}.${field.name}`, { defaultValue: field.placeholder });
    const optionLabel = (field, option) => t(`employeeRequest.options.${field.name}.${valueKey(option)}`, { defaultValue: option });

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
                <button type="button" className="modal-close" onClick={onClose} aria-label={t("employeeRequest.close", { defaultValue: "Close request form" })}>x</button>
                {submitted ? (
                    <div className="employee-request-success" role="status">
                        <div className="employee-request-success-icon">&#10003;</div>
                        <h2 id="employee-request-title">{t("employeeRequest.submittedTitle", { defaultValue: "Request submitted" })}</h2>
                        <p>{t("employeeRequest.submittedMessage", { type: title.toLowerCase(), defaultValue: "Your {{type}} has been sent to HR for review." })}</p>
                        <span className="employee-request-success-status">{t("employeeRequest.pendingReview", { defaultValue: "Pending review" })}</span>
                        <button type="button" className="submit-leave-btn" onClick={onClose}>{t("employeeRequest.done", { defaultValue: "Done" })}</button>
                    </div>
                ) : <>
                <h2 id="employee-request-title">{title}</h2>
                <p>{t("employeeRequest.subtitle", { defaultValue: "Submit your request to HR for review." })}</p>
                <form onSubmit={submitRequest}>
                    {fields.map((field) => (
                        <div className="form-group" key={field.name}>
                            <label htmlFor={`request-${field.name}`}>{fieldLabel(field)}</label>
                            {field.type === "textarea" ? (
                                <textarea id={`request-${field.name}`} name={field.name} rows="4" placeholder={fieldPlaceholder(field)} value={form[field.name] || ""} onChange={updateField} required />
                            ) : field.type === "month-year" ? (
                                <div className="request-period-fields">
                                    <select name="salary_month" value={form.salary_month || ""} onChange={updateField} required>
                                        <option value="">{t("employeeRequest.selectMonth", { defaultValue: "Select month" })}</option>
                                        {MONTHS.map((month) => <option key={month} value={month}>{t(`employeeRequest.months.${month.toLowerCase()}`, { defaultValue: month })}</option>)}
                                    </select>
                                    <select name="salary_year" value={form.salary_year || ""} onChange={updateField} required>
                                        <option value="">{t("employeeRequest.selectYear", { defaultValue: "Select year" })}</option>
                                        {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
                                    </select>
                                </div>
                            ) : field.type === "select" ? (
                                <select id={`request-${field.name}`} name={field.name} value={form[field.name] || ""} onChange={updateField} required>
                                    <option value="">{t("employeeRequest.selectOption", { label: fieldLabel(field), defaultValue: "Select {{label}}" })}</option>
                                    {field.options.map((option) => <option key={option} value={option}>{optionLabel(field, option)}</option>)}
                                </select>
                            ) : (
                                <input id={`request-${field.name}`} name={field.name} type={field.type} placeholder={fieldPlaceholder(field)} value={form[field.name] || ""} onChange={updateField} required />
                            )}
                        </div>
                    ))}
                    <div className="employee-request-modal-actions">
                        <button type="button" className="employee-request-cancel" onClick={onClose}>{t("employeeRequest.cancel", { defaultValue: "Cancel" })}</button>
                        <button type="submit" className="submit-leave-btn">{t("employeeRequest.submit", { defaultValue: "Submit Request" })}</button>
                    </div>
                </form>
                </>}
            </div>
        </div>
    );
}

export default EmployeeRequestModal;