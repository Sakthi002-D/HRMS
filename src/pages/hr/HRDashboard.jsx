import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Clock3,
  CalendarDays,
  IndianRupee,
  Ticket,
  FileText,
  Settings,
  LogOut,
  Bell,
  UserPlus,
  ClipboardCheck,
  CalendarCheck,
  FileBarChart,
  ArrowRight,
  CheckCircle2,
  X,
  ChevronDown,
} from "lucide-react";

import { useState } from "react";
import "./HRDashboard.css";

function HRDashboard() {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDate, setShowDate] = useState(false);

  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="dashboard">

      {/* ================= SIDEBAR ================= */}
      <aside className="sidebar">

        <div className="sidebar-logo">
          <img src="/shelter logo.png" alt="Shelter Group" />
        </div>

        <div className="menu-title">MAIN MENU</div>

        <nav className="sidebar-menu">

          <Link
            to="/hr-dashboard"
            className="menu-item active"
          >
            <LayoutDashboard size={19} strokeWidth={2} />
            <span>Dashboard</span>
          </Link>

          <Link to="/employees" className="menu-item">
            <Users size={19} strokeWidth={2} />
            <span>Employees</span>
          </Link>

          <Link to="/attendance" className="menu-item">
            <Clock3 size={19} strokeWidth={2} />
            <span>Attendance</span>
          </Link>

          <Link to="/leave-management" className="menu-item">
            <CalendarDays size={19} strokeWidth={2} />
            <span>Leave Management</span>
          </Link>

          <Link to="/payroll" className="menu-item">
            <IndianRupee size={19} strokeWidth={2} />
            <span>Payroll</span>
          </Link>

          <Link to="/tickets" className="menu-item">
            <Ticket size={19} strokeWidth={2} />
            <span>Ticketing</span>
          </Link>

          <Link to="/reports" className="menu-item">
            <FileText size={19} strokeWidth={2} />
            <span>Reports</span>
          </Link>

        </nav>

        <div className="sidebar-bottom">

          <div className="menu-title">ACCOUNT</div>

          <button
            className="menu-item settings-btn"
            onClick={() =>
              alert("Settings page will be available soon.")
            }
          >
            <Settings size={19} strokeWidth={2} />
            <span>Settings</span>
          </button>

          <Link to="/" className="menu-item logout">
            <LogOut size={19} strokeWidth={2} />
            <span>Logout</span>
          </Link>

        </div>

      </aside>


      {/* ================= MAIN ================= */}
      <main className="dashboard-main">

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
                onClick={() =>
                  setShowNotifications(!showNotifications)
                }
              >
                <Bell size={19} />

                <span className="notification-dot"></span>
              </button>

              {showNotifications && (
                <div className="notification-dropdown">

                  <div className="notification-header">
                    <strong>Notifications</strong>

                    <button
                      onClick={() => setShowNotifications(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="notification-item">
                    <div className="notification-icon">
                      <CheckCircle2 size={17} />
                    </div>

                    <div>
                      <strong>Payroll completed</strong>
                      <p>August payroll has been processed.</p>
                    </div>
                  </div>

                  <div className="notification-item">
                    <div className="notification-icon">
                      <CalendarCheck size={17} />
                    </div>

                    <div>
                      <strong>Leave requests</strong>
                      <p>3 leave requests need approval.</p>
                    </div>
                  </div>

                </div>
              )}

            </div>


            {/* Profile */}
            <div className="profile">

              <div className="profile-avatar">
                HR
              </div>

              <div className="profile-info">
                <strong>HR Admin</strong>
                <small>Administrator</small>
              </div>

            </div>

          </div>

        </header>


        {/* ================= OVERVIEW ================= */}
        <section className="dashboard-section">

          <div className="section-heading">

            <div>
              <h2>Overview</h2>
              <p>Employee and HR activities at a glance.</p>
            </div>

            <div className="today-wrapper">

              <button
                className="today"
                onClick={() => setShowDate(!showDate)}
              >
                <CalendarDays size={16} />
                Today
                <ChevronDown size={14} />
              </button>

              {showDate && (
                <div className="date-popup">
                  {today}
                </div>
              )}

            </div>

          </div>


          {/* ================= STAT CARDS ================= */}
          <div className="stats-grid">

            {/* Employees */}
            <div className="stat-card employee-card">

              <div className="stat-top">
                <div className="stat-icon employee-icon">
                  <Users size={21} />
                </div>

                <span className="stat-growth">
                  ↗ 5%
                </span>
              </div>

              <div className="stat-content">
                <span>Total Employees</span>
                <h3>128</h3>
                <small>+8 this month</small>
              </div>

            </div>


            {/* Attendance */}
            <div className="stat-card attendance-card">

              <div className="stat-top">
                <div className="stat-icon attendance-icon">
                  <Clock3 size={21} />
                </div>

                <span className="stat-growth">
                  ↗ 12%
                </span>
              </div>

              <div className="stat-content">
                <span>Present Today</span>
                <h3>112</h3>
                <small>87.5% attendance</small>
              </div>

            </div>


            {/* Leave */}
            <div className="stat-card leave-card">

              <div className="stat-top">
                <div className="stat-icon leave-icon">
                  <CalendarCheck size={21} />
                </div>

                <span className="stat-growth">
                  ↗ 8%
                </span>
              </div>

              <div className="stat-content">
                <span>On Leave</span>
                <h3>09</h3>
                <small>3 pending approval</small>
              </div>

            </div>


            {/* Payroll */}
            <div className="stat-card payroll-card">

              <div className="stat-top">
                <div className="stat-icon payroll-icon">
                  <IndianRupee size={21} />
                </div>

                <span className="stat-growth">
                  ↗ 3%
                </span>
              </div>

              <div className="stat-content">
                <span>Payroll Status</span>
                <h3>Paid</h3>
                <small>August 2026</small>
              </div>

            </div>

          </div>

        </section>


        {/* ================= QUICK ACTIONS ================= */}
        <section className="dashboard-section">

          <div className="section-heading">

            <div>
              <h2>Quick Actions</h2>
              <p>Frequently used HR operations.</p>
            </div>

          </div>


          <div className="quick-actions">

            {/* Employees */}
            <Link
              to="/employees"
              className="action-card employee-action"
            >
              <div className="action-icon">
                <UserPlus size={21} />
              </div>

              <div>
                <h3>Employees</h3>
                <p>Manage employee information</p>
              </div>

              <ArrowRight size={19} className="action-arrow" />
            </Link>


            {/* Attendance */}
            <Link
              to="/attendance"
              className="action-card attendance-action"
            >
              <div className="action-icon">
                <ClipboardCheck size={21} />
              </div>

              <div>
                <h3>Attendance</h3>
                <p>View today's attendance</p>
              </div>

              <ArrowRight size={19} className="action-arrow" />
            </Link>


            {/* Leave */}
            <Link
              to="/leave-management"
              className="action-card leave-action"
            >
              <div className="action-icon">
                <CalendarCheck size={21} />
              </div>

              <div>
                <h3>Leave Requests</h3>
                <p>Review pending requests</p>
              </div>

              <ArrowRight size={19} className="action-arrow" />
            </Link>


            {/* Reports */}
            <Link
              to="/reports"
              className="action-card reports-action"
            >
              <div className="action-icon">
                <FileBarChart size={21} />
              </div>

              <div>
                <h3>Reports</h3>
                <p>Generate HR reports</p>
              </div>

              <ArrowRight size={19} className="action-arrow" />
            </Link>

          </div>

        </section>


        {/* ================= BOTTOM ================= */}
        <section className="bottom-grid">


          {/* ================= ATTENDANCE ================= */}
          <div className="dashboard-panel">

            <div className="panel-header">

              <div>
                <h2>Today's Attendance</h2>
                <p>Employee attendance summary</p>
              </div>

              <Link to="/attendance">
                View All <ArrowRight size={14} />
              </Link>

            </div>


            <div className="attendance-summary">

              <div>
                <strong>112</strong>
                <span>Present</span>
              </div>

              <div>
                <strong>07</strong>
                <span>Absent</span>
              </div>

              <div>
                <strong>09</strong>
                <span>Leave</span>
              </div>

            </div>


            <div className="progress-area">

              <div className="progress-label">
                <span>Attendance Rate</span>
                <strong>87.5%</strong>
              </div>

              <div className="progress-bar">
                <div style={{ width: "87.5%" }}></div>
              </div>

            </div>

          </div>


          {/* ================= LEAVE REQUESTS ================= */}
          <div className="dashboard-panel">

            <div className="panel-header">

              <div>
                <h2>Pending Leave Requests</h2>
                <p>Requires your attention</p>
              </div>

              <Link to="/leave-management">
                View All <ArrowRight size={14} />
              </Link>

            </div>


            {/* Arun */}
            <div className="leave-request">

              <div className="employee-avatar">
                AK
              </div>

              <div className="leave-info">
                <strong>Arun Kumar</strong>
                <span>Casual Leave • 2 Days</span>
              </div>

              <Link
                to="/leave-management?review=EMP001"
                className="review-btn"
              >
                Review
              </Link>

            </div>


            {/* Ravi */}
            <div className="leave-request">

              <div className="employee-avatar">
                RS
              </div>

              <div className="leave-info">
                <strong>Ravi Shankar</strong>
                <span>Sick Leave • 1 Day</span>
              </div>

              <Link
                to="/leave-management?review=EMP002"
                className="review-btn"
              >
                Review
              </Link>

            </div>


            {/* Priya */}
            <div className="leave-request">

              <div className="employee-avatar">
                PM
              </div>

              <div className="leave-info">
                <strong>Priya Menon</strong>
                <span>Earned Leave • 3 Days</span>
              </div>

              <Link
                to="/leave-management?review=EMP003"
                className="review-btn"
              >
                Review
              </Link>

            </div>

          </div>

        </section>

      </main>

    </div>
  );
}

export default HRDashboard;