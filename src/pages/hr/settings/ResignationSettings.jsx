// Settings for the Resignation workflow (FRD SHELTER-HCM-SSP-20-001):
// - ResignationNoticeSettings: default notice period + overrides per grade / employment type
// - ResignationWorkflowSettings: approval chain (Settings → Approval Workflows), default Line Manager → HR
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, getSessionEmployeeId, recruitmentRoleLabel } from "../../../components/recruitment/recruitmentApi";
import "./RecruitmentSettings.css";

const EMPLOYMENT_TYPES = ["Full Time", "Part Time", "Contract"];

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
        } catch (err) {
            setMessage({ text: err.message, error: true });
        } finally {
            setSaving(false);
        }
    };

    return { data, message, saving, save };
}

const toRows = (map) => Object.entries(map || {}).map(([name, days]) => ({ name, days: String(days) }));
const toMap = (rows) => Object.fromEntries(rows.filter((row) => row.name.trim()).map((row) => [row.name.trim(), Number(row.days)]));

function OverrideTable({ title, column, hint, rows, setRows, suggestions, listId }) {
    const { t } = useTranslation();
    const update = (index, field, value) => setRows(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

    return (
        <section className="rs-section">
            <h3>{title}</h3>
            <p>{hint}</p>
            <datalist id={listId}>{suggestions.map((value) => <option key={value} value={value} />)}</datalist>
            <table className="rs-table">
                <thead><tr><th>{column}</th><th>{t("settings.resignation.noticeDays", { defaultValue: "Notice period (days)" })}</th><th /></tr></thead>
                <tbody>
                    {rows.length === 0 && <tr><td colSpan="3">{t("settings.resignation.noOverrides", { defaultValue: "No overrides. The default applies." })}</td></tr>}
                    {rows.map((row, index) => (
                        <tr key={index}>
                            <td><input list={listId} value={row.name} onChange={(event) => update(index, "name", event.target.value)} placeholder={t("hrPayroll.table.name", { defaultValue: "Name" })} /></td>
                            <td><input type="number" min="1" max="365" value={row.days} onChange={(event) => update(index, "days", event.target.value)} /></td>
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

export function ResignationNoticeSettings() {
    const { t } = useTranslation();
    const { data, message, saving, save } = useResignationSettings();
    const [editedDraft, setDraft] = useState(null);
    const [grades, setGrades] = useState([]);

    useEffect(() => {
        let ignore = false;
        api("/api/employees")
            .then((employees) => !ignore && setGrades([...new Set(employees.map((employee) => employee.grade).filter(Boolean))].sort()))
            .catch(() => {});
        return () => { ignore = true; };
    }, []);

    const draft = editedDraft || (data && {
        noticePeriodDays: String(data.settings.noticePeriodDays),
        grades: toRows(data.settings.gradeOverrides),
        types: toRows(data.settings.employmentTypeOverrides),
    });

    if (!draft) return <div className="rs-panel">{message.text ? <p className="rs-error">{message.text}</p> : t("settings.resignation.loading", { defaultValue: "Loading resignation settings..." })}</div>;

    const submit = () => save(
        {
            noticePeriodDays: Number(draft.noticePeriodDays),
            gradeOverrides: toMap(draft.grades),
            employmentTypeOverrides: toMap(draft.types),
        },
        t("settings.resignation.saved", { defaultValue: "Resignation settings saved. New resignations use this notice period." })
    );

    return (
        <div className="rs-panel">
            {message.text && <p className={message.error ? "rs-error" : "rs-success"}>{message.text}</p>}

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
                suggestions={grades}
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
