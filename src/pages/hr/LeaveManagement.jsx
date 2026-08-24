import { useEffect, useState } from "react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import "./LeaveManagement.css";

function LeaveManagement() {
    const [search, setSearch] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("all");
    const [selectedLeaveType, setSelectedLeaveType] = useState("all");
    const [selectedEmployee, setSelectedEmployee] = useState(null);

    // Leave data from backend
    const [leaveData, setLeaveData] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Format date received from PostgreSQL
    const formatDate = (date) => {
        if (!date) return "";

        return new Date(date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    };

    // Get leaves from backend
    useEffect(() => {
        const fetchLeaves = async () => {
            try {
                setLoading(true);

                const response = await fetch(
                    "http://localhost:5000/api/leaves"
                );

                if (!response.ok) {
                    throw new Error("Failed to fetch leaves");
                }

                const data = await response.json();

                // Convert backend data to UI format
                const formattedData = data.map((leave) => ({
                    id: leave.id,
                    employeeID: leave.employee_id,
                    employeeName: leave.employee_name,
                    leaveType: leave.leave_type,
                    fromDate: formatDate(leave.from_date),
                    toDate: formatDate(leave.to_date),
                    days: leave.days,
                    reason: leave.reason,
                    status: leave.status,
                }));

                setLeaveData(formattedData);
                setError("");
            } catch (error) {
                console.error("Error fetching leaves:", error);
                setError("Failed to load leave data");
            } finally {
                setLoading(false);
            }
        };

        fetchLeaves();
    }, []);

    const leaveBalances = [
        {
            employeeID: "EMP001",
            employeeName: "Sakthivel",
            leaveType: "Casual Leave",
            totalLeave: 12,
            usedLeave: 4,
        },
        {
            employeeID: "EMP002",
            employeeName: "Sundhar",
            leaveType: "Sick Leave",
            totalLeave: 10,
            usedLeave: 3,
        },
    ];

    const filteredLeaves = leaveData.filter((leave) => {
        const matchesSearch =
            leave.employeeName
                ?.toLowerCase()
                .includes(search.toLowerCase()) ||
            leave.employeeID
                ?.toLowerCase()
                .includes(search.toLowerCase());

        const matchesStatus =
            selectedStatus === "all" ||
            leave.status.toLowerCase() === selectedStatus.toLowerCase();

        const matchesLeaveType =
            selectedLeaveType === "all" ||
            leave.leaveType === selectedLeaveType;

        return matchesSearch && matchesStatus && matchesLeaveType;
    });

    // Temporary frontend status update
     const updateLeaveStatus = async (id, newStatus) => {
    try {
        const response = await fetch(
            `http://localhost:5000/api/leaves/${id}/status`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    status: newStatus,
                }),
            }
        );

        if (!response.ok) {
            throw new Error("Failed to update leave status");
        }

        const updatedLeave = await response.json();

        setLeaveData((previousLeaves) =>
            previousLeaves.map((leave) =>
                leave.id === id
                    ? {
                          ...leave,
                          status: updatedLeave.status,
                      }
                    : leave
            )
        );

    } catch (error) {
        console.error("Error updating leave:", error);
        alert("Failed to update leave status");
    }
};

    const handleEmployeeClick = (leave) => {
        setSelectedEmployee(leave);
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
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />

                            <select
                                value={selectedStatus}
                                onChange={(e) =>
                                    setSelectedStatus(e.target.value)
                                }
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

                        <h2>
                            {
                                leaveData.filter(
                                    (leave) =>
                                        leave.status === "Pending"
                                ).length
                            }
                        </h2>

                        <p>Requests waiting for approval</p>
                    </div>

                </div>


                {/* Leave Table */}
                <div className="leave-table-container">

                    <h2>Leave Requests</h2>

                    {loading && (
                        <p>Loading leave requests...</p>
                    )}

                    {error && (
                        <p style={{ color: "red" }}>
                            {error}
                        </p>
                    )}

                    {!loading && !error && (
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

                                {filteredLeaves.length === 0 ? (

                                    <tr>
                                        <td colSpan="8">
                                            No leave records found
                                        </td>
                                    </tr>

                                ) : (

                                    filteredLeaves.map((leave) => (

                                        <tr key={leave.id}>

                                            <td>
                                                {leave.employeeID}
                                            </td>

                                            <td>

                                                <button
                                                    className="employee-name-btn"
                                                    onClick={() =>
                                                        handleEmployeeClick(
                                                            leave
                                                        )
                                                    }
                                                >
                                                    {leave.employeeName}
                                                </button>

                                            </td>

                                            <td>
                                                {leave.leaveType}
                                            </td>

                                            <td>
                                                {leave.fromDate}
                                            </td>

                                            <td>
                                                {leave.toDate}
                                            </td>

                                            <td>
                                                {leave.days}
                                            </td>

                                            <td>
                                                {leave.reason}
                                            </td>

                                            <td>

                                                <span
                                                    className={`status ${leave.status.toLowerCase()}`}
                                                >
                                                    {leave.status}
                                                </span>

                                                {leave.status === "Pending" && (

                                                    <div className="leave-actions">

                                                        <button
                                                            className="approve-btn"
                                                            onClick={() =>
                                                                updateLeaveStatus(
                                                                    leave.id,
                                                                    "Approved"
                                                                )
                                                            }
                                                        >
                                                            Approve
                                                        </button>

                                                        <button
                                                            className="reject-btn"
                                                            onClick={() =>
                                                                updateLeaveStatus(
                                                                    leave.id,
                                                                    "Rejected"
                                                                )
                                                            }
                                                        >
                                                            Reject
                                                        </button>

                                                    </div>

                                                )}

                                            </td>

                                        </tr>

                                    ))

                                )}

                            </tbody>

                        </table>
                    )}

                </div>


                {/* Employee Modal */}
                {selectedEmployee && (

                    <div className="employee-modal-overlay">

                        <div className="employee-modal">

                            <div className="employee-modal-header">

                                <div>

                                    <h2>
                                        Employee Leave Details
                                    </h2>

                                    <p>
                                        {selectedEmployee.employeeName}
                                        {" "}
                                        ({selectedEmployee.employeeID})
                                    </p>

                                </div>

                                <button
                                    className="modal-close-btn"
                                    onClick={() =>
                                        setSelectedEmployee(null)
                                    }
                                >
                                    ×
                                </button>

                            </div>


                            <div className="employee-leave-summary">

                                <div>
                                    <span>Casual Leave</span>
                                    <strong>8 Days</strong>
                                </div>

                                <div>
                                    <span>Sick Leave</span>
                                    <strong>10 Days</strong>
                                </div>

                                <div>
                                    <span>Earned Leave</span>
                                    <strong>12 Days</strong>
                                </div>

                            </div>


                            <div className="employee-leave-info">

                                <h3>Leave Request Details</h3>

                                <p>
                                    <strong>From Date:</strong>{" "}
                                    {selectedEmployee.fromDate}
                                </p>

                                <p>
                                    <strong>To Date:</strong>{" "}
                                    {selectedEmployee.toDate}
                                </p>

                                <p>
                                    <strong>Reason:</strong>{" "}
                                    {selectedEmployee.reason}
                                </p>


                                <div className="leave-history">

                                    <h3>Leave History</h3>

                                    <div className="history-item">

                                        <div>
                                            <strong>
                                                10 Jul 2026 - 11 Jul 2026
                                            </strong>

                                            <span>
                                                Casual Leave
                                            </span>
                                        </div>

                                        <span className="history-approved">
                                            Approved
                                        </span>

                                    </div>


                                    <div className="history-item">

                                        <div>

                                            <strong>
                                                05 Jun 2026 - 06 Jun 2026
                                            </strong>

                                            <span>
                                                Sick Leave
                                            </span>

                                        </div>

                                        <span className="history-approved">
                                            Approved
                                        </span>

                                    </div>

                                </div>

                            </div>

                        </div>

                    </div>

                )}

            </div>

        </DashboardLayout>
    );
}

export default LeaveManagement;