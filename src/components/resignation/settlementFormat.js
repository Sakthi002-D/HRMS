// Final settlement helpers shared by SettlementTable and the HR case window
import { formatLeaveDays } from "../../../backend/services/settlementCalculation.js";

const sum = (rows) => rows.reduce((total, row) => total + (Number(row.amount) || 0), 0);
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function settlementTotals(settlement, manual = null) {
    if (!manual) return { earnings: settlement.total_earnings, deductions: settlement.total_deductions, net: settlement.net };
    const earnings = round2(settlement.total_earnings + sum(manual.earnings));
    const deductions = round2(settlement.total_deductions + sum(manual.deductions));
    return { earnings, deductions, net: round2(earnings - deductions) };
}

// Leave days with the same rounding everywhere (Details tab, settlement)
export const leaveDaysLabel = (t, days) => t("resignation.settlement.leaveDays", { days: formatLeaveDays(days), defaultValue: Number(days) === 1 ? "{{days}} day" : "{{days}} days" });
