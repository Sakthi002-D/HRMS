import { Navigate, Outlet } from "react-router-dom";

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

    return <Outlet />;
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

    return <Outlet />;
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