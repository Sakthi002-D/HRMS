import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock3, Trash2 } from "lucide-react";
import DatePicker from "../../components/layout/common/DatePicker";
import API_URL from "../../config/api";
import { authHeaders } from "../../utils/auth";
import { useConfirm } from "../../components/common/dialog/dialogContext";
import { formatHours, shiftTypeLabel, shiftWorkMinutes } from "./settings/shiftUtils";

const todayKey = () => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
};

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

// HR view: the employee's shift today, their shift history, and assigning a shift for a period
function EmployeeShiftPanel({ employeeId, formatDate }) {
    const { t } = useTranslation();
    const [shifts, setShifts] = useState([]);
    const [assignments, setAssignments] = useState(null);
    const [form, setForm] = useState({ shift_id: "", effective_from: todayKey(), effective_to: "" });
    const [message, setMessage] = useState({ text: "", error: false });
    const [saving, setSaving] = useState(false);
    const confirm = useConfirm();

    useEffect(() => {
        let ignore = false;
        Promise.all([request("/api/shifts"), request(`/api/employees/${encodeURIComponent(employeeId)}/shifts`)])
            .then(([shiftList, assigned]) => {
                if (ignore) return;
                setShifts(shiftList);
                setAssignments(assigned);
            })
            .catch((error) => {
                if (ignore) return;
                setAssignments([]);
                setMessage({ text: error.message, error: true });
            });
        return () => { ignore = true; };
    }, [employeeId]);

    const today = todayKey();
    const current = assignments?.find((row) => row.effective_from <= today && (!row.effective_to || row.effective_to >= today));

    const assign = async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage({ text: "", error: false });
        try {
            const updated = await request(`/api/employees/${encodeURIComponent(employeeId)}/shifts`, {
                method: "POST",
                body: { shift_id: Number(form.shift_id), effective_from: form.effective_from, effective_to: form.effective_to || null },
            });
            setAssignments(updated);
            setForm((value) => ({ ...value, shift_id: "", effective_to: "" }));
            setMessage({ text: t("employeeDetails.shift.assigned", { defaultValue: "Shift assigned" }), error: false });
        } catch (error) {
            setMessage({ text: error.message, error: true });
        } finally {
            setSaving(false);
        }
    };

    const remove = async (row) => {
        const confirmed = await confirm({
            variant: "danger",
            title: t("employeeDetails.shift.removeTitle", { defaultValue: "Remove Shift" }),
            message: t("employeeDetails.shift.confirmRemove", { name: row.name, defaultValue: "Remove the {{name}} shift from this employee?" }),
            confirmText: t("employeeDetails.shift.removeButton", { defaultValue: "Remove" }),
            cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
        });
        if (!confirmed) return;
        setMessage({ text: "", error: false });
        try {
            setAssignments(await request(`/api/employees/${encodeURIComponent(employeeId)}/shifts/${row.id}`, { method: "DELETE" }));
        } catch (error) {
            setMessage({ text: error.message, error: true });
        }
    };

    return (
        <section className="detail-panel open esp-panel">
            <header>
                <i className="epf-panel-icon" aria-hidden="true"><Clock3 size={18} /></i>
                <h2>{t("employeeDetails.shift.title", { defaultValue: "Shift" })}</h2>
            </header>
            <div className="esp-body">
                <div className="esp-current">
                    <span>{t("employeeDetails.shift.today", { defaultValue: "Shift today" })}</span>
                    {current ? (
                        <strong>
                            <bdi>{current.name}</bdi> · <bdi dir="ltr">{current.start_time} - {current.end_time}</bdi>
                            <small> · {formatHours(shiftWorkMinutes(current))} {t("employeeDetails.shift.work", { defaultValue: "work" })}</small>
                        </strong>
                    ) : (
                        <strong>{t("employeeDetails.shift.default", { defaultValue: "Not assigned — the Standard shift is used" })}</strong>
                    )}
                </div>

                {message.text && <p className={message.error ? "esp-message error" : "esp-message"} role={message.error ? "alert" : "status"}>{message.text}</p>}

                <form className="esp-form" onSubmit={assign}>
                    <label>
                        <span>{t("employeeDetails.shift.shift", { defaultValue: "Shift" })}</span>
                        <select value={form.shift_id} required onChange={({ target }) => setForm((value) => ({ ...value, shift_id: target.value }))}>
                            <option value="">{t("employeeDetails.edit.select", { defaultValue: "Select" })}</option>
                            {shifts.map((shift) => (
                                <option key={shift.id} value={shift.id}>{shift.name} ({shift.start_time} - {shift.end_time})</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span>{t("employeeDetails.shift.from", { defaultValue: "Effective from" })}</span>
                        <DatePicker value={form.effective_from} onChange={(value) => setForm((current) => ({ ...current, effective_from: value }))} />
                    </label>
                    <label>
                        <span>{t("employeeDetails.shift.to", { defaultValue: "Effective to (optional)" })}</span>
                        <DatePicker value={form.effective_to} onChange={(value) => setForm((current) => ({ ...current, effective_to: value }))} />
                    </label>
                    <button type="submit" className="epf-primary esp-assign" disabled={saving || !form.shift_id || !form.effective_from}>
                        {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("employeeDetails.shift.assign", { defaultValue: "Assign shift" })}
                    </button>
                </form>
                <p className="esp-hint">{t("employeeDetails.shift.hint", { defaultValue: "A new shift with no end date replaces the current one from its start date." })}</p>

                {assignments?.length > 0 && (
                    <ul className="esp-history">
                        {assignments.map((row) => (
                            <li key={row.id} className={row === current ? "current" : ""}>
                                <div>
                                    <strong><bdi>{row.name}</bdi> <span>{shiftTypeLabel(t, row.shift_type)}</span></strong>
                                    <small dir="ltr">{row.start_time} - {row.end_time}</small>
                                </div>
                                <div className="esp-dates" dir="ltr">
                                    {formatDate(row.effective_from)} → {row.effective_to ? formatDate(row.effective_to) : t("employeeDetails.shift.ongoing", { defaultValue: "Ongoing" })}
                                </div>
                                <button type="button" onClick={() => remove(row)} aria-label={t("employeeProfile.delete", { defaultValue: "Delete" })}>
                                    <Trash2 size={15} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

export default EmployeeShiftPanel;
