// Company grades now live in Settings → Grade Master (GET /api/grades).
// Read them with the useGrades hook (src/hooks/useGrades.js); these helpers call the API.
import API_URL from "../config/api";
import { authHeaders } from "./auth";

// Built-in company list, shown only until GET /api/grades answers (or if it fails)
const FALLBACK_BANDS = [
    { codes: ["1-A", "1-B", "1-C", "1-D"], days: 30 },
    { codes: ["2-A", "2-B", "3-A", "3-B"], days: 28 },
    { codes: ["3-C", "4-A", "4-B"], days: 26 },
    { codes: ["4-C", "4-D", "5-A", "5-B", "5-C"], days: 24 },
    { codes: ["5-D", "6-A", "6-B", "6-D", "7-A", "8-A", "9-A"], days: 21 },
];

export const FALLBACK_GRADES = FALLBACK_BANDS.flatMap((band) => band.codes.map((code) => ({ grade_code: code, grade_name: "", leave_days: band.days, active: true, employee_count: 0 })))
    .map((grade, index) => ({ ...grade, sort_order: index + 1 }));

const request = async (path, { method = "GET", body } = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
        method,
        headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data === null) {
        const error = new Error(data?.message || (response.status === 404
            ? "Grade Master is not on the server yet. Restart the backend and try again."
            : `Request failed (${response.status})`));
        error.status = response.status;
        throw error;
    }
    return data;
};

const gradePath = (code) => `/api/grades/${encodeURIComponent(code)}`;

// { grades: [{ grade_code, grade_name, leave_days, sort_order, active, employee_count }], editable, leaveDaysEditable }
export const fetchGrades = () => request("/api/grades");
export const createGrade = (grade) => request("/api/grades", { method: "POST", body: grade });
export const updateGrade = (code, changes) => request(gradePath(code), { method: "PUT", body: changes });
export const deleteGrade = (code) => request(gradePath(code), { method: "DELETE" });
