import { Link } from "react-router-dom";
import {
  Wallet,
  Ticket,
  Bell,
  UserPlus,
  ClipboardCheck,
  FileBarChart,
  FileText,
  ArrowUpRight,
  CalendarDays,
  UserCheck,
  Plane,
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
import { AttendanceTrend, DepartmentDistribution, RecruitmentStats } from "./HRDashboardWidgets";
import useDashboardWidgets from "./useDashboardWidgets";
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

// Coloured dot + label + count for each part of a bar or gauge
function Legend({ parts, vertical = false }) {
  return (
    <ul className={`dash-legend${vertical ? " vertical" : ""}`}>
      {parts.map((part) => (
        <li key={part.key} className={`seg-${part.tone}`}>
          {part.label} <b>({part.value})</b>
        </li>
      ))}
    </ul>
  );
}

// One horizontal bar split by value; an empty grey track when everything is 0
function SegmentBar({ parts }) {
  return (
    <div className="dash-segbar" aria-hidden="true">
      {parts.filter((part) => part.value > 0).map((part) => (
        <i key={part.key} className={`seg-${part.tone}`} style={{ flexGrow: part.value }} />
      ))}
    </div>
  );
}

// Half-circle gauge; each part is an arc sized by its share of the total.
// A part with any people gets at least MIN_SHARE so 5 of 895 is still visible;
// the last part (the grey remainder) takes whatever is left.
const MIN_SHARE = 3;
const GAP = 1;

function Gauge({ parts, total, label, value }) {
  const arc = "M 16 86 A 70 70 0 0 1 156 86";
  const shares = parts.slice(0, -1).map((part) => (part.value > 0 ? Math.max((part.value / total) * 100, MIN_SHARE) : 0));
  shares.push(Math.max(100 - shares.reduce((sum, share) => sum + share, 0), 0));
  let start = 0;
  return (
    <div className="dash-gauge">
      <svg viewBox="0 0 172 96" aria-hidden="true">
        <path d={arc} pathLength="100" className="dash-gauge-track" />
        {total > 0 && parts.map((part, index) => {
          const share = shares[index];
          const offset = start;
          start += share;
          if (share <= 0 || (index === parts.length - 1 && part.value === 0)) return null;
          return (
            <path
              key={part.key}
              d={arc}
              pathLength="100"
              className={`dash-gauge-seg seg-${part.tone}`}
              strokeDasharray={`${Math.max(share - GAP, 0.5)} 100`}
              strokeDashoffset={-offset}
            />
          );
        })}
      </svg>
      <span className="dash-gauge-label">{label}<strong>{value}</strong></span>
    </div>
  );
}

// Small counts under a card value; a part with `to` is a link to that list
function MiniStats({ parts }) {
  return (
    <div className="dash-mini">
      {parts.map(({ key, tone, label, value, to }) => {
        const body = (
          <>
            <span className={`dash-mini-label seg-${tone}`}>{label}</span>
            <strong>{value}</strong>
          </>
        );
        return to
          ? <Link key={key} className="dash-mini-item" to={to}>{body}<ArrowUpRight className="dash-mini-arrow" size={13} aria-hidden="true" /></Link>
          : <div key={key} className="dash-mini-item">{body}</div>;
      })}
    </div>
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
  const widgets = useDashboardWidgets();
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

  const active = dashboardData?.totalEmployees ?? 0;
  const inactive = dashboardData?.inactiveEmployees ?? 0;
  const onLeave = dashboardData?.onLeave ?? 0;
  const present = dashboardData?.presentToday ?? 0;
  const absent = dashboardData?.absentToday ?? 0;
  const pendingLeaves = dashboardData?.pendingLeaves ?? 0;
  const openTickets = dashboardData?.openTickets ?? 0;
  const shown = (value) => (dashboardData ? value : "—");
  const pendingActions = shown(pendingLeaves + pendingHRResignations + openTickets);

  // Each count opens its own list, already filtered
  const LEAVE_PENDING = "/leave-management?status=Pending";
  const RESIGNATIONS_PENDING = "/resignations?card=pending-hr";
  const TICKETS_OPEN = "/tickets?status=Open";

  const employeeBar = [
    { key: "active", tone: "navy", label: t("hrDashboard.overview.active", { defaultValue: "Active" }), value: active },
    { key: "inactive", tone: "rose", label: t("hrDashboard.overview.inactive", { defaultValue: "Inactive" }), value: inactive },
  ];

  const employeeParts = [
    ...employeeBar.map((part) => ({ ...part, value: shown(part.value) })),
    { key: "joiners", tone: "orange", label: t("hrDashboard.stats.newJoiners", { defaultValue: "New Joiners" }), value: shown(dashboardData?.newJoiners ?? 0) },
  ];

  const actionParts = [
    { key: "leave", tone: "orange", to: LEAVE_PENDING, label: t("hrDashboard.overview.leaveRequests", { defaultValue: "Leave" }), value: pendingLeaves },
    { key: "resignations", tone: "navy", to: RESIGNATIONS_PENDING, label: t("hrDashboard.overview.resignations", { defaultValue: "Resignations" }), value: pendingHRResignations },
    { key: "tickets", tone: "amber", to: TICKETS_OPEN, label: t("hrDashboard.overview.tickets", { defaultValue: "Tickets" }), value: openTickets },
  ];

  // Not marked = active employees with no attendance saved today and not on leave
  const attendanceParts = [
    { key: "present", tone: "green", label: t("hrDashboard.widgets.present", { defaultValue: "Present" }), value: present },
    { key: "absent", tone: "rose", label: t("hrDashboard.widgets.absent", { defaultValue: "Absent" }), value: absent },
    { key: "leave", tone: "amber", label: t("hrDashboard.stats.onLeave", { defaultValue: "On Leave" }), value: onLeave },
    { key: "notMarked", tone: "muted", label: t("hrDashboard.overview.notMarked", { defaultValue: "Not marked" }), value: Math.max(active - present - absent - onLeave, 0) },
  ];
  const attendanceRate = active ? `${Math.round((present / active) * 1000) / 10}%` : "—";

  const quickActions = [
    { key: "employee", icon: UserPlus, to: "/employees?add=1", label: t("hrDashboard.quickActions.addEmployee", { defaultValue: "Add Employee" }) },
    { key: "leave", icon: ClipboardCheck, to: LEAVE_PENDING, label: t("hrDashboard.quickActions.leaveRequest", { defaultValue: "Leave Request" }) },
    { key: "payroll", icon: Wallet, to: "/payroll", label: t("hrDashboard.quickActions.runPayroll", { defaultValue: "Run Payroll" }) },
    { key: "requests", icon: FileText, to: "/hr/employee-requests", label: t("hrDashboard.quickActions.employeeRequests", { defaultValue: "Employee Requests" }) },
    { key: "tickets", icon: Ticket, to: TICKETS_OPEN, label: t("hrDashboard.stats.openTicketsTitle", { defaultValue: "Open Tickets" }) },
    { key: "reports", icon: FileBarChart, to: "/reports", label: t("menu.reports", { defaultValue: "Reports" }) },
  ];

  const viewLabel = t("hrDashboard.stats.viewDetails", { defaultValue: "View Details" });

  return (
    <DashboardLayout className="hr-dashboard-layout">
      <div className="dashboard-main dash-compact">

        {/* ================= TOP BAR ================= */}
        <header className="dash-topbar">
          <div className="dash-topbar-copy">
            <span className="dash-crumb">
              {t("hrDashboard.overview.title", { defaultValue: "Overview" })} / <b>{t("hrDashboard.title", { defaultValue: "HR Dashboard" })}</b>
            </span>
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
          </div>

          <div className="dash-topbar-side">
            <div className="dash-topbar-user">
              <div className="dash-profile" title={`${hrShownName} · ${hrRoleLabel}`}>
                <span className="dash-profile-avatar">
                  {hrProfilePhoto ? (
                    <img src={hrProfilePhoto} alt={t("hrDashboard.profilePhotoAlt", { name: hrShownName, defaultValue: "{{name}} profile" })} />
                  ) : (
                    hrInitials || "HR"
                  )}
                </span>
                <span className="dash-profile-info">
                  <strong>{hrShownName}</strong>
                  <small>{hrRoleLabel}</small>
                </span>
              </div>
              <button
                className="notification-btn"
                aria-label={t("hrDashboard.openNotifications", { defaultValue: "Open notifications" })}
                onClick={() => navigate("/hr/notifications")}
              >
                <Bell size={22} />
                {unreadCount > 0 && (
                  <span className="notification-dot" aria-label={t("hrDashboard.unreadNotifications", { count: unreadCount, defaultValue: "{{count}} unread notifications" })}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </div>
            <div className="dash-topbar-chips">
              <span><CalendarDays size={14} aria-hidden="true" />{formatAppDate(getCompanyToday())}</span>
              <span><UserCheck size={14} aria-hidden="true" />{t("hrDashboard.overview.presentToday", { count: present, defaultValue: "{{count}} present today" })}</span>
              <span><Plane size={14} aria-hidden="true" />{t("leaveManagement.hero.onLeaveToday", { count: onLeave, defaultValue: "{{count}} on leave today" })}</span>
            </div>
          </div>
        </header>

        {/* ================= OVERVIEW CARDS ================= */}
        <section className="dash-overview">
          <article className="dash-card">
            <div className="dash-card-head">
              <h2>{t("hrDashboard.stats.totalEmployees", { defaultValue: "Total Employees" })}</h2>
              <Link to="/employees" aria-label={viewLabel} title={viewLabel}><ArrowUpRight size={16} /></Link>
            </div>
            <div className="dash-card-value">
              <strong>{shown(active + inactive)}</strong>
              <span className="dash-card-sub">{t("hrDashboard.overview.allRecords", { defaultValue: "All employee records" })}</span>
            </div>
            <SegmentBar parts={employeeBar} />
            <MiniStats parts={employeeParts} />
          </article>

          <article className="dash-card">
            <div className="dash-card-head">
              <h2>{t("hrDashboard.overview.pendingActions", { defaultValue: "Pending Actions" })}</h2>
            </div>
            <div className="dash-card-value">
              <strong>{pendingActions}</strong>
              <Link className="dash-card-sub link" to="/recruitment">{t("hrDashboard.overview.openPositions", { count: dashboardData?.openPositions ?? 0, defaultValue: "{{count}} open positions" })}</Link>
            </div>
            <SegmentBar parts={actionParts} />
            <MiniStats parts={actionParts.map((part) => ({ ...part, value: shown(part.value) }))} />
          </article>

          <article className="dash-card dash-card-gauge">
            <div className="dash-card-head">
              <h2>{t("hrDashboard.overview.attendanceToday", { defaultValue: "Attendance Today" })}</h2>
              <Link to="/attendance" aria-label={viewLabel} title={viewLabel}><ArrowUpRight size={16} /></Link>
            </div>
            <div className="dash-gauge-row">
              <Gauge parts={attendanceParts} total={active} value={attendanceRate} label={t("hrDashboard.overview.attendanceRate", { defaultValue: "Present rate" })} />
              <Legend parts={attendanceParts} vertical />
            </div>
          </article>
        </section>

        {/* ================= MAIN GRID ================= */}
        <div className="dash-board">
          <div className="dash-board-main">
            <AttendanceTrend state={widgets.trend} />
            <DepartmentDistribution state={widgets.departments} />
          </div>

          <aside className="dash-board-side">
            <section className="dash-panel">
              <div className="dash-card-head">
                <h2>{t("hrDashboard.quickActions.title", { defaultValue: "Quick Actions" })}</h2>
              </div>
              <div className="dash-quick-grid">
                {quickActions.map(({ key, icon: Icon, to, label }) => (
                  <Link className="dash-quick-tile" to={to} key={key}>
                    <Icon size={17} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="dash-panel">
              <div className="dash-card-head">
                <h2>{t("hrDashboard.endOfService.title", { defaultValue: "Pending End of Service" })}</h2>
                <span className="dash-count">{endOfService.length}</span>
              </div>
              {endOfService.length === 0 ? (
                <p className="dash-panel-empty">{t("hrDashboard.endOfService.empty", { defaultValue: "No employees pending End of Service." })}</p>
              ) : (
                <ul className="dash-todo">
                  {endOfService.map((row) => (
                    <li key={row.id}>
                      <div>
                        <strong>{row.employee_name} ({row.employee_id})</strong>
                        <span>{row.department || "—"} · {t("hrDashboard.endOfService.lastWorkingDay", { date: formatDate(row.last_working_day), defaultValue: "Last working day {{date}}" })}{row.resignation_no ? ` · ${row.resignation_no}` : ""}</span>
                      </div>
                      <Link to={`/employees/employeedetails/${employeeSlug(row.employee_name)}`}>{t("hrDashboard.endOfService.viewEmployee", { defaultValue: "View employee" })}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <RecruitmentStats
              state={widgets.recruitment}
              action={<Link className="hrw-tag" to="/recruitment">{t("hrDashboard.overview.seeAll", { defaultValue: "See all" })}</Link>}
            />
          </aside>
        </div>

      </div>
    </DashboardLayout>
  );
}

export default HRDashboard;
