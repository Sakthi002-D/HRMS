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
  BriefcaseBusiness,
  ArrowRight,
  AlertCircle,
  X,
} from "lucide-react";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./HRDashboard.css";

function HRDashboard() {
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);

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
      const response = await fetch("http://localhost:5000/api/leaves");

      if (!response.ok) {
        throw new Error("Unable to load notifications");
      }

      const leaves = await response.json();
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

      setNotifications(leaveNotifications);
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
      sessionStorage.removeItem("loggedInHR");
      navigate("/login", { replace: true });
    };

    window.addEventListener("popstate", handleBackButton);

    return () => {
      window.removeEventListener("popstate", handleBackButton);
    };
  }, [navigate]);

  useEffect(() => {
    loadNotifications();
    loadDashboardData();

    const refreshDashboard = () => loadDashboardData();
    window.addEventListener("focus", refreshDashboard);

    return () => window.removeEventListener("focus", refreshDashboard);
  }, []);

  const openNotification = (notification) => {
    setShowNotifications(false);
    navigate(notification.path);
  };

  const unreadCount = notifications.length;

  return (
    <DashboardLayout>
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
                        className="notification-item"
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
                HR
              </div>

              <div className="profile-info">
                <strong>HR Administrator</strong>
                <small>People Operations</small>
              </div>

            </div>

          </div>

        </header>

        <section className="welcome-card">
          <div className="welcome-avatar">HR</div>
          <div className="welcome-copy">
            <h2>Welcome back, HR Admin</h2>
            <p>
              You have <strong> {dashboardData?.pendingLeaves ?? "-"} pending approvals</strong> to review.
            </p>
          </div>
          <div className="welcome-actions">
            <Link to="/employees">Manage Employees</Link>
            <Link to="/leave-management" className="primary-action">Review Requests</Link>
          </div>
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


            {/* Recruitment */}
            <Link
              to="/recruitment"
              className="action-card reports-action"
            >
              <div className="action-icon">
                <BriefcaseBusiness size={21} />
              </div>
              <h3>Post Job</h3>
            </Link>

          </div>

        </section>



      </div>
    </DashboardLayout>
  );
}

export default HRDashboard;