import { getCompanyToday, getTrackerState } from "./leaveTrackerState";
import "./LeaveTracker.css";

const NODE_ICONS = {
    completed: "✓",
    rejected: "✕",
    cancelled: "✕",
    overdue: "!",
};

function LeaveTracker({ leave, today = getCompanyToday() }) {
    if (!leave) return null;

    const { steps, headline, tone } = getTrackerState(leave, today);

    return (
        <div className="leave-tracker">
            <div className="leave-tracker-head">
                <div className="leave-tracker-eyebrow">LEAVE TRACKER</div>
                <p className={`leave-tracker-status tone-${tone}`}>{headline}</p>
            </div>

            <ol className="leave-tracker-steps">
                {steps.map((step) => (
                    <li
                        key={step.key}
                        className={`leave-tracker-step is-${step.state}`}
                        aria-current={step.state === "current" ? "step" : undefined}
                    >
                        <div className="leave-tracker-node" aria-hidden="true">
                            {NODE_ICONS[step.state] || ""}
                        </div>

                        <div className="leave-tracker-text">
                            <div className="leave-tracker-label">{step.label}</div>

                            {step.caption && (
                                <div className="leave-tracker-caption">{step.caption}</div>
                            )}

                            {step.date && (
                                <div className="leave-tracker-date">{step.date}</div>
                            )}
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}

export default LeaveTracker;
