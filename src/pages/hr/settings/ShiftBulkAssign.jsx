import { useEffect, useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import DatePicker from "../../../components/layout/common/DatePicker";
import API_URL from "../../../config/api";
import { authHeaders } from "../../../utils/auth";
import { useConfirm } from "../../../components/common/dialog/dialogContext";

const request = async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: authHeaders(options.body ? { "Content-Type": "application/json" } : {}),
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data === null) {
        throw new Error(data?.message || (response.status === 404
            ? "This feature is not on the server yet. Restart the backend and try again."
            : `The server could not complete this (error ${response.status}).`));
    }
    return data;
};

const isActiveEmployee = (row) => String(row.role || "employee").toLowerCase() !== "hr"
    && String(row.status || "Active").toLowerCase() === "active";

// One shift for many employees over the same dates (Ramadan, summer)
// "1 employee" / "5 employees": English needs the singular, so the text is picked by count
const countText = (t, key, count, one, other, values = {}) =>
    t(`${key}${count === 1 ? "One" : ""}`, { ...values, count, defaultValue: count === 1 ? one : other });

function ShiftBulkAssign({ shifts, onAssigned }) {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const [employees, setEmployees] = useState(null);
    const [shiftId, setShiftId] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [department, setDepartment] = useState("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(() => new Set());
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        request("/api/employees")
            .then((rows) => setEmployees(rows.filter(isActiveEmployee).sort((a, b) => String(a.name).localeCompare(String(b.name)))))
            .catch((loadError) => {
                setEmployees([]);
                setError(loadError.message);
            });
    }, []);

    const departments = useMemo(
        () => [...new Set((employees || []).map((row) => row.department || "").filter(Boolean))].sort(),
        [employees]
    );
    const visible = (employees || []).filter((row) => {
        const query = search.trim().toLowerCase();
        return (department === "all" || (row.department || "") === department)
            && (!query || [row.name, row.employee_id].some((value) => String(value || "").toLowerCase().includes(query)));
    });
    const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(row.employee_id));

    const toggle = (id) => setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const toggleVisible = () => setSelected((current) => {
        const next = new Set(current);
        visible.forEach((row) => (allVisibleSelected ? next.delete(row.employee_id) : next.add(row.employee_id)));
        return next;
    });

    const shift = shifts.find((row) => String(row.id) === shiftId);

    const runAssign = async () => {
        setSaving(true);
        setError("");
        setResult(null);
        try {
            const data = await request("/api/shifts/bulk-assign", {
                method: "POST",
                body: { shiftId: Number(shiftId), employeeIds: [...selected], effectiveFrom: from, effectiveTo: to || null },
            });
            setResult(data);
            setSelected(new Set(data.skipped.map((row) => row.employee_id)));
            onAssigned();
        } catch (assignError) {
            setError(assignError.message);
        } finally {
            setSaving(false);
        }
    };

    const assign = async (event) => {
        event.preventDefault();
        const confirmed = await confirm({
            variant: "info",
            title: t("settings.shifts.bulk.confirmTitle", { defaultValue: "Assign Shift" }),
            message: countText(t, "settings.shifts.bulk.confirm", selected.size,
                "Assign {{name}} to {{count}} employee?", "Assign {{name}} to {{count}} employees?", { name: shift?.name }),
            confirmText: t("settings.shifts.bulk.confirmButton", { defaultValue: "Confirm" }),
            cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
        });
        if (confirmed) await runAssign();
    };

    return (
        <form className="shf-bulk" onSubmit={assign}>
            <div className="shf-bulk-head">
                <h3><Users size={17} aria-hidden="true" />{t("settings.shifts.bulk.title", { defaultValue: "Assign a shift to many employees" })}</h3>
                <p>{t("settings.shifts.bulk.hint", { defaultValue: "For Ramadan or summer: give the period an end date and everyone goes back to their own shift the next day." })}</p>
            </div>

            <div className="shf-grid">
                <label>
                    <span>{t("settings.shifts.bulk.shift", { defaultValue: "Shift" })}</span>
                    <select value={shiftId} required onChange={({ target }) => setShiftId(target.value)}>
                        <option value="">{t("employeeDetails.edit.select", { defaultValue: "Select" })}</option>
                        {shifts.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.start_time} - {row.end_time})</option>)}
                    </select>
                </label>
                <label>
                    <span>{t("employeeDetails.shift.from", { defaultValue: "Effective from" })}</span>
                    <DatePicker value={from} onChange={setFrom} />
                </label>
                <label>
                    <span>{t("employeeDetails.shift.to", { defaultValue: "Effective to (optional)" })}</span>
                    <DatePicker value={to} onChange={setTo} />
                </label>
            </div>

            <div className="shf-bulk-filters">
                <label className="shf-bulk-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                        value={search}
                        onChange={({ target }) => setSearch(target.value)}
                        placeholder={t("settings.shifts.bulk.search", { defaultValue: "Search name or ID" })}
                        aria-label={t("settings.shifts.bulk.search", { defaultValue: "Search name or ID" })}
                    />
                </label>
                <select value={department} onChange={({ target }) => setDepartment(target.value)} aria-label={t("profileEdit.fields.department", { defaultValue: "Department" })}>
                    <option value="all">{t("settings.shifts.bulk.allDepartments", { defaultValue: "All departments" })}</option>
                    {departments.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <button type="button" className="shf-btn" onClick={toggleVisible} disabled={!visible.length}>
                    {allVisibleSelected
                        ? t("settings.shifts.bulk.clearShown", { count: visible.length, defaultValue: "Unselect these {{count}}" })
                        : t("settings.shifts.bulk.selectShown", { count: visible.length, defaultValue: "Select these {{count}}" })}
                </button>
            </div>

            <div className="shf-bulk-list" role="group" aria-label={t("settings.shifts.employees", { defaultValue: "Employees" })}>
                {employees === null && <p className="shf-empty">{t("settings.page.loading", { defaultValue: "Loading..." })}</p>}
                {employees !== null && visible.length === 0 && <p className="shf-empty">{t("settings.shifts.bulk.noEmployees", { defaultValue: "No employees match." })}</p>}
                {visible.map((row) => (
                    <label key={row.employee_id} className={selected.has(row.employee_id) ? "checked" : ""}>
                        <input type="checkbox" checked={selected.has(row.employee_id)} onChange={() => toggle(row.employee_id)} />
                        <span dir="auto">{row.name}</span>
                        <small><bdi dir="ltr">{row.employee_id}</bdi>{row.department && <> · <bdi>{row.department}</bdi></>}</small>
                    </label>
                ))}
            </div>

            {error && <p className="shf-message error" role="alert">{error}</p>}
            {result && (
                <div className="shf-message" role="status">
                    <strong>{countText(t, "settings.shifts.bulk.done", result.assigned.length, "Assigned to {{count}} employee.", "Assigned to {{count}} employees.")}</strong>
                    {result.skipped.length > 0 && (
                        <>
                            <span> {t("settings.shifts.bulk.skipped", { count: result.skipped.length, defaultValue: "{{count}} skipped (still selected):" })}</span>
                            <ul>
                                {result.skipped.map((row) => (
                                    <li key={row.employee_id}><bdi>{row.name || row.employee_id}</bdi> — {row.reason}</li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            )}

            <div className="shf-actions">
                <span className="shf-bulk-count">{t("settings.shifts.bulk.selected", { count: selected.size, defaultValue: "{{count}} selected" })}</span>
                <button type="submit" className="shf-btn primary" disabled={saving || !shiftId || !from || selected.size === 0}>
                    {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("settings.shifts.bulk.assign", { defaultValue: "Assign shift" })}
                </button>
            </div>
        </form>
    );
}

export default ShiftBulkAssign;
