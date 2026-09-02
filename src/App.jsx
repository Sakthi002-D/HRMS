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
import EmployeeLogin from "./pages/EmployeeLogin";
import HRLogin from "./pages/HRLogin";
import Recruitment from "./pages/hr/Recruitment";
import HRDashboard from "./pages/hr/HRDashboard";

import EmployeeReport from "./pages/hr/EmployeeReport";
import AttendanceReport from "./pages/hr/AttendanceReport";
import LeaveReport from "./pages/hr/LeaveReport";
import PayrollReport from "./pages/hr/PayrollReport";



import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route path="/" element={<Home />} />

        <Route path="/home" element={<Home />} />

        <Route path="/hr-login" element={<HRLogin />} />

        <Route path="/employee-login" element={<EmployeeLogin />} />

        <Route path="/employee-dashboard" element={<EmployeeDashboard />} />

        <Route path="/candidate-jobs" element={<CandidateJobs />} />

        <Route path="/recruitment" element={<Recruitment />} />

        <Route path="/hr-dashboard" element={<HRDashboard />} />

        <Route path="/employees/employeedetails/:employeeSlug" element={<EmployeeDetails />} />

       <Route path="/employees" element={<Employees />} />

       <Route path="/attendance" element={<Attendance />} />
       
       <Route path="/leave-management" element={<LeaveManagement />} />

       <Route path="/payroll" element={<Payroll />} />       

       <Route path="/tickets" element={<Tickets />} />

       <Route path="/reports" element={<Reports />} />

       {/* Report Pages */}
          <Route path="/employee-report" element={<EmployeeReport />} />
          <Route path="/attendance-report" element={<AttendanceReport />} />
          <Route path="/leave-report" element={<LeaveReport />} />
          <Route path="/payroll-report" element={<PayrollReport />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;