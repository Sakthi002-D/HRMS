import { Link } from "react-router-dom";
import "./HRDashboard.css";

function HRDashboard() {
  return (
    <div className="dashboard">

      <aside className="sidebar">
        <h2>HRMS</h2>

        <Link to="/hr-dashboard">Dashboard</Link>
        <Link to="/employees">Employees</Link>
        <Link to="/attendance">Attendance</Link>
        <Link to="/leave-management">Leave Management</Link>
        <Link to="/payroll">Payroll</Link>
        <Link to="/tickets">Tickets</Link>
        <Link to="/reports">Reports</Link>
      </aside>

      <main className="hr-main">

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

      </main>

    </div>
  );
}

export default HRDashboard;