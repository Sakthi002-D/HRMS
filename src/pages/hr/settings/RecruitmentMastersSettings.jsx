// Settings → Recruitment Masters: Locations, Recruitment Agencies, Department Headcount Budgets
// (Budgeted Positions = NEW people HR approves per department and year, plus the annual salary budget).
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
    const actorId = getSessionEmployeeId();
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
        if (await run(() => api("/api/recruitment/locations", { method: "POST", body: { name: newLocation, actor_id: actorId } }), "Location added")) {
            setNewLocation("");
        }
    };

    const addAgency = async () => {
        if (await run(() => api("/api/recruitment/agencies", { method: "POST", body: { ...newAgency, actor_id: actorId } }), "Agency added")) {
            setNewAgency(emptyAgency);
        }
    };

    const saveBudget = async () => {
        if (await run(() => api("/api/recruitment/budgets", { method: "POST", body: { ...newBudget, actor_id: actorId } }), "Budget saved")) {
            setNewBudget((current) => ({ ...current, budgeted_positions: "", salary_budget: "" }));
        }
    };

    return (
        <div className="rs-panel">
            {message.text && <p className={message.error ? "rs-error" : "rs-success"}>{message.text}</p>}

            <section className="rs-section">
                <h3>Locations</h3>
                <p>Used by the Manpower Request "Location" dropdown. Inactive locations are hidden from new requests.</p>
                <div className="rs-add-row">
                    <input value={newLocation} onChange={(event) => setNewLocation(event.target.value)} placeholder="e.g. Doha" />
                    <button type="button" className="settings-save-button" onClick={addLocation} disabled={!newLocation.trim()}><Plus size={14} /> Add</button>
                </div>
                <div className="rs-chips">
                    {locations.map((location) => (
                        <button
                            type="button"
                            key={location.id}
                            className={location.active ? "active" : ""}
                            title={location.active ? "Click to deactivate" : "Click to activate"}
                            onClick={() => run(() => api(`/api/recruitment/locations/${location.id}`, { method: "PUT", body: { active: !location.active, actor_id: actorId } }))}
                        >
                            {location.name}{location.active ? "" : " (inactive)"}
                        </button>
                    ))}
                </div>
            </section>

            <section className="rs-section">
                <h3>Recruitment Agencies</h3>
                <div className="rs-add-row">
                    <input value={newAgency.name} onChange={(event) => setNewAgency({ ...newAgency, name: event.target.value })} placeholder="Agency name *" />
                    <input value={newAgency.contact_person} onChange={(event) => setNewAgency({ ...newAgency, contact_person: event.target.value })} placeholder="Contact person" />
                    <input type="email" value={newAgency.email} onChange={(event) => setNewAgency({ ...newAgency, email: event.target.value })} placeholder="Email" />
                    <input value={newAgency.phone} onChange={(event) => setNewAgency({ ...newAgency, phone: event.target.value })} placeholder="Phone" />
                    <button type="button" className="settings-save-button" onClick={addAgency} disabled={!newAgency.name.trim()}><Plus size={14} /> Add</button>
                </div>
                <table className="rs-table">
                    <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead>
                    <tbody>
                        {agencies.length === 0 && <tr><td colSpan="5">No agencies yet.</td></tr>}
                        {agencies.map((agency) => (
                            <tr key={agency.id}>
                                <td>{agency.name}</td>
                                <td>{agency.contact_person || "—"}</td>
                                <td>{agency.email || "—"}</td>
                                <td>{agency.phone || "—"}</td>
                                <td>
                                    <button
                                        type="button"
                                        className={`rs-toggle ${agency.active ? "on" : ""}`}
                                        onClick={() => run(() => api(`/api/recruitment/agencies/${agency.id}`, { method: "PUT", body: { active: !agency.active, actor_id: actorId } }))}
                                    >
                                        {agency.active ? "Active" : "Inactive"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section className="rs-section">
                <h3>Department Headcount Budget</h3>
                <p>
                    Budgeted Positions is the number of NEW people HR approves for the department and year; the Annual Salary Budget
                    ({currency}) is the total yearly amount for them. New Position MPRs are checked against it (existing employees aren&apos;t counted).
                    Saving an existing department + year updates it.
                </p>
                <div className="rs-add-row">
                    <select value={newBudget.department} onChange={(event) => setNewBudget({ ...newBudget, department: event.target.value })}>
                        <option value="">Department *</option>
                        {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                    </select>
                    <input type="number" min="2000" value={newBudget.year} onChange={(event) => setNewBudget({ ...newBudget, year: event.target.value })} placeholder="Year" />
                    <input type="number" min="0" step="1" value={newBudget.budgeted_positions} onChange={(event) => setNewBudget({ ...newBudget, budgeted_positions: event.target.value })} placeholder="Budgeted Positions *" aria-label="Budgeted Positions" />
                    <input type="number" min="0" step="0.01" value={newBudget.salary_budget} onChange={(event) => setNewBudget({ ...newBudget, salary_budget: event.target.value })} placeholder={`Annual Salary Budget (${currency}) *`} aria-label="Annual Salary Budget" />
                    <button type="button" className="settings-save-button" onClick={saveBudget}><Plus size={14} /> Save</button>
                </div>
                <table className="rs-table">
                    <thead><tr><th>Department</th><th>Year</th><th>Budgeted Positions</th><th>Annual Salary Budget ({currency})</th><th /></tr></thead>
                    <tbody>
                        {budgets.length === 0 && <tr><td colSpan="5">No budgets yet. Without one, a New Position MPR shows "No budget set" and needs a justification.</td></tr>}
                        {budgets.map((budget) => (
                            <tr key={budget.id}>
                                <td>{budget.department}</td>
                                <td>{budget.year}</td>
                                <td>{budget.budgeted_positions}</td>
                                <td>{formatMoney(budget.salary_budget)}</td>
                                <td>
                                    <button
                                        type="button"
                                        className="rs-icon-button"
                                        aria-label="Delete budget"
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
