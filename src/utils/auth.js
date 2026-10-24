import API_URL from "../config/api";

const TOKEN_KEY = "authToken";

export const storeAuthToken = (token) => {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
};

export const getAuthToken = () => sessionStorage.getItem(TOKEN_KEY);

export const getAuthRole = () => {
  try {
    const payload = getAuthToken()?.split(".")[0];
    const role = payload && JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).typ;
    return role === "hr" || role === "employee" ? role : null;
  } catch {
    return null;
  }
};

export const installApiAuthorizationFetch = () => {
  if (typeof window === "undefined" || window.fetch.__hrmsAuthFetch) return;
  const originalFetch = window.fetch.bind(window);
  const apiOrigin = new URL(API_URL, window.location.href);

  const authenticatedFetch = async (input, options = {}) => {
    const requestUrl = new URL(input instanceof Request ? input.url : input, window.location.href);
    if (requestUrl.origin !== apiOrigin.origin || !requestUrl.pathname.startsWith("/api/")) {
      return originalFetch(input, options);
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(options.headers || {}).forEach((value, name) => headers.set(name, value));
    const token = getAuthToken();
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    const response = await originalFetch(input, { ...options, headers });

    // A revoked or expired session returns this exact message on every route:
    // clear the stale session once and send the user back to sign in.
    if (response.status === 401 && token) {
      const data = await response.clone().json().catch(() => ({}));
      if (data.message === "Invalid or expired token") {
        storeAuthToken(null);
        sessionStorage.removeItem("loggedInHR");
        sessionStorage.removeItem("loggedInEmployee");
        if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
      }
    }
    return response;
  };
  authenticatedFetch.__hrmsAuthFetch = true;
  window.fetch = authenticatedFetch;
};

// Merge into fetch headers for employee-master write requests
export const authHeaders = (headers = {}) => {
  const token = getAuthToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
};

// Sessions created before token auth have no token: clear them so the user signs in again
export const clearStaleSession = () => {
  if (getAuthToken()) return false;
  const hadSession = sessionStorage.getItem("loggedInHR") || sessionStorage.getItem("loggedInEmployee");
  sessionStorage.removeItem("loggedInHR");
  sessionStorage.removeItem("loggedInEmployee");
  return Boolean(hadSession);
};
