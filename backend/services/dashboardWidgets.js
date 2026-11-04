// HR Dashboard widgets: attendance trend, departments, recruitment.
//
// Attendance has two kinds of rows: HRMS punches (employee_id) and D365 punches
// (employee_id NULL, personnel_number), so people are matched on either one.
// Dates use the same timezone as punch in/out.

const ATTENDANCE_NOW = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Qatar')";
const PERSON_KEY = "COALESCE(a.employee_id::text, a.personnel_number)";
const utcDay = (key) => new Date(`${key}T00:00:00Z`);

// Sunday-to-Saturday YYYY-MM-DD keys of the week containing `today`
export const weekDays = (today) => {
    const date = utcDay(today);
    const sunday = date.getTime() - date.getUTCDay() * 86400000;
    return Array.from({ length: 7 }, (_, index) =>
        new Date(sunday + index * 86400000).toISOString().slice(0, 10));
};

// Only saved attendance is counted: not punching in does not make anyone Absent
export const buildAttendanceTrend = ({ days, rows }) => {
    const byDay = Object.fromEntries(rows.map((row) => [row.day, row]));

    const trend = days.map((date) => ({
        date,
        present: byDay[date]?.present ?? 0,
        absent: byDay[date]?.absent ?? 0,
    }));

    const totals = trend.reduce((sum, day) => ({
        present: sum.present + day.present,
        absent: sum.absent + day.absent,
    }), { present: 0, absent: 0 });

    const expected = totals.present + totals.absent;

    return {
        days: trend,
        totals,
        weeklyAvg: expected ? Math.round((totals.present / expected) * 1000) / 10 : null,
        hasData: expected > 0,
    };
};

export async function getAttendanceTrend(db) {
    const clock = await db.query(`SELECT TO_CHAR(${ATTENDANCE_NOW}, 'YYYY-MM-DD') AS today`);
    const { today } = clock.rows[0];
    const days = weekDays(today);
    const range = [days[0], days[6]];

    const attendance = await db.query(
        `SELECT TO_CHAR(a.attendance_date, 'YYYY-MM-DD') AS day,
                COUNT(DISTINCT ${PERSON_KEY}) FILTER (WHERE LOWER(a.status) IN ('present', 'late'))::int AS present,
                COUNT(DISTINCT ${PERSON_KEY}) FILTER (WHERE LOWER(a.status) = 'absent')::int AS absent
         FROM attendance a
         WHERE a.attendance_date BETWEEN $1::date AND $2::date
         GROUP BY a.attendance_date`,
        range
    );
    return buildAttendanceTrend({ days, rows: attendance.rows });
}

// `rows` = every department with its count, largest first
export const buildDepartmentDistribution = (rows, limit = 6) => {
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return {
        total,
        departments: rows.slice(0, limit).map((row) => ({
            department: row.department,
            count: row.count,
            percent: total ? Math.round((row.count / total) * 100) : 0,
        })),
    };
};

export async function getDepartmentDistribution(db) {
    const result = await db.query(
        `SELECT COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department, COUNT(*)::int AS count
         FROM employees
         WHERE LOWER(COALESCE(status, 'active')) = 'active'
         GROUP BY 1
         ORDER BY count DESC, department`
    );
    return buildDepartmentDistribution(result.rows);
}

const PIPELINE_STAGES = ["New", "Shortlisted", "On Hold", "Hired", "Rejected"];

// `filled` = lower-case statuses that count as hired (Hired, Joined)
export const buildRecruitmentStats = (rows, filled) => {
    const counts = Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage, 0]));

    rows.forEach((row) => {
        const status = String(row.status || "New").toLowerCase();
        const stage = filled.includes(status)
            ? "Hired"
            : PIPELINE_STAGES.find((name) => name.toLowerCase() === status) ?? "New";
        counts[stage] += row.count;
    });

    const applicants = rows.reduce((sum, row) => sum + row.count, 0);
    const avg = rows.find((row) => row.avg_days !== null && row.avg_days !== undefined)?.avg_days;

    return {
        applicants,
        hired: counts.Hired,
        avgDaysToHire: avg === undefined ? null : Math.round(Number(avg)),
        stages: PIPELINE_STAGES.map((stage) => ({
            stage,
            count: counts[stage],
            percent: applicants ? Math.round((counts[stage] / applicants) * 100) : 0,
        })),
    };
};

export async function getRecruitmentStats(db, filled) {
    const result = await db.query(
        `WITH hire_time AS (
            SELECT AVG(EXTRACT(EPOCH FROM (
                       COALESCE(a.reviewed_at, a.updated_at)
                       - (a.applied_at AT TIME ZONE current_setting('TimeZone'))
                   )) / 86400) AS avg_days
            FROM public.job_applications a
            WHERE LOWER(a.status) = ANY($1::text[])
         )
         SELECT a.status, COUNT(*)::int AS count, (SELECT avg_days FROM hire_time) AS avg_days
         FROM public.job_applications a
         GROUP BY a.status`,
        [filled]
    );
    return buildRecruitmentStats(result.rows, filled);
}
