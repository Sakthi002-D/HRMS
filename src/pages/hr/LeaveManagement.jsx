import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import DashboardLayout from "../../components/layout/DashboardLayout";
import "./LeaveManagement.css";

const API_URL =
    "https://hrms-cuoq.onrender.com/api/leaves";

/*
    Demo/default employee leave allocation.

    If your backend later sends:
    total_leave
    leave_balance

    those values will automatically be used.
*/
const DEFAULT_EMPLOYEE_LEAVE = 42;

const MONTHS = [
    { value: "all", label: "All Months" },
    { value: "01", label: "January" },
    { value: "02", label: "February" },
    { value: "03", label: "March" },
    { value: "04", label: "April" },
    { value: "05", label: "May" },
    { value: "06", label: "June" },
    { value: "07", label: "July" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
];

function LeaveManagement() {
    const [searchParams] = useSearchParams();

    // =========================================================
    // FILTER STATES
    // =========================================================

    const [search, setSearch] = useState("");

    const [selectedStatus, setSelectedStatus] =
        useState("all");

    const [selectedLeaveType, setSelectedLeaveType] =
        useState("all");

    const [selectedMonth, setSelectedMonth] =
        useState("all");

    // =========================================================
    // DATA STATES
    // =========================================================

    const [leaveData, setLeaveData] = useState([]);

    const [selectedEmployee, setSelectedEmployee] =
        useState(null);

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState("");

    const [updating, setUpdating] = useState(false);

    // =========================================================
    // DATE FORMAT
    // =========================================================

    const formatDate = (date) => {
        if (!date) return "";

        const parsedDate = new Date(date);

        if (Number.isNaN(parsedDate.getTime())) {
            return date;
        }

        return parsedDate.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    };

    // =========================================================
    // GET MONTH FROM DATE
    // =========================================================

    const getMonthFromDate = (date) => {
        if (!date) return "";

        const parsedDate = new Date(date);

        if (Number.isNaN(parsedDate.getTime())) {
            return "";
        }

        return String(
            parsedDate.getMonth() + 1
        ).padStart(2, "0");
    };

    // =========================================================
    // FETCH LEAVE DATA
    // =========================================================

    const fetchLeaves = async () => {
        try {
            setLoading(true);
            setError("");

            const response = await fetch(API_URL);

            if (!response.ok) {
                throw new Error(
                    "Failed to fetch leaves"
                );
            }

            const data = await response.json();

            const formattedData = Array.isArray(data)
                ? data.map((leave) => ({
                      id: leave.id,

                      employeeID:
                          leave.employee_id ??
                          leave.employeeID ??
                          "",

                      employeeName:
                          leave.employee_name ??
                          leave.employeeName ??
                          "Unknown Employee",

                      leaveType:
                          leave.leave_type ??
                          leave.leaveType ??
                          "Leave",

                      fromDateRaw:
                          leave.from_date ??
                          leave.fromDate,

                      toDateRaw:
                          leave.to_date ??
                          leave.toDate,

                      fromDate: formatDate(
                          leave.from_date ??
                              leave.fromDate
                      ),

                      toDate: formatDate(
                          leave.to_date ??
                              leave.toDate
                      ),

                      days:
                          Number(leave.days) || 0,

                      reason:
                          leave.reason || "-",

                      status:
                          leave.status || "Pending",

                      /*
                        Backend support.

                        If backend sends these values,
                        employee-specific balance will be used.
                      */

                      totalLeave:
                          Number(
                              leave.total_leave ??
                                  leave.totalLeave ??
                                  leave.annual_leave
                          ) || null,

                      leaveBalance:
                          Number(
                              leave.leave_balance ??
                                  leave.leaveBalance ??
                                  leave.remaining_leave
                          ) || null,
                  }))
                : [];

            setLeaveData(formattedData);

            // =================================================
            // OPEN REVIEW FROM DASHBOARD
            // =================================================

            const reviewEmployee =
                searchParams.get("review");

            if (reviewEmployee) {
                const employeeLeaves =
                    formattedData.filter(
                        (leave) =>
                            String(
                                leave.employeeID
                            ) ===
                                String(
                                    reviewEmployee
                                ) ||
                            String(leave.id) ===
                                String(reviewEmployee)
                    );

                if (
                    employeeLeaves.length > 0
                ) {
                    setSelectedEmployee(
                        employeeLeaves[0]
                    );
                }
            }
        } catch (err) {
            console.error(
                "Error fetching leaves:",
                err
            );

            setError(
                "Failed to load leave data"
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeaves();
    }, [searchParams]);

    // =========================================================
    // LEAVE TYPES
    // =========================================================

    const leaveTypes = useMemo(() => {
        return [
            ...new Set(
                leaveData
                    .map(
                        (leave) =>
                            leave.leaveType
                    )
                    .filter(Boolean)
            ),
        ];
    }, [leaveData]);

    // =========================================================
    // FILTER LEAVE TABLE
    // =========================================================

    const filteredLeaves = useMemo(() => {
        return leaveData.filter((leave) => {
            const searchValue =
                search.trim().toLowerCase();

            // SEARCH
            const matchesSearch =
                !searchValue ||
                leave.employeeName
                    ?.toLowerCase()
                    .includes(searchValue) ||
                String(leave.employeeID)
                    .toLowerCase()
                    .includes(searchValue);

            // STATUS
            const matchesStatus =
                selectedStatus === "all" ||
                leave.status?.toLowerCase() ===
                    selectedStatus.toLowerCase();

            // LEAVE TYPE
            const matchesLeaveType =
                selectedLeaveType === "all" ||
                leave.leaveType ===
                    selectedLeaveType;

            // MONTH
            const matchesMonth =
                selectedMonth === "all" ||
                getMonthFromDate(
                    leave.fromDateRaw
                ) === selectedMonth;

            return (
                matchesSearch &&
                matchesStatus &&
                matchesLeaveType &&
                matchesMonth
            );
        });
    }, [
        leaveData,
        search,
        selectedStatus,
        selectedLeaveType,
        selectedMonth,
    ]);

    // =========================================================
    // MONTHLY SUMMARY
    // =========================================================

    const monthlySummary = useMemo(() => {
        const monthLeaves =
            leaveData.filter((leave) => {
                if (
                    selectedMonth === "all"
                ) {
                    return true;
                }

                return (
                    getMonthFromDate(
                        leave.fromDateRaw
                    ) === selectedMonth
                );
            });

        return {
            total: monthLeaves.length,

            approved: monthLeaves.filter(
                (leave) =>
                    leave.status?.toLowerCase() ===
                    "approved"
            ).length,

            rejected: monthLeaves.filter(
                (leave) =>
                    leave.status?.toLowerCase() ===
                    "rejected"
            ).length,

            pending: monthLeaves.filter(
                (leave) =>
                    leave.status?.toLowerCase() ===
                    "pending"
            ).length,
        };
    }, [
        leaveData,
        selectedMonth,
    ]);

    // =========================================================
    // SELECTED MONTH NAME
    // =========================================================

    const selectedMonthLabel =
        MONTHS.find(
            (month) =>
                month.value === selectedMonth
        )?.label || "All Months";

    // =========================================================
    // UPDATE STATUS
    // =========================================================

    const updateLeaveStatus = async (
        id,
        newStatus
    ) => {
        try {
            setUpdating(true);

            const response = await fetch(
                `${API_URL}/${id}/status`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body: JSON.stringify({
                        status: newStatus,
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(
                    "Failed to update leave status"
                );
            }

            const updatedLeave =
                await response.json();

            const finalStatus =
                updatedLeave?.status ||
                newStatus;

            // UPDATE TABLE
            setLeaveData(
                (previousLeaves) =>
                    previousLeaves.map(
                        (leave) =>
                            leave.id === id
                                ? {
                                      ...leave,
                                      status: finalStatus,
                                  }
                                : leave
                    )
            );

            // UPDATE OPEN MODAL
            setSelectedEmployee(
                (previousEmployee) => {
                    if (
                        !previousEmployee ||
                        previousEmployee.id !==
                            id
                    ) {
                        return previousEmployee;
                    }

                    return {
                        ...previousEmployee,
                        status: finalStatus,
                    };
                }
            );

            return true;
        } catch (err) {
            console.error(
                "Error updating leave:",
                err
            );

            alert(
                "Failed to update leave status. Please try again."
            );

            return false;
        } finally {
            setUpdating(false);
        }
    };

    // =========================================================
    // APPROVE
    // =========================================================

    const handleApprove = async (id) => {
        const success =
            await updateLeaveStatus(
                id,
                "Approved"
            );

        if (success) {
            setSelectedEmployee(null);
        }
    };

    // =========================================================
    // REJECT
    // =========================================================

    const handleReject = async (id) => {
        const success =
            await updateLeaveStatus(
                id,
                "Rejected"
            );

        if (success) {
            setSelectedEmployee(null);
        }
    };

    // =========================================================
    // OPEN EMPLOYEE
    // =========================================================

    const handleEmployeeClick = (
        leave
    ) => {
        setSelectedEmployee(leave);
    };

    // =========================================================
    // CLOSE MODAL
    // =========================================================

    const closeModal = () => {
        if (!updating) {
            setSelectedEmployee(null);
        }
    };

    // =========================================================
    // SELECTED EMPLOYEE LEAVE HISTORY
    // =========================================================

    const selectedEmployeeLeaves =
        selectedEmployee
            ? leaveData.filter(
                  (leave) =>
                      String(
                          leave.employeeID
                      ) ===
                      String(
                          selectedEmployee.employeeID
                      )
              )
            : [];

    // =========================================================
    // APPROVED DAYS
    // =========================================================

    const selectedEmployeeApprovedDays =
        selectedEmployeeLeaves
            .filter(
                (leave) =>
                    leave.status?.toLowerCase() ===
                    "approved"
            )
            .reduce(
                (total, leave) =>
                    total + leave.days,
                0
            );

    // =========================================================
    // PENDING DAYS
    // =========================================================

    const selectedEmployeePendingDays =
        selectedEmployeeLeaves
            .filter(
                (leave) =>
                    leave.status?.toLowerCase() ===
                    "pending"
            )
            .reduce(
                (total, leave) =>
                    total + leave.days,
                0
            );

    // =========================================================
    // REJECTED DAYS
    // =========================================================

    const selectedEmployeeRejectedDays =
        selectedEmployeeLeaves
            .filter(
                (leave) =>
                    leave.status?.toLowerCase() ===
                    "rejected"
            )
            .reduce(
                (total, leave) =>
                    total + leave.days,
                0
            );

    // =========================================================
    // EMPLOYEE TOTAL LEAVE
    // =========================================================

    const selectedEmployeeTotalLeave =
        selectedEmployeeLeaves.find(
            (leave) =>
                leave.totalLeave !== null
        )?.totalLeave ||
        DEFAULT_EMPLOYEE_LEAVE;

    // =========================================================
    // EMPLOYEE BACKEND BALANCE
    // =========================================================

    const backendBalance =
        selectedEmployeeLeaves.find(
            (leave) =>
                leave.leaveBalance !== null
        )?.leaveBalance;

    // =========================================================
    // EMPLOYEE REMAINING LEAVE
    // =========================================================

    const selectedEmployeeRemainingLeave =
        backendBalance !== undefined
            ? backendBalance
            : Math.max(
                  selectedEmployeeTotalLeave -
                      selectedEmployeeApprovedDays,
                  0
              );

    // =========================================================
    // CURRENT REQUEST DAYS
    // =========================================================

    const requestedDays =
        selectedEmployee?.days || 0;

    // =========================================================
    // BALANCE CHECK
    // =========================================================

    const hasSufficientBalance =
        selectedEmployeeRemainingLeave >=
        requestedDays;

    // =========================================================
    // LEAVE USAGE %
    // =========================================================

    const leaveUsagePercentage =
        selectedEmployeeTotalLeave > 0
            ? Math.min(
                  Math.round(
                      (selectedEmployeeApprovedDays /
                          selectedEmployeeTotalLeave) *
                          100
                  ),
                  100
              )
            : 0;

    // =========================================================
    // RENDER
    // =========================================================

    return (
        <DashboardLayout>

            <div className="leave-page">

                {/* =================================================
                    HEADER
                ================================================= */}

                <div className="leave-header">

                    <div>
                        <h1>
                            Leave Management
                        </h1>

                        <p>
                            Manage employee leave
                            requests
                        </p>
                    </div>

                </div>

                {/* =================================================
                    SEARCH + FILTERS
                ================================================= */}

                <div className="leave-tools">

                    {/* SEARCH */}

                    <input
                        type="text"
                        placeholder="Search employee..."
                        value={search}
                        onChange={(e) =>
                            setSearch(
                                e.target.value
                            )
                        }
                    />

                    {/* STATUS */}

                    <select
                        value={selectedStatus}
                        onChange={(e) =>
                            setSelectedStatus(
                                e.target.value
                            )
                        }
                    >
                        <option value="all">
                            All Status
                        </option>

                        <option value="Pending">
                            Pending
                        </option>

                        <option value="Approved">
                            Approved
                        </option>

                        <option value="Rejected">
                            Rejected
                        </option>
                    </select>

                    {/* LEAVE TYPE */}

                    <select
                        value={
                            selectedLeaveType
                        }
                        onChange={(e) =>
                            setSelectedLeaveType(
                                e.target.value
                            )
                        }
                    >
                        <option value="all">
                            All Leave Types
                        </option>

                        {leaveTypes.map(
                            (type) => (
                                <option
                                    key={type}
                                    value={type}
                                >
                                    {type}
                                </option>
                            )
                        )}
                    </select>

                    {/* MONTH */}

                    <select
                        value={selectedMonth}
                        onChange={(e) =>
                            setSelectedMonth(
                                e.target.value
                            )
                        }
                    >
                        {MONTHS.map(
                            (month) => (
                                <option
                                    key={
                                        month.value
                                    }
                                    value={
                                        month.value
                                    }
                                >
                                    {month.label}
                                </option>
                            )
                        )}
                    </select>

                </div>

                {/* =================================================
                    MONTHLY SUMMARY
                ================================================= */}

                <div className="leave-summary">

                    {/* TOTAL REQUESTS */}

                    <div className="leave-card total-request-card">

                        <h3>
                            Total Requests
                        </h3>

                        <h2>
                            {
                                monthlySummary.total
                            }
                        </h2>

                        <p>
                            {selectedMonth ===
                            "all"
                                ? "All leave requests"
                                : `${selectedMonthLabel} requests`}
                        </p>

                    </div>

                    {/* APPROVED */}

                    <div className="leave-card approved-card">

                        <h3>
                            Approved
                        </h3>

                        <h2>
                            {
                                monthlySummary.approved
                            }
                        </h2>

                        <p>
                            {selectedMonth ===
                            "all"
                                ? "Approved requests"
                                : `${selectedMonthLabel} approved`}
                        </p>

                    </div>

                    {/* REJECTED */}

                    <div className="leave-card rejected-card">

                        <h3>
                            Rejected
                        </h3>

                        <h2>
                            {
                                monthlySummary.rejected
                            }
                        </h2>

                        <p>
                            {selectedMonth ===
                            "all"
                                ? "Rejected requests"
                                : `${selectedMonthLabel} rejected`}
                        </p>

                    </div>

                    {/* PENDING */}

                    <div className="leave-card pending-card">

                        <h3>
                            Pending
                        </h3>

                        <h2>
                            {
                                monthlySummary.pending
                            }
                        </h2>

                        <p>
                            {selectedMonth ===
                            "all"
                                ? "Waiting for approval"
                                : `${selectedMonthLabel} pending`}
                        </p>

                    </div>

                </div>

                {/* =================================================
                    LEAVE REQUEST TABLE
                ================================================= */}

                <div className="leave-table-container">

                    <div className="leave-table-heading">

                        <div>

                            <h2>
                                Leave Requests
                            </h2>

                            <p>
                                Click any employee row to review their leave
                                balance and request.
                            </p>

                        </div>


                    </div>

                    {/* LOADING */}

                    {loading && (
                        <div className="leave-message">
                            Loading leave requests...
                        </div>
                    )}

                    {/* ERROR */}

                    {error && (
                        <div className="leave-message error-message">
                            {error}
                        </div>
                    )}

                    {/* TABLE */}

                    {!loading &&
                        !error && (
                            <div className="table-wrapper">

                                <table className="leave-table">

                                    <thead>

                                        <tr>

                                            <th>
                                                Employee ID
                                            </th>

                                            <th>
                                                Employee Name
                                            </th>

                                            <th>
                                                Leave Type
                                            </th>

                                            <th>
                                                From Date
                                            </th>

                                            <th>
                                                To Date
                                            </th>

                                            <th>
                                                Days
                                            </th>

                                            <th>
                                                Reason
                                            </th>

                                            <th>
                                                Status
                                            </th>

                                        </tr>

                                    </thead>

                                    <tbody>

                                        {filteredLeaves.length ===
                                        0 ? (
                                            <tr>

                                                <td
                                                    colSpan="8"
                                                    className="no-data"
                                                >
                                                    No leave
                                                    requests
                                                    found
                                                </td>

                                            </tr>
                                        ) : (
                                            filteredLeaves.map(
                                                (
                                                    leave
                                                ) => (
                                                    <tr
                                                        key={
                                                            leave.id
                                                        }
                                                        className={`leave-request-row ${
                                                            leave.status?.toLowerCase() === "pending"
                                                                ? "pending-row"
                                                                : ""
                                                        } ${
                                                            selectedEmployee?.id === leave.id
                                                                ? "selected-row"
                                                                : ""
                                                        }`}
                                                        onClick={() =>
                                                            handleEmployeeClick(leave)
                                                        }
                                                    >

                                                        {/* EMPLOYEE ID */}

                                                        <td className="employee-id">
                                                            { 
                                                                leave.employeeID
                                                            }
                                                        </td>

                                                        {/* EMPLOYEE NAME */}

                                                        <td>

                                                            <button
                                                                type="button"
                                                                className="employee-name-btn"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleEmployeeClick(leave);
                                                                }}
                                                            >
                                                                {
                                                                    leave.employeeName
                                                                }
                                                            </button>

                                                        </td>

                                                        {/* LEAVE TYPE */}

                                                        <td>
                                                            {
                                                                leave.leaveType
                                                            }
                                                        </td>

                                                        {/* FROM */}

                                                        <td>
                                                            {
                                                                leave.fromDate
                                                            }
                                                        </td>

                                                        {/* TO */}

                                                        <td>
                                                            {
                                                                leave.toDate
                                                            }
                                                        </td>

                                                        {/* DAYS */}

                                                        <td>
                                                            <strong>
                                                                {
                                                                    leave.days
                                                                }
                                                            </strong>
                                                        </td>

                                                        {/* REASON */}

                                                        <td>
                                                            {
                                                                leave.reason
                                                            }
                                                        </td>

                                                        {/* STATUS */}

                                                        <td>

                                                            <span
                                                                className={`leave-status ${leave.status?.toLowerCase()}`}
                                                            >
                                                                {
                                                                    leave.status
                                                                }
                                                            </span>

                                                        </td>

                                                    </tr>
                                                )
                                            )
                                        )}

                                    </tbody>

                                </table>

                            </div>
                        )}

                </div>

                {/* =================================================
                    EMPLOYEE REVIEW MODAL
                ================================================= */}

                {selectedEmployee && (
                    <div className="employee-modal-overlay">

                        <div
                            className="employee-modal"
                            onClick={(e) =>
                                e.stopPropagation()
                            }
                        >

                            {/* =================================================
                                MODAL HEADER
                            ================================================= */}

                            <div className="employee-modal-header">

                                <div>

                                    <span className="review-label">
                                        EMPLOYEE LEAVE REVIEW
                                    </span>

                                    <h2>
                                        {
                                            selectedEmployee.employeeName
                                        }
                                    </h2>

                                    <p>
                                        {
                                            selectedEmployee.employeeID
                                        }
                                    </p>

                                </div>

                                <button
                                    type="button"
                                    className="modal-close-btn"
                                    onClick={
                                        closeModal
                                    }
                                    disabled={
                                        updating
                                    }
                                >
                                    ×
                                </button>

                            </div>

                            {/* =================================================
                                LEAVE BALANCE
                            ================================================= */}

                            <div className="balance-section">

                                <div className="section-title-row">

                                    <div>

                                        <h3>
                                            Leave Balance
                                        </h3>

                                        <p>
                                            Check available
                                            balance before
                                            approving.
                                        </p>

                                    </div>

                                    <span className="balance-year">
                                        {
                                            new Date().getFullYear()
                                        }
                                    </span>

                                </div>

                                {/* BALANCE CARDS */}

                                <div className="balance-cards">

                                    {/* TOTAL */}

                                    <div className="balance-card">

                                        <span>
                                            Total
                                        </span>

                                        <strong>
                                            {
                                                selectedEmployeeTotalLeave
                                            }
                                        </strong>

                                        <small>
                                            Days
                                        </small>

                                    </div>

                                    {/* USED */}

                                    <div className="balance-card used">

                                        <span>
                                            Used
                                        </span>

                                        <strong>
                                            {
                                                selectedEmployeeApprovedDays
                                            }
                                        </strong>

                                        <small>
                                            Days
                                        </small>

                                    </div>

                                    {/* REMAINING */}

                                    <div className="balance-card remaining">

                                        <span>
                                            Remaining
                                        </span>

                                        <strong>
                                            {
                                                selectedEmployeeRemainingLeave
                                            }
                                        </strong>

                                        <small>
                                            Days
                                        </small>

                                    </div>

                                </div>

                                {/* USAGE */}

                                <div className="usage-area">

                                    <div className="usage-label">

                                        <span>
                                            Leave usage
                                        </span>

                                        <strong>
                                            {
                                                leaveUsagePercentage
                                            }
                                            %
                                        </strong>

                                    </div>

                                    <div className="usage-bar">

                                        <div
                                            style={{
                                                width: `${leaveUsagePercentage}%`,
                                            }}
                                        />

                                    </div>

                                </div>

                            </div>

                            {/* =================================================
                                CURRENT LEAVE REQUEST
                            ================================================= */}

                            <div className="request-section">

                                <div className="section-title-row">

                                    <div>

                                        <h3>
                                            Leave Request
                                        </h3>

                                        <p>
                                            Details submitted
                                            by the employee.
                                        </p>

                                    </div>

                                    <span
                                        className={`request-status ${selectedEmployee.status?.toLowerCase()}`}
                                    >
                                        {
                                            selectedEmployee.status
                                        }
                                    </span>

                                </div>

                                <div className="request-grid">

                                    {/* LEAVE TYPE */}

                                    <div className="request-detail">

                                        <span>
                                            LEAVE TYPE
                                        </span>

                                        <strong>
                                            {
                                                selectedEmployee.leaveType
                                            }
                                        </strong>

                                    </div>

                                    {/* REQUESTED DAYS */}

                                    <div className="request-detail">

                                        <span>
                                            REQUESTED DAYS
                                        </span>

                                        <strong className="requested-days">
                                            {
                                                requestedDays
                                            }{" "}
                                            {requestedDays ===
                                            1
                                                ? "Day"
                                                : "Days"}
                                        </strong>

                                    </div>

                                    {/* FROM */}

                                    <div className="request-detail">

                                        <span>
                                            FROM DATE
                                        </span>

                                        <strong>
                                            {
                                                selectedEmployee.fromDate
                                            }
                                        </strong>

                                    </div>

                                    {/* TO */}

                                    <div className="request-detail">

                                        <span>
                                            TO DATE
                                        </span>

                                        <strong>
                                            {
                                                selectedEmployee.toDate
                                            }
                                        </strong>

                                    </div>

                                    {/* REASON */}

                                    <div className="request-detail full-width">

                                        <span>
                                            REASON
                                        </span>

                                        <strong>
                                            {
                                                selectedEmployee.reason
                                            }
                                        </strong>

                                    </div>

                                </div>

                            </div>

                            {/* =================================================
                                BALANCE CHECK
                            ================================================= */}

                            {selectedEmployee.status?.toLowerCase() ===
                                "pending" && (
                                <div
                                    className={
                                        hasSufficientBalance
                                            ? "balance-alert success"
                                            : "balance-alert danger"
                                    }
                                >

                                    <div className="alert-icon">

                                        {hasSufficientBalance
                                            ? "✓"
                                            : "!"}

                                    </div>

                                    <div>

                                        <strong>

                                            {hasSufficientBalance
                                                ? "Sufficient leave balance"
                                                : "Insufficient leave balance"}

                                        </strong>

                                        <p>

                                            {
                                                selectedEmployee.employeeName
                                            }{" "}
                                            has{" "}

                                            <b>
                                                {
                                                    selectedEmployeeRemainingLeave
                                                }{" "}
                                                days
                                            </b>{" "}

                                            remaining and
                                            requested{" "}

                                            <b>
                                                {
                                                    requestedDays
                                                }{" "}
                                                days
                                            </b>
                                            .

                                        </p>

                                    </div>

                                </div>
                            )}

                            {/* =================================================
                                LEAVE HISTORY
                            ================================================= */}

                            <div className="leave-history">

                                <div className="history-heading">

                                    <div>

                                        <h3>
                                            Leave History
                                        </h3>

                                        <p>
                                            Previous requests
                                            from this
                                            employee.
                                        </p>

                                    </div>

                                </div>

                                {selectedEmployeeLeaves.length ===
                                0 ? (
                                    <p className="empty-history">
                                        No leave history
                                        found.
                                    </p>
                                ) : (
                                    selectedEmployeeLeaves.map(
                                        (
                                            leave
                                        ) => (
                                            <div
                                                className="history-item"
                                                key={
                                                    leave.id
                                                }
                                            >

                                                <div>

                                                    <strong>
                                                        {
                                                            leave.fromDate
                                                        }{" "}
                                                        -{" "}
                                                        {
                                                            leave.toDate
                                                        }
                                                    </strong>

                                                    <span>
                                                        {
                                                            leave.leaveType
                                                        }{" "}
                                                        •{" "}
                                                        {
                                                            leave.days
                                                        }{" "}
                                                        {leave.days ===
                                                        1
                                                            ? "Day"
                                                            : "Days"}
                                                    </span>

                                                    <span>
                                                        {
                                                            leave.reason
                                                        }
                                                    </span>

                                                </div>

                                                <span
                                                    className={`history-status ${leave.status?.toLowerCase()}`}
                                                >
                                                    {
                                                        leave.status
                                                    }
                                                </span>

                                            </div>
                                        )
                                    )
                                )}

                            </div>

                            {/* =================================================
                                APPROVE / REJECT
                            ================================================= */}

                            {selectedEmployee.status?.toLowerCase() ===
                                "pending" && (
                                <div className="modal-actions">

                                    {/* REJECT */}

                                    <button
                                        type="button"
                                        className="modal-reject-btn"
                                        onClick={() =>
                                            handleReject(
                                                selectedEmployee.id
                                            )
                                        }
                                        disabled={
                                            updating
                                        }
                                    >
                                        {updating
                                            ? "Updating..."
                                            : "✕ Reject"}
                                    </button>

                                    {/* APPROVE */}

                                    <button
                                        type="button"
                                        className="modal-approve-btn"
                                        onClick={() =>
                                            handleApprove(
                                                selectedEmployee.id
                                            )
                                        }
                                        disabled={
                                            updating ||
                                            !hasSufficientBalance
                                        }
                                    >
                                        {updating
                                            ? "Updating..."
                                            : "✓ Approve"}
                                    </button>

                                </div>
                            )}

                        </div>

                    </div>
                )}

            </div>

        </DashboardLayout>
    );
}

export default LeaveManagement;