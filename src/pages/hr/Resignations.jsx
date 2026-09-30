// HR portal → Resignation: every resignation with summary cards, filters and the
// shared detail view (tracker, tracking log and HR Accept / Reject).
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ResignationDetail from "../../components/resignation/ResignationDetail";
import {
    api,
    daysLabel,
    formatDate,
    getSessionHRId,
    notifyResignationsChanged,
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
        setBanner({ id: Date.now(), text: `Resignation ${resignation.resignation_no} ${outcome}. ${resignation.employee_name} has been notified.` });
        setVersion((value) => value + 1);
        notifyResignationsChanged();
    };

    return (
        <DashboardLayout>
            <div className="recruitment-page resignations-page">
                <div className="recruitment-header">
                    <div>
                        <h1>Resignations</h1>
                        <p>Manage employee resignation requests</p>
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
                            <h3>{card.label}</h3>
                            <h2>{loading ? "—" : counts[card.key]}</h2>
                        </button>
                    ))}
                </div>

                <div className="jobs-section">
                    <div className="resignation-filters">
                        <input
                            type="search"
                            className="job-search"
                            placeholder="Search name or employee ID"
                            value={filters.search}
                            onChange={(event) => updateFilter({ search: event.target.value })}
                            aria-label="Search by name or employee ID"
                        />
                        <select
                            value={filters.status}
                            onChange={(event) => updateFilter({ status: event.target.value, card: "" })}
                            aria-label="Filter by status"
                        >
                            <option value="">All status</option>
                            {RESIGNATION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                        <select
                            value={filters.department}
                            onChange={(event) => updateFilter({ department: event.target.value })}
                            aria-label="Filter by department"
                        >
                            <option value="">All departments</option>
                            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                        </select>
                        <input
                            type="month"
                            value={filters.month}
                            onChange={(event) => updateFilter({ month: event.target.value })}
                            aria-label="Resignation month"
                            title="Resignation month"
                        />
                        {hasFilters && (
                            <button type="button" className="resignation-clear-filters" onClick={() => updateFilter(EMPTY_FILTERS)}>
                                Clear filters
                            </button>
                        )}
                        <div className="resignation-rows-control">
                            <label htmlFor="resignations-per-page">Rows per page</label>
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
                                    <th>Resignation No</th>
                                    <th>Employee</th>
                                    <th>Department</th>
                                    <th>Resignation Date</th>
                                    <th>Last Working Day</th>
                                    <th>Notice Period</th>
                                    <th>Early Release</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="9">Loading...</td></tr>
                                ) : pageRows.length === 0 ? (
                                    <tr><td colSpan="9">{rows.length === 0 ? "No resignations yet." : "No resignations match these filters."}</td></tr>
                                ) : pageRows.map((row) => (
                                    <tr key={row.id} className={row.status === "Pending HR" ? "mpr-row-awaiting" : ""}>
                                        <td>{row.resignation_no}</td>
                                        <td>
                                            <strong>{row.employee_name}</strong>
                                            <small className="resignation-employee-id">{row.employee_id}</small>
                                        </td>
                                        <td>{row.department || "—"}</td>
                                        <td>{formatDate(row.resignation_date)}</td>
                                        <td>{formatDate(row.last_working_day)}</td>
                                        <td>{daysLabel(row.notice_period_days)}</td>
                                        <td>
                                            <span className={`resignation-flag ${row.early_release ? "yes" : "no"}`}>
                                                {row.early_release ? "Yes" : "No"}
                                            </span>
                                        </td>
                                        <td><span className={`mpr-status ${resignationTone(row.status)}`}>{row.status}</span></td>
                                        <td>
                                            <button type="button" className="create-job-btn" onClick={() => setSelectedId(row.id)}>
                                                {row.status === "Pending HR" ? "Review" : "View"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filtered.length > rowsPerPage && (
                        <div className="pagination">
                            <button type="button" disabled={page === 1} onClick={() => setCurrentPage(page - 1)}>← Previous</button>
                            {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
                                <button
                                    key={number}
                                    type="button"
                                    className={number === page ? "active-page" : ""}
                                    onClick={() => setCurrentPage(number)}
                                >
                                    {number}
                                </button>
                            ))}
                            <button type="button" disabled={page === totalPages} onClick={() => setCurrentPage(page + 1)}>Next →</button>
                        </div>
                    )}
                </div>

                {banner && createPortal(
                    <div key={banner.id} className="resignation-toast success" role="status" aria-live="polite">
                        <span>{banner.text}</span>
                        <button type="button" aria-label="Dismiss" onClick={() => setBanner(null)}>×</button>
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
