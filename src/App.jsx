import { BrowserRouter, Routes, Route } from "react-router-dom";

import Employees from "./HR/Employees";
import Home from "./pages/Home";
import EmployeeLogin from "./pages/EmployeeLogin";
import HRLogin from "./pages/HRLogin";
import HRDashboard from "./HR/HRDashboard";
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;