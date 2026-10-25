import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronDown, Clock3, Download, LogIn, LogOut, Plane, Search, UserCheck, UserX, Users } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import DatePicker from "../../components/layout/common/DatePicker";
import API_URL from "../../config/api";
import "./Attendance.css";
import "./AttendanceModern.css";

// Fixed messages the backend sends for Punch In / Punch Out → translation keys.
// Any other message is shown as the backend sent it.
const SERVER_MESSAGES = {
    "Employee ID is required": "employeeIdRequired",
    "Active employee not found": "employeeNotFound",
    "Employee has already punched in today": "alreadyPunchedIn",
    "Employee has not punched in today": "notPunchedIn",
    "Employee has already punched out today": "alreadyPunchedOut",
    "Failed to process Punch In": "punchInProcessFailed",
    "Failed to process Punch Out": "punchOutProcessFailed",
};

function Attendance() {
    const { t } = useTranslation();
    const serverMessage = (message) =>
        SERVER_MESSAGES[message]
            ? t(`hrAttendance.serverMessages.${SERVER_MESSAGES[message]}`, { defaultValue: message })
            : message;
    // Attendance status from the database ("Present", "On Leave") → shown label; the value itself stays English
    const statusLabel = (value) => {
        if (!value) return "";
        const key = String(value).trim().toLowerCase().replace(/\s+/g, "_");
        return t([`employeeAttendance.status.${key}`, `hrAttendance.status.${key}`], { defaultValue: String(value) });
    };
    const [search, setSearch] = useState("");
    const [selectedDate, setSelectedDate] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("all");

    const [attendanceData, setAttendanceData] = useState([]);
    const [d365Employees, setD365Employees] = useState([]);
    const [employeeOption, setEmployeeOption] = useState("");
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employeesLoading, setEmployeesLoading] = useState(true);
    const [employeesLoadError, setEmployeesLoadError] = useState(false);
    // "config" = backend D365 credentials are missing, so retrying cannot help.
    const [employeesErrorStage, setEmployeesErrorStage] = useState(null);
    const [employeeLoadAttempt, setEmployeeLoadAttempt] = useState(0);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const getEmployeeOptionLabel = (employee) =>
        `${employee.name} (${employee.personnelNumber}) - ${employee.employmentLegalEntityId} / ${employee.employmentId}`;

    const getPunchPayload = (employee) => ({
        personnelNumber: employee.personnelNumber,
        employmentLegalEntityId: employee.employmentLegalEntityId,
        employmentId: employee.employmentId,
    });

    useEffect(() => {
        const controller = new AbortController();
        let isCurrent = true;
        const timeoutId = window.setTimeout(() => controller.abort(), 65_000);

        const loadEmployees = async () => {
            setEmployeesLoading(true);
            setEmployeesLoadError(false);
            setEmployeesErrorStage(null);

            try {
                const response = await fetch(
                    `${API_URL}/api/d365/employees?view=attendance`,
                    { signal: controller.signal }
                );
                if (!response.ok) {
                    // The backend reports which stage failed (config / authentication /
                    // employees / server). A "config" failure means the D365 credentials
                    // are not set on the backend, so a client retry can never succeed.
                    let stage = "server";
                    try {
                        const payload = await response.json();
                        if (typeof payload?.stage === "string") stage = payload.stage;
                    } catch {
                        // Non-JSON error body (proxy/CDN HTML) — keep the generic stage.
                    }
                    const error = new Error(`Failed to fetch D365 employees: ${response.status}`);
                    error.stage = stage;
                    throw error;
                }

                const data = await response.json();
                if (!Array.isArray(data)) {
                    throw new Error("D365 employee response is not a list");
                }

                if (isCurrent) {
                    setD365Employees(data);
                }
            } catch (error) {
                console.error("Error loading D365 employees:", error);
                if (isCurrent) {
                    setD365Employees([]);
                    setEmployeesLoadError(true);
                    // Abort/timeout has no backend stage; keep it retryable.
                    setEmployeesErrorStage(error?.name === "AbortError" ? null : error?.stage ?? "server");
                }
            } finally {
                window.clearTimeout(timeoutId);
                if (isCurrent) {
                    setEmployeesLoading(false);
                }
            }
        };

        loadEmployees();

        return () => {
            isCurrent = false;
            window.clearTimeout(timeoutId);
            controller.abort();
        };
    }, [employeeLoadAttempt]);

    // =========================
    // FETCH ATTENDANCE
    // =========================

   
   useEffect(() => {
    fetchAttendance();
}, [selectedDate]);

const fetchAttendance = async () => {
    try {
        const response = await fetch(
            selectedDate
                ? `${API_URL}/api/attendance?date=${selectedDate}`
                : `${API_URL}/api/attendance`
        );

        if (!response.ok) {
            throw new Error("Failed to fetch attendance");
        }

        const data = await response.json();

        console.log("Attendance API data:", data);

        if (!Array.isArray(data)) {
            console.error("Attendance data is not an array:", data);
            setAttendanceData([]);
            return;
        }

        const formattedData = data.map((item) => {
            const workingMinutes = Number(item.working_minutes) || 0;
            const normalWorkingMinutes = item.normal_working_minutes == null
                ? Math.min(workingMinutes, 540)
                : Number(item.normal_working_minutes) || 0;
            const overtimeMinutes = item.overtime_minutes == null
                ? Math.max(0, workingMinutes - 540)
                : Number(item.overtime_minutes) || 0;

            return {
            employeeID: item.employee_id,
            employeeName: item.employee_name || "",
            department: item.department || "",
            date: item.attendance_date,
            punchIn: item.punch_in || "-",
            punchOut: item.punch_out || "-",
            status: item.status || "Present",
            workingMinutes,
            normalWorkingMinutes,
            overtimeMinutes,
            lateMinutes: Number(item.late_minutes) || 0,
            shift: item.shift || "09:00 - 18:00"
            };
        });

        console.log("Formatted attendance:", formattedData);

        setAttendanceData(formattedData);

    } catch (error) {
        console.error("Error fetching attendance:", error);
        setAttendanceData([]);
        setMessage(t("leaveDetails.noBackend", { defaultValue: "Unable to connect to backend" }));
    }
};


// =========================
// HANDLE PUNCH IN
// =========================

    const handlePunchIn = async () => {
        if (!selectedEmployee) {
            setMessage(t("hrAttendance.errors.employeeNotSelected", { defaultValue: "Please select an employee" }));
            return;
        }

        try {
            setLoading(true);
            setMessage("");

            const response = await fetch(
                `${API_URL}/api/attendance/punch-in`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(getPunchPayload(selectedEmployee)),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(serverMessage(data.message) || t("hrAttendance.messages.punchInFailed", { defaultValue: "Punch In failed" }));
                return;
            }

            setMessage(t("hrAttendance.messages.punchInSuccess", { defaultValue: "Punch In successful" }));
            await fetchAttendance();
        } catch (error) {
            console.error("Punch In error:", error);
            setMessage(t("leaveDetails.noBackend", { defaultValue: "Unable to connect to backend" }));
        } finally {
            setLoading(false);
        }
    };

    // =========================
    // HANDLE PUNCH OUT
    // =========================

    const handlePunchOut = async () => {
        if (!selectedEmployee) {
            setMessage(t("hrAttendance.errors.employeeNotSelected", { defaultValue: "Please select an employee" }));
            return;
        }

        try {
            setLoading(true);
            setMessage("");

            const response = await fetch(
               `${API_URL}/api/attendance/punch-out`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(getPunchPayload(selectedEmployee)),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(serverMessage(data.message) || t("hrAttendance.messages.punchOutFailed", { defaultValue: "Punch Out failed" }));
                return;
            }

            setMessage(t("hrAttendance.messages.punchOutSuccess", { defaultValue: "Punch Out successful" }));
            await fetchAttendance();
        } catch (error) {
            console.error("Punch Out error:", error);
            setMessage(t("leaveDetails.noBackend", { defaultValue: "Unable to connect to backend" }));
        } finally {
            setLoading(false);
        }
    };

    const formatWorkingHours = (minutes) => {
        if (!minutes || minutes <= 0) return "00:00:00";

        const totalSeconds = Math.round(Number(minutes) * 60);
        const hours = Math.floor(totalSeconds / 3600);
        const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [hours, remainingMinutes, seconds]
            .map((value) => String(value).padStart(2, "0"))
            .join(":");
    };

    const formatAttendanceTime = (time) => {
        if (!time || time === "-") {
            return "-";
        }

        const match = String(time).match(/^(\d{1,2}):(\d{2})/);
        if (!match) {
            return time;
        }

        const hours = Number(match[1]);
        const period = hours >= 12 ? "PM" : "AM";
        const displayHours = hours % 12 || 12;

        return `${String(displayHours).padStart(2, "0")}:${match[2]} ${period}`;
    };

    // =========================
    // FILTER ATTENDANCE
    // =========================

    const baseFilteredAttendance = attendanceData.filter((employee) => {
        const searchValue = search.toLowerCase();

        const matchesSearch =
            employee.employeeName
                .toLowerCase()
                .includes(searchValue) ||
            employee.employeeID
                .toLowerCase()
                .includes(searchValue);

        const employeeDate = employee.date
            ? new Date(employee.date).toLocaleDateString("en-CA", {
                  timeZone: "Asia/Kolkata",
              })
            : "";

        const matchesDate =
            selectedDate === "" ||
            employeeDate === selectedDate;

        return matchesSearch && matchesDate;
    });

    const filteredAttendance = baseFilteredAttendance.filter(
        (employee) => selectedStatus === "all" || employee.status === selectedStatus
    );

    const countByStatus = (status) =>
        baseFilteredAttendance.filter((employee) => employee.status === status).length;

    const summaryCards = [
        { key: "all", tone: "total", icon: Users, count: baseFilteredAttendance.length, label: t("hrAttendance.summary.total", { defaultValue: "Total Records" }) },
        { key: "Present", tone: "present", icon: UserCheck, count: countByStatus("Present"), label: statusLabel("Present") },
        { key: "Late", tone: "late", icon: Clock3, count: countByStatus("Late"), label: statusLabel("Late") },
        { key: "Absent", tone: "absent", icon: UserX, count: countByStatus("Absent"), label: statusLabel("Absent") },
        { key: "On Leave", tone: "leave", icon: Plane, count: countByStatus("On Leave"), label: statusLabel("On Leave") },
    ];

    const initialsOf = (name) =>
        String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");

    const clockTime = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    const clockDate = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    const todayIso = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const greeting = (() => {
        const hour = Number(now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).slice(0, 2));
        if (hour < 12) return t("hrAttendance.greeting.morning", { defaultValue: "Good Morning" });
        if (hour < 17) return t("hrAttendance.greeting.afternoon", { defaultValue: "Good Afternoon" });
        return t("hrAttendance.greeting.evening", { defaultValue: "Good Evening" });
    })();

    const selectedTodayRecord = selectedEmployee
        ? attendanceData.find((record) => {
            const recordDate = record.date
                ? new Date(record.date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
                : "";
            const id = String(record.employeeID || "").toUpperCase();
            const personnel = String(selectedEmployee.personnelNumber || "").toUpperCase();
            return recordDate === todayIso && (id === personnel || id === `EMP${personnel}`);
        })
        : null;

    const exportAttendance = (format) => {
        if (!filteredAttendance.length) {
            return;
        }

        const headers = [
            "Employee ID", "Employee Name", "Department", "Date", "Punch In",
            "Status", "Punch Out", "Shift", "Overtime", "Late", "Working Hours",
        ];
        const rows = filteredAttendance.map((employee) => [
            employee.employeeID,
            employee.employeeName,
            employee.department,
            employee.date,
            formatAttendanceTime(employee.punchIn),
            employee.status,
            formatAttendanceTime(employee.punchOut),
            employee.shift,
            employee.punchOut === "-" ? "-" : formatWorkingHours(employee.overtimeMinutes),
            formatWorkingHours(employee.lateMinutes),
            employee.punchOut === "-" ? "-" : formatWorkingHours(employee.workingMinutes),
        ]);
        const escapeValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
        const csv = [headers, ...rows]
            .map((row) => row.map(escapeValue).join(","))
            .join("\n");
        const content = format === "excel"
            ? `<table><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>${rows.map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join("")}</tr>`).join("")}</table>`
            : csv;
        const url = URL.createObjectURL(new Blob([content], {
            type: format === "excel" ? "application/vnd.ms-excel" : "text/csv;charset=utf-8;",
        }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `attendance.${format === "excel" ? "xls" : "csv"}`;
        link.click();
        URL.revokeObjectURL(url);
        setIsExportOpen(false);
    };

    // =========================
    // RETURN
    // =========================

    return (
        <DashboardLayout>
            <div className="attendance-page">

                {/* Page Header */}
                <div className="attendance-header">
                    <div className="attendance-header-text">
                        <h1>{t("menu.attendance", { defaultValue: "Attendance" })}</h1>
                        <p>
                            {t("hrAttendance.subtitle", { defaultValue: "Manage Employee Attendance" })}
                            <span
                                className="employee-source-badge"
                                title={t("employeesList.d365.sourceD365Title", { defaultValue: "Live from Dynamics 365 Finance & Operations" })}
                            >
                                <span className="employee-source-badge-dot" aria-hidden="true"></span>
                                {t("employeesList.d365.sourceD365Short", { defaultValue: "D365 · Finance & Operations" })}
                            </span>
                        </p>
                    </div>
                </div>

                {/* Punch In / Punch Out */}
                <div className="attendance-punch-section">
                <article className="attendance-clock-card" aria-live="off">
                    <span className="attendance-clock-greeting">{greeting}</span>
                    <strong className="attendance-clock-time" dir="ltr">{clockTime}</strong>
                    <span className="attendance-clock-date" dir="ltr">
                        <CalendarDays size={15} aria-hidden="true" /> {clockDate}
                    </span>
                    <span className="attendance-clock-shift" dir="ltr">
                        <Clock3 size={14} aria-hidden="true" /> {t("hrAttendance.clock.shift", { defaultValue: "Shift" })} 09:00 - 18:00
                    </span>
                </article>

                <div className="attendance-actions attendance-actions--premium">

                    <div className="attendance-punch-fields">
                        <label className="attendance-selector-label" htmlFor="attendance-employee-input">
                            {t("hrAttendance.selectorLabel", { defaultValue: "Employee" })}
                        </label>
                        <input
                            id="attendance-employee-input"
                            type="text"
                            className="employee-id-input"
                            list="attendance-d365-employees"
                            placeholder={employeesLoading ? t("hrAttendance.loadingEmployees", { defaultValue: "Loading employees..." }) : t("hrAttendance.searchEmployees", { defaultValue: "Search employees..." })}
                            aria-label={t("hrAttendance.searchEmployeeAria", { defaultValue: "Search or select an employee" })}
                            autoComplete="off"
                            disabled={employeesLoading || employeesLoadError || !d365Employees.length}
                            value={employeeOption}
                            onChange={(event) => {
                                const value = event.target.value;
                                setEmployeeOption(value);
                                setSelectedEmployee(
                                    d365Employees.find(
                                        (employee) => getEmployeeOptionLabel(employee) === value
                                    ) || null
                                );
                            }}
                        />
                        <datalist id="attendance-d365-employees">
                        {d365Employees.map((employee) => (
                            <option
                                key={`${employee.personnelNumber}-${employee.employmentLegalEntityId}-${employee.employmentId}`}
                                value={getEmployeeOptionLabel(employee)}
                            />
                        ))}
                    </datalist>

                    {selectedEmployee ? (
                        <div className="attendance-identity-card">
                            <span className="attendance-identity-avatar" aria-hidden="true">
                                {selectedEmployee.name?.charAt(0)?.toUpperCase()}
                            </span>
                            <div className="attendance-identity-info">
                                <span className="attendance-identity-name">{selectedEmployee.name}</span>
                                <div className="attendance-identity-meta">
                                    <span>
                                        <span className="attendance-identity-label">{t("hrAttendance.identity.personnelNumber", { defaultValue: "Personnel no." })}</span>
                                        <span className="attendance-identity-value" dir="ltr">{selectedEmployee.personnelNumber}</span>
                                    </span>
                                    <span>
                                        <span className="attendance-identity-label">{t("hrAttendance.identity.legalEntity", { defaultValue: "Legal entity" })}</span>
                                        <span className="attendance-identity-value" dir="ltr">{selectedEmployee.employmentLegalEntityId}</span>
                                    </span>
                                    <span>
                                        <span className="attendance-identity-label">{t("hrAttendance.identity.employmentId", { defaultValue: "Employment ID" })}</span>
                                        <span className="attendance-identity-value" dir="ltr">{selectedEmployee.employmentId}</span>
                                    </span>
                                </div>
                            </div>
                            <div className="attendance-identity-today">
                                <div>
                                    <small>{t("employeeAttendance.punchIn", { defaultValue: "Punch In" })}</small>
                                    <strong dir="ltr">{formatAttendanceTime(selectedTodayRecord?.punchIn)}</strong>
                                </div>
                                <div>
                                    <small>{t("employeeAttendance.punchOut", { defaultValue: "Punch Out" })}</small>
                                    <strong dir="ltr">{formatAttendanceTime(selectedTodayRecord?.punchOut)}</strong>
                                </div>
                                <div>
                                    <small>{t("employeeAttendance.table.status", { defaultValue: "Status" })}</small>
                                    <strong>{selectedTodayRecord ? statusLabel(selectedTodayRecord.status) : t("hrAttendance.notPunchedToday", { defaultValue: "Not punched today" })}</strong>
                                </div>
                            </div>
                        </div>
                    ) : !employeesLoadError && (
                        <div className="attendance-identity-placeholder">
                            <Users size={22} aria-hidden="true" />
                            <span>{t("hrAttendance.selectEmployeeHint", { defaultValue: "Select an employee to see their details and today's punch status." })}</span>
                        </div>
                    )}
                    {employeesLoadError && (
                        <span className="attendance-employee-load-error" role="alert">
                            {employeesErrorStage === "config"
                                ? t("hrAttendance.employeeLoadConfigError", {
                                    defaultValue:
                                        "Unable to load employees. The server is missing its D365 integration settings, so retrying will not help. Please contact the administrator.",
                                })
                                : t("hrAttendance.employeeLoadError", {
                                    defaultValue: "Unable to load employees. Please try again.",
                                })}
                            {employeesErrorStage !== "config" && (
                                <>
                                    {" "}
                                    <button
                                        type="button"
                                        onClick={() => setEmployeeLoadAttempt((attempt) => attempt + 1)}
                                    >
                                        {t("hrAttendance.retry", { defaultValue: "Retry" })}
                                    </button>
                                </>
                            )}
                        </span>
                    )}
                        {!employeesLoading && !employeesLoadError && d365Employees.length === 0 && (
                            <span className="attendance-employee-status">
                                {t("hrAttendance.noEmployees", { defaultValue: "No employees available." })}
                            </span>
                        )}
                    </div>

                    <div className="attendance-punch-buttons">
                        <button
                            className="punch-btn punch-in-btn"
                            onClick={handlePunchIn}
                            disabled={loading}
                        >
                            <LogIn size={18} aria-hidden="true" />
                            {loading
                            ? t("hrAttendance.processing", { defaultValue: "Processing..." })
                            : t("hrAttendance.punchInButton", { defaultValue: "Punch In" })}
                        </button>

                        <button
                            className="punch-btn punch-out-btn"
                            onClick={handlePunchOut}
                            disabled={loading}
                        >
                            <LogOut size={18} aria-hidden="true" />
                            {t("hrAttendance.punchOutButton", { defaultValue: "Punch Out" })}
                        </button>
                    </div>

                    {message && (
                        <p className="attendance-message" role="status">
                            {message}
                        </p>
                    )}
                </div>
                </div>

                {/* Summary */}
                <div className="attendance-stats">
                    {summaryCards.map(({ key, tone, icon: Icon, count, label }) => (
                        <button
                            type="button"
                            key={key}
                            className={`attendance-stat attendance-stat--${tone}${selectedStatus === key ? " is-active" : ""}`}
                            onClick={() => setSelectedStatus(key)}
                        >
                            <span className="attendance-stat-icon" aria-hidden="true"><Icon size={18} /></span>
                            <span className="attendance-stat-body">
                                <span className="attendance-stat-count">{count}</span>
                                <span className="attendance-stat-label">{label}</span>
                            </span>
                        </button>
                    ))}
                </div>

                <div className="attendance-list-heading">
                    <h2>{t("hrAttendance.listTitle", { defaultValue: "Punch In / Punch Out List" })}</h2>
                    <span>{filteredAttendance.length}</span>
                </div>

                {/* Attendance Tools */}
                <div className="attendance-tools">

                    <div className="attendance-search-wrap">
                        <Search size={16} aria-hidden="true" />
                        <input
                            type="text"
                            placeholder={t("hrAttendance.searchPlaceholder", { defaultValue: "Search employee..." })}
                            className="attendance-search"
                            value={search}
                            onChange={(e) =>
                                setSearch(e.target.value)
                            }
                        />
                    </div>

                    <div className="attendance-date">
                        <DatePicker value={selectedDate} onChange={setSelectedDate} />
                    </div>

                    <select
                        className="attendance-status-filter"
                        value={selectedStatus}
                        onChange={(e) =>
                            setSelectedStatus(e.target.value)
                        }
                    >
                        <option value="all">
                            {t("hrAttendance.allStatus", { defaultValue: "All Status" })}
                        </option>

                        <option value="Present">
                            {statusLabel("Present")}
                        </option>

                        <option value="Absent">
                            {statusLabel("Absent")}
                        </option>

                        <option value="Late">
                            {statusLabel("Late")}
                        </option>

                        <option value="On Leave">
                            {statusLabel("On Leave")}
                        </option>
                    </select>

                    <div className="attendance-export-menu">
                        <button
                            type="button"
                            className="attendance-export-btn"
                            onClick={() => setIsExportOpen((open) => !open)}
                            disabled={!filteredAttendance.length}
                            aria-expanded={isExportOpen}
                        >
                            <Download size={15} aria-hidden="true" />
                            {t("employeesList.export.button", { defaultValue: "Export" })}
                            <ChevronDown size={15} aria-hidden="true" />
                        </button>

                        {isExportOpen && (
                            <div className="attendance-export-options">
                                <button type="button" onClick={() => exportAttendance("excel")}>Excel</button>
                                <button type="button" onClick={() => exportAttendance("csv")}>CSV</button>
                            </div>
                        )}
                    </div>

                </div>

                {/* Attendance Table */}
                <div className="attendance-table-container">

                    <table className="attendance-table">

                        <thead>
                            <tr>
                                <th>{t("employeeSettings.employeeId", { defaultValue: "Employee ID" })}</th>
                                <th>{t("hrAttendance.table.employeeName", { defaultValue: "Employee Name" })}</th>
                                <th>{t("employeeAttendance.table.date", { defaultValue: "Date" })}</th>
                                <th>{t("employeeAttendance.punchIn", { defaultValue: "Punch In" })}</th>
                                <th>{t("employeeAttendance.table.status", { defaultValue: "Status" })}</th>
                                <th>{t("employeeAttendance.punchOut", { defaultValue: "Punch Out" })}</th>
                                <th>{t("employeeAttendance.table.overtime", { defaultValue: "Overtime" })}</th>
                                <th>{t("employeeAttendance.table.late", { defaultValue: "Late" })}</th>
                                <th>{t("employeeAttendance.workingHours", { defaultValue: "Working Hours" })}</th>
                            </tr>
                        </thead>

                        <tbody>

                            {filteredAttendance.map(
                                (employee, index) => (

                                <tr
                                    key={`${employee.employeeID}-${employee.date}-${index}`}
                                >

                                    {/* IDs, dates, times and hours keep their left-to-right order in Arabic (dir="ltr") */}
                                    <td>
                                        <span className="attendance-id-chip" dir="ltr">{employee.employeeID}</span>
                                    </td>

                                    <td>
                                        <div className="attendance-person">
                                            <span className="hr-att-avatar" aria-hidden="true">{initialsOf(employee.employeeName)}</span>
                                            <span className="attendance-person-name">{employee.employeeName}</span>
                                        </div>
                                    </td>

                                    <td>
                                        <span dir="ltr">
                                            {new Date(
                                                employee.date
                                            ).toLocaleDateString(
                                                "en-GB",
                                                {
                                                    day: "2-digit",
                                                    month: "short",
                                                    year: "numeric",
                                                }
                                            )}
                                        </span>
                                    </td>

                                    <td>
                                        <span className="punch-in-time" dir="ltr">
                                            {formatAttendanceTime(employee.punchIn)}
                                        </span>
                                    </td>

                                    <td>
                                        <span
                                            className={`status ${employee.status
                                                .toLowerCase()
                                                .replace(" ", "-")}`}
                                        >
                                            {statusLabel(employee.status)}
                                        </span>
                                    </td>

                                    <td>
                                        <span className="punch-out-time" dir="ltr">
                                            {formatAttendanceTime(employee.punchOut)}
                                        </span>
                                    </td>

                                    <td className="overtime-hours">
                                        <span dir="ltr">{employee.punchOut === "-" ? "-" : formatWorkingHours(employee.overtimeMinutes)}</span>
                                    </td>

                                    <td className="late-duration">
                                        <span dir="ltr">{formatWorkingHours(employee.lateMinutes)}</span>
                                    </td>

                                    <td className="working-hours total-working-hours">
                                        <span dir="ltr">{employee.punchOut === "-" ? "-" : formatWorkingHours(employee.workingMinutes)}</span>
                                    </td>

                                </tr>
                            ))}

                            {!filteredAttendance.length && (
                                <tr className="attendance-empty-row">
                                    <td colSpan={8}>
                                        <div className="hr-att-empty">
                                            <CalendarDays size={34} aria-hidden="true" />
                                            <strong>{t("hrAttendance.empty.title", { defaultValue: "No attendance records found" })}</strong>
                                            <span>{t("hrAttendance.empty.hint", { defaultValue: "Try a different date, status or search term." })}</span>
                                        </div>
                                    </td>
                                </tr>
                            )}

                        </tbody>

                    </table>

                </div>

            </div>
        </DashboardLayout>
    );
}

export default Attendance;