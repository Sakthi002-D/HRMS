import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, AlertCircle, ArrowRight } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Notifications.css";

const API_BASE = "http://localhost:5000";

const getHRProfile = () => {
  try {
    const stored = sessionStorage.getItem("loggedInHR");
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const getHRName = (profile) => {
  const names = [
    profile.name, profile.full_name, profile.employee_name, profile.display_name,
    profile.fullName, profile.first_name, profile.username,
  ];
  const found = names.find((value) => typeof value === "string" && value.trim());
  return found ? found.trim() : "HR Administrator";
};

// Display date: 01 Oct 2026 (Qatar time)
const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Qatar",
  }).format(date);
};

// Date key for filtering: 2026-10-01 (Qatar time)
const dateKey = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Qatar",
  }).format(date);
};

function Notifications() {
  const navigate = useNavigate();
  const hrProfile = getHRProfile();
  const readKey = `hrms-hr-read-notifications-${hrProfile.employee_id || getHRName(hrProfile)}`;

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const getReadIds = () => {
    try {
      const ids = JSON.parse(localStorage.getItem(readKey) || "[]");
      return new Set(Array.isArray(ids) ? ids : []);
    } catch {
      return new Set();
    }
  };

  useEffect(() => {
    if (!sessionStorage.getItem("loggedInHR")) {
      navigate("/login", { replace: true });
      return;
    }

    const load = async () => {
      try {
        // Pending leave requests (same source as the dashboard bell)
        let leaveItems = [];
        const leaveResponse = await fetch(`${API_BASE}/api/leaves`);
        if (leaveResponse.ok) {
          const leaves = await leaveResponse.json();
          leaveItems = leaves
            .filter((leave) => leave.status?.toLowerCase() === "pending")
            .map((leave) => ({
              id: `leave-${leave.id}`,
              type: "leave",
              module: "Leave",
              title: `${leave.employee_name || leave.employee_id} requested leave`,
              message: `${leave.leave_type} request for ${leave.days || 1} day${Number(leave.days) === 1 ? "" : "s"}${leave.from_date ? `, from ${formatDate(leave.from_date)}` : ""}.`,
              date: leave.created_at || leave.from_date || null,
              path: "/leave-management",
            }));
        }

        // Recruitment / resignation inbox for this HR user
        let inboxItems = [];
        if (hrProfile.employee_id) {
          const inboxResponse = await fetch(
            `${API_BASE}/api/notifications/inbox/${encodeURIComponent(hrProfile.employee_id)}`,
            { cache: "no-store" }
          );
          if (inboxResponse.ok) {
            inboxItems = (await inboxResponse.json()).map((item) => {
              const isResignation = String(item.link || "").startsWith("resignation:");
              return {
                id: `inbox-${item.id}`,
                type: "request",
                module: isResignation ? "Resignation" : "Recruitment",
                title: item.title,
                message: item.message,
                date: item.created_at,
                path: isResignation ? "/resignations" : "/recruitment",
              };
            });
          }
        }

        const readIds = getReadIds();
        const all = [...inboxItems, ...leaveItems]
          .map((item) => ({ ...item, read: readIds.has(item.id) }))
          .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        setNotifications(all);
      } catch {
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modules = useMemo(
    () => [...new Set(notifications.map((item) => item.module))].sort(),
    [notifications]
  );

  const unreadCount = notifications.filter((item) => !item.read).length;

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notifications.filter((item) => {
      if (query && !`${item.title} ${item.message}`.toLowerCase().includes(query)) return false;
      if (statusFilter === "unread" && item.read) return false;
      if (statusFilter === "read" && !item.read) return false;
      if (moduleFilter !== "all" && item.module !== moduleFilter) return false;
      const key = dateKey(item.date);
      if (fromDate && (!key || key < fromDate)) return false;
      if (toDate && (!key || key > toDate)) return false;
      return true;
    });
  }, [notifications, search, statusFilter, moduleFilter, fromDate, toDate]);

  const openNotification = (item) => {
    const readIds = getReadIds();
    readIds.add(item.id);
    localStorage.setItem(readKey, JSON.stringify([...readIds]));
    setNotifications((current) => current.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    navigate(item.path);
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setModuleFilter("all");
    setFromDate("");
    setToDate("");
  };

  return (
    <DashboardLayout>
      <div className="hrnotif-page">
        <header className="hrnotif-header">
          <h1>Notifications</h1>
          <p>
            All updates that need your attention.
            {!loading && <span className="hrnotif-unread-count"> {unreadCount} unread</span>}
          </p>
        </header>

        <section className="hrnotif-card">
          <div className="hrnotif-filters">
            <input
              type="search"
              placeholder="Search title or message"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search notifications"
            />
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
            <button type="button" className="hrnotif-clear" onClick={clearFilters}>Clear</button>
          </div>

          <div className="hrnotif-list">
            {loading ? (
              <div className="hrnotif-empty">Loading notifications...</div>
            ) : visible.length === 0 ? (
              <div className="hrnotif-empty">
                {notifications.length === 0 ? "You are all caught up." : "No notifications match these filters."}
              </div>
            ) : (
              visible.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`hrnotif-item${item.read ? "" : " is-unread"}`}
                  onClick={() => openNotification(item)}
                >
                  <span className={`hrnotif-icon ${item.type}`}>
                    {item.type === "leave" ? <CalendarCheck size={18} /> : <AlertCircle size={18} />}
                  </span>
                  <span className="hrnotif-copy">
                    <span className="hrnotif-title-row">
                      <strong>{item.title}</strong>
                      <span className={`hrnotif-badge ${item.read ? "read" : "unread"}`}>
                        {item.read ? "Read" : "Unread"}
                      </span>
                    </span>
                    <span className="hrnotif-message">{item.message}</span>
                    <small>{item.module} · {formatDate(item.date)}</small>
                  </span>
                  <ArrowRight className="hrnotif-arrow" size={16} />
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

export default Notifications;