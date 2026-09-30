// Budget check display for New Position MPRs: the details box used in the form pop-ups,
// the badge above the form, and the MPR detail for approvers.
import { formatMoney, isBudgetException } from "./recruitmentApi";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// Lines in the order the pop-ups show them. audience "approver" says "Requested" instead of "You requested".
function detailLines(budget, audience) {
    if (budget.status === "no_budget") return [["", budget.reason]];

    const requestedLabel = audience === "approver" ? "Requested" : "You requested";
    const exceeded = budget.status === "exceeded";
    const hasCost = budget.salaryMax > 0;
    const lines = [
        ["Department", `${budget.department} (${budget.year})`],
        ["Budgeted positions", budget.budgetedPositions],
    ];

    if (exceeded || budget.alreadyUsed > 0 || audience === "approver") {
        lines.push(["Already used by other requests", budget.alreadyUsed]);
    }
    if (exceeded || audience === "approver") lines.push(["Available", budget.available]);

    lines.push([
        requestedLabel,
        budget.positionsExceeded ? <>{budget.requested} <b>→ exceeds by {budget.exceededBy}</b></> : budget.requested,
    ]);

    if (budget.status === "under") {
        lines.push(["", `${plural(budget.remaining, "more position")} can be filled within this budget.`]);
    }

    lines.push(["Annual salary budget", formatMoney(budget.salaryBudget)]);

    if (hasCost && exceeded) {
        lines.push(["Cost of this request", `${formatMoney(budget.salaryMax)} × 12 × ${budget.requested} = ${formatMoney(budget.requestCost)}`]);
        lines.push([
            "Salary budget available",
            budget.salaryExceeded
                ? <>{formatMoney(budget.salaryAvailable)} <b>→ exceeds by {formatMoney(budget.salaryExceededBy)}</b></>
                : formatMoney(budget.salaryAvailable),
        ]);
    } else if (hasCost) {
        lines.push(["Cost of this request", `${formatMoney(budget.requestCost)} of ${formatMoney(budget.salaryAvailable)} available`]);
    }
    return lines;
}

export function BudgetDetails({ budget, currency, audience = "requester" }) {
    if (!budget) return null;
    const tone = isBudgetException(budget) ? "exception" : "within";

    // Snapshots saved by the old budget check have none of these fields
    if (budget.budgetedPositions === undefined && budget.status !== "no_budget") {
        return (
            <div className={`mpr-budget-box ${budget.status === "within" ? "within" : "exception"}`}>
                <p className="mpr-budget-legacy">{budget.reason || "Checked with the previous budget method before this MPR was updated."}</p>
            </div>
        );
    }

    return (
        <div className={`mpr-budget-box ${tone}`}>
            <dl>
                {detailLines(budget, audience).map(([label, value], index) => (
                    <div key={`${label}-${index}`} className={label ? "" : "mpr-budget-note"}>
                        {label && <><dt>{label}:</dt>{" "}</>}
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
            {currency && budget.status !== "no_budget" && <small>Amounts in {currency}</small>}
        </div>
    );
}

// Badge above the form after the pop-up closes (match shows nothing)
export function BudgetBadge({ budget, acknowledged }) {
    if (!budget || budget.status === "match") return null;

    if (budget.status === "under") {
        return (
            <div className="mpr-budget within">
                <span className="mpr-budget-badge">Within budget – {plural(budget.remaining, "position")} still available</span>
                {budget.salaryMax > 0 && (
                    <p>Cost of this request: {formatMoney(budget.requestCost)} of {formatMoney(budget.salaryAvailable)} available</p>
                )}
            </div>
        );
    }

    if (!acknowledged) return null;
    const reasons = budget.status === "no_budget"
        ? [budget.reason]
        : [
            budget.positionsExceeded && `${plural(budget.requested, "position")} requested, ${budget.available} available (exceeds by ${budget.exceededBy})`,
            budget.salaryExceeded && `Cost ${formatMoney(budget.requestCost)} exceeds the ${formatMoney(budget.salaryAvailable)} salary budget available by ${formatMoney(budget.salaryExceededBy)}`,
        ].filter(Boolean);

    return (
        <div className="mpr-budget exception">
            <span className="mpr-budget-badge">{budget.status === "no_budget" ? "No budget set" : "Budget exceeded"}</span>
            <p>{reasons.join(" • ")}. <b>Justification is required.</b></p>
        </div>
    );
}

// Status pill for approvers (MPR detail)
export function BudgetStatusPill({ budget }) {
    if (!budget) return null;
    const label = budget.status === "no_budget" ? "No budget set"
        : isBudgetException(budget) || budget.status === "exception" ? "Budget exceeded"
            : "Within budget";
    const tone = label === "Within budget" ? "within" : "exception";
    return <span className={`mpr-budget-pill ${tone}`}>{label}</span>;
}
