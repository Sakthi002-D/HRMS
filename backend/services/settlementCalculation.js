// =====================================================
// FINAL SETTLEMENT CALCULATION (pure, no imports)
//
// Shared by the server (resignationSettlement.js) and the HR case window, which recalculates the
// table while HR types a missing basic salary / allowances / joining date. Keep it free of
// Node or browser APIs.
// =====================================================

export const CURRENCY = "QAR";

// Who approves the final settlement (Settings → Resignation → Final settlement). FINANCE is wired
// in the backend (send-to-finance / decideSettlement) but has no screen yet, so it can't be chosen.
export const SETTLEMENT_APPROVERS = ["HR", "FINANCE"];
export const AVAILABLE_SETTLEMENT_APPROVERS = ["HR"];
export const DEFAULT_SETTLEMENT_APPROVER = "HR";

export const DEFAULT_FINAL_SETTLEMENT = {
    gratuityDaysPerYear: 21,
    minServiceYears: 1,
    leaveEncashmentBasis: "basic",
    settlementApprover: DEFAULT_SETTLEMENT_APPROVER,
};

export const settlementApproverOf = (finalSettlement) =>
    (SETTLEMENT_APPROVERS.includes(finalSettlement?.settlementApprover) ? finalSettlement.settlementApprover : DEFAULT_SETTLEMENT_APPROVER);

export const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export const formatAmount = (value) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Leave days: the same rounding everywhere (Details tab, settlement formula, statement): up to 2 decimals
export const formatLeaveDays = (value) => Number(round2(value || 0)).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const toUtc = (key) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
};
const daysBetween = (fromKey, toKey) => Math.round((toUtc(toKey) - toUtc(fromKey)) / 86400000);
const monthYear = (key) => new Date(toUtc(key)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

const isBlank = (value) => value === null || value === undefined || value === "";
const num = (value) => (isBlank(value) || !Number.isFinite(Number(value)) ? null : Number(value));
const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

// Fields the employee record lacks (basic 0 counts as missing)
export const missingInputs = (inputs) => ["basic", "allowances", "joining_date", "leave_balance"].filter((key) => {
    if (key === "basic") return !(num(inputs.basic) > 0);
    if (key === "joining_date") return !isDateKey(inputs.joining_date);
    return num(inputs[key]) === null;
});

// HR's typed values fill only what the record lacks
export function applyInputOverrides(recordInputs, overrides = {}) {
    const missing = missingInputs(recordInputs);
    const next = { ...recordInputs };
    if (missing.includes("basic") && num(overrides.basic) > 0) next.basic = round2(overrides.basic);
    if (missing.includes("allowances") && num(overrides.allowances) !== null && num(overrides.allowances) >= 0) next.allowances = round2(overrides.allowances);
    if (missing.includes("joining_date") && isDateKey(overrides.joining_date)) next.joining_date = overrides.joining_date;
    return next;
}

// Rows + totals. net < 0 means the employee owes the company (owes = −net).
export function calculateSettlement({ inputs, settings, lastWorkingDay, clearanceDeductions = [], manual = { earnings: [], deductions: [] } }) {
    const rules = { ...DEFAULT_FINAL_SETTLEMENT, ...(settings || {}) };
    const missing = missingInputs(inputs);
    const basic = num(inputs.basic) ?? 0;
    const allowances = num(inputs.allowances) ?? 0;
    const gross = basic + allowances;
    const leaveBalance = round2(num(inputs.leave_balance) ?? 0);
    const joiningDate = isDateKey(inputs.joining_date) ? inputs.joining_date : null;

    const rows = [];

    // Service: joining date → last working day (inclusive)
    let serviceDays = 0;
    if (joiningDate && joiningDate <= lastWorkingDay) serviceDays = daysBetween(joiningDate, lastWorkingDay) + 1;
    const years = serviceDays / 365;
    const yearsText = years.toFixed(2);

    const eligible = Boolean(joiningDate) && years >= rules.minServiceYears;
    rows.push({
        key: "gratuity",
        kind: "earning",
        label: "End of service gratuity",
        formula: eligible
            ? `(${formatAmount(basic)} basic ÷ 30) × ${rules.gratuityDaysPerYear} days × ${yearsText} years of service`
            : `Not eligible: ${yearsText} years of service (minimum ${rules.minServiceYears} year${rules.minServiceYears === 1 ? "" : "s"})`,
        amount: eligible ? round2((basic / 30) * rules.gratuityDaysPerYear * years) : 0,
    });

    // Last month: from the 1st (or the joining date, if later) to the last working day, at most 30 days
    const monthStart = `${lastWorkingDay.slice(0, 8)}01`;
    const from = joiningDate && joiningDate > monthStart ? joiningDate : monthStart;
    const daysWorked = from <= lastWorkingDay ? Math.min(30, daysBetween(from, lastWorkingDay) + 1) : 0;
    rows.push({
        key: "last_salary",
        kind: "earning",
        label: "Salary for last month",
        formula: `(${formatAmount(basic)} basic + ${formatAmount(allowances)} allowances) ÷ 30 × ${daysWorked} days worked in ${monthYear(lastWorkingDay)}`,
        amount: round2((gross / 30) * daysWorked),
    });

    const leaveBase = rules.leaveEncashmentBasis === "gross" ? gross : basic;
    rows.push({
        key: "leave",
        kind: "earning",
        label: "Unused annual leave",
        formula: `${formatLeaveDays(leaveBalance)} days × (${formatAmount(leaveBase)} ${rules.leaveEncashmentBasis === "gross" ? "gross" : "basic"} ÷ 30)`,
        amount: round2(leaveBalance * (leaveBase / 30)),
    });

    for (const item of clearanceDeductions) {
        rows.push({ key: `clearance_${item.id}`, kind: "deduction", label: `Clearance: ${item.department} · ${item.name}`, formula: "Exit clearance deduction", amount: round2(item.amount) });
    }
    (manual.earnings || []).forEach((row, index) => rows.push({ key: `other_earning_${index}`, kind: "earning", manual: true, label: `Other earnings: ${row.description}`, formula: "Entered by HR", amount: round2(row.amount) }));
    (manual.deductions || []).forEach((row, index) => rows.push({ key: `other_deduction_${index}`, kind: "deduction", manual: true, label: `Other deductions: ${row.description}`, formula: "Entered by HR", amount: round2(row.amount) }));

    const totalEarnings = round2(rows.filter((row) => row.kind === "earning").reduce((sum, row) => sum + row.amount, 0));
    const totalDeductions = round2(rows.filter((row) => row.kind === "deduction").reduce((sum, row) => sum + row.amount, 0));
    return {
        currency: CURRENCY,
        inputs: { ...inputs, leave_balance: num(inputs.leave_balance) === null ? null : leaveBalance, gross: round2(gross), service_days: serviceDays, years_of_service: round2(years), days_worked: daysWorked, last_working_day: lastWorkingDay },
        rules,
        missing,
        rows,
        total_earnings: totalEarnings,
        total_deductions: totalDeductions,
        net: round2(totalEarnings - totalDeductions),
    };
}
