// Company grades from Settings → Grade Master, shared by every page in the tab.
//
//   const { codes, grades, leaveDaysFor, loaded, error, reload } = useGrades();
//
// codes: active grade codes in sort order (for dropdowns). Until the first load
// finishes (or if it fails) the built-in company list is used, so a dropdown is
// never empty. Grade Master calls reload() after each change and every page updates.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { FALLBACK_GRADES, fetchGrades } from "../utils/grades";

let snapshot = { grades: FALLBACK_GRADES, loaded: false, error: "", editable: false, leaveDaysEditable: false };
let inflight = null;
const listeners = new Set();

const emit = (next) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
};

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const getSnapshot = () => snapshot;

export function loadGrades({ force = false } = {}) {
    if (inflight) return inflight;
    if (snapshot.loaded && !force) return Promise.resolve(snapshot);
    inflight = fetchGrades()
        .then((data) => emit({
            grades: Array.isArray(data?.grades) ? data.grades : [],
            loaded: true,
            error: "",
            editable: Boolean(data?.editable),
            leaveDaysEditable: Boolean(data?.leaveDaysEditable),
        }))
        .catch((error) => emit({ ...snapshot, error: error.message }))
        .then(() => snapshot)
        .finally(() => {
            inflight = null;
        });
    return inflight;
}

// enabled: false skips the request (e.g. the employee self-service view, which can't read grades)
export default function useGrades({ enabled = true } = {}) {
    const state = useSyncExternalStore(subscribe, getSnapshot);

    useEffect(() => {
        if (enabled) loadGrades();
    }, [enabled]);

    const codes = useMemo(() => state.grades.filter((grade) => grade.active !== false).map((grade) => grade.grade_code), [state.grades]);
    const leaveDaysByCode = useMemo(
        () => Object.fromEntries(state.grades.filter((grade) => Number(grade.leave_days) > 0).map((grade) => [grade.grade_code.toUpperCase(), Number(grade.leave_days)])),
        [state.grades]
    );
    const leaveDaysFor = useCallback((code) => leaveDaysByCode[String(code || "").trim().toUpperCase()] ?? null, [leaveDaysByCode]);
    const reload = useCallback(() => loadGrades({ force: true }), []);

    return { ...state, codes, leaveDaysByCode, leaveDaysFor, reload };
}
