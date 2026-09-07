import { useState, useEffect } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import DatePicker from "../../components/layout/common/DatePicker";
import "./Attendance.css";

const API_URL = "http://localhost:5000";

function Attendance() {
    const [search, setSearch] = useState("");
    const [selectedDate, setSelectedDate] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("all");

    const [attendanceData, setAttendanceData] = useState([]);
    const [employeeId, setEmployeeId] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);

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

        const formattedData = data.map((item) => ({
            employeeID: item.employee_id,
            employeeName: item.employee_name || "",
            department: item.department || "",
            date: item.attendance_date,
            punchIn: item.punch_in || "-",
            punchOut: item.punch_out || "-",
            status: item.status || "Present",
            workingMinutes: Number(item.working_minutes) || 0,
            lateMinutes: Number(item.late_minutes) || 0,
            shift: item.shift || "09:00 - 18:00",
            project: item.project || "-"
        }));

        console.log("Formatted attendance:", formattedData);

        setAttendanceData(formattedData);

    } catch (error) {
        console.error("Error fetching attendance:", error);
        setAttendanceData([]);
        setMessage("Unable to connect to backend");
    }
};


// =========================
// HANDLE PUNCH IN
// =========================

    const handlePunchIn = async () => {
        if (!employeeId.trim()) {
            setMessage("Please enter Employee ID");
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
                    body: JSON.stringify({
                        employee_id: employeeId.trim(),
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(data.message || "Punch In failed");
                return;
            }

            setMessage("Punch In successful");
            setEmployeeId("");

            await fetchAttendance();
        } catch (error) {
            console.error("Punch In error:", error);
            setMessage("Unable to connect to backend");
        } finally {
            setLoading(false);
        }
    };

    // =========================
    // HANDLE PUNCH OUT
    // =========================

    const handlePunchOut = async () => {
        if (!employeeId.trim()) {
            setMessage("Please enter Employee ID");
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
                    body: JSON.stringify({
                        employee_id: employeeId.trim(),
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(data.message || "Punch Out failed");
                return;
            }

            setMessage("Punch Out successful");
            setEmployeeId("");

            await fetchAttendance();
        } catch (error) {
            console.error("Punch Out error:", error);
            setMessage("Unable to connect to backend");
        } finally {
            setLoading(false);
        }
    };

    const formatWorkingHours = (minutes) => {
    if (!minutes || minutes <= 0) {
        return "0h 0m";
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours}h ${remainingMinutes}m`;
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

    const filteredAttendance = attendanceData.filter((employee) => {
        const searchValue = search.toLowerCase();

        const matchesSearch =
            employee.employeeName
                .toLowerCase()
                .includes(searchValue) ||
            employee.employeeID
                .toLowerCase()
                .includes(searchValue);

        const matchesStatus =
            selectedStatus === "all" ||
            employee.status === selectedStatus;

        const employeeDate = employee.date
            ? new Date(employee.date).toLocaleDateString("en-CA", {
                  timeZone: "Asia/Kolkata",
              })
            : "";

        const matchesDate =
            selectedDate === "" ||
            employeeDate === selectedDate;

        return (
            matchesSearch &&
            matchesStatus &&
            matchesDate
        );
    });

    const exportAttendance = (format) => {
        if (!filteredAttendance.length) {
            return;
        }

        const headers = [
            "Employee ID", "Employee Name", "Department", "Date", "Punch In",
            "Status", "Punch Out", "Working Hours", "Late", "Shift", "Project",
        ];
        const rows = filteredAttendance.map((employee) => [
            employee.employeeID,
            employee.employeeName,
            employee.department,
            employee.date,
            formatAttendanceTime(employee.punchIn),
            employee.status,
            formatAttendanceTime(employee.punchOut),
            employee.punchOut === "-" ? "-" : formatWorkingHours(employee.workingMinutes),
            employee.lateMinutes > 0 ? `${employee.lateMinutes} min` : "0 min",
            employee.shift,
            employee.project,
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
                    <div>
                        <h1>Attendance</h1>
                        <p>Manage Employee Attendance</p>
                    </div>
                </div>

                {/* Biometric Attendance */}
                <div className="attendance-actions">

                    <input
                        type="text"
                        className="employee-id-input"
                        placeholder="Enter Employee ID"
                        value={employeeId}
                        onChange={(e) =>
                            setEmployeeId(e.target.value)
                        }
                    />

                   <button 
                        className="punch-btn punch-in-btn"
                        onClick={handlePunchIn} 
                        disabled={loading} 
                    > 
                        {loading 
                        ? "Processing..." 
                        : "Punch In"} 
                    </button>

                    <button 
                        className="punch-btn punch-out-btn"
                        onClick={handlePunchOut} 
                        disabled={loading}
                    >
                            Punch Out
                    </button>

                        {message && (
                        <p className="attendance-message">
                            {message}
                        </p>
                    )}
                </div>

                {/* Attendance Tools */}
                <div className="attendance-tools">

                    <input
                        type="text"
                        placeholder="Search employee..."
                        className="attendance-search"
                        value={search}
                        onChange={(e) =>
                            setSearch(e.target.value)
                        }
                    />

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
                            All Status
                        </option>

                        <option value="Present">
                            Present
                        </option>

                        <option value="Absent">
                            Absent
                        </option>

                        <option value="Late">
                            Late
                        </option>

                        <option value="On Leave">
                            On Leave
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
                            Export <span aria-hidden="true">⌄</span>
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
                                <th>Employee ID</th>
                                <th>Employee Name</th>
                                <th>Department</th>
                                <th>Date</th>
                                <th>Punch In</th>
                                <th>Status</th>
                                <th>Punch Out</th>
                                <th>Working Hours</th>
                                <th>Late</th>
                                <th>Shift</th>
                                <th>Project</th>
                            </tr>
                        </thead>

                        <tbody>

                            {filteredAttendance.map(
                                (employee, index) => (

                                <tr
                                    key={`${employee.employeeID}-${employee.date}-${index}`}
                                >

                                    <td>
                                        {employee.employeeID}
                                    </td>

                                    <td>
                                        {employee.employeeName}
                                    </td>

                                    <td>
                                        {employee.department}
                                    </td>

                                    <td>
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
                                    </td>

                                    <td>
                                        <span className="punch-in-time">
                                            {formatAttendanceTime(employee.punchIn)}
                                        </span>
                                    </td>

                                    <td>
                                        <span
                                            className={`status ${employee.status
                                                .toLowerCase()
                                                .replace(" ", "-")}`}
                                        >
                                            {employee.status}
                                        </span>
                                    </td>

                                    <td>
                                        {formatAttendanceTime(employee.punchOut)}
                                    </td>

                                    <td className="working-hours">
                                        {employee.punchOut === "-"
                                        ? "-"
                                        : formatWorkingHours(employee.workingMinutes)}
                                    </td>

                                    <td>
                                        {employee.lateMinutes > 0
                                            ? `${employee.lateMinutes} min`
                                            : "0 min"}
                                    </td>

                                    <td>
                                        {employee.shift}
                                    </td>

                                    <td>
                                        {employee.project}
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

export default Attendance;