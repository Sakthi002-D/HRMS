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
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
};

const formatUpdated = (value) => {
    if (!value) return "";
    const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} hours ago`;
    return new Date(value).toLocaleDateString();
};

function Tickets() {
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
            setError(loadError.message || "Unable to load tickets");
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
        if (!form.subject.trim()) return setFormError("Subject is required");
        if (!form.raised_by) return setFormError("Select who raised the ticket");

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
        { label: "New Tickets", value: counts.total, icon: TicketIcon, color: "orange" },
        { label: "Open Tickets", value: counts.open, icon: MessageSquare, color: "purple" },
        { label: "Solved Tickets", value: counts.solved, icon: TicketIcon, color: "green" },
        { label: "Pending Tickets", value: counts.pending, icon: Bell, color: "cyan" },
    ];

    const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
    const agentIds = new Set(agents.map((agent) => agent.employee_id));

    return (
        <DashboardLayout>
            <div className="tickets-page">
                <header className="tickets-header">
                    <div>
                        <h1>Tickets</h1>
                        <p>Manage employee support tickets</p>
                    </div>
                    <div className="tickets-header-actions">
                        <button className={`ticket-icon-button ${!isCompact ? "active" : ""}`} aria-label="List view" onClick={() => setIsCompact(false)}><LayoutList size={16} /></button>
                        <button className="ticket-icon-button" aria-label="Grid view" onClick={() => setIsCompact((value) => !value)}><Grid2X2 size={15} /></button>
                        <button className="ticket-export-button" onClick={exportTickets}><FileDown size={15} /> Export <ChevronDown size={14} /></button>
                        <button className="add-ticket-button" onClick={openForm}><Plus size={15} /> Add Ticket</button>
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
                        <h2>Ticket List</h2>
                        <div className="ticket-filters">
                            <label className="ticket-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets" /></label>
                            <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} aria-label="Select status">
                                <option value="all">Select Status</option><option>Open</option><option>On Hold</option><option>Reopened</option><option>Resolved</option><option>Closed</option>
                            </select>
                            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Sort tickets"><option value="recent">Sort By : Newest</option><option value="oldest">Sort By : Oldest</option></select>
                        </div>
                    </div>
                </section>

                <div className={`tickets-content ${isCompact ? "compact-tickets" : ""}`}>
                    <section className="ticket-list">
                        {filteredTickets.map((ticket) => (
                            <article className="ticket-row" key={ticket.id}>
                                <div className="ticket-row-header"><span className="ticket-category-label">{ticket.category_name || "General"}</span><span className={`priority-badge ${ticket.priority.toLowerCase()}`}>• {ticket.priority}</span></div>
                                <div className="ticket-row-body"><span className="ticket-number">{ticket.ticket_code}</span><div className="ticket-title-line"><h3>{ticket.subject}</h3><span className={`status-badge ${ticket.status.toLowerCase().replace(" ", "-")}`}>• {ticket.status}</span></div>
                                    {ticket.description && <p className="ticket-description">{ticket.description}</p>}
                                    <div className="ticket-meta"><span className="ticket-avatar"><UserRound size={13} /></span><span>Raised by {ticket.raised_by_name || ticket.raised_by || "Unknown"}</span><span>· Assigned to {ticket.assigned_to_name || "Unassigned"}</span><span>▣ Updated {formatUpdated(ticket.updated_at)}</span><span><MessageSquare size={13} /> {ticket.comment_count} Comments</span></div></div>
                                {["Open", "Reopened"].includes(ticket.status) && <button className="ticket-action-button" onClick={() => updateTicketStatus(ticket.id, "On Hold")}>Put On Hold</button>}
                                {ticket.status === "On Hold" && <button className="ticket-action-button" onClick={() => updateTicketStatus(ticket.id, "Resolved")}>Resolve</button>}
                                {ticket.status === "Resolved" && <button className="ticket-action-button" onClick={() => updateTicketStatus(ticket.id, "Reopened")}>Reopen</button>}
                            </article>
                        ))}
                        {!filteredTickets.length && (
                            <div className="tickets-empty">
                                {loading ? "Loading tickets..." : tickets.length ? "No tickets match your filters." : "No tickets yet. Click Add Ticket to create one."}
                            </div>
                        )}
                    </section>

                    <aside className="ticket-sidebar">
                        <section className="ticket-side-panel">
                            <h2>Ticket Categories</h2>
                            {categories.length
                                ? categories.map((category) => (
                                    <div className="ticket-side-row" key={category.id}><span>{category.name}</span><strong>{category.ticket_count}</strong></div>
                                ))
                                : <p className="ticket-side-empty">No ticket category data available.</p>}
                        </section>
                        <section className="ticket-side-panel">
                            <h2>Support Agents</h2>
                            {agents.length
                                ? agents.map((agent) => (
                                    <div className="ticket-side-row" key={agent.id}>
                                        <span className="agent-name"><span className="agent-dot" />{agent.name}{agent.category_name ? ` · ${agent.category_name}` : ""}</span>
                                        <strong>{agent.open_count}</strong>
                                    </div>
                                ))
                                : <p className="ticket-side-empty">No support agent data available.</p>}
                            <form className="ticket-agent-form" onSubmit={addAgent}>
                                <select value={agentForm.employee_id} onChange={(event) => setAgentForm((current) => ({ ...current, employee_id: event.target.value }))} aria-label="Agent employee">
                                    <option value="">Add agent...</option>
                                    {employees.filter((employee) => !agentIds.has(employee.employee_id)).map((employee) => (
                                        <option key={employee.employee_id} value={employee.employee_id}>{employee.name} ({employee.employee_id})</option>
                                    ))}
                                </select>
                                <select value={agentForm.category_id} onChange={(event) => setAgentForm((current) => ({ ...current, category_id: event.target.value }))} aria-label="Agent category">
                                    <option value="">All categories</option>
                                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                                </select>
                                <button type="submit" className="ticket-action-button" disabled={!agentForm.employee_id}>Add</button>
                            </form>
                        </section>
                    </aside>
                </div>

                {showForm && (
                    <div className="ticket-modal-overlay" onClick={() => !saving && setShowForm(false)}>
                        <form className="ticket-modal" onClick={(event) => event.stopPropagation()} onSubmit={createTicket}>
                            <div className="ticket-modal-header">
                                <h2>Add Ticket</h2>
                                <button type="button" className="ticket-icon-button" aria-label="Close" onClick={() => setShowForm(false)}><X size={16} /></button>
                            </div>
                            <label>Subject<input value={form.subject} onChange={setField("subject")} placeholder="Short summary of the issue" autoFocus /></label>
                            <label>Description<textarea value={form.description} onChange={setField("description")} rows={4} placeholder="Details (optional)" /></label>
                            <div className="ticket-modal-grid">
                                <label>Category
                                    <select value={form.category_id} onChange={setField("category_id")}>
                                        <option value="">General</option>
                                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                                    </select>
                                </label>
                                <label>Priority
                                    <select value={form.priority} onChange={setField("priority")}>
                                        {PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
                                    </select>
                                </label>
                                <label>Raised By
                                    <select value={form.raised_by} onChange={setField("raised_by")}>
                                        <option value="">Select employee</option>
                                        {employees.map((employee) => <option key={employee.employee_id} value={employee.employee_id}>{employee.name} ({employee.employee_id})</option>)}
                                    </select>
                                </label>
                                <label>Assign To
                                    <select value={form.assigned_to} onChange={setField("assigned_to")}>
                                        <option value="">Auto-assign</option>
                                        {agents.map((agent) => <option key={agent.employee_id} value={agent.employee_id}>{agent.name}</option>)}
                                    </select>
                                </label>
                            </div>
                            {formError && <p className="ticket-form-error">{formError}</p>}
                            <div className="ticket-modal-actions">
                                <button type="button" className="ticket-export-button" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
                                <button type="submit" className="add-ticket-button" disabled={saving}>{saving ? "Creating..." : "Create Ticket"}</button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

export default Tickets;
