import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import API_URL from "../../../config/api";
import { authHeaders } from "../../../utils/auth";
import { SHIFT_TYPES, formatHours, shiftSpanMinutes, shiftTypeLabel, shiftWorkMinutes } from "./shiftUtils";
import ShiftBulkAssign from "./ShiftBulkAssign";
import { useConfirm } from "../../../components/common/dialog/dialogContext";
import ShiftEmployeesPanel from "./ShiftEmployeesPanel";
import "./ShiftSettings.css";

const RAMADAN_LENGTHS = [240, 270, 300];
const EMPTY_FORM = { name: "", shift_type: "standard", start_time: "08:00", end_time: "17:00", break_minutes: "30", duration_minutes: "300" };

const request = async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: authHeaders(options.body ? { "Content-Type": "application/json" } : {}),
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
};

function ShiftSettings() {
    const { t } = useTranslation();
    const [shifts, setShifts] = useState(null);
    const [form, setForm] = useState(null);
    const [message, setMessage] = useState({ text: "", error: false });
    const [saving, setSaving] = useState(false);
    const [viewingShift, setViewingShift] = useState(null);
    const confirm = useConfirm();

    const load = () => request("/api/shifts")
        .then(setShifts)
        .catch((error) => {
            setShifts([]);
            setMessage({ text: error.message, error: true });
        });

    useEffect(() => {
        load();
    }, []);

    const setField = (name, value) => setForm((current) => ({ ...current, [name]: value }));
    const isRamadan = form?.shift_type === "ramadan";

    const startEdit = (shift) => {
        setForm({ ...shift, break_minutes: String(shift.break_minutes), duration_minutes: String(shiftSpanMinutes(shift)) });
        setMessage({ text: "", error: false });
    };

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage({ text: "", error: false });
        try {
            const body = { ...form, duration_minutes: isRamadan ? Number(form.duration_minutes) : undefined };
            await request(form.id ? `/api/shifts/${form.id}` : "/api/shifts", { method: form.id ? "PUT" : "POST", body });
            setForm(null);
            setMessage({ text: t("settings.shifts.saved", { defaultValue: "Shift saved" }), error: false });
            await load();
        } catch (error) {
            setMessage({ text: error.message, error: true });
        } finally {
            setSaving(false);
        }
    };

    const remove = async (shift) => {
        const confirmed = await confirm({
            variant: "danger",
            title: t("settings.shifts.deleteTitle", { defaultValue: "Delete Shift" }),
            message: t("settings.shifts.confirmDelete", { name: shift.name, defaultValue: "Delete the {{name}} shift?" }),
            confirmText: t("settings.shifts.deleteButton", { defaultValue: "Delete" }),
            cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
        });
        if (!confirmed) return;
        setMessage({ text: "", error: false });
        try {
            await request(`/api/shifts/${shift.id}`, { method: "DELETE" });
            await load();
        } catch (error) {
            setMessage({ text: error.message, error: true });
        }
    };

    return (
        <div className="shf-panel">
            {message.text && <p className={message.error ? "shf-message error" : "shf-message"} role={message.error ? "alert" : "status"}>{message.text}</p>}

            {form ? (
                <form className="shf-form" onSubmit={save}>
                    <h3>{form.id ? t("settings.shifts.edit", { defaultValue: "Edit shift" }) : t("settings.shifts.add", { defaultValue: "Add shift" })}</h3>
                    <div className="shf-grid">
                        <label>
                            <span>{t("settings.shifts.name", { defaultValue: "Name" })}</span>
                            <input value={form.name} dir="auto" maxLength={80} required onChange={({ target }) => setField("name", target.value)} />
                        </label>
                        <label>
                            <span>{t("settings.shifts.type", { defaultValue: "Type" })}</span>
                            <select value={form.shift_type} onChange={({ target }) => setField("shift_type", target.value)}>
                                {SHIFT_TYPES.map((type) => <option key={type} value={type}>{shiftTypeLabel(t, type)}</option>)}
                            </select>
                        </label>
                        <label>
                            <span>{t("settings.shifts.start", { defaultValue: "Start time" })}</span>
                            <input type="time" value={form.start_time} required onChange={({ target }) => setField("start_time", target.value)} />
                        </label>
                        {isRamadan ? (
                            <label>
                                <span>{t("settings.shifts.length", { defaultValue: "Length" })}</span>
                                <select value={form.duration_minutes} onChange={({ target }) => setField("duration_minutes", target.value)}>
                                    {RAMADAN_LENGTHS.map((minutes) => <option key={minutes} value={minutes}>{formatHours(minutes)}</option>)}
                                </select>
                            </label>
                        ) : (
                            <label>
                                <span>{t("settings.shifts.end", { defaultValue: "End time" })}</span>
                                <input type="time" value={form.end_time} required onChange={({ target }) => setField("end_time", target.value)} />
                            </label>
                        )}
                        <label>
                            <span>{t("settings.shifts.break", { defaultValue: "Unpaid break (minutes)" })}</span>
                            <input type="number" min="0" max="240" step="5" value={form.break_minutes} onChange={({ target }) => setField("break_minutes", target.value)} />
                        </label>
                    </div>
                    <p className="shf-hint">
                        {isRamadan
                            ? t("settings.shifts.ramadanHint", { defaultValue: "Ramadan shifts are a start time plus 4 to 5 hours." })
                            : t("settings.shifts.overnightHint", { defaultValue: "An end time before the start time means the shift ends the next day." })}
                    </p>
                    <div className="shf-actions">
                        <button type="button" className="shf-btn" onClick={() => setForm(null)}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
                        <button type="submit" className="shf-btn primary" disabled={saving}>
                            {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("profileEdit.save", { defaultValue: "Save Changes" })}
                        </button>
                    </div>
                </form>
            ) : (
                <button type="button" className="shf-btn primary shf-add" onClick={() => { setForm(EMPTY_FORM); setMessage({ text: "", error: false }); }}>
                    <Plus size={16} aria-hidden="true" />
                    {t("settings.shifts.add", { defaultValue: "Add shift" })}
                </button>
            )}

            {shifts === null ? (
                <p className="shf-empty">{t("settings.page.loading", { defaultValue: "Loading..." })}</p>
            ) : shifts.length === 0 ? (
                <p className="shf-empty">{t("settings.shifts.none", { defaultValue: "No shifts yet. Run the shift migration, then add your shifts." })}</p>
            ) : (
                <div className="shf-list">
                    {shifts.map((shift) => (
                        <article key={shift.id} className={`shf-item shf-${shift.shift_type}`}>
                            <div className="shf-item-main">
                                <strong dir="auto">{shift.name}</strong>
                                <span className="shf-type">{shiftTypeLabel(t, shift.shift_type)}</span>
                            </div>
                            <dl>
                                <div><dt>{t("settings.shifts.time", { defaultValue: "Time" })}</dt><dd dir="ltr">{shift.start_time} - {shift.end_time}</dd></div>
                                <div><dt>{t("settings.shifts.breakShort", { defaultValue: "Break" })}</dt><dd>{shift.break_minutes} {t("settings.shifts.minutes", { defaultValue: "min" })}</dd></div>
                                <div><dt>{t("settings.shifts.work", { defaultValue: "Work" })}</dt><dd dir="ltr">{formatHours(shiftWorkMinutes(shift))}</dd></div>
                                <div><dt>{t("settings.shifts.employees", { defaultValue: "Employees" })}</dt><dd>
                                    <button
                                        type="button"
                                        className="shf-count"
                                        onClick={() => setViewingShift(shift)}
                                        aria-label={t("settings.shifts.viewEmployees", { name: shift.name, defaultValue: "See employees on {{name}}" })}
                                    >
                                        {shift.assigned_employees}
                                    </button>
                                </dd></div>
                            </dl>
                            <div className="shf-item-actions">
                                <button type="button" onClick={() => startEdit(shift)} aria-label={t("settings.shifts.edit", { defaultValue: "Edit shift" })}><Pencil size={15} /></button>
                                <button type="button" className="danger" onClick={() => remove(shift)} aria-label={t("employeeProfile.delete", { defaultValue: "Delete" })}><Trash2 size={15} /></button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
            {shifts?.length > 0 && <ShiftBulkAssign shifts={shifts} onAssigned={load} />}
            {viewingShift && <ShiftEmployeesPanel shift={viewingShift} onClose={() => setViewingShift(null)} />}
        </div>
    );
}

export default ShiftSettings;
