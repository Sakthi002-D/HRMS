import { Navigate, Outlet } from "react-router-dom";
import HRAssistant from "../assistant/HRAssistant";

function ProtectedRoute({ role }) {

  const employeeSession =
    sessionStorage.getItem("loggedInEmployee");

  const hrSession =
    sessionStorage.getItem("loggedInHR");

  // ==================================================
  // EMPLOYEE
  // ==================================================
  if (role === "employee") {

    if (!employeeSession) {
      return (
        <Navigate
          to="/login"
          replace
        />
      );
    }

    let employeeUser = null;
    try {
      employeeUser = JSON.parse(employeeSession);
    } catch {
      employeeUser = null;
    }

    if (!employeeUser) {
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

    if (!hrSession) {
      return (
        <Navigate
          to="/login"
          replace
        />
      );
    }

    let hrUser = null;
    try {
      hrUser = JSON.parse(hrSession);
    } catch {
      hrUser = null;
    }

    if (!hrUser) {
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