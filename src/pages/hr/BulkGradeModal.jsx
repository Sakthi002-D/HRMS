import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { DIALOG_ICONS } from "../../components/common/dialog/dialogContext";
import useDialogFocus from "../../components/common/dialog/useDialogFocus";
import useScrollLock from "../../components/common/dialog/useScrollLock";
import { GRADES } from "../../utils/grades";
import "../../components/common/dialog/Dialog.css";
import "./GradeAssignment.css";

// Same look as the app's confirm dialog, with a grade dropdown.
// leaveDaysFor(grade) gives the yearly Annual Leave days shown before confirming.
function BulkGradeModal({ count, leaveDaysFor, onCancel, onConfirm }) {
    const { t } = useTranslation();
    const dialogRef = useRef(null);
    const selectRef = useRef(null);
    const titleId = useId();
    const [grade, setGrade] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const cancel = () => {
        if (!saving) onCancel();
    };

    useDialogFocus(true, { dialogRef, initialFocusRef: selectRef, onEscape: cancel });
    useScrollLock(true);

    const confirm = async () => {
        if (!grade || saving) return;
        setSaving(true);
        setError("");
        try {
            await onConfirm(grade);
        } catch (saveError) {
            setError(saveError.message);
            setSaving(false);
        }
    };

    return createPortal(
        <div className="app-alert-overlay" role="presentation" onClick={cancel}>
            <section
                ref={dialogRef}
                className="app-alert-dialog app-dialog-info"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-busy={saving}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="app-alert-icon" aria-hidden="true">{DIALOG_ICONS.info}</div>
                <div className="app-alert-copy">
                    <h2 id={titleId}>{t("employeesList.bulkGrade.title", { defaultValue: "Assign Grade" })}</h2>
                    <div className="app-dialog-message">
                        <p>
                            {count === 1
                                ? t("employeesList.bulkGrade.messageOne", { defaultValue: "Choose the grade for 1 employee." })
                                : t("employeesList.bulkGrade.message", { count, defaultValue: "Choose the grade for {{count}} employees." })}
                        </p>
                        <label className="bulk-grade-field">
                            <span>{t("employeeProfile.basic.grade", { defaultValue: "Grade" })}</span>
                            <select ref={selectRef} value={grade} disabled={saving} onChange={({ target }) => setGrade(target.value)}>
                                <option value="">{t("leaveManagement.policy.chooseGrade", { defaultValue: "Choose grade" })}</option>
                                {GRADES.map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                        </label>
                        {grade ? (
                            <p className="bulk-grade-days">
                                {t("gradeAssignment.leaveDays", { grade, count: leaveDaysFor(grade), defaultValue: "Grade {{grade}}: {{count}} days of Annual Leave per year" })}
                            </p>
                        ) : (
                            <small>{t("employeesList.bulkGrade.hint", { defaultValue: "The grade decides each employee's yearly Annual Leave days." })}</small>
                        )}
                    </div>
                    {error && <p className="app-dialog-error" role="alert">{error}</p>}
                </div>
                <div className="app-dialog-actions">
                    <button type="button" className="app-dialog-button secondary" onClick={cancel} disabled={saving}>
                        {t("profileEdit.cancel", { defaultValue: "Cancel" })}
                    </button>
                    <button type="button" className="app-dialog-button primary info" onClick={confirm} disabled={!grade || saving}>
                        {saving && <span className="app-dialog-spinner" aria-hidden="true" />}
                        {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("settings.shifts.bulk.confirmButton", { defaultValue: "Confirm" })}
                    </button>
                </div>
            </section>
        </div>,
        document.body
    );
}

export default BulkGradeModal;
