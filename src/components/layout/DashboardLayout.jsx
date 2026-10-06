import { useState } from "react";
import Sidebar from "./common/Sidebar";
import "./DashboardLayout.css";
import "./SharedTheme.css";

// Remembers the collapsed choice while moving between HR pages.
// It lives outside the component, so it survives page changes,
// but a browser refresh reloads the code and resets it (sidebar opens again).
let rememberedCollapsed = false;

function DashboardLayout({ children, className = "" }) {
  // Each new page starts from the remembered choice
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => rememberedCollapsed);

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      rememberedCollapsed = next;
      return next;
    });
  };

  return (
    <div className={`dashboard-layout ${className}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
      />

      <main className="dashboard-content">
        {children}
      </main>

    </div>
  );
}

export default DashboardLayout;