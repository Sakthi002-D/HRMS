// HR → Recruitment → Job Applications: cards, filters, table and the application detail.
import { useMemo, useState } from "react";
import DatePicker from "../layout/common/DatePicker";
import ApplicationDetail from "./ApplicationDetail";
import { Eye } from "lucide-react";
import { APPLICATION_STATUSES, CANDIDATE_TYPES, SOURCE_OPTIONS, experienceText, salaryText, sourceText } from "./applicationFormat";
import { applicationTone, formatDate } from "./recruitmentApi";

const EMPTY_FILTERS = { job: "", department: "", type: "", source: "", status: "", from: "", to: "" };

const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

function JobApplications({ actorId, applications, loading, error, jobs, jobFilter, onJobFilterChange, onChanged }) {
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [search, setSearch] = useState("");
    const [viewId, setViewId] = useState(null);

    // Job filter is controlled by the page so Job Openings → "Applications" can set it
    const activeFilters = { ...filters, job: jobFilter || "" };
    const setFilter = (field) => (value) => {
        if (field === "job") onJobFilterChange(value);
        else setFilters((current) => ({ ...current, [field]: value }));
    };

    const options = useMemo(() => {
        const jobOptions = new Map();
        jobs.forEach((job) => jobOptions.set(job.job_id, job.title));
        applications.forEach((row) => !jobOptions.has(row.job_id) && jobOptions.set(row.job_id, row.job_title));
        return {
            jobs: [...jobOptions.entries()].sort(([a], [b]) => a.localeCompare(b)),
            departments: uniqueSorted(applications.map((row) => row.department)),
            sources: uniqueSorted([...SOURCE_OPTIONS, ...applications.map((row) => row.source)]),
        };
    }, [applications, jobs]);

    const counts = useMemo(() => ({
        total: applications.length,
        New: applications.filter((row) => row.status === "New").length,
        Shortlisted: applications.filter((row) => row.status === "Shortlisted").length,
        Rejected: applications.filter((row) => row.status === "Rejected").length,
    }), [applications]);

    const query = search.trim().toLowerCase();
    const visible = applications.filter((row) => {
        const f = activeFilters;
        if (f.job && row.job_id !== f.job) return false;
        if (f.department && row.department !== f.department) return false;
        if (f.type && row.candidate_type !== f.type) return false;
        if (f.source && row.source !== f.source) return false;
        if (f.status && row.status !== f.status) return false;
        if (f.from && (!row.applied_on || row.applied_on < f.from)) return false;
        if (f.to && (!row.applied_on || row.applied_on > f.to)) return false;
        return !query || [row.candidate_name, row.email, row.application_id].some((value) => String(value || "").toLowerCase().includes(query));
    });

    const anyFilter = query || Object.values(activeFilters).some(Boolean);
    const clearFilters = () => {
        setFilters(EMPTY_FILTERS);
        setSearch("");
        onJobFilterChange("");
    };

    return (
        <div className="jobs-section app-section">
            <div className="recruitment-cards four app-cards">
                {[
                    ["Total Applications", counts.total, ""],
                    ["New", counts.New, "New"],
                    ["Shortlisted", counts.Shortlisted, "Shortlisted"],
                    ["Rejected", counts.Rejected, "Rejected"],
                ].map(([label, value, status]) => (
                    <button
                        key={label}
                        type="button"
                        className={`recruitment-card app-card${activeFilters.status === status && status ? " active" : ""}`}
                        onClick={() => setFilter("status")(activeFilters.status === status ? "" : status)}
                        aria-pressed={Boolean(status) && activeFilters.status === status}
                    >
                        <h3>{label}</h3>
                        <h2>{loading && !applications.length ? "—" : value}</h2>
                    </button>
                ))}
            </div>

            <div className="jobs-section-header">
                <h2>Job Applications</h2>
                <input
                    type="search"
                    placeholder="Search name, email or application no..."
                    className="job-search app-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
            </div>

            <div className="app-filters">
                <select value={activeFilters.job} onChange={(event) => setFilter("job")(event.target.value)} aria-label="Job">
                    <option value="">All jobs</option>
                    {options.jobs.map(([id, title]) => <option key={id} value={id}>{id} – {title}</option>)}
                </select>
                <select value={activeFilters.department} onChange={(event) => setFilter("department")(event.target.value)} aria-label="Department">
                    <option value="">All departments</option>
                    {options.departments.map((value) => <option key={value}>{value}</option>)}
                </select>
                <select value={activeFilters.type} onChange={(event) => setFilter("type")(event.target.value)} aria-label="Candidate type">
                    <option value="">Fresher &amp; Experienced</option>
                    {CANDIDATE_TYPES.map((value) => <option key={value}>{value}</option>)}
                </select>
                <select value={activeFilters.source} onChange={(event) => setFilter("source")(event.target.value)} aria-label="Source">
                    <option value="">All sources</option>
                    {options.sources.map((value) => <option key={value}>{value}</option>)}
                </select>
                <select value={activeFilters.status} onChange={(event) => setFilter("status")(event.target.value)} aria-label="Status">
                    <option value="">All statuses</option>
                    {uniqueSorted([...APPLICATION_STATUSES, ...applications.map((row) => row.status)]).map((value) => <option key={value}>{value}</option>)}
                </select>
                <div className="app-date-filter">
                    <DatePicker value={activeFilters.from} onChange={setFilter("from")} placeholder="Applied from" autoPosition />
                </div>
                <div className="app-date-filter">
                    <DatePicker value={activeFilters.to} onChange={setFilter("to")} placeholder="Applied to" minDate={activeFilters.from || undefined} autoPosition />
                </div>
                {anyFilter && (
                    <button type="button" className="cancel-btn app-clear" onClick={clearFilters}>Clear filters</button>
                )}
            </div>

            {error && <p className="mpr-form-error">{error}</p>}

            <div className="jobs-table-container">
                <table className="jobs-table app-table">
                    <thead>
                        <tr>
                            <th>Application No</th>
                            <th>Candidate</th>
                            <th>Job</th>
                            <th>Type</th>
                            <th>Experience</th>
                            <th>Expected Salary</th>
                            <th>Notice Period</th>
                            <th>Source / Agency</th>
                            <th>Applied On</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !applications.length && (
                            <tr><td colSpan="11">Loading applications...</td></tr>
                        )}
                        {!loading && visible.length === 0 && (
                            <tr><td colSpan="11">{applications.length ? "No applications match these filters." : "No applications yet."}</td></tr>
                        )}
                        {visible.map((row) => (
                            <tr key={row.id} className={row.status === "New" ? "app-row-new" : ""}>
                                <td><strong>{row.application_id}</strong></td>
                                <td>
                                    <strong>{row.candidate_name}</strong>
                                    <small className="app-sub">{row.email}</small>
                                </td>
                                <td>
                                    <strong>{row.job_id}</strong>
                                    <small className="app-sub">{row.job_title || "—"}</small>
                                </td>
                                <td>
                                    {row.candidate_type
                                        ? <span className={`app-type ${row.candidate_type === "Fresher" ? "fresher" : "experienced"}`}>{row.candidate_type}</span>
                                        : "—"}
                                </td>
                                <td>{experienceText(row)}</td>
                                <td>{salaryText(row.expected_salary, row.salary_currency, row.expected_ctc)}</td>
                                <td>{row.notice_period || "—"}</td>
                                <td>{sourceText(row)}</td>
                                <td>{formatDate(row.applied_on)}</td>
                                <td><span className={`mpr-status ${applicationTone(row.status)}`}>{row.status}</span></td>
                                <td>
                                    <button type="button" className="employee-view-button" onClick={() => setViewId(row.id)} aria-label="View" title="View">
                                        <Eye size={18} strokeWidth={2} aria-hidden="true" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {viewId && (
                <ApplicationDetail
                    applicationId={viewId}
                    actorId={actorId}
                    onClose={() => setViewId(null)}
                    onChanged={onChanged}
                />
            )}
        </div>
    );
}

export default JobApplications;
