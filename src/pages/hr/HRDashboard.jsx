import { Link } from "react-router-dom";
import {
  Users,
  Clock3,
  IndianRupee,
  Ticket,
  Bell,
  UserPlus,
  ClipboardCheck,
  CalendarCheck,
  FileBarChart,
  FileText,
  ArrowRight,
  AlertCircle,
  X,
} from "lucide-react";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { purgeAllChatStorage } from "../../components/assistant/HRAssistant";
import { api, formatDate, isPendingHR } from "../../components/resignation/resignationApi";
import "../../components/recruitment/recruitment.css";
import "./HRDashboard.css";

const employeeSlug = (name) => String(name || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

function HRDashboard() {
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [resignations, setResignations] = useState([]);
  const [endOfService, setEndOfService] = useState([]);
  const hrProfile = (() => {
    try {
      const storedHR = sessionStorage.getItem("loggedInHR");
      const parsed = storedHR ? JSON.parse(storedHR) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  })();

  const hrDisplayName = (() => {
    const possibleNames = [
      hrProfile.name,
      hrProfile.full_name,
      hrProfile.employee_name,
      hrProfile.display_name,
      hrProfile.fullName,
      hrProfile.first_name && hrProfile.last_name
        ? `${hrProfile.first_name} ${hrProfile.last_name}`
        : "",
      hrProfile.first_name,
      hrProfile.last_name,
      hrProfile.username,
    ];

    const matchedName = possibleNames.find(
      (value) => typeof value === "string" && value.trim()
    );

    return matchedName ? matchedName.trim() : "HR Administrator";
  })();

  const hrRoleLabel = "HR Administrator";
  const hrProfilePhoto = typeof hrProfile.profile_photo === "string"
    ? hrProfile.profile_photo.trim()
    : "";
  const hrInitials = hrDisplayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const hrNotificationReadKey = `hrms-hr-read-notifications-${hrProfile.employee_id || hrDisplayName}`;

  const getReadNotificationIds = () => {
    try {
      const storedIds = JSON.parse(localStorage.getItem(hrNotificationReadKey) || "[]");
      return new Set(Array.isArray(storedIds) ? storedIds : []);
    } catch {
      return new Set();
    }
  };

  const loadDashboardData = () => {
    fetch("http://localhost:5000/api/dashboard")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load dashboard data");
        return response.json();
      })
      .then(setDashboardData)
      .catch(() => setDashboardData(null));
  };

  const loadNotifications = async () => {
    try {
      const leaveResponse = await fetch("http://localhost:5000/api/leaves");
      if (!leaveResponse.ok) throw new Error("Unable to load notifications");
      const leaves = await leaveResponse.json();
      const pendingLeaves = leaves.filter(
        (leave) => leave.status?.toLowerCase() === "pending"
      );

      const leaveNotifications = pendingLeaves.map((leave) => ({
        id: `leave-${leave.id}`,
        type: "leave",
        title: `${leave.employee_name || leave.employee_id} requested leave`,
        message: `${leave.leave_type} request for ${leave.days || 1} day${Number(leave.days) === 1 ? "" : "s"}.`,
        time: leave.from_date
          ? `From ${new Date(leave.from_date).toLocaleDateString()}`
          : "Pending review",
        path: "/leave-management",
      }));

      // Manpower Request / recruitment notifications for this HR user
      let recruitmentNotifications = [];
      if (hrProfile.employee_id) {
        const inboxResponse = await fetch(`http://localhost:5000/api/notifications/inbox/${encodeURIComponent(hrProfile.employee_id)}`, { cache: "no-store" });
        if (inboxResponse.ok) {
          recruitmentNotifications = (await inboxResponse.json()).map((item) => ({
            id: `inbox-${item.id}`,
            type: "request",
            title: item.title,
            message: item.message,
            time: new Date(item.created_at).toLocaleDateString(),
            path: String(item.link || "").startsWith("resignation:") ? "/resignations" : "/recruitment",
          }));
        }
      }

      const readIds = getReadNotificationIds();
      setNotifications([...recruitmentNotifications, ...leaveNotifications].map((notification) => ({
        ...notification,
        read: readIds.has(notification.id),
      })));
    } catch {
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    const hrSession = sessionStorage.getItem("loggedInHR");

    if (!hrSession) {
      navigate("/login", { replace: true });
      return;
    }

    window.history.pushState(null, "", window.location.href);

    const handleBackButton = () => {
      purgeAllChatStorage();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      sessionStorage.removeItem("loggedInHR");
      navigate("/login", { replace: true });
    };

    window.addEventListener("popstate", handleBackButton);

    return () => {
      window.removeEventListener("popstate", handleBackButton);
    };
  }, [navigate]);

  // Resignations (for the pending approvals count; they're managed on the Resignation page)
  // and the Pending End of Service list
  const loadResignations = async () => {
    if (!hrProfile.employee_id) return;
    const id = encodeURIComponent(hrProfile.employee_id);
    try {
      const [resignationRows, endOfServiceRows] = await Promise.all([
        api(`/api/hr/resignations?employee_id=${id}`),
        api(`/api/hr/end-of-service?employee_id=${id}`),
      ]);
      setResignations(resignationRows);
      setEndOfService(endOfServiceRows);
    } catch (error) {
      console.error("Unable to load resignations:", error);
    }
  };

  useEffect(() => {
    loadNotifications();
    loadDashboardData();
    loadResignations();

    const refreshDashboard = () => loadDashboardData();
    window.addEventListener("focus", refreshDashboard);

    return () => window.removeEventListener("focus", refreshDashboard);
  }, []);

  const openNotification = (notification) => {
    const readIds = getReadNotificationIds();
    readIds.add(notification.id);
    localStorage.setItem(hrNotificationReadKey, JSON.stringify([...readIds]));
    setNotifications((current) => current.map((item) => (
      item.id === notification.id ? { ...item, read: true } : item
    )));
    setShowNotifications(false);
    navigate(notification.path);
  };

  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const pendingHRResignations = resignations.filter(isPendingHR).length;
  const pendingApprovals = dashboardData ? (dashboardData.pendingLeaves ?? 0) + pendingHRResignations : "-";

  return (
    <DashboardLayout className="hr-dashboard-layout">
      <div className="dashboard-main">

        {/* ================= HEADER ================= */}
        <header className="dashboard-header">

          <div>
            <h1>HR Dashboard</h1>
            <p>
              Welcome back! Here's what's happening with your workforce.
            </p>
          </div>

          <div className="header-right">

            {/* Notification */}
            <div className="notification-wrapper">

              <button
                className="notification-btn"
                aria-label="Open notifications"
                aria-expanded={showNotifications}
                onClick={() =>
                  setShowNotifications(!showNotifications)
                }
              >
                <Bell size={19} />

                {unreadCount > 0 && (
                  <span className="notification-dot" aria-label={`${unreadCount} unread notifications`}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="notification-dropdown">

                  <div className="notification-header">
                    <div>
                      <strong>Notifications</strong>
                      <span>{notificationsLoading ? "Checking for updates..." : `${unreadCount} updates need your attention`}</span>
                    </div>

                    <button
                      onClick={() => setShowNotifications(false)}
                      aria-label="Close notifications"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {notificationsLoading ? (
                    <div className="notification-empty">Loading updates...</div>
                  ) : notifications.length === 0 ? (
                    <div className="notification-empty">You are all caught up.</div>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        className={`notification-item${notification.read ? " is-read" : ""}`}
                        key={notification.id}
                        type="button"
                        onClick={() => openNotification(notification)}
                      >
                        <span className={`notification-icon ${notification.type}`}>
                          {notification.type === "leave" ? <CalendarCheck size={17} /> : <AlertCircle size={17} />}
                        </span>

                        <span className="notification-copy">
                          <strong>{notification.title}</strong>
                          <small>{notification.time}</small>
                          <span>{notification.message}</span>
                          {notification.read && <em className="notification-status">Read</em>}
                        </span>
                        <ArrowRight className="notification-arrow" size={15} />
                      </button>
                    ))
                  )}

                </div>
              )}

            </div>


            {/* Profile */}
            <div className="profile">

              <div className="profile-avatar">
                {hrProfilePhoto ? (
                  <img src={hrProfilePhoto} alt={`${hrDisplayName} profile`} />
                ) : (
                  hrInitials || "HR"
                )}
              </div>

              <div className="profile-info">
                <strong>{hrDisplayName}</strong>
                <small>{hrRoleLabel}</small>
              </div>

            </div>

          </div>

        </header>

        <section className="welcome-card">
          <div className="welcome-avatar">HR</div>
          <div className="welcome-copy">
            <h2>Welcome back, {hrDisplayName}</h2>
            <p>
              You have{" "}
              {pendingHRResignations > 0 ? (
                <Link to="/resignations" className="welcome-approvals-link" title={`${pendingHRResignations} resignation${pendingHRResignations === 1 ? "" : "s"} waiting for HR`}>
                  <strong>{pendingApprovals} pending approvals</strong>
                </Link>
              ) : (
                <strong>{pendingApprovals} pending approvals</strong>
              )}{" "}
              to review.
            </p>
          </div>
          <div className="welcome-actions">
            <Link to="/employees">Manage Employees</Link>
            <Link to="/leave-management" className="primary-action">Review Requests</Link>
          </div>
        </section>

        <section className="employee-request-review-panel">
          <div className="employee-request-review-heading">
            <div>
              <h2>Pending End of Service</h2>
              <p>Employees whose resignation completed after their last working day. End of Service processing will follow.</p>
            </div>
            <span>{endOfService.length} pending</span>
          </div>
          {endOfService.length === 0 ? (
            <div className="employee-request-review-empty">No employees pending End of Service.</div>
          ) : (
            <div className="employee-request-review-list">
              {endOfService.map((row) => (
                <article className="employee-request-review-item" key={row.id}>
                  <div>
                    <strong>{row.employee_name} ({row.employee_id})</strong>
                    <span>{row.department || "—"} · Last working day {formatDate(row.last_working_day)}{row.resignation_no ? ` · ${row.resignation_no}` : ""}</span>
                  </div>
                  <div className="employee-request-review-actions">
                    <Link className="review-request-button" to={`/employees/employeedetails/${employeeSlug(row.employee_name)}`}>View employee</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>



        {/* ================= OVERVIEW ================= */}
        <section className="dashboard-section">
          {/* ================= STAT CARDS ================= */}
          <div className="stats-grid">

            {/* Employees */}
            <div className="stat-card employee-card">

              <div className="stat-top">
                <div className="stat-icon employee-icon">
                  <Users size={21} />
                </div>

                <span className="stat-growth">
                  —
                </span>
              </div>

              <div className="stat-content">
                <span>Total Employees</span>
                <h3>{dashboardData?.totalEmployees ?? "—"}</h3>
                <small>Active employees</small>
              </div>
              <Link className="stat-link" to="/employees">View Details <ArrowRight size={13} /></Link>

            </div>


            {/* Attendance */}
            <div className="stat-card attendance-card">

              <div className="stat-top">
                <div className="stat-icon attendance-icon">
                  <Clock3 size={21} />
                </div>

                <span className="stat-growth">
                  —
                </span>
              </div>

              <div className="stat-content">
                <span>Present Today</span>
                <h3>{dashboardData?.presentToday ?? "—"}</h3>
                <small>Present today</small>
              </div>
              <Link className="stat-link" to="/attendance">View Details <ArrowRight size={13} /></Link>

            </div>


            {/* Leave */}
            <div className="stat-card leave-card">

              <div className="stat-top">
                <div className="stat-icon leave-icon">
                  <CalendarCheck size={21} />
                </div>

                <span className="stat-growth">
                  —
                </span>
              </div>

              <div className="stat-content">
                <span>On Leave</span>
                <h3>{dashboardData?.onLeave ?? "—"}</h3>
                <small>{dashboardData?.pendingLeaves ?? "—"} pending approval</small>
              </div>
              <Link className="stat-link" to="/leave-management">View Details <ArrowRight size={13} /></Link>

            </div>


            {/* Payroll */}
            <div className="stat-card payroll-card">

              <div className="stat-top">
                <div className="stat-icon payroll-icon">
                  <IndianRupee size={21} />
                </div>

                <span className="stat-growth">
                  —
                </span>
              </div>

              <div className="stat-content">
                <span>Payroll Status</span>
                <h3>{dashboardData?.payrollStatus ?? "—"}</h3>
                <small>{dashboardData?.payrollStatus ? "Current payroll status" : "No payroll data"}</small>
              </div>
              <Link className="stat-link" to="/payroll">View Details <ArrowRight size={13} /></Link>
            </div>

            <div className="stat-card recruitment-card">
                <div className="stat-top">
                  <div className="stat-icon recruitment-icon"><UserPlus size={21} /></div>
                  <span className="stat-growth">—</span>
                </div>
                <div className="stat-content">
                  <span>Open Positions</span>
                  <h3>{dashboardData?.openPositions ?? "—"}</h3>
                  <small>Open positions</small>
                </div>
                <Link className="stat-link" to="/recruitment">View Details <ArrowRight size={13} /></Link>
              </div>

            <div className="stat-card joiners-card">
                <div className="stat-top">
                  <div className="stat-icon joiners-icon"><Users size={21} /></div>
                  <span className="stat-growth">—</span>
                </div>
                <div className="stat-content">
                  <span>New Joiners</span>
                  <h3>{dashboardData?.newJoiners ?? "—"}</h3>
                  <small>Joined this month</small>
                </div>
                <Link className="stat-link" to="/employees">View Details <ArrowRight size={13} /></Link>
              </div>

            <div className="stat-card tickets-card">
                <div className="stat-top">
                  <div className="stat-icon tickets-icon"><Ticket size={21} /></div>
                  <span className="stat-growth">—</span>
                </div>
                <div className="stat-content">
                  <span>Open Tickets</span>
                  <h3>{dashboardData?.openTickets ?? "—"}</h3>
                  <small>Open tickets</small>
                </div>
                <Link className="stat-link" to="/tickets">View Details <ArrowRight size={13} /></Link>
              </div>

            <div className="stat-card department-card">
                <div className="stat-top">
                  <div className="stat-icon department-icon"><FileBarChart size={21} /></div>
                  <span className="stat-growth">—</span>
                </div>
                <div className="stat-content">
                  <span>Reports</span>
                  <h3>—</h3>
                  <small>View HR reports</small>
                </div>
                <Link className="stat-link" to="/reports">
                  View Details <ArrowRight size={13} />
                </Link>
              </div>

          </div>
        </section>


        {/* ================= QUICK ACTIONS ================= */}
        <section className="dashboard-section quick-actions-panel">
          <h2>Quick Actions</h2>
          <div className="quick-actions">

            {/* Employees */}
            <Link
              to="/employees"
              className="action-card employee-action"
            >
              <div className="action-icon">
                <UserPlus size={21} />
              </div>
              <h3>Add Employee</h3>
            </Link>


            {/* Leave request */}
            <Link
              to="/leave-management"
              className="action-card attendance-action"
            >
              <div className="action-icon">
                <ClipboardCheck size={21} />
              </div>
              <h3>Leave Request</h3>
            </Link>


            {/* Payroll */}
            <Link
              to="/payroll"
              className="action-card leave-action"
            >
              <div className="action-icon">
                <IndianRupee size={21} />
              </div>
              <h3>Run Payroll</h3>
            </Link>


            {/* Employee Requests */}
            <Link
              to="/hr/employee-requests"
              className="action-card reports-action"
            >
              <div className="action-icon">
                <FileText size={21} />
              </div>
              <h3>Employee Requests</h3>
            </Link>

          </div>

        </section>



      </div>
    </DashboardLayout>
  );
}

export default HRDashboard;