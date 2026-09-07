import { BrowserRouter, Routes, Route } from "react-router-dom";

import EmployeeDashboard from "./Employee/EmployeeDashboard";

import EmployeeDetails from "./pages/hr/EmployeeDetails";
import CandidateJobs from "./pages/CandidateJobs";

import Attendance from "./pages/hr/Attendance";
import Employees from "./pages/hr/Employees";
import LeaveManagement from "./pages/hr/LeaveManagement";
import Payroll from "./pages/hr/Payroll";
import Tickets from "./pages/hr/Tickets";
import Reports from "./pages/hr/Reports";

import Home from "./pages/Home";

import VerifyOTP from "./pages/VerifyOTP";
import ResetPassword from "./pages/ResetPassword";

import ProtectedRoute from "./components/layout/ProtectedRoute";

import Login from "./pages/Login";
import EmployeeLogin from "./pages/EmployeeLogin";
import HRLogin from "./pages/HRLogin";

import Recruitment from "./pages/hr/Recruitment";
import HRDashboard from "./pages/hr/HRDashboard";

import ForgotPassword from "./pages/ForgotPassword";

import EmployeeReport from "./pages/hr/EmployeeReport";
import AttendanceReport from "./pages/hr/AttendanceReport";
import LeaveReport from "./pages/hr/LeaveReport";
import PayrollReport from "./pages/hr/PayrollReport";
import DepartmentOverview from "./pages/hr/DepartmentOverview";

import "./App.css";

function App() {
  return (
    <BrowserRouter>

      <Routes>

        {/* =========================================
            PUBLIC ROUTES
        ========================================= */}

        <Route
          path="/"
          element={<Home />}
        />

        <Route
          path="/home"
          element={<Home />}
        />

        <Route
          path="/login"
          element={<Login />}
        />

        {/* Keep these only if you still use them */}
        <Route
          path="/hr-login"
          element={<HRLogin />}
        />

        <Route
          path="/employee-login"
          element={<EmployeeLogin />}
        />

        <Route
          path="/forgot-password"
          element={<ForgotPassword />}
        />

        <Route
          path="/verify-otp"
          element={<VerifyOTP />}
        />

        <Route
          path="/reset-password"
          element={<ResetPassword />}
        />


        {/* =========================================
            EMPLOYEE PROTECTED ROUTE
        ========================================= */}

        <Route
          element={
            <ProtectedRoute role="employee" />
          }
        >

          <Route
            path="/employee-dashboard"
            element={<EmployeeDashboard />}
          />

        </Route>


        {/* =========================================
            HR PROTECTED ROUTES
        ========================================= */}

        <Route
          element={
            <ProtectedRoute role="hr" />
          }
        >

          <Route
            path="/hr-dashboard"
            element={<HRDashboard />}
          />

          <Route
            path="/candidate-jobs"
            element={<CandidateJobs />}
          />

          <Route
            path="/recruitment"
            element={<Recruitment />}
          />

          <Route
            path="/employees/employeedetails/:employeeSlug"
            element={<EmployeeDetails />}
          />

          <Route
            path="/employees"
            element={<Employees />}
          />

          <Route
            path="/attendance"
            element={<Attendance />}
          />

          <Route
            path="/leave-management"
            element={<LeaveManagement />}
          />

          <Route
            path="/payroll"
            element={<Payroll />}
          />

          <Route
            path="/tickets"
            element={<Tickets />}
          />

          <Route
            path="/reports"
            element={<Reports />}
          />

          <Route
            path="/department-overview"
            element={<DepartmentOverview />}
          />

          {/* REPORT PAGES */}

          <Route
            path="/employee-report"
            element={<EmployeeReport />}
          />

          <Route
            path="/attendance-report"
            element={<AttendanceReport />}
          />

          <Route
            path="/leave-report"
            element={<LeaveReport />}
          />

          <Route
            path="/payroll-report"
            element={<PayrollReport />}
          />

        </Route>

      </Routes>

    </BrowserRouter>
  );
}

export default App;