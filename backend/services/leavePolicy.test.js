import test from "node:test";
import assert from "node:assert/strict";
import { CALENDAR_DAY_LEAVE_TYPES, leaveLimitError, leaveLimitFor, leaveRulesFromPolicy, mergeLeaveTypes } from "./leavePolicy.js";
import { GRADES, defaultGradeEntitlements, normalizeGrade } from "./grades.js";

const STANDARD = {
    sickEligibleMonths: 3, sickDaysPerYear: 14, casualDaysPerYear: 2, maternityDays: 50,
    paternityDays: 3, bereavementDays: 14, umrahDays: 7, hajjDays: 14,
};

test("saved policy values replace the limits", () => {
    assert.deepEqual(
        leaveRulesFromPolicy({
            sickLeave: { eligibleAfterMonths: 6, yearlyDays: 10 },
            casualLeave: { days: 3 },
            maternityLeave: { days: 60 },
            paternityLeave: { days: 5 },
            bereavementLeave: { immediateFamilyDays: 5 },
            umrahLeave: { days: 8 },
            hajjLeave: { days: 15 },
        }),
        { sickEligibleMonths: 6, sickDaysPerYear: 10, casualDaysPerYear: 3, maternityDays: 60, paternityDays: 5, bereavementDays: 5, umrahDays: 8, hajjDays: 15 }
    );
});

test("missing policy falls back to the company limits", () => {
    assert.deepEqual(leaveRulesFromPolicy(undefined), STANDARD);
    assert.deepEqual(leaveRulesFromPolicy({ sickLeave: { eligibleAfterMonths: null } }), STANDARD);
});

test("a saved 0 stays 0", () => {
    assert.equal(leaveRulesFromPolicy({ sickLeave: { eligibleAfterMonths: 0 } }).sickEligibleMonths, 0);
});

test("sick and casual leave are counted per year", () => {
    assert.deepEqual(leaveLimitFor("Sick Leave", STANDARD), { days: 14, perYear: true });
    assert.equal(leaveLimitError("Sick Leave", 4, STANDARD, 10), null);
    assert.match(leaveLimitError("Sick Leave", 5, STANDARD, 10).message, /Only 4 Sick Leave day\(s\) remaining this year/);
    assert.match(leaveLimitError("Casual Leave", 3, STANDARD, 0).message, /Only 2/);
});

test("maternity, paternity, bereavement, Umrah and Hajj are limited per request", () => {
    assert.equal(leaveLimitError("Maternity Leave", 50, STANDARD, 999), null);
    assert.match(leaveLimitError("Paternity Leave", 4, STANDARD).message, /at most 3 day\(s\) per request/);
    assert.equal(leaveLimitError("Bereavement Leave", 14, STANDARD), null);
    assert.match(leaveLimitError("Umrah Leave", 8, STANDARD).message, /at most 7/);
    assert.match(leaveLimitError("Hajj Leave", 15, STANDARD).message, /at most 14/);
});

test("types without a limit are not checked", () => {
    assert.equal(leaveLimitFor("Emergency Leave", STANDARD), null);
    assert.equal(leaveLimitError("Unpaid Leave (LOP)", 60, STANDARD), null);
});

test("maternity and paternity count calendar days", () => {
    assert.deepEqual(CALENDAR_DAY_LEAVE_TYPES, ["Maternity Leave", "Paternity Leave"]);
});

test("company grade table gives each grade its band's days", () => {
    const table = defaultGradeEntitlements();
    assert.equal(Object.keys(table).length, GRADES.length);
    assert.deepEqual([table["1-A"], table["1-D"], table["2-A"], table["3-B"], table["3-C"], table["4-B"], table["4-C"], table["5-C"], table["5-D"], table["9-A"]],
        [30, 30, 28, 28, 26, 26, 24, 24, 21, 21]);
});

test("grades are checked and written the standard way", () => {
    assert.equal(normalizeGrade(" 4-c "), "4-C");
    assert.equal(normalizeGrade(""), null);
    assert.equal(normalizeGrade("G5"), undefined);
    assert.equal(normalizeGrade("6-C"), undefined);
});

test("types HR added survive the startup merge", () => {
    assert.deepEqual(
        mergeLeaveTypes(["Annual Leave", "Sick Leave"], ["Annual Leave", "Study Leave"]),
        ["Annual Leave", "Sick Leave", "Study Leave"]
    );
});

test("a missing type list gives the built-in types", () => {
    assert.deepEqual(mergeLeaveTypes(["Annual Leave"], null), ["Annual Leave"]);
});
