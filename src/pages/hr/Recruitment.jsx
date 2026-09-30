import { useState, useEffect } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ManpowerRequests from "../../components/recruitment/ManpowerRequests";
import RecruitmentPlanModal from "../../components/recruitment/RecruitmentPlanModal";
import { api, formatDate, getSessionEmployeeId, statusTone } from "../../components/recruitment/recruitmentApi";
import "./Recruitment.css";
import "../../components/recruitment/recruitment.css";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const TABS = [
    { id: "manpower", label: "Manpower Requests" },
    { id: "jobs", label: "Job Openings" },
    { id: "applications", label: "Job Applications" },
];

function Recruitment() {
    const hrId = getSessionEmployeeId();
    const [activeTab, setActiveTab] = useState("manpower");
    const [mprFormOpen, setMprFormOpen] = useState(false);

    const [applications, setApplications] = useState([]);
    const [selectedApplication, setSelectedApplication] = useState(null);
    const [showApplication, setShowApplication] = useState(false);

    const [jobs, setJobs] = useState([]);
    const [jobSearch, setJobSearch] = useState("");
    const [summary, setSummary] = useState(null);
    const [meta, setMeta] = useState(null);
    const [planJob, setPlanJob] = useState(null);

    const fetchJobs = async () => {
        try {
            const response = await fetch(`${API_URL}/api/jobs`, { cache: "no-store" });

            if (!response.ok) {
            throw new Error("Failed to fetch jobs");
            }

            const data = await response.json();

            setJobs(data);
        } catch (error) {
         console.error("Error fetching jobs:", error);
        }
    };

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


    const fetchApplications = async () => {
    try {
        const response = await fetch(`${API_URL}/api/job-applications`);

        if (!response.ok) {
            throw new Error("Failed to fetch applications");
        }

        const data = await response.json();
        setApplications(data);

    } catch (error) {
        console.error("Error fetching applications:", error);
    }
};

const handleViewApplication = (application) => {
    setSelectedApplication(application);
    setShowApplication(true);
};

    useEffect(() => {
        fetchJobs();
        fetchApplications();
        fetchSummary();
        api(`/api/recruitment/meta?employee_id=${encodeURIComponent(hrId || "")}`)
            .then(setMeta)
            .catch((error) => console.error("Error fetching recruitment options:", error));
    }, [hrId]);

    const openNewManpowerRequest = () => {
        setActiveTab("manpower");
        setMprFormOpen(true);
    };

    const search = jobSearch.trim().toLowerCase();
    const visibleJobs = jobs.filter(
        (job) =>
            !search ||
            [job.job_id, job.title, job.department, job.mpr_no, job.location]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(search))
    );

    return (
        <DashboardLayout>
            <div className="recruitment-page">

                <div className="recruitment-header">
                    <div>
                        <h1>Recruitment</h1>
                        <p>Manage manpower requests, job openings and recruitment activities</p>
                    </div>

                    <button
                        className="create-job-btn"
                        onClick={openNewManpowerRequest}
                    >
                        + New Manpower Request
                    </button>
                </div>

                <div className="recruitment-cards four">

                    <div className="recruitment-card">
                        <h3>Pending MPR Approvals</h3>
                        <h2>{summary?.pending_mpr_approvals ?? "—"}</h2>
                    </div>

                    <div className="recruitment-card">
                        <h3>Open Jobs</h3>
                        <h2>{summary?.open_jobs ?? "—"}</h2>
                    </div>

                    <div className="recruitment-card">
                        <h3>Open Positions</h3>
                        <h2>{summary?.open_positions ?? "—"}</h2>
                    </div>

                    <div className="recruitment-card">
                        <h3>Departments</h3>
                        <h2>{summary?.departments ?? "—"}</h2>
                    </div>

                </div>

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
                            {tab.label}
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
                        <h2>Job Openings</h2>

                        <input
                            type="text"
                            placeholder="Search jobs..."
                            className="job-search"
                            value={jobSearch}
                            onChange={(event) => setJobSearch(event.target.value)}
                        />
                    </div>

                    <div className="jobs-table-container">

                        <table className="jobs-table">

                            <thead>
                                <tr>
                                    <th>Job ID</th>
                                    <th>MPR No</th>
                                    <th>Job Title</th>
                                    <th>Department</th>
                                    <th>Request Type</th>
                                    <th>Filled / Openings</th>
                                    <th>Experience</th>
                                    <th>Location</th>
                                    <th>Type</th>
                                    <th>Application Deadline</th>
                                    <th>Agency</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>

                            <tbody>

                                {visibleJobs.length === 0 && (
                                    <tr><td colSpan="13">No job openings found.</td></tr>
                                )}

                                {visibleJobs.map((job) => (
                                    <tr key={job.id}>

                                        <td>{job.job_id}</td>

                                        <td>
                                            {job.mpr_no || <span className="job-badge legacy">No MPR (legacy)</span>}
                                        </td>

                                        <td>
                                            <strong>
                                                {job.title}
                                            </strong>
                                        </td>

                                        <td>{job.department}</td>

                                        <td>{job.request_type || "—"}</td>

                                        <td>{job.filled ?? 0}/{job.openings}</td>

                                        <td>{job.experience}</td>

                                        <td>{job.location}</td>

                                        <td>{job.employment_type}</td>

                                        <td>
                                            {job.application_deadline ? formatDate(job.application_deadline) : "—"}
                                            {job.deadline_passed && (
                                                <>
                                                    <br />
                                                    <span className="job-badge deadline">Deadline passed</span>
                                                </>
                                            )}
                                        </td>

                                        <td>
                                            {job.sourcing === "Internal" ? "Internal" : job.agency_name || "—"}
                                        </td>

                                        <td>
                                            <span className={`job-status tone-${statusTone(job.status)}`}>
                                                {job.status}
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
                                                    Edit Recruitment Plan
                                                </button>
                                            </div>
                                        </td>

                                    </tr>
                                ))}

                            </tbody>

                        </table>

                    </div>

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

                            {/* JOB APPLICATIONS */}

                {activeTab === "applications" && (
                <div className="jobs-section">

                    <div className="jobs-section-header">
                        <h2>Job Applications</h2>
                    </div>

                    <div className="jobs-table-container">

                        <table className="jobs-table">

                            <thead>
                                <tr>
                                    <th>Application ID</th>
                                    <th>Job ID</th>
                                    <th>Candidate Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Candidate Type</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>

                            <tbody>

                                {applications.map((application) => (
                                    <tr key={application.application_id}>

                                        <td>{application.application_id}</td>

                                        <td>{application.job_id}</td>

                                        <td>
                                            <strong>
                                                {application.candidate_name}
                                            </strong>
                                        </td>

                                        <td>{application.email}</td>

                                        <td>{application.phone}</td>

                                        <td>{application.candidate_type}</td>

                                        <td>
                                            <span className="job-status">
                                                {application.status}
                                            </span>
                                        </td>

                                        <td>
                                            <button
                                                className="create-job-btn"
                                                onClick={() =>
                                                    handleViewApplication(application)
                                                }
                                            >
                                                View
                                            </button>
                                        </td>

                                    </tr>
                                ))}

                            </tbody>

                        </table>

                    </div>

                </div>
                )}

            </div>

                                {/* APPLICATION DETAILS MODAL */}

                {showApplication && selectedApplication && (
    <div className="candidate-modal-overlay">

        <div className="candidate-modal">

            {/* Header */}
            <div className="candidate-modal-header">
                <div>
                    <h2>Candidate Details</h2>
                    <span>
                        Application ID: {selectedApplication.application_id}
                    </span>
                </div>

                <button
                    className="candidate-modal-close"
                    onClick={() => setShowApplication(false)}
                >
                    ×
                </button>
            </div>

            {/* Personal Details */}
            <section className="candidate-section">
                <h3>Personal Details</h3>

                <div className="candidate-grid">
                    <div>
                        <label>Candidate Name</label>
                        <p>{selectedApplication.candidate_name}</p>
                    </div>

                    <div>
                        <label>Email</label>
                        <p>{selectedApplication.email}</p>
                    </div>

                    <div>
                        <label>Phone</label>
                        <p>{selectedApplication.phone || "-"}</p>
                    </div>

                    <div>
                        <label>Location</label>
                        <p>{selectedApplication.location || "-"}</p>
                    </div>

                    <div className="full-width">
                        <label>Address</label>
                        <p>{selectedApplication.address || "-"}</p>
                    </div>
                </div>
            </section>

            {/* Education */}
            <section className="candidate-section">
                <h3>Education Details</h3>

                <div className="candidate-grid">
                    <div>
                        <label>Highest Education</label>
                        <p>{selectedApplication.highest_education || "-"}</p>
                    </div>

                    <div>
                        <label>College</label>
                        <p>{selectedApplication.college || "-"}</p>
                    </div>

                    <div>
                        <label>Graduation Year</label>
                        <p>{selectedApplication.graduation_year || "-"}</p>
                    </div>

                    <div>
                        <label>CGPA / Percentage</label>
                        <p>{selectedApplication.cgpa_percentage || "-"}</p>
                    </div>
                </div>
            </section>

            {/* Candidate Type */}
            <section className="candidate-section">
                <h3>Candidate Type</h3>

                <div className="candidate-type-badge">
                    {selectedApplication.candidate_type || "-"}
                </div>
            </section>

            {/* Experienced Details */}
            {selectedApplication.candidate_type === "Experienced" && (
                <section className="candidate-section">
                    <h3>Experience Details</h3>

                    <div className="candidate-grid">
                        <div>
                            <label>Current Company</label>
                            <p>
                                {selectedApplication.current_company || "-"}
                            </p>
                        </div>

                        <div>
                            <label>Current Designation</label>
                            <p>
                                {selectedApplication.current_designation || "-"}
                            </p>
                        </div>

                        <div>
                            <label>Total Experience</label>
                            <p>
                                {selectedApplication.total_experience || "-"}
                            </p>
                        </div>

                        <div>
                            <label>Current CTC</label>
                            <p>
                                {selectedApplication.current_ctc || "-"}
                            </p>
                        </div>

                        <div>
                            <label>Expected CTC</label>
                            <p>
                                {selectedApplication.expected_ctc || "-"}
                            </p>
                        </div>

                        <div>
                            <label>Notice Period</label>
                            <p>
                                {selectedApplication.notice_period || "-"}
                            </p>
                        </div>

                        <div>
                            <label>Joining Date</label>
                            <p>
                                {selectedApplication.joining_date || "-"}
                            </p>
                        </div>
                    </div>
                </section>
            )}

            {/* Skills & Projects */}
            <section className="candidate-section">
                <h3>Skills & Projects</h3>

                <div className="candidate-grid">
                    <div className="full-width">
                        <label>Skills</label>
                        <p>{selectedApplication.skills || "-"}</p>
                    </div>

                    <div className="full-width">
                        <label>Certifications</label>
                        <p>{selectedApplication.certifications || "-"}</p>
                    </div>

                    <div>
                        <label>Project Name</label>
                        <p>{selectedApplication.project_name || "-"}</p>
                    </div>

                    <div>
                        <label>Technologies Used</label>
                        <p>{selectedApplication.technologies_used || "-"}</p>
                    </div>

                    <div className="full-width">
                        <label>Project Description</label>
                        <p>
                            {selectedApplication.project_description || "-"}
                        </p>
                    </div>
                </div>
            </section>

            {/* Additional Information */}
            <section className="candidate-section">
                <h3>Additional Information</h3>

                <div className="candidate-grid">
                    <div>
                        <label>Why Join</label>
                        <p>{selectedApplication.why_join || "-"}</p>
                    </div>

                    <div>
                        <label>Why Suitable</label>
                        <p>{selectedApplication.why_suitable || "-"}</p>
                    </div>

                    <div className="full-width">
                        <label>Cover Letter</label>
                        <p>{selectedApplication.cover_letter || "-"}</p>
                    </div>
                </div>
            </section>

            {/* Resume */}
            {selectedApplication.resume_url && (
                <div className="candidate-resume">
                    <span>Resume</span>

                    <a
                        href={selectedApplication.resume_url}
                        target="_blank"
                        rel="noreferrer"
                    >
                        View Resume →
                    </a>
                </div>
            )}

        </div>
    </div>
)}
        </DashboardLayout>
    );
}

export default Recruitment;