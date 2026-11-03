import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import API_URL from "../../../config/api";
import { authHeaders } from "../../../utils/auth";
import { formatAppDate } from "../../../utils/appSettings";
import useDialogFocus from "../../../components/common/dialog/useDialogFocus";
import useScrollLock from "../../../components/common/dialog/useScrollLock";

const formatDate = (value) => (value ? formatAppDate(new Date(`${value}T00:00:00`)) : "");

// Modal (the app's dialog backdrop): employees on a shift now or from a future date
function ShiftEmployeesPanel({ shift, onClose }) {
    const { t } = useTranslation();
    const panelRef = useRef(null);
    const closeRef = useRef(null);
    const titleId = useId();
    const [rows, setRows] = useState(null);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");

    useDialogFocus(true, { dialogRef: panelRef, initialFocusRef: closeRef, onEscape: onClose });
    useScrollLock(true);

    useEffect(() => {
        let ignore = false;
        fetch(`${API_URL}/api/shifts/${shift.id}/employees`, { headers: authHeaders() })
            .then(async (response) => {
                const data = await response.json().catch(() => null);
                if (!response.ok || !Array.isArray(data)) {
                    throw new Error(data?.message || (response.status === 404
                        ? t("settings.shifts.restartBackend", { defaultValue: "This feature is not on the server yet. Restart the backend and try again." })
                        : t("settings.shifts.loadFailed", { defaultValue: "Unable to load employees" })));
                }
                return data;
            })
            .then((data) => !ignore && setRows(data))
            .catch((loadError) => {
                if (ignore) return;
                setRows([]);
                setError(loadError.message);
            });
        return () => { ignore = true; };
    }, [shift.id, t]);

    const query = search.trim().toLowerCase();
    const visible = (rows || []).filter((row) => !query
        || [row.name, row.employee_id, row.department].some((value) => String(value || "").toLowerCase().includes(query)));

    return createPortal(
        <div className="app-alert-overlay" role="presentation" onClick={onClose}>
            <aside
                ref={panelRef}
                className="shf-drawer shf-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
            >
                <header className="shf-drawer-head">
                    <div>
                        <span>{t("settings.shifts.employeesOn", { defaultValue: "Employees on this shift" })}</span>
                        <h2 id={titleId} dir="auto">{shift.name}</h2>
                        <p dir="ltr">{shift.start_time} - {shift.end_time}</p>
                    </div>
                    <button ref={closeRef} type="button" onClick={onClose} aria-label={t("settings.shifts.close", { defaultValue: "Close" })}>
                        <X size={18} />
                    </button>
                </header>

                <label className="shf-drawer-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                        value={search}
                        onChange={({ target }) => setSearch(target.value)}
                        placeholder={t("settings.shifts.bulk.search", { defaultValue: "Search name or ID" })}
                        aria-label={t("settings.shifts.bulk.search", { defaultValue: "Search name or ID" })}
                    />
                </label>

                <div className="shf-drawer-body">
                    {rows === null && <p className="shf-drawer-empty">{t("settings.page.loading", { defaultValue: "Loading..." })}</p>}
                    {error && <p className="shf-drawer-empty error" role="alert">{error}</p>}
                    {rows !== null && !error && visible.length === 0 && (
                        <p className="shf-drawer-empty">
                            {rows.length
                                ? t("settings.shifts.bulk.noEmployees", { defaultValue: "No employees match." })
                                : t("settings.shifts.noneOnShift", { defaultValue: "No one is assigned to this shift." })}
                        </p>
                    )}
                    <ul className="shf-drawer-list">
                        {visible.map((row) => (
                            <li key={row.id}>
                                <div className="shf-drawer-person">
                                    <strong dir="auto">{row.name}</strong>
                                    <small><bdi dir="ltr">{row.employee_id}</bdi>{row.department && <> · <bdi>{row.department}</bdi></>}</small>
                                </div>
                                <div className="shf-drawer-dates" dir="ltr">
                                    <CalendarDays size={14} aria-hidden="true" />
                                    {formatDate(row.effective_from)} → {row.effective_to ? formatDate(row.effective_to) : t("employeeDetails.shift.ongoing", { defaultValue: "Ongoing" })}
                                </div>
                                {!row.is_current && <span className="shf-drawer-tag">{t("settings.shifts.upcoming", { defaultValue: "Upcoming" })}</span>}
                            </li>
                        ))}
                    </ul>
                </div>

                {rows?.length > 0 && (
                    <footer className="shf-drawer-foot">
                        {t(rows.length === 1 ? "settings.shifts.countOne" : "settings.shifts.count", {
                            count: rows.length,
                            defaultValue: rows.length === 1 ? "{{count}} employee" : "{{count}} employees",
                        })}
                    </footer>
                )}
            </aside>
        </div>,
        document.body
    );
}

export default ShiftEmployeesPanel;
