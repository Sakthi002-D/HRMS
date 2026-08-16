import Sidebar from "./common/Sidebar";
import "./DashboardLayout.css";

function DashboardLayout({ children }) {
  return (
    <div className="dashboard-layout">

      <Sidebar />

      <main className="dashboard-content">
        {children}
      </main>
      
    </div>
  );
}

export default DashboardLayout;