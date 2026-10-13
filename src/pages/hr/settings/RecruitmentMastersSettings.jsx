// Settings → Recruitment Masters: Locations, Recruitment Agencies, Department Headcount Budgets
// (Budgeted Positions = NEW people HR approves per department and year, plus the annual salary budget).
import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "../../../components/common/dialog/dialogContext";
import { api, formatMoney, getCompanyCurrency, getSessionEmployeeId } from "../../../components/recruitment/recruitmentApi";
import "./RecruitmentSettings.css";

const emptyAgency = { name: "", contact_person: "", email: "", phone: "" };

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
    const [departments, setDepartments] = useState([]);
    const [currency, setCurrency] = useState("");
    const [newLocation, setNewLocation] = useState("");
    const [newAgency, setNewAgency] = useState(emptyAgency);
    const [newBudget, setNewBudget] = useState({ department: "", year: new Date().getFullYear(), budgeted_positions: "", salary_budget: "" });
    const [message, setMessage] = useState({ text: "", error: false });

    const applyMasters = (data) => {
        setLocations(data.locations);
        setAgencies(data.agencies);
        setBudgets(data.budgets);
        setDepartments(data.meta.departments);
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
                setDepartments(data.meta.departments);
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

    const saveBudget = async () => {
        if (await run(() => api("/api/recruitment/budgets", { method: "POST", body: { ...newBudget, actor_id: actorId } }), t("settings.recruitmentMasters.budgetSaved", { defaultValue: "Budget saved" }))) {
            setNewBudget((current) => ({ ...current, budgeted_positions: "", salary_budget: "" }));
        }
    };

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
                <h3>{t("settings.recruitmentMasters.budget", { defaultValue: "Department Headcount Budget" })}</h3>
                <p>
                    {t("settings.recruitmentMasters.budgetHint", { currency, defaultValue: "Budgeted Positions is the number of NEW people HR approves for the department and year; the Annual Salary Budget ({{currency}}) is the total yearly amount for them. New Position MPRs are checked against it (existing employees aren't counted). Saving an existing department + year updates it." })}
                </p>
                <div className="rs-add-row">
                    <select value={newBudget.department} onChange={(event) => setNewBudget({ ...newBudget, department: event.target.value })}>
                        <option value="">{t("settings.recruitmentMasters.departmentRequired", { defaultValue: "Department *" })}</option>
                        {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                    </select>
                    <input type="number" min="2000" value={newBudget.year} onChange={(event) => setNewBudget({ ...newBudget, year: event.target.value })} placeholder={t("settings.recruitmentMasters.year", { defaultValue: "Year" })} />
                    <input type="number" min="0" step="1" value={newBudget.budgeted_positions} onChange={(event) => setNewBudget({ ...newBudget, budgeted_positions: event.target.value })} placeholder={t("settings.recruitmentMasters.budgetedPositionsRequired", { defaultValue: "Budgeted Positions *" })} aria-label={t("settings.recruitmentMasters.budgetedPositions", { defaultValue: "Budgeted Positions" })} />
                    <input type="number" min="0" step="0.01" value={newBudget.salary_budget} onChange={(event) => setNewBudget({ ...newBudget, salary_budget: event.target.value })} placeholder={t("settings.recruitmentMasters.salaryBudgetRequired", { currency, defaultValue: "Annual Salary Budget ({{currency}}) *" })} aria-label={t("settings.recruitmentMasters.salaryBudget", { defaultValue: "Annual Salary Budget" })} />
                    <button type="button" className="settings-save-button" onClick={saveBudget}><Plus size={14} /> {t("settings.common.save", { defaultValue: "Save" })}</button>
                </div>
                <table className="rs-table">
                    <thead><tr><th>{t("reports.common.department", { defaultValue: "Department" })}</th><th>{t("settings.recruitmentMasters.year", { defaultValue: "Year" })}</th><th>{t("settings.recruitmentMasters.budgetedPositions", { defaultValue: "Budgeted Positions" })}</th><th>{t("settings.recruitmentMasters.salaryBudgetColumn", { currency, defaultValue: "Annual Salary Budget ({{currency}})" })}</th><th /></tr></thead>
                    <tbody>
                        {budgets.length === 0 && <tr><td colSpan="5">{t("settings.recruitmentMasters.noBudgets", { defaultValue: "No budgets yet. Without one, a New Position MPR shows \"No budget set\" and needs a justification." })}</td></tr>}
                        {budgets.map((budget) => (
                            <tr key={budget.id}>
                                <td>{budget.department}</td>
                                <td>{budget.year}</td>
                                <td>{budget.budgeted_positions}</td>
                                <td><span dir="ltr" className="ltr-text">{formatMoney(budget.salary_budget)}</span></td>
                                <td>
                                    <button
                                        type="button"
                                        className="rs-icon-button"
                                        aria-label={t("settings.recruitmentMasters.deleteBudget", { defaultValue: "Delete budget" })}
                                        onClick={() => run(() => api(`/api/recruitment/budgets/${budget.id}?actor_id=${encodeURIComponent(actorId || "")}`, { method: "DELETE" }))}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}

export default RecruitmentMastersSettings;
