import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Bell,
    ChevronDown,
    FileDown,
    Grid2X2,
    LayoutList,
    MessageSquare,
    Plus,
    Search,
    Ticket as TicketIcon,
    UserRound,
    X,
} from "lucide-react";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import API_URL from "../../config/api";
import "./Tickets.css";

const PRIORITIES = ["Low", "Medium", "High"];
const emptyForm = { subject: "", description: "", category_id: "", priority: "Medium", raised_by: "", assigned_to: "" };

const getCurrentUserId = () => {
    try {
        const raw = sessionStorage.getItem("loggedInHR") || sessionStorage.getItem("loggedInEmployee");
        const user = raw ? JSON.parse(raw) : null;
        return user?.employee_id || "";
    } catch {
        return "";
    }
};

const request = async (path, options = {}) => {
    const response = await fetch(`${API_URL}/api${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || i18n.t("recruitment.errors.requestFailed", { defaultValue: "Request failed" }));
    return data;
};

const formatUpdated = (t, value) => {
    if (!value) return "";
    const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (minutes < 1) return t("tickets.updated.justNow", { defaultValue: "just now" });
    if (minutes < 60) return t("tickets.updated.minutesAgo", { count: minutes, defaultValue: `${minutes} min ago` });
    if (minutes < 1440) {
        const hours = Math.round(minutes / 60);
        return t("tickets.updated.hoursAgo", { count: hours, defaultValue: `${hours} hours ago` });
    }
    // Invisible left-to-right marks keep the date's order inside the Arabic sentence
    return `⁦${new Date(value).toLocaleDateString()}⁩`;
};

// Status / priority / category values stay English (filters, colours, saving); only the shown text is translated
const valueKey = (value) => String(value).trim().toLowerCase().replace(/[\s&-]+/g, "_");

function Tickets() {
    const { t } = useTranslation();
    const valueLabel = (group, value) => t(`tickets.values.${group}.${valueKey(value)}`, { defaultValue: String(value) });
    const currentUserId = useMemo(getCurrentUserId, []);
    const [search, setSearch] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("all");
    const [tickets, setTickets] = useState([]);
    const [categories, setCategories] = useState([]);
    const [agents, setAgents] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [isCompact, setIsCompact] = useState(false);
    const [sortOrder, setSortOrder] = useState("recent");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const [agentForm, setAgentForm] = useState({ employee_id: "", category_id: "" });

    const loadSidebar = useCallback(async () => {
        const [categoryRows, agentRows] = await Promise.all([request("/ticket-categories"), request("/support-agents")]);
        setCategories(categoryRows);
        setAgents(agentRows);
    }, []);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [ticketRows, employeeRows] = await Promise.all([request("/tickets"), request("/employees")]);
            setTickets(ticketRows);
            setEmployees(employeeRows);
            await loadSidebar();
        } catch (loadError) {
            setError(loadError.message || i18n.t("tickets.errors.loadFailed", { defaultValue: "Unable to load tickets" }));
        } finally {
            setLoading(false);
        }
    }, [loadSidebar]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const filteredTickets = useMemo(() => {
        const query = search.toLowerCase();
        const matchingTickets = tickets.filter((ticket) => {
            const matchesSearch = [ticket.raised_by_name, ticket.assigned_to_name, ticket.ticket_code, ticket.subject]
                .some((value) => (value || "").toLowerCase().includes(query));
            const matchesStatus = selectedStatus === "all" || ticket.status === selectedStatus;
            return matchesSearch && matchesStatus;
        });

        return sortOrder === "oldest"
            ? [...matchingTickets].reverse()
            : matchingTickets;
    }, [search, selectedStatus, sortOrder, tickets]);

    const counts = {
        total: tickets.length,
        open: tickets.filter((ticket) => ticket.status === "Open").length,
        solved: tickets.filter((ticket) => ["Resolved", "Closed"].includes(ticket.status)).length,
        pending: tickets.filter((ticket) => ["On Hold", "Reopened"].includes(ticket.status)).length,
    };

    const replaceTicket = (updated) => {
        setTickets((current) => current.map((ticket) => (ticket.id === updated.id ? updated : ticket)));
    };

    const updateTicketStatus = async (ticketId, status) => {
        try {
            replaceTicket(await request(`/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify({ status }) }));
            loadSidebar();
        } catch (updateError) {
            setError(updateError.message);
        }
    };

    const openForm = () => {
        setForm({ ...emptyForm, raised_by: currentUserId });
        setFormError("");
        setShowForm(true);
    };

    const createTicket = async (event) => {
        event.preventDefault();
        if (!form.subject.trim()) return setFormError(t("tickets.errors.subjectRequired", { defaultValue: "Subject is required" }));
        if (!form.raised_by) return setFormError(t("tickets.errors.raisedByRequired", { defaultValue: "Select who raised the ticket" }));

        setSaving(true);
        setFormError("");
        try {
            const created = await request("/tickets", {
                method: "POST",
                body: JSON.stringify({ ...form, actor_id: currentUserId }),
            });
            setTickets((current) => [created, ...current]);
            setShowForm(false);
            loadSidebar();
        } catch (createError) {
            setFormError(createError.message);
        } finally {
            setSaving(false);
        }
    };

    const addAgent = async (event) => {
        event.preventDefault();
        if (!agentForm.employee_id) return;
        try {
            await request("/support-agents", { method: "POST", body: JSON.stringify(agentForm) });
            setAgentForm({ employee_id: "", category_id: "" });
            loadSidebar();
        } catch (agentError) {
            setError(agentError.message);
        }
    };

    const exportTickets = () => {
        const headers = ["Ticket ID", "Raised By", "Assigned To", "Category", "Subject", "Priority", "Status", "Updated"];
        const rows = filteredTickets.map((ticket) => [
            ticket.ticket_code,
            ticket.raised_by_name || ticket.raised_by || "",
            ticket.assigned_to_name || "",
            ticket.category_name || "",
            ticket.subject,
            ticket.priority,
            ticket.status,
            new Date(ticket.updated_at).toLocaleString(),
        ]);
        const csv = [headers, ...rows]
            .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
            .join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "tickets.csv";
        link.click();
        URL.revokeObjectURL(url);
    };

    const statCards = [
        { label: t("tickets.cards.new", { defaultValue: "New Tickets" }), value: counts.total, icon: TicketIcon, color: "orange" },
        { label: t("tickets.cards.open", { defaultValue: "Open Tickets" }), value: counts.open, icon: MessageSquare, color: "purple" },
        { label: t("tickets.cards.solved", { defaultValue: "Solved Tickets" }), value: counts.solved, icon: TicketIcon, color: "green" },
        { label: t("tickets.cards.pending", { defaultValue: "Pending Tickets" }), value: counts.pending, icon: Bell, color: "cyan" },
    ];

    const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
    const agentIds = new Set(agents.map((agent) => agent.employee_id));

    return (
        <DashboardLayout>
            <div className="tickets-page">
                <header className="tickets-header">
                    <div>
                        <h1>{t("tickets.title", { defaultValue: "Tickets" })}</h1>
                        <p>{t("tickets.subtitle", { defaultValue: "Manage employee support tickets" })}</p>
                    </div>
                    <div className="tickets-header-actions">
                        <button className={`ticket-icon-button ${!isCompact ? "active" : ""}`} aria-label={t("employeesList.listView", { defaultValue: "List view" })} onClick={() => setIsCompact(false)}><LayoutList size={16} /></button>
                        <button className="ticket-icon-button" aria-label={t("employeesList.gridView", { defaultValue: "Grid view" })} onClick={() => setIsCompact((value) => !value)}><Grid2X2 size={15} /></button>
                        <button className="ticket-export-button" onClick={exportTickets}><FileDown size={15} /> {t("employeesList.export.button", { defaultValue: "Export" })} <ChevronDown size={14} /></button>
                        <button className="add-ticket-button" onClick={openForm}><Plus size={15} /> {t("tickets.addTicket", { defaultValue: "Add Ticket" })}</button>
                    </div>
                </header>

                {error && <div className="tickets-error">{error}</div>}

                <section className="ticket-summary-grid">
                    {statCards.map(({ label, value, icon: Icon, color }) => (
                        <article className={`ticket-summary-card ${color}`} key={label}>
                            <div className="summary-icon"><Icon size={20} /></div>
                            <div className="summary-copy"><span>{label}</span><strong>{value}</strong></div>
                        </article>
                    ))}
                </section>

                <section className="ticket-list-panel">
                    <div className="ticket-list-heading">
                        <h2>{t("tickets.listTitle", { defaultValue: "Ticket List" })}</h2>
                        <div className="ticket-filters">
                            <label className="ticket-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("tickets.searchPlaceholder", { defaultValue: "Search tickets" })} /></label>
                            <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} aria-label={t("tickets.statusFilterLabel", { defaultValue: "Select status" })}>
                                <option value="all">{t("tickets.selectStatus", { defaultValue: "Select Status" })}</option>
                                {["Open", "On Hold", "Reopened", "Resolved", "Closed"].map((status) => <option key={status} value={status}>{valueLabel("status", status)}</option>)}
                            </select>
                            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label={t("tickets.sortLabel", { defaultValue: "Sort tickets" })}>
                                <option value="recent">{t("tickets.sortBy", { option: t("tickets.sort.newest", { defaultValue: "Newest" }), defaultValue: "Sort By : {{option}}" })}</option>
                                <option value="oldest">{t("tickets.sortBy", { option: t("tickets.sort.oldest", { defaultValue: "Oldest" }), defaultValue: "Sort By : {{option}}" })}</option>
                            </select>
                        </div>
                    </div>
                </section>

                <div className={`tickets-content ${isCompact ? "compact-tickets" : ""}`}>
                    <section className="ticket-list">
                        {filteredTickets.map((ticket) => (
                            <article className="ticket-row" key={ticket.id}>
                                <div className="ticket-row-header"><span className="ticket-category-label">{ticket.category_name ? valueLabel("category", ticket.category_name) : t("tickets.general", { defaultValue: "General" })}</span><span className={`priority-badge ${ticket.priority.toLowerCase()}`}>• {valueLabel("priority", ticket.priority)}</span></div>
                                <div className="ticket-row-body"><span className="ticket-number" dir="ltr">{ticket.ticket_code}</span><div className="ticket-title-line"><h3>{ticket.subject}</h3><span className={`status-badge ${ticket.status.toLowerCase().replace(" ", "-")}`}>• {valueLabel("status", ticket.status)}</span></div>
                                    {ticket.description && <p className="ticket-description">{ticket.description}</p>}
                                    <div className="ticket-meta">
                                        <span className="ticket-avatar"><UserRound size={13} /></span>
                                        <span>{t("tickets.meta.raisedBy", { name: ticket.raised_by_name || ticket.raised_by || t("tickets.meta.unknown", { defaultValue: "Unknown" }), defaultValue: "Raised by {{name}}" })}</span>
                                        <span>{t("tickets.meta.assignedTo", { name: ticket.assigned_to_name || t("tickets.meta.unassigned", { defaultValue: "Unassigned" }), defaultValue: "· Assigned to {{name}}" })}</span>
                                        <span>{t("tickets.meta.updated", { time: formatUpdated(t, ticket.updated_at), defaultValue: "▣ Updated {{time}}" })}</span>
                                        <span><MessageSquare size={13} /> {t("tickets.meta.comments", { count: Number(ticket.comment_count) || 0, defaultValue: `${ticket.comment_count} Comments` })}</span>
                                    </div></div>
                                {["Open", "Reopened"].includes(ticket.status) && <button className="ticket-action-button" onClick={() => updateTicketStatus(ticket.id, "On Hold")}>{t("tickets.actions.putOnHold", { defaultValue: "Put On Hold" })}</button>}
                                {ticket.status === "On Hold" && <button className="ticket-action-button" onClick={() => updateTicketStatus(ticket.id, "Resolved")}>{t("tickets.actions.resolve", { defaultValue: "Resolve" })}</button>}
                                {ticket.status === "Resolved" && <button className="ticket-action-button" onClick={() => updateTicketStatus(ticket.id, "Reopened")}>{t("tickets.actions.reopen", { defaultValue: "Reopen" })}</button>}
                            </article>
                        ))}
                        {!filteredTickets.length && (
                            <div className="tickets-empty">
                                {loading
                                    ? t("tickets.empty.loading", { defaultValue: "Loading tickets..." })
                                    : tickets.length
                                        ? t("tickets.empty.noMatch", { defaultValue: "No tickets match your filters." })
                                        : t("tickets.empty.none", { defaultValue: "No tickets yet. Click Add Ticket to create one." })}
                            </div>
                        )}
                    </section>

                    <aside className="ticket-sidebar">
                        <section className="ticket-side-panel">
                            <h2>{t("tickets.sidebar.categories", { defaultValue: "Ticket Categories" })}</h2>
                            {categories.length
                                ? categories.map((category) => (
                                    <div className="ticket-side-row" key={category.id}><span>{valueLabel("category", category.name)}</span><strong>{category.ticket_count}</strong></div>
                                ))
                                : <p className="ticket-side-empty">{t("tickets.sidebar.noCategories", { defaultValue: "No ticket category data available." })}</p>}
                        </section>
                        <section className="ticket-side-panel">
                            <h2>{t("tickets.sidebar.agents", { defaultValue: "Support Agents" })}</h2>
                            {agents.length
                                ? agents.map((agent) => (
                                    <div className="ticket-side-row" key={agent.id}>
                                        <span className="agent-name"><span className="agent-dot" />{agent.name}{agent.category_name ? ` · ${valueLabel("category", agent.category_name)}` : ""}</span>
                                        <strong>{agent.open_count}</strong>
                                    </div>
                                ))
                                : <p className="ticket-side-empty">{t("tickets.sidebar.noAgents", { defaultValue: "No support agent data available." })}</p>}
                            <form className="ticket-agent-form" onSubmit={addAgent}>
                                <select value={agentForm.employee_id} onChange={(event) => setAgentForm((current) => ({ ...current, employee_id: event.target.value }))} aria-label={t("tickets.sidebar.agentEmployee", { defaultValue: "Agent employee" })}>
                                    <option value="">{t("tickets.sidebar.addAgent", { defaultValue: "Add agent..." })}</option>
                                    {employees.filter((employee) => !agentIds.has(employee.employee_id)).map((employee) => (
                                        <option key={employee.employee_id} value={employee.employee_id}>{employee.name} ({employee.employee_id})</option>
                                    ))}
                                </select>
                                <select value={agentForm.category_id} onChange={(event) => setAgentForm((current) => ({ ...current, category_id: event.target.value }))} aria-label={t("tickets.sidebar.agentCategory", { defaultValue: "Agent category" })}>
                                    <option value="">{t("tickets.sidebar.allCategories", { defaultValue: "All categories" })}</option>
                                    {categories.map((category) => <option key={category.id} value={category.id}>{valueLabel("category", category.name)}</option>)}
                                </select>
                                <button type="submit" className="ticket-action-button" disabled={!agentForm.employee_id}>{t("tickets.sidebar.add", { defaultValue: "Add" })}</button>
                            </form>
                        </section>
                    </aside>
                </div>

                {showForm && (
                    <div className="ticket-modal-overlay" onClick={() => !saving && setShowForm(false)}>
                        <form className="ticket-modal" onClick={(event) => event.stopPropagation()} onSubmit={createTicket}>
                            <div className="ticket-modal-header">
                                <h2>{t("tickets.addTicket", { defaultValue: "Add Ticket" })}</h2>
                                <button type="button" className="ticket-icon-button" aria-label={t("recruitment.common.close", { defaultValue: "Close" })} onClick={() => setShowForm(false)}><X size={16} /></button>
                            </div>
                            <label>{t("tickets.form.subject", { defaultValue: "Subject" })}<input value={form.subject} onChange={setField("subject")} placeholder={t("tickets.form.subjectPlaceholder", { defaultValue: "Short summary of the issue" })} autoFocus /></label>
                            <label>{t("tickets.form.description", { defaultValue: "Description" })}<textarea value={form.description} onChange={setField("description")} rows={4} placeholder={t("tickets.form.descriptionPlaceholder", { defaultValue: "Details (optional)" })} /></label>
                            <div className="ticket-modal-grid">
                                <label>{t("tickets.form.category", { defaultValue: "Category" })}
                                    <select value={form.category_id} onChange={setField("category_id")}>
                                        <option value="">{t("tickets.general", { defaultValue: "General" })}</option>
                                        {categories.map((category) => <option key={category.id} value={category.id}>{valueLabel("category", category.name)}</option>)}
                                    </select>
                                </label>
                                <label>{t("tickets.form.priority", { defaultValue: "Priority" })}
                                    <select value={form.priority} onChange={setField("priority")}>
                                        {PRIORITIES.map((priority) => <option key={priority} value={priority}>{valueLabel("priority", priority)}</option>)}
                                    </select>
                                </label>
                                <label>{t("tickets.form.raisedBy", { defaultValue: "Raised By" })}
                                    <select value={form.raised_by} onChange={setField("raised_by")}>
                                        <option value="">{t("tickets.form.selectEmployee", { defaultValue: "Select employee" })}</option>
                                        {employees.map((employee) => <option key={employee.employee_id} value={employee.employee_id}>{employee.name} ({employee.employee_id})</option>)}
                                    </select>
                                </label>
                                <label>{t("tickets.form.assignTo", { defaultValue: "Assign To" })}
                                    <select value={form.assigned_to} onChange={setField("assigned_to")}>
                                        <option value="">{t("tickets.form.autoAssign", { defaultValue: "Auto-assign" })}</option>
                                        {agents.map((agent) => <option key={agent.employee_id} value={agent.employee_id}>{agent.name}</option>)}
                                    </select>
                                </label>
                            </div>
                            {formError && <p className="ticket-form-error">{formError}</p>}
                            <div className="ticket-modal-actions">
                                <button type="button" className="ticket-export-button" onClick={() => setShowForm(false)} disabled={saving}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
                                <button type="submit" className="add-ticket-button" disabled={saving}>{saving
                                    ? t("tickets.form.creating", { defaultValue: "Creating..." })
                                    : t("tickets.form.create", { defaultValue: "Create Ticket" })}</button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

export default Tickets;
