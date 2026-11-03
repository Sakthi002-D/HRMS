import { test } from "node:test";
import assert from "node:assert/strict";
import {
    NO_WORKING_DAYS_MESSAGE,
    calculateLeaveDays,
    countLeaveWorkingDays,
    findOverlappingLeave,
    resolveHolidayDates,
    sharedWorkingDays,
} from "./leaveDayCount.js";

// Same shape as leave_policy_settings.qatarHolidayCalendar
const QATAR_HOLIDAYS = [
    { name: "National Day", date: "18 December", days: 1 },
    { name: "National Sports Day", date: "Second Tuesday of February", days: 1 },
    { name: "Eid al-Fitr", date: "Islamic calendar", days: 3 },
];

const fakeDb = (calendar) => ({
    query: async () => ({ rows: [{ calendar }] }),
});

test("normal week: Sunday to Thursday counts 5 working days", () => {
    // 2026-11-01 is a Sunday
    assert.equal(countLeaveWorkingDays("2026-11-01", "2026-11-05", QATAR_HOLIDAYS), 5);
});

test("single working day counts as 1 day", () => {
    assert.equal(countLeaveWorkingDays("2026-11-03", "2026-11-03", QATAR_HOLIDAYS), 1);
});

test("range spanning Friday and Saturday excludes the weekend", () => {
    // Thu 2026-11-05 to Sun 2026-11-08: Thu + Sun only
    assert.equal(countLeaveWorkingDays("2026-11-05", "2026-11-08", QATAR_HOLIDAYS), 2);
    // Two full weeks Sun-Sat: 10 working days
    assert.equal(countLeaveWorkingDays("2026-11-01", "2026-11-14", QATAR_HOLIDAYS), 10);
});

test("range spanning a Qatar public holiday excludes the holiday", () => {
    // National Sports Day 2027 = second Tuesday of February = 2027-02-09
    assert.ok(resolveHolidayDates(QATAR_HOLIDAYS, "2027-02-01", "2027-02-28").has("2027-02-09"));
    // Sun 2027-02-07 to Thu 2027-02-11: 5 weekdays minus the holiday
    assert.equal(countLeaveWorkingDays("2027-02-07", "2027-02-11", QATAR_HOLIDAYS), 4);
    // National Day 2028-12-18 falls on a Monday: Sun 17 to Tue 19 = 2 working days
    assert.equal(countLeaveWorkingDays("2028-12-17", "2028-12-19", QATAR_HOLIDAYS), 2);
});

test("single day on a holiday has no working days", async () => {
    assert.equal(countLeaveWorkingDays("2027-02-09", "2027-02-09", QATAR_HOLIDAYS), 0);
    assert.deepEqual(
        await calculateLeaveDays("2027-02-09", "2027-02-09", fakeDb(QATAR_HOLIDAYS)),
        { error: NO_WORKING_DAYS_MESSAGE }
    );
});

test("weekend-only range returns the no-working-days error", async () => {
    // Fri 2026-11-06 to Sat 2026-11-07
    assert.deepEqual(
        await calculateLeaveDays("2026-11-06", "2026-11-07", fakeDb(QATAR_HOLIDAYS)),
        { error: NO_WORKING_DAYS_MESSAGE }
    );
});

test("calculateLeaveDays reads the calendar from the policy and returns working days", async () => {
    assert.deepEqual(await calculateLeaveDays("2027-02-07", "2027-02-11", fakeDb(QATAR_HOLIDAYS)), { days: 4 });
    // Missing calendar: weekends are still excluded
    assert.deepEqual(await calculateLeaveDays("2026-11-01", "2026-11-07", fakeDb(null)), { days: 5 });
});

test("exact-date holidays span their days, and unresolvable dates are skipped", () => {
    const calendar = [{ name: "Eid al-Fitr 2027", date: "2027-03-09", days: 3 }, { name: "Eid", date: "Islamic calendar", days: 3 }];
    // Sun 2027-03-07 to Thu 2027-03-11: Eid covers Tue 9, Wed 10, Thu 11
    assert.equal(countLeaveWorkingDays("2027-03-07", "2027-03-11", calendar), 2);
});

test("invalid or reversed ranges return null", () => {
    assert.equal(countLeaveWorkingDays("2026-11-05", "2026-11-01", QATAR_HOLIDAYS), null);
    assert.equal(countLeaveWorkingDays("2026-02-30", "2026-03-01", QATAR_HOLIDAYS), null);
    assert.equal(countLeaveWorkingDays("", "2026-03-01", QATAR_HOLIDAYS), null);
});

// Fake db for findOverlappingLeave: applies the same status/date filter as the SQL
const leavesDb = (leaves, calendar = QATAR_HOLIDAYS) => ({
    query: async (sql, params) => {
        if (sql.includes("qatarHolidayCalendar")) return { rows: [{ calendar }] };
        const [employeeId, fromDate, toDate] = params;
        return {
            rows: leaves.filter((leave) =>
                leave.employee_id === employeeId
                && ["approved", "pending"].includes(leave.status.toLowerCase())
                && leave.from_day <= toDate
                && leave.to_day >= fromDate
            ),
        };
    },
});

const leave = (id, status, fromDay, toDay, employeeId = "EMP1") => ({ id, employee_id: employeeId, status, from_day: fromDay, to_day: toDay });

test("overlap with an approved leave is found", async () => {
    const db = leavesDb([leave(7, "Approved", "2026-11-02", "2026-11-04")]);
    // Wed 2026-11-04 is shared
    const overlap = await findOverlappingLeave("EMP1", "2026-11-04", "2026-11-05", db);
    assert.equal(overlap?.id, 7);
});

test("overlap with a pending leave is found", async () => {
    const db = leavesDb([leave(8, "Pending", "2026-11-01", "2026-11-12")]);
    // Requested range sits inside the pending one
    const overlap = await findOverlappingLeave("EMP1", "2026-11-03", "2026-11-03", db);
    assert.equal(overlap?.id, 8);
});

test("rejected/cancelled leaves, other employees and adjacent dates do not overlap", async () => {
    const db = leavesDb([
        leave(1, "Rejected", "2026-11-03", "2026-11-03"),
        leave(2, "Cancelled", "2026-11-03", "2026-11-03"),
        leave(3, "Approved", "2026-11-03", "2026-11-03", "EMP2"),
        leave(4, "Approved", "2026-11-01", "2026-11-02"),
    ]);
    assert.equal(await findOverlappingLeave("EMP1", "2026-11-03", "2026-11-05", db), null);
});

test("ranges sharing only weekend days do not overlap", async () => {
    // Existing Thu 2026-11-05 to Sat 2026-11-07; requested Fri 2026-11-06 to Sun 2026-11-08
    assert.equal(sharedWorkingDays("2026-11-06", "2026-11-08", "2026-11-05", "2026-11-07"), 0);
    const db = leavesDb([leave(9, "Approved", "2026-11-05", "2026-11-07")]);
    assert.equal(await findOverlappingLeave("EMP1", "2026-11-06", "2026-11-08", db), null);
});
