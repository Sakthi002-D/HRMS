// =====================================================
// ANNUAL LEAVE ACCRUAL LEDGER (FRD SHELTER-HCM-LA-15-001)
//
// One row per employee per completed service month:
//   days_accrued   = yearly entitlement ÷ 12
//   amount_accrued = salary ÷ 12 (basic or total, per leave_accrual_salary_basis)
//
// The job catches up every missing month since joining, so the same run is
// both the daily accrual and the backfill. UNIQUE (employee_id, accrual_month)
// makes it idempotent. Rows not yet exported for Finance are refreshed on each
// run (salary / basis / rate changes); exported rows are frozen.
//
// GL posting (SHELTER-HCM-AP-16-002) is not defined yet: posted_to_finance is
// only set by the "Export for Finance" action.
// =====================================================

import pool from "../db.js";
import { getCompanyToday } from "./leaveDateRules.js";
import {
    completedMonthsBetween,
    entitlementForGrade,
    getAnnualLeavePolicy,
    monthCompletionDate,
} from "./annualLeaveBalance.js";

const round2 = (value) => Math.round(value * 100) / 100;

export async function ensureAnnualLeaveAccrualSchema(db = pool) {
    await db.query(`
        ALTER TABLE employees
        ADD COLUMN IF NOT EXISTS grade TEXT,
        ADD COLUMN IF NOT EXISTS annual_leave_opening_days NUMERIC(6, 2) NOT NULL DEFAULT 0
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS annual_leave_accrual_ledger (
            id BIGSERIAL PRIMARY KEY,
            employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
            accrual_month CHAR(7) NOT NULL,
            accrual_date DATE NOT NULL,
            days_accrued NUMERIC(6, 2) NOT NULL,
            salary_basis TEXT NOT NULL CHECK (salary_basis IN ('basic', 'total')),
            salary_amount NUMERIC(12, 2),
            amount_accrued NUMERIC(12, 2),
            posted_to_finance BOOLEAN NOT NULL DEFAULT FALSE,
            posted_at TIMESTAMPTZ,
            posting_reference TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (employee_id, accrual_month)
        )
    `);
    await db.query(`
        CREATE INDEX IF NOT EXISTS annual_leave_accrual_ledger_month_idx
        ON annual_leave_accrual_ledger (accrual_month)
    `);
}

// Salary in force on a date: latest payroll on/before it, else the earliest record
const salaryOn = (payrollRows, dateKey, basis) => {
    if (!payrollRows?.length) return null;
    const onOrBefore = payrollRows.filter((row) => row.salary_month <= dateKey);
    const row = onOrBefore.length ? onOrBefore[onOrBefore.length - 1] : payrollRows[0];
    const basic = Number(row.basic_salary || 0);
    return round2(basis === "basic" ? basic : basic + Number(row.allowances || 0));
};

export async function runAnnualLeaveAccrual({ asOf, db = pool } = {}) {
    const today = asOf || getCompanyToday();
    const policy = await getAnnualLeavePolicy(db);

    const employeesResult = await db.query(`
        SELECT employee_id, TO_CHAR(joining_date, 'YYYY-MM-DD') AS joining_date, grade
        FROM employees
        WHERE LOWER(status) = 'active' AND joining_date IS NOT NULL
    `);
    const payrollResult = await db.query(`
        SELECT employee_id, TO_CHAR(salary_month, 'YYYY-MM-DD') AS salary_month, basic_salary, allowances
        FROM employee_payroll
        WHERE salary_month IS NOT NULL
        ORDER BY employee_id, salary_month
    `);

    const payrollByEmployee = {};
    payrollResult.rows.forEach((row) => {
        (payrollByEmployee[row.employee_id] ||= []).push(row);
    });

    const rows = { employeeIds: [], months: [], dates: [], days: [], salaries: [], amounts: [] };

    employeesResult.rows.forEach((employee) => {
        const daysPerMonth = round2(entitlementForGrade(policy, employee.grade) / 12);
        const months = completedMonthsBetween(employee.joining_date, today);

        for (let monthNumber = 1; monthNumber <= months; monthNumber += 1) {
            const accrualDate = monthCompletionDate(employee.joining_date, monthNumber);
            const salary = salaryOn(payrollByEmployee[employee.employee_id], accrualDate, policy.salaryBasis);

            rows.employeeIds.push(employee.employee_id);
            rows.months.push(accrualDate.slice(0, 7));
            rows.dates.push(accrualDate);
            rows.days.push(daysPerMonth);
            rows.salaries.push(salary);
            rows.amounts.push(salary === null ? null : round2(salary / 12));
        }
    });

    if (rows.employeeIds.length === 0) {
        return { asOf: today, inserted: 0, refreshed: 0 };
    }

    const result = await db.query(
        `
        INSERT INTO annual_leave_accrual_ledger
            (employee_id, accrual_month, accrual_date, days_accrued, salary_basis, salary_amount, amount_accrued)
        SELECT employee_id, accrual_month, accrual_date, days_accrued, $7, salary_amount, amount_accrued
        FROM UNNEST($1::text[], $2::text[], $3::date[], $4::numeric[], $5::numeric[], $6::numeric[])
            AS t(employee_id, accrual_month, accrual_date, days_accrued, salary_amount, amount_accrued)
        ON CONFLICT (employee_id, accrual_month) DO UPDATE
        SET days_accrued = EXCLUDED.days_accrued,
            salary_basis = EXCLUDED.salary_basis,
            salary_amount = EXCLUDED.salary_amount,
            amount_accrued = EXCLUDED.amount_accrued,
            updated_at = CURRENT_TIMESTAMP
        WHERE annual_leave_accrual_ledger.posted_to_finance = FALSE
          AND (annual_leave_accrual_ledger.days_accrued, annual_leave_accrual_ledger.salary_basis,
               annual_leave_accrual_ledger.salary_amount, annual_leave_accrual_ledger.amount_accrued)
              IS DISTINCT FROM
              (EXCLUDED.days_accrued, EXCLUDED.salary_basis, EXCLUDED.salary_amount, EXCLUDED.amount_accrued)
        RETURNING (xmax = 0) AS inserted
        `,
        [rows.employeeIds, rows.months, rows.dates, rows.days, rows.salaries, rows.amounts, policy.salaryBasis]
    );

    const inserted = result.rows.filter((row) => row.inserted).length;
    return { asOf: today, inserted, refreshed: result.rows.length - inserted };
}

// Runs at startup (backfill) and then once per company day.
export function startAnnualLeaveAccrualScheduler({ intervalMs = 60 * 60 * 1000 } = {}) {
    let lastRunDate = null;

    const tick = async () => {
        const today = getCompanyToday();
        if (today === lastRunDate) return;
        try {
            const summary = await runAnnualLeaveAccrual({ asOf: today });
            lastRunDate = today;
            console.log(`Annual leave accrual ${today}: ${summary.inserted} new, ${summary.refreshed} refreshed`);
        } catch (error) {
            console.error("Annual leave accrual job failed:", error);
        }
    };

    tick();
    return setInterval(tick, intervalMs);
}

// =====================================================
// HR REPORT / FINANCE EXPORT
// =====================================================

export async function getAnnualLeaveAccrualReport({ month, db = pool } = {}) {
    const result = await db.query(
        `
        SELECT
            l.id,
            l.employee_id,
            e.name AS employee_name,
            e.department,
            e.grade,
            l.accrual_month,
            TO_CHAR(l.accrual_date, 'YYYY-MM-DD') AS accrual_date,
            l.days_accrued::float AS days_accrued,
            l.salary_basis,
            l.salary_amount::float AS salary_amount,
            l.amount_accrued::float AS amount_accrued,
            l.posted_to_finance,
            l.posted_at,
            l.posting_reference
        FROM annual_leave_accrual_ledger l
        JOIN employees e ON e.employee_id = l.employee_id
        WHERE ($1::text IS NULL OR l.accrual_month = $1)
        ORDER BY l.accrual_month DESC, l.employee_id
        `,
        [month || null]
    );

    const rows = result.rows;
    return {
        month: month || null,
        rows,
        totals: {
            employees: new Set(rows.map((row) => row.employee_id)).size,
            days: round2(rows.reduce((sum, row) => sum + (row.days_accrued || 0), 0)),
            amount: round2(rows.reduce((sum, row) => sum + (row.amount_accrued || 0), 0)),
            missingSalary: rows.filter((row) => row.amount_accrued === null).length,
            posted: rows.filter((row) => row.posted_to_finance).length,
        },
    };
}

// Marks the month's unposted rows (with an amount) as sent to Finance.
// Placeholder until the GL interface (SHELTER-HCM-AP-16-002) is defined.
export async function exportAnnualLeaveAccrualForFinance({ month, db = pool }) {
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const postingReference = `AL-ACCR-${month}-${stamp}`;

    const result = await db.query(
        `
        UPDATE annual_leave_accrual_ledger
        SET posted_to_finance = TRUE,
            posted_at = CURRENT_TIMESTAMP,
            posting_reference = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE accrual_month = $1
          AND posted_to_finance = FALSE
          AND amount_accrued IS NOT NULL
        `,
        [month, postingReference]
    );

    const report = await getAnnualLeaveAccrualReport({ month, db });
    return { postingReference, postedCount: result.rowCount, ...report };
}
