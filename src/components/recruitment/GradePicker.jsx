// Grade → Position → Designation picker (Settings → Grade Master), shared by the MPR form and
// Settings → Recruitment Masters → Headcount Budget so both behave the same:
// Grade grouped by band; Position = that grade's positions; Designation = searchable, that position's
// designations. A step is disabled until the one before is chosen, a step with only one choice is
// picked automatically, and changing a step clears the steps after it. All three are required.
import DesignationSelect from "./DesignationSelect";

// Grade Master grades grouped by band, in master order (for the Grade <optgroup>s)
const groupByBand = (grades) => grades.reduce((groups, grade) => {
    const group = groups.find((item) => item.band === grade.band);
    if (group) group.grades.push(grade);
    else groups.push({ band: grade.band, grades: [grade] });
    return groups;
}, []);

// A value saved earlier that is no longer in the master stays selectable
const withSaved = (names, saved) => (saved && !names.includes(saved) ? [...names, saved] : names);

const onlyDesignation = (position) => (position?.designations.length === 1 ? position.designations[0].name : "");

// value = { grade, position, designation }. onChange(patch, grade) always gets all three keys
// (with the chosen Grade Master grade, or null). errors = { grade?, position?, designation? }.
function GradePicker({ grades = [], value, onChange, errors = {}, idPrefix = "grade-picker", className = "" }) {
    const gradeGroups = groupByBand(grades);
    const selectedGrade = grades.find((grade) => grade.code === value.grade) || null;
    const gradePositions = selectedGrade?.positions || [];
    const selectedPosition = gradePositions.find((position) => position.name === value.position) || null;
    const positionNames = withSaved(gradePositions.map((position) => position.name), value.position);
    const designationNames = withSaved((selectedPosition?.designations || []).map((designation) => designation.name), value.designation);

    const chooseGrade = (code) => {
        const grade = grades.find((item) => item.code === code) || null;
        const position = grade?.positions.length === 1 ? grade.positions[0] : null;
        onChange({ grade: code, position: position?.name || "", designation: onlyDesignation(position) }, grade);
    };

    const choosePosition = (name) => {
        if (name === value.position) return;
        const position = gradePositions.find((item) => item.name === name) || null;
        onChange({ grade: value.grade, position: name, designation: onlyDesignation(position) }, selectedGrade);
    };

    const chooseDesignation = (name) => onChange({ grade: value.grade, position: value.position, designation: name }, selectedGrade);

    const fieldError = (name) => errors[name] && <small className="mpr-field-error" role="alert">{errors[name]}</small>;

    return (
        <div className={`mpr-grade-steps ${className}`.trim()}>
            <div className={`form-group mpr-grade-step${value.grade ? " is-done" : ""}`}>
                <label htmlFor={`${idPrefix}-grade`}><span className="mpr-step-number">1</span> Grade *</label>
                <select id={`${idPrefix}-grade`} value={value.grade || ""} onChange={(event) => chooseGrade(event.target.value)} aria-invalid={Boolean(errors.grade)} className={errors.grade ? "is-invalid" : ""}>
                    <option value="">Select grade</option>
                    {value.grade && !selectedGrade && <option value={value.grade}>{value.grade} (saved)</option>}
                    {gradeGroups.map((group) => (
                        <optgroup key={group.band} label={group.band}>
                            {group.grades.map((grade) => <option key={grade.id} value={grade.code}>Grade {grade.code}</option>)}
                        </optgroup>
                    ))}
                </select>
                {grades.length === 0 && <small className="mpr-step-hint">No grades found.</small>}
                {fieldError("grade")}
            </div>

            <div className={`form-group mpr-grade-step${value.position ? " is-done" : ""}`}>
                <label htmlFor={`${idPrefix}-position`}><span className="mpr-step-number">2</span> Position *</label>
                <select id={`${idPrefix}-position`} value={value.position || ""} onChange={(event) => choosePosition(event.target.value)} disabled={!value.grade} aria-invalid={Boolean(errors.position)} className={errors.position ? "is-invalid" : ""}>
                    <option value="">{value.grade ? "Select position" : "Choose a grade first"}</option>
                    {positionNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                {value.grade && positionNames.length === 0 && <small className="mpr-step-hint">This grade has no active positions.</small>}
                {fieldError("position")}
            </div>

            <div className={`form-group mpr-grade-step${value.designation ? " is-done" : ""}`}>
                <label><span className="mpr-step-number">3</span> Designation *</label>
                <DesignationSelect
                    value={value.designation}
                    onChange={chooseDesignation}
                    options={designationNames}
                    disabled={!value.position}
                    invalid={Boolean(errors.designation)}
                    placeholder={value.position ? "Select designation" : "Choose a position first"}
                />
                {fieldError("designation")}
            </div>
        </div>
    );
}

export default GradePicker;
