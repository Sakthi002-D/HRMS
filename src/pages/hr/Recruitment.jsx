import { useState, useEffect } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Recruitment.css";
const API_URL = import.meta.env.VITE_API_URL;

console.log("API URL:", API_URL);

function Recruitment() {
    const [showForm, setShowForm] = useState(false);

    const [applications, setApplications] = useState([]);
    const [selectedApplication, setSelectedApplication] = useState(null);
    const [showApplication, setShowApplication] = useState(false);

    const [jobs, setJobs] = useState([]);
useEffect(() => {
        fetchJobs();
        fetchApplications();
    }, []);

    const fetchJobs = async () => {
        try {
            const response = await fetch(`${API_URL}/api/jobs`);

            if (!response.ok) {
            throw new Error("Failed to fetch jobs");
            }

            const data = await response.json();

            setJobs(data);
        } catch (error) {
         console.error("Error fetching jobs:", error);
        }
    };


    const fetchApplications = async () => {

            console.log("API URL:", API_URL);

    try {
        const response = await fetch(`${API_URL}/api/job-applications`);

        if (!response.ok) {
            throw new Error("Failed to fetch applications");
        }

        const data = await response.json();
                console.log("FULL APPLICATION DATA:", data);

                data.forEach((application) => {
                console.log(
                "APPLICATION:",
                application.application_id,
                application
            );
        });
        setApplications(data);

    } catch (error) {
        console.error("Error fetching applications:", error);
    }
};

const handleViewApplication = (application) => {
        console.log("SELECTED APPLICATION:", application);


    setSelectedApplication(application);
    setShowApplication(true);
};

    const [formData, setFormData] = useState({
        title: "",
        department: "",
        openings: "",
        experience: "",
        location: "",
        type: "Full Time",
        job_description: "",
        skills: "",
        compensation: "",
    });

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

   const handleCreateJob = async (e) => {
    e.preventDefault();

    try {
        const response = await fetch(`${API_URL}/api/jobs`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                title: formData.title,
                department: formData.department,
                openings: Number(formData.openings),
                experience: formData.experience,
                location: formData.location,
                employment_type: formData.type,
                job_description: formData.job_description,
                skills: formData.skills,
                compensation: formData.compensation,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Failed to create job");
        }

        setJobs((prevJobs) => [data, ...prevJobs]);

        setFormData({
            title: "",
            department: "",
            openings: "",
            experience: "",
            location: "",
            type: "Full Time",
            job_description: "",
            skills: "",
            compensation: "",
        });

        setShowForm(false);

    } catch (error) {
        console.error("Error creating job:", error);
        alert("Failed to create job");
    }
};
    return (
        <DashboardLayout>
            <div className="recruitment-page">

                <div className="recruitment-header">
                    <div>
                        <h1>Recruitment</h1>
                        <p>Manage job openings and recruitment activities</p>
                    </div>

                    <button
                        className="create-job-btn"
                        onClick={() => setShowForm(true)}
                    >
                        + Create Job
                    </button>
                </div>

                <div className="recruitment-cards">

                    <div className="recruitment-card">
                        <h3>Open Positions</h3>
                        <h2>
                            {jobs.filter(
                                (job) => job.status === "Open"
                            ).length}
                        </h2>
                    </div>

                    <div className="recruitment-card">
                        <h3>Total Openings</h3>
                        <h2>
                            {jobs.reduce(
                                (total, job) =>
                                    total + Number(job.openings || 0),
                                0
                            )}
                        </h2>
                    </div>

                    <div className="recruitment-card">
                        <h3>Departments</h3>
                        <h2>
                            {
                                new Set(
                                    jobs.map((job) => job.department)
                                ).size
                            }
                        </h2>
                    </div>

                </div>

                {showForm && (
                    <div className="job-form-container">

                        <div className="job-form-header">
                            <h2>Create Job Opening</h2>

                            <button
                                className="close-btn"
                                onClick={() => setShowForm(false)}
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleCreateJob}>

                            <div className="form-grid">

                                <div className="form-group">
                                    <label>Job Title</label>
                                    <input
                                        type="text"
                                        name="title"
                                        value={formData.title}
                                        onChange={handleChange}
                                        placeholder="e.g. Frontend Developer"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Department</label>
                                    <select
                                        name="department"
                                        value={formData.department}
                                        onChange={handleChange}
                                        required
                                    >
                                        <option value="">
                                            Select Department
                                        </option>
                                        <option value="IT">
                                            IT
                                        </option>
                                        <option value="HR">
                                            HR
                                        </option>
                                        <option value="Finance">
                                            Finance
                                        </option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>No. of Openings</label>
                                    <input
                                        type="number"
                                        name="openings"
                                        min="1"
                                        value={formData.openings}
                                        onChange={handleChange}
                                        placeholder="e.g. 2"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Experience</label>
                                    <input
                                        type="text"
                                        name="experience"
                                        value={formData.experience}
                                        onChange={handleChange}
                                        placeholder="e.g. 0-2 Years"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Location</label>
                                    <input
                                        type="text"
                                        name="location"
                                        value={formData.location}
                                        onChange={handleChange}
                                        placeholder="e.g. Chennai"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Employment Type</label>
                                    <select
                                        name="type"
                                        value={formData.type}
                                        onChange={handleChange}
                                    >
                                        <option value="Full Time">
                                            Full Time
                                        </option>
                                        <option value="Part Time">
                                            Part Time
                                        </option>
                                        <option value="Contract">
                                            Contract
                                        </option>
                                    </select>
                                </div>

                            <div className="form-group">
                               <label>Job Description</label>
                                <textarea
                                 name="job_description"
                                 value={formData.job_description}
                                 onChange={handleChange}
                                 placeholder="Enter job description"
                                 rows="4"
                                 required
                                />
                            </div>

                            <div className="form-group">
                                <label>Required Skills</label>
                                <input
                                    type="text"
                                    name="skills"
                                    value={formData.skills}
                                    onChange={handleChange}
                                    placeholder="e.g. React, Node.js, MongoDB"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Compensation</label>
                                <input
                                 type="text"
                                 name="compensation"
                                 value={formData.compensation}
                                 onChange={handleChange}
                                 placeholder="e.g. ₹4 - ₹6 LPA"
                                 required
                            />
                            </div>

                            </div>

                            <div className="form-actions">

                                <button
                                    type="button"
                                    className="cancel-btn"
                                    onClick={() => setShowForm(false)}
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    className="save-job-btn"
                                >
                                    Create Job
                                </button>

                            </div>

                        </form>
                    </div>
                )}

                <div className="jobs-section">

                    <div className="jobs-section-header">
                        <h2>Job Openings</h2>

                        <input
                            type="text"
                            placeholder="Search jobs..."
                            className="job-search"
                        />
                    </div>

                    <div className="jobs-table-container">

                        <table className="jobs-table">

                            <thead>
                                <tr>
                                    <th>Job ID</th>
                                    <th>Job Title</th>
                                    <th>Department</th>
                                    <th>Openings</th>
                                    <th>Experience</th>
                                    <th>Location</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                </tr>
                            </thead>

                            <tbody>

                                {jobs.map((job) => (
                                    <tr key={job.id}>

                                        <td>{job.job_id}</td>

                                        <td>
                                            <strong>
                                                {job.title}
                                            </strong>
                                        </td>

                                        <td>{job.department}</td>

                                        <td>{job.openings}</td>

                                        <td>{job.experience}</td>

                                        <td>{job.location}</td>

                                        <td>{job.employment_type}</td>

                                        <td>
                                            <span className="job-status">
                                                {job.status}
                                            </span>
                                        </td>

                                    </tr>
                                ))}

                            </tbody>

                        </table>

                    </div>

                </div>

            </div>
                            {/* JOB APPLICATIONS */}

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