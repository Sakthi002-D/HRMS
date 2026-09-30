// Approval progress for a Manpower Request.
// Reuses the LeaveTracker stepper styles (leave-tracker-*) so both trackers look the same.
import "../hr/LeaveTracker.css";
import { formatDate } from "./recruitmentApi";

const NODE_ICONS = { completed: "✓", rejected: "✕", cancelled: "✕", overdue: "!" };

function buildSteps(mpr) {
    const workflow = mpr.workflow || [];
    const actions = mpr.actions || [];
    const status = mpr.status || "Draft";
    const current = mpr.current_step ?? 0;

    // Latest approval date per step role
    const approvedOn = {};
    actions.forEach((action) => {
        if (action.action === "Approved" && action.step_role) approvedOn[action.step_role] = action.created_at;
    });
    const submittedAt = [...actions].reverse().find((action) => ["Submitted", "Resubmitted"].includes(action.action))?.created_at;

    const steps = [
        {
            key: "submitted",
            label: "Submitted",
            state: status === "Draft" ? "current" : "completed",
            caption: status === "Draft" ? "Draft" : null,
            date: status === "Draft" ? null : formatDate(submittedAt),
        },
        ...workflow.map((step) => ({ key: step.role, label: step.label, state: "upcoming", caption: null, date: null })),
        {
            key: "job",
            label: "Job Opening",
            state: status === "Approved" ? "completed" : "upcoming",
            caption: mpr.job_id || null,
            date: null,
        },
    ];

    const stepAt = (index) => steps[index + 1];

    if (status === "Approved") {
        workflow.forEach((step, index) => {
            Object.assign(stepAt(index), { state: "completed", date: formatDate(approvedOn[step.role]) });
        });
    } else if (status.startsWith("Pending ") || status === "Sent Back" || status === "Rejected") {
        const active = status === "Sent Back" ? mpr.resume_step ?? current : current;
        workflow.forEach((step, index) => {
            if (index < active) Object.assign(stepAt(index), { state: "completed", date: formatDate(approvedOn[step.role]) });
        });
        const node = stepAt(active);
        if (node) {
            if (status === "Rejected") Object.assign(node, { state: "rejected", caption: "Rejected" });
            else if (status === "Sent Back") Object.assign(node, { state: "overdue", caption: "Sent back" });
            else Object.assign(node, { state: "current", caption: "Awaiting approval" });
        }
    } else if (status === "Cancelled") {
        workflow.forEach((step, index) => {
            if (index < current) Object.assign(stepAt(index), { state: "completed", date: formatDate(approvedOn[step.role]) });
        });
        const node = mpr.workflow_steps ? stepAt(current) : steps[0];
        if (node) Object.assign(node, { state: "cancelled", caption: "Cancelled" });
    }

    return steps;
}

const HEADLINE_TONE = { Approved: "completed", Rejected: "rejected", Cancelled: "cancelled", "Sent Back": "overdue", Draft: "current" };

function MprTracker({ mpr }) {
    const steps = buildSteps(mpr);
    const tone = HEADLINE_TONE[mpr.status] || "current";
    const headline = mpr.status === "Approved" && mpr.job_id ? `Approved – job opening ${mpr.job_id} created` : mpr.status;

    return (
        <div className="leave-tracker">
            <div className="leave-tracker-head">
                <div className="leave-tracker-eyebrow">APPROVAL PROGRESS</div>
                <p className={`leave-tracker-status tone-${tone}`}>{headline}</p>
            </div>
            <ol className="leave-tracker-steps">
                {steps.map((step) => (
                    <li
                        key={step.key}
                        className={`leave-tracker-step is-${step.state}`}
                        aria-current={step.state === "current" ? "step" : undefined}
                    >
                        <div className="leave-tracker-node" aria-hidden="true">{NODE_ICONS[step.state] || ""}</div>
                        <div className="leave-tracker-text">
                            <div className="leave-tracker-label">{step.label}</div>
                            {step.caption && <div className="leave-tracker-caption">{step.caption}</div>}
                            {step.date && step.date !== "—" && <div className="leave-tracker-date">{step.date}</div>}
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}

export default MprTracker;
