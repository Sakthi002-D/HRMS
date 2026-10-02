import { useMemo, useState } from "react";
import { Bell, ArrowRight } from "lucide-react";
import "./EmployeeNotifications.css";

const MODULE_LABELS = {
    leave: "Leave",
    resignation: "Resignation",
    documents: "Documents",
    manpower: "Manpower Requests",
    payroll: "Payroll",
    attendance: "Attendance",
    profile: "Profile",
    settings: "Settings",
    dashboard: "General",
};

const moduleOf = (n) => {
    const key = String(n.section || n.type || "").toLowerCase();
    if (MODULE_LABELS[key]) return MODULE_LABELS[key];
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : "General";
};

const rawDate = (n) => n.created_at || n.createdAt || n.date || n.time || null;

const parse = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

const formatDate = (n) => {
    const d = parse(rawDate(n));
    if (!d) return n.time || "—";
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Qatar",
    }).format(d);
};

const dateKey = (n) => {
    const d = parse(rawDate(n));
    if (!d) return "";
    return new Intl.DateTimeFormat("en-CA", {
        year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Qatar",
    }).format(d);
};

function EmployeeNotifications({ notifications = [], onOpen }) {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [moduleFilter, setModuleFilter] = useState("all");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const items = useMemo(() => notifications
        .map((n) => ({ ...n, _module: moduleOf(n), _key: dateKey(n) }))
        .sort((a, b) => (b._key || "").localeCompare(a._key || "")), [notifications]);

    const modules = useMemo(() => [...new Set(items.map((n) => n._module))].sort(), [items]);
    const unreadCount = items.filter((n) => !n.read).length;

    const visible = items.filter((n) => {
        const query = search.trim().toLowerCase();
        if (query && !`${n.title || ""} ${n.message || ""}`.toLowerCase().includes(query)) return false;
        if (statusFilter === "unread" && n.read) return false;
        if (statusFilter === "read" && !n.read) return false;
        if (moduleFilter !== "all" && n._module !== moduleFilter) return false;
        if (fromDate && (!n._key || n._key < fromDate)) return false;
        if (toDate && (!n._key || n._key > toDate)) return false;
        return true;
    });

    const clearFilters = () => {
        setSearch(""); setStatusFilter("all"); setModuleFilter("all"); setFromDate(""); setToDate("");
    };

    return (
        <section className="empnotif-section">
            <div className="empnotif-card">
                <p className="empnotif-count"><strong>{unreadCount}</strong> unread of {items.length}</p>

                <div className="empnotif-filters">
                    <input type="search" placeholder="Search title or message" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search notifications" />
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by read status">
                        <option value="all">All messages</option>
                        <option value="unread">Unread</option>
                        <option value="read">Read</option>
                    </select>
                    <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} aria-label="Filter by module">
                        <option value="all">All modules</option>
                        {modules.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" title="From date" />
                    <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} aria-label="To date" title="To date" />
                    <button type="button" className="empnotif-clear" onClick={clearFilters}>Clear</button>
                </div>

                <div className="empnotif-list">
                    {visible.length === 0 ? (
                        <div className="empnotif-empty">
                            {items.length === 0 ? "You are all caught up." : "No notifications match these filters."}
                        </div>
                    ) : visible.map((n) => (
                        <button key={n.id} type="button" className={`empnotif-item${n.read ? "" : " is-unread"}`} onClick={() => onOpen(n)}>
                            <span className="empnotif-icon"><Bell size={17} /></span>
                            <span className="empnotif-copy">
                                <span className="empnotif-title-row">
                                    <strong>{n.title}</strong>
                                    <span className={`empnotif-badge ${n.read ? "read" : "unread"}`}>{n.read ? "Read" : "Unread"}</span>
                                </span>
                                <span className="empnotif-message">{n.message}</span>
                                <small>{n._module} · {formatDate(n)}</small>
                            </span>
                            <ArrowRight className="empnotif-arrow" size={16} />
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default EmployeeNotifications;