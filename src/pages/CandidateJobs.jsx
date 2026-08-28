import { useEffect, useState } from "react";
import "./CandidateJobs.css";

function CandidateJobs() {
    const [jobs, setJobs] = useState([]);
    const [selectedJob, setSelectedJob] = useState(null);

    const [formData, setFormData] = useState({
    candidate_name: "",
    email: "",
    phone: "",
    location: "",
    address: "",
    linkedin_url: "",
    github_url: "",
    portfolio_url: "",
    highest_education: "",
    college: "",
    graduation_year: "",
    cgpa_percentage: "",
    candidate_type: "",
    current_company: "",
    current_designation: "",
    total_experience: "",
    current_ctc: "",
    expected_ctc: "",
    notice_period: "",
    joining_date: "",
    skills: "",
    certifications: "",
    project_name: "",
    project_description: "",
    technologies_used: "",
    resume: null,
    resume_url: "",
    willing_to_relocate: false,
    why_join: "",
    why_suitable: "",
    cover_letter: "",
    source: "",
    declaration: false,
});

    useEffect(() => {
        fetchJobs();
    }, []);

    const fetchJobs = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/jobs`);

            if (!response.ok) {
                throw new Error("Failed to fetch jobs");
            }

            const data = await response.json();

            setJobs(data.filter((job) => job.status === "Open"));
        } catch (error) {
            console.error("Error fetching jobs:", error);
        }
    };

    const handleChange = (e) => {
    const { name, value, files, type, checked } = e.target;

    setFormData({
        ...formData,
        [name]:
            type === "checkbox"
                ? checked
                : files
                ? files[0]
                : value,
    });
};

        const handleApply = async (e) => {
    e.preventDefault();

    try {
        // ================================
        // STEP 1: Upload Resume
        // ================================

        let resumeUrl = "";

        if (formData.resume) {
            const resumeData = new FormData();

            resumeData.append("resume", formData.resume);

            const uploadResponse = await fetch(
               `${import.meta.env.VITE_API_URL}/api/upload-resume`,
                {
                    method: "POST",
                    body: resumeData,
                }
            );

            const uploadResult = await uploadResponse.json();

            if (!uploadResponse.ok) {
                throw new Error(
                    uploadResult.message || "Resume upload failed"
                );
            }

            resumeUrl = uploadResult.resume_url;
        }

        // ================================
        // STEP 2: Submit Application
        // ================================

        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/job-applications`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    job_id: selectedJob.job_id,

                    candidate_name: formData.candidate_name,
                    email: formData.email,
                    phone: formData.phone,

                    location: formData.location,
                    address: formData.address,

                    linkedin_url: formData.linkedin_url,
                    github_url: formData.github_url,
                    portfolio_url: formData.portfolio_url,

                    highest_education: formData.highest_education,
                    college: formData.college,
                    graduation_year: formData.graduation_year,
                    cgpa_percentage: formData.cgpa_percentage,

                    candidate_type: formData.candidate_type,

                    current_company: formData.current_company,
                    current_designation: formData.current_designation,
                    total_experience: formData.total_experience,

                    current_ctc: formData.current_ctc,
                    expected_ctc: formData.expected_ctc,

                    notice_period: formData.notice_period,
                    joining_date: formData.joining_date,

                    skills: formData.skills,
                    certifications: formData.certifications,

                    project_name: formData.project_name,
                    project_description: formData.project_description,
                    technologies_used: formData.technologies_used,

                    resume_url: resumeUrl,

                    willing_to_relocate:
                        formData.willing_to_relocate,

                    why_join: formData.why_join,
                    why_suitable: formData.why_suitable,

                    cover_letter: formData.cover_letter,
                    source: formData.source,

                    declaration: formData.declaration,
                }),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "Failed to submit application"
            );
        }

        alert("Application submitted successfully!");

        // Reset form

        setFormData({
            candidate_name: "",
            email: "",
            phone: "",
            location: "",
            address: "",
            linkedin_url: "",
            github_url: "",
            portfolio_url: "",
            highest_education: "",
            college: "",
            graduation_year: "",
            cgpa_percentage: "",
            candidate_type: "",
            current_company: "",
            current_designation: "",
            total_experience: "",
            current_ctc: "",
            expected_ctc: "",
            notice_period: "",
            joining_date: "",
            skills: "",
            certifications: "",
            project_name: "",
            project_description: "",
            technologies_used: "",
            resume: null,
            resume_url: "",
            willing_to_relocate: false,
            why_join: "",
            why_suitable: "",
            cover_letter: "",
            source: "",
            declaration: false,
        });

        setSelectedJob(null);

    } catch (error) {
        console.error(
            "Error submitting application:",
            error
        );

        alert(
            error.message || "Failed to submit application"
        );
    }
};

    return (
        <div className="candidate-jobs-page">

            <div className="candidate-jobs-header">
                <h1>Career Opportunities</h1>
                <p>Explore our current job openings and apply for a position.</p>
            </div>

            <div className="candidate-jobs-container">

                {jobs.length === 0 ? (
                    <p>No open positions available.</p>
                ) : (
                    jobs.map((job) => (
                        <div
                            className="candidate-job-card"
                            key={job.id}
                        >
                            <h2>{job.title}</h2>

                            <p>
                                <strong>Department:</strong>{" "}
                                {job.department}
                            </p>

                            <p>
                                <strong>Experience:</strong>{" "}
                                {job.experience}
                            </p>

                            <p>
                                <strong>Location:</strong>{" "}
                                {job.location}
                            </p>

                            <p>
                                <strong>Type:</strong>{" "}
                                {job.employment_type}
                            </p>

                            <p>
                                <strong>Openings:</strong>{" "}
                                {job.openings}
                            </p>

                            <button
                                onClick={() => setSelectedJob(job)}
                            >
                                Apply Now
                            </button>
                        </div>
                    ))
                )}

            </div>

            {selectedJob && (
                <div className="application-overlay">

                    <div className="application-form">

                        <button
                            className="close-btn"
                            onClick={() => setSelectedJob(null)}
                        >
                            ×
                        </button>

                        <h2>Apply for {selectedJob.title}</h2>

                        <form onSubmit={handleApply}>

    <h3>Personal Details</h3>

    <input
        type="text"
        name="candidate_name"
        placeholder="Full Name *"
        value={formData.candidate_name}
        onChange={handleChange}
        required
    />

    <input
        type="email"
        name="email"
        placeholder="Email ID *"
        value={formData.email}
        onChange={handleChange}
        required
    />

    <input
        type="tel"
        name="phone"
        placeholder="Phone Number *"
        value={formData.phone}
        onChange={handleChange}
        required
    />

    <input
        type="text"
        name="location"
        placeholder="Current Location"
        value={formData.location}
        onChange={handleChange}
    />

    <textarea
        name="address"
        placeholder="Current Address"
        value={formData.address}
        onChange={handleChange}
    />

    <h3>Professional Details</h3>

    <select
        name="candidate_type"
        value={formData.candidate_type}
        onChange={handleChange}
        required
    >
        <option value="">Fresher or Experienced *</option>
        <option value="Fresher">Fresher</option>
        <option value="Experienced">Experienced</option>
    </select>
        
        {formData.candidate_type === "Experienced" && (
    <>

    <input
        type="text"
        name="current_company"
        placeholder="Current Company"
        value={formData.current_company}
        onChange={handleChange}
    />

    <input
        type="text"
        name="current_designation"
        placeholder="Current Designation"
        value={formData.current_designation}
        onChange={handleChange}
    />

    <input
        type="text"
        name="total_experience"
        placeholder="Total Experience"
        value={formData.total_experience}
        onChange={handleChange}
    />

    <input
        type="text"
        name="current_ctc"
        placeholder="Current CTC"
        value={formData.current_ctc}
        onChange={handleChange}
    />

    <input
        type="text"
        name="expected_ctc"
        placeholder="Expected CTC"
        value={formData.expected_ctc}
        onChange={handleChange}
    />

    <input
        type="text"
        name="notice_period"
        placeholder="Notice Period"
        value={formData.notice_period}
        onChange={handleChange}
    />

    <label>Available Joining Date</label>

    <input
        type="date"
        name="joining_date"
        value={formData.joining_date}
        onChange={handleChange}
    />
    </>
)}

    <h3>Education</h3>

    <input
        type="text"
        name="highest_education"
        placeholder="Highest Education *"
        value={formData.highest_education}
        onChange={handleChange}
        required
    />

    <input
        type="text"
        name="college"
        placeholder="College / University"
        value={formData.college}
        onChange={handleChange}
    />

    <input
        type="number"
        name="graduation_year"
        placeholder="Graduation Year"
        value={formData.graduation_year}
        onChange={handleChange}
    />

    <input
        type="text"
        name="cgpa_percentage"
        placeholder="CGPA / Percentage"
        value={formData.cgpa_percentage}
        onChange={handleChange}
    />

    <h3>Skills & Projects</h3>

    <textarea
        name="skills"
        placeholder="Technical Skills *"
        value={formData.skills}
        onChange={handleChange}
        required
    />

    <textarea
        name="certifications"
        placeholder="Certifications"
        value={formData.certifications}
        onChange={handleChange}
    />

    <input
        type="text"
        name="project_name"
        placeholder="Project Name"
        value={formData.project_name}
        onChange={handleChange}
    />

    <textarea
        name="project_description"
        placeholder="Project Description"
        value={formData.project_description}
        onChange={handleChange}
    />

    <input
        type="text"
        name="technologies_used"
        placeholder="Technologies Used"
        value={formData.technologies_used}
        onChange={handleChange}
    />

    <h3>Online Profiles</h3>

    <input
        type="url"
        name="linkedin_url"
        placeholder="LinkedIn Profile"
        value={formData.linkedin_url}
        onChange={handleChange}
    />

    <input
        type="url"
        name="github_url"
        placeholder="GitHub Profile"
        value={formData.github_url}
        onChange={handleChange}
    />

    <input
        type="url"
        name="portfolio_url"
        placeholder="Portfolio URL"
        value={formData.portfolio_url}
        onChange={handleChange}
    />

    <h3>Resume</h3>

    <input
        type="file"
        name="resume"
        accept=".pdf,.doc,.docx"
        onChange={handleChange}
        required
    />

    <h3>Additional Information</h3>

    <select
        name="willing_to_relocate"
        value={formData.willing_to_relocate}
        onChange={(e) =>
            setFormData({
                ...formData,
                willing_to_relocate:
                    e.target.value === "true",
            })
        }
    >
        <option value="false">Willing to Relocate? No</option>
        <option value="true">Willing to Relocate? Yes</option>
    </select>

    <textarea
        name="why_join"
        placeholder="Why do you want to join our company?"
        value={formData.why_join}
        onChange={handleChange}
    />

    <textarea
        name="why_suitable"
        placeholder="Why are you suitable for this role?"
        value={formData.why_suitable}
        onChange={handleChange}
    />

    <textarea
        name="cover_letter"
        placeholder="Cover Letter"
        value={formData.cover_letter}
        onChange={handleChange}
    />

    <select
        name="source"
        value={formData.source}
        onChange={handleChange}
    >
        <option value="">How did you hear about us?</option>
        <option value="LinkedIn">LinkedIn</option>
        <option value="Indeed">Indeed</option>
        <option value="Company Website">
            Company Website
        </option>
        <option value="Referral">Employee Referral</option>
        <option value="Other">Other</option>
    </select>

    <label className="declaration">
        <input
            type="checkbox"
            name="declaration"
            checked={formData.declaration}
            onChange={(e) =>
                setFormData({
                    ...formData,
                    declaration: e.target.checked,
                })
            }
            required
        />

        I confirm that the information provided is
        accurate and complete.
    </label>

    <button type="submit">
        Submit Application
    </button>

</form>

                    </div>

                </div>
            )}

        </div>
    );
}

export default CandidateJobs;