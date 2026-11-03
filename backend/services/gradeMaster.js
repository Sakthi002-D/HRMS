// =====================================================
// GRADE MASTER: Grade → Position → Designation (MPR form "Grade & Designation")
// Tables: grades, grade_positions, grade_designations (migration 021).
// =====================================================

// Nested list: grades (by sort order) → positions → designations.
// activeOnly = what the MPR form offers (an inactive grade hides its positions, and so on).
export async function listGradeMaster(db, { activeOnly = false } = {}) {
    const where = activeOnly ? "WHERE active" : "";
    const [grades, positions, designations] = await Promise.all([
        db.query(`SELECT id, code, band, sort_order, active FROM grades ${where} ORDER BY sort_order, code`),
        db.query(`SELECT id, grade_id, name, sort_order, active FROM grade_positions ${where} ORDER BY sort_order, name`),
        db.query(`SELECT id, position_id, name, sort_order, active FROM grade_designations ${where} ORDER BY sort_order, name`),
    ]);

    const designationsByPosition = new Map();
    designations.rows.forEach(({ position_id: positionId, ...designation }) => {
        if (!designationsByPosition.has(positionId)) designationsByPosition.set(positionId, []);
        designationsByPosition.get(positionId).push(designation);
    });

    const positionsByGrade = new Map();
    positions.rows.forEach(({ grade_id: gradeId, ...position }) => {
        if (!positionsByGrade.has(gradeId)) positionsByGrade.set(gradeId, []);
        positionsByGrade.get(gradeId).push({ ...position, designations: designationsByPosition.get(position.id) || [] });
    });

    return grades.rows.map((grade) => ({ ...grade, positions: positionsByGrade.get(grade.id) || [] }));
}

// For /recruitment/meta: an empty list until migration 021 has been run, so the MPR form still opens
export async function listActiveGrades(db) {
    try {
        return await listGradeMaster(db, { activeOnly: true });
    } catch (error) {
        if (error.code === "42P01") return []; // undefined_table
        throw error;
    }
}
