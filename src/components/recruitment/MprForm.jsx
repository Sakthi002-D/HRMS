// Manpower Request form (replaces the old "Create Job" form; keeps its fields and styling).
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "../common/dialog/dialogContext";
import DatePicker from "../layout/common/DatePicker";
import "../../pages/hr/Recruitment.css";
import "./recruitment.css";
import { BudgetBadge, BudgetDetails } from "./MprBudget";
import { api, getCompanyCurrency, isBudgetException } from "./recruitmentApi";

const emptyForm = (department) => ({
    request_type: "",
    title: "",
    department: department || "",
    openings: "",
    experience: "",
    location: "",
    employment_type: "Full Time",
    job_description: "",
    skills: "",
    salary_min: "",
    salary_max: "",
    benefits: { air_ticket: "No", allowances: "", vehicle: "No", medical_insurance_category: "", accommodation: "No" },
    application_start_date: "",
    application_end_date: "",
    justification: "",
    assets: [],
    asset_other: "",
    replaced_employee_id: "",
    replacement_reason: "",
});

const fromMpr = (mpr) => ({
    ...emptyForm(),
    ...Object.fromEntries(Object.keys(emptyForm()).map((key) => [key, mpr[key] ?? emptyForm()[key]])),
    openings: mpr.openings ?? "",
    salary_min: mpr.salary_min ?? "",
    salary_max: mpr.salary_max ?? "",
    benefits: {
        air_ticket: mpr.benefits?.air_ticket ? "Yes" : "No",
        allowances: mpr.benefits?.allowances || "",
        vehicle: mpr.benefits?.vehicle ? "Yes" : "No",
        medical_insurance_category: mpr.benefits?.medical_insurance_category || "",
        accommodation: mpr.benefits?.accommodation ? "Yes" : "No",
    },
    assets: mpr.assets || [],
});

function MprForm({ meta, actorId, mpr = null, onClose, onSaved }) {
    const [form, setForm] = useState(() => (mpr ? fromMpr(mpr) : emptyForm(meta.raiseDepartments.length === 1 ? meta.raiseDepartments[0] : "")));
    const [saving, setSaving] = useState("");
    const [error, setError] = useState("");
    const [employees, setEmployees] = useState({ department: null, list: [] });
    // Last budget check: values it was run for, the result, and whether the user chose to continue
    const [budget, setBudget] = useState({ key: null, data: null, acknowledged: false });
    const confirm = useConfirm();
    const checkingRef = useRef(false);
    const openingsRef = useRef(null);
    const justificationRef = useRef(null);
    const currency = getCompanyCurrency(meta.currency);
    // "Today" in the company timezone from HR Settings (computed by the server)
    const today = meta.today;

    const isNewPosition = form.request_type === "New Position";
    const isReplacement = form.request_type === "Replacement";
    const lockedDepartment = mpr?.status === "Sent Back";

    // Employees of the department (employee being replaced)
    useEffect(() => {
        if (!isReplacement || !form.department) return undefined;
        let ignore = false;
        api(`/api/recruitment/employees?department=${encodeURIComponent(form.department)}`)
            .then((list) => !ignore && setEmployees({ department: form.department, list }))
            .catch(() => !ignore && setEmployees({ department: form.department, list: [] }));
        return () => { ignore = true; };
    }, [isReplacement, form.department]);

    // Budget check (New Position only): on leaving No. of Openings / Maximum Salary,
    // on Department change and on Submit. Never on each keystroke.
    const budgetKeyFor = (values) => {
        const openings = Number(values.openings);
        if (values.request_type !== "New Position" || !values.department || !(openings > 0)) return null;
        const year = String(values.application_start_date || meta.today || "").slice(0, 4);
        return `${values.department}|${year}|${openings}|${Number(values.salary_max) || 0}`;
    };

    const currentBudgetKey = budgetKeyFor(form);
    const budgetResult = budget.key === currentBudgetKey ? budget : null;
    const budgetException = isBudgetException(budgetResult?.data);
    const justificationRequired = budgetException && Boolean(budgetResult?.acknowledged);

    const focusField = (ref) => setTimeout(() => ref.current?.focus(), 0);

    // Shows the matching pop-up. Resolves { ok, values, result }: ok = the user may carry on
    // (for an exceeded / missing budget only after choosing "Continue with Justification").
    const runBudgetCheck = async (values, { fromSubmit = false } = {}) => {
        const key = budgetKeyFor(values);
        if (!key) return { ok: true, values, result: null };
        if (checkingRef.current) return { ok: false, values, result: null };

        const known = budget.key === key ? budget : null;
        // Already checked with these values: blur again = nothing new; submit only re-asks for unresolved exceptions
        if (known && (!fromSubmit || !isBudgetException(known.data) || known.acknowledged)) return { ok: true, values, result: known.data };

        checkingRef.current = true;
        try {
            const params = new URLSearchParams({
                department: values.department,
                openings: values.openings,
                salary_max: values.salary_max || 0,
                start_date: values.application_start_date || "",
                ...(mpr?.id ? { mpr_id: mpr.id } : {}),
            });
            const result = known?.data || await api(`/api/mprs/budget-preview?${params}`);
            const details = <BudgetDetails budget={result} currency={currency} />;

            if (result.status === "match") {
                setBudget({ key, data: result, acknowledged: false });
                return { ok: true, values, result };
            }

            if (result.status === "under") {
                const keep = await confirm({
                    variant: "success",
                    title: "Within budget",
                    message: details,
                    cancelText: `Change to ${result.available}`,
                    confirmText: `Continue with ${result.requested}`,
                    dismissValue: true,
                });
                setBudget({ key, data: result, acknowledged: false });
                if (keep) return { ok: true, values, result };

                const changed = { ...values, openings: String(result.available) };
                setForm((current) => ({ ...current, openings: String(result.available) }));
                checkingRef.current = false;
                return runBudgetCheck(changed, { fromSubmit }); // the new number may break the salary budget
            }

            // Exceeded, or no budget for the department + year
            const noBudget = result.status === "no_budget";
            const carryOn = await confirm({
                variant: noBudget ? "warning" : "danger",
                title: noBudget ? "No budget set" : "Budget exceeded",
                message: details,
                cancelText: noBudget ? "Close" : "Edit Openings",
                confirmText: "Continue with Justification",
            });
            setBudget({ key, data: result, acknowledged: carryOn });
            focusField(carryOn ? justificationRef : openingsRef);
            return { ok: carryOn, values, result };
        } catch (err) {
            setError(`Budget check failed: ${err.message}`);
            return { ok: false, values, result: null };
        } finally {
            checkingRef.current = false;
        }
    };

    const checkBudgetOnBlur = () => runBudgetCheck(form);

    const employeeOptions = employees.department === form.department ? employees.list : [];

    const set = (name, value) => setForm((current) => ({ ...current, [name]: value }));
    const setBenefit = (name, value) => setForm((current) => ({ ...current, benefits: { ...current.benefits, [name]: value } }));
    const handleChange = (event) => set(event.target.name, event.target.value);
    const toggleAsset = (asset) =>
        setForm((current) => ({
            ...current,
            assets: current.assets.includes(asset) ? current.assets.filter((item) => item !== asset) : [...current.assets, asset],
        }));

    // Start Date moved past the End Date: clear the End Date
    const handleStartDateChange = (value) =>
        setForm((current) => ({
            ...current,
            application_start_date: value,
            application_end_date: current.application_end_date && value && current.application_end_date < value ? "" : current.application_end_date,
        }));

    // Custom date pickers aren't covered by the browser's "required" check
    const applicationPeriodError = (values) => {
        const { application_start_date: start, application_end_date: end } = values;
        if (!start) return "Choose the Application Start Date.";
        if (start < today) return "Application Start Date must be today or later.";
        if (!end) return "Choose the Application End Date.";
        if (end < start) return "Application End Date must be on or after the Application Start Date.";
        return "";
    };

    const handleDepartmentChange = (event) => {
        const next = { ...form, department: event.target.value };
        setForm(next);
        runBudgetCheck(next);
    };

    const save = async (action, values = form) => {
        setError("");
        setSaving(action);
        try {
            const payload = { ...values, currency, action, actor_id: actorId };
            const saved = mpr?.id
                ? await api(`/api/mprs/${mpr.id}`, { method: "PUT", body: payload })
                : await api("/api/mprs", { method: "POST", body: payload });
            onSaved(saved, action);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving("");
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (saving) return;
        const periodError = applicationPeriodError(form);
        if (periodError) {
            setError(periodError);
            return;
        }
        const { ok, values, result } = await runBudgetCheck(form, { fromSubmit: true });
        if (!ok) return;

        // An exceeded / missing budget always needs a justification (checked again by the server)
        if (isBudgetException(result) && !values.justification.trim()) {
            setError("Budget exceeded: enter a justification to continue.");
            focusField(justificationRef);
            return;
        }
        save("submit", values);
    };

    return (
        <div className="job-form-container mpr-form">
            <div className="job-form-header">
                <h2>{mpr ? `Edit ${mpr.mpr_no}` : "New Manpower Request"}</h2>
                <button type="button" className="close-btn" onClick={onClose}>×</button>
            </div>

            {mpr?.status === "Sent Back" && (
                <p className="mpr-form-note">
                    Sent back for changes. Resubmitting continues the approval from the step that sent it back.
                </p>
            )}

            <form onSubmit={handleSubmit}>
                <h3 className="mpr-form-section">Request</h3>
                <div className="form-grid">
                    <div className="form-group">
                        <label>Request Type *</label>
                        <select name="request_type" value={form.request_type} onChange={handleChange} required disabled={lockedDepartment}>
                            <option value="">Select Request Type</option>
                            {meta.requestTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Department *</label>
                        <select name="department" value={form.department} onChange={handleDepartmentChange} required disabled={lockedDepartment}>
                            <option value="">Select Department</option>
                            {meta.raiseDepartments.map((department) => <option key={department} value={department}>{department}</option>)}
                        </select>
                    </div>

                    {isReplacement && (
                        <>
                            <div className="form-group">
                                <label>Employee Being Replaced *</label>
                                <select name="replaced_employee_id" value={form.replaced_employee_id} onChange={handleChange} required>
                                    <option value="">{form.department ? "Select Employee" : "Select a department first"}</option>
                                    {employeeOptions.map((employee) => (
                                        <option key={employee.employee_id} value={employee.employee_id}>
                                            {employee.name} ({employee.employee_id}){employee.designation ? ` – ${employee.designation}` : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Replacement Reason *</label>
                                <input name="replacement_reason" value={form.replacement_reason} onChange={handleChange} placeholder="e.g. Resignation, end of contract" required />
                            </div>
                        </>
                    )}
                </div>

                {isNewPosition && <BudgetBadge budget={budgetResult?.data} acknowledged={budgetResult?.acknowledged} />}

                <h3 className="mpr-form-section">Position</h3>
                <div className="form-grid">
                    <div className="form-group">
                        <label>Job Title *</label>
                        <input type="text" name="title" value={form.title} onChange={handleChange} placeholder="e.g. Frontend Developer" required />
                    </div>

                    <div className="form-group">
                        <label>No. of Openings *</label>
                        <input ref={openingsRef} type="number" name="openings" min="1" value={form.openings} onChange={handleChange} onBlur={checkBudgetOnBlur} placeholder="e.g. 2" required />
                    </div>

                    <div className="form-group">
                        <label>Experience *</label>
                        <input type="text" name="experience" value={form.experience} onChange={handleChange} placeholder="e.g. 0-2 Years" required />
                    </div>

                    <div className="form-group">
                        <label>Location *</label>
                        <select name="location" value={form.location} onChange={handleChange} required>
                            <option value="">Select Location</option>
                            {meta.locations.map((location) => <option key={location.id} value={location.name}>{location.name}</option>)}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Employment Type</label>
                        <select name="employment_type" value={form.employment_type} onChange={handleChange}>
                            {meta.employmentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Required Skills *</label>
                        <input type="text" name="skills" value={form.skills} onChange={handleChange} placeholder="e.g. React, Node.js, MongoDB" required />
                    </div>

                    <div className="form-group">
                        <label>Application Start Date *</label>
                        <DatePicker value={form.application_start_date} onChange={handleStartDateChange} minDate={today} today={today} autoPosition />
                    </div>

                    <div className="form-group">
                        <label>Application End Date *</label>
                        <DatePicker
                            value={form.application_end_date}
                            onChange={(value) => set("application_end_date", value)}
                            minDate={form.application_start_date && form.application_start_date > today ? form.application_start_date : today}
                            today={today}
                            autoPosition
                        />
                    </div>

                    <div className="form-group mpr-full">
                        <label>Job Description *</label>
                        <textarea name="job_description" value={form.job_description} onChange={handleChange} placeholder="Enter job description" rows="4" required />
                    </div>
                </div>

                <h3 className="mpr-form-section">Compensation & Benefits</h3>
                <div className="form-grid">
                    <div className="form-group">
                        <label>Minimum Salary ({currency} / month) *</label>
                        <input type="number" name="salary_min" min="0" step="0.01" value={form.salary_min} onChange={handleChange} placeholder="e.g. 8000" required />
                    </div>
                    <div className="form-group">
                        <label>Maximum Salary ({currency} / month) *</label>
                        <input type="number" name="salary_max" min="0" step="0.01" value={form.salary_max} onChange={handleChange} onBlur={checkBudgetOnBlur} placeholder="e.g. 10000" required />
                    </div>

                    {[["air_ticket", "Air Ticket"], ["vehicle", "Vehicle"], ["accommodation", "Accommodation"]].map(([name, label]) => (
                        <div className="form-group" key={name}>
                            <label>{label}</label>
                            <select value={form.benefits[name]} onChange={(event) => setBenefit(name, event.target.value)}>
                                <option value="No">No</option>
                                <option value="Yes">Yes</option>
                            </select>
                        </div>
                    ))}

                    <div className="form-group">
                        <label>Medical Insurance Category</label>
                        <input value={form.benefits.medical_insurance_category} onChange={(event) => setBenefit("medical_insurance_category", event.target.value)} placeholder="e.g. Category B" />
                    </div>

                    <div className="form-group mpr-full">
                        <label>Allowances</label>
                        <input value={form.benefits.allowances} onChange={(event) => setBenefit("allowances", event.target.value)} placeholder="e.g. Transport 500, Phone 200" />
                    </div>
                </div>

                <h3 className="mpr-form-section">Assets Required</h3>
                <div className="mpr-checklist">
                    {meta.assetOptions.map((asset) => (
                        <label key={asset} className={form.assets.includes(asset) ? "checked" : ""}>
                            <input type="checkbox" checked={form.assets.includes(asset)} onChange={() => toggleAsset(asset)} />
                            {asset}
                        </label>
                    ))}
                </div>
                {form.assets.includes("Other") && (
                    <div className="form-group mpr-inline">
                        <label>Other Asset *</label>
                        <input name="asset_other" value={form.asset_other} onChange={handleChange} placeholder="Describe the other asset" required />
                    </div>
                )}

                <div className="form-group mpr-inline">
                    <label>Justification {justificationRequired ? "*" : ""}</label>
                    <textarea
                        ref={justificationRef}
                        name="justification"
                        value={form.justification}
                        onChange={handleChange}
                        rows="3"
                        placeholder={justificationRequired ? "Required: explain why this position is needed despite the budget" : "Why is this position needed?"}
                        required={justificationRequired}
                    />
                </div>

                {error && <p className="mpr-form-error">{error}</p>}

                <div className="form-actions">
                    <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
                    <button type="button" className="cancel-btn" onClick={() => save("draft")} disabled={Boolean(saving)}>
                        {saving === "draft" ? "Saving..." : "Save as Draft"}
                    </button>
                    <button type="submit" className="save-job-btn" disabled={Boolean(saving)}>
                        {saving === "submit" ? "Submitting..." : mpr?.status === "Sent Back" ? "Resubmit" : "Submit"}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default MprForm;
