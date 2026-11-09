// Settings for the Resignation workflow (FRD SHELTER-HCM-SSP-20-001):
// - ResignationNoticeSettings: default notice period, overrides per grade (grades table) /
//   employment type, and the Exit clearance departments (owner + items)
// - ResignationWorkflowSettings: approval chain (Settings → Approval Workflows), default Line Manager → HR
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, getSessionEmployeeId, recruitmentRoleLabel } from "../../../components/recruitment/recruitmentApi";
import "./RecruitmentSettings.css";
import "../../../components/resignation/resignation.css";

const EMPLOYMENT_TYPES = ["Full Time", "Part Time", "Contract", "Other"];
const ITEM_TYPES = ["Asset", "Task", "Amount"];

function useResignationSettings() {
    const [data, setData] = useState(null);
    const [message, setMessage] = useState({ text: "", error: false });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let ignore = false;
        api("/api/resignations/settings")
            .then((result) => !ignore && setData(result))
            .catch((err) => !ignore && setMessage({ text: err.message, error: true }));
        return () => { ignore = true; };
    }, []);

    const save = async (settings, successText) => {
        setSaving(true);
        setMessage({ text: "", error: false });
        try {
            const result = await api("/api/resignations/settings", { method: "PUT", body: { actor_id: getSessionEmployeeId(), settings } });
            setData((current) => ({ ...current, settings: result.settings }));
            setMessage({ text: successText, error: false });
            return result.settings;
        } catch (err) {
            setMessage({ text: err.message, error: true });
            return null;
        } finally {
            setSaving(false);
        }
    };

    return { data, message, saving, save };
}

const toRows = (map) => Object.entries(map || {}).map(([name, days]) => ({ name, days: String(days) }));
const toMap = (rows) => Object.fromEntries(rows.filter((row) => row.name.trim()).map((row) => [row.name.trim(), Number(row.days)]));

// options: a dropdown of fixed values (grades); suggestions: free text with a datalist (employment types)
function OverrideTable({ title, column, hint, rows, setRows, suggestions = [], options = null, listId }) {
    const { t } = useTranslation();
    const update = (index, field, value) => setRows(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    const used = new Set(rows.map((row) => row.name));

    return (
        <section className="rs-section">
            <h3>{title}</h3>
            <p>{hint}</p>
            {!options && <datalist id={listId}>{suggestions.map((value) => <option key={value} value={value} />)}</datalist>}
            <table className="rs-table">
                <thead><tr><th>{column}</th><th>{t("settings.resignation.noticeDays", { defaultValue: "Notice period (days)" })}</th><th /></tr></thead>
                <tbody>
                    {rows.length === 0 && <tr><td colSpan="3">{t("settings.resignation.noOverrides", { defaultValue: "No overrides. The default applies." })}</td></tr>}
                    {rows.map((row, index) => (
                        <tr key={index}>
                            <td>
                                {options ? (
                                    <select value={row.name} onChange={(event) => update(index, "name", event.target.value)} aria-label={column}>
                                        <option value="">{t("settings.resignation.selectGrade", { defaultValue: "Select grade" })}</option>
                                        {/* A saved grade that is no longer active still shows */}
                                        {[...new Set([...options, ...(row.name ? [row.name] : [])])].map((value) => (
                                            <option key={value} value={value} disabled={value !== row.name && used.has(value)}>{value}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input list={listId} value={row.name} onChange={(event) => update(index, "name", event.target.value)} placeholder={t("hrPayroll.table.name", { defaultValue: "Name" })} aria-label={column} />
                                )}
                            </td>
                            <td><input type="number" min="1" max="365" value={row.days} onChange={(event) => update(index, "days", event.target.value)} aria-label={t("settings.resignation.noticeDays", { defaultValue: "Notice period (days)" })} /></td>
                            <td><button type="button" className="rs-icon-button" aria-label={t("settings.common.remove", { defaultValue: "Remove" })} onClick={() => setRows(rows.filter((_, i) => i !== index))}><Trash2 size={14} /></button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="rs-add-row">
                <button type="button" className="settings-save-button" onClick={() => setRows([...rows, { name: "", days: "" }])}><Plus size={14} /> {t("settings.resignation.addOverride", { defaultValue: "Add override" })}</button>
            </div>
        </section>
    );
}

let draftKey = 0;
const newKey = () => `new-${(draftKey += 1)}`;
const withKeys = (departments) => (departments || []).map((department) => ({
    ...department,
    key: department.id || newKey(),
    items: (department.items || []).map((item) => ({ ...item, key: item.id || newKey() })),
}));
// The server only needs id / name / ownerId / useLineManager / items (id, name, type)
const withoutKeys = (departments) => departments.map((department) => ({
    ...(department.id ? { id: department.id } : {}),
    name: department.name,
    ownerId: department.ownerId || null,
    ...(department.useLineManager ? { useLineManager: true } : {}),
    items: department.items.map((item) => ({ ...(item.id ? { id: item.id } : {}), name: item.name, type: item.type })),
}));

// Settings → Resignation → Exit clearance: departments, owner (employee picker) and items
function ExitClearanceSettings({ departments, setDepartments, employees }) {
    const { t } = useTranslation();
    const update = (key, changes) => setDepartments(departments.map((department) => (department.key === key ? { ...department, ...changes } : department)));
    const updateItem = (department, itemKey, changes) => update(department.key, {
        items: department.items.map((item) => (item.key === itemKey ? { ...item, ...changes } : item)),
    });
    const owners = (department) => {
        const known = employees.some((employee) => employee.employee_id === department.ownerId);
        return known || !department.ownerId ? employees : [...employees, { employee_id: department.ownerId, name: department.ownerId }];
    };

    return (
        <section className="rs-section">
            <h3>{t("settings.resignation.clearanceTitle", { defaultValue: "Exit clearance" })}</h3>
            <p>{t("settings.resignation.clearanceHint", { defaultValue: "When HR starts exit clearance, each department below gets its items. The owner is notified and clears them in Employee portal → Resignation → My Approvals → Clearance; HR can clear on their behalf." })}</p>

            <div className="rs-clearance-list">
                {departments.length === 0 && <p className="mpr-muted">{t("settings.resignation.noDepartments", { defaultValue: "No departments. Add one below." })}</p>}
                {departments.map((department, index) => {
                    const nameId = `clearance-dept-${department.key}`;
                    const ownerId = `clearance-owner-${department.key}`;
                    return (
                        <fieldset key={department.key} className="rs-clearance-dept">
                            <legend className="rs-visually-hidden">{department.name || t("settings.resignation.department", { defaultValue: "Department" })}</legend>
                            <div className="rs-clearance-head">
                                <label className="settings-field">
                                    <span>{t("settings.resignation.department", { defaultValue: "Department" })} {index + 1}</span>
                                    <input id={nameId} value={department.name} onChange={(event) => update(department.key, { name: event.target.value })} />
                                </label>
                                <label className="settings-field">
                                    <span>{t("settings.resignation.owner", { defaultValue: "Owner" })}</span>
                                    <select id={ownerId} value={department.ownerId || ""} onChange={(event) => update(department.key, { ownerId: event.target.value || null })}>
                                        <option value="">
                                            {department.useLineManager
                                                ? t("settings.resignation.ownerLineManager", { defaultValue: "Employee's Line Manager" })
                                                : t("settings.resignation.ownerHR", { defaultValue: "No owner (HR clears)" })}
                                        </option>
                                        {owners(department).map((employee) => (
                                            <option key={employee.employee_id} value={employee.employee_id}>{employee.name} ({employee.employee_id})</option>
                                        ))}
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    className="rs-icon-button rs-clearance-remove"
                                    aria-label={t("settings.resignation.removeDepartment", { name: department.name, defaultValue: "Remove department {{name}}" })}
                                    onClick={() => setDepartments(departments.filter((entry) => entry.key !== department.key))}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            <table className="rs-table rs-clearance-items">
                                <thead>
                                    <tr>
                                        <th>{t("settings.resignation.item", { defaultValue: "Item" })}</th>
                                        <th>{t("settings.resignation.itemType", { defaultValue: "Type" })}</th>
                                        <th><span className="rs-visually-hidden">{t("settings.common.remove", { defaultValue: "Remove" })}</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {department.items.length === 0 && <tr><td colSpan="3">{t("settings.resignation.noItems", { defaultValue: "No items yet." })}</td></tr>}
                                    {department.items.map((item) => (
                                        <tr key={item.key}>
                                            <td><input value={item.name} onChange={(event) => updateItem(department, item.key, { name: event.target.value })} aria-label={t("settings.resignation.itemName", { defaultValue: "Item name" })} /></td>
                                            <td>
                                                <select value={item.type} onChange={(event) => updateItem(department, item.key, { type: event.target.value })} aria-label={t("settings.resignation.itemType", { defaultValue: "Type" })}>
                                                    {ITEM_TYPES.map((type) => <option key={type} value={type}>{t(`resignation.clearance.types.${type.toLowerCase()}`, { defaultValue: type })}</option>)}
                                                </select>
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="rs-icon-button"
                                                    aria-label={t("settings.resignation.removeItem", { name: item.name, defaultValue: "Remove {{name}}" })}
                                                    onClick={() => update(department.key, { items: department.items.filter((entry) => entry.key !== item.key) })}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="rs-add-row">
                                <button type="button" className="rs-link-button" onClick={() => update(department.key, { items: [...department.items, { key: newKey(), name: "", type: "Asset" }] })}>
                                    <Plus size={14} /> {t("settings.resignation.addItem", { defaultValue: "Add item" })}
                                </button>
                            </div>
                        </fieldset>
                    );
                })}
            </div>
            <div className="rs-add-row">
                <button type="button" className="settings-save-button" onClick={() => setDepartments([...departments, { key: newKey(), name: "", ownerId: null, items: [] }])}>
                    <Plus size={14} /> {t("settings.resignation.addDepartment", { defaultValue: "Add department" })}
                </button>
            </div>
        </section>
    );
}

// Settings → Resignation → Final settlement: who approves, gratuity days per year, minimum service, leave encashment basis
function FinalSettlementSettings({ value, onChange }) {
    const { t } = useTranslation();
    const set = (field, next) => onChange({ ...value, [field]: next });
    return (
        <section className="rs-section">
            <h3>{t("settings.resignation.settlementTitle", { defaultValue: "Final settlement" })}</h3>
            <p>{t("settings.resignation.settlementHint", { defaultValue: "Gratuity = (basic ÷ 30) × gratuity days per year × years of service, from the minimum service. Unused leave = leave balance × (basic or gross ÷ 30)." })}</p>
            <div className="rs-grid">
                <label className="settings-field">
                    <span>{t("settings.resignation.gratuityDays", { defaultValue: "Gratuity days per year" })}</span>
                    <input type="number" min="0" max="365" step="0.5" value={value.gratuityDaysPerYear} onChange={(event) => set("gratuityDaysPerYear", event.target.value)} />
                </label>
                <label className="settings-field">
                    <span>{t("settings.resignation.minService", { defaultValue: "Minimum service for gratuity (years)" })}</span>
                    <input type="number" min="0" max="50" step="0.5" value={value.minServiceYears} onChange={(event) => set("minServiceYears", event.target.value)} />
                </label>
                <fieldset className="settings-field rs-radio-field">
                    <legend>{t("settings.resignation.settlementApprover", { defaultValue: "Settlement approved by" })}</legend>
                    {/* Finance: enable the option once the Finance screen exists; the backend reads this setting */}
                    {[["HR", t("settings.resignation.approverHr", { defaultValue: "HR" }), false], ["FINANCE", t("settings.resignation.approverFinance", { defaultValue: "Finance (coming soon)" }), true]].map(([key, label, disabled]) => (
                        <label key={key} className={disabled ? "rs-radio-disabled" : undefined}>
                            <input type="radio" name="settlement-approver" value={key} checked={value.settlementApprover === key} disabled={disabled} onChange={() => set("settlementApprover", key)} />
                            {label}
                        </label>
                    ))}
                </fieldset>
                <fieldset className="settings-field rs-radio-field">
                    <legend>{t("settings.resignation.leaveBasis", { defaultValue: "Leave encashment uses" })}</legend>
                    {[["basic", t("settings.resignation.basicSalary", { defaultValue: "Basic salary" })], ["gross", t("settings.resignation.grossSalary", { defaultValue: "Gross (basic + allowances)" })]].map(([key, label]) => (
                        <label key={key}>
                            <input type="radio" name="leave-encashment-basis" value={key} checked={value.leaveEncashmentBasis === key} onChange={() => set("leaveEncashmentBasis", key)} />
                            {label}
                        </label>
                    ))}
                </fieldset>
            </div>
        </section>
    );
}

export function ResignationNoticeSettings() {
    const { t } = useTranslation();
    const { data, message, saving, save } = useResignationSettings();
    const [editedDraft, setDraft] = useState(null);
    const [employees, setEmployees] = useState([]);

    useEffect(() => {
        let ignore = false;
        api("/api/employees")
            .then((rows) => !ignore && setEmployees(rows
                .filter((employee) => String(employee.status || "Active").toLowerCase() === "active")
                .map((employee) => ({ employee_id: employee.employee_id, name: employee.name }))
                .sort((a, b) => String(a.name).localeCompare(String(b.name)))))
            .catch(() => {});
        return () => { ignore = true; };
    }, []);

    const draft = editedDraft || (data && {
        noticePeriodDays: String(data.settings.noticePeriodDays),
        grades: toRows(data.settings.gradeOverrides),
        types: toRows(data.settings.employmentTypeOverrides),
        clearance: withKeys(data.settings.clearanceDepartments),
        settlement: {
            gratuityDaysPerYear: String(data.settings.finalSettlement?.gratuityDaysPerYear ?? 21),
            minServiceYears: String(data.settings.finalSettlement?.minServiceYears ?? 1),
            leaveEncashmentBasis: data.settings.finalSettlement?.leaveEncashmentBasis || "basic",
            settlementApprover: data.settings.finalSettlement?.settlementApprover || "HR",
        },
    });

    if (!draft) return <div className="rs-panel">{message.text ? <p className="rs-error">{message.text}</p> : t("settings.resignation.loading", { defaultValue: "Loading resignation settings..." })}</div>;

    const submit = async () => {
        const saved = await save(
            {
                noticePeriodDays: Number(draft.noticePeriodDays),
                gradeOverrides: toMap(draft.grades),
                employmentTypeOverrides: toMap(draft.types),
                clearanceDepartments: withoutKeys(draft.clearance),
                finalSettlement: {
                    gratuityDaysPerYear: Number(draft.settlement.gratuityDaysPerYear),
                    minServiceYears: Number(draft.settlement.minServiceYears),
                    leaveEncashmentBasis: draft.settlement.leaveEncashmentBasis,
                    settlementApprover: draft.settlement.settlementApprover,
                },
            },
            t("settings.resignation.saved", { defaultValue: "Resignation settings saved. New resignations use this notice period." })
        );
        if (saved) setDraft(null);
    };

    return (
        <div className="rs-panel">
            {message.text && <p className={message.error ? "rs-error" : "rs-success"} role={message.error ? "alert" : "status"}>{message.text}</p>}

            <section className="rs-section">
                <h3>{t("settings.resignation.noticePeriod", { defaultValue: "Notice period" })}</h3>
                <p>{t("settings.resignation.noticePeriodHint", { defaultValue: "Last working day = resignation date + notice period. A grade override wins over an employment type override." })}</p>
                <div className="rs-grid">
                    <label className="settings-field">
                        <span>{t("settings.resignation.defaultNotice", { defaultValue: "Default notice period (days)" })}</span>
                        <input type="number" min="1" max="365" value={draft.noticePeriodDays} onChange={(event) => setDraft({ ...draft, noticePeriodDays: event.target.value })} />
                    </label>
                </div>
            </section>

            <OverrideTable
                title={t("settings.resignation.gradeOverrides", { defaultValue: "Grade overrides" })}
                column={t("settings.resignation.grade", { defaultValue: "Grade" })}
                hint={t("settings.resignation.gradeOverridesHint", { defaultValue: "Notice period for employees in a grade." })}
                rows={draft.grades}
                setRows={(grades) => setDraft({ ...draft, grades })}
                options={data.grades || []}
                listId="resignation-grade-options"
            />
            <OverrideTable
                title={t("settings.resignation.typeOverrides", { defaultValue: "Employment type overrides" })}
                column={t("settings.resignation.employmentType", { defaultValue: "Employment type" })}
                hint={t("settings.resignation.typeOverridesHint", { defaultValue: "Used when the employee's grade has no override." })}
                rows={draft.types}
                setRows={(types) => setDraft({ ...draft, types })}
                suggestions={EMPLOYMENT_TYPES}
                listId="resignation-type-options"
            />

            <ExitClearanceSettings
                departments={draft.clearance}
                setDepartments={(clearance) => setDraft({ ...draft, clearance })}
                employees={employees}
            />

            <FinalSettlementSettings value={draft.settlement} onChange={(settlement) => setDraft({ ...draft, settlement })} />

            <div className="rs-actions">
                <button type="button" className="settings-save-button" onClick={submit} disabled={saving}>
                    {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("settings.resignation.save", { defaultValue: "Save Resignation Settings" })}
                </button>
            </div>
        </div>
    );
}

export function ResignationWorkflowSettings() {
    const { t } = useTranslation();
    const { data, message, saving, save } = useResignationSettings();
    const [editedSteps, setSteps] = useState(null);
    const steps = editedSteps || data?.settings.workflow;

    if (!steps) return message.text ? <p className="rs-error">{message.text}</p> : null;

    const labels = data.roleLabels;
    const roleLabel = (role) => recruitmentRoleLabel(role, labels[role] || role);
    // HR always accepts last; the steps before it can be reordered
    const before = steps.filter((step) => step !== "HR");
    const setBefore = (next) => setSteps([...next, "HR"]);
    const move = (index, offset) => {
        const next = [...before];
        const target = index + offset;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        setBefore(next);
    };
    const available = data.stepRoles.filter((role) => role !== "HR" && !before.includes(role));

    return (
        <section className="rs-section">
            {message.text && <p className={message.error ? "rs-error" : "rs-success"}>{message.text}</p>}
            <h3>{t("settings.resignation.workflowTitle", { defaultValue: "Resignation approval steps" })}</h3>
            <p>
                {t("settings.resignation.workflowHint", { defaultValue: "Approvers act in this order; HR accepts last. Line Manager falls back to the Department Head, then HR, when nobody holds the role for the employee's department." })}
            </p>
            <div className="rs-workflows">
                <div className="rs-workflow">
                    <h4>{t("settings.menu.resignation", { defaultValue: "Resignation" })}</h4>
                    <ol>
                        {before.map((step, index) => (
                            <li key={step}>
                                <span>{index + 1}. {roleLabel(step)}</span>
                                <div>
                                    <button type="button" aria-label={t("settings.workflows.moveUp", { defaultValue: "Move up" })} onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={14} /></button>
                                    <button type="button" aria-label={t("settings.workflows.moveDown", { defaultValue: "Move down" })} onClick={() => move(index, 1)} disabled={index === before.length - 1}><ArrowDown size={14} /></button>
                                    <button type="button" aria-label={t("settings.workflows.removeStep", { defaultValue: "Remove step" })} onClick={() => setBefore(before.filter((_, i) => i !== index))}><Trash2 size={14} /></button>
                                </div>
                            </li>
                        ))}
                        <li><span>{before.length + 1}. {t("settings.resignation.hrAccepts", { role: recruitmentRoleLabel("HR", "HR"), defaultValue: "{{role}} (accepts)" })}</span></li>
                    </ol>
                    {available.length > 0 && (
                        <select value="" onChange={(event) => event.target.value && setBefore([...before, event.target.value])}>
                            <option value="">{t("settings.workflows.addStep", { defaultValue: "+ Add approver step" })}</option>
                            {available.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                        </select>
                    )}
                </div>
            </div>
            <div className="rs-actions">
                <button type="button" className="settings-save-button" onClick={() => save({ workflow: steps }, t("settings.resignation.workflowSaved", { defaultValue: "Resignation workflow saved. Resignations already in approval keep their steps." }))} disabled={saving}>
                    {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("settings.resignation.saveWorkflow", { defaultValue: "Save Resignation Workflow" })}
                </button>
            </div>
        </section>
    );
}
