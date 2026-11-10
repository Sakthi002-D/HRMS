import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Award, Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import { DocumentToast } from "../../../components/documents/EmployeeDocumentOverlays";
import { useConfirm } from "../../../components/common/dialog/dialogContext";
import useGrades from "../../../hooks/useGrades";
import { createGrade, deleteGrade, updateGrade } from "../../../utils/grades";
import "../../../components/layout/common/Table.css";
import "../GradeAssignment.css";
import "./GradeMaster.css";

const EMPTY_DRAFT = { grade_code: "", grade_name: "", leave_days: "", sort_order: "" };

const toDraft = (grade) => ({
    grade_code: grade.grade_code,
    grade_name: grade.grade_name || "",
    leave_days: grade.leave_days ?? "",
    sort_order: grade.sort_order ?? "",
});

// Table with inline add / edit / delete. Used on its own page and inside Settings.
export function GradeMasterPanel() {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const { grades, loaded, error: loadError, editable, leaveDaysEditable, reload } = useGrades();
    const [search, setSearch] = useState("");
    const [editing, setEditing] = useState(null); // null | "new" | grade code
    const [draft, setDraft] = useState(EMPTY_DRAFT);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");
    const [toast, setToast] = useState(null);
    const closeToast = useCallback(() => setToast(null), []);

    const shown = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return grades;
        return grades.filter((grade) => `${grade.grade_code} ${grade.grade_name}`.toLowerCase().includes(query));
    }, [grades, search]);

    const startAdd = () => {
        const nextOrder = grades.reduce((max, grade) => Math.max(max, Number(grade.sort_order) || 0), 0) + 1;
        setDraft({ ...EMPTY_DRAFT, sort_order: nextOrder });
        setEditing("new");
        setFormError("");
    };

    const startEdit = (grade) => {
        setDraft(toDraft(grade));
        setEditing(grade.grade_code);
        setFormError("");
    };

    const cancel = () => {
        if (saving) return;
        setEditing(null);
        setFormError("");
    };

    const setField = (field) => ({ target }) => setDraft((current) => ({
        ...current,
        [field]: field === "grade_code" ? target.value.toUpperCase() : target.value,
    }));

    const save = async () => {
        if (saving) return;
        const body = {
            grade_name: draft.grade_name.trim(),
            leave_days: draft.leave_days === "" ? "" : Number(draft.leave_days),
            sort_order: draft.sort_order === "" ? undefined : Number(draft.sort_order),
        };
        setSaving(true);
        setFormError("");
        try {
            if (editing === "new") {
                const created = await createGrade({ ...body, grade_code: draft.grade_code.trim() });
                setToast({ type: "success", message: t("gradeMaster.added", { code: created.grade_code, defaultValue: "Grade {{code}} added." }) });
            } else {
                const updated = await updateGrade(editing, body);
                setToast({ type: "success", message: t("gradeMaster.updated", { code: updated.grade_code, defaultValue: "Grade {{code}} updated." }) });
            }
            await reload();
            setEditing(null);
        } catch (error) {
            setFormError(error.message);
        } finally {
            setSaving(false);
        }
    };

    const remove = async (grade) => {
        const done = await confirm({
            variant: "danger",
            title: t("gradeMaster.deleteTitle", { code: grade.grade_code, defaultValue: "Delete grade {{code}}?" }),
            message: t("gradeMaster.deleteMessage", { defaultValue: "No employee has this grade. It will be removed from every grade list." }),
            confirmText: t("gradeMaster.delete", { defaultValue: "Delete" }),
            cancelText: t("profileEdit.cancel", { defaultValue: "Cancel" }),
            loadingText: t("gradeMaster.deleting", { defaultValue: "Deleting..." }),
            onConfirm: async () => {
                await deleteGrade(grade.grade_code);
                await reload();
            },
        });
        if (done) setToast({ type: "success", message: t("gradeMaster.deleted", { code: grade.grade_code, defaultValue: "Grade {{code}} deleted." }) });
    };

    const onKeyDown = (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            save();
        } else if (event.key === "Escape") {
            cancel();
        }
    };

    const daysLabel = (days) => (days === null || days === undefined
        ? <span className="gm-muted">-</span>
        : t("gradeMaster.daysValue", { count: Number(days), defaultValue: "{{count}} days" }));

    const editRow = (isNew) => (
        <tr className="gm-edit-row" key={isNew ? "__new" : editing} onKeyDown={onKeyDown}>
            <td>
                <input className="gm-input gm-input-order" type="number" min="0" max="9999" step="1" value={draft.sort_order} onChange={setField("sort_order")} disabled={saving}
                    aria-label={t("gradeMaster.sortOrder", { defaultValue: "Order" })} />
            </td>
            <td>
                {isNew ? (
                    <input className="gm-input gm-input-code" dir="ltr" maxLength={12} value={draft.grade_code} onChange={setField("grade_code")} disabled={saving} autoFocus
                        placeholder="5-A" aria-label={t("gradeMaster.gradeCode", { defaultValue: "Grade code" })} />
                ) : (
                    <span className="gm-grade" dir="ltr">{draft.grade_code}</span>
                )}
            </td>
            <td>
                <input className="gm-input" dir="auto" maxLength={100} value={draft.grade_name} onChange={setField("grade_name")} disabled={saving} autoFocus={!isNew}
                    placeholder={t("gradeMaster.namePlaceholder", { defaultValue: "e.g. Section Manager" })} aria-label={t("gradeMaster.gradeName", { defaultValue: "Grade name" })} />
            </td>
            <td>
                <input className="gm-input gm-input-days" type="number" min="0.5" max="365" step="0.5" value={draft.leave_days} onChange={setField("leave_days")}
                    disabled={saving || !leaveDaysEditable} aria-label={t("gradeMaster.leaveDays", { defaultValue: "Annual Leave days" })} />
            </td>
            <td><span className="gm-muted">{isNew ? "-" : grades.find((grade) => grade.grade_code === editing)?.employee_count ?? 0}</span></td>
            <td>
                <span className="gm-actions">
                    <button type="button" className="gm-icon-button save" onClick={save} disabled={saving} title={t("gradeMaster.save", { defaultValue: "Save" })} aria-label={t("gradeMaster.save", { defaultValue: "Save" })}>
                        <Check size={16} />
                    </button>
                    <button type="button" className="gm-icon-button" onClick={cancel} disabled={saving} title={t("profileEdit.cancel", { defaultValue: "Cancel" })} aria-label={t("profileEdit.cancel", { defaultValue: "Cancel" })}>
                        <X size={16} />
                    </button>
                </span>
            </td>
        </tr>
    );

    return (
        <div className="gm-panel">
            <div className="ga-toolbar">
                <label className="ga-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                        value={search}
                        onChange={({ target }) => setSearch(target.value)}
                        placeholder={t("gradeMaster.search", { defaultValue: "Search grade code or name" })}
                        aria-label={t("gradeMaster.search", { defaultValue: "Search grade code or name" })}
                    />
                </label>
                <span className="ga-count">
                    <Award size={15} aria-hidden="true" />
                    {t("gradeMaster.count", { count: shown.length, defaultValue: "{{count}} grades" })}
                </span>
                <button type="button" className="ga-bulk-button" onClick={startAdd} disabled={!loaded || !editable || !leaveDaysEditable || editing !== null}>
                    <Plus size={16} aria-hidden="true" />
                    {t("gradeMaster.add", { defaultValue: "Add Grade" })}
                </button>
            </div>

            {loaded && editable && !leaveDaysEditable && (
                <p className="gm-banner warning" role="status">
                    <AlertTriangle size={16} aria-hidden="true" />
                    {t("gradeMaster.migrationNeeded", { defaultValue: "Leave days are read from Leave Policy for now. Run backend/migrations/025_grade_master_leave_days.sql and restart the backend to add grades and edit leave days here." })}
                </p>
            )}
            {loadError && <p className="gm-banner error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{loadError}</p>}
            {formError && <p className="gm-banner error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{formError}</p>}

            {!loaded && !loadError ? (
                <p className="gm-empty">{t("settings.page.loading", { defaultValue: "Loading..." })}</p>
            ) : (
                <div className="gm-table">
                    <table className="common-table">
                        <thead>
                            <tr>
                                <th>{t("gradeMaster.sortOrder", { defaultValue: "Order" })}</th>
                                <th>{t("gradeMaster.gradeCode", { defaultValue: "Grade code" })}</th>
                                <th>{t("gradeMaster.gradeName", { defaultValue: "Grade name" })}</th>
                                <th>{t("gradeMaster.leaveDays", { defaultValue: "Annual Leave days" })}</th>
                                <th>{t("gradeMaster.employees", { defaultValue: "Employees" })}</th>
                                <th>{t("gradeMaster.actions", { defaultValue: "Actions" })}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {editing === "new" && editRow(true)}
                            {shown.map((grade) => (editing === grade.grade_code ? editRow(false) : (
                                <tr key={grade.grade_code} className={grade.active === false ? "gm-inactive" : ""}>
                                    <td className="gm-order" dir="ltr">{grade.sort_order}</td>
                                    <td><span className="gm-grade" dir="ltr">{grade.grade_code}</span></td>
                                    <td dir="auto">{grade.grade_name || <span className="gm-muted">-</span>}</td>
                                    <td>{daysLabel(grade.leave_days)}</td>
                                    <td>
                                        <span className={`gm-count${grade.employee_count ? " used" : ""}`}>{grade.employee_count}</span>
                                    </td>
                                    <td>
                                        <span className="gm-actions">
                                            <button type="button" className="gm-icon-button" onClick={() => startEdit(grade)} disabled={!editable || editing !== null}
                                                title={t("gradeMaster.edit", { defaultValue: "Edit" })} aria-label={t("gradeMaster.editGrade", { code: grade.grade_code, defaultValue: "Edit grade {{code}}" })}>
                                                <Pencil size={15} />
                                            </button>
                                            <button type="button" className="gm-icon-button danger" onClick={() => remove(grade)} disabled={!editable || editing !== null || grade.employee_count > 0}
                                                title={grade.employee_count > 0
                                                    ? t("gradeMaster.inUse", { count: grade.employee_count, defaultValue: "Given to {{count}} employees. Move them to another grade before deleting." })
                                                    : t("gradeMaster.delete", { defaultValue: "Delete" })}
                                                aria-label={t("gradeMaster.deleteGrade", { code: grade.grade_code, defaultValue: "Delete grade {{code}}" })}>
                                                <Trash2 size={15} />
                                            </button>
                                        </span>
                                    </td>
                                </tr>
                            )))}
                            {shown.length === 0 && editing !== "new" && (
                                <tr><td colSpan={6} className="gm-empty">{t("gradeMaster.none", { defaultValue: "No grades match." })}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="gm-hint">{t("gradeMaster.hint", { defaultValue: "Leave days here decide each employee's yearly Annual Leave. A grade can only be deleted when no employee has it." })}</p>
            <DocumentToast toast={toast} onClose={closeToast} />
        </div>
    );
}

function GradeMaster() {
    const { t } = useTranslation();
    const { grades } = useGrades();
    const withGrade = grades.reduce((sum, grade) => sum + (Number(grade.employee_count) || 0), 0);
    const days = grades.map((grade) => Number(grade.leave_days)).filter((value) => value > 0);
    const range = days.length ? (Math.min(...days) === Math.max(...days) ? `${Math.min(...days)}` : `${Math.min(...days)}–${Math.max(...days)}`) : "-";

    return (
        <DashboardLayout>
            <div className="ga-page gm-page">
                <header className="ga-hero">
                    <div>
                        <span className="ga-kicker">{t("menu.settings", { defaultValue: "Settings" })}</span>
                        <h1>{t("menu.gradeMaster", { defaultValue: "Grade Master" })}</h1>
                        <p>{t("gradeMaster.subtitle", { defaultValue: "The company grade list and the yearly Annual Leave days for each grade." })}</p>
                    </div>
                    <div className="ga-hero-stats">
                        <div><strong>{grades.length}</strong><span>{t("gradeMaster.statGrades", { defaultValue: "Grades" })}</span></div>
                        <div><strong>{withGrade}</strong><span>{t("gradeAssignment.withGrade", { defaultValue: "With a grade" })}</span></div>
                        <div><strong dir="ltr">{range}</strong><span>{t("gradeMaster.statDays", { defaultValue: "Leave days / year" })}</span></div>
                    </div>
                </header>
                <section className="ga-card">
                    <GradeMasterPanel />
                </section>
            </div>
        </DashboardLayout>
    );
}

export default GradeMaster;
