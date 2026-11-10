// HR portal → Resignation: every resignation with summary cards, filters and the
// shared detail view (tracker, tracking log and HR Accept / Reject).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, Clock3, Eye, FileCheck2, Hourglass, Search,
    ShieldCheck, UserCheck, Users, Wallet, X, XCircle,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ResignationCase from "../../components/resignation/ResignationCase";
import { Pagination } from "../../components/common/TablePagination";
import ResignationMonthPicker from "../../components/resignation/ResignationMonthPicker";
import {
    api,
    daysLabel,
    formatDate,
    getSessionHRId,
    notifyResignationsChanged,
    resignationStatusLabel,
    resignationTone,
} from "../../components/resignation/resignationApi";
import {
    EMPTY_FILTERS,
    DAYS_LEFT_STATUSES,
    DAYS_LEFT_WARNING,
    RESIGNATION_CARDS,
    RESIGNATION_STATUSES,
    countByCard,
    departmentsOf,
    filterResignations,
} from "../../components/resignation/resignationListState";
import "./Recruitment.css";
import "../../components/recruitment/recruitment.css";
import "../../components/resignation/resignation.css";
import "./Resignations.css";

// One icon per stage card
const CARD_ICONS = {
    "pending-lm": UserCheck,
    "pending-hr": Hourglass,
    serving: Clock3,
    clearance: ShieldCheck,
    settlement: Wallet,
    formalities: FileCheck2,
    completed: CheckCircle2,
    closed: XCircle,
};
const CLOSED_STATUSES = ["Completed", "Rejected", "Withdrawn"];

const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");

function Resignations() {
    const { t } = useTranslation();
    // Card titles: the four single-status cards reuse the status labels; the counts still use English statuses
    const cardLabel = (card) => (card.key === "closed"
        ? t("hrResignations.cards.closed", { defaultValue: card.label })
        : resignationStatusLabel(card.label));
    const [hrId] = useState(getSessionHRId);
    const [version, setVersion] = useState(0);
    const [loaded, setLoaded] = useState({ key: null, rows: [], error: "" });
    const [searchParams] = useSearchParams();
    // The dashboard links here with ?card=pending-hr
    const [filters, setFilters] = useState(() => {
        const card = searchParams.get("card");
        return RESIGNATION_CARDS.some((item) => item.key === card) ? { ...EMPTY_FILTERS, card } : EMPTY_FILTERS;
    });
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedId, setSelectedId] = useState(null);

    const loadKey = `${hrId}:${version}`;

    useEffect(() => {
        if (!hrId) return undefined;
        let ignore = false;
        api(`/api/hr/resignations?employee_id=${encodeURIComponent(hrId)}`)
            .then((rows) => !ignore && setLoaded({ key: loadKey, rows, error: "" }))
            .catch((err) => !ignore && setLoaded((current) => ({ ...current, key: loadKey, error: err.message })));
        return () => { ignore = true; };
    }, [hrId, loadKey]);

    const rows = loaded.rows;
    const loading = loaded.key !== loadKey && rows.length === 0;
    const counts = useMemo(() => countByCard(rows), [rows]);
    const departments = useMemo(() => departmentsOf(rows), [rows]);
    const filtered = useMemo(() => filterResignations(rows, filters), [rows, filters]);
    const stats = useMemo(() => ({
        open: rows.filter((row) => !CLOSED_STATUSES.includes(row.status)).length,
        needsHr: rows.filter((row) => row.status === "Pending HR").length,
        leavingSoon: rows.filter((row) => DAYS_LEFT_STATUSES.includes(row.status) && row.days_left !== null && row.days_left !== undefined && row.days_left <= DAYS_LEFT_WARNING).length,
    }), [rows]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
    const page = Math.min(currentPage, totalPages);
    const pageRows = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    const updateFilter = (changes) => {
        setFilters((current) => ({ ...current, ...changes }));
        setCurrentPage(1);
    };
    const hasFilters = Object.values(filters).some(Boolean);

    // Any change in the case window (it stays open): refresh table, cards and sidebar badge
    const handleChanged = () => {
        setVersion((value) => value + 1);
        notifyResignationsChanged();
    };
    const closeCase = useCallback(() => setSelectedId(null), []);

    const daysLeftCell = (row) => {
        if (!DAYS_LEFT_STATUSES.includes(row.status) || row.days_left === null || row.days_left === undefined) return <span className="rsx-muted">—</span>;
        return (
            <span className={`rsx-days${row.days_left <= DAYS_LEFT_WARNING ? " urgent" : ""}`}>
                {row.days_left <= DAYS_LEFT_WARNING && <AlertTriangle size={13} aria-hidden="true" />}
                {t("resignation.case.daysLeft", { count: row.days_left, defaultValue: row.days_left === 1 ? "{{count}} day left" : "{{count}} days left" })}
            </span>
        );
    };

    return (
        <DashboardLayout>
            <div className="recruitment-page resignations-page rsx">
                <header className="rsx-hero">
                    <div>
                        <span className="rsx-kicker">{t("hrResignations.kicker", { defaultValue: "Employee exits" })}</span>
                        <h1>{t("hrResignations.title", { defaultValue: "Resignations" })}</h1>
                        <p>{t("hrResignations.subtitle", { defaultValue: "Manage employee resignation requests" })}</p>
                    </div>
                    <div className="rsx-hero-stats">
                        <div>
                            <Users size={16} aria-hidden="true" />
                            <strong>{loading ? "—" : stats.open}</strong>
                            <span>{t("hrResignations.stats.open", { defaultValue: "Open cases" })}</span>
                        </div>
                        <button
                            type="button"
                            className={filters.card === "pending-hr" ? "active" : ""}
                            aria-pressed={filters.card === "pending-hr"}
                            onClick={() => updateFilter({ card: filters.card === "pending-hr" ? "" : "pending-hr", status: "" })}
                        >
                            <Hourglass size={16} aria-hidden="true" />
                            <strong>{loading ? "—" : stats.needsHr}</strong>
                            <span>{t("hrResignations.stats.needsHr", { defaultValue: "Waiting for HR" })}</span>
                        </button>
                        <div className={stats.leavingSoon ? "warn" : ""}>
                            <CalendarClock size={16} aria-hidden="true" />
                            <strong>{loading ? "—" : stats.leavingSoon}</strong>
                            <span>{t("hrResignations.stats.leavingSoon", { count: DAYS_LEFT_WARNING, defaultValue: "Leaving in {{count}} days" })}</span>
                        </div>
                    </div>
                </header>

                <div className="rsx-stages" role="group" aria-label={t("hrResignations.stagesLabel", { defaultValue: "Resignation stages" })}>
                    {RESIGNATION_CARDS.map((card) => {
                        const Icon = CARD_ICONS[card.key] || Clock3;
                        const active = filters.card === card.key;
                        return (
                            <button
                                key={card.key}
                                type="button"
                                className={`rsx-stage tone-${card.key}${active ? " active" : ""}${counts[card.key] ? "" : " empty"}`}
                                aria-pressed={active}
                                onClick={() => updateFilter({ card: active ? "" : card.key, status: "" })}
                            >
                                <span className="rsx-stage-icon" aria-hidden="true"><Icon size={18} /></span>
                                <span className="rsx-stage-text">
                                    <strong>{loading ? "—" : counts[card.key]}</strong>
                                    <span>{cardLabel(card)}</span>
                                </span>
                                <ChevronRight size={16} className="rsx-stage-arrow" aria-hidden="true" />
                            </button>
                        );
                    })}
                </div>

                <section className="rsx-card">
                    <div className="resignation-filters rsx-toolbar">
                        <label className="rsx-search">
                            <Search size={16} aria-hidden="true" />
                            <input
                                type="search"
                                placeholder={t("hrResignations.searchPlaceholder", { defaultValue: "Search name or employee ID" })}
                                value={filters.search}
                                onChange={(event) => updateFilter({ search: event.target.value })}
                                aria-label={t("hrResignations.searchLabel", { defaultValue: "Search by name or employee ID" })}
                            />
                        </label>
                        <select
                            value={filters.status}
                            onChange={(event) => updateFilter({ status: event.target.value, card: "" })}
                            aria-label={t("employeesList.filters.byStatus", { defaultValue: "Filter by status" })}
                        >
                            <option value="">{t("employeesList.filters.allStatus", { defaultValue: "All status" })}</option>
                            {RESIGNATION_STATUSES.map((status) => <option key={status} value={status}>{resignationStatusLabel(status)}</option>)}
                        </select>
                        <select
                            value={filters.department}
                            onChange={(event) => updateFilter({ department: event.target.value })}
                            aria-label={t("hrResignations.filterByDepartment", { defaultValue: "Filter by department" })}
                        >
                            <option value="">{t("recruitment.applications.allDepartments", { defaultValue: "All departments" })}</option>
                            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                        </select>
                        <ResignationMonthPicker
                            value={filters.month}
                            onChange={(month) => updateFilter({ month })}
                            label={t("hrResignations.month", { defaultValue: "Resignation month" })}
                        />
                        {hasFilters && (
                            <button type="button" className="rsx-clear" onClick={() => updateFilter(EMPTY_FILTERS)}>
                                <X size={14} aria-hidden="true" />
                                {t("employeesList.filters.clear", { defaultValue: "Clear filters" })}
                            </button>
                        )}
                        <div className="resignation-rows-control rsx-rows">
                            <label htmlFor="resignations-per-page">{t("employeeAttendance.rowsPerPage", { defaultValue: "Rows per page" })}</label>
                            <select
                                id="resignations-per-page"
                                value={rowsPerPage}
                                onChange={(event) => {
                                    setRowsPerPage(Number(event.target.value));
                                    setCurrentPage(1);
                                }}
                            >
                                <option value="10">10</option>
                                <option value="25">25</option>
                                <option value="50">50</option>
                            </select>
                        </div>
                    </div>

                    <p className="rsx-result" role="status">
                        {t("hrResignations.showing", { count: filtered.length, total: rows.length, defaultValue: "Showing {{count}} of {{total}} resignations" })}
                    </p>

                    {loaded.error && <p className="rsx-error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{loaded.error}</p>}

                    <div className="rsx-table-wrap">
                        <table className="rsx-table">
                            <thead>
                                <tr>
                                    <th>{t("resignation.approvals.employee", { defaultValue: "Employee" })}</th>
                                    <th>{t("hrResignations.table.resignationNo", { defaultValue: "Resignation No" })}</th>
                                    <th>{t("resignation.approvals.department", { defaultValue: "Department" })}</th>
                                    <th>{t("resignation.form.resignationDate", { defaultValue: "Resignation Date" })}</th>
                                    <th>{t("resignation.form.lastWorkingDay", { defaultValue: "Last Working Day" })}</th>
                                    <th>{t("hrResignations.table.daysLeft", { defaultValue: "Days left" })}</th>
                                    <th>{t("resignation.approvals.status", { defaultValue: "Status" })}</th>
                                    <th><span className="rsx-sr">{t("resignation.approvals.action", { defaultValue: "Action" })}</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="8" className="rsx-empty">{t("resignation.detail.loading", { defaultValue: "Loading..." })}</td></tr>
                                ) : pageRows.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="rsx-empty">
                                            <FileCheck2 size={28} aria-hidden="true" />
                                            <span>{rows.length === 0
                                                ? t("hrResignations.table.none", { defaultValue: "No resignations yet." })
                                                : t("hrResignations.table.noMatch", { defaultValue: "No resignations match these filters." })}</span>
                                        </td>
                                    </tr>
                                ) : pageRows.map((row) => {
                                    const awaiting = row.status === "Pending HR";
                                    return (
                                        <tr key={row.id} className={awaiting ? "awaiting" : ""} onClick={() => setSelectedId(row.id)}>
                                            <td>
                                                <span className="rsx-person">
                                                    <span className="rsx-avatar" aria-hidden="true">{initials(row.employee_name)}</span>
                                                    <span className="rsx-person-text">
                                                        <strong id={`resignation-row-${row.id}`}>{row.employee_name}</strong>
                                                        <small dir="ltr">{row.employee_id}</small>
                                                    </span>
                                                </span>
                                            </td>
                                            {/* Numbers, IDs and dates keep their left-to-right order on the Arabic page */}
                                            <td><span dir="ltr" className="rsx-no">{row.resignation_no}</span></td>
                                            <td>{row.department || <span className="rsx-muted">—</span>}</td>
                                            <td><span dir="ltr" className="ltr-text">{formatDate(row.resignation_date)}</span></td>
                                            <td>
                                                <span className="rsx-date">
                                                    <span dir="ltr" className="ltr-text">{formatDate(row.last_working_day)}</span>
                                                    <small>
                                                        {t("hrResignations.table.notice", { days: daysLabel(row.notice_period_days), defaultValue: "{{days}} notice" })}
                                                        {row.early_release && <span className="rsx-early">{t("hrResignations.table.early", { defaultValue: "Early release" })}</span>}
                                                    </small>
                                                </span>
                                            </td>
                                            <td>{daysLeftCell(row)}</td>
                                            <td><span className={`mpr-status ${resignationTone(row.status)}`}>{resignationStatusLabel(row.status)}</span></td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className={`rsx-action${awaiting ? " primary" : ""}`}
                                                    onClick={(event) => { event.stopPropagation(); setSelectedId(row.id); }}
                                                    aria-describedby={`resignation-row-${row.id}`}
                                                >
                                                    {awaiting ? <CheckCircle2 size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                                                    {awaiting
                                                        ? t("resignation.approvals.review", { defaultValue: "Review" })
                                                        : t("recruitment.common.view", { defaultValue: "View" })}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {filtered.length > rowsPerPage && (
                        <Pagination page={page} pageCount={totalPages} onChange={setCurrentPage} />
                    )}
                </section>

                {selectedId && (
                    <ResignationCase
                        resignationId={selectedId}
                        onClose={closeCase}
                        onChanged={handleChanged}
                    />
                )}
            </div>
        </DashboardLayout>
    );
}

export default Resignations;
