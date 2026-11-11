// A browser refresh inside the HR portal opens the HR dashboard, the same way the employee
// portal always opens on its dashboard. Runs once, before the router starts.
// Only a real reload counts: links from emails or bookmarks (e.g. /resignations?card=pending-hr)
// still open their own page.

const HR_DASHBOARD = "/hr-dashboard";

// Pages anyone can open; a refresh there stays put
// (the employee portal is a single page that already opens on its dashboard)
const PUBLIC_PATHS = ["/", "/home", "/login", "/hr-login", "/employee-login", "/forgot-password", "/verify-otp", "/reset-password", "/candidate-jobs", "/employee-dashboard"];
const PUBLIC_PREFIXES = ["/careers", "/offer/"];

const isReload = () => {
    try {
        const [entry] = performance.getEntriesByType("navigation");
        if (entry) return entry.type === "reload";
        return performance.navigation?.type === 1; // older browsers
    } catch {
        return false;
    }
};

const hasHrSession = () => {
    try {
        return Boolean(sessionStorage.getItem("loggedInHR"));
    } catch {
        return false;
    }
};

export function sendHrRefreshToDashboard() {
    if (typeof window === "undefined" || !isReload() || !hasHrSession()) return;
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (path === HR_DASHBOARD || PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return;
    window.history.replaceState(window.history.state, "", HR_DASHBOARD);
}
