import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Clock3,
  CalendarDays,
  IndianRupee,
  Ticket,
  FileText,
  Settings,
  LogOut,
} from "lucide-react";
import "./Sidebar.css";

function Sidebar() {
  const navigate = useNavigate();

  const menuItems = [
    ["/hr-dashboard", "Dashboard", LayoutDashboard],
    ["/employees", "Employees", Users],
    ["/attendance", "Attendance", Clock3],
    ["/leave-management", "Leave Management", CalendarDays],
    ["/payroll", "Payroll", IndianRupee],
    ["/tickets", "Ticketing", Ticket],
    ["/reports", "Reports", FileText],
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/shelter logo.png" alt="Shelter Group" />
      </div>
      <div className="sidebar-section-title">MAIN MENU</div>
      <nav className="sidebar-menu">
        {menuItems.map(([path, label, Icon]) => (
          <NavLink key={path} to={path} className="sidebar-link">
            <Icon size={19} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-account">
        <div className="sidebar-section-title">ACCOUNT</div>
        <button type="button" className="sidebar-link sidebar-button" onClick={() => navigate("/settings")}>
          <Settings size={19} strokeWidth={2} />
          <span>Settings</span>
        </button>
        <button
          type="button"
          className="sidebar-link sidebar-button"
          onClick={() => {
            sessionStorage.removeItem("loggedInHR");
            navigate("/login", { replace: true });
          }}
        >
          <LogOut size={19} strokeWidth={2} />
          <span>Logout</span>
        </button>
      </div>

    </aside>
  );
}

export default Sidebar;