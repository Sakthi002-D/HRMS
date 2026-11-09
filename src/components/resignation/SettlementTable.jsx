// Final settlement figures: inputs (with "Missing" warnings), calculated rows with their formula,
// clearance deductions, optional manual rows, and the net amount in a total row. A negative net is
// shown as "Amount the employee owes" (amber) instead of a minus amount.
// editable: HR edits "Other earnings" / "Other deductions" (manual + onManualChange); the computed
// rows come from settlementCalculation.js, so only the manual rows are added here.
// showMissingWarning=false: the caller shows its own notice (HR case window: inline fields).
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate, formatQar } from "./resignationApi";
import { leaveDaysLabel, settlementTotals } from "./settlementFormat";

const INPUT_LABELS = {
    basic: ["basic", "Basic salary"],
    allowances: ["allowances", "Allowances"],
    joining_date: ["joiningDate", "Joining date"],
    leave_balance: ["leaveBalance", "Leave balance"],
};

function ManualRows({ kind, rows, onChange, idPrefix }) {
    const { t } = useTranslation();
    const label = kind === "earnings"
        ? t("resignation.settlement.otherEarnings", { defaultValue: "Other earnings" })
        : t("resignation.settlement.otherDeductions", { defaultValue: "Other deductions" });
    const update = (index, changes) => onChange(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));

    return (
        <>
            {rows.map((row, index) => (
                <tr key={`${kind}-${index}`} className={`settlement-row manual ${kind === "earnings" ? "earning" : "deduction"}`}>
                    <td className="settlement-item">
                        <label className="sr-only" htmlFor={`${idPrefix}-${kind}-desc-${index}`}>{label} – {t("resignation.settlement.description", { defaultValue: "description" })}</label>
                        <input
                            id={`${idPrefix}-${kind}-desc-${index}`}
                            type="text"
                            value={row.description}
                            onChange={(event) => update(index, { description: event.target.value })}
                            placeholder={`${label}: ${t("resignation.settlement.descriptionPlaceholder", { defaultValue: "description" })}`}
                            maxLength={200}
                        />
                    </td>
                    <td className="settlement-amount">
                        <span className="settlement-manual-amount">
                            <span aria-hidden="true">{kind === "deductions" ? "− QAR" : "QAR"}</span>
                            <label className="sr-only" htmlFor={`${idPrefix}-${kind}-amount-${index}`}>{label} – {t("resignation.settlement.amount", { defaultValue: "amount (QAR)" })}</label>
                            <input
                                id={`${idPrefix}-${kind}-amount-${index}`}
                                type="number"
                                min="0.01"
                                step="0.01"
                                inputMode="decimal"
                                value={row.amount}
                                onChange={(event) => update(index, { amount: event.target.value })}
                            />
                            <button type="button" className="rs-icon-button" aria-label={t("resignation.settlement.removeRow", { defaultValue: "Remove row" })} onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                                <Trash2 size={14} aria-hidden="true" />
                            </button>
                        </span>
                    </td>
                </tr>
            ))}
        </>
    );
}

// Net row: payable, or (net < 0) the amount the employee owes. audience "employee" → "Amount to be recovered"
export function NetRow({ net, audience = "hr" }) {
    const { t } = useTranslation();
    const owes = Number(net) < 0;
    const label = !owes
        ? t("resignation.settlement.net", { defaultValue: "Net amount payable" })
        : audience === "employee"
            ? t("resignation.settlement.toRecover", { defaultValue: "Amount to be recovered" })
            : t("resignation.settlement.employeeOwes", { defaultValue: "Amount the employee owes" });
    return (
        <tr className={`settlement-net${owes ? " owes" : ""}`}>
            <th scope="row" className="settlement-item">{label}</th>
            <td className="settlement-amount" dir="ltr">{formatQar(Math.abs(Number(net) || 0))}</td>
        </tr>
    );
}

function SettlementTable({ settlement, manual = null, onManualChange = null, idPrefix = "settlement", showMissingWarning = true, audience = "hr" }) {
    const { t } = useTranslation();
    if (!settlement) return null;
    const editable = Boolean(manual && onManualChange);
    const rows = editable ? settlement.rows.filter((row) => !row.manual) : settlement.rows;
    const totals = settlementTotals(settlement, editable ? manual : null);
    const inputs = settlement.inputs || {};
    const missing = settlement.missing || [];
    const inputValue = (key) => {
        if (missing.includes(key)) return <span className="settlement-missing">{t("resignation.settlement.missing", { defaultValue: "Missing" })}</span>;
        if (key === "joining_date") return <span dir="ltr">{formatDate(inputs.joining_date)}</span>;
        if (key === "leave_balance") return leaveDaysLabel(t, inputs.leave_balance);
        return <span dir="ltr" className="settlement-number">{formatQar(inputs[key])}</span>;
    };

    return (
        <div className="settlement">
            {showMissingWarning && missing.length > 0 && (
                <p className="hiring-notice warning" role="alert">
                    <AlertTriangle size={15} aria-hidden="true" />
                    <span>
                        {t("resignation.settlement.missingWarning", {
                            fields: missing.map((key) => t(`resignation.settlement.inputs.${INPUT_LABELS[key][0]}`, { defaultValue: INPUT_LABELS[key][1] })).join(", "),
                            defaultValue: "Missing: {{fields}}. Missing amounts count as 0. Fill them in Payroll / Employees / Leave first.",
                        })}
                    </span>
                </p>
            )}

            <dl className="settlement-inputs">
                {Object.keys(INPUT_LABELS).map((key) => (
                    <div key={key}>
                        <dt>{t(`resignation.settlement.inputs.${INPUT_LABELS[key][0]}`, { defaultValue: INPUT_LABELS[key][1] })}</dt>
                        <dd>{inputValue(key)}</dd>
                    </div>
                ))}
                <div>
                    <dt>{t("resignation.settlement.inputs.service", { defaultValue: "Service" })}</dt>
                    <dd>{t("resignation.settlement.years", { years: Number(inputs.years_of_service || 0).toFixed(2), defaultValue: "{{years}} years" })}</dd>
                </div>
            </dl>

            <div className="settlement-table-wrap">
                <table className="settlement-table">
                    <caption className="sr-only">{t("resignation.settlement.caption", { defaultValue: "Final settlement" })}</caption>
                    <thead>
                        <tr>
                            <th scope="col" className="settlement-item">{t("resignation.settlement.item", { defaultValue: "Item" })}</th>
                            <th scope="col" className="settlement-amount">{t("resignation.settlement.amountHeader", { defaultValue: "Amount" })}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.key} className={`settlement-row ${row.kind}`}>
                                <td className="settlement-item">
                                    <span className="settlement-label">{row.label}</span>
                                    {row.formula && <small className="settlement-formula">{row.formula}</small>}
                                </td>
                                <td className="settlement-amount" dir="ltr">{row.kind === "deduction" ? "− " : ""}{formatQar(row.amount)}</td>
                            </tr>
                        ))}
                        {editable && <ManualRows kind="earnings" rows={manual.earnings} onChange={(earnings) => onManualChange({ ...manual, earnings })} idPrefix={idPrefix} />}
                        {editable && <ManualRows kind="deductions" rows={manual.deductions} onChange={(deductions) => onManualChange({ ...manual, deductions })} idPrefix={idPrefix} />}
                    </tbody>
                    <tfoot>
                        <tr className="settlement-subtotal">
                            <td className="settlement-item">{t("resignation.settlement.totalEarnings", { defaultValue: "Total earnings" })}</td>
                            <td className="settlement-amount" dir="ltr">{formatQar(totals.earnings)}</td>
                        </tr>
                        <tr className="settlement-subtotal">
                            <td className="settlement-item">{t("resignation.settlement.totalDeductions", { defaultValue: "Total deductions" })}</td>
                            <td className="settlement-amount" dir="ltr">− {formatQar(totals.deductions)}</td>
                        </tr>
                        <NetRow net={totals.net} audience={audience} />
                    </tfoot>
                </table>
            </div>

            {editable && (
                <div className="settlement-add">
                    <button type="button" className="rs-link-button" onClick={() => onManualChange({ ...manual, earnings: [...manual.earnings, { description: "", amount: "" }] })}>
                        <Plus size={14} aria-hidden="true" /> {t("resignation.settlement.addEarning", { defaultValue: "Other earning" })}
                    </button>
                    <button type="button" className="rs-link-button" onClick={() => onManualChange({ ...manual, deductions: [...manual.deductions, { description: "", amount: "" }] })}>
                        <Plus size={14} aria-hidden="true" /> {t("resignation.settlement.addDeduction", { defaultValue: "Other deduction" })}
                    </button>
                </div>
            )}
        </div>
    );
}

export default SettlementTable;
