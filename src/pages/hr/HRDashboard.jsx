import { Link } from "react-router-dom";
import "./HRDashboard.css";
import DashboardLayout from "../../components/layout/DashboardLayout";


function HRDashboard() {
  return (
    <DashboardLayout>
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

        <div className="recent-employees">

          <div className="recent-employees-header">
            <h2>Recent Employees</h2>
            <Link to="/employees">View All</Link>
          </div>

          <div className="recent-employee-list">

            <div className="recent-employee">
              <div>
                <strong>EMP008</strong>
                <span>Santosh</span>
              </div>
              <span>Developer</span>
            </div>

            <div className="recent-employee">
              <div>
                <strong>EMP007</strong>
                <span>Rahul</span>
              </div>
              <span>Developer</span>
            </div>

            <div className="recent-employee">
              <div>
                <strong>EMP006</strong>
                <span>Prabhu</span>
              </div>
              <span>Software Dev</span>
            </div>

            <div className="recent-employee">
              <div>
                <strong>EMP005</strong>
                <span>Siva</span>
              </div>
              <span>Web Dev</span>
            </div>

          </div>

          </div>

    </DashboardLayout>
  );
}

export default HRDashboard;