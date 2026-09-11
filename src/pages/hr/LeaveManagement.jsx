import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import DashboardLayout from "../../components/layout/DashboardLayout";
import "./LeaveManagement.css";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${API_BASE_URL}/api/leaves`;
const POLICY_API_URL = API_URL.replace(/\/leaves$/, "/leave-policies");
const DEFAULT_LEAVE_TYPES = [
    "Annual Leave",
    "Casual Leave",
    "Sick Leave",
    "Paternity Leave",
    "Maternity Leave",
    "Hajj Leave",
    "Bereavement Leave",
    "Emergency Leave",
    "Compensatory Off",
    "Unpaid Leave (LOP)",
];
const DEFAULT_QATAR_HOLIDAYS = [
    { name: "National Day", date: "18 December", days: 1 },
    { name: "National Sports Day", date: "Second Tuesday of February", days: 1 },
    { name: "Eid al-Fitr", date: "Islamic calendar", days: 3 },
    { name: "Eid al-Adha", date: "Islamic calendar", days: 3 },
    { name: "Islamic New Year", date: "Islamic calendar", days: 1 },
    { name: "Prophet's Birthday", date: "Islamic calendar", days: 1 },
];

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
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [isPolicySetupOpen, setIsPolicySetupOpen] = useState(false);
    const [leavePolicy, setLeavePolicy] = useState({
        leaveTypes: DEFAULT_LEAVE_TYPES,
        qatarHolidayCalendar: DEFAULT_QATAR_HOLIDAYS,
        underFiveYearsMonthlyAccrual: 1.75,
        underFiveYearsAnnualDays: 21,
        fiveYearsAndAboveMonthlyAccrual: 2.33,
        fiveYearsAndAboveAnnualDays: 28,
        sickEligibleAfterMonths: 3,
        maternityDays: 50,
        bereavementDays: 3,
        compensatoryOffValidityDays: 90,
    });
    const [policyLoading, setPolicyLoading] = useState(false);
    const [policySaving, setPolicySaving] = useState(false);
    const [policyMessage, setPolicyMessage] = useState("");

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

                      cancelledBy:
                          leave.cancelled_by ??
                              leave.cancelledBy ??
                              null,

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

    const fetchLeavePolicy = async () => {
        try {
            setPolicyLoading(true);
            const response = await fetch(POLICY_API_URL);
            if (!response.ok) throw new Error("Failed to fetch leave policy");
            const data = await response.json();
            const policy = data.policy || data;
            setLeavePolicy({
                leaveTypes: Array.isArray(policy.leaveTypes) && policy.leaveTypes.length
                    ? policy.leaveTypes
                    : DEFAULT_LEAVE_TYPES,
                qatarHolidayCalendar: Array.isArray(policy.qatarHolidayCalendar) && policy.qatarHolidayCalendar.length
                    ? policy.qatarHolidayCalendar
                    : DEFAULT_QATAR_HOLIDAYS,
                underFiveYearsMonthlyAccrual: policy.annualLeave?.underFiveYearsMonthlyAccrual ?? 1.75,
                underFiveYearsAnnualDays: policy.annualLeave?.underFiveYearsAnnualDays ?? 21,
                fiveYearsAndAboveMonthlyAccrual: policy.annualLeave?.fiveYearsAndAboveMonthlyAccrual ?? 2.33,
                fiveYearsAndAboveAnnualDays: policy.annualLeave?.fiveYearsAndAboveAnnualDays ?? 28,
                sickEligibleAfterMonths: policy.sickLeave?.eligibleAfterMonths ?? 3,
                maternityDays: policy.maternityLeave?.days ?? 50,
                bereavementDays: policy.bereavementLeave?.immediateFamilyDays ?? 3,
                compensatoryOffValidityDays: policy.compensatoryOff?.validityDays ?? 90,
            });
        } catch (error) {
            console.error("Error fetching leave policy:", error);
            setPolicyMessage("Unable to load saved policy");
        } finally {
            setPolicyLoading(false);
        }
    };

    const saveLeavePolicy = async () => {
        try {
            setPolicySaving(true);
            setPolicyMessage("");
            const response = await fetch(POLICY_API_URL, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    policy: {
                        leaveTypes: leavePolicy.leaveTypes,
                        qatarHolidayCalendar: leavePolicy.qatarHolidayCalendar,
                        annualLeave: {
                            underFiveYearsMonthlyAccrual: Number(leavePolicy.underFiveYearsMonthlyAccrual),
                            underFiveYearsAnnualDays: Number(leavePolicy.underFiveYearsAnnualDays),
                            fiveYearsAndAboveMonthlyAccrual: Number(leavePolicy.fiveYearsAndAboveMonthlyAccrual),
                            fiveYearsAndAboveAnnualDays: Number(leavePolicy.fiveYearsAndAboveAnnualDays),
                        },
                        sickLeave: {
                            eligibleAfterMonths: Number(leavePolicy.sickEligibleAfterMonths),
                            medicalCertificateRequired: true,
                            salaryBands: [
                                { days: 14, pay: "100%" },
                                { days: 28, pay: "50%" },
                                { days: 42, pay: "Unpaid" },
                            ],
                        },
                        maternityLeave: {
                            days: Number(leavePolicy.maternityDays),
                            pay: "Full Pay",
                            approval: "HR",
                            medicalCertificateRequired: true,
                        },
                        bereavementLeave: {
                            immediateFamilyDays: Number(leavePolicy.bereavementDays),
                            approval: "Manager",
                        },
                        compensatoryOff: {
                            eligibility: ["Worked on public holiday", "Worked on weekend"],
                            validityDays: Number(leavePolicy.compensatoryOffValidityDays),
                            approval: "Manager",
                        },
                    },
                }),
            });
            if (!response.ok) throw new Error("Failed to save leave policy");
            setPolicyMessage("Policy saved successfully");
        } catch (error) {
            console.error("Error saving leave policy:", error);
            setPolicyMessage("Unable to save policy");
        } finally {
            setPolicySaving(false);
        }
    };

    useEffect(() => {
        fetchLeaves();
        fetchLeavePolicy();
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

    const exportLeaves = (format) => {
        if (!filteredLeaves.length) {
            return;
        }

        const headers = [
            "Employee ID",
            "Employee Name",
            "Leave Type",
            "From Date",
            "To Date",
            "Days",
            "Reason",
            "Status",
        ];

        const rows = filteredLeaves.map((leave) => [
            leave.employeeID,
            leave.employeeName,
            leave.leaveType,
            leave.fromDate,
            leave.toDate,
            leave.days,
            leave.reason,
            leave.status,
        ]);

        const escapeCSV = (value) =>
            `"${String(value ?? "").replaceAll('"', '""')}"`;

        const fileContent = format === "excel"
            ? `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows
                  .map((row) => `<tr>${row.map((value) => `<td>${String(value ?? "")}</td>`).join("")}</tr>`)
                  .join("")}</tbody></table>`
            : [headers, ...rows]
                  .map((row) => row.map(escapeCSV).join(","))
                  .join("\n");

        const blob = new Blob(
            [fileContent],
            {
                type: format === "excel"
                    ? "application/vnd.ms-excel"
                    : "text/csv;charset=utf-8;",
            }
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = format === "excel"
            ? "leave-requests.xls"
            : "leave-requests.csv";
        link.click();
        URL.revokeObjectURL(url);
        setIsExportMenuOpen(false);
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

                    <div className="leave-header-actions">
                        <button
                            type="button"
                            className="leave-policy-btn"
                            onClick={() => setIsPolicySetupOpen((open) => !open)}
                            aria-expanded={isPolicySetupOpen}
                        >
                            Leave Policy Setup
                        </button>
                        <div className="leave-export-menu">
                            <button
                                type="button"
                                className="leave-export-btn"
                                onClick={() => setIsExportMenuOpen((open) => !open)}
                                disabled={!filteredLeaves.length}
                                aria-expanded={isExportMenuOpen}
                                aria-haspopup="menu"
                            >
                                Export <span aria-hidden="true">⌄</span>
                            </button>

                            {isExportMenuOpen && (
                                <div className="leave-export-options" role="menu">
                                    <button type="button" onClick={() => exportLeaves("excel")} role="menuitem">
                                        Excel
                                    </button>
                                    <button type="button" onClick={() => exportLeaves("csv")} role="menuitem">
                                        CSV
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {isPolicySetupOpen && (
                    <section className="leave-policy-panel" aria-label="Leave Policy Setup">
                        <div className="leave-policy-heading">
                            <div>
                                <h2>Leave Policy Setup</h2>
                                <p>Configure the annual leave allowance used for employee reviews.</p>
                            </div>
                            <button
                                type="button"
                                className="leave-policy-close"
                                onClick={() => setIsPolicySetupOpen(false)}
                                aria-label="Close leave policy setup"
                            >
                                ×
                            </button>
                        </div>
                        <div className="leave-policy-fields">
                            {[
                                ["underFiveYearsMonthlyAccrual", "Under 5 Years Monthly Accrual", "days per month", "0.01"],
                                ["underFiveYearsAnnualDays", "Under 5 Years Annual Days", "days per year", "1"],
                                ["fiveYearsAndAboveMonthlyAccrual", "5+ Years Monthly Accrual", "days per month", "0.01"],
                                ["fiveYearsAndAboveAnnualDays", "5+ Years Annual Days", "days per year", "1"],
                                ["sickEligibleAfterMonths", "Sick Leave Eligible After", "months", "1"],
                                ["maternityDays", "Maternity Leave Days", "days", "1"],
                                ["bereavementDays", "Bereavement Days", "days", "1"],
                                ["compensatoryOffValidityDays", "Comp Off Validity", "days validity", "1"],
                            ].map(([name, label, unit, step]) => (
                                <label key={name}>
                                    {label}
                                    <input
                                        type="number"
                                        min="0"
                                        step={step}
                                        value={leavePolicy[name]}
                                        disabled={policyLoading || policySaving}
                                        onChange={(event) => setLeavePolicy((current) => ({
                                            ...current,
                                            [name]: Math.max(0, Number(event.target.value)),
                                        }))}
                                    />
                                    <span>{unit}</span>
                                </label>
                            ))}
                        </div>
                        <div className="leave-policy-types">
                            <h3>Available Leave Types</h3>
                            <div className="leave-policy-type-list">
                                {leavePolicy.leaveTypes.map((leaveType) => (
                                    <span key={leaveType}>{leaveType}</span>
                                ))}
                            </div>
                        </div>
                        <div className="leave-holiday-calendar">
                            <h3>Qatar Holiday Calendar</h3>
                            <div className="leave-holiday-list">
                                {leavePolicy.qatarHolidayCalendar.map((holiday) => (
                                    <div className="leave-holiday-row" key={holiday.name}>
                                        <strong>{holiday.name}</strong>
                                        <span>{holiday.date}</span>
                                        <b>{holiday.days} {holiday.days === 1 ? "day" : "days"}</b>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="leave-policy-rules">
                            <p><strong>Sick Leave:</strong> Medical certificate required. First 14 days at 100% salary, next 28 days at 50%, additional 42 days unpaid.</p>
                            <p><strong>Maternity Leave:</strong> Full pay, HR approval, medical certificate required.</p>
                            <p><strong>Bereavement:</strong> Immediate family, manager approval.</p>
                            <p><strong>Compensatory Off:</strong> Public holiday or weekend work, manager approval.</p>
                        </div>
                        <div className="leave-policy-footer">
                            {policyMessage && <span>{policyMessage}</span>}
                            <button type="button" onClick={saveLeavePolicy} disabled={policyLoading || policySaving}>
                                {policySaving ? "Saving..." : "Save Policy"}
                            </button>
                        </div>
                    </section>
                )}

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

                    {/* SEARCH + FILTERS */}
                    <div className="leave-tools leave-request-filters">
                        <input
                            type="text"
                            placeholder="Search employee..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />

                        <div className="leave-tools-spacer" />

                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                        >
                            <option value="all">All Status</option>
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>

                        <select
                            value={selectedLeaveType}
                            onChange={(e) => setSelectedLeaveType(e.target.value)}
                        >
                            <option value="all">All Leave Types</option>
                            {leaveTypes.map((type) => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>

                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                        >
                            {MONTHS.map((month) => (
                                <option key={month.value} value={month.value}>{month.label}</option>
                            ))}
                        </select>
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
                                                            {leave.status?.toLowerCase() === "cancelled" && leave.cancelledBy && (
                                                                <small className="cancelled-by-label">
                                                                    Cancelled by {leave.cancelledBy}
                                                                </small>
                                                            )}

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