const TOKEN_KEY = "authToken";

export const storeAuthToken = (token) => {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
};

export const getAuthToken = () => sessionStorage.getItem(TOKEN_KEY);

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
