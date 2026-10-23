import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";

import DashboardLayout from "../../components/layout/DashboardLayout";
import LeaveTracker from "../../components/hr/LeaveTracker";
import {
    addDays,
    getCompanyToday,
    getTrackerState,
} from "../../components/hr/leaveTrackerState";
import "./LeaveManagement.css";
import { useAlert } from "../../components/common/dialog/dialogContext";
import { usePagination, RowsPerPage, Pagination } from "../../components/common/TablePagination";
import API_BASE_URL from "../../config/api";

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

// Holiday names / dates come from the saved policy (English); shown translated when known
const holidayKey = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function LeaveManagement() {
    const { t } = useTranslation();
    // Values stay English (filters, CSS classes, saving); only the shown text is translated
    const leaveTypeLabel = (value) => (value ? t(`leaveTypes.${value}`, { defaultValue: value }) : value);
    const statusLabel = (value) => (value ? t(`leaveDetails.status.${value.toLowerCase()}`, { defaultValue: value }) : value);
    const monthLabel = (month) => (month.value === "all"
        ? t("leaveManagement.allMonths", { defaultValue: month.label })
        : t(`employeeRequest.months.${month.label.toLowerCase()}`, { defaultValue: month.label }));
    const holidayName = (name) => t(`leaveManagement.holidays.names.${holidayKey(name)}`, { defaultValue: name });
    const holidayDate = (date) => t(`leaveManagement.holidays.dates.${holidayKey(date)}`, { defaultValue: date });
    const showAlert = useAlert();
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
    const [resuming, setResuming] = useState(false);
    const [annualBalanceState, setAnnualBalanceState] = useState({ employeeId: null, data: null });
    const [resumeDraft, setResumeDraft] = useState({ id: null, date: "" });
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [isPolicySetupOpen, setIsPolicySetupOpen] = useState(false);
    const [leavePolicy, setLeavePolicy] = useState({
        leaveTypes: DEFAULT_LEAVE_TYPES,
        qatarHolidayCalendar: DEFAULT_QATAR_HOLIDAYS,
        // Annual Leave (FRD SHELTER-HCM-LA-15-001): accrual = entitlement ÷ 12
        annualYearlyEntitlementDays: 30,
        annualGradeOverrides: [],
        leaveAccrualSalaryBasis: "total",
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

                      // Leave tracker fields
                      fromDay: leave.from_day ?? null,
                      toDay: leave.to_day ?? null,
                      appliedAt: leave.created_at ?? null,
                      reviewedAt: leave.reviewed_at ?? null,
                      resumedOn: leave.resumed_on ?? null,
                      cancelledAt: leave.cancelled_at ?? null,

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
                t("leaveManagement.errors.loadFailed", { defaultValue: "Failed to load leave data" })
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
                annualYearlyEntitlementDays: policy.annualLeave?.yearly_entitlement_days ?? 30,
                annualGradeOverrides: Object.entries(policy.annualLeave?.grade_overrides || {})
                    .map(([grade, days]) => ({ grade, days: Number(days) })),
                leaveAccrualSalaryBasis: policy.leave_accrual_salary_basis === "basic" ? "basic" : "total",
                sickEligibleAfterMonths: policy.sickLeave?.eligibleAfterMonths ?? 3,
                maternityDays: policy.maternityLeave?.days ?? 50,
                bereavementDays: policy.bereavementLeave?.immediateFamilyDays ?? 3,
                compensatoryOffValidityDays: policy.compensatoryOff?.validityDays ?? 90,
            });
        } catch (error) {
            console.error("Error fetching leave policy:", error);
            setPolicyMessage(t("leaveManagement.policy.loadFailed", { defaultValue: "Unable to load saved policy" }));
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
                            yearly_entitlement_days: Number(leavePolicy.annualYearlyEntitlementDays) || 30,
                            grade_overrides: Object.fromEntries(
                                leavePolicy.annualGradeOverrides
                                    .filter((row) => row.grade.trim() && Number(row.days) > 0)
                                    .map((row) => [row.grade.trim(), Number(row.days)])
                            ),
                        },
                        leave_accrual_salary_basis: leavePolicy.leaveAccrualSalaryBasis,
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
            setPolicyMessage(t("leaveManagement.policy.saved", { defaultValue: "Policy saved successfully" }));
        } catch (error) {
            console.error("Error saving leave policy:", error);
            setPolicyMessage(t("leaveManagement.policy.saveFailed", { defaultValue: "Unable to save policy" }));
        } finally {
            setPolicySaving(false);
        }
    };

    useEffect(() => {
        fetchLeaves();
        fetchLeavePolicy();
    }, [searchParams]);

    // =========================================================
    // ANNUAL LEAVE BALANCE (live from backend)
    // Refetched when the modal opens and after every status change,
    // so Approve / Reject reflect instantly.
    // =========================================================

    const reviewEmployeeID = selectedEmployee?.employeeID;
    const reviewIsAnnual = selectedEmployee?.leaveType === "Annual Leave";
    const reviewStatus = selectedEmployee?.status;

    useEffect(() => {
        if (!reviewEmployeeID || !reviewIsAnnual) return undefined;

        let ignore = false;

        fetch(
            `${API_BASE_URL}/api/employees/${reviewEmployeeID}/annual-leave-balance`,
            { cache: "no-store" }
        )
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Failed to fetch annual leave balance");
                }
                return response.json();
            })
            .then((data) => {
                if (!ignore) {
                    setAnnualBalanceState({ employeeId: reviewEmployeeID, data });
                }
            })
            .catch((err) => {
                console.error("Error fetching annual leave balance:", err);
            });

        return () => {
            ignore = true;
        };
    }, [reviewEmployeeID, reviewIsAnnual, reviewStatus]);

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
    // PAGINATION
    // =========================================================

    const leavePager = usePagination(filteredLeaves);
    const setLeavePage = leavePager.setPage;

    // Any search or filter change goes back to page 1
    useEffect(() => {
        setLeavePage(1);
    }, [search, selectedStatus, selectedLeaveType, selectedMonth, setLeavePage]);

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

    const selectedMonthOption = MONTHS.find(
        (month) =>
            month.value === selectedMonth
    );
    const selectedMonthLabel = selectedMonthOption
        ? monthLabel(selectedMonthOption)
        : t("leaveManagement.allMonths", { defaultValue: "All Months" });

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

            const reviewedAt =
                updatedLeave?.leave?.reviewed_at ??
                null;

            // UPDATE TABLE
            setLeaveData(
                (previousLeaves) =>
                    previousLeaves.map(
                        (leave) =>
                            leave.id === id
                                ? {
                                      ...leave,
                                      status: finalStatus,
                                      reviewedAt:
                                          reviewedAt ??
                                          leave.reviewedAt,
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
                        reviewedAt:
                            reviewedAt ??
                            previousEmployee.reviewedAt,
                    };
                }
            );

            return true;
        } catch (err) {
            console.error(
                "Error updating leave:",
                err
            );

            showAlert({
                title: t("employeesList.alerts.titles.danger", { defaultValue: "Please check" }),
                buttonText: t("employeesList.alerts.ok", { defaultValue: "OK" }),
                message: t("leaveManagement.errors.updateFailed", { defaultValue: "Failed to update leave status. Please try again." }),
            });

            return false;
        } finally {
            setUpdating(false);
        }
    };

    // =========================================================
    // APPROVE
    // =========================================================

    // The modal stays open so HR sees the refreshed balance straight away
    const handleApprove = async (id) => {
        await updateLeaveStatus(
            id,
            "Approved"
        );
    };

    // =========================================================
    // REJECT
    // =========================================================

    const handleReject = async (id) => {
        await updateLeaveStatus(
            id,
            "Rejected"
        );
    };

    // =========================================================
    // MARK AS RESUMED
    // =========================================================

    const handleMarkResumed = async (id) => {
        try {
            setResuming(true);

            const response = await fetch(
                `${API_URL}/${id}/resume`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body: JSON.stringify({
                        resumed_on: resumeDate,
                    }),
                }
            );

            const result = await response
                .json()
                .catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    result.message ||
                        t("leaveManagement.errors.resumeFailed", { defaultValue: "Failed to record resumption" })
                );
            }

            const resumedOn =
                result.leave?.resumed_on ||
                resumeDate;

            setLeaveData((previousLeaves) =>
                previousLeaves.map((leave) =>
                    leave.id === id
                        ? { ...leave, resumedOn }
                        : leave
                )
            );

            setSelectedEmployee((previousEmployee) =>
                previousEmployee?.id === id
                    ? { ...previousEmployee, resumedOn }
                    : previousEmployee
            );
        } catch (err) {
            console.error(
                "Error recording resumption:",
                err
            );

            showAlert({
                title: t("employeesList.alerts.titles.danger", { defaultValue: "Please check" }),
                buttonText: t("employeesList.alerts.ok", { defaultValue: "OK" }),
                message: err.message,
            });
        } finally {
            setResuming(false);
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

    // Annual Leave requests use the backend balance (single source of truth)
    const isAnnualRequest =
        selectedEmployee?.leaveType === "Annual Leave";

    const selectedAnnualBalance =
        isAnnualRequest &&
        annualBalanceState.employeeId ===
            selectedEmployee.employeeID
            ? annualBalanceState.data
            : null;

    const annualBalanceLoading =
        isAnnualRequest && !selectedAnnualBalance;

    const selectedEmployeeApprovedDays = isAnnualRequest
        ? selectedAnnualBalance?.used ?? 0
        : selectedEmployeeLeaves
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

    const selectedEmployeeTotalLeave = isAnnualRequest
        ? selectedAnnualBalance?.accrued ?? 0
        : selectedEmployeeLeaves.find(
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

    const selectedEmployeeRemainingLeave = isAnnualRequest
        ? selectedAnnualBalance?.remaining ?? 0
        : backendBalance !== undefined
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
    // LEAVE TRACKER (company timezone)
    // =========================================================

    const selectedEmployeeTracker = selectedEmployee
        ? getTrackerState(
              selectedEmployee,
              getCompanyToday()
          )
        : null;

    // "Resumed on" defaults to today until HR picks a date for this leave
    const resumeDate =
        resumeDraft.id === selectedEmployee?.id
            ? resumeDraft.date
            : selectedEmployeeTracker?.today || "";

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
                            {t("menu.leaveManagement", { defaultValue: "Leave Management" })}
                        </h1>

                        <p>
                            {t("leaveManagement.subtitle", { defaultValue: "Manage employee leave requests" })}
                        </p>
                    </div>

                    <div className="leave-header-actions">
                        <button
                            type="button"
                            className="leave-policy-btn"
                            onClick={() => setIsPolicySetupOpen((open) => !open)}
                            aria-expanded={isPolicySetupOpen}
                        >
                            {t("leaveManagement.policy.title", { defaultValue: "Leave Policy Setup" })}
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
                                {t("employeesList.export.button", { defaultValue: "Export" })} <span aria-hidden="true">⌄</span>
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
                    <section className="leave-policy-panel" aria-label={t("leaveManagement.policy.title", { defaultValue: "Leave Policy Setup" })}>
                        <div className="leave-policy-heading">
                            <div>
                                <h2>{t("leaveManagement.policy.title", { defaultValue: "Leave Policy Setup" })}</h2>
                                <p>{t("leaveManagement.policy.description", { defaultValue: "Configure the annual leave allowance used for employee reviews." })}</p>
                            </div>
                            <button
                                type="button"
                                className="leave-policy-close"
                                onClick={() => setIsPolicySetupOpen(false)}
                                aria-label={t("leaveManagement.policy.close", { defaultValue: "Close leave policy setup" })}
                            >
                                ×
                            </button>
                        </div>
                        <div className="leave-policy-fields">
                            <label>
                                {t("leaveManagement.policy.annualEntitlement", { defaultValue: "Annual Leave Yearly Entitlement" })}
                                <input
                                    type="number"
                                    min="1"
                                    step="0.5"
                                    value={leavePolicy.annualYearlyEntitlementDays}
                                    disabled={policyLoading || policySaving}
                                    onChange={(event) => setLeavePolicy((current) => ({
                                        ...current,
                                        annualYearlyEntitlementDays: Math.max(0, Number(event.target.value)),
                                    }))}
                                />
                                <span>
                                    {t("leaveManagement.policy.perYearAccrues", { rate: (Number(leavePolicy.annualYearlyEntitlementDays || 0) / 12).toFixed(2), defaultValue: "days per year • accrues {{rate}} days/month" })}
                                </span>
                            </label>
                            <label>
                                {t("leaveManagement.policy.salaryBasis", { defaultValue: "Leave Accrual Salary Basis" })}
                                <select
                                    value={leavePolicy.leaveAccrualSalaryBasis}
                                    disabled={policyLoading || policySaving}
                                    onChange={(event) => setLeavePolicy((current) => ({
                                        ...current,
                                        leaveAccrualSalaryBasis: event.target.value,
                                    }))}
                                >
                                    <option value="total">{t("leaveManagement.policy.totalSalary", { defaultValue: "Total salary (basic + allowances)" })}</option>
                                    <option value="basic">{t("leaveManagement.policy.basicSalary", { defaultValue: "Basic salary" })}</option>
                                </select>
                                <span>{t("leaveManagement.policy.accrualFormula", { defaultValue: "amount accrued = salary ÷ 12 per month" })}</span>
                            </label>
                            {[
                                ["sickEligibleAfterMonths", t("leaveManagement.policy.sickEligibleAfter", { defaultValue: "Sick Leave Eligible After" }), t("leaveManagement.policy.unitMonths", { defaultValue: "months" }), "1"],
                                ["maternityDays", t("leaveManagement.policy.maternityDays", { defaultValue: "Maternity Leave Days" }), t("leaveManagement.policy.unitDays", { defaultValue: "days" }), "1"],
                                ["bereavementDays", t("leaveManagement.policy.bereavementDays", { defaultValue: "Bereavement Days" }), t("leaveManagement.policy.unitDays", { defaultValue: "days" }), "1"],
                                ["compensatoryOffValidityDays", t("leaveManagement.policy.compOffValidity", { defaultValue: "Comp Off Validity" }), t("leaveManagement.policy.unitDaysValidity", { defaultValue: "days validity" }), "1"],
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
                        <div className="leave-policy-grades">
                            <h3>{t("leaveManagement.policy.byGrade", { defaultValue: "Annual Leave Entitlement by Grade" })}</h3>
                            <p>{t("leaveManagement.policy.byGradeDescription", { defaultValue: "Overrides the yearly entitlement for employees in a grade. Other employees use the default above." })}</p>
                            {leavePolicy.annualGradeOverrides.map((row, index) => (
                                <div className="leave-policy-grade-row" key={index}>
                                    <input
                                        type="text"
                                        placeholder={t("leaveManagement.policy.gradePlaceholder", { defaultValue: "Grade (e.g. G5)" })}
                                        value={row.grade}
                                        disabled={policyLoading || policySaving}
                                        onChange={(event) => setLeavePolicy((current) => ({
                                            ...current,
                                            annualGradeOverrides: current.annualGradeOverrides.map((item, itemIndex) =>
                                                itemIndex === index ? { ...item, grade: event.target.value } : item
                                            ),
                                        }))}
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        step="0.5"
                                        value={row.days}
                                        disabled={policyLoading || policySaving}
                                        onChange={(event) => setLeavePolicy((current) => ({
                                            ...current,
                                            annualGradeOverrides: current.annualGradeOverrides.map((item, itemIndex) =>
                                                itemIndex === index ? { ...item, days: Math.max(0, Number(event.target.value)) } : item
                                            ),
                                        }))}
                                    />
                                    <span>{t("leaveManagement.policy.gradeRate", { rate: (Number(row.days || 0) / 12).toFixed(2), defaultValue: "days/year • {{rate}}/month" })}</span>
                                    <button
                                        type="button"
                                        aria-label={t("leaveManagement.policy.removeGrade", { grade: row.grade, defaultValue: "Remove grade {{grade}}" })}
                                        disabled={policyLoading || policySaving}
                                        onClick={() => setLeavePolicy((current) => ({
                                            ...current,
                                            annualGradeOverrides: current.annualGradeOverrides.filter((_, itemIndex) => itemIndex !== index),
                                        }))}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                className="leave-policy-add-grade"
                                disabled={policyLoading || policySaving}
                                onClick={() => setLeavePolicy((current) => ({
                                    ...current,
                                    annualGradeOverrides: [...current.annualGradeOverrides, { grade: "", days: 30 }],
                                }))}
                            >
                                {t("leaveManagement.policy.addGrade", { defaultValue: "+ Add grade" })}
                            </button>
                        </div>
                        <div className="leave-policy-types">
                            <h3>{t("leaveManagement.policy.availableTypes", { defaultValue: "Available Leave Types" })}</h3>
                            <div className="leave-policy-type-list">
                                {leavePolicy.leaveTypes.map((leaveType) => (
                                    <span key={leaveType}>{leaveTypeLabel(leaveType)}</span>
                                ))}
                            </div>
                        </div>
                        <div className="leave-holiday-calendar">
                            <h3>{t("leaveDetails.holidayCalendar", { defaultValue: "Qatar Holiday Calendar" })}</h3>
                            <div className="leave-holiday-list">
                                {leavePolicy.qatarHolidayCalendar.map((holiday) => (
                                    <div className="leave-holiday-row" key={holiday.name}>
                                        <strong>{holidayName(holiday.name)}</strong>
                                        <span>{holidayDate(holiday.date)}</span>
                                        <b>{t("leaveManagement.dayCount", { count: Number(holiday.days), defaultValue: `${holiday.days} ${holiday.days === 1 ? "day" : "days"}` })}</b>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="leave-policy-rules">
                            <p><Trans i18nKey="leaveManagement.policy.rules.sick" components={{ b: <strong /> }} defaults="<b>Sick Leave:</b> Medical certificate required. First 14 days at 100% salary, next 28 days at 50%, additional 42 days unpaid." /></p>
                            <p><Trans i18nKey="leaveManagement.policy.rules.maternity" components={{ b: <strong /> }} defaults="<b>Maternity Leave:</b> Full pay, HR approval, medical certificate required." /></p>
                            <p><Trans i18nKey="leaveManagement.policy.rules.bereavement" components={{ b: <strong /> }} defaults="<b>Bereavement:</b> Immediate family, manager approval." /></p>
                            <p><Trans i18nKey="leaveManagement.policy.rules.compensatory" components={{ b: <strong /> }} defaults="<b>Compensatory Off:</b> Public holiday or weekend work, manager approval." /></p>
                        </div>
                        <div className="leave-policy-footer">
                            {policyMessage && <span>{policyMessage}</span>}
                            <button type="button" onClick={saveLeavePolicy} disabled={policyLoading || policySaving}>
                                {policySaving
                                    ? t("profileEdit.saving", { defaultValue: "Saving..." })
                                    : t("leaveManagement.policy.save", { defaultValue: "Save Policy" })}
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
                            {t("leaveManagement.cards.totalRequests", { defaultValue: "Total Requests" })}
                        </h3>

                        <h2>
                            {
                                monthlySummary.total
                            }
                        </h2>

                        <p>
                            {selectedMonth ===
                            "all"
                                ? t("leaveManagement.cards.allRequests", { defaultValue: "All leave requests" })
                                : t("leaveManagement.cards.monthRequests", { month: selectedMonthLabel, defaultValue: "{{month}} requests" })}
                        </p>

                    </div>

                    {/* APPROVED */}

                    <div className="leave-card approved-card">

                        <h3>
                            {statusLabel("Approved")}
                        </h3>

                        <h2>
                            {
                                monthlySummary.approved
                            }
                        </h2>

                        <p>
                            {selectedMonth ===
                            "all"
                                ? t("leaveManagement.cards.approvedRequests", { defaultValue: "Approved requests" })
                                : t("leaveManagement.cards.monthApproved", { month: selectedMonthLabel, defaultValue: "{{month}} approved" })}
                        </p>

                    </div>

                    {/* REJECTED */}

                    <div className="leave-card rejected-card">

                        <h3>
                            {statusLabel("Rejected")}
                        </h3>

                        <h2>
                            {
                                monthlySummary.rejected
                            }
                        </h2>

                        <p>
                            {selectedMonth ===
                            "all"
                                ? t("leaveManagement.cards.rejectedRequests", { defaultValue: "Rejected requests" })
                                : t("leaveManagement.cards.monthRejected", { month: selectedMonthLabel, defaultValue: "{{month}} rejected" })}
                        </p>

                    </div>

                    {/* PENDING */}

                    <div className="leave-card pending-card">

                        <h3>
                            {statusLabel("Pending")}
                        </h3>

                        <h2>
                            {
                                monthlySummary.pending
                            }
                        </h2>

                        <p>
                            {selectedMonth ===
                            "all"
                                ? t("leaveManagement.cards.waitingApproval", { defaultValue: "Waiting for approval" })
                                : t("leaveManagement.cards.monthPending", { month: selectedMonthLabel, defaultValue: "{{month}} pending" })}
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
                                {t("leaveManagement.table.title", { defaultValue: "Leave Requests" })}
                            </h2>

                            <p>
                                {t("leaveManagement.table.hint", { defaultValue: "Click any employee row to review their leave balance and request." })}
                            </p>

                        </div>


                    </div>

                    {/* SEARCH + FILTERS */}
                    <div className="leave-tools leave-request-filters">
                        <input
                            type="text"
                            placeholder={t("hrAttendance.searchPlaceholder", { defaultValue: "Search employee..." })}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />

                        <div className="leave-tools-spacer" />

                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                        >
                            <option value="all">{t("hrAttendance.allStatus", { defaultValue: "All Status" })}</option>
                            <option value="Pending">{statusLabel("Pending")}</option>
                            <option value="Approved">{statusLabel("Approved")}</option>
                            <option value="Rejected">{statusLabel("Rejected")}</option>
                            <option value="Cancelled">{statusLabel("Cancelled")}</option>
                        </select>

                        <select
                            value={selectedLeaveType}
                            onChange={(e) => setSelectedLeaveType(e.target.value)}
                        >
                            <option value="all">{t("leaveManagement.allLeaveTypes", { defaultValue: "All Leave Types" })}</option>
                            {leaveTypes.map((type) => (
                                <option key={type} value={type}>{leaveTypeLabel(type)}</option>
                            ))}
                        </select>

                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                        >
                            {MONTHS.map((month) => (
                                <option key={month.value} value={month.value}>{monthLabel(month)}</option>
                            ))}
                        </select>

                        <RowsPerPage inline value={leavePager.pageSize} onChange={leavePager.setPageSize} />
                    </div>

                    {/* LOADING */}

                    {loading && (
                        <div className="leave-message">
                            {t("leaveManagement.table.loading", { defaultValue: "Loading leave requests..." })}
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
                                                {t("employeeSettings.employeeId", { defaultValue: "Employee ID" })}
                                            </th>

                                            <th>
                                                {t("hrAttendance.table.employeeName", { defaultValue: "Employee Name" })}
                                            </th>

                                            <th>
                                                {t("leaveDetails.leaveType", { defaultValue: "Leave Type" })}
                                            </th>

                                            <th>
                                                {t("leaveManagement.table.fromDate", { defaultValue: "From Date" })}
                                            </th>

                                            <th>
                                                {t("leaveManagement.table.toDate", { defaultValue: "To Date" })}
                                            </th>

                                            <th>
                                                {t("leaveDetails.days", { defaultValue: "Days" })}
                                            </th>

                                            <th>
                                                {t("leaveDetails.reason", { defaultValue: "Reason" })}
                                            </th>

                                            <th>
                                                {t("leaveDetails.statusHeader", { defaultValue: "Status" })}
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
                                                    {t("leaveManagement.table.empty", { defaultValue: "No leave requests found" })}
                                                </td>

                                            </tr>
                                        ) : (
                                            leavePager.pageItems.map(
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
                                                            <span dir="ltr">{leave.employeeID}</span>
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
                                                            {leaveTypeLabel(leave.leaveType)}
                                                        </td>

                                                        {/* FROM */}

                                                        <td>
                                                            <span dir="ltr" className="ltr-text">{leave.fromDate}</span>
                                                        </td>

                                                        {/* TO */}

                                                        <td>
                                                            <span dir="ltr" className="ltr-text">{leave.toDate}</span>
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
                                                                {statusLabel(leave.status)}
                                                            </span>
                                                            {leave.status?.toLowerCase() === "cancelled" && leave.cancelledBy && (
                                                                <small className="cancelled-by-label">
                                                                    <Trans
                                                                        i18nKey="leaveManagement.cancelledBy"
                                                                        values={{ id: leave.cancelledBy }}
                                                                        components={{ ltr: <bdi dir="ltr" /> }}
                                                                        defaults="Cancelled by <ltr>{{id}}</ltr>"
                                                                    />
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

                    {!loading && !error && (
                        <Pagination page={leavePager.page} pageCount={leavePager.pageCount} onChange={leavePager.setPage} />
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
                                        {t("leaveManagement.review.kicker", { defaultValue: "EMPLOYEE LEAVE REVIEW" })}
                                    </span>

                                    <h2>
                                        {
                                            selectedEmployee.employeeName
                                        }
                                    </h2>

                                    <p>
                                        <span dir="ltr">{selectedEmployee.employeeID}</span>
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
                                            {t("leaveManagement.review.balanceTitle", { defaultValue: "Leave Balance" })}
                                        </h3>

                                        <p>
                                            {isAnnualRequest
                                                ? selectedAnnualBalance
                                                    ? t("leaveManagement.review.annualAccrued", { rate: selectedAnnualBalance.monthlyAccrual, defaultValue: "Annual Leave accrued to date ({{rate}} days/month)." })
                                                    : t("leavePolicy.annualLoading", { defaultValue: "Loading Annual Leave balance..." })
                                                : t("leaveManagement.review.checkBalance", { defaultValue: "Check available balance before approving." })}
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
                                            {t("leaveManagement.review.total", { defaultValue: "Total" })}
                                        </span>

                                        <strong>
                                            {
                                                selectedEmployeeTotalLeave
                                            }
                                        </strong>

                                        <small>
                                            {t("leaveDetails.days", { defaultValue: "Days" })}
                                        </small>

                                    </div>

                                    {/* USED */}

                                    <div className="balance-card used">

                                        <span>
                                            {t("leaveManagement.review.used", { defaultValue: "Used" })}
                                        </span>

                                        <strong>
                                            {
                                                selectedEmployeeApprovedDays
                                            }
                                        </strong>

                                        <small>
                                            {t("leaveDetails.days", { defaultValue: "Days" })}
                                        </small>

                                    </div>

                                    {/* REMAINING */}

                                    <div className="balance-card remaining">

                                        <span>
                                            {t("leaveManagement.review.remaining", { defaultValue: "Remaining" })}
                                        </span>

                                        <strong>
                                            {
                                                selectedEmployeeRemainingLeave
                                            }
                                        </strong>

                                        <small>
                                            {t("leaveDetails.days", { defaultValue: "Days" })}
                                        </small>

                                    </div>

                                </div>

                                {/* USAGE */}

                                <div className="usage-area">

                                    <div className="usage-label">

                                        <span>
                                            {t("leaveManagement.review.usage", { defaultValue: "Leave usage" })}
                                        </span>

                                        <strong dir="ltr">
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
                                            {t("leaveManagement.review.requestTitle", { defaultValue: "Leave Request" })}
                                        </h3>

                                        <p>
                                            {t("leaveManagement.review.requestDescription", { defaultValue: "Details submitted by the employee." })}
                                        </p>

                                    </div>

                                    <span
                                        className={`request-status ${selectedEmployee.status?.toLowerCase()}`}
                                    >
                                        {statusLabel(selectedEmployee.status)}
                                    </span>

                                </div>

                                <div className="request-grid">

                                    {/* LEAVE TYPE */}

                                    <div className="request-detail">

                                        <span>
                                            {t("leaveManagement.review.leaveTypeLabel", { defaultValue: "LEAVE TYPE" })}
                                        </span>

                                        <strong>
                                            {leaveTypeLabel(selectedEmployee.leaveType)}
                                        </strong>

                                    </div>

                                    {/* REQUESTED DAYS */}

                                    <div className="request-detail">

                                        <span>
                                            {t("leaveManagement.review.requestedDaysLabel", { defaultValue: "REQUESTED DAYS" })}
                                        </span>

                                        <strong className="requested-days">
                                            {t("leaveManagement.dayCountTitle", { count: requestedDays, defaultValue: `${requestedDays} ${requestedDays === 1 ? "Day" : "Days"}` })}
                                        </strong>

                                    </div>

                                    {/* FROM */}

                                    <div className="request-detail">

                                        <span>
                                            {t("leaveManagement.review.fromDateLabel", { defaultValue: "FROM DATE" })}
                                        </span>

                                        <strong>
                                            <span dir="ltr">{selectedEmployee.fromDate}</span>
                                        </strong>

                                    </div>

                                    {/* TO */}

                                    <div className="request-detail">

                                        <span>
                                            {t("leaveManagement.review.toDateLabel", { defaultValue: "TO DATE" })}
                                        </span>

                                        <strong>
                                            <span dir="ltr">{selectedEmployee.toDate}</span>
                                        </strong>

                                    </div>

                                    {/* REASON */}

                                    <div className="request-detail full-width">

                                        <span>
                                            {t("leaveManagement.review.reasonLabel", { defaultValue: "REASON" })}
                                        </span>

                                        <strong>
                                            {
                                                selectedEmployee.reason
                                            }
                                        </strong>

                                    </div>

                                    {/* LEAVE TRACKER */}

                                    <LeaveTracker
                                        leave={
                                            selectedEmployee
                                        }
                                    />

                                    {selectedEmployeeTracker?.canMarkResumed && (
                                        <div className="leave-tracker-resume">

                                            <label htmlFor="resumed-on">
                                                {t("leaveManagement.review.resumedOn", { defaultValue: "Resumed on" })}
                                            </label>

                                            <input
                                                id="resumed-on"
                                                type="date"
                                                value={
                                                    resumeDate
                                                }
                                                min={addDays(
                                                    selectedEmployeeTracker.leaveEnd,
                                                    1
                                                )}
                                                max={
                                                    selectedEmployeeTracker.today
                                                }
                                                onChange={(e) =>
                                                    setResumeDraft({
                                                        id: selectedEmployee.id,
                                                        date: e.target.value,
                                                    })
                                                }
                                                disabled={
                                                    resuming
                                                }
                                            />

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleMarkResumed(
                                                        selectedEmployee.id
                                                    )
                                                }
                                                disabled={
                                                    resuming ||
                                                    !resumeDate
                                                }
                                            >
                                                {resuming
                                                    ? t("profileEdit.saving", { defaultValue: "Saving..." })
                                                    : t("leaveManagement.review.markResumed", { defaultValue: "Mark as resumed" })}
                                            </button>

                                        </div>
                                    )}

                                </div>

                            </div>

                            {/* =================================================
                                BALANCE CHECK
                            ================================================= */}

                            {selectedEmployee.status?.toLowerCase() ===
                                "pending" && !annualBalanceLoading && (
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
                                                ? t("leaveManagement.review.sufficient", { defaultValue: "Sufficient leave balance" })
                                                : t("leaveManagement.review.insufficient", { defaultValue: "Insufficient leave balance" })}

                                        </strong>

                                        <p>

                                            <Trans
                                                i18nKey="leaveManagement.review.balanceSentence"
                                                values={{
                                                    name: selectedEmployee.employeeName,
                                                    remaining: selectedEmployeeRemainingLeave,
                                                    requested: requestedDays,
                                                }}
                                                components={{ b: <b /> }}
                                                defaults="{{name}} has <b>{{remaining}} days</b> remaining and requested <b>{{requested}} days</b>."
                                            />

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
                                            {t("leaveManagement.review.historyTitle", { defaultValue: "Leave History" })}
                                        </h3>

                                        <p>
                                            {t("leaveManagement.review.historyDescription", { defaultValue: "Previous requests from this employee." })}
                                        </p>

                                    </div>

                                </div>

                                {selectedEmployeeLeaves.length ===
                                0 ? (
                                    <p className="empty-history">
                                        {t("leaveManagement.review.noHistory", { defaultValue: "No leave history found." })}
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
                                                        <span dir="ltr">
                                                            {
                                                                leave.fromDate
                                                            }{" "}
                                                            -{" "}
                                                            {
                                                                leave.toDate
                                                            }
                                                        </span>
                                                    </strong>

                                                    <span>
                                                        {leaveTypeLabel(leave.leaveType)}{" "}
                                                        •{" "}
                                                        {t("leaveManagement.dayCountTitle", { count: leave.days, defaultValue: `${leave.days} ${leave.days === 1 ? "Day" : "Days"}` })}
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
                                                    {statusLabel(leave.status)}
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
                                            ? t("leaveManagement.review.updating", { defaultValue: "Updating..." })
                                            : t("leaveManagement.review.reject", { defaultValue: "✕ Reject" })}
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
                                            annualBalanceLoading ||
                                            !hasSufficientBalance
                                        }
                                    >
                                        {updating
                                            ? t("leaveManagement.review.updating", { defaultValue: "Updating..." })
                                            : t("leaveManagement.review.approve", { defaultValue: "✓ Approve" })}
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