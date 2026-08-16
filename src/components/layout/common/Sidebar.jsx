import { Link } from "react-router-dom";
import "./Sidebar.css";

function Sidebar() {
  return (
    <aside className="sidebar">

      <h2>Main Menu</h2>

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

      <Link to="/reports" className="sidebar-link">
        Reports
      </Link>

    </aside>
  );
}

export default Sidebar;