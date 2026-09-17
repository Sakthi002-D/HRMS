import { CalendarDays, Clock3, FileText, KeyRound, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Settings as SettingsIcon, UserRound, WalletCards } from "lucide-react";
import "./EmployeeSidebar.css";

function EmployeeSidebar({ activeSection, collapsed, onToggle, onSectionChange, onProfile, onChangePassword, onLeave, onLogout }) {
    return (
        <aside className={`employee-sidebar${collapsed ? " collapsed" : ""}`}>
            <div className="employee-brand">
                <img src="/shelter logo.png" alt="Shelter Group" />
                <button
                    type="button"
                    className="employee-collapse-button"
                    onClick={onToggle}
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                </button>
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
                <button className={`employee-menu-item ${activeSection === "attendance" ? "active" : ""}`} onClick={() => onSectionChange("attendance")}>
                    <Clock3 size={19} strokeWidth={2} />
                    <span>Attendance</span>
                </button>
                <button className={`employee-menu-item ${activeSection === "payroll" ? "active" : ""}`} onClick={() => onSectionChange("payroll")}>
                    <WalletCards size={19} strokeWidth={2} />
                    <span>Payroll</span>
                </button>
                <button className={`employee-menu-item ${activeSection === "documents" ? "active" : ""}`} onClick={() => onSectionChange("documents")}>
                    <FileText size={19} strokeWidth={2} />
                    <span>Documents</span>
                </button>
                <button className={`employee-menu-item ${activeSection === "leave" ? "active" : ""}`} onClick={onLeave}>
                    <CalendarDays size={19} strokeWidth={2} />
                    <span>Apply Leave</span>
                </button>
            </nav>

            <div className="employee-account">
                <div className="employee-menu-title">ACCOUNT</div>
                <button className={`employee-menu-item ${activeSection === "settings" ? "active" : ""}`} onClick={() => onSectionChange("settings")}>
                    <SettingsIcon size={19} strokeWidth={2} />
                    <span>Settings</span>
                </button>
            </div>

            <button className="employee-logout" onClick={onLogout}>
                <LogOut size={19} strokeWidth={2} />
                <span>Logout</span>
            </button>
        </aside>
    );
}

export default EmployeeSidebar;
