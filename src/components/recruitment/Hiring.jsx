// HR → Recruitment → Hiring: every application past "New", from shortlist to hired.
// Candidates who answered an offer and whom HR hasn't opened yet are pinned at the top.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Award, BadgeCheck, CalendarClock, CirclePause, ClipboardCheck, Eye, Send, UserCheck, Users, UserX } from "lucide-react";
import { usePagination, RowsPerPage, Pagination } from "../common/TablePagination";
import HiringPanel from "./HiringPanel";
import { formatInterviewTime } from "./applicationFormat";
import { applicationStatusLabel, applicationTone, formatDate, recruitmentValueLabel } from "./recruitmentApi";

// Stage cards: label, statuses (null = all), icon, icon tone
const STAGES = [
    { id: "all", label: "All", statuses: null, icon: Users, tone: "" },
    { id: "shortlisted", label: "Shortlisted", statuses: ["Shortlisted"], icon: UserCheck, tone: "shortlisted" },
    { id: "interview", label: "Interview", statuses: ["Interview Scheduled"], icon: CalendarClock, tone: "hire-amber" },
    { id: "selected", label: "Selected", statuses: ["Selected"], icon: Award, tone: "hire-violet" },
    { id: "offer", label: "Offer Sent", statuses: ["Offer Sent"], icon: Send, tone: "hire-sky" },
    { id: "prejoining", label: "Pre-joining", statuses: ["Offer Accepted"], icon: ClipboardCheck, tone: "hire-teal" },
    { id: "hired", label: "Hired", statuses: ["Hired", "Joined"], icon: BadgeCheck, tone: "shortlisted" },
    { id: "hold", label: "On Hold", statuses: ["On Hold"], icon: CirclePause, tone: "hire-orange" },
    { id: "rejected", label: "Rejected", statuses: ["Rejected", "Offer Declined"], icon: UserX, tone: "rejected" },
];

function nextStepText(t, row) {
    switch (row.status) {
        case "Shortlisted": return t("recruitment.hiring.next.schedule", { defaultValue: "Schedule the interview" });
        case "Interview Scheduled": return t("recruitment.hiring.next.result", { defaultValue: "Record the interview result" });
        case "On Hold": return row.interview_date
            ? t("recruitment.hiring.next.decide", { defaultValue: "Decide: record the final result" })
            : t("recruitment.hiring.next.review", { defaultValue: "Review in Job Applications" });
        case "Selected": return t("recruitment.hiring.next.offer", { defaultValue: "Send the offer letter" });
        case "Offer Sent": return t("recruitment.hiring.next.waiting", { defaultValue: "Waiting for the candidate's answer" });
        case "Offer Accepted": return t("recruitment.hiring.next.prejoining", { done: row.prejoining_done, total: row.prejoining_required, defaultValue: "Pre-joining: {{done}} of {{total}} required" });
        case "Offer Declined": return t("recruitment.hiring.next.declined", { defaultValue: "Offer declined – closed" });
        case "Hired": return t("recruitment.hiring.next.hired", { id: row.hired_employee_id || "—", defaultValue: "Employee {{id}}" });
        case "Rejected": return t("recruitment.hiring.next.closed", { defaultValue: "Closed" });
        default: return "—";
    }
}

function Hiring({ actorId, rows, loading, error, onChanged }) {
    const { t } = useTranslation();
    const [stage, setStage] = useState("all");
    const [search, setSearch] = useState("");
    const [view, setView] = useState(null);

    const counts = useMemo(() => Object.fromEntries(STAGES.map((item) => [
        item.id,
        item.statuses ? rows.filter((row) => item.statuses.includes(row.status)).length : rows.length,
    ])), [rows]);

    const statuses = STAGES.find((item) => item.id === stage)?.statuses;
    const query = search.trim().toLowerCase();
    // The backend already sorts new offer answers first; filtering keeps that order
    const visible = rows.filter((row) => (!statuses || statuses.includes(row.status))
        && (!query || [row.candidate_name, row.application_id, row.email, row.job_id, row.job_title].some((value) => String(value || "").toLowerCase().includes(query))));
    const pager = usePagination(visible);
    const { setPage } = pager;
    useEffect(() => { setPage(1); }, [stage, query, setPage]);

    return (
        <div className="jobs-section app-section hiring-section-root">
            <div className="recruitment-cards hiring-cards">
                {STAGES.map(({ id, label, icon: Icon, tone }) => (
                    <button
                        key={id}
                        type="button"
                        className={`recruitment-card app-card hiring-card${stage === id ? " active" : ""}`}
                        onClick={() => setStage(stage === id && id !== "all" ? "all" : id)}
                        aria-pressed={stage === id}
                    >
                        <Icon className={`recruitment-stat-icon ${tone}`} size={30} strokeWidth={2} aria-hidden="true" />
                        <div className="recruitment-card-content">
                            <span>{t(`recruitment.hiring.stages.${id}`, { defaultValue: label })}</span>
                            <strong>{loading && !rows.length ? "—" : counts[id]}</strong>
                        </div>
                    </button>
                ))}
            </div>

            <div className="jobs-section-header">
                <h2>{t("recruitment.tabs.hiring", { defaultValue: "Hiring" })}</h2>
                <div className="tp-header-actions">
                    <input
                        type="search"
                        placeholder={t("recruitment.hiring.searchPlaceholder", { defaultValue: "Search name, application no., email or job..." })}
                        className="job-search app-search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <RowsPerPage value={pager.pageSize} onChange={pager.setPageSize} />
                </div>
            </div>

            {error && <p className="mpr-form-error">{error}</p>}

            <div className="jobs-table-container">
                <table className="jobs-table app-table hiring-table">
                    <thead>
                        <tr>
                            <th>{t("recruitment.applications.candidate", { defaultValue: "Candidate" })}</th>
                            <th>{t("recruitment.applications.job", { defaultValue: "Job" })}</th>
                            <th>{t("recruitment.hiring.gradeDesignation", { defaultValue: "Grade · Designation" })}</th>
                            <th>{t("recruitment.hiring.interview", { defaultValue: "Interview" })}</th>
                            <th>{t("profileEdit.fields.status", { defaultValue: "Status" })}</th>
                            <th>{t("recruitment.hiring.nextStep", { defaultValue: "Next step" })}</th>
                            <th>{t("recruitment.fields.action", { defaultValue: "Action" })}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !rows.length && (
                            <tr><td colSpan="7">{t("recruitment.hiring.loading", { defaultValue: "Loading candidates..." })}</td></tr>
                        )}
                        {!loading && visible.length === 0 && (
                            <tr><td colSpan="7">{rows.length
                                ? t("recruitment.applications.noMatch", { defaultValue: "No applications match these filters." })
                                : t("recruitment.hiring.none", { defaultValue: "No candidates in hiring yet. Shortlist applications in Job Applications first." })}</td></tr>
                        )}
                        {pager.pageItems.map((row) => (
                            <tr key={row.id} className={row.new_response ? "hiring-row-new" : ""}>
                                <td>
                                    <strong>{row.candidate_name}</strong>
                                    {row.new_response && <span className="hiring-new-badge">{t("recruitment.hiring.newResponse", { defaultValue: "New response" })}</span>}
                                    <small className="app-sub"><span dir="ltr">{row.application_id}</span></small>
                                </td>
                                <td>
                                    <strong dir="ltr" className="ltr-text">{row.job_id}</strong>
                                    <small className="app-sub">{row.job_title || "—"}</small>
                                    <small className="app-sub" dir="ltr">{t("recruitment.hiring.filled", { filled: row.filled ?? 0, openings: row.openings ?? "—", defaultValue: "{{filled}} / {{openings}} filled" })}</small>
                                </td>
                                <td>{[row.grade, row.designation].filter(Boolean).join(" · ") || "—"}</td>
                                <td>
                                    {row.interview_date ? (
                                        <>
                                            <span dir="ltr" className="ltr-text">{formatDate(row.interview_date)}</span>
                                            <small className="app-sub"><span dir="ltr">{formatInterviewTime(row.interview_time)}</span> · {recruitmentValueLabel("interviewMode", row.interview_mode)}</small>
                                        </>
                                    ) : "—"}
                                </td>
                                <td><span className={`mpr-status ${applicationTone(row.status)}`}>{applicationStatusLabel(row.status)}</span></td>
                                <td className="hiring-next">{nextStepText(t, row)}</td>
                                <td>
                                    <button type="button" className="employee-view-button" onClick={() => setView({ id: row.id, newResponse: row.new_response })} aria-label={t("recruitment.common.view", { defaultValue: "View" })} title={t("recruitment.common.view", { defaultValue: "View" })}>
                                        <Eye size={18} strokeWidth={2} aria-hidden="true" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Pagination page={pager.page} pageCount={pager.pageCount} onChange={pager.setPage} />

            {view && (
                <HiringPanel
                    applicationId={view.id}
                    actorId={actorId}
                    newResponse={view.newResponse}
                    onClose={() => setView(null)}
                    onChanged={onChanged}
                />
            )}
        </div>
    );
}

export default Hiring;
