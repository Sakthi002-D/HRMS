// Company grades and the yearly Annual Leave days for each (company grading document).

export const GRADES = [
    "1-A", "1-B", "1-C", "1-D",
    "2-A", "2-B",
    "3-A", "3-B", "3-C",
    "4-A", "4-B", "4-C", "4-D",
    "5-A", "5-B", "5-C", "5-D",
    "6-A", "6-B", "6-D",
    "7-A", "8-A", "9-A",
];

// Bands in grade order: every grade from `from` to `to` gets `days`
export const GRADE_LEAVE_BANDS = [
    { from: "1-A", to: "1-D", days: 30 },
    { from: "2-A", to: "3-B", days: 28 },
    { from: "3-C", to: "4-B", days: 26 },
    { from: "4-C", to: "5-C", days: 24 },
    { from: "5-D", to: "9-A", days: 21 },
];

export const isGrade = (value) => GRADES.includes(String(value ?? "").trim().toUpperCase());

// { "1-A": 30, ..., "9-A": 21 } — the shape annualLeave.grade_overrides uses
export const defaultGradeEntitlements = () => Object.fromEntries(GRADE_LEAVE_BANDS.flatMap((band) =>
    GRADES.slice(GRADES.indexOf(band.from), GRADES.indexOf(band.to) + 1).map((grade) => [grade, band.days])));

// "" / null -> null (no grade); a known grade -> its standard spelling; anything else -> undefined (invalid)
export const normalizeGrade = (value) => {
    const grade = String(value ?? "").trim().toUpperCase();
    if (!grade) return null;
    return GRADES.includes(grade) ? grade : undefined;
};
