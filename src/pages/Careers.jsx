// Public Careers page (no login): open job openings only, with search and filters.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BriefcaseBusiness, CalendarClock, CalendarDays, GraduationCap, MapPin, Search, Users } from "lucide-react";
import CareersHeader from "../components/careers/CareersHeader";
import CareersFooter from "../components/careers/CareersFooter";
import { careersApi, formatJobDate } from "../components/careers/careersApi";
import "./Careers.css";

const EMPTY_FILTERS = { department: "", location: "", employment_type: "", experience_level: "" };

const uniqueSorted = (values) =>
    [...new Map(values.filter(Boolean).map((value) => [value.trim().toLowerCase(), value.trim()])).values()]
        .sort((a, b) => a.localeCompare(b));

function Careers() {
    const [jobs, setJobs] = useState([]);
    const [status, setStatus] = useState({ loading: true, error: "" });
    const [search, setSearch] = useState("");
    const [filters, setFilters] = useState(EMPTY_FILTERS);

    useEffect(() => {
        let ignore = false;
        careersApi("/api/careers/jobs")
            .then((rows) => {
                if (ignore) return;
                setJobs(rows);
                setStatus({ loading: false, error: "" });
            })
            .catch((error) => !ignore && setStatus({ loading: false, error: error.message }));
        return () => { ignore = true; };
    }, []);

    const options = useMemo(() => ({
        department: uniqueSorted(jobs.map((job) => job.department)),
        location: uniqueSorted(jobs.map((job) => job.location)),
        employment_type: uniqueSorted(jobs.map((job) => job.employment_type)),
    }), [jobs]);

    const query = search.trim().toLowerCase();
    const visibleJobs = jobs.filter((job) => {
        const same = (field) => !filters[field] || String(job[field] || "").trim().toLowerCase() === filters[field].toLowerCase();
        const matchesSearch = !query || [job.title, job.department, job.location, job.skills, job.job_id]
            .some((value) => String(value || "").toLowerCase().includes(query));
        return matchesSearch && same("department") && same("location") && same("employment_type") && same("experience_level");
    });

    const setFilter = (field) => (event) => setFilters((current) => ({ ...current, [field]: event.target.value }));
    const filtersActive = query || Object.values(filters).some(Boolean);

    return (
        <div className="careers-page">
            <CareersHeader />

            <section className="careers-hero">
                <p className="careers-eyebrow">CAREERS AT SHELTER GROUP</p>
                <h1>Find your next role with us</h1>
                <p>Explore our current openings and apply online in a few minutes.</p>
            </section>

            <main className="careers-main">
                <section className="careers-toolbar" aria-label="Search and filter jobs">
                    <label className="careers-search">
                        <Search size={18} aria-hidden="true" />
                        <input
                            type="search"
                            placeholder="Search by job title, skill or location"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            aria-label="Search jobs"
                        />
                    </label>

                    <div className="careers-filters">
                        <select value={filters.department} onChange={setFilter("department")} aria-label="Department">
                            <option value="">All departments</option>
                            {options.department.map((value) => <option key={value}>{value}</option>)}
                        </select>
                        <select value={filters.location} onChange={setFilter("location")} aria-label="Location">
                            <option value="">All locations</option>
                            {options.location.map((value) => <option key={value}>{value}</option>)}
                        </select>
                        <select value={filters.employment_type} onChange={setFilter("employment_type")} aria-label="Employment type">
                            <option value="">All employment types</option>
                            {options.employment_type.map((value) => <option key={value}>{value}</option>)}
                        </select>
                        <select value={filters.experience_level} onChange={setFilter("experience_level")} aria-label="Experience level">
                            <option value="">Any experience</option>
                            <option value="Fresher">Fresher</option>
                            <option value="Experienced">Experienced</option>
                        </select>
                        {filtersActive && (
                            <button type="button" className="careers-clear" onClick={() => { setSearch(""); setFilters(EMPTY_FILTERS); }}>
                                Clear
                            </button>
                        )}
                    </div>
                </section>

                {status.loading && <p className="careers-state">Loading open positions...</p>}
                {status.error && <p className="careers-state error">{status.error}</p>}

                {!status.loading && !status.error && (
                    <>
                        <p className="careers-count">
                            {visibleJobs.length} open position{visibleJobs.length === 1 ? "" : "s"}
                            {filtersActive && jobs.length !== visibleJobs.length ? ` of ${jobs.length}` : ""}
                        </p>

                        {visibleJobs.length === 0 ? (
                            <div className="careers-empty">
                                <BriefcaseBusiness size={34} aria-hidden="true" />
                                <h2>{jobs.length ? "No jobs match your search" : "No open positions right now"}</h2>
                                <p>{jobs.length ? "Try a different keyword or clear the filters." : "Please check back soon for new opportunities."}</p>
                            </div>
                        ) : (
                            <div className="careers-grid">
                                {visibleJobs.map((job) => (
                                    <article key={job.job_id} className="career-card">
                                        <div className="career-card-top">
                                            <span className="career-dept">{job.department}</span>
                                            <span className={`career-level ${job.experience_level === "Fresher" ? "fresher" : "experienced"}`}>
                                                {job.experience_level}
                                            </span>
                                        </div>
                                        <h2>{job.title}</h2>
                                        <ul className="career-facts">
                                            <li><MapPin size={15} aria-hidden="true" />{job.location || "—"}</li>
                                            <li><BriefcaseBusiness size={15} aria-hidden="true" />{job.employment_type || "—"}</li>
                                            <li><GraduationCap size={15} aria-hidden="true" />{job.experience}</li>
                                            <li><Users size={15} aria-hidden="true" />{job.openings} opening{Number(job.openings) === 1 ? "" : "s"}</li>
                                        </ul>
                                        <div className="career-dates">
                                            <span><CalendarDays size={14} aria-hidden="true" />Posted {formatJobDate(job.posted_on)}</span>
                                            <span className={job.apply_by ? "deadline" : ""}>
                                                <CalendarClock size={14} aria-hidden="true" />
                                                {job.apply_by ? `Apply by ${formatJobDate(job.apply_by)}` : "Open until filled"}
                                            </span>
                                        </div>
                                        <Link className="career-apply-link" to={`/careers/${encodeURIComponent(job.job_id)}`}>
                                            View &amp; Apply
                                        </Link>
                                    </article>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </main>

            <CareersFooter />
        </div>
    );
}

export default Careers;
