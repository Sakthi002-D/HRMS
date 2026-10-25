// HR portal → Resignation: every resignation with summary cards, filters and the
// shared detail view (tracker, tracking log and HR Accept / Reject).
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ResignationDetail from "../../components/resignation/ResignationDetail";
import { Pagination } from "../../components/common/TablePagination";
import {
    api,
    daysLabel,
    formatDate,
    getSessionHRId,
    ltrText,
    notifyResignationsChanged,
    resignationStatusLabel,
    resignationTone,
} from "../../components/resignation/resignationApi";
import {
    EMPTY_FILTERS,
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
    const [banner, setBanner] = useState(null);

    const loadKey = `${hrId}:${version}`;

    useEffect(() => {
        if (!hrId) return undefined;
        let ignore = false;
        api(`/api/hr/resignations?employee_id=${encodeURIComponent(hrId)}`)
            .then((rows) => !ignore && setLoaded({ key: loadKey, rows, error: "" }))
            .catch((err) => !ignore && setLoaded((current) => ({ ...current, key: loadKey, error: err.message })));
        return () => { ignore = true; };
    }, [hrId, loadKey]);

    // The success banner hides itself after a few seconds
    useEffect(() => {
        if (!banner) return undefined;
        const timer = setTimeout(() => setBanner(null), 6000);
        return () => clearTimeout(timer);
    }, [banner]);

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

    // After Accept / Reject: close the review, show the banner, refresh table, cards and sidebar badge
    const handleDecided = ({ action, resignation }) => {
        const outcome = action === "reject" ? "rejected" : resignation.status === "Serving Notice" ? "accepted" : "approved";
        setSelectedId(null);
        setBanner({
            id: Date.now(),
            text: t(`hrResignations.banner.${outcome}`, {
                number: ltrText(resignation.resignation_no),
                name: resignation.employee_name,
                defaultValue: `Resignation {{number}} ${outcome}. {{name}} has been notified.`,
            }),
        });
        setVersion((value) => value + 1);
        notifyResignationsChanged();
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
                        <input
                            type="month"
                            value={filters.month}
                            onChange={(event) => updateFilter({ month: event.target.value })}
                            aria-label={t("hrResignations.month", { defaultValue: "Resignation month" })}
                            title={t("hrResignations.month", { defaultValue: "Resignation month" })}
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
                                    <th>{t("hrResignations.table.earlyRelease", { defaultValue: "Early Release" })}</th>
                                    <th>{t("resignation.approvals.status", { defaultValue: "Status" })}</th>
                                    <th>{t("resignation.approvals.action", { defaultValue: "Action" })}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="9">{t("resignation.detail.loading", { defaultValue: "Loading..." })}</td></tr>
                                ) : pageRows.length === 0 ? (
                                    <tr><td colSpan="9">{rows.length === 0
                                        ? t("hrResignations.table.none", { defaultValue: "No resignations yet." })
                                        : t("hrResignations.table.noMatch", { defaultValue: "No resignations match these filters." })}</td></tr>
                                ) : pageRows.map((row) => (
                                    <tr key={row.id} className={row.status === "Pending HR" ? "mpr-row-awaiting" : ""}>
                                        {/* Numbers, IDs and dates keep their left-to-right order on the Arabic page */}
                                        <td><span dir="ltr" className="ltr-text">{row.resignation_no}</span></td>
                                        <td>
                                            <strong>{row.employee_name}</strong>
                                            <small className="resignation-employee-id"><span dir="ltr">{row.employee_id}</span></small>
                                        </td>
                                        <td>{row.department || "—"}</td>
                                        <td><span dir="ltr" className="ltr-text">{formatDate(row.resignation_date)}</span></td>
                                        <td><span dir="ltr" className="ltr-text">{formatDate(row.last_working_day)}</span></td>
                                        <td>{daysLabel(row.notice_period_days)}</td>
                                        <td>
                                            <span className={`resignation-flag ${row.early_release ? "yes" : "no"}`}>
                                                {row.early_release
                                                    ? t("resignation.detail.yes", { defaultValue: "Yes" })
                                                    : t("resignation.detail.no", { defaultValue: "No" })}
                                            </span>
                                        </td>
                                        <td><span className={`mpr-status ${resignationTone(row.status)}`}>{resignationStatusLabel(row.status)}</span></td>
                                        <td>
                                            <button type="button" className="create-job-btn" onClick={() => setSelectedId(row.id)}>
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

                {banner && createPortal(
                    <div key={banner.id} className="resignation-toast success" role="status" aria-live="polite">
                        <span>{banner.text}</span>
                        <button type="button" aria-label={t("hrResignations.dismiss", { defaultValue: "Dismiss" })} onClick={() => setBanner(null)}>×</button>
                    </div>,
                    document.body
                )}

                {selectedId && (
                    <ResignationDetail
                        resignationId={selectedId}
                        actorId={hrId}
                        onClose={() => setSelectedId(null)}
                        onDecided={handleDecided}
                    />
                )}
            </div>
        </DashboardLayout>
    );
}

export default Resignations;
