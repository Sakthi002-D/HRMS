import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ManpowerRequests from "../../components/recruitment/ManpowerRequests";
import RecruitmentPlanModal from "../../components/recruitment/RecruitmentPlanModal";
import JobApplications from "../../components/recruitment/JobApplications";
import { Building2, Briefcase, Clock3, UserPlus } from "lucide-react";
import { usePagination, RowsPerPage, Pagination } from "../../components/common/TablePagination";
import {
    api,
    formatDate,
    getSessionEmployeeId,
    mprStatusLabel,
    notifyApplicationsChanged,
    recruitmentValueLabel,
    statusTone,
} from "../../components/recruitment/recruitmentApi";
import "./Recruitment.css";
import "../../components/recruitment/recruitment.css";

const TABS = [
    { id: "manpower", label: "Manpower Requests" },
    { id: "jobs", label: "Job Openings" },
    { id: "applications", label: "Job Applications" },
];

// New applications from the Careers page show up without a manual refresh
const APPLICATIONS_POLL_MS = 30000;

function Recruitment() {
    const { t } = useTranslation();
    const hrId = getSessionEmployeeId();
    const [activeTab, setActiveTab] = useState("manpower");
    const [mprFormOpen, setMprFormOpen] = useState(false);

    const [applications, setApplications] = useState({ rows: [], loading: true, error: "" });
    const [applicationJobFilter, setApplicationJobFilter] = useState("");
    const knownApplicationIds = useRef(null);

    const [jobs, setJobs] = useState([]);
    const [jobSearch, setJobSearch] = useState("");
    const [summary, setSummary] = useState(null);
    const [meta, setMeta] = useState(null);
    const [planJob, setPlanJob] = useState(null);

    const hrQuery = `employee_id=${encodeURIComponent(hrId || "")}`;

    const fetchJobs = useCallback(async () => {
        try {
            setJobs(await api(`/api/jobs?${hrQuery}`));
        } catch (error) {
            console.error("Error fetching jobs:", error);
        }
    }, [hrQuery]);

    // Card counts (pending MPR approvals, open jobs, unfilled positions, departments)
    const fetchSummary = async () => {
        try {
            setSummary(await api("/api/mprs/summary"));
        } catch (error) {
            console.error("Error fetching recruitment summary:", error);
        }
    };

    // After an MPR action or plan save: refresh the cards and the job table
    const refreshRecruitment = () => {
        fetchJobs();
        fetchSummary();
    };

    const fetchApplications = useCallback(async () => {
        try {
            const rows = await api(`/api/hr/job-applications?${hrQuery}`);
            // A new application arrived since the last fetch: refresh the sidebar badge too
            const known = knownApplicationIds.current;
            if (known && rows.some((row) => !known.has(row.id))) notifyApplicationsChanged();
            knownApplicationIds.current = new Set(rows.map((row) => row.id));
            setApplications({ rows, loading: false, error: "" });
        } catch (error) {
            setApplications((current) => ({ ...current, loading: false, error: error.message }));
        }
    }, [hrQuery]);

    useEffect(() => {
        fetchJobs();
        fetchApplications();
        fetchSummary();
        api(`/api/recruitment/meta?employee_id=${encodeURIComponent(hrId || "")}`)
            .then(setMeta)
            .catch((error) => console.error("Error fetching recruitment options:", error));
    }, [hrId, fetchJobs, fetchApplications]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") fetchApplications();
        }, APPLICATIONS_POLL_MS);
        return () => window.clearInterval(timer);
    }, [fetchApplications]);

    const newApplications = applications.rows.filter((row) => row.status === "New").length;

    const openNewManpowerRequest = () => {
        setActiveTab("manpower");
        setMprFormOpen(true);
    };

    const openJobApplications = (jobId) => {
        setApplicationJobFilter(jobId);
        setActiveTab("applications");
    };

    const search = jobSearch.trim().toLowerCase();
    const visibleJobs = jobs.filter(
        (job) =>
            !search ||
            [job.job_id, job.title, job.department, job.mpr_no, job.location]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(search))
    );
    
    const jobsPager = usePagination(visibleJobs);
    const setJobsPage = jobsPager.setPage;

    // Typing in "Search jobs..." goes back to page 1
    useEffect(() => { setJobsPage(1); }, [search, setJobsPage]);

    return (
        <DashboardLayout>
            <div className="recruitment-page">

                {/* Title, New MPR button and stat cards: not on Job Applications (it has its own cards).
                    The summary stays in state, so the cards show instantly when switching back. */}
                {activeTab !== "applications" && (
                <>
                <div className="recruitment-header">
                    <div>
                        <h1>{t("menu.recruitment", { defaultValue: "Recruitment" })}</h1>
                        <p>{t("recruitment.page.subtitle", { defaultValue: "Manage manpower requests, job openings and recruitment activities" })}</p>
                    </div>

                    <button
                        className="create-job-btn"
                        onClick={openNewManpowerRequest}
                    >
                        {t("recruitment.mpr.newButton", { defaultValue: "+ New Manpower Request" })}
                    </button>
                </div>

                <div className="recruitment-cards four">

                    <div className="recruitment-card">
                        <Clock3 className="recruitment-stat-icon pending" size={20} aria-hidden="true" />
                        <div className="recruitment-card-content">
                            <span>{t("recruitment.page.pendingMprApprovals", { defaultValue: "Pending MPR Approvals" })}</span>
                            <strong>{summary?.pending_mpr_approvals ?? "—"}</strong>
                        </div>
                    </div>

                    <div className="recruitment-card">
                        <Briefcase className="recruitment-stat-icon jobs" size={20} aria-hidden="true" />
                        <div className="recruitment-card-content">
                            <span>{t("recruitment.page.openJobs", { defaultValue: "Open Jobs" })}</span>
                            <strong>{summary?.open_jobs ?? "—"}</strong>
                        </div>
                    </div>

                    <div className="recruitment-card">
                        <UserPlus className="recruitment-stat-icon positions" size={20} aria-hidden="true" />
                        <div className="recruitment-card-content">
                            <span>{t("hrDashboard.stats.openPositionsTitle", { defaultValue: "Open Positions" })}</span>
                            <strong>{summary?.open_positions ?? "—"}</strong>
                        </div>
                    </div>

                    <div className="recruitment-card">
                        <Building2 className="recruitment-stat-icon departments" size={20} aria-hidden="true" />
                        <div className="recruitment-card-content">
                            <span>{t("recruitment.page.departments", { defaultValue: "Departments" })}</span>
                            <strong>{summary?.departments ?? "—"}</strong>
                        </div>
                    </div>

                </div>
                </>
                )}

                <div className="recruitment-tabs" role="tablist">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            className={activeTab === tab.id ? "active" : ""}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {t(`recruitment.tabs.${tab.id}`, { defaultValue: tab.label })}
                            {tab.id === "applications" && newApplications > 0 && (
                                <em className="tab-badge" aria-label={t("recruitment.page.newCount", { number: newApplications, defaultValue: "{{number}} new" })} title={t("recruitment.page.newNotReviewed", { number: newApplications, defaultValue: "{{number}} new (not reviewed)" })}>
                                    {newApplications > 99 ? "99+" : newApplications}
                                </em>
                            )}
                        </button>
                    ))}
                </div>

                {activeTab === "manpower" && (
                    <ManpowerRequests
                        actorId={hrId}
                        formOpen={mprFormOpen}
                        onFormOpenChange={setMprFormOpen}
                        onChanged={refreshRecruitment}
                        showNewButton={false}
                    />
                )}

                {activeTab === "jobs" && (
                <div className="jobs-section">

                    <div className="jobs-section-header">
                        <h2>{t("recruitment.tabs.jobs", { defaultValue: "Job Openings" })}</h2>

                        <div className="tp-header-actions">
                            <input
                                type="text"
                                placeholder={t("recruitment.jobs.searchPlaceholder", { defaultValue: "Search jobs..." })}
                                className="job-search"
                                value={jobSearch}
                                onChange={(event) => setJobSearch(event.target.value)}
                            />
                            <RowsPerPage value={jobsPager.pageSize} onChange={jobsPager.setPageSize} />
                        </div>
                    </div>
                    

                    <div className="jobs-table-container">

                        <table className="jobs-table">

                            <thead>
                                <tr>
                                    <th>{t("recruitment.fields.jobId", { defaultValue: "Job ID" })}</th>
                                    <th>{t("recruitment.fields.mprNo", { defaultValue: "MPR No" })}</th>
                                    <th>{t("recruitment.fields.jobTitle", { defaultValue: "Job Title" })}</th>
                                    <th>{t("profileEdit.fields.department", { defaultValue: "Department" })}</th>
                                    <th>{t("recruitment.fields.requestType", { defaultValue: "Request Type" })}</th>
                                    <th>{t("recruitment.jobs.filledOpenings", { defaultValue: "Filled / Openings" })}</th>
                                    <th>{t("recruitment.fields.experience", { defaultValue: "Experience" })}</th>
                                    <th>{t("recruitment.fields.location", { defaultValue: "Location" })}</th>
                                    <th>{t("recruitment.fields.type", { defaultValue: "Type" })}</th>
                                    <th>{t("recruitment.fields.applicationDeadline", { defaultValue: "Application Deadline" })}</th>
                                    <th>{t("recruitment.jobs.agency", { defaultValue: "Agency" })}</th>
                                    <th>{t("recruitment.jobs.applications", { defaultValue: "Applications" })}</th>
                                    <th>{t("profileEdit.fields.status", { defaultValue: "Status" })}</th>
                                    <th>{t("recruitment.fields.action", { defaultValue: "Action" })}</th>
                                </tr>
                            </thead>

                            <tbody>

                                {visibleJobs.length === 0 && (
                                    <tr><td colSpan="14">{t("recruitment.jobs.empty", { defaultValue: "No job openings found." })}</td></tr>
                                )}

                                {jobsPager.pageItems.map((job) => (
                                    <tr key={job.id}>

                                        <td><span dir="ltr" className="ltr-text">{job.job_id}</span></td>

                                        <td>
                                            {job.mpr_no ? <span dir="ltr" className="ltr-text">{job.mpr_no}</span> : <span className="job-badge legacy">{t("recruitment.jobs.noMprLegacy", { defaultValue: "No MPR (legacy)" })}</span>}
                                        </td>

                                        <td>
                                            <strong>
                                                {job.title}
                                            </strong>
                                        </td>

                                        <td>{job.department}</td>

                                        <td>{job.request_type ? recruitmentValueLabel("requestType", job.request_type) : "—"}</td>

                                        <td><span dir="ltr">{job.filled ?? 0}/{job.openings}</span></td>

                                        <td>{job.experience}</td>

                                        <td>{job.location}</td>

                                        <td>{recruitmentValueLabel("employmentType", job.employment_type)}</td>

                                        <td>
                                            {job.application_deadline ? <span dir="ltr" className="ltr-text">{formatDate(job.application_deadline)}</span> : "—"}
                                            {job.deadline_passed && (
                                                <>
                                                    <br />
                                                    <span className="job-badge deadline">{t("recruitment.jobs.deadlinePassed", { defaultValue: "Deadline passed" })}</span>
                                                </>
                                            )}
                                        </td>

                                        <td>
                                            {job.sourcing === "Internal" ? recruitmentValueLabel("sourcing", "Internal") : job.agency_name || "—"}
                                        </td>

                                        <td>
                                            <button
                                                type="button"
                                                className="job-apps-link"
                                                onClick={() => openJobApplications(job.job_id)}
                                                title={t("recruitment.jobs.viewApplicationsFor", { id: job.job_id, defaultValue: "View applications for {{id}}" })}
                                            >
                                                {job.applications_count ?? 0}
                                                {job.new_applications > 0 && <span className="job-badge new">{t("recruitment.page.newCount", { number: job.new_applications, defaultValue: "{{number}} new" })}</span>}
                                            </button>
                                        </td>

                                        <td>
                                            <span className={`job-status tone-${statusTone(job.status)}`}>
                                                {mprStatusLabel(job.status)}
                                            </span>
                                        </td>

                                        <td>
                                            <div className="job-actions">
                                                <button
                                                    type="button"
                                                    className="create-job-btn"
                                                    onClick={() => setPlanJob(job)}
                                                    disabled={!meta || String(job.status).toLowerCase() === "closed"}
                                                >
                                                    {t("recruitment.jobs.editPlan", { defaultValue: "Edit Recruitment Plan" })}
                                                </button>
                                            </div>
                                        </td>

                                    </tr>
                                ))}

                            </tbody>

                        </table>

                    </div>

                    <Pagination page={jobsPager.page} pageCount={jobsPager.pageCount} onChange={jobsPager.setPage} />

                </div>
                )}

                {planJob && meta && (
                    <RecruitmentPlanModal
                        job={planJob}
                        meta={meta}
                        actorId={hrId}
                        onClose={() => setPlanJob(null)}
                        onSaved={() => {
                            setPlanJob(null);
                            refreshRecruitment();
                        }}
                    />
                )}

                {activeTab === "applications" && (
                    <JobApplications
                        actorId={hrId}
                        applications={applications.rows}
                        loading={applications.loading}
                        error={applications.error}
                        jobs={jobs}
                        jobFilter={applicationJobFilter}
                        onJobFilterChange={setApplicationJobFilter}
                        onChanged={() => {
                            fetchApplications();
                            fetchJobs();
                        }}
                    />
                )}

            </div>
        </DashboardLayout>
    );
}

export default Recruitment;