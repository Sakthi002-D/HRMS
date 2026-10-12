import { useTranslation } from "react-i18next";
import { CalendarDays, Check, Clock3 } from "lucide-react";

function EmployeeAttendance({
    employee, greeting, liveTime, liveDate, todayHours, todayAttendance, todayStatus, weekHours, attendanceDays,
    monthHours, currentMonthAttendance, formatAttendanceTime, attendanceStatusLabel, attendanceRows, setAttendanceRows,
    attendanceMonth, setAttendanceMonth, attendanceMonthOptions, attendanceYear, setAttendanceYear,
    attendanceYearOptions, attendanceSearch, setAttendanceSearch, attendanceStatus, setAttendanceStatus,
    filteredEmployeeAttendance, visibleEmployeeAttendance, formatProfileDate, attendancePage,
    attendancePageCount, setAttendancePage,
}) {
    const { t } = useTranslation();
    // "8.50 hrs" in English, "8.50 ساعة" in Arabic
    const hoursText = (value) => t("employeeAttendance.hoursValue", { value: Number(value || 0).toFixed(2), defaultValue: "{{value}} hrs" });
    const showingFrom = filteredEmployeeAttendance.length ? (attendancePage - 1) * attendanceRows + 1 : 0;
    const showingTo = Math.min(attendancePage * attendanceRows, filteredEmployeeAttendance.length);

    return (
        <section className="employee-attendance-view">
            <div className="attendance-summary-grid">
                <article className="attendance-profile-card">
                    <div className="attendance-profile-top">
                        <div className="attendance-avatar">{employee.name?.charAt(0)?.toUpperCase()}</div>
                        <div className="attendance-profile-intro">
                            <small>{t("employeeAttendance.greetingWithName", { greeting, name: employee.name, defaultValue: "{{greeting}}, {{name}}" })}</small>
                            <strong>{liveTime}</strong>
                            <span>{liveDate}</span>
                        </div>
                    </div>
                    <div className="attendance-profile-stats">
                        <div><small>{t("employeeAttendance.workingHours", { defaultValue: "Working Hours" })}</small><strong>{hoursText(todayHours)}</strong></div>
                        <div><small>{t("employeeAttendance.punchIn", { defaultValue: "Punch In" })}</small><strong>{formatAttendanceTime(todayAttendance?.punch_in)}</strong></div>
                        <div><small>{t("employeeAttendance.punchOut", { defaultValue: "Punch Out" })}</small><strong>{formatAttendanceTime(todayAttendance?.punch_out)}</strong></div>
                    </div>
                    <span className="attendance-profile-note">{todayAttendance ? t("employeeAttendance.recordedToday", { defaultValue: "Attendance recorded today" }) : attendanceStatusLabel(todayStatus)}</span>
                </article>
                <article className="attendance-bright-card orange">
                    <span><Clock3 size={17} /></span>
                    <strong>{todayHours.toFixed(2)} <em>/ 9</em></strong>
                    <small>{t("employeeAttendance.totalHoursToday", { defaultValue: "Total Hours Today" })}</small>
                    <b>{attendanceStatusLabel(todayStatus)}</b>
                </article>
                <article className="attendance-bright-card green">
                    <span><Check size={17} /></span>
                    <strong>{weekHours.toFixed(2)} <em>/ 40</em></strong>
                    <small>{t("employeeAttendance.totalHoursWeek", { defaultValue: "Total Hours This Week" })}</small>
                    <b>{t("employeeAttendance.attendanceDays", { count: attendanceDays, defaultValue: "{{count}} attendance day(s)" })}</b>
                </article>
                <article className="attendance-bright-card blue">
                    <span><CalendarDays size={17} /></span>
                    <strong>{monthHours.toFixed(2)} <em>/ {currentMonthAttendance.length * 9}</em></strong>
                    <small>{t("employeeAttendance.totalHoursMonth", { defaultValue: "Total Hours Month" })}</small>
                    <b>{t("employeeAttendance.recordedDays", { count: currentMonthAttendance.length, defaultValue: "{{count}} recorded day(s)" })}</b>
                </article>
            </div>
            <div className="employee-attendance-toolbar">
                <label>
                    {t("employeeAttendance.rowsPerPage", { defaultValue: "Rows per page" })}{" "}
                    <select value={attendanceRows} onChange={(event) => { setAttendanceRows(Number(event.target.value)); setAttendancePage(1); }}>
                        <option value="5">5</option><option value="10">10</option><option value="20">20</option>
                    </select>
                </label>
                <div className="employee-attendance-filters">
                    <select value={attendanceMonth} onChange={(event) => { setAttendanceMonth(event.target.value); setAttendancePage(1); }} aria-label={t("employeeAttendance.monthWise", { defaultValue: "Month Wise" })}>
                        <option value="all">{t("employeeAttendance.month", { defaultValue: "Month" })}</option>
                        {attendanceMonthOptions.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
                    </select>
                    <select value={attendanceYear} onChange={(event) => { setAttendanceYear(event.target.value); setAttendancePage(1); }} aria-label={t("employeeAttendance.yearWise", { defaultValue: "Year Wise" })}>
                        <option value="all">{t("employeeAttendance.year", { defaultValue: "Year" })}</option>
                        {attendanceYearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                    <input value={attendanceSearch} onChange={(event) => { setAttendanceSearch(event.target.value); setAttendancePage(1); }} placeholder={t("employeeAttendance.searchPlaceholder", { defaultValue: "Search date or status..." })} />
                    <select value={attendanceStatus} onChange={(event) => { setAttendanceStatus(event.target.value); setAttendancePage(1); }}>
                        <option value="all">{t("employeeAttendance.selectStatus", { defaultValue: "Select Status" })}</option>
                        <option value="present">{attendanceStatusLabel("Present")}</option>
                        <option value="late">{attendanceStatusLabel("Late")}</option>
                        <option value="absent">{attendanceStatusLabel("Absent")}</option>
                    </select>
                </div>
            </div>
            <div className="attendance-records-card">
                <table>
                    <thead>
                        <tr>
                            <th>{t("employeeAttendance.table.date", { defaultValue: "Date" })}</th>
                            <th>{t("employeeAttendance.table.checkIn", { defaultValue: "Check In" })}</th>
                            <th>{t("employeeAttendance.table.status", { defaultValue: "Status" })}</th>
                            <th>{t("employeeAttendance.table.checkOut", { defaultValue: "Check Out" })}</th>
                            <th>{t("employeeAttendance.table.late", { defaultValue: "Late" })}</th>
                            <th>{t("employeeAttendance.table.overtime", { defaultValue: "Overtime" })}</th>
                            <th>{t("employeeAttendance.table.productionHours", { defaultValue: "Production Hours" })}</th>
                        </tr>
                    </thead>
                    <tbody>{visibleEmployeeAttendance.length > 0 ? visibleEmployeeAttendance.map((record) => {
                        const workingMinutes = Number(record.working_minutes || 0);
                        const overtimeMinutes = Math.max(0, workingMinutes - 540);
                        return <tr key={record.id || `${record.employee_id}-${record.attendance_date}`}>
                            <td>{formatProfileDate(record.attendance_date)}</td>
                            <td><span className="attendance-punch-in">{formatAttendanceTime(record.punch_in)}</span></td>
                            <td><span className={`attendance-status ${String(record.status || "").toLowerCase().replaceAll(" ", "-")}`}>{attendanceStatusLabel(record.status)}</span></td>
                            <td><span className="attendance-punch-out">{formatAttendanceTime(record.punch_out)}</span></td>
                            <td><span className="attendance-duration late-duration">{record.late_minutes ? t("employeeAttendance.minutesValue", { value: record.late_minutes, defaultValue: "{{value}} min" }) : "-"}</span></td>
                            <td><span className="attendance-duration">{overtimeMinutes ? hoursText(overtimeMinutes / 60) : "-"}</span></td>
                            <td><span className={`production-hours ${workingMinutes >= 540 ? "good" : "low"}`}>{hoursText(workingMinutes / 60)}</span></td>
                        </tr>;
                    }) : <tr><td colSpan="7" className="attendance-empty">{t("employeeAttendance.noRecords", { defaultValue: "No attendance records found." })}</td></tr>}</tbody>
                </table>
            </div>
            <div className="employee-attendance-footer">
                <span>{t("employeeAttendance.showing", { from: showingFrom, to: showingTo, total: filteredEmployeeAttendance.length, defaultValue: "Showing {{from}}-{{to}} of {{total}} records" })}</span>
                <div>
                    <button type="button" disabled={attendancePage === 1} onClick={() => setAttendancePage((page) => page - 1)}>‹</button>
                    <b>{attendancePage}</b>
                    <button type="button" disabled={attendancePage >= attendancePageCount} onClick={() => setAttendancePage((page) => page + 1)}>›</button>
                </div>
            </div>
        </section>
    );
}

export default EmployeeAttendance;