import { useTranslation } from "react-i18next";
import { Bell, CalendarCheck, CalendarDays, Clock3, LogIn, LogOut, Search, Timer, UserCheck, X } from "lucide-react";
import PeriodPicker from "./PeriodPicker";

const STATUS_TONES = { present: "green", "on time": "green", late: "amber", absent: "rose" };
const PILL_TONES = { green: "approved", amber: "pending", rose: "rejected" };

const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Present / Late / Absent counts and hours for a set of attendance rows
const summarize = (records) => records.reduce((summary, record) => {
    const tone = STATUS_TONES[String(record.status || "").trim().toLowerCase()];
    if (tone) summary[tone] += 1;
    if (record.punch_in) summary.worked += 1;
    summary.hours += Number(record.working_minutes || 0) / 60;
    return summary;
}, { green: 0, amber: 0, rose: 0, worked: 0, hours: 0 });

function EmployeeAttendance({
    employee, greeting, liveTime, liveDate, todayHours, todayAttendance, todayStatus, attendanceRecords,
    currentMonthAttendance, formatAttendanceTime, attendanceStatusLabel, attendanceRows, setAttendanceRows,
    attendanceMonth, setAttendanceMonth, attendanceMonthOptions, attendanceYear, setAttendanceYear,
    attendanceYearOptions, attendanceSearch, setAttendanceSearch, attendanceStatus, setAttendanceStatus,
    filteredEmployeeAttendance, visibleEmployeeAttendance, formatProfileDate, attendancePage,
    attendancePageCount, setAttendancePage, unreadNotifications, onOpenNotifications, dayTargetHours = 9, todayShift = null,
}) {
    const DAY_TARGET_HOURS = dayTargetHours;
    const { t } = useTranslation();
    // "8.50 hrs" in English, "8.50 ساعة" in Arabic
    const hoursText = (value) => t("employeeAttendance.hoursValue", { value: Number(value || 0).toFixed(2), defaultValue: "{{value}} hrs" });
    const showingFrom = filteredEmployeeAttendance.length ? (attendancePage - 1) * attendanceRows + 1 : 0;
    const showingTo = Math.min(attendancePage * attendanceRows, filteredEmployeeAttendance.length);

    // Last 7 days including today, by the record's own date
    const today = new Date();
    const weekStart = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6));
    const week = summarize(attendanceRecords.filter((record) => String(record.attendance_date || "").slice(0, 10) >= weekStart));
    const month = summarize(currentMonthAttendance);
    const todayProgress = Math.min((todayHours / DAY_TARGET_HOURS) * 100, 100);
    const todayTone = STATUS_TONES[String(todayStatus || "").trim().toLowerCase()];

    // Status tabs count the rows of the chosen month and year
    const periodRecords = attendanceRecords.filter((record) => {
        const day = String(record.attendance_date || "").slice(0, 10);
        return (attendanceMonth === "all" || day.slice(5, 7) === attendanceMonth)
            && (attendanceYear === "all" || day.slice(0, 4) === attendanceYear);
    });
    const periodCounts = summarize(periodRecords);
    const statusTabs = [
        { value: "all", label: t("employeeHero.allStatuses", { defaultValue: "All" }), count: periodRecords.length },
        { value: "present", tone: "green", label: attendanceStatusLabel("Present"), count: periodCounts.green },
        { value: "late", tone: "amber", label: attendanceStatusLabel("Late"), count: periodCounts.amber },
        { value: "absent", tone: "rose", label: attendanceStatusLabel("Absent"), count: periodCounts.rose },
    ];
    const filtersActive = attendanceMonth !== "all" || attendanceYear !== "all" || attendanceStatus !== "all" || attendanceSearch.trim() !== "";
    const resetPage = (setter) => (value) => { setter(value); setAttendancePage(1); };
    const clearFilters = () => {
        setAttendanceMonth("all");
        setAttendanceYear("all");
        setAttendanceStatus("all");
        setAttendanceSearch("");
        setAttendancePage(1);
    };

    const periodCard = (key, Icon, title, summary, sub) => {
        const parts = [
            { tone: "green", label: attendanceStatusLabel("Present"), value: summary.green },
            { tone: "amber", label: attendanceStatusLabel("Late"), value: summary.amber },
            { tone: "rose", label: attendanceStatusLabel("Absent"), value: summary.rose },
        ];
        return (
            <article className="edash-card" key={key}>
                <header className="edash-card-head">
                    <h2>{title}</h2>
                    <span className="edash-card-icon"><Icon size={16} /></span>
                </header>
                <div className="edash-card-value">
                    <strong>{hoursText(summary.hours)}</strong>
                    <span>{sub}</span>
                </div>
                <div className="edash-segbar" aria-hidden="true">
                    {parts.map((part) => part.value > 0 && <i key={part.tone} className={`edash-tone-${part.tone}`} style={{ flexGrow: part.value }} />)}
                </div>
                <div className="edash-mini">
                    {parts.map((part) => (
                        <div className="edash-mini-item" key={part.tone}>
                            <span className={`edash-mini-label edash-tone-${part.tone}`}>{part.label}</span>
                            <strong>{part.value}</strong>
                        </div>
                    ))}
                </div>
                <p className="edash-card-sub">
                    {t("employeeHero.avgPerDay", {
                        hours: summary.worked ? (summary.hours / summary.worked).toFixed(2) : "0.00",
                        defaultValue: "{{hours}} h average per worked day",
                    })}
                </p>
            </article>
        );
    };

    return (
        <section className="employee-attendance-view eatt">
            <header className="edash-hero">
                <div className="edash-hero-copy">
                    <span className="edash-hero-kicker">{t("employeeHero.kicker", { defaultValue: "Employee Portal" })}</span>
                    <h1>{t("employeeHeader.attendance.title", { defaultValue: "Employee Attendance" })}</h1>
                    <p>{t("employeeHeader.attendance.subtitle", { defaultValue: "Review your recent attendance records" })}</p>
                    <div className="edash-hero-chips">
                        <span><UserCheck size={14} aria-hidden="true" />{attendanceStatusLabel(todayStatus)}</span>
                        <span><Timer size={14} aria-hidden="true" />{t("employeeHero.weekTotal", { hours: week.hours.toFixed(2), defaultValue: "{{hours}} h this week" })}</span>
                        <span><CalendarCheck size={14} aria-hidden="true" />{t("employeeHero.daysAttendedMonth", { count: month.worked, defaultValue: "{{count}} days attended this month" })}</span>
                    </div>
                </div>
                <div className="edash-hero-side">
                    <button type="button" className="edash-hero-bell" onClick={onOpenNotifications} aria-label={t("employeeNotifications.openNotifications", { defaultValue: "Open notifications" })}>
                        <Bell size={22} />
                        {unreadNotifications > 0 && <span className="edash-hero-bell-count">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
                    </button>
                    <div className="edash-hero-clock">
                        <span>{greeting}, {employee.name?.split(" ")[0]}</span>
                        <strong>{liveTime}</strong>
                        <small><CalendarDays size={13} aria-hidden="true" />{liveDate}</small>
                    </div>
                </div>
            </header>

            <div className="edash-body">
                <section className="edash-overview">
                    <article className="edash-card">
                        <header className="edash-card-head">
                            <h2>{t("employeeHero.todayAttendance", { defaultValue: "Today's Attendance" })}</h2>
                            <span className="edash-card-icon"><Clock3 size={16} /></span>
                        </header>
                        <div className="edash-today">
                            <div className="edash-ring" role="img" aria-label={t("employeeHero.hoursToday", { hours: todayHours.toFixed(2), defaultValue: "{{hours}} h worked today" })}>
                                <svg viewBox="0 0 120 120">
                                    <circle className="edash-ring-track" cx="60" cy="60" r="50" />
                                    <circle className="edash-ring-fill" cx="60" cy="60" r="50" pathLength="100" strokeDasharray={`${todayProgress} 100`} />
                                </svg>
                                <div>
                                    <strong>{todayHours.toFixed(2)}</strong>
                                    <span>{t("employeeHero.ofTarget", { target: DAY_TARGET_HOURS, defaultValue: "of {{target}} h" })}</span>
                                </div>
                            </div>
                            <dl className="edash-today-list">
                                {todayShift && (
                                    <div><dt><Clock3 size={13} aria-hidden="true" /> {t("employeeHero.shift", { defaultValue: "Shift" })}</dt><dd dir="ltr">{todayShift.start_time} – {todayShift.end_time}</dd></div>
                                )}
                                <div><dt>{t("employeeHero.status", { defaultValue: "Status" })}</dt><dd><span className={`edash-pill edash-pill-${PILL_TONES[todayTone] || "muted"}`}>{attendanceStatusLabel(todayStatus)}</span></dd></div>
                                <div><dt><LogIn size={13} aria-hidden="true" /> {t("employeeHero.punchIn", { defaultValue: "Punch in" })}</dt><dd>{formatAttendanceTime(todayAttendance?.punch_in)}</dd></div>
                                <div><dt><LogOut size={13} aria-hidden="true" /> {t("employeeHero.punchOut", { defaultValue: "Punch out" })}</dt><dd>{formatAttendanceTime(todayAttendance?.punch_out)}</dd></div>
                            </dl>
                        </div>
                    </article>
                    {periodCard("week", Timer, t("employeeHero.weekHours", { defaultValue: "Working Hours – Last 7 Days" }), week,
                        t("employeeHero.daysWorked", { count: week.worked, defaultValue: "{{count}} days worked" }))}
                    {periodCard("month", CalendarDays, t("employeeHero.thisMonth", { defaultValue: "This Month" }), month,
                        t("employeeHero.daysWorked", { count: month.worked, defaultValue: "{{count}} days worked" }))}
                </section>

                <article className="edash-card eatt-records">
                    <header className="eatt-toolbar">
                        <div className="eatt-toolbar-row">
                            <h2>{t("employeeHero.attendanceRecords", { defaultValue: "Attendance Records" })}</h2>
                            <label className="eatt-search">
                                <Search size={16} aria-hidden="true" />
                                <input
                                    type="search"
                                    value={attendanceSearch}
                                    onChange={(event) => resetPage(setAttendanceSearch)(event.target.value)}
                                    placeholder={t("employeeAttendance.searchPlaceholder", { defaultValue: "Search date or status..." })}
                                    aria-label={t("employeeAttendance.searchPlaceholder", { defaultValue: "Search date or status..." })}
                                />
                            </label>
                        </div>
                        <div className="eatt-toolbar-row">
                            <div className="eatt-tabs" role="tablist" aria-label={t("employeeAttendance.selectStatus", { defaultValue: "Select Status" })}>
                                {statusTabs.map((tab) => (
                                    <button
                                        type="button"
                                        role="tab"
                                        key={tab.value}
                                        aria-selected={attendanceStatus === tab.value}
                                        className={`${attendanceStatus === tab.value ? "active" : ""}${tab.tone ? ` edash-tone-${tab.tone}` : ""}`}
                                        onClick={() => resetPage(setAttendanceStatus)(tab.value)}
                                    >
                                        {tab.label}
                                        <b>{tab.count}</b>
                                    </button>
                                ))}
                            </div>
                            <div className="eatt-period">
                                <PeriodPicker
                                    month={attendanceMonth}
                                    year={attendanceYear}
                                    monthOptions={attendanceMonthOptions}
                                    yearOptions={attendanceYearOptions}
                                    onChange={({ month, year }) => {
                                        if (month !== undefined) setAttendanceMonth(month);
                                        if (year !== undefined) setAttendanceYear(year);
                                        setAttendancePage(1);
                                    }}
                                />
                                {filtersActive && (
                                    <button type="button" className="eatt-clear" onClick={clearFilters}>
                                        <X size={14} aria-hidden="true" />
                                        {t("employeeHero.clearFilters", { defaultValue: "Clear filters" })}
                                    </button>
                                )}
                            </div>
                        </div>
                    </header>
                    <div className="eatt-table-wrap">
                        <table className="eatt-table">
                            <thead>
                                <tr>
                                    <th>{t("employeeAttendance.table.date", { defaultValue: "Date" })}</th>
                                    <th>{t("employeeAttendance.table.status", { defaultValue: "Status" })}</th>
                                    <th>{t("employeeAttendance.table.checkIn", { defaultValue: "Check In" })}</th>
                                    <th>{t("employeeAttendance.table.checkOut", { defaultValue: "Check Out" })}</th>
                                    <th>{t("employeeAttendance.table.productionHours", { defaultValue: "Production Hours" })}</th>
                                    <th>{t("employeeAttendance.table.overtime", { defaultValue: "Overtime" })}</th>
                                </tr>
                            </thead>
                            <tbody>{visibleEmployeeAttendance.length > 0 ? visibleEmployeeAttendance.map((record) => {
                                const workingMinutes = Number(record.working_minutes || 0);
                                // Overtime and the hours bar use the shift saved on that day's row
                                const targetMinutes = Number(record.shift_work_minutes || DAY_TARGET_HOURS * 60);
                                const overtimeMinutes = Math.max(0, workingMinutes - targetMinutes);
                                const tone = STATUS_TONES[String(record.status || "").trim().toLowerCase()];
                                return <tr key={record.id || `${record.employee_id}-${record.attendance_date}`}>
                                    <td>{formatProfileDate(record.attendance_date)}</td>
                                    <td><span className={`edash-pill edash-pill-${PILL_TONES[tone] || "muted"}`}>{attendanceStatusLabel(record.status)}</span></td>
                                    <td dir="ltr">{formatAttendanceTime(record.punch_in)}</td>
                                    <td dir="ltr">{formatAttendanceTime(record.punch_out)}</td>
                                    <td>
                                        <div className="eatt-hours">
                                            <span>{hoursText(workingMinutes / 60)}</span>
                                            <i aria-hidden="true"><b style={{ width: `${Math.min((workingMinutes / targetMinutes) * 100, 100)}%` }} /></i>
                                        </div>
                                    </td>
                                    <td>{overtimeMinutes ? hoursText(overtimeMinutes / 60) : "-"}</td>
                                </tr>;
                            }) : <tr><td colSpan="6" className="eatt-empty">{t("employeeAttendance.noRecords", { defaultValue: "No attendance records found." })}</td></tr>}</tbody>
                        </table>
                    </div>
                    <footer className="eatt-footer">
                        <label>
                            {t("employeeAttendance.rowsPerPage", { defaultValue: "Rows per page" })}
                            <select value={attendanceRows} onChange={(event) => { setAttendanceRows(Number(event.target.value)); setAttendancePage(1); }}>
                                <option value="5">5</option><option value="10">10</option><option value="20">20</option>
                            </select>
                        </label>
                        <span>{t("employeeAttendance.showing", { from: showingFrom, to: showingTo, total: filteredEmployeeAttendance.length, defaultValue: "Showing {{from}}-{{to}} of {{total}} records" })}</span>
                        <div className="eatt-pager">
                            <button type="button" disabled={attendancePage === 1} onClick={() => setAttendancePage((page) => page - 1)} aria-label={t("employeeHero.previousPage", { defaultValue: "Previous page" })}>‹</button>
                            <b>{attendancePage} / {attendancePageCount}</b>
                            <button type="button" disabled={attendancePage >= attendancePageCount} onClick={() => setAttendancePage((page) => page + 1)} aria-label={t("employeeHero.nextPage", { defaultValue: "Next page" })}>›</button>
                        </div>
                    </footer>
                </article>
            </div>
        </section>
    );
}

export default EmployeeAttendance;
