// Present/late headcounts for a date. Legacy HRMS rows are counted per employee_id;
// D365 rows (employee_id IS NULL) are counted per full D365 identity, so the two
// sources can never double-count each other, even if a personnel number equals an employee_id.
export async function getAttendanceCounts(db, date = null) {
    const result = await db.query(
        `SELECT
            COUNT(DISTINCT employee_id) FILTER (
                WHERE employee_id IS NOT NULL AND LOWER(status) IN ('present', 'late')
            )::int AS hrms_present,
            COUNT(DISTINCT employee_id) FILTER (
                WHERE employee_id IS NOT NULL AND LOWER(status) = 'late'
            )::int AS hrms_late,
            COUNT(DISTINCT (personnel_number, employment_legal_entity_id, employment_id)) FILTER (
                WHERE employee_id IS NULL AND personnel_number IS NOT NULL
                  AND LOWER(status) IN ('present', 'late')
            )::int AS d365_present,
            COUNT(DISTINCT (personnel_number, employment_legal_entity_id, employment_id)) FILTER (
                WHERE employee_id IS NULL AND personnel_number IS NOT NULL
                  AND LOWER(status) = 'late'
            )::int AS d365_late
         FROM attendance
         WHERE attendance_date = COALESCE($1::date, CURRENT_DATE)`,
        [date]
    );

    const row = result.rows[0];
    return {
        hrmsPresent: row.hrms_present,
        hrmsLate: row.hrms_late,
        d365Present: row.d365_present,
        d365Late: row.d365_late,
        present: row.hrms_present + row.d365_present,
        late: row.hrms_late + row.d365_late,
    };
}
