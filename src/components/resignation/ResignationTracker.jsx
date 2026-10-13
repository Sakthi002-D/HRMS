// Progress for a resignation: Submitted → <approvers> → Serving Notice → Completed.
// Reuses the LeaveTracker stepper styles (leave-tracker-*) like MprTracker.
import { useTranslation } from "react-i18next";
import "../hr/LeaveTracker.css";
import { daysLabel, formatDate, ltrText, resignationRoleLabel, resignationStatusLabel } from "./resignationApi";

const NODE_ICONS = { completed: "✓", rejected: "✕", cancelled: "✕", overdue: "!" };

function buildSteps(resignation, t) {
    const { status, workflow = [], actions = [] } = resignation;
    const decided = actions.filter((action) => ["Approved", "Accepted"].includes(action.action));
    const decidedOn = (index) => formatDate(decided[index]?.created_at);
    const accepted = ["Accepted", "Serving Notice", "Completed"].includes(status);

    const steps = [
        { key: "submitted", label: t("resignation.tracker.submitted", { defaultValue: "Submitted" }), state: "completed", caption: null, date: formatDate(resignation.resignation_date) },
        ...workflow.map((step, index) => ({ key: `${step.role}-${index}`, label: resignationRoleLabel(step.role, step.label), state: "upcoming", caption: null, date: null })),
        { key: "notice", label: resignationStatusLabel("Serving Notice"), state: "upcoming", caption: null, date: null },
        { key: "completed", label: resignationStatusLabel("Completed"), state: "upcoming", caption: null, date: null },
    ];
    const approverStep = (index) => steps[index + 1];
    const noticeStep = steps[steps.length - 2];
    const completedStep = steps[steps.length - 1];

    if (accepted) {
        workflow.forEach((_, index) => Object.assign(approverStep(index), { state: "completed", date: decidedOn(index) }));
        if (status === "Completed") {
            Object.assign(noticeStep, { state: "completed", caption: t("resignation.tracker.until", { date: ltrText(formatDate(resignation.last_working_day)), defaultValue: "Until {{date}}" }) });
            Object.assign(completedStep, { state: "completed", date: formatDate(resignation.completed_at) });
        } else {
            Object.assign(noticeStep, {
                state: "current",
                caption: resignation.days_remaining !== null ? t("resignation.tracker.remaining", { days: daysLabel(resignation.days_remaining), defaultValue: "{{days}} remaining" }) : null,
                date: t("resignation.tracker.lastDay", { date: ltrText(formatDate(resignation.last_working_day)), defaultValue: "Last day {{date}}" }),
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
        if (status === "Rejected") Object.assign(node, { state: "rejected", caption: resignationStatusLabel("Rejected") });
        else if (status === "Withdrawn") Object.assign(node, { state: "cancelled", caption: resignationStatusLabel("Withdrawn") });
        else Object.assign(node, { state: "current", caption: t("resignation.tracker.awaiting", { defaultValue: "Awaiting approval" }) });
    }
    return steps;
}

const HEADLINE_TONE = { Completed: "completed", Rejected: "rejected", Withdrawn: "cancelled" };

function ResignationTracker({ resignation }) {
    const { t } = useTranslation();
    const steps = buildSteps(resignation, t);
    const tone = HEADLINE_TONE[resignation.status] || "current";
    const headline = resignation.status === "Serving Notice" && resignation.days_remaining !== null
        ? t("resignation.tracker.headlineServing", { days: daysLabel(resignation.days_remaining), defaultValue: "Serving notice – {{days}} remaining" })
        : resignationStatusLabel(resignation.status);

    return (
        <div className="leave-tracker">
            <div className="leave-tracker-head">
                <div className="leave-tracker-eyebrow">{t("resignation.tracker.eyebrow", { defaultValue: "RESIGNATION PROGRESS" })}</div>
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
                            {/* dir="auto": a plain date ("12 Oct 2026") reads left-to-right, an Arabic sentence right-to-left */}
                            {step.date && step.date !== "—" && <div className="leave-tracker-date"><span dir="auto">{step.date}</span></div>}
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}

export default ResignationTracker;