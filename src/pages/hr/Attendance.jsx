
import { useState, useEffect} from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Attendance.css"

function Attendance() {

    const [search, setSearch] = useState("");
    const [selectedDate, setSelectedDate] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("all");

    const [attendanceData, setAttendanceData] = useState([]);

useEffect(() => {
    fetchAttendance();
}, []);

const fetchAttendance = async () => {
    try {
        const response = await fetch(
            "https://hrms-cuoq.onrender.com/api/attendance"
        );

        const data = await response.json();

        const formattedData = data.map((item) => ({
            employeeID: item.employee_id,
            employeeName: item.employee_name,
            department: item.department,
            date: item.attendance_date,
            punchIn: item.punch_in || "-",
            punchOut: item.punch_out || "-",
            shiftStart: item.shift_start || "09:00",
            shiftEnd: item.shift_end || "18:00",
            break: item.break_minutes || 0,
            status: item.status,
            project: item.project || "-",
        }));

        setAttendanceData(formattedData);

    } catch (error) {
        console.error(
            "Error fetching attendance:",
            error
        );
    }
};

    const filteredAttendance = attendanceData.filter((employee) => {

        const matchesSearch =
            employee.employeeName
                .toLowerCase()
                .includes(search.toLowerCase()) ||
            employee.employeeID
                .toLowerCase()
                .includes(search.toLowerCase());

        const matchesStatus = 
                selectedStatus === "all" ||
            employee.status === selectedStatus;

    const employeeDate = employee.date
        ? new Date(employee.date).toLocaleDateString("en-CA", {
            timeZone: "Asia/Kolkata",
    })
  : "";

    const matchesData =
        selectedDate === "" ||
        employeeDate === selectedDate;
        
        return matchesSearch && matchesStatus && matchesData;
    });

        const calculateHours = (punchIn, punchOut, breakMinutes) => {
            if(punchIn === "-" || punchOut === "-") {
                return 0;
            }
            const [inHour, inMinute] = punchIn.split(":").map(Number);
            const [outHour, outMinute] = punchOut.split(":").map(Number);

            const start = inHour * 60 + inMinute;
            const end = outHour * 60 + outMinute;

            const totalMinutes = end - start - breakMinutes;

            return totalMinutes / 60;
        };

        const totalHoursToday = filteredAttendance.reduce(
            (total, employee) => 
                total + calculateHours
                    (employee.punchIn, 
                     employee.punchOut,
                    employee.break),
                    0
        );

        const formattedTotalHours = totalHoursToday.toFixed(1);
        

        const selectedDay = selectedDate
            ? new Date(selectedDate)
            : new Date();

        const weekStart = new Date(selectedDay);
            weekStart.setDate(selectedDay.getDate() - selectedDay.getDay());


        const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);

        const totalHoursWeek = attendanceData.reduce((total, employee) => {
        const employeeDate = new Date(employee.date);

         if (employeeDate >= weekStart && employeeDate <= weekEnd) {
            return total + calculateHours(
                    employee.punchIn, 
                    employee.punchOut,
                    employee.break
                );
            }

            return total;
        }, 0);

        const formattedTotalHoursWeek = totalHoursWeek.toFixed(1);

        const totalHoursMonth = attendanceData.reduce(
    (total, employee) => {
        const employeeDate = new Date(employee.date);
        const monthDate = selectedDay;

        if (
            employeeDate.getMonth() === monthDate.getMonth() &&
            employeeDate.getFullYear() === monthDate.getFullYear()
        ) {
            return total + calculateHours(
                employee.punchIn,
                employee.punchOut,
                employee.break
            );
        }

        return total;
    },
    0
);

const formattedTotalHoursMonth = totalHoursMonth.toFixed(1);

const totalOvertimeMonth = attendanceData.reduce(
    (total, employee) => {
        const employeeDate = new Date(employee.date);
        const monthDate = selectedDay;

        if (
            employeeDate.getMonth() === monthDate.getMonth() &&
            employeeDate.getFullYear() === monthDate.getFullYear()
        ) {
            const workedHours = calculateHours(
                employee.punchIn,
                employee.punchOut,
                employee.break
            );

            const overtime = Math.max(0, workedHours - 9);

            return total + overtime;
        }

        return total;
    },
    0
);

const formattedOvertimeMonth = totalOvertimeMonth.toFixed(1);

    return(
        <DashboardLayout>

        <div className="attendance-page">

            {/*Page Header*/}
            <div className="attendance-header">

                <div>
                    <h1>Attendance</h1>
                    <p>Manage Employee Attendance</p>
                </div>

            </div>

            {/*Attendance Tools*/}
            <div className="attendance-tools">
                <input
                    type="text"
                    placeholder="Search employee..."
                    className="attendance-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                <input
                    type="date"
                    className="attendance-date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                />


                <select 
                    className="attendance-status-filter"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    >
                    <option value="all">All Status</option>
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                    <option value="Late">Late</option>
                    <option value="On Leave">On Leave</option>
                </select>

            </div>


            {/*Attendance Summary*/}

            <div className="attendance-summary">

                {/*Card 1*/}

                <div className="attendance-card">
                    <h3>Total Working Hours</h3>
                    <h2>{formattedTotalHours} hrs</h2>
                    <p>Selected day's total</p>
                </div>

                <div className="attendance-card">
                    <h3>Total Hours Week</h3>
                    <h2>{formattedTotalHoursWeek} hrs</h2>
                    <p>Selected week's total</p>
                </div>

                <div className="attendance-card">
                    <h3>Total Hours Month</h3>
                    <h2>{formattedTotalHoursMonth} hrs</h2>
                    <p>This month's working hours</p>
                </div>

                <div className="attendance-card">
                    <h3>Overtime this Month</h3>
                    <h2>{formattedOvertimeMonth} hrs</h2>
                    <p>Selected month's overtime</p>
                </div>
            </div>
        
            <div className="attendance-table-container">

                <table className="attendance-table">

                    <thead>
                        <tr>
                            <th>Employee  ID</th>
                            <th>Employee Name</th>
                            <th>Department</th>
                            <th>Date</th>
                            <th>Punch In</th>
                            <th>Status</th>
                            <th>Punch Out</th>
                            <th>Break</th>
                            <th>Shift</th>
                            <th>Project</th>
                        </tr>
                    </thead>

                  <tbody>
                    {filteredAttendance.map((employee) => (

                        <tr key={employee.employeeID}>

                            <td>{employee.employeeID}</td>

                            <td>{employee.employeeName}</td>

                            <td>{employee.department}</td>

                            <td>
                                {new Date(employee.date).toLocaleDateString("en-GB", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric"
                                })}</td>

                            <td>{employee.punchIn}</td>

                            <td>
                                <span className={`status ${employee.status.toLowerCase().replace(" ", "-")}`}>
                                    {employee.status}
                                </span>
                            </td>

                            <td>{employee.punchOut}</td>

                            <td>{employee.break}</td>

                            <td>
                                {employee.shiftStart} - {employee.shiftEnd}
                            </td>

                            <td>{employee.project}</td>

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