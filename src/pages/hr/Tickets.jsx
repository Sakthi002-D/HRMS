import { useMemo, useState } from "react";
import {
    Bell,
    ChevronDown,
    FileDown,
    Grid2X2,
    LayoutList,
    MessageSquare,
    Search,
    Ticket as TicketIcon,
    UserRound,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Tickets.css";

const initialTickets = [];

function Tickets() {
    const [search, setSearch] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("all");
    const [tickets, setTickets] = useState(initialTickets);
    const [isCompact, setIsCompact] = useState(false);
    const [sortOrder, setSortOrder] = useState("recent");

    const filteredTickets = useMemo(() => {
        const query = search.toLowerCase();
        const matchingTickets = tickets.filter((ticket) => {
            const matchesSearch = [ticket.employeeName, ticket.ticketID, ticket.subject]
                .some((value) => value.toLowerCase().includes(query));
            const matchesStatus = selectedStatus === "all" || ticket.status === selectedStatus;
            return matchesSearch && matchesStatus;
        });

        return sortOrder === "oldest"
            ? matchingTickets.reverse()
            : matchingTickets;
    }, [search, selectedStatus, sortOrder, tickets]);

    const counts = {
        total: tickets.length,
        open: tickets.filter((ticket) => ticket.status === "Open").length,
        solved: tickets.filter((ticket) => ticket.status === "Resolved").length,
        pending: tickets.filter((ticket) => ["On Hold", "Reopened"].includes(ticket.status)).length,
    };

    const updateTicketStatus = (ticketID, status) => {
        setTickets((current) => current.map((ticket) => (
            ticket.ticketID === ticketID ? { ...ticket, status } : ticket
        )));
    };

    const exportTickets = () => {
        const headers = ["Ticket ID", "Employee", "Subject", "Priority", "Status", "Updated"];
        const rows = filteredTickets.map((ticket) => [
            ticket.ticketID,
            ticket.employeeName,
            ticket.subject,
            ticket.priority,
            ticket.status,
            ticket.updated,
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
                    </div>
                </header>

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
                                <option value="all">Select Status</option><option>Open</option><option>On Hold</option><option>Reopened</option><option>Resolved</option>
                            </select>
                            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Sort tickets"><option value="recent">Sort By : Newest</option><option value="oldest">Sort By : Oldest</option></select>
                        </div>
                    </div>
                </section>

                <div className={`tickets-content ${isCompact ? "compact-tickets" : ""}`}>
                    <section className="ticket-list">
                        {filteredTickets.map((ticket) => (
                            <article className="ticket-row" key={ticket.ticketID}>
                                <div className="ticket-row-header"><span className="ticket-category-label">IT Support</span><span className={`priority-badge ${ticket.priority.toLowerCase()}`}>• {ticket.priority}</span></div>
                                <div className="ticket-row-body"><span className="ticket-number">{ticket.ticketID}</span><div className="ticket-title-line"><h3>{ticket.subject}</h3><span className={`status-badge ${ticket.status.toLowerCase().replace(" ", "-")}`}>• {ticket.status}</span></div>
                                    <div className="ticket-meta"><span className="ticket-avatar"><UserRound size={13} /></span><span>Assigned to {ticket.employeeName}</span><span>▣ Updated {ticket.updated}</span><span><MessageSquare size={13} /> {ticket.comments} Comments</span></div></div>
                                {ticket.status === "Open" && <button className="ticket-action-button" onClick={() => updateTicketStatus(ticket.ticketID, "On Hold")}>Put On Hold</button>}
                                {ticket.status === "On Hold" && <button className="ticket-action-button" onClick={() => updateTicketStatus(ticket.ticketID, "Resolved")}>Resolve</button>}
                            </article>
                        ))}
                        {!filteredTickets.length && <div className="tickets-empty">No tickets match your filters.</div>}
                    </section>

                    <aside className="ticket-sidebar">
                        <section className="ticket-side-panel"><h2>Ticket Categories</h2><p className="ticket-side-empty">No ticket category data available.</p></section>
                        <section className="ticket-side-panel"><h2>Support Agents</h2><p className="ticket-side-empty">No support agent data available.</p></section>
                    </aside>
                </div>
            </div>
        </DashboardLayout>
    );
}

export default Tickets;
