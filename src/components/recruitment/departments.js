// Department names shared by the MPR form and Settings → Recruitment Masters.
// The MPR budget check matches by department name, so both must use this same list.
export const BUILT_IN_DEPARTMENTS = [
    "Projects / Construction",
    "Civil Engineering",
    "Electrical / MEP",
    "Safety / HSE",
    "Plant & Equipment",
    "Procurement / Stores",
    "HR & Administration",
    "Finance / Accounts",
    "Commercial / Quantity Surveying",
];

export const CUSTOM_DEPARTMENTS_KEY = "mprCustomDepartments";

// Custom departments added from the MPR form; bad or missing saved data reads as an empty list
export const readCustomDepartments = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(CUSTOM_DEPARTMENTS_KEY) || "[]");
        return Array.isArray(saved) ? saved.filter((name) => typeof name === "string" && name.trim()) : [];
    } catch {
        return [];
    }
};
