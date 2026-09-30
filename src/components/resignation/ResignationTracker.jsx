// Progress for a resignation: Submitted → <approvers> → Serving Notice → Completed.
// Reuses the LeaveTracker stepper styles (leave-tracker-*) like MprTracker.
import "../hr/LeaveTracker.css";
import { daysLabel, formatDate } from "./resignationApi";

const NODE_ICONS = { completed: "✓", rejected: "✕", cancelled: "✕", overdue: "!" };

function buildSteps(resignation) {
    const { status, workflow = [], actions = [] } = resignation;
    const decided = actions.filter((action) => ["Approved", "Accepted"].includes(action.action));
    const decidedOn = (index) => formatDate(decided[index]?.created_at);
    const accepted = ["Accepted", "Serving Notice", "Completed"].includes(status);

    const steps = [
        { key: "submitted", label: "Submitted", state: "completed", caption: null, date: formatDate(resignation.resignation_date) },
        ...workflow.map((step, index) => ({ key: `${step.role}-${index}`, label: step.label, state: "upcoming", caption: null, date: null })),
        { key: "notice", label: "Serving Notice", state: "upcoming", caption: null, date: null },
        { key: "completed", label: "Completed", state: "upcoming", caption: null, date: null },
    ];
    const approverStep = (index) => steps[index + 1];
    const noticeStep = steps[steps.length - 2];
    const completedStep = steps[steps.length - 1];

    if (accepted) {
        workflow.forEach((_, index) => Object.assign(approverStep(index), { state: "completed", date: decidedOn(index) }));
        if (status === "Completed") {
            Object.assign(noticeStep, { state: "completed", caption: `Until ${formatDate(resignation.last_working_day)}` });
            Object.assign(completedStep, { state: "completed", date: formatDate(resignation.completed_at) });
        } else {
            Object.assign(noticeStep, {
                state: "current",
                caption: resignation.days_remaining !== null ? `${daysLabel(resignation.days_remaining)} remaining` : null,
                date: `Last day ${formatDate(resignation.last_working_day)}`,
            });
        }
        return steps;
    }

    // Pending / Rejected / Withdrawn: steps before the one reached are approved
    const reached = status.startsWith("Pending ") ? resignation.current_step ?? decided.length : decided.length;
    workflow.forEach((_, index) => {
        if (index < reached) Object.assign(approverStep(index), { state: "completed", date: decidedOn(index) });
    });
    const node = approverStep(reached);
    if (node) {
        if (status === "Rejected") Object.assign(node, { state: "rejected", caption: "Rejected" });
        else if (status === "Withdrawn") Object.assign(node, { state: "cancelled", caption: "Withdrawn" });
        else Object.assign(node, { state: "current", caption: "Awaiting approval" });
    }
    return steps;
}

const HEADLINE_TONE = { Completed: "completed", Rejected: "rejected", Withdrawn: "cancelled" };

function ResignationTracker({ resignation }) {
    const steps = buildSteps(resignation);
    const tone = HEADLINE_TONE[resignation.status] || "current";
    const headline = resignation.status === "Serving Notice" && resignation.days_remaining !== null
        ? `Serving notice – ${daysLabel(resignation.days_remaining)} remaining`
        : resignation.status;

    return (
        <div className="leave-tracker">
            <div className="leave-tracker-head">
                <div className="leave-tracker-eyebrow">RESIGNATION PROGRESS</div>
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

export default ResignationTracker;
