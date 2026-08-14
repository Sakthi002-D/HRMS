import { Link } from "react-router-dom";
import "./HRDashboard.css";

function HRDashboard() {
  return (
    <div className="dashboard">

      <aside className="sidebar">
        <h2>Main menu</h2>

        <Link to="/hr-dashboard" className="sidebar-link">
        Dashboard
        </Link>
        
        <Link to="/employees" className="sidebar-link">
        Employees
        </Link>
        
        <Link to="/attendance" className="sidebar-link">
        Attendance
        </Link>
        
        <Link to="/leave-management" className="sidebar-link">
        Leave Management
        </Link>
        
        <Link to="/payroll" className="sidebar-link">
        Payroll
        </Link>
        
        <Link to="/tickets" className="sidebar-link">
        Tickets
        </Link>
        
        <Link to="/reports" className="sidebar-link"
        >Reports
        </Link>
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