// HR portal → Resignation: every resignation with summary cards, filters and the
// shared detail view (tracker, tracking log and HR Accept / Reject).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

function Resignations() {
    const { t } = useTranslation();
    // Card titles: the four single-status cards reuse the status labels; the counts still use English statuses
    const cardLabel = (card) => (card.key === "closed"
        ? t("hrResignations.cards.closed", { defaultValue: card.label })
        : resignationStatusLabel(card.label));
    const [hrId] = useState(getSessionHRId);
    const [version, setVersion] = useState(0);
    const [loaded, setLoaded] = useState({ key: null, rows: [], error: "" });
    const [filters, setFilters] = useState(EMPTY_FILTERS);
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
        if (!DAYS_LEFT_STATUSES.includes(row.status) || row.days_left === null || row.days_left === undefined) return <span className="emp-muted">—</span>;
        return (
            <span className={`resignation-days-left${row.days_left <= DAYS_LEFT_WARNING ? " urgent" : ""}`}>
                {t("resignation.case.daysLeft", { count: row.days_left, defaultValue: row.days_left === 1 ? "{{count}} day left" : "{{count}} days left" })}
            </span>
        );
    };

    return (
        <DashboardLayout>
            <div className="recruitment-page resignations-page">
                <div className="recruitment-header">
                    <div>
                        <h1>{t("hrResignations.title", { defaultValue: "Resignations" })}</h1>
                        <p>{t("hrResignations.subtitle", { defaultValue: "Manage employee resignation requests" })}</p>
                    </div>
                </div>

                <div className="resignation-summary-cards">
                    {RESIGNATION_CARDS.map((card) => (
                        <button
                            key={card.key}
                            type="button"
                            className={`recruitment-card resignation-summary-card tone-${card.key}${filters.card === card.key ? " active" : ""}`}
                            aria-pressed={filters.card === card.key}
                            onClick={() => updateFilter({ card: filters.card === card.key ? "" : card.key, status: "" })}
                        >
                            <h3>{cardLabel(card)}</h3>
                            <h2>{loading ? "—" : counts[card.key]}</h2>
                        </button>
                    ))}
                </div>

                <div className="jobs-section">
                    <div className="resignation-filters">
                        <input
                            type="search"
                            className="job-search"
                            placeholder={t("hrResignations.searchPlaceholder", { defaultValue: "Search name or employee ID" })}
                            value={filters.search}
                            onChange={(event) => updateFilter({ search: event.target.value })}
                            aria-label={t("hrResignations.searchLabel", { defaultValue: "Search by name or employee ID" })}
                        />
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
                            <button type="button" className="resignation-clear-filters" onClick={() => updateFilter(EMPTY_FILTERS)}>
                                {t("employeesList.filters.clear", { defaultValue: "Clear filters" })}
                            </button>
                        )}
                        <div className="resignation-rows-control">
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

                    {loaded.error && <p className="mpr-form-error">{loaded.error}</p>}

                    <div className="jobs-table-container">
                        <table className="jobs-table">
                            <thead>
                                <tr>
                                    <th>{t("hrResignations.table.resignationNo", { defaultValue: "Resignation No" })}</th>
                                    <th>{t("resignation.approvals.employee", { defaultValue: "Employee" })}</th>
                                    <th>{t("resignation.approvals.department", { defaultValue: "Department" })}</th>
                                    <th>{t("resignation.form.resignationDate", { defaultValue: "Resignation Date" })}</th>
                                    <th>{t("resignation.form.lastWorkingDay", { defaultValue: "Last Working Day" })}</th>
                                    <th>{t("resignation.form.noticePeriod", { defaultValue: "Notice Period" })}</th>
                                    <th>{t("hrResignations.table.daysLeft", { defaultValue: "Days left" })}</th>
                                    <th>{t("hrResignations.table.earlyRelease", { defaultValue: "Early Release" })}</th>
                                    <th>{t("resignation.approvals.status", { defaultValue: "Status" })}</th>
                                    <th>{t("resignation.approvals.action", { defaultValue: "Action" })}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="10">{t("resignation.detail.loading", { defaultValue: "Loading..." })}</td></tr>
                                ) : pageRows.length === 0 ? (
                                    <tr><td colSpan="10">{rows.length === 0
                                        ? t("hrResignations.table.none", { defaultValue: "No resignations yet." })
                                        : t("hrResignations.table.noMatch", { defaultValue: "No resignations match these filters." })}</td></tr>
                                ) : pageRows.map((row) => (
                                    <tr key={row.id} className={row.status === "Pending HR" ? "mpr-row-awaiting" : ""}>
                                        {/* Numbers, IDs and dates keep their left-to-right order on the Arabic page */}
                                        <td><span dir="ltr" className="ltr-text">{row.resignation_no}</span></td>
                                        <td>
                                            <strong id={`resignation-row-${row.id}`}>{row.employee_name}</strong>
                                            <small className="resignation-employee-id"><span dir="ltr">{row.employee_id}</span></small>
                                        </td>
                                        <td>{row.department || "—"}</td>
                                        <td><span dir="ltr" className="ltr-text">{formatDate(row.resignation_date)}</span></td>
                                        <td><span dir="ltr" className="ltr-text">{formatDate(row.last_working_day)}</span></td>
                                        <td>{daysLabel(row.notice_period_days)}</td>
                                        <td>{daysLeftCell(row)}</td>
                                        <td>
                                            <span className={`resignation-flag ${row.early_release ? "yes" : "no"}`}>
                                                {row.early_release
                                                    ? t("resignation.detail.yes", { defaultValue: "Yes" })
                                                    : t("resignation.detail.no", { defaultValue: "No" })}
                                            </span>
                                        </td>
                                        <td><span className={`mpr-status ${resignationTone(row.status)}`}>{resignationStatusLabel(row.status)}</span></td>
                                        <td>
                                            <button type="button" className="create-job-btn" onClick={() => setSelectedId(row.id)} aria-describedby={`resignation-row-${row.id}`}>
                                                {row.status === "Pending HR"
                                                    ? t("resignation.approvals.review", { defaultValue: "Review" })
                                                    : t("recruitment.common.view", { defaultValue: "View" })}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filtered.length > rowsPerPage && (
                        <Pagination page={page} pageCount={totalPages} onChange={setCurrentPage} />
                    )}
                </div>

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
