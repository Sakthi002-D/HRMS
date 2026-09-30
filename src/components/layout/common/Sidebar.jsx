import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  BriefcaseBusiness,
  Clock3,
  CalendarDays,
  DoorOpen,
  IndianRupee,
  Ticket,
  FileText,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import "./Sidebar.css";
import { scrollActiveIntoView } from "./sidebarScroll";
import { purgeAllChatStorage } from "../../assistant/HRAssistant";
import { MPRS_CHANGED_EVENT } from "../../recruitment/recruitmentApi";
import { RESIGNATIONS_CHANGED_EVENT, api, getSessionHRId, isPendingHR } from "../../resignation/resignationApi";

// Count for a menu badge: fetches `path(hrId)`, counts rows matching `matches`,
// and refetches whenever a page dispatches `changedEvent`
function useMenuCount(path, changedEvent, matches = () => true) {
  const [count, setCount] = useState(0);
  const matchesRef = useRef(matches);

  useEffect(() => {
    const hrId = getSessionHRId();
    if (!hrId) return undefined;
    let ignore = false;
    const load = () => api(path(encodeURIComponent(hrId)))
      .then((rows) => !ignore && setCount(rows.filter(matchesRef.current).length))
      .catch(() => {});

    load();
    window.addEventListener(changedEvent, load);
    return () => {
      ignore = true;
      window.removeEventListener(changedEvent, load);
    };
  }, [path, changedEvent]);

  return count;
}

const resignationsPath = (hrId) => `/api/hr/resignations?employee_id=${hrId}`;
// MPRs waiting for the logged-in user's action (the "My Approvals" list)
const mprApprovalsPath = (hrId) => `/api/mprs?employee_id=${hrId}&scope=approvals`;

function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate();
  const pendingResignations = useMenuCount(resignationsPath, RESIGNATIONS_CHANGED_EVENT, isPendingHR);
  const pendingMprApprovals = useMenuCount(mprApprovalsPath, MPRS_CHANGED_EVENT);
  const { pathname } = useLocation();
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollActiveIntoView(scrollRef.current, ".sidebar-link.active");
  }, [pathname]);

  const menuItems = [
    ["/hr-dashboard", "Dashboard", LayoutDashboard],
    ["/employees", "Employees", Users],
    ["/recruitment", "Recruitment", BriefcaseBusiness, pendingMprApprovals, "waiting for your approval"],
    ["/attendance", "Attendance", Clock3],
    ["/leave-management", "Leave Management", CalendarDays],
    ["/resignations", "Resignation", DoorOpen, pendingResignations, "waiting for HR"],
    ["/payroll", "Payroll", IndianRupee],
    ["/tickets", "Ticketing", Ticket],
    ["/reports", "Reports", FileText],
  ];

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-logo">
        <img src="/shelter logo.png" alt="Shelter Group" />
        <button
          type="button"
          className="sidebar-collapse-button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <div className="sidebar-scroll" ref={scrollRef}>
        <div className="sidebar-section-title">MAIN MENU</div>
        <nav className="sidebar-menu">
          {menuItems.map(([path, label, Icon, badge, badgeLabel]) => (
            <NavLink key={path} to={path} className="sidebar-link">
              <Icon size={19} strokeWidth={2} />
              <span>{label}</span>
              {badge > 0 && (
                <em className="sidebar-badge" aria-label={`${badge} ${badgeLabel}`} title={`${badge} ${badgeLabel}`}>
                  {badge > 99 ? "99+" : badge}
                </em>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

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
            purgeAllChatStorage();
            if (window.speechSynthesis) window.speechSynthesis.cancel();
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