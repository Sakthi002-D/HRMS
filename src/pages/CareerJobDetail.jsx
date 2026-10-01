// Public job details (/careers/:jobId): description, skills, deadline, Apply Now → application form → success.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BriefcaseBusiness, CalendarClock, CalendarDays, CircleCheck, GraduationCap, Lock, MapPin, Users } from "lucide-react";
import CareersHeader from "../components/careers/CareersHeader";
import CareersFooter from "../components/careers/CareersFooter";
import CareerApplicationForm from "../components/careers/CareerApplicationForm";
import { careersApi, formatJobDate, splitSkills } from "../components/careers/careersApi";
import "./Careers.css";

function CareerJobDetail() {
    const { jobId } = useParams();
    const [state, setState] = useState({ key: null, data: null, meta: null, error: "", notFound: false });
    const [mode, setMode] = useState("details"); // details | apply | success
    const [submitted, setSubmitted] = useState(null);

    useEffect(() => {
        let ignore = false;
        Promise.all([careersApi(`/api/careers/jobs/${encodeURIComponent(jobId)}`), careersApi("/api/careers/meta")])
            .then(([data, meta]) => !ignore && setState({ key: jobId, data, meta, error: "", notFound: false }))
            .catch((error) => !ignore && setState({ key: jobId, data: null, meta: null, error: error.message, notFound: error.status === 404 }));
        return () => { ignore = true; };
    }, [jobId]);

    useEffect(() => {
        window.scrollTo({ top: 0 });
    }, [mode]);

    const loading = state.key !== jobId;
    const job = state.data?.job;

    // Deadline passed / job closed while the candidate was filling the form
    const handleClosed = (reason) => setState((current) => ({
        ...current,
        data: { accepting: false, reason, job: current.data?.job },
    }));

    let content;
    if (loading) {
        content = <p className="careers-state">Loading job details...</p>;
    } else if (state.notFound || (state.error && !job)) {
        content = (
            <div className="careers-empty">
                <BriefcaseBusiness size={34} aria-hidden="true" />
                <h2>{state.notFound ? "Job not found" : "Something went wrong"}</h2>
                <p>{state.notFound ? "This job opening doesn't exist or is no longer available." : state.error}</p>
                <Link className="career-apply-link inline" to="/careers">See all open positions</Link>
            </div>
        );
    } else if (!state.data.accepting) {
        content = (
            <div className="careers-empty closed">
                <Lock size={34} aria-hidden="true" />
                <h2>Applications closed</h2>
                <p><strong>{job?.title}</strong>{job?.department ? ` · ${job.department}` : ""}</p>
                <p>{state.data.reason}</p>
                <Link className="career-apply-link inline" to="/careers">See other open positions</Link>
            </div>
        );
    } else if (mode === "success") {
        content = (
            <div className="careers-success" role="status">
                <CircleCheck size={54} aria-hidden="true" />
                <h2>Application submitted!</h2>
                <p>
                    Your application number is <strong className="careers-app-no">{submitted.application_no}</strong>.
                </p>
                <p>Our HR team will contact you if shortlisted.</p>
                <p className="careers-muted">
                    Applied for {submitted.job_title} ({submitted.job_id}). Please keep your application number for future reference.
                </p>
                <Link className="career-apply-link inline" to="/careers">Back to all jobs</Link>
            </div>
        );
    } else if (mode === "apply") {
        content = (
            <CareerApplicationForm
                job={job}
                meta={state.meta}
                onCancel={() => setMode("details")}
                onClosed={handleClosed}
                onSubmitted={(result) => {
                    setSubmitted(result);
                    setMode("success");
                }}
            />
        );
    } else {
        const skills = splitSkills(job.skills);
        content = (
            <article className="career-detail">
                <header className="career-detail-head">
                    <div>
                        <span className="career-dept">{job.department}</span>
                        <h1>{job.title}</h1>
                        <p className="careers-muted">Job ID {job.job_id} · Posted {formatJobDate(job.posted_on)}</p>
                    </div>
                    <button type="button" className="career-apply-btn" onClick={() => setMode("apply")}>
                        Apply Now
                    </button>
                </header>

                <ul className="career-detail-facts">
                    <li><MapPin size={18} aria-hidden="true" /><span><small>Location</small>{job.location || "—"}</span></li>
                    <li><BriefcaseBusiness size={18} aria-hidden="true" /><span><small>Employment type</small>{job.employment_type || "—"}</span></li>
                    <li><GraduationCap size={18} aria-hidden="true" /><span><small>Experience</small>{job.experience}</span></li>
                    <li><Users size={18} aria-hidden="true" /><span><small>Openings</small>{job.openings}</span></li>
                    <li><CalendarDays size={18} aria-hidden="true" /><span><small>Posted on</small>{formatJobDate(job.posted_on)}</span></li>
                    <li className={job.apply_by ? "deadline" : ""}>
                        <CalendarClock size={18} aria-hidden="true" />
                        <span><small>Apply by</small>{job.apply_by ? formatJobDate(job.apply_by) : "Open until filled"}</span>
                    </li>
                </ul>

                <section className="career-detail-section">
                    <h2>Job Description</h2>
                    <p className="career-description">{job.job_description || "Details will be shared during the selection process."}</p>
                </section>

                <section className="career-detail-section">
                    <h2>Required Skills</h2>
                    {skills.length ? (
                        <ul className="career-skill-list">
                            {skills.map((skill) => <li key={skill}>{skill}</li>)}
                        </ul>
                    ) : (
                        <p>—</p>
                    )}
                </section>

                <div className="career-detail-cta">
                    <p>
                        {job.apply_by ? <>Applications close on <strong>{formatJobDate(job.apply_by)}</strong>.</> : "Applications are open until the position is filled."}
                    </p>
                    <button type="button" className="career-apply-btn" onClick={() => setMode("apply")}>
                        Apply Now
                    </button>
                </div>
            </article>
        );
    }

    return (
        <div className="careers-page">
            <CareersHeader />
            <main className="careers-main narrow">
                {mode !== "success" && (
                    <Link className="careers-back" to="/careers">
                        <ArrowLeft size={16} aria-hidden="true" /> All open positions
                    </Link>
                )}
                {content}
            </main>
            <CareersFooter />
        </div>
    );
}

export default CareerJobDetail;
