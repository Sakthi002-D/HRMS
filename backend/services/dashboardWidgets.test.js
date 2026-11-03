import test from "node:test";
import assert from "node:assert/strict";
import {
    buildAttendanceTrend,
    buildDepartmentDistribution,
    buildRecruitmentStats,
    weekDays,
} from "./dashboardWidgets.js";
import { withoutLate } from "./attendanceCounts.js";

// 2026-11-01 is a Sunday
const WEEK = weekDays("2026-11-03");
const trend = (overrides) => buildAttendanceTrend({ days: WEEK, rows: [], ...overrides });
const day = (result, date) => result.days.find((item) => item.date === date);

test("week runs Sunday to Saturday, also from a Saturday", () => {
    assert.equal(WEEK[0], "2026-11-01");
    assert.equal(WEEK[6], "2026-11-07");
    assert.deepEqual(weekDays("2026-11-07"), WEEK);
});

test("no attendance at all is no data, not everyone absent", () => {
    const result = trend({});
    assert.equal(result.hasData, false);
    assert.equal(result.weeklyAvg, null);
    assert.equal(result.totals.absent, 0);
});

test("not punching in never adds Absent; only saved Absent rows count", () => {
    const result = trend({ rows: [{ day: "2026-11-02", present: 7, absent: 1 }] });
    assert.deepEqual(day(result, "2026-11-02"), { date: "2026-11-02", present: 7, absent: 1 });
    assert.deepEqual(day(result, "2026-11-03"), { date: "2026-11-03", present: 0, absent: 0 });
});

test("weekly average is present over saved present and absent", () => {
    const result = trend({ rows: [{ day: "2026-11-02", present: 8, absent: 2 }] });
    assert.deepEqual(result.totals, { present: 8, absent: 2 });
    assert.equal(result.weeklyAvg, 80);
});

test("department percentages use every employee, not only the top six", () => {
    const rows = [50, 20, 10, 10, 5, 3, 2].map((count, index) => ({ department: `D${index}`, count }));
    const result = buildDepartmentDistribution(rows);
    assert.equal(result.total, 100);
    assert.equal(result.departments.length, 6);
    assert.equal(result.departments[0].percent, 50);
});

test("empty employees give an empty distribution", () => {
    assert.deepEqual(buildDepartmentDistribution([]), { total: 0, departments: [] });
});

test("hired includes Joined, and an unknown status stays in the pipeline", () => {
    const result = buildRecruitmentStats([
        { status: "New", count: 5, avg_days: "12.4" },
        { status: "Hired", count: 2, avg_days: "12.4" },
        { status: "Joined", count: 1, avg_days: "12.4" },
        { status: null, count: 2, avg_days: "12.4" },
    ], ["hired", "joined"]);
    assert.equal(result.applicants, 10);
    assert.equal(result.hired, 3);
    assert.equal(result.avgDaysToHire, 12);
    assert.equal(result.stages.find((item) => item.stage === "New").count, 7);
});

test("no hires gives no average, not zero days", () => {
    const result = buildRecruitmentStats([{ status: "New", count: 3, avg_days: null }], ["hired"]);
    assert.equal(result.avgDaysToHire, null);
});

test("no applications is safe", () => {
    const result = buildRecruitmentStats([], ["hired"]);
    assert.equal(result.applicants, 0);
    assert.equal(result.stages[0].percent, 0);
});

test("an old Late row reads as Present and keeps its late minutes", () => {
    assert.deepEqual(withoutLate({ status: "Late", late_minutes: 123 }), { status: "Present", late_minutes: 123 });
});

test("other statuses are left alone", () => {
    assert.equal(withoutLate({ status: "Absent", late_minutes: 0 }).status, "Absent");
    assert.equal(withoutLate({ status: null }).status, null);
});
