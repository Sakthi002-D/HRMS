import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./HRDashboard.css";

function HRDashboard() {

      const [totalEmployees, setTotalEmployees] = useState(0);

      useEffect(() => {
        fetch("https://hrms-cuoq.onrender.com/api/employees")
          .then((response) => response.json())
          .then((data) => {
            setTotalEmployees(data.length);
          })
          .catch((error) => {
            console.error("Error fetching employee:",error);
          });
      }, []);
    return (
        <DashboardLayout>

            <div className="hr-dashboard">

                <div className="dashboard-header">
                    <h1>HR Dashboard</h1>
                    <p>Overview of your organization's HR activities</p>
                </div>

                {/* Summary Cards */}
                <div className="dashboard-cards">

                    <div className="dashboard-card">
                        <h3>Total Employees</h3>
                        <h2>{totalEmployees}</h2>
                        <p>Active employees</p>
                    </div>

                    <div className="dashboard-card">
                        <h3>Present Today</h3>
                        <h2>46</h2>
                        <p>92% attendance</p>
                    </div>

                    <div className="dashboard-card">
                        <h3>Pending Leaves</h3>
                        <h2>2</h2>
                        <p>Waiting for approval</p>
                    </div>

                    <div className="dashboard-card">
                        <h3>Open Tickets</h3>
                        <h2>2</h2>
                        <p>Need attention</p>
                    </div>

                </div>

                {/* Dashboard Sections */}
                <div className="dashboard-sections">

                    <div className="dashboard-section">
                        <h2>Recent Leave Requests</h2>

                        <div className="dashboard-row">
                            <div>
                                <strong>Sakthivel</strong>
                                <p>Casual Leave • 20 Aug 2026</p>
                            </div>
                            <span className="pending">Pending</span>
                        </div>

                        <div className="dashboard-row">
                            <div>
                                <strong>John Doe</strong>
                                <p>Casual Leave • 25 Aug 2026</p>
                            </div>
                            <span className="pending">Pending</span>
                        </div>

                        <div className="dashboard-row">
                            <div>
                                <strong>Sundhar</strong>
                                <p>Sick Leave • 22 Aug 2026</p>
                            </div>
                            <span className="approved">Approved</span>
                        </div>

                    </div>


                    <div className="dashboard-section">
                        <h2>Recent Support Tickets</h2>

                        <div className="dashboard-row">
                            <div>
                                <strong>System Login Issue</strong>
                                <p>Sakthivel • High Priority</p>
                            </div>
                            <span className="open">Open</span>
                        </div>

                        <div className="dashboard-row">
                            <div>
                                <strong>Leave Balance Issue</strong>
                                <p>Sundhar • Medium Priority</p>
                            </div>
                            <span className="progress">In Progress</span>
                        </div>

                        <div className="dashboard-row">
                            <div>
                                <strong>Laptop Request</strong>
                                <p>Rahul • Low Priority</p>
                            </div>
                            <span className="open">Open</span>
                        </div>

                    </div>

                </div>

            </div>

        </DashboardLayout>
    );
}

export default HRDashboard;