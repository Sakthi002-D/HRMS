import { test } from "node:test";
import assert from "node:assert/strict";
import { INSUFFICIENT_BALANCE_MESSAGE, checkAnnualLeaveRequest, getAnnualLeaveBalance } from "./annualLeaveBalance.js";

// Joined 2025-11-01 and checked on 2026-11-01: 12 months × (30 ÷ 12) = 30 days accrued
const POLICY = { yearlyEntitlementDays: 30, gradeOverrides: {}, salaryBasis: "total" };
const AS_OF = "2026-11-01";

const balanceDb = ({ used, pending }) => ({
    query: async (sql) => (sql.includes("FROM employees")
        ? { rows: [{ joining_date: "2025-11-01", grade: null, opening_days: "0" }] }
        : { rows: [{ used: String(used), pending: String(pending) }] }),
});

const check = (requestedDays, leaves) =>
    checkAnnualLeaveRequest("EMP1", requestedDays, { db: balanceDb(leaves), asOf: AS_OF, policy: POLICY });

test("available = accrued - used (Approved) - pending (Pending)", async () => {
    const balance = await getAnnualLeaveBalance("EMP1", { db: balanceDb({ used: 10, pending: 15 }), asOf: AS_OF, policy: POLICY });
    assert.equal(balance.accrued, 30);
    assert.equal(balance.available, 5);
});

test("pending balance insufficient: pending days block the request", async () => {
    // 30 accrued - 10 used - 15 pending = 5 available; 6 requested
    const error = await check(6, { used: 10, pending: 15 });
    assert.ok(error.startsWith(INSUFFICIENT_BALANCE_MESSAGE), error);
    assert.match(error, /Available to apply: 5 day\(s\)/);
    // The same 6 days are fine without the pending requests
    assert.equal(await check(6, { used: 10, pending: 0 }), null);
});

test("pending balance sufficient: request fits after pending days", async () => {
    assert.equal(await check(5, { used: 10, pending: 15 }), null);
});
