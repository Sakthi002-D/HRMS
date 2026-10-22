import { Navigate, Outlet } from "react-router-dom";
import HRAssistant from "../assistant/HRAssistant";
import { clearStaleSession, getAuthRole } from "../../utils/auth";

function ProtectedRoute({ role }) {

  // Sessions without a token (created before token auth) must sign in again
  clearStaleSession();
  const authRole = getAuthRole();

  const employeeSession =
    sessionStorage.getItem("loggedInEmployee");

  const hrSession =
    sessionStorage.getItem("loggedInHR");

  // ==================================================
  // EMPLOYEE
  // ==================================================
  if (role === "employee") {

    if (authRole !== "employee" || !employeeSession) {
      return (
        <Navigate
          to="/login"
          replace
        />
      );
    }

    let employeeUser;
    try {
      employeeUser = JSON.parse(employeeSession);
    } catch {
      employeeUser = null;
    }

    if (!employeeUser || String(employeeUser.role || "").toLowerCase() !== "employee") {
      return (
        <Navigate
          to="/login"
          replace
        />
      );
    }

    const employeeId = employeeUser.employee_id || employeeUser.id;

    return (
      <>
        <Outlet />
        <HRAssistant
          key={`assistant-employee-${employeeId}`}
          role="employee"
          user={employeeUser}
        />
      </>
    );
  }

  // ==================================================
  // HR
  // ==================================================
  if (role === "hr") {

    if (authRole !== "hr" || !hrSession) {
      return (
        <Navigate
          to="/login"
          replace
        />
      );
    }

    let hrUser;
    try {
      hrUser = JSON.parse(hrSession);
    } catch {
      hrUser = null;
    }

    if (!hrUser || String(hrUser.role || "").toLowerCase() !== "hr") {
      return (
        <Navigate
          to="/login"
          replace
        />
      );
    }

    const hrId = hrUser.employee_id || hrUser.id;

    return (
      <>
        <Outlet />
        <HRAssistant
          key={`assistant-hr-${hrId}`}
          role="hr"
          user={hrUser}
        />
      </>
    );
  }

  // ==================================================
  // INVALID ROLE
  // ==================================================
  return (
    <Navigate
      to="/login"
      replace
    />
  );
}

export default ProtectedRoute;