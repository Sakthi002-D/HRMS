import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Bell, ArrowRight } from "lucide-react";
import { ltrText, resignationStatusLabel } from "../components/resignation/resignationApi";
import DatePicker from "../components/layout/common/DatePicker";
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

// Displayed module name; the English name stays the filter value
const MODULE_KEYS = {
    Leave: "employeeNotifications.modules.leave",
    Resignation: "menu.resignation",
    Documents: "menu.documents",
    "Manpower Requests": "menu.manpowerRequests",
    Payroll: "menu.payroll",
    Attendance: "menu.attendance",
    Profile: "menu.profile",
    Settings: "menu.settings",
    General: "employeeNotifications.modules.general",
};

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
const AUTO_PARAMS = ["actor", "name", "reason", "title", "jobTitle", "department", "location", "assets"];
const autoText = (value) => (value ? `\u2068${value}\u2069` : value);

// Backend values (English) → the labels used inside the translated sentences.
// en.json uses the original values, so English reads exactly as the backend text.
const sentenceParams = (n, t, rtl) => {
    const params = { ...(n.params || {}) };
    const labels = {
        statusLabel: resignationStatusLabel(params.status),
        leaveTypeLabel: params.leaveType && t(`leaveTypes.${params.leaveType}`, { defaultValue: params.leaveType }),
        docLabelText: params.docType && t(`employeeDocuments.items.${params.docType}.title`, { defaultValue: params.docLabel }),
        roleLabel: params.role && (ROLE_KEYS[params.role] ? t(`recruitment.roles.${ROLE_KEYS[params.role]}`, { defaultValue: params.role }) : params.role),
        candidateTypeLabel: params.candidateType && t(`recruitment.values.candidateType.${valueKey(params.candidateType)}`, { defaultValue: params.candidateType }),
        requestTypeLabel: !params.requestType ? params.requestType
            : String(n.kind).startsWith("mpr_") ? t(`recruitment.values.requestType.${valueKey(params.requestType)}`, { defaultValue: params.requestType })
                : REQUEST_KEYS[params.requestType] ? t(`employeeDocuments.requests.${REQUEST_KEYS[params.requestType]}.title`, { defaultValue: params.requestType }) : params.requestType,
    };
    if (rtl) {
        LTR_PARAMS.forEach((key) => { if (params[key]) params[key] = ltrText(params[key]); });
        AUTO_PARAMS.forEach((key) => { if (params[key]) params[key] = autoText(params[key]); });
    }
    if (params.days !== undefined) labels.count = Number(params.days);
    return { ...params, ...labels };
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
    const { t, i18n } = useTranslation();
    const rtl = i18n.dir() === "rtl";
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [moduleFilter, setModuleFilter] = useState("all");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    // Newest first, by the exact date AND time of each notification
    const items = useMemo(() => notifications
        .map((n) => ({ ...n, _module: moduleOf(n), _key: dateKey(n), _time: parse(rawDate(n))?.getTime() || 0 }))
        .sort((a, b) => b._time - a._time), [notifications]);

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

    const moduleLabel = (module) => (MODULE_KEYS[module] ? t(MODULE_KEYS[module], { defaultValue: module }) : module);

    // Translated title / message; any kind without a key (or old data) shows the backend's English text
    const kindText = (n, field, params) => (n.kind
        ? t(`employeeNotifications.kinds.${n.kind}.${field}`, { ...params, defaultValue: n[field] })
        : n[field]);

    return (
        <section className="empnotif-section">
            <div className="empnotif-card">
                <p className="empnotif-count"><Trans i18nKey="employeeNotifications.unreadOf" values={{ unread: unreadCount, total: items.length }} components={{ b: <strong /> }} defaults="<b>{{unread}}</b> unread of {{total}}" /></p>

                <div className="empnotif-filters">
                    <input type="search" placeholder={t("employeeNotifications.searchPlaceholder", { defaultValue: "Search title or message" })} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t("employeeNotifications.searchLabel", { defaultValue: "Search notifications" })} />
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label={t("employeeNotifications.statusFilterLabel", { defaultValue: "Filter by read status" })}>
                        <option value="all">{t("employeeNotifications.allMessages", { defaultValue: "All messages" })}</option>
                        <option value="unread">{t("employeeNotifications.unread", { defaultValue: "Unread" })}</option>
                        <option value="read">{t("employeeNotifications.read", { defaultValue: "Read" })}</option>
                    </select>
                    <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} aria-label={t("employeeNotifications.moduleFilterLabel", { defaultValue: "Filter by module" })}>
                        <option value="all">{t("employeeNotifications.allModules", { defaultValue: "All modules" })}</option>
                        {modules.map((m) => <option key={m} value={m}>{moduleLabel(m)}</option>)}
                    </select>
                    <div className="empnotif-date" role="group" aria-label={t("employeeNotifications.fromDate", { defaultValue: "From date" })} title={t("employeeNotifications.fromDate", { defaultValue: "From date" })}>
                        <DatePicker value={fromDate} onChange={setFromDate} autoPosition />
                    </div>
                    <div className="empnotif-date" role="group" aria-label={t("employeeNotifications.toDate", { defaultValue: "To date" })} title={t("employeeNotifications.toDate", { defaultValue: "To date" })}>
                        <DatePicker value={toDate} onChange={setToDate} minDate={fromDate || undefined} autoPosition />
                    </div>
                    <button type="button" className="empnotif-clear" onClick={clearFilters}>{t("employeeNotifications.clear", { defaultValue: "Clear" })}</button>
                </div>

                <div className="empnotif-list">
                    {visible.length === 0 ? (
                        <div className="empnotif-empty">
                            {items.length === 0
                                ? t("employeeNotifications.empty", { defaultValue: "You are all caught up." })
                                : t("employeeNotifications.noMatch", { defaultValue: "No notifications match these filters." })}
                        </div>
                    ) : visible.map((n) => {
                        const params = sentenceParams(n, t, rtl);
                        return (
                        <button key={n.id} type="button" className={`empnotif-item${n.read ? "" : " is-unread"}`} onClick={() => onOpen(n)}>
                            <span className="empnotif-icon"><Bell size={17} /></span>
                            <span className="empnotif-copy">
                                <span className="empnotif-title-row">
                                    <strong>{kindText(n, "title", params)}</strong>
                                    <span className={`empnotif-badge ${n.read ? "read" : "unread"}`}>{n.read ? t("employeeNotifications.read", { defaultValue: "Read" }) : t("employeeNotifications.unread", { defaultValue: "Unread" })}</span>
                                </span>
                                <span className="empnotif-message" dir={n.kind === "request_rejected_reason" ? "auto" : undefined}>{kindText(n, "message", n.kind === "request_rejected_reason" ? n.params : params)}</span>
                                <small>{moduleLabel(n._module)} · {parse(rawDate(n))
                                    ? <bdi dir="ltr">{formatDate(n)}</bdi>
                                    : (n.kind ? t(`employeeNotifications.kinds.${n.kind}.time`, { ...params, defaultValue: formatDate(n) }) : formatDate(n))}</small>
                            </span>
                            <ArrowRight className="empnotif-arrow" size={16} />
                        </button>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

export default EmployeeNotifications;