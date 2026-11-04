import test from "node:test";
import assert from "node:assert/strict";
import { earlyLeaveMinutes, lateMinutes, planAssignment, shiftLabel, shiftSnapshot, spanMinutes, toMinutes, validateShift, workMinutes } from "./shifts.js";

const STANDARD = { id: 1, name: "Standard", start_time: "08:00", end_time: "17:30", break_minutes: 30, shift_type: "standard" };
const LABOUR = { id: 2, name: "Labour", start_time: "07:00", end_time: "16:00", break_minutes: 30, shift_type: "labour" };
const SUMMER = { id: 3, name: "Summer Evening", start_time: "18:00", end_time: "02:00", break_minutes: 0, shift_type: "summer" };

test("work hours: Standard 9, Labour 8.5, Summer Evening 8 across midnight", () => {
    assert.equal(workMinutes(STANDARD), 540);
    assert.equal(workMinutes(LABOUR), 510);
    assert.equal(workMinutes(SUMMER), 480);
    assert.equal(spanMinutes("18:00", "02:00"), 480);
});

test("database time text is read with or without seconds", () => {
    assert.equal(toMinutes("08:34:49.123456"), 514);
    assert.equal(toMinutes("8:05"), 485);
    assert.equal(toMinutes("25:00"), null);
    assert.equal(toMinutes(""), null);
});

test("late only after the 10 minute grace, counted from the shift start", () => {
    assert.equal(lateMinutes(STANDARD, "07:45:00"), 0);
    assert.equal(lateMinutes(STANDARD, "08:10:00"), 0);
    assert.equal(lateMinutes(STANDARD, "08:11:00"), 11);
    assert.equal(lateMinutes(STANDARD, "09:30:00"), 90);
});

test("late on the evening shift, including after midnight", () => {
    assert.equal(lateMinutes(SUMMER, "17:50"), 0);
    assert.equal(lateMinutes(SUMMER, "18:25"), 25);
    assert.equal(lateMinutes(SUMMER, "00:30"), 390);
});

test("early leave before the shift end, none after it", () => {
    assert.equal(earlyLeaveMinutes(STANDARD, "17:30"), 0);
    assert.equal(earlyLeaveMinutes(STANDARD, "19:00"), 0);
    assert.equal(earlyLeaveMinutes(STANDARD, "16:00"), 90);
    assert.equal(earlyLeaveMinutes({ shift_end: "17:30" }, "17:00:00"), 30);
});

test("early leave on the evening shift is measured to 02:00 the next day", () => {
    assert.equal(earlyLeaveMinutes(SUMMER, "01:00"), 60);
    assert.equal(earlyLeaveMinutes(SUMMER, "23:00"), 180);
    assert.equal(earlyLeaveMinutes(SUMMER, "02:30"), 0);
});

test("no shift means no late or early leave", () => {
    assert.equal(lateMinutes(null, "10:00"), 0);
    assert.equal(earlyLeaveMinutes(undefined, "10:00"), 0);
    assert.deepEqual(shiftSnapshot(null, "10:00").late_minutes, 0);
});

test("snapshot keeps the shift used on the day", () => {
    assert.deepEqual(shiftSnapshot(STANDARD, "08:40:00"), {
        shift_id: 1, shift: "Standard (08:00 - 17:30)", shift_start: "08:00", shift_end: "17:30",
        shift_work_minutes: 540, break_minutes: 30, late_minutes: 40,
    });
    assert.equal(shiftLabel(SUMMER), "Summer Evening (18:00 - 02:00)");
});

test("shift validation", () => {
    assert.deepEqual(validateShift({ name: " Night ", shift_type: "summer", start_time: "18:00", end_time: "02:00", break_minutes: "0" }).shift,
        { name: "Night", shift_type: "summer", start_time: "18:00", end_time: "02:00", break_minutes: 0 });
    assert.match(validateShift({ name: "", shift_type: "standard", start_time: "08:00", end_time: "17:00" }).error, /name/);
    assert.match(validateShift({ name: "X", shift_type: "other", start_time: "08:00", end_time: "17:00" }).error, /type/);
    assert.match(validateShift({ name: "X", shift_type: "standard", start_time: "8am", end_time: "17:00" }).error, /Start/);
    assert.match(validateShift({ name: "X", shift_type: "standard", start_time: "08:00", end_time: "09:00", break_minutes: 60 }).error, /shorter/);
});

test("Ramadan is a start time plus 4 to 5 hours", () => {
    assert.equal(validateShift({ name: "Ramadan", shift_type: "ramadan", start_time: "09:00", duration_minutes: 270 }).shift.end_time, "13:30");
    assert.equal(validateShift({ name: "Ramadan", shift_type: "ramadan", start_time: "22:00", duration_minutes: 300 }).shift.end_time, "03:00");
    assert.match(validateShift({ name: "Ramadan", shift_type: "ramadan", start_time: "09:00", duration_minutes: 360 }).error, /4 and 5/);
    assert.match(validateShift({ name: "Ramadan", shift_type: "ramadan", start_time: "09:00", end_time: "12:00" }).error, /4 and 5/);
});

test("a new shift closes the open-ended one the day before", () => {
    const plan = planAssignment([{ id: 7, effective_from: "2026-01-01", effective_to: null }], { effective_from: "2026-11-10" });
    assert.deepEqual(plan.close, { id: 7, effective_to: "2026-11-09" });
    assert.deepEqual(plan.assignment, { effective_from: "2026-11-10", effective_to: null });
});

test("a dated shift pauses the running one and continues it afterwards", () => {
    const plan = planAssignment([{ id: 7, shift_id: 2, effective_from: "2026-01-01", effective_to: null }], { effective_from: "2027-02-08", effective_to: "2027-03-09" });
    assert.deepEqual(plan.close, { id: 7, effective_to: "2027-02-07" });
    assert.deepEqual(plan.reopen, { shift_id: 2, effective_from: "2027-03-10", effective_to: null });
});

test("a dated shift inside a longer dated one splits it and keeps its end", () => {
    const plan = planAssignment([{ id: 4, shift_id: 1, effective_from: "2026-01-01", effective_to: "2026-12-31" }], { effective_from: "2026-06-01", effective_to: "2026-06-30" });
    assert.deepEqual(plan.close, { id: 4, effective_to: "2026-05-31" });
    assert.deepEqual(plan.reopen, { shift_id: 1, effective_from: "2026-07-01", effective_to: "2026-12-31" });
});

test("no reopen when the running shift ends inside the new period", () => {
    const plan = planAssignment([{ id: 4, shift_id: 1, effective_from: "2026-01-01", effective_to: "2026-06-15" }], { effective_from: "2026-06-01", effective_to: "2026-06-30" });
    assert.match(plan.error, /2026-01-01/);
});

test("a later period can follow a closed one", () => {
    const plan = planAssignment([{ id: 1, effective_from: "2026-01-01", effective_to: "2026-02-28" }], { effective_from: "2026-03-01", effective_to: "2026-03-31" });
    assert.equal(plan.error, undefined);
    assert.equal(plan.close, null);
});

test("overlapping periods are refused, so a day never has two shifts", () => {
    const existing = [
        { id: 1, effective_from: "2026-01-01", effective_to: "2026-06-30" },
        { id: 2, effective_from: "2026-12-01", effective_to: null },
    ];
    assert.match(planAssignment(existing, { effective_from: "2026-06-01", effective_to: "2026-07-15" }).error, /2026-01-01/);
    // starting before an open-ended one does not close it, it conflicts
    assert.match(planAssignment(existing, { effective_from: "2026-11-01" }).error, /2026-12-01/);
    // same start day as the open-ended one also conflicts
    assert.match(planAssignment(existing, { effective_from: "2026-12-01", effective_to: "2026-12-31" }).error, /2026-12-01/);
});

test("assignment dates are checked", () => {
    assert.match(planAssignment([], { effective_from: "10-11-2026" }).error, /from/);
    assert.match(planAssignment([], { effective_from: "2026-11-10", effective_to: "2026-11-01" }).error, /to/);
});
