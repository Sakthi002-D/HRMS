// Settings → Recruitment Masters: Locations, Recruitment Agencies, Headcount Budget
// (Budgeted Positions = NEW people HR approves per year + grade + position + designation,
// plus the annual salary budget for them).
import { Fragment, useEffect, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "../../../components/common/dialog/dialogContext";
import { api, formatMoney, getCompanyCurrency, getSessionEmployeeId } from "../../../components/recruitment/recruitmentApi";
import GradePicker from "../../../components/recruitment/GradePicker";
import "../../../components/recruitment/recruitment.css";
import "./RecruitmentSettings.css";

const emptyAgency = { name: "", contact_person: "", email: "", phone: "" };
const emptyBudget = () => ({ grade: "", position: "", designation: "", year: new Date().getFullYear(), budgeted_positions: "", salary_budget: "" });

const formatCount = (value) => Number(value || 0).toLocaleString("en-US");

// Used / Budgeted: green under 80%, amber 80–100%, red over 100%
const usageTone = (used, budgeted) => {
    if (used > budgeted) return "over";
    return budgeted > 0 && used / budgeted >= 0.8 ? "near" : "ok";
};

// Server validation message → the field it belongs to (shown under that field)
const BUDGET_ERROR_FIELDS = [[/^Grade/, "grade"], [/^Position/, "position"], [/^Designation/, "designation"], [/^Year/, "year"], [/^Budgeted/, "budgeted_positions"], [/^Salary/, "salary_budget"]];

const fetchMasters = (actorId) =>
    Promise.all([
        api("/api/recruitment/locations"),
        api("/api/recruitment/agencies"),
        api("/api/recruitment/budgets"),
        api(`/api/recruitment/meta?employee_id=${encodeURIComponent(actorId || "")}`),
    ]).then(([locations, agencies, budgets, meta]) => ({ locations, agencies, budgets, meta }));

function RecruitmentMastersSettings() {
    const { t } = useTranslation();
    const actorId = getSessionEmployeeId();
    const confirm = useConfirm();
    const [locations, setLocations] = useState([]);
    const [agencies, setAgencies] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [grades, setGrades] = useState([]);
    const [currency, setCurrency] = useState("");
    const [newLocation, setNewLocation] = useState("");
    const [newAgency, setNewAgency] = useState(emptyAgency);
    const [newBudget, setNewBudget] = useState(emptyBudget);
    const [budgetErrors, setBudgetErrors] = useState({});
    const [savingBudget, setSavingBudget] = useState(false);
    const [budgetYear, setBudgetYear] = useState("all");
    const [budgetSearch, setBudgetSearch] = useState("");
    const [message, setMessage] = useState({ text: "", error: false });

    const applyMasters = (data) => {
        setLocations(data.locations);
        setAgencies(data.agencies);
        setBudgets(data.budgets);
        setGrades(data.meta.grades || []);
        setCurrency(getCompanyCurrency(data.meta.currency));
    };

    const loadAll = () => fetchMasters(actorId).then(applyMasters);

    useEffect(() => {
        let ignore = false;
        fetchMasters(actorId)
            .then((data) => {
                if (ignore) return;
                setLocations(data.locations);
                setAgencies(data.agencies);
                setBudgets(data.budgets);
                setGrades(data.meta.grades || []);
                setCurrency(getCompanyCurrency(data.meta.currency));
            })
            .catch((err) => !ignore && setMessage({ text: err.message, error: true }));
        return () => { ignore = true; };
    }, [actorId]);

    // The server blocks deleting a location / agency that is in use; show that message in the page language
    const inUseError = (err, kind, english) => {
        const match = /^"(.*)" is used by (\d+) records? \(/.exec(err?.message || "");
        return match ? new Error(t(`settings.recruitmentMasters.${kind}InUse`, { name: match[1], count: Number(match[2]), defaultValue: english })) : err;
    };

    const run = async (request, success) => {
        setMessage({ text: "", error: false });
        try {
            await request();
            await loadAll();
            if (success) setMessage({ text: success, error: false });
            return true;
        } catch (err) {
            setMessage({ text: err.message, error: true });
            return false;
        }
    };

    const addLocation = async () => {
        if (await run(() => api("/api/recruitment/locations", { method: "POST", body: { name: newLocation, actor_id: actorId } }), t("settings.recruitmentMasters.locationAdded", { defaultValue: "Location added" }))) {
            setNewLocation("");
        }
    };
        const removeLocation = async (location) => {
        setMessage({ text: "", error: false });
        const removed = await confirm({
            variant: "danger",
            title: t("settings.recruitmentMasters.removeLocationTitle", { name: `\u2068${location.name}\u2069`, defaultValue: "Remove location \"{{name}}\"?" }),
            message: t("settings.recruitmentMasters.removeLocationMessage", { defaultValue: "This location will be removed from the list. This can't be undone." }),
            cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
            confirmText: t("settings.common.remove", { defaultValue: "Remove" }),
            loadingText: t("settings.common.removing", { defaultValue: "Removing…" }),
            onConfirm: () => api(
                `/api/recruitment/locations/${location.id}?actor_id=${encodeURIComponent(actorId || "")}`,
                { method: "DELETE" }
            ).catch((err) => { throw inUseError(err, "location", '"{{name}}" is used by {{count}} records (requests or job openings), so it can\'t be deleted. Click the chip to make it inactive instead.'); }),
        });
        if (removed) {
            await loadAll();
            setMessage({ text: t("settings.recruitmentMasters.locationRemoved", { name: `\u2068${location.name}\u2069`, defaultValue: "Location \"{{name}}\" removed" }), error: false });
        }
    };

    const addAgency = async () => {
        if (await run(() => api("/api/recruitment/agencies", { method: "POST", body: { ...newAgency, actor_id: actorId } }), t("settings.recruitmentMasters.agencyAdded", { defaultValue: "Agency added" }))) {
            setNewAgency(emptyAgency);
        }
    };    const removeAgency = async (agency) => {
        setMessage({ text: "", error: false });
        const removed = await confirm({
            variant: "danger",
            title: t("settings.recruitmentMasters.deleteAgencyTitle", { name: `\u2068${agency.name}\u2069`, defaultValue: "Delete agency \"{{name}}\"?" }),
            message: t("settings.recruitmentMasters.deleteAgencyMessage", { defaultValue: "This agency will be removed from the list. This can't be undone." }),
            cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
            confirmText: t("hrPayroll.delete.confirm", { defaultValue: "Delete" }),
            loadingText: t("hrPayroll.delete.deleting", { defaultValue: "Deleting…" }),
            onConfirm: () => api(
                `/api/recruitment/agencies/${agency.id}?actor_id=${encodeURIComponent(actorId || "")}`,
                { method: "DELETE" }
            ).catch((err) => { throw inUseError(err, "agency", '"{{name}}" is used by {{count}} records (job openings or applications), so it can\'t be deleted. Set it to Inactive instead.'); }),
        });
        if (removed) {
            await loadAll();
            setMessage({ text: t("settings.recruitmentMasters.agencyDeleted", { name: `\u2068${agency.name}\u2069`, defaultValue: "Agency \"{{name}}\" deleted" }), error: false });
        }
    };

    // ---------- Headcount Budget ----------
    const setBudgetFields = (patch) => {
        setNewBudget((current) => ({ ...current, ...patch }));
        setBudgetErrors((current) => {
            const next = { ...current };
            Object.keys(patch).forEach((name) => delete next[name]);
            return next;
        });
    };

    const validateBudget = (values) => {
        const errors = {};
        const text = (key, english) => t(`settings.recruitmentMasters.errors.${key}`, { defaultValue: english });
        if (!values.grade) errors.grade = text("grade", "Choose the Grade.");
        if (!values.position) errors.position = text("position", "Choose the Position.");
        if (!values.designation) errors.designation = text("designation", "Choose the Designation.");
        if (!Number.isInteger(Number(values.year)) || Number(values.year) < 2000) errors.year = text("year", "Enter a year from 2000 onwards.");
        if (values.budgeted_positions === "" || !Number.isInteger(Number(values.budgeted_positions)) || Number(values.budgeted_positions) < 0) {
            errors.budgeted_positions = text("budgetedPositions", "Enter a whole number, 0 or more.");
        }
        if (values.salary_budget === "" || !(Number(values.salary_budget) >= 0)) errors.salary_budget = text("salaryBudget", "Enter an amount, 0 or more.");
        return errors;
    };

    const saveBudget = async () => {
        setMessage({ text: "", error: false });
        const errors = validateBudget(newBudget);
        setBudgetErrors(errors);
        if (Object.keys(errors).length) return;

        setSavingBudget(true);
        try {
            await api("/api/recruitment/budgets", { method: "POST", body: { ...newBudget, actor_id: actorId } });
            await loadAll();
            setNewBudget((current) => ({ ...current, budgeted_positions: "", salary_budget: "" }));
            setMessage({ text: t("settings.recruitmentMasters.budgetSaved", { defaultValue: "Budget saved" }), error: false });
        } catch (err) {
            const field = BUDGET_ERROR_FIELDS.find(([pattern]) => pattern.test(err.message))?.[1];
            if (field) setBudgetErrors({ [field]: err.message });
            else setMessage({ text: err.message, error: true });
        } finally {
            setSavingBudget(false);
        }
    };

    const budgetFieldError = (name) => budgetErrors[name] && <small className="mpr-field-error" role="alert">{budgetErrors[name]}</small>;

    // Filter by year + search, then group by grade in Grade Master order
    const budgetYears = [...new Set(budgets.map((line) => line.year))].sort((a, b) => b - a);
    const search = budgetSearch.trim().toLowerCase();
    const visibleBudgets = budgets.filter((line) =>
        (budgetYear === "all" || String(line.year) === budgetYear) &&
        (!search || [line.grade, line.position, line.designation].some((value) => String(value || "").toLowerCase().includes(search)))
    );
    const headers = {
        position: t("settings.recruitmentMasters.position", { defaultValue: "Position" }),
        designation: t("settings.recruitmentMasters.designation", { defaultValue: "Designation" }),
        year: t("settings.recruitmentMasters.year", { defaultValue: "Year" }),
        budgeted: t("settings.recruitmentMasters.budgeted", { defaultValue: "Budgeted" }),
        used: t("settings.recruitmentMasters.used", { defaultValue: "Used" }),
        salary: t("settings.recruitmentMasters.salaryBudgetShort", { currency, defaultValue: "Salary Budget ({{currency}})" }),
    };
    const deleteLabel = t("settings.recruitmentMasters.deleteBudgetLine", { defaultValue: "Delete budget line" });
    const gradeOrder = new Map(grades.map((grade, index) => [grade.code, index]));
    const budgetGroups = visibleBudgets
        .reduce((groups, line) => {
            let group = groups.find((item) => item.grade === line.grade);
            if (!group) {
                group = { grade: line.grade, band: grades.find((grade) => grade.code === line.grade)?.band || "", lines: [], positions: 0, salary: 0 };
                groups.push(group);
            }
            group.lines.push(line);
            group.positions += Number(line.budgeted_positions) || 0;
            group.salary += Number(line.salary_budget) || 0;
            return groups;
        }, [])
        .sort((a, b) => (gradeOrder.get(a.grade) ?? Infinity) - (gradeOrder.get(b.grade) ?? Infinity) || String(a.grade).localeCompare(String(b.grade)));

    return (
        <div className="rs-panel">
            {message.text && <p className={message.error ? "rs-error" : "rs-success"}>{message.text}</p>}

            <section className="rs-section">
                <h3>{t("settings.recruitmentMasters.locations", { defaultValue: "Locations" })}</h3>
                <p>{t("settings.recruitmentMasters.locationsHint", { defaultValue: "Used by the Manpower Request \"Location\" dropdown. Inactive locations are hidden from new requests." })}</p>
                <div className="rs-add-row">
                    <input value={newLocation} onChange={(event) => setNewLocation(event.target.value)} placeholder={t("settings.recruitmentMasters.locationPlaceholder", { defaultValue: "e.g. Doha" })} />
                    <button type="button" className="settings-save-button" onClick={addLocation} disabled={!newLocation.trim()}><Plus size={14} /> {t("settings.common.add", { defaultValue: "Add" })}</button>
                </div>
                <div className="rs-chips">
                    {locations.map((location) => (
                        <span className="rs-chip" key={location.id}>
                            <button
                                type="button"
                                className={location.active ? "active" : ""}
                                title={location.active ? t("settings.recruitmentMasters.clickToDeactivate", { defaultValue: "Click to deactivate" }) : t("settings.recruitmentMasters.clickToActivate", { defaultValue: "Click to activate" })}
                                onClick={() => run(() => api(`/api/recruitment/locations/${location.id}`, { method: "PUT", body: { active: !location.active, actor_id: actorId } }))}
                            >
                                {location.active ? location.name : t("settings.recruitmentMasters.inactiveName", { name: location.name, defaultValue: "{{name}} (inactive)" })}
                            </button>
                            <button
                                type="button"
                                className="rs-chip-remove"
                                aria-label={t("settings.recruitmentMasters.removeName", { name: location.name, defaultValue: "Remove {{name}}" })}
                                title={t("settings.common.remove", { defaultValue: "Remove" })}
                                onClick={() => removeLocation(location)}
                            >
                                <X size={11} strokeWidth={3} />
                            </button>
                        </span>
                    ))}
                </div>
            </section>

            <section className="rs-section">
                <h3>{t("settings.recruitmentMasters.agencies", { defaultValue: "Recruitment Agencies" })}</h3>
                <div className="rs-add-row">
                    <input value={newAgency.name} onChange={(event) => setNewAgency({ ...newAgency, name: event.target.value })} placeholder={t("settings.recruitmentMasters.agencyName", { defaultValue: "Agency name *" })} />
                    <input value={newAgency.contact_person} onChange={(event) => setNewAgency({ ...newAgency, contact_person: event.target.value })} placeholder={t("settings.recruitmentMasters.contactPerson", { defaultValue: "Contact person" })} />
                    <input type="email" dir="ltr" value={newAgency.email} onChange={(event) => setNewAgency({ ...newAgency, email: event.target.value })} placeholder={t("hrPayroll.table.email", { defaultValue: "Email" })} />
                    <input dir="ltr" value={newAgency.phone} onChange={(event) => setNewAgency({ ...newAgency, phone: event.target.value })} placeholder={t("hrPayroll.table.phone", { defaultValue: "Phone" })} />
                    <button type="button" className="settings-save-button" onClick={addAgency} disabled={!newAgency.name.trim()}><Plus size={14} /> {t("settings.common.add", { defaultValue: "Add" })}</button>
                </div>
                <table className="rs-table">
                    <thead><tr><th>{t("hrPayroll.table.name", { defaultValue: "Name" })}</th><th>{t("settings.recruitmentMasters.contact", { defaultValue: "Contact" })}</th><th>{t("hrPayroll.table.email", { defaultValue: "Email" })}</th><th>{t("hrPayroll.table.phone", { defaultValue: "Phone" })}</th><th>{t("reports.common.status", { defaultValue: "Status" })}</th><th /></tr></thead>
                    <tbody>
                        {agencies.length === 0 && <tr><td colSpan="6">{t("settings.recruitmentMasters.noAgencies", { defaultValue: "No agencies yet." })}</td></tr>}
                        {agencies.map((agency) => (
                            <tr key={agency.id}>
                                <td>{agency.name}</td>
                                <td>{agency.contact_person || "—"}</td>
                                <td>{agency.email ? <span dir="ltr" className="ltr-text">{agency.email}</span> : "—"}</td>
                                <td>{agency.phone ? <span dir="ltr" className="ltr-text">{agency.phone}</span> : "—"}</td>
                                <td>
                                    <button
                                        type="button"
                                        className={`rs-toggle ${agency.active ? "on" : ""}`}
                                        onClick={() => run(() => api(`/api/recruitment/agencies/${agency.id}`, { method: "PUT", body: { active: !agency.active, actor_id: actorId } }))}
                                    >
                                        {agency.active ? t("employeeProfile.values.status.active", { defaultValue: "Active" }) : t("employeeProfile.values.status.inactive", { defaultValue: "Inactive" })}
                                    </button>
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        className="rs-icon-button"
                                        aria-label={t("settings.recruitmentMasters.deleteAgencyLabel", { name: agency.name, defaultValue: "Delete agency {{name}}" })}
                                        title={t("hrPayroll.delete.confirm", { defaultValue: "Delete" })}
                                        onClick={() => removeAgency(agency)}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section className="rs-section">
                <h3>{t("settings.recruitmentMasters.budget", { defaultValue: "Headcount Budget" })}</h3>
                <p>
                    {t("settings.recruitmentMasters.budgetHint", { defaultValue: "Number of new people HR approves for each designation in a year, and the yearly salary budget for them. New Position requests are checked against the matching line." })}
                </p>

                <div className="rs-budget-form">
                    <GradePicker
                        grades={grades}
                        value={newBudget}
                        onChange={(patch) => setBudgetFields(patch)}
                        errors={budgetErrors}
                        idPrefix="budget"
                        className="rs-grade-picker"
                    />
                    <div className="rs-budget-row">
                        <div className="rs-budget-field">
                            <label htmlFor="budget-year">{t("settings.recruitmentMasters.year", { defaultValue: "Year" })} *</label>
                            <input id="budget-year" type="number" min="2000" step="1" value={newBudget.year} onChange={(event) => setBudgetFields({ year: event.target.value })} aria-invalid={Boolean(budgetErrors.year)} className={budgetErrors.year ? "is-invalid" : ""} />
                            {budgetFieldError("year")}
                        </div>
                        <div className="rs-budget-field">
                            <label htmlFor="budget-positions">{t("settings.recruitmentMasters.budgetedPositions", { defaultValue: "Budgeted Positions" })} *</label>
                            <input id="budget-positions" type="number" min="0" step="1" value={newBudget.budgeted_positions} onChange={(event) => setBudgetFields({ budgeted_positions: event.target.value })} placeholder="e.g. 4" aria-invalid={Boolean(budgetErrors.budgeted_positions)} className={budgetErrors.budgeted_positions ? "is-invalid" : ""} />
                            {budgetFieldError("budgeted_positions")}
                        </div>
                        <div className="rs-budget-field">
                            <label htmlFor="budget-salary">{t("settings.recruitmentMasters.salaryBudgetColumn", { currency, defaultValue: "Annual Salary Budget ({{currency}})" })} *</label>
                            <input id="budget-salary" type="number" min="0" step="0.01" value={newBudget.salary_budget} onChange={(event) => setBudgetFields({ salary_budget: event.target.value })} placeholder="e.g. 240000" aria-invalid={Boolean(budgetErrors.salary_budget)} className={budgetErrors.salary_budget ? "is-invalid" : ""} />
                            {budgetFieldError("salary_budget")}
                        </div>
                        <button type="button" className="settings-save-button rs-budget-save" onClick={saveBudget} disabled={savingBudget}>
                            <Plus size={14} /> {t("settings.common.save", { defaultValue: "Save" })}
                        </button>
                    </div>
                </div>

                <div className="rs-budget-filters">
                    <select value={budgetYear} onChange={(event) => setBudgetYear(event.target.value)} aria-label={t("settings.recruitmentMasters.filterYear", { defaultValue: "Filter by year" })}>
                        <option value="all">{t("settings.recruitmentMasters.allYears", { defaultValue: "All years" })}</option>
                        {budgetYears.map((year) => <option key={year} value={String(year)}>{year}</option>)}
                    </select>
                    <label className="rs-budget-search">
                        <Search size={15} aria-hidden="true" />
                        <input
                            type="search"
                            value={budgetSearch}
                            onChange={(event) => setBudgetSearch(event.target.value)}
                            placeholder={t("settings.recruitmentMasters.searchBudget", { defaultValue: "Search grade, position or designation" })}
                            aria-label={t("settings.recruitmentMasters.searchBudget", { defaultValue: "Search grade, position or designation" })}
                        />
                    </label>
                </div>

                <div className="rs-budget-scroll">
                    <table className="rs-table rs-budget-table">
                        <colgroup>
                            <col style={{ width: "20%" }} />
                            <col style={{ width: "24%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "18%" }} />
                            <col style={{ width: "14%" }} />
                            <col style={{ width: "6%" }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>{headers.position}</th>
                                <th>{headers.designation}</th>
                                <th className="rs-num">{headers.year}</th>
                                <th className="rs-num">{headers.budgeted}</th>
                                <th className="rs-num">{headers.used}</th>
                                <th className="rs-num">{headers.salary}</th>
                                <th><span className="rs-visually-hidden">{deleteLabel}</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {budgets.length === 0 && <tr><td colSpan="7">{t("settings.recruitmentMasters.noBudgets", { defaultValue: "No budget lines yet. Add the first one above." })}</td></tr>}
                            {budgets.length > 0 && budgetGroups.length === 0 && <tr><td colSpan="7">{t("settings.recruitmentMasters.noBudgetMatches", { defaultValue: "No budget lines match the filter." })}</td></tr>}
                            {budgetGroups.map((group) => (
                                <Fragment key={group.grade}>
                                    <tr className="rs-budget-group">
                                        <td colSpan="7">
                                            <div>
                                                <span className="rs-grade-badge" dir="ltr">{group.grade}</span>
                                                {group.band && <span className="rs-grade-band">{group.band}</span>}
                                                <span className="rs-grade-totals">
                                                    {t("settings.recruitmentMasters.groupTotals", {
                                                        count: group.positions,
                                                        positions: formatCount(group.positions),
                                                        salary: formatMoney(group.salary),
                                                        currency,
                                                        defaultValue: group.positions === 1 ? "{{positions}} position · {{currency}} {{salary}}" : "{{positions}} positions · {{currency}} {{salary}}",
                                                    })}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                    {group.lines.map((line) => {
                                        const budgeted = Number(line.budgeted_positions) || 0;
                                        const used = Number(line.used) || 0;
                                        const percent = budgeted > 0 ? Math.round((used / budgeted) * 100) : used > 0 ? 100 : 0;
                                        return (
                                            <tr key={line.id} className="rs-budget-line">
                                                <td className="rs-cell-position" data-label={headers.position}><span className="rs-clamp" title={line.position}>{line.position}</span></td>
                                                <td className="rs-cell-designation" data-label={headers.designation}><span className="rs-clamp" title={line.designation}>{line.designation}</span></td>
                                                <td className="rs-num" data-label={headers.year}><span dir="ltr" className="ltr-text">{line.year}</span></td>
                                                <td className="rs-num" data-label={headers.budgeted}><span dir="ltr" className="ltr-text">{formatCount(budgeted)}</span></td>
                                                <td className="rs-num rs-cell-used" data-label={headers.used}>
                                                    <div className="rs-used">
                                                        <span dir="ltr" className="ltr-text">{formatCount(used)} / {formatCount(budgeted)}</span>
                                                        <div className={`rs-usage-bar ${usageTone(used, budgeted)}`} role="img" aria-label={`${used} / ${budgeted}`}>
                                                            <span style={{ width: `${Math.min(100, percent)}%` }} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="rs-num" data-label={headers.salary}><span dir="ltr" className="ltr-text">{formatMoney(line.salary_budget)}</span></td>
                                                <td className="rs-cell-actions">
                                                    <button
                                                        type="button"
                                                        className="rs-icon-button"
                                                        aria-label={deleteLabel}
                                                        title={deleteLabel}
                                                        onClick={() => run(() => api(`/api/recruitment/budgets/${line.id}?actor_id=${encodeURIComponent(actorId || "")}`, { method: "DELETE" }))}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

export default RecruitmentMastersSettings;
