// =====================================================
// ANNUAL LEAVE BALANCE — single source of truth
// FRD SHELTER-HCM-LA-15-001: days accrue monthly at yearly entitlement ÷ 12.
//
// Used by: leave-apply API, the balance endpoint (employee Apply Leave card
// and HR review modal), the accrual ledger job and Shelter Assistant.
// Calculated live from the records on every call; nothing is cached.
// =====================================================

import pool from "../db.js";
import { getCompanyToday } from "./leaveDateRules.js";

export const ANNUAL_LEAVE_TYPE = "Annual Leave";
export const DEFAULT_YEARLY_ENTITLEMENT_DAYS = 30;
export const DEFAULT_SALARY_BASIS = "total";
export const SALARY_BASES = ["basic", "total"];

const round2 = (value) => Math.round(value * 100) / 100;

const parseKey = (key) => key.split("-").map(Number);

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// Date the n-th month completes: same day-of-month as joining, or the last
// day of the month when that day doesn't exist (joined 31 Jan → 28/29 Feb).
export const monthCompletionDate = (joiningKey, monthNumber) => {
    const [year, month, day] = parseKey(joiningKey);
    const target = new Date(Date.UTC(year, month - 1 + monthNumber, 1));
    const targetYear = target.getUTCFullYear();
    const targetMonth = target.getUTCMonth() + 1;
    const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
    return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
};

// Full months from joining to asOf (both YYYY-MM-DD)
export const completedMonthsBetween = (joiningKey, asOfKey) => {
    if (!joiningKey || !asOfKey || asOfKey < joiningKey) return 0;
    const [startYear, startMonth] = parseKey(joiningKey);
    const [endYear, endMonth] = parseKey(asOfKey);
    const months = (endYear - startYear) * 12 + (endMonth - startMonth);
    return monthCompletionDate(joiningKey, months) <= asOfKey ? months : Math.max(0, months - 1);
};

// Annual Leave settings from Leave Policy Setup
export async function getAnnualLeavePolicy(db = pool) {
    const result = await db.query("SELECT policy FROM leave_policy_settings WHERE id = 1");
    const policy = result.rows[0]?.policy || {};
    const annual = policy.annualLeave || {};

    const yearlyEntitlementDays = Number(annual.yearly_entitlement_days) > 0
        ? Number(annual.yearly_entitlement_days)
        : DEFAULT_YEARLY_ENTITLEMENT_DAYS;

    const gradeOverrides = {};
    Object.entries(annual.grade_overrides || {}).forEach(([grade, days]) => {
        if (grade.trim() && Number(days) > 0) gradeOverrides[grade.trim().toLowerCase()] = Number(days);
    });

    const salaryBasis = SALARY_BASES.includes(policy.leave_accrual_salary_basis)
        ? policy.leave_accrual_salary_basis
        : DEFAULT_SALARY_BASIS;

    return { yearlyEntitlementDays, gradeOverrides, salaryBasis };
}

// Yearly entitlement for an employee's grade (falls back to the default)
export const entitlementForGrade = (policy, grade) =>
    policy.gradeOverrides[String(grade || "").trim().toLowerCase()] ?? policy.yearlyEntitlementDays;

/*
  Returns {
    completedMonths, yearlyEntitlementDays, monthlyAccrual (= accrual_rate),
    openingBalance, accrued (= months × rate + opening),
    used      — APPROVED Annual Leave days only,
    pending   — PENDING Annual Leave days (submit check only),
    remaining — the balance: accrued − used,
    available — balance − pending (what can still be applied for),
    eligible, asOf, joiningDate, grade
  }
*/
export async function getAnnualLeaveBalance(employeeId, { asOf, db = pool, policy } = {}) {
    const today = asOf || getCompanyToday();

    // Sequential: db may be a single transaction client
    const employeeResult = await db.query(
        `SELECT TO_CHAR(joining_date, 'YYYY-MM-DD') AS joining_date,
                grade,
                COALESCE(annual_leave_opening_days, 0)::numeric AS opening_days
         FROM employees
         WHERE employee_id = $1`,
        [employeeId]
    );
    const leaveResult = await db.query(
        `SELECT
            COALESCE(SUM(days) FILTER (WHERE LOWER(status) = 'approved'), 0)::numeric AS used,
            COALESCE(SUM(days) FILTER (WHERE LOWER(status) = 'pending'), 0)::numeric AS pending
         FROM leaves
         WHERE employee_id = $1
           AND leave_type = $2`,
        [employeeId, ANNUAL_LEAVE_TYPE]
    );
    const annualPolicy = policy || await getAnnualLeavePolicy(db);

    if (employeeResult.rows.length === 0) return null;

    const { joining_date: joiningDate, grade, opening_days: openingDays } = employeeResult.rows[0];
    const yearlyEntitlementDays = entitlementForGrade(annualPolicy, grade);
    const monthlyAccrual = yearlyEntitlementDays / 12;
    const completedMonths = completedMonthsBetween(joiningDate, today);
    const openingBalance = Number(openingDays || 0);
    const accrued = round2(completedMonths * monthlyAccrual + openingBalance);
    const used = Number(leaveResult.rows[0].used || 0);
    const pending = Number(leaveResult.rows[0].pending || 0);
    const remaining = round2(accrued - used);
    const available = round2(Math.max(0, remaining - pending));

    return {
        employeeId,
        asOf: today,
        joiningDate,
        grade: grade || null,
        completedMonths,
        yearlyEntitlementDays,
        monthlyAccrual: round2(monthlyAccrual),
        openingBalance,
        accrued,
        used,
        pending,
        remaining,
        available,
        // FRD: accrual starts from joining; a zero balance simply allows 0 days
        eligible: true,
    };
}

// Submit rule: requestedDays ≤ balance − pending. Returns an error message or null.
export async function checkAnnualLeaveRequest(employeeId, requestedDays, options) {
    const balance = await getAnnualLeaveBalance(employeeId, options);

    if (!balance) return "Employee not found";

    if (requestedDays > balance.available) {
        return `Available to apply: ${balance.available} day(s)`;
    }

    return null;
}
