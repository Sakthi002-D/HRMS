import { CalendarDays, Check, Clock3 } from "lucide-react";

function EmployeeAttendance({
    employee, greeting, liveTime, liveDate, todayHours, todayAttendance, weekHours, attendanceDays,
    monthHours, currentMonthAttendance, formatAttendanceTime, attendanceRows, setAttendanceRows,
    attendanceMonth, setAttendanceMonth, attendanceMonthOptions, attendanceYear, setAttendanceYear,
    attendanceYearOptions, attendanceSearch, setAttendanceSearch, attendanceStatus, setAttendanceStatus,
    filteredEmployeeAttendance, visibleEmployeeAttendance, formatProfileDate, attendancePage,
    attendancePageCount, setAttendancePage,
}) {
    return (
        <section className="employee-attendance-view">
            <div className="attendance-summary-grid">
                <article className="attendance-profile-card">
                    <div className="attendance-profile-top">
                        <div className="attendance-avatar">{employee.name?.charAt(0)?.toUpperCase()}</div>
                        <div className="attendance-profile-intro"><small>{`${greeting}, ${employee.name}`}</small><strong>{liveTime}</strong><span>{liveDate}</span></div>
                    </div>
                    <div className="attendance-profile-stats">
                        <div><small>Working Hours</small><strong>{todayHours.toFixed(2)} hrs</strong></div>
                        <div><small>Punch In</small><strong>{formatAttendanceTime(todayAttendance?.punch_in)}</strong></div>
                        <div><small>Punch Out</small><strong>{formatAttendanceTime(todayAttendance?.punch_out)}</strong></div>
                    </div>
                    <span className="attendance-profile-note">{todayAttendance ? "Attendance recorded today" : "No punch-in recorded today"}</span>
                </article>
                <article className="attendance-bright-card orange"><span><Clock3 size={17} /></span><strong>{todayHours.toFixed(2)} <em>/ 9</em></strong><small>Total Hours Today</small><b>{todayAttendance?.status || "Not recorded"}</b></article>
                <article className="attendance-bright-card green"><span><Check size={17} /></span><strong>{weekHours.toFixed(2)} <em>/ 40</em></strong><small>Total Hours This Week</small><b>{attendanceDays} attendance day(s)</b></article>
                <article className="attendance-bright-card blue"><span><CalendarDays size={17} /></span><strong>{monthHours.toFixed(2)} <em>/ {currentMonthAttendance.length * 9}</em></strong><small>Total Hours Month</small><b>{currentMonthAttendance.length} recorded day(s)</b></article>
            </div>
            <div className="employee-attendance-toolbar">
                <label>Rows per page <select value={attendanceRows} onChange={(event) => { setAttendanceRows(Number(event.target.value)); setAttendancePage(1); }}><option value="5">5</option><option value="10">10</option><option value="20">20</option></select></label>
                <div className="employee-attendance-filters">
                    <select value={attendanceMonth} onChange={(event) => { setAttendanceMonth(event.target.value); setAttendancePage(1); }} aria-label="Month Wise"><option value="all">Month</option>{attendanceMonthOptions.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}</select>
                    <select value={attendanceYear} onChange={(event) => { setAttendanceYear(event.target.value); setAttendancePage(1); }} aria-label="Year Wise"><option value="all">Year</option>{attendanceYearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select>
                    <input value={attendanceSearch} onChange={(event) => { setAttendanceSearch(event.target.value); setAttendancePage(1); }} placeholder="Search date or status..." />
                    <select value={attendanceStatus} onChange={(event) => { setAttendanceStatus(event.target.value); setAttendancePage(1); }}><option value="all">Select Status</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select>
                </div>
            </div>
            <div className="attendance-records-card">
                <table><thead><tr><th>Date</th><th>Check In</th><th>Status</th><th>Check Out</th><th>Late</th><th>Overtime</th><th>Production Hours</th></tr></thead>
                    <tbody>{visibleEmployeeAttendance.length > 0 ? visibleEmployeeAttendance.map((record) => {
                        const workingMinutes = Number(record.working_minutes || 0);
                        const overtimeMinutes = Math.max(0, workingMinutes - 540);
                        return <tr key={record.id || `${record.employee_id}-${record.attendance_date}`}>
                            <td>{formatProfileDate(record.attendance_date)}</td><td><span className="attendance-punch-in">{formatAttendanceTime(record.punch_in)}</span></td>
                            <td><span className={`attendance-status ${String(record.status || "").toLowerCase().replaceAll(" ", "-")}`}>{record.status || "Not recorded"}</span></td>
                            <td><span className="attendance-punch-out">{formatAttendanceTime(record.punch_out)}</span></td><td><span className="attendance-duration late-duration">{record.late_minutes ? `${record.late_minutes} min` : "-"}</span></td>
                            <td><span className="attendance-duration">{overtimeMinutes ? `${(overtimeMinutes / 60).toFixed(2)} hrs` : "-"}</span></td><td><span className={`production-hours ${workingMinutes >= 540 ? "good" : "low"}`}>{workingMinutes ? `${(workingMinutes / 60).toFixed(2)} hrs` : "0.00 hrs"}</span></td>
                        </tr>;
                    }) : <tr><td colSpan="7" className="attendance-empty">No attendance records found.</td></tr>}</tbody>
                </table>
            </div>
            <div className="employee-attendance-footer"><span>Showing {filteredEmployeeAttendance.length ? (attendancePage - 1) * attendanceRows + 1 : 0}-{Math.min(attendancePage * attendanceRows, filteredEmployeeAttendance.length)} of {filteredEmployeeAttendance.length} records</span><div><button type="button" disabled={attendancePage === 1} onClick={() => setAttendancePage((page) => page - 1)}>‹</button><b>{attendancePage}</b><button type="button" disabled={attendancePage >= attendancePageCount} onClick={() => setAttendancePage((page) => page + 1)}>›</button></div></div>
        </section>
    );
}

export default EmployeeAttendance;
