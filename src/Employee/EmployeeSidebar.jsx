import { Briefcase, CalendarDays, Clock3, DoorOpen, FileText, KeyRound, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Settings as SettingsIcon, UserRound, WalletCards } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { scrollActiveIntoView } from "../components/layout/common/sidebarScroll";
import "./EmployeeSidebar.css";

function EmployeeSidebar({ activeSection, collapsed, onToggle, onSectionChange, onProfile, onChangePassword, onLeave, onResignation, onLogout, showManpower = false }) {
    const scrollRef = useRef(null);
    const { t } = useTranslation();

    useEffect(() => {
        scrollActiveIntoView(scrollRef.current, ".employee-menu-item.active");
    }, [activeSection]);

    return (
        <aside className={`employee-sidebar${collapsed ? " collapsed" : ""}`}>
            <div className="employee-brand">
                <img src="/shelter logo.png" alt="Shelter Group" />
                <button
                    type="button"
                    className="employee-collapse-button"
                    onClick={onToggle}
                    aria-label={collapsed ? t("menu.expandSidebar") : t("menu.collapseSidebar")}
                    title={collapsed ? t("menu.expandSidebar") : t("menu.collapseSidebar")}
                >
                    {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                </button>
            </div>

            <div className="employee-sidebar-scroll" ref={scrollRef}>
                <div className="employee-menu-title">{t("menu.employeePortal")}</div>

                <nav className="employee-menu" aria-label="Employee portal navigation">
                    <button className={`employee-menu-item ${activeSection === "dashboard" ? "active" : ""}`} onClick={() => onSectionChange("dashboard")}>
                        <LayoutDashboard size={19} strokeWidth={2} />
                        <span>{t("menu.dashboard")}</span>
                    </button>
                    <button className={`employee-menu-item ${activeSection === "profile" ? "active" : ""}`} onClick={onProfile}>
                        <UserRound size={19} strokeWidth={2} />
                        <span>{t("menu.profile")}</span>
                    </button>
                    <button className={`employee-menu-item ${activeSection === "attendance" ? "active" : ""}`} onClick={() => onSectionChange("attendance")}>
                        <Clock3 size={19} strokeWidth={2} />
                        <span>{t("menu.attendance")}</span>
                    </button>
                    <button className={`employee-menu-item ${activeSection === "payroll" ? "active" : ""}`} onClick={() => onSectionChange("payroll")}>
                        <WalletCards size={19} strokeWidth={2} />
                        <span>{t("menu.payroll")}</span>
                    </button>
                    <button className={`employee-menu-item ${activeSection === "documents" ? "active" : ""}`} onClick={() => onSectionChange("documents")}>
                        <FileText size={19} strokeWidth={2} />
                        <span>{t("menu.documents")}</span>
                    </button>
                    <button className={`employee-menu-item ${activeSection === "leave" ? "active" : ""}`} onClick={onLeave}>
                        <CalendarDays size={19} strokeWidth={2} />
                        <span>{t("menu.applyLeave")}</span>
                    </button>
                    <button className={`employee-menu-item ${activeSection === "resignation" ? "active" : ""}`} onClick={onResignation}>
                        <DoorOpen size={19} strokeWidth={2} />
                        <span>{t("menu.resignation")}</span>
                    </button>
                    {showManpower && (
                        <button className={`employee-menu-item ${activeSection === "manpower" ? "active" : ""}`} onClick={() => onSectionChange("manpower")}>
                            <Briefcase size={19} strokeWidth={2} />
                            <span>{t("menu.manpowerRequests")}</span>
                        </button>
                    )}
                    <button className={`employee-menu-item ${activeSection === "change-password" ? "active" : ""}`} onClick={onChangePassword}>
                        <KeyRound size={19} strokeWidth={2} />
                        <span>{t("menu.changePassword")}</span>
                    </button>
                </nav>
            </div>

            <div className="employee-account">
                <div className="employee-menu-title">{t("menu.account")}</div>
                <button className={`employee-menu-item ${activeSection === "settings" ? "active" : ""}`} onClick={() => onSectionChange("settings")}>
                    <SettingsIcon size={19} strokeWidth={2} />
                    <span>{t("menu.settings")}</span>
                </button>
            </div>

            <button className="employee-logout" onClick={onLogout}>
                <LogOut size={19} strokeWidth={2} />
                <span>{t("menu.logout")}</span>
            </button>
        </aside>
    );
}

export default EmployeeSidebar;