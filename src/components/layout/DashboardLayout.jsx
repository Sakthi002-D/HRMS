import { useState } from "react";
import Sidebar from "./common/Sidebar";
import "./DashboardLayout.css";
import "./SharedTheme.css";

function DashboardLayout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className={`dashboard-layout${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

      <main className="dashboard-content">
        {children}
      </main>
      
    </div>
  );
}

export default DashboardLayout;