import { useState } from "react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import "./LeaveManagement.css";

function LeaveManagement() {
    const [search, setSearch] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("all");
    const [selectedLeaveType, setSelectedLeaveType] = useState("all");

   const [leaveData, setLeaveData] = useState([
    {
        employeeID: "EMP001",
        employeeName: "Sakthivel",
        leaveType: "Casual Leave",
        fromDate: "20 Aug 2026",
        toDate: "21 Aug 2026",
        days: 2,
        reason: "Personal",
        status: "Pending",
    },

    {
        employeeID: "EMP002",
        employeeName: "Sundhar",
        leaveType: "Sick Leave",
        fromDate: "22 Aug 2026",
        toDate: "22 Aug 2026",
        days: 1,
        reason: "Not feeling well",
        status: "Approved",
    },

    {
        employeeID: "EMP003",
        employeeName: "John Doe",
        leaveType: "Casual Leave",
        fromDate: "25 Aug 2026",
        toDate: "26 Aug 2026",
        days: 2,
        reason: "Family function",
        status: "Pending",
    },

    {
        employeeID: "EMP004",
        employeeName: "Rahul",
        leaveType: "Earned Leave",
        fromDate: "28 Aug 2026",
        toDate: "30 Aug 2026",
        days: 3,
        reason: "Vacation",
        status: "Rejected",
    },
]);

const filteredLeaves = leaveData.filter((leave) => {

    const matchesSearch =
        leave.employeeName
            .toLowerCase()
            .includes(search.toLowerCase()) ||
        leave.employeeID
            .toLowerCase()
            .includes(search.toLowerCase());

    const matchesStatus =
        selectedStatus === "all" ||
        leave.status.toLowerCase() === selectedStatus.toLowerCase();

    return matchesSearch && matchesStatus;
});

const updateLeaveStatus = (employeeID, newStatus) => {
    setLeaveData((previousLeaves) =>
        previousLeaves.map((leave) =>
            leave.employeeID === employeeID
                ? { ...leave, status: newStatus }
                : leave
        )
    );
};


    return (

        
        <DashboardLayout>

            <div className="leave-page">

                {/* Page Header */}
                <div className="leave-header">
                    <div>
                        <h1>Leave Management</h1>
                        <p>Manage Employee Leave Requests</p>

                    <div className="leave-tools">

                    <input
                         type="text"
                         placeholder="Search employee..."
                         alue={search}
                         onChange={(e) => setSearch(e.target.value)}
                    />

                <select
                    value={selectedLeaveType}
                    onChange={(e) => selectedLeaveType(e.target.value)}
                >
                    <option value="all">All Status</option>
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                </select>

            </div>
                        
          </div>
       </div>

                {/* Summary Cards */}
                <div className="leave-summary">

                    <div className="leave-card">
                        <h3>Total Leave</h3>
                        <h2>120</h2>
                        <p>Total leave days</p>
                    </div>

                    <div className="leave-card">
                        <h3>Used Leave</h3>
                        <h2>45</h2>
                        <p>Leave days used</p>
                    </div>

                    <div className="leave-card">
                        <h3>Remaining Leave</h3>
                        <h2>75</h2>
                        <p>Available leave days</p>
                    </div>

                    <div className="leave-card">
                        <h3>Pending Requests</h3>
                        <h2>{leaveData.filter((leave) => leave.status === "Pending").length}</h2>
                        <p>Requests waiting for approval</p>
                    </div>

                </div>

                <div className="leave-table-container">

    <h2>Leave Requests</h2>

    <table className="leave-table">

        <thead>
            <tr>
                <th>Employee ID</th>
                <th>Employee Name</th>
                <th>Leave Type</th>
                <th>From Date</th>
                <th>To Date</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
            </tr>
        </thead>

        <tbody>
            {filteredLeaves.map((leave) => (

                <tr key={leave.employeeID}>

                    <td>{leave.employeeID}</td>

                    <td>{leave.employeeName}</td>

                    <td>{leave.leaveType}</td>

                    <td>{leave.fromDate}</td>

                    <td>{leave.toDate}</td>

                    <td>{leave.days}</td>

                    <td>{leave.reason}</td>

                    <td>
                        <span
                            className={`status ${leave.status.toLowerCase()}`}>
                                {leave.status}
                        </span>

                        {leave.status === "Pending" && (
        <div className="leave-actions">

            <button
                className="approve-btn"
                onClick={() =>
                    updateLeaveStatus(leave.employeeID, "Approved")
                }
            >
                Approve
            </button>

            <button
                className="reject-btn"
                onClick={() =>
                    updateLeaveStatus(leave.employeeID, "Rejected")
                }
            >
                Reject
            </button>

        </div>
      )}

     </td>

 </tr>

))}

</tbody>

</table>

</div>

</div>

        </DashboardLayout>
    );
}

export default LeaveManagement;