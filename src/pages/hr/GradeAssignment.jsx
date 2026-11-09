import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Award, Search, Users } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import Table from "../../components/layout/common/Table";
import { Pagination } from "../../components/common/TablePagination";
import { DocumentToast } from "../../components/documents/EmployeeDocumentOverlays";
import API_URL from "../../config/api";
import { authHeaders } from "../../utils/auth";
import useGrades from "../../hooks/useGrades";
import BulkGradeModal from "./BulkGradeModal";
import "./GradeAssignment.css";

const PAGE_SIZE = 25;

const request = async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: authHeaders(options.body ? { "Content-Type": "application/json" } : {}),
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data === null) {
        throw new Error(data?.message || (response.status === 404
            ? "This feature is not on the server yet. Restart the backend and try again."
            : `Request failed (${response.status})`));
    }
    return data;
};

function GradeAssignment() {
    const { t } = useTranslation();
    const [employees, setEmployees] = useState(null);
    const [loadError, setLoadError] = useState("");
    // Grade list and leave days from Settings → Grade Master; employees without a grade get the Leave Policy default
    const { codes: gradeList, leaveDaysFor: gradeLeaveDays } = useGrades();
    const [defaultLeaveDays, setDefaultLeaveDays] = useState(30);
    const [department, setDepartment] = useState("all");
    const [designation, setDesignation] = useState("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [savingId, setSavingId] = useState(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [toast, setToast] = useState(null);
    const closeToast = useCallback(() => setToast(null), []);

    useEffect(() => {
        request("/api/employees")
            .then((rows) => setEmployees(rows
                .filter((row) => String(row.role || "employee").toLowerCase() !== "hr")
                .map((row) => ({ id: row.employee_id, name: row.name, designation: row.designation, department: row.department, grade: row.grade || "" }))
                .sort((a, b) => String(a.name).localeCompare(String(b.name)))))
            .catch((error) => {
                setEmployees([]);
                setLoadError(error.message);
            });
        request("/api/leave-policies")
            .then((data) => setDefaultLeaveDays(Number((data.policy || data).annualLeave?.yearly_entitlement_days) || 30))
            .catch(() => {});
    }, []);

    const leaveDaysFor = (grade) => gradeLeaveDays(grade) ?? defaultLeaveDays;

    const departments = useMemo(
        () => [...new Set((employees || []).map((row) => row.department).filter(Boolean))].sort(),
        [employees]
    );
    // Designations of the chosen department only
    const designations = useMemo(
        () => [...new Set((employees || [])
            .filter((row) => department === "all" || row.department === department)
            .map((row) => row.designation).filter(Boolean))].sort(),
        [employees, department]
    );
    const query = search.trim().toLowerCase();
    const filtered = (employees || []).filter((row) => (department === "all" || row.department === department)
        && (designation === "all" || row.designation === designation)
        && (!query || [row.name, row.id, row.designation].some((value) => String(value || "").toLowerCase().includes(query))));
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const assignedCount = (employees || []).filter((row) => row.grade).length;

    const setGrades = (ids, grade) => setEmployees((current) => current.map((row) => (ids.includes(row.id) ? { ...row, grade } : row)));

    // Saves as soon as a grade is picked; goes back to the old grade if saving fails
    const saveGrade = async (employee, grade) => {
        const previous = employee.grade;
        setGrades([employee.id], grade);
        setSavingId(employee.id);
        try {
            await request(`/api/employees/${encodeURIComponent(employee.id)}`, { method: "PATCH", body: { grade } });
            setToast({
                type: "success",
                message: grade
                    ? t("gradeAssignment.savedOne", { name: employee.name, grade, defaultValue: "{{name}} is now grade {{grade}}" })
                    : t("gradeAssignment.cleared", { name: employee.name, defaultValue: "Grade removed for {{name}}" }),
            });
        } catch (error) {
            setGrades([employee.id], previous);
            setToast({ type: "error", message: error.message });
        } finally {
            setSavingId(null);
        }
    };

    const assignToFiltered = async (grade) => {
        const ids = filtered.map((row) => row.id);
        const data = await request("/api/employees/bulk-grade", { method: "POST", body: { employeeIds: ids, grade } });
        setGrades(data.employeeIds || ids, grade);
        setBulkOpen(false);
        setToast({
            type: "success",
            message: data.updated === 1
                ? t("employeesList.bulkGrade.doneOne", { grade, defaultValue: "Grade {{grade}} assigned to 1 employee." })
                : t("employeesList.bulkGrade.done", { count: data.updated, grade, defaultValue: "Grade {{grade}} assigned to {{count}} employees." }),
        });
    };

    const columns = [
        {
            key: "employee",
            label: t("gradeAssignment.employee", { defaultValue: "Employee" }),
            render: (row) => (
                <span className="ga-person">
                    <strong dir="auto">{row.name}</strong>
                    <span className="emp-id-chip" dir="ltr">{row.id}</span>
                </span>
            ),
        },
        {
            key: "designation",
            label: t("employeesList.table.designation", { defaultValue: "Designation" }),
            render: (row) => row.designation || <span className="emp-muted">-</span>,
        },
        {
            key: "department",
            label: t("profileEdit.fields.department", { defaultValue: "Department" }),
            render: (row) => row.department || <span className="emp-muted">-</span>,
        },
        {
            key: "grade",
            label: t("employeeProfile.basic.grade", { defaultValue: "Grade" }),
            render: (row) => (
                <span className="ga-grade-cell">
                    <select
                        value={row.grade}
                        disabled={savingId === row.id}
                        onChange={({ target }) => saveGrade(row, target.value)}
                        aria-label={t("gradeAssignment.gradeFor", { name: row.name, defaultValue: "Grade for {{name}}" })}
                    >
                        <option value="">{t("employeeProfile.basic.noGrade", { defaultValue: "No grade" })}</option>
                        {/* A grade saved before the company list stays selectable */}
                        {[...new Set([row.grade, ...gradeList])].filter(Boolean).map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                    </select>
                    <small>
                        {savingId === row.id
                            ? t("profileEdit.saving", { defaultValue: "Saving..." })
                            : t("gradeAssignment.daysShort", { count: leaveDaysFor(row.grade), defaultValue: "{{count}} days/yr" })}
                    </small>
                </span>
            ),
        },
    ];

    return (
        <DashboardLayout>
            <div className="ga-page">
                <header className="ga-hero">
                    <div>
                        <span className="ga-kicker">{t("menu.settings", { defaultValue: "Settings" })}</span>
                        <h1>{t("menu.gradeAssignment", { defaultValue: "Grade Assignment" })}</h1>
                        <p>{t("gradeAssignment.subtitle", { defaultValue: "Each employee's grade decides their yearly Annual Leave days." })}</p>
                    </div>
                    <div className="ga-hero-stats">
                        <div><strong>{employees?.length ?? 0}</strong><span>{t("gradeAssignment.total", { defaultValue: "Employees" })}</span></div>
                        <div><strong>{assignedCount}</strong><span>{t("gradeAssignment.withGrade", { defaultValue: "With a grade" })}</span></div>
                        <div><strong>{(employees?.length ?? 0) - assignedCount}</strong><span>{t("gradeAssignment.withoutGrade", { defaultValue: "No grade yet" })}</span></div>
                    </div>
                </header>

                <section className="ga-card">
                    <div className="ga-toolbar">
                        <label className="ga-search">
                            <Search size={16} aria-hidden="true" />
                            <input
                                value={search}
                                onChange={({ target }) => { setSearch(target.value); setPage(1); }}
                                placeholder={t("settings.shifts.bulk.search", { defaultValue: "Search name or ID" })}
                                aria-label={t("settings.shifts.bulk.search", { defaultValue: "Search name or ID" })}
                            />
                        </label>
                        <select
                            value={department}
                            onChange={({ target }) => { setDepartment(target.value); setDesignation("all"); setPage(1); }}
                            aria-label={t("profileEdit.fields.department", { defaultValue: "Department" })}
                        >
                            <option value="all">{t("settings.shifts.bulk.allDepartments", { defaultValue: "All departments" })}</option>
                            {departments.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                        <select
                            value={designation}
                            onChange={({ target }) => { setDesignation(target.value); setPage(1); }}
                            aria-label={t("employeesList.table.designation", { defaultValue: "Designation" })}
                        >
                            <option value="all">{t("employeesList.filters.allDesignations", { defaultValue: "All designations" })}</option>
                            {designations.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                        <span className="ga-count">
                            <Users size={15} aria-hidden="true" />
                            {filtered.length === 1
                                ? t("gradeAssignment.shownOne", { defaultValue: "1 employee" })
                                : t("gradeAssignment.shown", { count: filtered.length, defaultValue: "{{count}} employees" })}
                        </span>
                        <button type="button" className="ga-bulk-button" onClick={() => setBulkOpen(true)} disabled={!filtered.length}>
                            <Award size={16} aria-hidden="true" />
                            {t("gradeAssignment.assignFiltered", { defaultValue: "Assign Grade to Filtered" })}
                        </button>
                    </div>

                    {employees === null ? (
                        <p className="ga-empty">{t("settings.page.loading", { defaultValue: "Loading..." })}</p>
                    ) : loadError ? (
                        <p className="ga-empty error" role="alert">{loadError}</p>
                    ) : filtered.length === 0 ? (
                        <p className="ga-empty">{t("settings.shifts.bulk.noEmployees", { defaultValue: "No employees match." })}</p>
                    ) : (
                        <>
                            <div className="ga-table">
                                <Table columns={columns} data={pageRows} />
                            </div>
                            <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />
                        </>
                    )}
                </section>
            </div>

            {bulkOpen && (
                <BulkGradeModal count={filtered.length} grades={gradeList} leaveDaysFor={leaveDaysFor} onCancel={() => setBulkOpen(false)} onConfirm={assignToFiltered} />
            )}
            <DocumentToast toast={toast} onClose={closeToast} />
        </DashboardLayout>
    );
}

export default GradeAssignment;
