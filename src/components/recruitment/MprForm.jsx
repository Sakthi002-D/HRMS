// Manpower Request form (replaces the old "Create Job" form; keeps its fields and styling).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Award, BriefcaseBusiness, CalendarDays, Minus, Plus, Wrench } from "lucide-react";
import { isDialogOpen, useCloseOnDialog } from "../common/dialog/closeMenus";
import { useConfirm } from "../common/dialog/dialogContext";
import DatePicker from "../layout/common/DatePicker";
import SkillTagInput from "../careers/SkillTagInput";
import "../../pages/hr/Recruitment.css";
import "./recruitment.css";
import { BudgetBadge, BudgetDetails } from "./MprBudget";
import CustomOptionSelect, { OTHER_OPTION } from "./CustomOptionSelect";
import EmployeeSearchSelect from "./EmployeeSearchSelect";
import GradePicker from "./GradePicker";
import { BUILT_IN_DEPARTMENTS, CUSTOM_DEPARTMENTS_KEY, readCustomDepartments } from "./departments";
import { api, getCompanyCurrency, isBudgetException, NEW_HEADCOUNT_TYPES } from "./recruitmentApi";

const QUALIFICATIONS = ["School Certificate", "ITI / Trade Certificate", "Diploma", "Bachelor's Degree", "Master's Degree", "Professional Certification"];
const EXPERIENCE_OPTIONS = ["Fresher", "0–2 years", "2–5 years", "5–10 years", "10+ years"];

// A value saved on an older MPR that is no longer in the list stays selectable
const withSaved = (names, saved) => (saved && !names.includes(saved) ? [...names, saved] : names);

const splitSkills = (skills) => [...new Set(String(skills || "").split(",").map((skill) => skill.trim()).filter(Boolean))];

// Days the application window is open, counting both the start and end date
const applicationDays = (start, end) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;

const emptyForm = (department) => ({
    request_type: "",
    title: "",
    department: department || "",
    project_name: "",
    project_code: "",
    employee_category: "",
    grade: "",
    position: "",
    designation: "",
    qualification: "",
    required_joining_date: "",
    project_start_date: "",
    deployment_timeline: "",
    shift_schedule: "",
    pay_basis: "Monthly",
    ppe_required: false,
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
    const { t } = useTranslation();
    const [form, setForm] = useState(() => (mpr ? fromMpr(mpr) : emptyForm(meta.raiseDepartments.length === 1 ? meta.raiseDepartments[0] : "")));
    const [customDepartments, setCustomDepartments] = useState(readCustomDepartments);

    const [newDepartment, setNewDepartment] = useState("");
    const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
    const [departmentMenuStyle, setDepartmentMenuStyle] = useState(null);
    const departmentButtonRef = useRef(null);
    const departmentMenuRef = useRef(null);
    useCloseOnDialog(departmentDropdownOpen, setDepartmentDropdownOpen);

    useEffect(() => {
        localStorage.setItem(
            CUSTOM_DEPARTMENTS_KEY,
            JSON.stringify(customDepartments)
        );
    }, [customDepartments]);

    // The Department menu is drawn in document.body (a portal) with position: fixed,
    // so the form's scroll box and the accordion cards can never clip it.
    // This keeps the menu lined up with the Department field while it is open.
    useLayoutEffect(() => {
        if (!departmentDropdownOpen) {
            setDepartmentMenuStyle(null);
            return undefined;
        }

        const placeMenu = () => {
            const button = departmentButtonRef.current;
            if (!button) {
                setDepartmentDropdownOpen(false);
                return;
            }

            const rect = button.getBoundingClientRect();

            // Field scrolled out of the form's visible area: close the menu
            const scrollBox = button.closest(".mpr-accordion-form");
            if (scrollBox) {
                const box = scrollBox.getBoundingClientRect();
                if (rect.bottom < box.top || rect.top > box.bottom) {
                    setDepartmentDropdownOpen(false);
                    return;
                }
            }

            const gap = 4;
            const edge = 8;
            const preferredHeight = 240;
            const spaceBelow = window.innerHeight - rect.bottom - gap - edge;
            const spaceAbove = rect.top - gap - edge;
            const openUp = spaceBelow < Math.min(preferredHeight, 160) && spaceAbove > spaceBelow;
            const maxHeight = Math.max(120, Math.min(preferredHeight, openUp ? spaceAbove : spaceBelow));

            setDepartmentMenuStyle({
                left: rect.left,
                width: rect.width,
                maxHeight,
                ...(openUp
                    ? { bottom: window.innerHeight - rect.top + gap }
                    : { top: rect.bottom + gap }),
            });
        };

        const closeOnOutsideClick = (event) => {
            if (departmentButtonRef.current?.contains(event.target)) return;
            if (departmentMenuRef.current?.contains(event.target)) return;
            setDepartmentDropdownOpen(false);
        };

        const closeOnEscape = (event) => {
            if (event.key === "Escape") setDepartmentDropdownOpen(false);
        };

        placeMenu();
        window.addEventListener("scroll", placeMenu, true);
        window.addEventListener("resize", placeMenu);
        document.addEventListener("pointerdown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);

        return () => {
            window.removeEventListener("scroll", placeMenu, true);
            window.removeEventListener("resize", placeMenu);
            document.removeEventListener("pointerdown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [departmentDropdownOpen]);
    const [expandedSections, setExpandedSections] = useState({ request: false, position: false, site: false, compensation: false, summary: false });
    const toggleSection = (name) => setExpandedSections((current) => ({ ...current, [name]: !current[name] }));
    const allSectionsOpen = ["request", "position", "site", "compensation", "summary"].every((key) => expandedSections[key]);
    const toggleAllSections = () => {
        const next = !allSectionsOpen;
        setExpandedSections({ request: next, position: next, site: next, compensation: next, summary: next });
    };
    const [saving, setSaving] = useState("");
    const [error, setError] = useState("");
    const [employees, setEmployees] = useState({ loaded: false, list: [], error: "" });
    // Last budget check: values it was run for, the result, and whether the user chose to continue
    const [budget, setBudget] = useState({ key: null, data: null, acknowledged: false });
    const confirm = useConfirm();
    const checkingRef = useRef(false);
    const openingsRef = useRef(null);
    const justificationRef = useRef(null);
    const currency = getCompanyCurrency(meta.currency);
    // "Today" in the company timezone from HR Settings (computed by the server)
    const today = meta.today;

    const isNewPosition = NEW_HEADCOUNT_TYPES.includes(form.request_type);
    const isReplacement = form.request_type === "Replacement";
    const lockedDepartment = mpr?.status === "Sent Back";

    // All active employees (employee being replaced): loaded once, the first time it's a Replacement
    useEffect(() => {
        if (!isReplacement || employees.loaded) return undefined;
        let ignore = false;
        api("/api/recruitment/employees")
            .then((list) => !ignore && setEmployees({ loaded: true, list, error: "" }))
            .catch((err) => !ignore && setEmployees({ loaded: true, list: [], error: err.message }));
        return () => { ignore = true; };
    }, [isReplacement, employees.loaded]);

    // Budget check (new headcount; not Replacement) against the Headcount Budget line
    // (year + grade + position + designation): on leaving No. of Openings / Maximum Salary,
    // when the Designation is chosen or changed, and on Submit. Never on each keystroke.
    const budgetKeyFor = (values) => {
        const openings = Number(values.openings);
        if (!NEW_HEADCOUNT_TYPES.includes(values.request_type) || !values.designation || !(openings > 0)) return null;
        const year = String(values.application_start_date || meta.today || "").slice(0, 4);
        return [year, values.grade, values.position, values.designation, openings, Number(values.salary_max) || 0].join("|");
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
                grade: values.grade,
                position: values.position,
                designation: values.designation,
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
                    title: t("recruitment.budget.within", { defaultValue: "Within budget" }),
                    message: details,
                    cancelText: t("recruitment.budget.changeTo", { number: result.available, defaultValue: "Change to {{number}}" }),
                    confirmText: t("recruitment.budget.continueWith", { number: result.requested, defaultValue: "Continue with {{number}}" }),
                    dismissValue: true,
                });
                setBudget({ key, data: result, acknowledged: false });
                if (keep) return { ok: true, values, result };

                const changed = { ...values, openings: String(result.available) };
                setForm((current) => ({ ...current, openings: String(result.available) }));
                checkingRef.current = false;
                return runBudgetCheck(changed, { fromSubmit }); // the new number may break the salary budget
            }

            // Exceeded, or no budget line for year + grade + position + designation
            const noBudget = result.status === "no_budget";
            const carryOn = await confirm({
                variant: noBudget ? "warning" : "danger",
                title: noBudget
                    ? t("recruitment.budget.noBudget", { defaultValue: "No budget set" })
                    : t("recruitment.budget.exceeded", { defaultValue: "Budget exceeded" }),
                message: details,
                cancelText: noBudget
                    ? t("recruitment.common.close", { defaultValue: "Close" })
                    : t("recruitment.budget.editOpenings", { defaultValue: "Edit Openings" }),
                confirmText: t("recruitment.budget.continueWithJustification", { defaultValue: "Continue with Justification" }),
            });
            setBudget({ key, data: result, acknowledged: carryOn });
            focusField(carryOn ? justificationRef : openingsRef);
            return { ok: carryOn, values, result };
        } catch (err) {
            setError(t("recruitment.budget.checkFailed", { message: err.message, defaultValue: "Budget check failed: {{message}}" }));
            return { ok: false, values, result: null };
        } finally {
            checkingRef.current = false;
        }
    };

    const checkBudgetOnBlur = () => runBudgetCheck(form);

    // Errors shown in red under a field (as well as the message above the buttons); cleared when it changes
    const [fieldErrors, setFieldErrors] = useState({});
    const clearFieldErrors = (names) => setFieldErrors((current) => {
        const stale = names.filter((name) => current[name]);
        if (!stale.length) return current;
        const next = { ...current };
        stale.forEach((name) => delete next[name]);
        return next;
    });
    const fieldError = (name) => fieldErrors[name] && <small className="mpr-field-error" role="alert">{fieldErrors[name]}</small>;

    const updateFields = (patch) => {
        setForm((current) => ({ ...current, ...patch }));
        clearFieldErrors(Object.keys(patch));
    };
    const set = (name, value) => updateFields({ [name]: value });
    const setBenefit = (name, value) => setForm((current) => ({ ...current, benefits: { ...current.benefits, [name]: value } }));
    const handleChange = (event) => set(event.target.name, event.target.value);

    // Grade → Position → Designation (GradePicker). A chosen Designation fills Job Title / Trade
    // (still editable) and the Employee Category (= the grade's band), and runs the budget check.
    const handleGradeChange = (patch, grade) => {
        const next = {
            ...form,
            ...patch,
            ...(patch.designation
                ? { title: patch.designation, employee_category: grade?.band || form.employee_category }
                : { employee_category: "" }),
        };
        updateFields({ ...patch, title: next.title, employee_category: next.employee_category });
        if (patch.designation && patch.designation !== form.designation) runBudgetCheck(next);
    };

    const skillList = splitSkills(form.skills);
    const experienceOptions = withSaved(EXPERIENCE_OPTIONS, form.experience);
    const openDays = form.application_start_date && form.application_end_date && form.application_end_date >= form.application_start_date
        ? applicationDays(form.application_start_date, form.application_end_date)
        : 0;

    // − / + change the number; the budget check still runs once focus leaves the Openings field
    const stepOpenings = (delta) => set("openings", String(Math.max(1, (Number(form.openings) || 0) + delta)));
    const handleOpeningsBlur = (event) => {
        if (event.currentTarget.closest(".mpr-stepper")?.contains(event.relatedTarget)) return;
        checkBudgetOnBlur();
    };

    // Start Date moved past the End Date: clear the End Date
    const handleStartDateChange = (value) => {
        setForm((current) => ({
            ...current,
            application_start_date: value,
            application_end_date: current.application_end_date && value && current.application_end_date < value ? "" : current.application_end_date,
        }));
        clearFieldErrors(["application_start_date"]);
    };

    // Custom date pickers aren't covered by the browser's "required" check. Returns [field, message].
    const applicationPeriodError = (values) => {
        const { application_start_date: start, application_end_date: end } = values;
        if (!start) return ["application_start_date", t("recruitment.form.errors.chooseStart", { defaultValue: "Choose the Application Start Date." })];
        if (start < today) return ["application_start_date", t("recruitment.form.errors.startPast", { defaultValue: "Application Start Date must be today or later." })];
        if (!end) return ["application_end_date", t("recruitment.form.errors.chooseEnd", { defaultValue: "Choose the Application End Date." })];
        if (end < start) return ["application_end_date", t("recruitment.form.errors.endBeforeStart", { defaultValue: "Application End Date must be on or after the Application Start Date." })];
        return null;
    };

    const handleDepartmentChange = (department) => {
        setForm((current) => ({ ...current, department }));
        setError("");
        clearFieldErrors(["department"]);
        setDepartmentDropdownOpen(false);
    };

    const addCustomDepartment = () => {
        const name = newDepartment.trim();

        if (!name || name.toLowerCase() === "other") {
            setError("Enter a valid department name.");
            return;
        }

        const existingDepartments = [
            ...BUILT_IN_DEPARTMENTS,
            ...customDepartments,
        ];

        const alreadyExists = existingDepartments.some(
            (department) => department.toLowerCase() === name.toLowerCase()
        );

        if (alreadyExists) {
            setError("This department already exists.");
            return;
        }

        setCustomDepartments((current) => [...current, name]);
        setForm((current) => ({ ...current, department: name }));
        setNewDepartment("");
        setError("");
        setDepartmentDropdownOpen(false);
    };

    const deleteCustomDepartment = (department) => {
        setCustomDepartments((current) =>
            current.filter((item) => item !== department)
        );

        setForm((current) => ({
            ...current,
            department:
                current.department === department ? "" : current.department,
        }));

        setError("");
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
        setFieldErrors({});
        const showFieldError = (name, section, message) => {
            setExpandedSections((current) => ({ ...current, [section]: true }));
            setError(message);
            setFieldErrors({ [name]: message });
        };
        // Custom dropdowns, pills and tags aren't covered by the browser's "required" check
        for (const [name, label, section] of [
            ["department", "Department", "request"],
            ...(isReplacement ? [["replaced_employee_id", "Employee Being Replaced", "request"]] : []),
            ["grade", "Grade", "position"],
            ["position", "Position", "position"],
            ["designation", "Designation", "position"],
            ["qualification", "Required Qualification", "position"],
            ["experience", "Experience", "position"],
            ["skills", "Technical / Trade Skills", "position"],
        ]) {
            if (!form[name] || form[name] === OTHER_OPTION) {
                showFieldError(name, section, form[name] === OTHER_OPTION
                    ? `Type the new ${label} and click Add, or choose one from the list.`
                    : name === "skills" ? `Add at least one of the ${label}.` : `Choose the ${label}.`);
                return;
            }
        }
        if (!form.required_joining_date) {
            showFieldError("required_joining_date", "position", "Choose the Required Joining Date.");
            return;
        }
        const periodError = applicationPeriodError(form);
        if (periodError) {
            showFieldError(periodError[0], "position", periodError[1]);
            return;
        }
        const { ok, values, result } = await runBudgetCheck(form, { fromSubmit: true });
        if (!ok) return;

        // An exceeded / missing budget always needs a justification (checked again by the server)
        if (isBudgetException(result) && !values.justification.trim()) {
            setError(t("recruitment.form.errors.justificationNeeded", { defaultValue: "Budget exceeded: enter a justification to continue." }));
            focusField(justificationRef);
            return;
        }
        save("submit", values);
    };

    const accordionHeader = (number, title, subtitle, name) => (
        <button type="button" className={`mpr-accordion-trigger ${expandedSections[name] ? "is-open" : ""}`} onClick={() => toggleSection(name)} aria-expanded={Boolean(expandedSections[name])}>
            <span className="mpr-accordion-number">{number}</span>
            <span className="mpr-accordion-heading"><strong>{title}</strong><small>{subtitle}</small></span>            <span className="mpr-accordion-chevron" aria-hidden="true">{expandedSections[name] ? "⌃" : "⌄"}</span>
        </button>
    );

    return (
        <div className="job-form-container mpr-form mpr-accordion-form">
            <div className="job-form-header mpr-modern-header">
                <div>
                    <h2>{mpr ? t("recruitment.form.editTitle", { number: mpr.mpr_no, defaultValue: `Edit ${mpr.mpr_no}` }) : "New Manpower Request"}</h2>
                    <p>Complete the construction manpower request. Required fields are marked *</p>
                </div>
                <button type="button" className="close-btn" onClick={onClose} aria-label="Close form">×</button>
            </div>

            {mpr?.status === "Sent Back" && (
                <p className="mpr-form-note">{t("recruitment.form.sentBackNote", { defaultValue: "Sent back for changes. Resubmitting continues the approval from the step that sent it back." })}</p>
            )}

            <div className="mpr-accordion-toolbar">
                <span>Request information</span>
                <button type="button" className="mpr-expand-all" onClick={toggleAllSections}>{allSectionsOpen ? "Collapse all" : "Expand all"}</button>
            </div>

            <form onSubmit={handleSubmit}>
                <section className={`mpr-accordion-card ${expandedSections.request ? "expanded" : ""}`}>
                    {accordionHeader("01", "Request & Project", "Request type, department and project details", "request")}
                    {expandedSections.request && <div className="mpr-accordion-content">
                        <div className="form-grid">
                            <div className="form-group">
                                <label>{t("recruitment.fields.requestType", { defaultValue: "Request Type" })} *</label>
                                <select name="request_type" value={form.request_type} onChange={handleChange} required disabled={lockedDepartment}>
                                    <option value="">Select request type</option>
                                    {[
                                        "New Position",
                                        "Replacement",
                                        "Project Expansion",
                                        "Temporary / Contract",
                                    ].map((type) => <option key={type} value={type}>{type}</option>)}
                                </select>
                            </div>
                                                      <div className="form-group">
                                <label>
                                    {t("profileEdit.fields.department", {
                                        defaultValue: "Department",
                                    })} *
                                </label>

                                <div className="mpr-dept-picker">
                                    <button
                                        ref={departmentButtonRef}
                                        type="button"
                                        className={`mpr-dept-field${form.department && form.department !== "Other" ? "" : " is-placeholder"}${departmentDropdownOpen ? " is-open" : ""}`}
                                        onClick={() =>
                                            !isDialogOpen() && setDepartmentDropdownOpen((open) => !open)
                                        }
                                        disabled={lockedDepartment}
                                        aria-expanded={departmentDropdownOpen}
                                    >
                                        <span className="mpr-dept-field-value">
                                            {form.department && form.department !== "Other"
                                                ? form.department
                                                : "Select department"}
                                        </span>
                                        <span className="mpr-dept-field-chevron" aria-hidden="true">
                                            {departmentDropdownOpen ? "⌃" : "⌄"}
                                        </span>
                                    </button>

                                    {departmentDropdownOpen && departmentMenuStyle && createPortal(
                                        <div
                                            ref={departmentMenuRef}
                                            className="mpr-dept-menu"
                                            style={departmentMenuStyle}
                                        >
                                            {BUILT_IN_DEPARTMENTS.map((department) => (
                                                <button
                                                    key={department}
                                                    type="button"
                                                    className={`mpr-dept-option${form.department === department ? " is-selected" : ""}`}
                                                    onClick={() =>
                                                        handleDepartmentChange(department)
                                                    }
                                                >
                                                    {department}
                                                </button>
                                            ))}

                                            {customDepartments.map((department) => (
                                                <div key={department} className="mpr-dept-option-row">
                                                    <button
                                                        type="button"
                                                        className={`mpr-dept-option${form.department === department ? " is-selected" : ""}`}
                                                        onClick={() =>
                                                            handleDepartmentChange(department)
                                                        }
                                                    >
                                                        {department}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="mpr-dept-delete"
                                                        onClick={() =>
                                                            deleteCustomDepartment(department)
                                                        }
                                                        title={`Delete ${department}`}
                                                        aria-label={`Delete ${department}`}
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}

                                            <button
                                                type="button"
                                                className="mpr-dept-option is-other"
                                                onClick={() => {
                                                    setNewDepartment("");
                                                    setError("");
                                                    setDepartmentDropdownOpen(false);
                                                    setForm((current) => ({
                                                        ...current,
                                                        department: "Other",
                                                    }));
                                                }}
                                            >
                                                + Other
                                            </button>
                                        </div>,
                                        document.body
                                    )}
                                </div>

                                {form.department === "Other" && (
                                    <div
                                        style={{
                                            display: "flex",
                                            gap: "8px",
                                            marginTop: "8px",
                                        }}
                                    >
                                        <input
                                            type="text"
                                            value={newDepartment}
                                            onChange={(event) =>
                                                setNewDepartment(event.target.value)
                                            }
                                            placeholder="Enter department name"
                                            maxLength={100}
                                            aria-label="New department name"
                                        />

                                        <button
                                            type="button"
                                            className="save-job-btn"
                                            onClick={addCustomDepartment}
                                            disabled={!newDepartment.trim()}
                                        >
                                            Add
                                        </button>
                                    </div>
                                )}
                                {fieldError("department")}
                            </div>




                            <div className="form-group">
                                <label>Project Name *</label>
                                <input name="project_name" value={form.project_name || ""} onChange={handleChange} placeholder="e.g. Doha Commercial Tower" required />
                            </div>
                            <div className="form-group">
                                <label>Project Code</label>
                                <input name="project_code" value={form.project_code || ""} onChange={handleChange} placeholder="e.g. DCT-2026" />
                            </div>
                            {isReplacement && <>
                                <div className="form-group">
                                    <label>{t("recruitment.form.employeeBeingReplaced", { defaultValue: "Employee Being Replaced" })} *</label>
                                    <EmployeeSearchSelect
                                        value={form.replaced_employee_id}
                                        onChange={(employeeId) => set("replaced_employee_id", employeeId)}
                                        employees={employees.list}
                                        loading={!employees.loaded}
                                        loadError={employees.error}
                                        savedName={mpr?.replaced_employee_name}
                                        placeholder="Select employee"
                                    />
                                    {fieldError("replaced_employee_id")}
                                </div>
                                <div className="form-group">
                                    <label>{t("recruitment.fields.replacementReason", { defaultValue: "Replacement Reason" })} *</label>
                                    <input name="replacement_reason" value={form.replacement_reason} onChange={handleChange} placeholder="e.g. Resignation, end of contract" required />
                                </div>
                            </>}
                        </div>
                        {isNewPosition && <BudgetBadge budget={budgetResult?.data} acknowledged={budgetResult?.acknowledged} />}
                    </div>}
                </section>

                <section className={`mpr-accordion-card ${expandedSections.position ? "expanded" : ""}`}>
                    {accordionHeader("02", "Position Requirements", "Grade, role, skills and hiring timeline", "position")}
                    {expandedSections.position && <div className="mpr-accordion-content mpr-position-content">
                        <div className="mpr-field-group">
                            <h4 className="mpr-group-title"><Award size={15} aria-hidden="true" /> Grade &amp; Designation</h4>
                            <div className="mpr-grade-panel">
                                <GradePicker
                                    grades={meta.grades || []}
                                    value={form}
                                    onChange={handleGradeChange}
                                    errors={fieldErrors}
                                    idPrefix="mpr"
                                />
                            </div>

                            {form.grade && (
                                <div className="mpr-role-card">
                                    <span className="mpr-role-badge" dir="ltr">{form.grade}</span>
                                    <div className="mpr-role-text">
                                        <strong>{form.designation || "Designation not chosen"}</strong>
                                        <small>{form.position || "Position not chosen"} · Grade <bdi dir="ltr">{form.grade}</bdi></small>
                                    </div>
                                    {form.employee_category && (
                                        <span className="mpr-role-category"><small>Employee Category</small>{form.employee_category}</span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="mpr-field-group">
                            <h4 className="mpr-group-title"><BriefcaseBusiness size={15} aria-hidden="true" /> Role Details</h4>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>{t("recruitment.fields.jobTitle", { defaultValue: "Job Title / Trade" })} *</label>
                                    <input type="text" name="title" value={form.title} onChange={handleChange} placeholder="e.g. Civil Site Engineer, Mason, Electrician" required />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="mpr-experience">{t("recruitment.fields.experience", { defaultValue: "Experience" })} *</label>
                                    <select id="mpr-experience" name="experience" value={form.experience || ""} onChange={handleChange} aria-invalid={Boolean(fieldErrors.experience)} className={fieldErrors.experience ? "is-invalid" : ""}>
                                        <option value="">Select experience</option>
                                        {experienceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                                    </select>
                                    {fieldError("experience")}
                                </div>
                                <div className="form-group">
                                    <label htmlFor="mpr-openings">{t("recruitment.fields.openingsCount", { defaultValue: "Number of Openings" })} *</label>
                                    <div className="mpr-stepper">
                                        <button type="button" onClick={() => stepOpenings(-1)} onBlur={handleOpeningsBlur} disabled={!(Number(form.openings) > 1)} aria-label="Decrease openings"><Minus size={15} /></button>
                                        <input id="mpr-openings" ref={openingsRef} type="number" name="openings" min="1" value={form.openings} onChange={handleChange} onBlur={handleOpeningsBlur} placeholder="e.g. 4" required />
                                        <button type="button" onClick={() => stepOpenings(1)} onBlur={handleOpeningsBlur} aria-label="Increase openings"><Plus size={15} /></button>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Required Qualification *</label>
                                    <CustomOptionSelect
                                        value={form.qualification || ""}
                                        onChange={(value) => set("qualification", value)}
                                        options={QUALIFICATIONS}
                                        storageKey="mprCustomQualifications"
                                        placeholder="Select qualification"
                                        otherPlaceholder="Enter qualification"
                                        itemLabel="qualification"
                                        onError={setError}
                                    />
                                    {fieldError("qualification")}
                                </div>
                            </div>
                        </div>

                        <div className="mpr-field-group">
                            <h4 className="mpr-group-title"><Wrench size={15} aria-hidden="true" /> Skills &amp; Duties</h4>
                            <div className="form-grid">
                                <div className="form-group mpr-full">
                                    <label htmlFor="mpr-skills">Technical Skills / Trade Skills *</label>
                                    <SkillTagInput id="mpr-skills" value={skillList} onChange={(skills) => set("skills", skills.join(", "))} invalid={Boolean(fieldErrors.skills)} />
                                    {fieldError("skills")}
                                </div>
                                <div className="form-group mpr-full">
                                    <label>Construction Duties / Job Description *</label>
                                    <textarea name="job_description" value={form.job_description} onChange={handleChange} placeholder="e.g. Read construction drawings, supervise site activities, follow safety procedures, complete assigned trade work" rows="3" required />
                                </div>
                            </div>
                        </div>

                        <div className="mpr-field-group">
                            <h4 className="mpr-group-title"><CalendarDays size={15} aria-hidden="true" /> Hiring Timeline</h4>
                            <div className="form-grid mpr-timeline-grid">
                                <div className="form-group">
                                    <label>Application Start Date *</label>
                                    <DatePicker value={form.application_start_date} onChange={handleStartDateChange} minDate={today} today={today} autoPosition />
                                    {fieldError("application_start_date")}
                                </div>
                                <div className="form-group">
                                    <label>Application End Date *</label>
                                    <DatePicker value={form.application_end_date} onChange={(value) => set("application_end_date", value)} minDate={form.application_start_date && form.application_start_date > today ? form.application_start_date : today} today={today} autoPosition />
                                    {fieldError("application_end_date")}
                                </div>
                                <div className="form-group">
                                    <label>Required Joining Date *</label>
                                    <DatePicker value={form.required_joining_date || ""} onChange={(value) => set("required_joining_date", value)} minDate={today} today={today} autoPosition />
                                    {fieldError("required_joining_date")}
                                </div>
                            </div>
                            {openDays > 0 && <p className="mpr-timeline-note">Applications open for {openDays} {openDays === 1 ? "day" : "days"}</p>}
                        </div>
                    </div>}
                </section>

                <section className={`mpr-accordion-card ${expandedSections.site ? "expanded" : ""}`}>
                    {accordionHeader("03", "Site & Employment", "Work location, project dates and work schedule", "site")}
                    {expandedSections.site && <div className="mpr-accordion-content">
                        <div className="form-grid">
                            <div className="form-group">
                                <label>Work Location / Site *</label>
                                <select name="location" value={form.location} onChange={handleChange} required>
                                    <option value="">Select site location</option>
                                    {meta.locations.map((location) => <option key={location.id} value={location.name}>{location.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Employment Type *</label>
                                <select name="employment_type" value={form.employment_type} onChange={handleChange} required>
                                    {["Full Time", "Part Time", "Contract", "Temporary", "Project-based"].map((type) => <option key={type} value={type}>{type}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Project Start Date</label>
                                <DatePicker value={form.project_start_date || ""} onChange={(value) => set("project_start_date", value)} minDate={today} today={today} autoPosition />
                            </div>
                            <div className="form-group">
                                <label>Expected Deployment</label>
                                <select name="deployment_timeline" value={form.deployment_timeline || ""} onChange={handleChange}>
                                    <option value="">Select deployment timeline</option>
                                    {["Immediately", "Within 2 weeks", "Within 1 month", "Within 2 months", "As per project schedule"].map((item) => <option key={item} value={item}>{item}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Shift / Work Schedule</label>
                                <select name="shift_schedule" value={form.shift_schedule || ""} onChange={handleChange}>
                                    <option value="">Select work schedule</option>
                                    {["Day shift", "Night shift", "Rotational shift", "As per site requirements"].map((item) => <option key={item} value={item}>{item}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>}
                </section>

                <section className={`mpr-accordion-card ${expandedSections.compensation ? "expanded" : ""}`}>
                    {accordionHeader("04", "Compensation & Approval", "Salary, benefits, safety equipment and justification", "compensation")}
                    {expandedSections.compensation && <div className="mpr-accordion-content">
                        <div className="form-grid">
                            <div className="form-group">
                                <label>{t("recruitment.form.minimumSalary", { currency, defaultValue: `Minimum Pay (${currency} / month)` })} *</label>
                                <input type="number" name="salary_min" min="0" step="0.01" value={form.salary_min} onChange={handleChange} placeholder="Enter minimum pay" required />
                            </div>
                            <div className="form-group">
                                <label>{t("recruitment.form.maximumSalary", { currency, defaultValue: `Maximum Pay (${currency} / month)` })} *</label>
                                <input type="number" name="salary_max" min="0" step="0.01" value={form.salary_max} onChange={handleChange} onBlur={checkBudgetOnBlur} placeholder="Enter maximum pay" required />
                            </div>
                            <div className="form-group">
                                <label>Pay Basis</label>
                                <select name="pay_basis" value={form.pay_basis || "Monthly"} onChange={handleChange}>
                                    {["Monthly", "Daily", "Hourly", "Contract"].map((item) => <option key={item} value={item}>{item}</option>)}
                                </select>
                            </div>
                            {[ ["air_ticket", "Air Ticket Eligibility"], ["vehicle", "Transportation"], ["accommodation", "Accommodation"] ].map(([name, label]) => (
                                <div className="form-group" key={name}>
                                    <label>{label}</label>
                                    <select value={form.benefits[name]} onChange={(event) => setBenefit(name, event.target.value)}>
                                        <option value="No">No</option><option value="Yes">Company provided / Eligible</option>
                                    </select>
                                </div>
                            ))}
                            <div className="form-group mpr-full">
                                <label>{t("recruitment.fields.allowances", { defaultValue: "Allowances" })}</label>
                                <input value={form.benefits.allowances} onChange={(event) => setBenefit("allowances", event.target.value)} placeholder="e.g. Transport, food or site allowance" />
                            </div>
                            <div className="form-group">
                                <label>Medical Insurance Category</label>
                                <input value={form.benefits.medical_insurance_category} onChange={(event) => setBenefit("medical_insurance_category", event.target.value)} placeholder="e.g. Category B" />
                            </div>
                            <div className="form-group">
                                <label>PPE / Site Safety Equipment Required</label>
                                <label className="mpr-switch-line"><input type="checkbox" checked={Boolean(form.ppe_required)} onChange={(event) => set("ppe_required", event.target.checked)} /> Required for this position</label>
                            </div>

                            <div className="form-group mpr-full">
                                <label>Business Justification *</label>
                                <textarea ref={justificationRef} name="justification" value={form.justification} onChange={handleChange} rows="3" placeholder={justificationRequired ? "Required: explain why this position is needed despite the budget" : "Explain the business need for this manpower request"} required={justificationRequired || false} />
                            </div>
                        </div>
                        <div className="mpr-approval-preview">
                            <strong>Proposed approval path</strong>
                            <div className="mpr-approval-steps"><span>Project / Department Manager</span><i>→</i><span>HR / Management</span></div>
                            <small>Final approval steps are determined by the configured HRMS workflow.</small>
                        </div>
                    </div>}
                </section>

                <section className={`mpr-accordion-card mpr-summary-card ${expandedSections.summary ? "expanded" : ""}`}>
                    <button type="button" className={`mpr-accordion-trigger mpr-summary-trigger ${expandedSections.summary ? "is-open" : ""}`} onClick={() => toggleSection("summary")} aria-expanded={Boolean(expandedSections.summary)}>
                        <span className="mpr-summary-icon">▤</span>
                        <span className="mpr-accordion-heading"><strong>Request Summary</strong><small>Review your information before submitting</small></span>
                        <span className="mpr-accordion-chevron">{expandedSections.summary ? "⌃" : "⌄"}</span>
                    </button>
                    {expandedSections.summary && <div className="mpr-accordion-content">
                        <div className="mpr-summary-grid">
                            {[["Request Type", form.request_type], ["Department", form.department], ["Project", form.project_name], ["Project Code", form.project_code], ["Job Title", form.title], ["Grade", form.grade], ["Position", form.position], ["Designation", form.designation], ["Employee Category", form.employee_category], ["Openings", form.openings], ["Qualification", form.qualification], ["Joining Date", form.required_joining_date], ["Site", form.location], ["Employment", form.employment_type], ["Salary Range", form.salary_min || form.salary_max ? `${form.salary_min || "—"} – ${form.salary_max || "—"} ${currency}` : "—"]].map(([label, value]) => <div className="mpr-summary-item" key={label}><span>{label}</span><strong>{value && value !== OTHER_OPTION ? value : "—"}</strong></div>)}
                        </div>
                    </div>}
                </section>

                {error && <p className="mpr-form-error">{error}</p>}
                <div className="form-actions mpr-modern-actions">
                    <button type="button" className="cancel-btn" onClick={onClose}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
                    <button type="button" className="cancel-btn" onClick={() => save("draft")} disabled={Boolean(saving)}>{saving === "draft" ? "Saving..." : t("recruitment.form.saveDraft", { defaultValue: "Save as Draft" })}</button>
                    <button type="submit" className="save-job-btn" disabled={Boolean(saving)}>{saving === "submit" ? "Submitting..." : mpr?.status === "Sent Back" ? t("recruitment.form.resubmit", { defaultValue: "Resubmit" }) : "Submit Request"}</button>
                </div>
            </form>
        </div>
    );
}

export default MprForm;
