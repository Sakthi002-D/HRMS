import { Link } from "react-router-dom";
import {
  Users,
  Clock3,
  Wallet,
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
import { Trans, useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { api, formatDate, isPendingHR } from "../../components/resignation/resignationApi";
import { loadEmployeeActivityNotifications } from "../../components/hr/hrNotificationSources";
import { getCompanyToday } from "../../components/hr/leaveTrackerState";
import "../../components/recruitment/recruitment.css";
import API_URL from "../../config/api";
import { formatAppDate, getAppSettings } from "../../utils/appSettings";
import HRDashboardWidgets from "./HRDashboardWidgets";
import "./HRDashboard.css";

const employeeSlug = (name) => String(name || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

// Used by <Trans> for the bold "pending approvals" part when it links to the Resignation page
function ApprovalsLink({ children, ...props }) {
  return (
    <Link {...props}>
      <strong>{children}</strong>
    </Link>
  );
}

function HRDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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

  // hrDisplayName stays English (it is part of the read-notifications storage key); only the shown text is translated
  const hrAdministratorLabel = t("hrDashboard.hrAdministrator", { defaultValue: "HR Administrator" });
  const hrShownName = hrDisplayName === "HR Administrator" ? hrAdministratorLabel : hrDisplayName;
  const hrRoleLabel = hrAdministratorLabel;
  const valueLabel = (group, value) => t(`hrDashboard.values.${group}.${String(value).trim().toLowerCase().replace(/[\s-]+/g, "_")}`, { defaultValue: String(value) });
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
    fetch(`${API_URL}/api/dashboard`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load dashboard data");
        return response.json();
      })
      .then(setDashboardData)
      .catch(() => setDashboardData(null));
  };

  const loadNotifications = async () => {
    try {
      const leaveResponse = await fetch(`${API_URL}/api/leaves`);
      if (!leaveResponse.ok) throw new Error("Unable to load notifications");
      const leaves = await leaveResponse.json();
      // HR Settings → Leave Notifications can switch these off
      const pendingLeaves = getAppSettings().leaveNotifications === false
        ? []
        : leaves.filter((leave) => leave.status?.toLowerCase() === "pending");

      const leaveNotifications = pendingLeaves.map((leave) => ({
        id: `leave-${leave.id}`,
        type: "leave",
        title: `${leave.employee_name || leave.employee_id} requested leave`,
        message: `${leave.leave_type} request for ${leave.days || 1} day${Number(leave.days) === 1 ? "" : "s"}.`,
        time: leave.from_date
          ? `From ${formatAppDate(leave.from_date)}`
          : "Pending review",
        path: "/leave-management",
      }));

      // Manpower Request / recruitment notifications for this HR user
      let recruitmentNotifications = [];
      if (hrProfile.employee_id) {
        const inboxResponse = await fetch(`${API_URL}/api/notifications/inbox/${encodeURIComponent(hrProfile.employee_id)}`, { cache: "no-store" });
        if (inboxResponse.ok) {
          recruitmentNotifications = (await inboxResponse.json()).map((item) => ({
            id: `inbox-${item.id}`,
            type: "request",
            title: item.title,
            message: item.message,
            time: formatAppDate(item.created_at),
            path: String(item.link || "").startsWith("resignation:") ? "/resignations" : "/recruitment",
          }));
        }
      }

      // Employee requests + Visa / Passport uploads (shared with the Notifications page)
      const activityNotifications = await loadEmployeeActivityNotifications(hrProfile.employee_id);

      const readIds = getReadNotificationIds();
      setNotifications([...activityNotifications, ...recruitmentNotifications, ...leaveNotifications].map((notification) => ({
        ...notification,
        read: readIds.has(notification.id),
      })));
    } catch {
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  };

  // Browser Back stays on the HR Dashboard (no logout, no pop-up), the same as the employee portal:
  // - Behind the Dashboard there is a stack of Dashboard entries, so Back keeps showing the Dashboard.
  // - Chrome only respects history entries added during a click/keypress, so the stack is
  //   refilled (to GUARD_DEPTH entries) on every click or keypress on this page.
  // Other HR pages keep normal Back (e.g. Employees → Back → Dashboard).
  useEffect(() => {
    const hrSession = sessionStorage.getItem("loggedInHR");

    if (!hrSession) {
      navigate("/login", { replace: true });
      return undefined;
    }

    const dashboardUrl = window.location.href;
    const GUARD_DEPTH = 50; // browsers keep at most 50 history entries per tab

    const depthOf = (state) => (state?.hrPortal ? Number(state.hrDepth || 0) : -1);
    const pushDashboard = (depth) => window.history.pushState(
      { ...window.history.state, hrPortal: true, hrDepth: depth, hrBase: false },
      "",
      dashboardUrl
    );

    // First time: the current entry becomes the "base", with one Dashboard entry on top
    // (skipped if already set up, e.g. React StrictMode re-run, F5, or coming Back from another HR page)
    if (!window.history.state?.hrPortal) {
      window.history.replaceState({ ...window.history.state, hrPortal: true, hrDepth: 0, hrBase: true }, "", dashboardUrl);
      pushDashboard(1);
    }

    // Refill the Dashboard stack during a click/keypress
    const refillStack = () => {
      let depth = depthOf(window.history.state);
      if (depth < 0) return;
      while (depth < GUARD_DEPTH) {
        depth += 1;
        pushDashboard(depth);
      }
    };
    // Fill it now too: with 50 entries the browser drops the oldest ones (other websites) from this tab
    refillStack();

    const handlePopState = (event) => {
      // A Dashboard entry: nothing to do, the Dashboard is already shown
      if (event.state?.hrPortal && !event.state?.hrBase) return;
      // Reached the base: stay on the Dashboard and fill the stack again
      refillStack();
    };

    window.addEventListener("popstate", handlePopState);
    document.addEventListener("pointerdown", refillStack, true);
    document.addEventListener("keydown", refillStack, true);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("pointerdown", refillStack, true);
      document.removeEventListener("keydown", refillStack, true);
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
    navigate(notification.path);
  };

  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const pendingHRResignations = resignations.filter(isPendingHR).length;
  const pendingApprovals = dashboardData ? (dashboardData.pendingLeaves ?? 0) + pendingHRResignations : "-";

  const stats = [
    { key: "employees", tone: "blue", icon: Users, to: "/employees", label: t("hrDashboard.stats.totalEmployees", { defaultValue: "Total Employees" }), value: dashboardData?.totalEmployees ?? "—", note: t("hrDashboard.stats.activeEmployees", { defaultValue: "Active employees" }) },
    { key: "attendance", tone: "green", icon: Clock3, to: "/attendance", label: t("hrDashboard.stats.presentTodayTitle", { defaultValue: "Present Today" }), value: dashboardData?.presentToday ?? "—", note: t("hrDashboard.stats.presentTodayNote", { defaultValue: "Present today" }) },
    { key: "leave", tone: "amber", icon: CalendarCheck, to: "/leave-management", label: t("hrDashboard.stats.onLeave", { defaultValue: "On Leave" }), value: dashboardData?.onLeave ?? "—", note: t("hrDashboard.stats.pendingApproval", { number: dashboardData?.pendingLeaves ?? "—", defaultValue: "{{number}} pending approval" }) },
    { key: "payroll", tone: "rose", icon: Wallet, to: "/payroll", label: t("hrDashboard.stats.payrollStatus", { defaultValue: "Payroll Status" }), value: dashboardData?.payrollStatus ? valueLabel("payrollStatus", dashboardData.payrollStatus) : "—", note: dashboardData?.payrollStatus ? t("hrDashboard.stats.currentPayrollStatus", { defaultValue: "Current payroll status" }) : t("hrDashboard.stats.noPayrollData", { defaultValue: "No payroll data" }) },
    { key: "recruitment", tone: "violet", icon: UserPlus, to: "/recruitment", label: t("hrDashboard.stats.openPositionsTitle", { defaultValue: "Open Positions" }), value: dashboardData?.openPositions ?? "—", note: t("hrDashboard.stats.openPositionsNote", { defaultValue: "Open positions" }) },
    { key: "joiners", tone: "teal", icon: Users, to: "/employees", label: t("hrDashboard.stats.newJoiners", { defaultValue: "New Joiners" }), value: dashboardData?.newJoiners ?? "—", note: t("hrDashboard.stats.joinedThisMonth", { defaultValue: "Joined this month" }) },
    { key: "tickets", tone: "indigo", icon: Ticket, to: "/tickets", label: t("hrDashboard.stats.openTicketsTitle", { defaultValue: "Open Tickets" }), value: dashboardData?.openTickets ?? "—", note: t("hrDashboard.stats.openTicketsNote", { defaultValue: "Open tickets" }) },
    { key: "approvals", tone: "orange", icon: ClipboardCheck, to: "/leave-management", label: t("hrDashboard.approvalsTitle", { defaultValue: "Pending Approvals" }), value: pendingApprovals, note: t("hrDashboard.approvalsNote", { defaultValue: "Leave and resignations" }) },
  ];

  const quickActions = [
    { key: "employee", tone: "blue", icon: UserPlus, to: "/employees", label: t("hrDashboard.quickActions.addEmployee", { defaultValue: "Add Employee" }) },
    { key: "leave", tone: "amber", icon: ClipboardCheck, to: "/leave-management", label: t("hrDashboard.quickActions.leaveRequest", { defaultValue: "Leave Request" }) },
    { key: "payroll", tone: "rose", icon: Wallet, to: "/payroll", label: t("hrDashboard.quickActions.runPayroll", { defaultValue: "Run Payroll" }) },
    { key: "requests", tone: "violet", icon: FileText, to: "/hr/employee-requests", label: t("hrDashboard.quickActions.employeeRequests", { defaultValue: "Employee Requests" }) },
    { key: "reports", tone: "teal", icon: FileBarChart, to: "/reports", label: t("menu.reports", { defaultValue: "Reports" }) },
  ];

  return (
    <DashboardLayout className="hr-dashboard-layout">
      <div className="dashboard-main">

        {/* ================= WELCOME BANNER ================= */}
        <header className="dash-hero">
          <div className="dash-hero-copy">
            <span className="dash-hero-kicker">{t("hrDashboard.title", { defaultValue: "HR Dashboard" })}</span>
            <h1>{t("hrDashboard.welcomeBack", { name: hrShownName, defaultValue: "Welcome back, {{name}}" })}</h1>
            <p>
              <Trans
                i18nKey="hrDashboard.pendingApprovals"
                count={pendingApprovals}
                values={{ count: pendingApprovals }}
                components={{
                  b: pendingHRResignations > 0 ? (
                    <ApprovalsLink to="/resignations" className="welcome-approvals-link" title={t("hrDashboard.resignationsWaiting", { count: pendingHRResignations, defaultValue: "{{count}} resignations waiting for HR" })} />
                  ) : (
                    <strong />
                  ),
                }}
                defaults="You have <b>{{count}} pending approvals</b> to review."
              />
            </p>
            <div className="dash-hero-chips">
              <span className="dash-hero-chip"><i className="date" aria-hidden="true" />{formatAppDate(getCompanyToday())}</span>
              <span className="dash-hero-chip"><i className="leave" aria-hidden="true" />{t("leaveManagement.hero.onLeaveToday", { count: dashboardData?.onLeave ?? 0, defaultValue: "{{count}} on leave today" })}</span>
            </div>
          </div>

          <div className="dash-hero-side">
              <div className="header-right">
    
                {/* Notification */}
                <div className="notification-wrapper">
    
                  <button
                    className="notification-btn"
                    aria-label={t("hrDashboard.openNotifications", { defaultValue: "Open notifications" })}
                    onClick={() => navigate("/hr/notifications")}
                  >
                    <Bell size={19} />
    
                    {unreadCount > 0 && (
                      <span className="notification-dot" aria-label={t("hrDashboard.unreadNotifications", { count: unreadCount, defaultValue: "{{count}} unread notifications" })}>
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>
    
                </div>
    
    
                {/* Profile */}
                <div className="profile">
    
                  <div className="profile-avatar">
                    {hrProfilePhoto ? (
                      <img src={hrProfilePhoto} alt={t("hrDashboard.profilePhotoAlt", { name: hrShownName, defaultValue: "{{name}} profile" })} />
                    ) : (
                      hrInitials || "HR"
                    )}
                  </div>
    
                  <div className="profile-info">
                    <strong>{hrShownName}</strong>
                    <small>{hrRoleLabel}</small>
                  </div>
    
                </div>
    
              </div>

            <div className="dash-hero-actions">
              <Link to="/employees">{t("hrDashboard.manageEmployees", { defaultValue: "Manage Employees" })}</Link>
              <Link to="/leave-management" className="primary">{t("hrDashboard.reviewRequests", { defaultValue: "Review Requests" })}</Link>
            </div>
          </div>
        </header>

        {/* ================= OVERVIEW ================= */}
        <section className="dash-stats">
          {stats.map(({ key, tone, icon: Icon, to, label, value, note }) => (
            <Link className={`dash-stat tone-${tone}`} to={to} key={key}>
              <span className="dash-icon"><Icon size={20} aria-hidden="true" /></span>
              <span className="dash-stat-body">
                <span className="dash-stat-label">{label}</span>
                <strong>{value}</strong>
                <span className="dash-stat-note">{note}</span>
              </span>
              <ArrowRight className="dash-stat-arrow" size={16} aria-hidden="true" />
            </Link>
          ))}
        </section>

        <div className="dash-columns">
          <section className="employee-request-review-panel">
            <div className="employee-request-review-heading">
              <div>
                <h2>{t("hrDashboard.endOfService.title", { defaultValue: "Pending End of Service" })}</h2>
                <p>{t("hrDashboard.endOfService.description", { defaultValue: "Employees whose resignation completed after their last working day. End of Service processing will follow." })}</p>
              </div>
              <span>{t("hrDashboard.endOfService.pendingCount", { number: endOfService.length, defaultValue: "{{number}} pending" })}</span>
            </div>
            {endOfService.length === 0 ? (
              <div className="employee-request-review-empty">{t("hrDashboard.endOfService.empty", { defaultValue: "No employees pending End of Service." })}</div>
            ) : (
              <div className="employee-request-review-list">
                {endOfService.map((row) => (
                  <article className="employee-request-review-item" key={row.id}>
                    <div>
                      <strong>{row.employee_name} ({row.employee_id})</strong>
                      <span>{row.department || "—"} · {t("hrDashboard.endOfService.lastWorkingDay", { date: formatDate(row.last_working_day), defaultValue: "Last working day {{date}}" })}{row.resignation_no ? ` · ${row.resignation_no}` : ""}</span>
                    </div>
                    <div className="employee-request-review-actions">
                      <Link className="review-request-button" to={`/employees/employeedetails/${employeeSlug(row.employee_name)}`}>{t("hrDashboard.endOfService.viewEmployee", { defaultValue: "View employee" })}</Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <HRDashboardWidgets />

          {/* ================= QUICK ACTIONS ================= */}
          <section className="dash-quick">
            <h2>{t("hrDashboard.quickActions.title", { defaultValue: "Quick Actions" })}</h2>
            <div className="dash-quick-list">
              {quickActions.map(({ key, tone, icon: Icon, to, label }) => (
                <Link className={`dash-quick-item tone-${tone}`} to={to} key={key}>
                  <span className="dash-icon"><Icon size={18} aria-hidden="true" /></span>
                  {label}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        </div>

      </div>
    </DashboardLayout>
  );
}

export default HRDashboard;