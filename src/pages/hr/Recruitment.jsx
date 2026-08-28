import { useState, useEffect } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Recruitment.css";
const API_URL = import.meta.env.VITE_API_URL;

function Recruitment() {
    const [showForm, setShowForm] = useState(false);

    const [jobs, setJobs] = useState([]);
    useEffect(() => {
        fetchJobs();
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

    const [formData, setFormData] = useState({
        title: "",
        department: "",
        openings: "",
        experience: "",
        location: "",
        type: "Full Time",
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
        </DashboardLayout>
    );
}

export default Recruitment;