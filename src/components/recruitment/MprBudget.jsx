// Budget check display for New Position MPRs: the details box used in the form pop-ups,
// the badge above the form, and the MPR detail for approvers.
import { useTranslation } from "react-i18next";
import { formatMoney, isBudgetException } from "./recruitmentApi";

// Number expressions ("8,000 × 12 × 2 = 192,000") always read left-to-right, also on the Arabic page
const Ltr = ({ children }) => <span dir="ltr" className="ltr-text">{children}</span>;

// The backend's "No budget set for IT (2026). Set it in Settings → Recruitment Masters."
// Arabic text only in ar.json, so English keeps the backend sentence exactly.
const noBudgetReason = (t, budget) =>
    t("recruitment.budget.noBudgetReason", { department: budget.department, year: budget.year, defaultValue: budget.reason });

// Lines in the order the pop-ups show them. audience "approver" says "Requested" instead of "You requested".
function detailLines(t, budget, audience) {
    if (budget.status === "no_budget") return [["", noBudgetReason(t, budget)]];

    const requestedLabel = audience === "approver"
        ? t("recruitment.budget.requested", { defaultValue: "Requested" })
        : t("recruitment.budget.youRequested", { defaultValue: "You requested" });
    const exceeded = budget.status === "exceeded";
    const hasCost = budget.salaryMax > 0;
    const lines = [
        [t("profileEdit.fields.department", { defaultValue: "Department" }), `${budget.department} (${budget.year})`],
        [t("recruitment.budget.budgetedPositions", { defaultValue: "Budgeted positions" }), budget.budgetedPositions],
    ];

    if (exceeded || budget.alreadyUsed > 0 || audience === "approver") {
        lines.push([t("recruitment.budget.alreadyUsed", { defaultValue: "Already used by other requests" }), budget.alreadyUsed]);
    }
    if (exceeded || audience === "approver") lines.push([t("recruitment.budget.available", { defaultValue: "Available" }), budget.available]);

    lines.push([
        requestedLabel,
        budget.positionsExceeded
            ? <>{budget.requested} <b>{t("recruitment.budget.exceedsBy", { amount: budget.exceededBy, defaultValue: "→ exceeds by {{amount}}" })}</b></>
            : budget.requested,
    ]);

    if (budget.status === "under") {
        lines.push(["", t("recruitment.budget.morePositions", { count: budget.remaining, defaultValue: `${budget.remaining} more position${budget.remaining === 1 ? "" : "s"} can be filled within this budget.` })]);
    }

    lines.push([t("recruitment.budget.annualSalaryBudget", { defaultValue: "Annual salary budget" }), <Ltr>{formatMoney(budget.salaryBudget)}</Ltr>]);

    if (hasCost && exceeded) {
        lines.push([
            t("recruitment.budget.requestCost", { defaultValue: "Cost of this request" }),
            <Ltr>{`${formatMoney(budget.salaryMax)} × 12 × ${budget.requested} = ${formatMoney(budget.requestCost)}`}</Ltr>,
        ]);
        lines.push([
            t("recruitment.budget.salaryAvailable", { defaultValue: "Salary budget available" }),
            budget.salaryExceeded
                ? <><Ltr>{formatMoney(budget.salaryAvailable)}</Ltr> <b>{t("recruitment.budget.exceedsBy", { amount: formatMoney(budget.salaryExceededBy), defaultValue: "→ exceeds by {{amount}}" })}</b></>
                : <Ltr>{formatMoney(budget.salaryAvailable)}</Ltr>,
        ]);
    } else if (hasCost) {
        lines.push([
            t("recruitment.budget.requestCost", { defaultValue: "Cost of this request" }),
            t("recruitment.budget.costOfAvailable", { cost: formatMoney(budget.requestCost), available: formatMoney(budget.salaryAvailable), defaultValue: "{{cost}} of {{available}} available" }),
        ]);
    }
    return lines;
}

export function BudgetDetails({ budget, currency, audience = "requester" }) {
    const { t } = useTranslation();
    if (!budget) return null;
    const tone = isBudgetException(budget) ? "exception" : "within";

    // Snapshots saved by the old budget check have none of these fields
    if (budget.budgetedPositions === undefined && budget.status !== "no_budget") {
        return (
            <div className={`mpr-budget-box ${budget.status === "within" ? "within" : "exception"}`}>
                <p className="mpr-budget-legacy">{budget.reason || t("recruitment.budget.legacyCheck", { defaultValue: "Checked with the previous budget method before this MPR was updated." })}</p>
            </div>
        );
    }

    return (
        <div className={`mpr-budget-box ${tone}`}>
            <dl>
                {detailLines(t, budget, audience).map(([label, value], index) => (
                    <div key={`${label}-${index}`} className={label ? "" : "mpr-budget-note"}>
                        {label && <><dt>{label}:</dt>{" "}</>}
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
            {currency && budget.status !== "no_budget" && <small>{t("recruitment.budget.amountsIn", { currency, defaultValue: "Amounts in {{currency}}" })}</small>}
        </div>
    );
}

// Badge above the form after the pop-up closes (match shows nothing)
export function BudgetBadge({ budget, acknowledged }) {
    const { t } = useTranslation();
    if (!budget || budget.status === "match") return null;

    if (budget.status === "under") {
        return (
            <div className="mpr-budget within">
                <span className="mpr-budget-badge">{t("recruitment.budget.withinStillAvailable", { count: budget.remaining, defaultValue: `Within budget – ${budget.remaining} position${budget.remaining === 1 ? "" : "s"} still available` })}</span>
                {budget.salaryMax > 0 && (
                    <p>{t("recruitment.budget.costLine", { cost: formatMoney(budget.requestCost), available: formatMoney(budget.salaryAvailable), defaultValue: "Cost of this request: {{cost}} of {{available}} available" })}</p>
                )}
            </div>
        );
    }

    if (!acknowledged) return null;
    const reasons = budget.status === "no_budget"
        ? [noBudgetReason(t, budget)]
        : [
            budget.positionsExceeded && t("recruitment.budget.positionsExceededReason", {
                count: budget.requested,
                available: budget.available,
                exceededBy: budget.exceededBy,
                defaultValue: `${budget.requested} position${budget.requested === 1 ? "" : "s"} requested, {{available}} available (exceeds by {{exceededBy}})`,
            }),
            budget.salaryExceeded && t("recruitment.budget.salaryExceededReason", {
                cost: formatMoney(budget.requestCost),
                available: formatMoney(budget.salaryAvailable),
                exceededBy: formatMoney(budget.salaryExceededBy),
                defaultValue: "Cost {{cost}} exceeds the {{available}} salary budget available by {{exceededBy}}",
            }),
        ].filter(Boolean);

    return (
        <div className="mpr-budget exception">
            <span className="mpr-budget-badge">{budget.status === "no_budget"
                ? t("recruitment.budget.noBudget", { defaultValue: "No budget set" })
                : t("recruitment.budget.exceeded", { defaultValue: "Budget exceeded" })}</span>
            <p>{reasons.join(" • ")}. <b>{t("recruitment.budget.justificationRequired", { defaultValue: "Justification is required." })}</b></p>
        </div>
    );
}

// Status pill for approvers (MPR detail)
export function BudgetStatusPill({ budget }) {
    const { t } = useTranslation();
    if (!budget) return null;
    // English label decides the colour; only the shown text is translated
    const label = budget.status === "no_budget" ? "No budget set"
        : isBudgetException(budget) || budget.status === "exception" ? "Budget exceeded"
            : "Within budget";
    const tone = label === "Within budget" ? "within" : "exception";
    const labelKey = { "No budget set": "noBudget", "Budget exceeded": "exceeded", "Within budget": "within" }[label];
    return <span className={`mpr-budget-pill ${tone}`}>{t(`recruitment.budget.${labelKey}`, { defaultValue: label })}</span>;
}
