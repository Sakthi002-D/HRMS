import { Link } from "react-router-dom";
import "./HRDashboard.css";
import DashboardLayout from "../../components/layout/DashboardLayout";


function HRDashboard() {
  return (
    <DashboardLayout>
        <h1>Welcome, HR</h1>
        <p>HR Management Dashboard</p>

        <div className="dashboard-cards">

          <div className="dashboard-card">
            <h3>Total Employees</h3>
            <h2>150</h2>
          </div>

          <div className="dashboard-card">
            <h3>Present Today</h3>
            <h2>133</h2>
          </div>

          <div className="dashboard-card">
            <h3>On Leave</h3>
            <h2>17</h2>
          </div>

          <div className="dashboard-card">
            <h3>Pending Requests</h3>
            <h2>0</h2>
          </div>

         </div>
         
    </DashboardLayout>
  );
}

export default HRDashboard;