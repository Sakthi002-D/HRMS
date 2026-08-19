import { BrowserRouter, Routes, Route } from "react-router-dom";


import Attendance from "./pages/hr/Attendance";
import Employees from "./pages/hr/Employees";
import LeaveManagement from "./pages/hr/LeaveManagement";
import Home from "./pages/Home";
import EmployeeLogin from "./pages/EmployeeLogin";
import HRLogin from "./pages/HRLogin";
import HRDashboard from "./pages/hr/HRDashboard";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route path="/" element={<Home />} />

        <Route path="/hr-login" element={<HRLogin />} />

        <Route path="/employee-login" element={<EmployeeLogin />} />

        <Route path="/hr-dashboard" element={<HRDashboard />} />

       <Route path="/employees" element={<Employees />} />

       <Route path="/attendance" element={<Attendance />} />
       
       <Route path="/leave-management" element={<LeaveManagement />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;