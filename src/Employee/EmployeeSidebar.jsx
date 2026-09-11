import { CalendarDays, Clock3, KeyRound, LayoutDashboard, LogOut, Settings as SettingsIcon, UserRound } from "lucide-react";
import "./EmployeeSidebar.css";

function EmployeeSidebar({ activeSection, onSectionChange, onProfile, onChangePassword, onLeave, onLogout }) {
    return (
        <aside className="employee-sidebar">
            <div className="employee-brand">
                <img src="/shelter logo.png" alt="Shelter Group" />
            </div>

            <div className="employee-menu-title">EMPLOYEE PORTAL</div>

            <nav className="employee-menu" aria-label="Employee portal navigation">
                <button className={`employee-menu-item ${activeSection === "dashboard" ? "active" : ""}`} onClick={() => onSectionChange("dashboard")}>
                    <LayoutDashboard size={19} strokeWidth={2} />
                    <span>Dashboard</span>
                </button>
                <button className={`employee-menu-item ${activeSection === "profile" ? "active" : ""}`} onClick={onProfile}>
                    <UserRound size={19} strokeWidth={2} />
                    <span>Profile</span>
                </button>
                <button className="employee-menu-item" onClick={onChangePassword}>
                    <KeyRound size={19} strokeWidth={2} />
                    <span>Change Password</span>
                </button>
                <button className={`employee-menu-item ${activeSection === "settings" ? "active" : ""}`} onClick={() => onSectionChange("settings")}>
                    <SettingsIcon size={19} strokeWidth={2} />
                    <span>Settings</span>
                </button>
                <button className={`employee-menu-item ${activeSection === "attendance" ? "active" : ""}`} onClick={() => onSectionChange("attendance")}>
                    <Clock3 size={19} strokeWidth={2} />
                    <span>Attendance</span>
                </button>
                <button className={`employee-menu-item ${activeSection === "leave" ? "active" : ""}`} onClick={onLeave}>
                    <CalendarDays size={19} strokeWidth={2} />
                    <span>Apply Leave</span>
                </button>
            </nav>

            <button className="employee-logout" onClick={onLogout}>
                <LogOut size={19} strokeWidth={2} />
                <span>Logout</span>
            </button>
        </aside>
    );
}

export default EmployeeSidebar;
