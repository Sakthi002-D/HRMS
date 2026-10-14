import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { CalendarCheck, AlertCircle, ArrowRight } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { loadEmployeeActivityNotifications } from "../../components/hr/hrNotificationSources";
import { ltrText, resignationStatusLabel } from "../../components/resignation/resignationApi";
import DatePicker from "../../components/layout/common/DatePicker";
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

// Displayed module name; the English name stays the filter value
const MODULE_KEYS = {
  "Employee Requests": "hrEmployeeRequests.title",
  Documents: "menu.documents",
  Leave: "employeeNotifications.modules.leave",
  Resignation: "menu.resignation",
  Recruitment: "menu.recruitment",
};

// Kinds built on this page / in hrNotificationSources.js. Inbox kinds (resignation, MPR, job applications)
// come from the backend and reuse the Employee portal texts (employeeNotifications.kinds.*).
const HR_KINDS = ["employee_request", "document_upload", "leave_request", "leave_request_from"];

// Saved request type (English) → the key the Documents page already uses for its title
const REQUEST_KEYS = {
  "Salary Certificate": "salaryCertificate",
  "NOC Request": "nocRequest",
  "Letter Request": "letterRequest",
  "Expense Reimbursement": "expenseReimbursement",
};

// Role label in the backend sentence → the key recruitment.roles already translates
const ROLE_KEYS = {
  "Department Coordinator": "DEPT_COORDINATOR",
  "Department Head": "DEPT_HEAD",
  "Line Manager": "LINE_MANAGER",
  HR: "HR",
  "COO/CTO": "EXEC",
  COO: "COO",
  CTO: "CTO",
  Finance: "FINANCE",
  CEO: "CEO",
  Procurement: "PROCUREMENT",
  IT: "IT",
  Payroll: "PAYROLL",
};

const valueKey = (value) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

// Numbers, dates, IDs and file names read left-to-right inside an Arabic sentence;
// names, titles and free text keep their own direction (first-strong isolate)
const LTR_PARAMS = ["number", "date", "previousDate", "startDate", "endDate", "fileName", "employeeId", "jobId", "applicationNo"];
const AUTO_PARAMS = ["actor", "name", "employeeName", "reason", "title", "jobTitle", "department", "location", "assets"];
const autoText = (value) => (value ? `\u2068${value}\u2069` : value);

// English values → the labels used inside the translated sentences.
// en.json uses the original values, so English reads exactly as before.
const sentenceParams = (item, t, rtl) => {
  const params = { ...(item.params || {}) };
  const labels = {
    statusLabel: resignationStatusLabel(params.status),
    leaveTypeLabel: params.leaveType && t(`leaveTypes.${params.leaveType}`, { defaultValue: params.leaveType }),
    docLabelText: params.docType && t(`employeeDocuments.items.${params.docType}.title`, { defaultValue: params.docLabel }),
    roleLabel: params.role && (ROLE_KEYS[params.role] ? t(`recruitment.roles.${ROLE_KEYS[params.role]}`, { defaultValue: params.role }) : params.role),
    candidateTypeLabel: params.candidateType && t(`recruitment.values.candidateType.${valueKey(params.candidateType)}`, { defaultValue: params.candidateType }),
    requestTypeLabel: !params.requestType ? params.requestType
      : String(item.kind).startsWith("mpr_") ? t(`recruitment.values.requestType.${valueKey(params.requestType)}`, { defaultValue: params.requestType })
        : REQUEST_KEYS[params.requestType] ? t(`employeeDocuments.requests.${REQUEST_KEYS[params.requestType]}.title`, { defaultValue: params.requestType }) : params.requestType,
  };
  if (rtl) {
    LTR_PARAMS.forEach((key) => { if (params[key]) params[key] = ltrText(params[key]); });
    AUTO_PARAMS.forEach((key) => { if (params[key]) params[key] = autoText(params[key]); });
  }
  return { ...params, ...labels };
};

function Notifications() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === "rtl";
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
              kind: leave.from_date ? "leave_request_from" : "leave_request",
              // count = Number(leave.days), the same value the English "day"/"days" check uses
              params: { name: leave.employee_name || leave.employee_id, leaveType: leave.leave_type, days: String(leave.days || 1), count: Number(leave.days), date: leave.from_date ? formatDate(leave.from_date) : "" },
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
                kind: item.kind,
                params: item.params,
              };
            });
          }
        }

        // Employee requests + Visa / Passport uploads (shared with the Dashboard bell)
        const activityItems = await loadEmployeeActivityNotifications(hrProfile.employee_id);

        const readIds = getReadIds();
        const all = [...activityItems, ...inboxItems, ...leaveItems]
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

  // Translated title / message, built at render time so it follows a language change.
  // Any kind without a key (or old data) shows the original English text.
  const textOf = (item, field) => {
    if (!item.kind) return item[field];
    const block = HR_KINDS.includes(item.kind) ? "hrNotifications" : "employeeNotifications";
    return t(`${block}.kinds.${item.kind}.${field}`, { ...sentenceParams(item, t, rtl), defaultValue: item[field] });
  };

  const moduleLabel = (module) => (MODULE_KEYS[module] ? t(MODULE_KEYS[module], { defaultValue: module }) : module);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notifications.filter((item) => {
      // English text as before, plus the text shown in the current language
      if (query && !`${item.title} ${item.message} ${textOf(item, "title")} ${textOf(item, "message")}`.toLowerCase().includes(query)) return false;
      if (statusFilter === "unread" && item.read) return false;
      if (statusFilter === "read" && !item.read) return false;
      if (moduleFilter !== "all" && item.module !== moduleFilter) return false;
      const key = dateKey(item.date);
      if (fromDate && (!key || key < fromDate)) return false;
      if (toDate && (!key || key > toDate)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, search, statusFilter, moduleFilter, fromDate, toDate, i18n.language]);

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
          <h1>{t("employeeHeader.notifications.title", { defaultValue: "Notifications" })}</h1>
          <p>
            {loading
              ? t("hrNotifications.subtitle", { defaultValue: "All updates that need your attention." })
              : <Trans i18nKey="hrNotifications.subtitleWithCount" count={unreadCount} values={{ count: unreadCount }} components={{ c: <span className="hrnotif-unread-count" /> }} defaults="All updates that need your attention.<c> {{count}} unread</c>" />}
          </p>
        </header>

        <section className="hrnotif-card">
          <div className="hrnotif-filters">
            <input
              type="search"
              placeholder={t("employeeNotifications.searchPlaceholder", { defaultValue: "Search title or message" })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("employeeNotifications.searchLabel", { defaultValue: "Search notifications" })}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label={t("employeeNotifications.statusFilterLabel", { defaultValue: "Filter by read status" })}>
              <option value="all">{t("employeeNotifications.allMessages", { defaultValue: "All messages" })}</option>
              <option value="unread">{t("employeeNotifications.unread", { defaultValue: "Unread" })}</option>
              <option value="read">{t("employeeNotifications.read", { defaultValue: "Read" })}</option>
            </select>
            <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} aria-label={t("employeeNotifications.moduleFilterLabel", { defaultValue: "Filter by module" })}>
              <option value="all">{t("employeeNotifications.allModules", { defaultValue: "All modules" })}</option>
              {modules.map((m) => <option key={m} value={m}>{moduleLabel(m)}</option>)}
            </select>
            <div className="hrnotif-date" role="group" aria-label={t("employeeNotifications.fromDate", { defaultValue: "From date" })} title={t("employeeNotifications.fromDate", { defaultValue: "From date" })}>
              <DatePicker value={fromDate} onChange={setFromDate} autoPosition />
            </div>
            <div className="hrnotif-date" role="group" aria-label={t("employeeNotifications.toDate", { defaultValue: "To date" })} title={t("employeeNotifications.toDate", { defaultValue: "To date" })}>
              <DatePicker value={toDate} onChange={setToDate} minDate={fromDate || undefined} autoPosition />
            </div>
            <button type="button" className="hrnotif-clear" onClick={clearFilters}>{t("employeeNotifications.clear", { defaultValue: "Clear" })}</button>
          </div>

          <div className="hrnotif-list">
            {loading ? (
              <div className="hrnotif-empty">{t("hrNotifications.loading", { defaultValue: "Loading notifications..." })}</div>
            ) : visible.length === 0 ? (
              <div className="hrnotif-empty">
                {notifications.length === 0
                  ? t("employeeNotifications.empty", { defaultValue: "You are all caught up." })
                  : t("employeeNotifications.noMatch", { defaultValue: "No notifications match these filters." })}
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
                      <strong>{textOf(item, "title")}</strong>
                      <span className={`hrnotif-badge ${item.read ? "read" : "unread"}`}>
                        {item.read ? t("employeeNotifications.read", { defaultValue: "Read" }) : t("employeeNotifications.unread", { defaultValue: "Unread" })}
                      </span>
                    </span>
                    <span className="hrnotif-message">{textOf(item, "message")}</span>
                    <small>{moduleLabel(item.module)} · <bdi dir="ltr">{formatDate(item.date)}</bdi></small>
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