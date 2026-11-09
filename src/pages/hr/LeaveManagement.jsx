import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";

import DashboardLayout from "../../components/layout/DashboardLayout";
import LeaveTracker from "../../components/hr/LeaveTracker";
import {
    addDays,
    getCompanyTimeZone,
    getCompanyToday,
    getTrackerState,
} from "../../components/hr/leaveTrackerState";
import "./LeaveManagement.css";
import "./LeaveRefresh.css";
import { useAlert } from "../../components/common/dialog/dialogContext";
import { usePagination, RowsPerPage, Pagination } from "../../components/common/TablePagination";
import API_BASE_URL from "../../config/api";
import { formatAppDate } from "../../utils/appSettings";
import { exportTable } from "../../utils/tableExport";
import useGrades from "../../hooks/useGrades";
import ExportMenu from "../../components/common/ExportMenu";
import { ArrowLeft, CalendarDays, ChevronDown, CircleCheck, CircleX, Clock3, Inbox, Plane, Search, SlidersHorizontal, Users } from "lucide-react";

const API_URL = `${API_BASE_URL}/api/leaves`;
const POLICY_API_URL = API_URL.replace(/\/leaves$/, "/leave-policies");
const DEFAULT_LEAVE_TYPES = [
    "Annual Leave",
    "Casual Leave",
    "Sick Leave",
    "Paternity Leave",
    "Maternity Leave",
    "Hajj Leave",
    "Umrah Leave",
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
const DEFAULT_RWANDA_HOLIDAYS = [
    { name: "New Year's Day",           date: "1 January",               days: 1 },
    { name: "Heroes' Day",              date: "1 February",              days: 1 },
    { name: "International Women's Day",date: "8 March",                 days: 1 },
    { name: "Genocide Memorial Day",    date: "7 April",                 days: 1 },
    { name: "Good Friday",              date: "Islamic calendar",        days: 1 },
    { name: "Easter Monday",            date: "Islamic calendar",        days: 1 },
    { name: "Labour Day",               date: "1 May",                   days: 1 },
    { name: "Liberation Day",           date: "4 July",                  days: 1 },
    { name: "Umuganura Day",            date: "First Friday of August",  days: 1 },
    { name: "Assumption Day",           date: "15 August",               days: 1 },
    { name: "Christmas Day",            date: "25 December",             days: 1 },
    { name: "Boxing Day",               date: "26 December",             days: 1 },
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

// YYYY-MM the request was applied in (company timezone); falls back to its start date
const leaveMonthKey = (leave) => {
    const applied = new Date(leave.appliedAt);
    if (leave.appliedAt && !Number.isNaN(applied.getTime())) {
        return new Intl.DateTimeFormat("en-CA", { timeZone: getCompanyTimeZone(), year: "numeric", month: "2-digit" })
            .format(applied)
            .slice(0, 7);
    }
    return String(leave.fromDay || leave.fromDateRaw || "").slice(0, 7);
};

// Holiday names / dates come from the saved policy (English); shown translated when known
const holidayKey = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// Holiday editor: the date formats the backend leave-day count can resolve (services/leaveDayCount.js)
const HOLIDAY_MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const HOLIDAY_WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const HOLIDAY_ORDINALS = ["first", "second", "third", "fourth", "fifth", "last"];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isExactHolidayDate = (text) => {
    if (!ISO_DATE_PATTERN.test(text)) return false;
    const [year, month, day] = text.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

// True when the leave-day count can exclude this date: "2027-03-09", "18 December" or "Second Tuesday of February"
const isResolvableHolidayDate = (value) => {
    const text = String(value || "").trim();
    if (isExactHolidayDate(text)) return true;
    const dayMonth = text.match(/^(\d{1,2})\s+([A-Za-z]+)$/) || text.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
    if (dayMonth) {
        const [day, monthName] = /^\d/.test(dayMonth[1]) ? [dayMonth[1], dayMonth[2]] : [dayMonth[2], dayMonth[1]];
        const month = HOLIDAY_MONTH_NAMES.indexOf(monthName.toLowerCase());
        // 2028 is a leap year, so 29 February is accepted
        return month >= 0 && Number(day) >= 1 && Number(day) <= new Date(Date.UTC(2028, month + 1, 0)).getUTCDate();
    }
    const rule = text.match(/^(\w+)\s+(\w+)\s+of\s+(\w+)$/i);
    return Boolean(rule)
        && HOLIDAY_ORDINALS.includes(rule[1].toLowerCase())
        && HOLIDAY_WEEKDAY_NAMES.includes(rule[2].toLowerCase())
        && HOLIDAY_MONTH_NAMES.includes(rule[3].toLowerCase());
};

// Start dates (YYYY-MM-DD) of a holiday entry in `year`; same rules as backend services/leaveDayCount.js
const holidayStartsInYear = (dateText, year) => {
    const text = String(dateText || "").trim();
    if (isExactHolidayDate(text)) return text.startsWith(`${year}-`) ? [text] : [];
    const pad = (value) => String(value).padStart(2, "0");
    const dayMonth = text.match(/^(\d{1,2})\s+([A-Za-z]+)$/) || text.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
    if (dayMonth) {
        const [day, monthName] = /^\d/.test(dayMonth[1]) ? [dayMonth[1], dayMonth[2]] : [dayMonth[2], dayMonth[1]];
        const key = `${year}-${pad(HOLIDAY_MONTH_NAMES.indexOf(monthName.toLowerCase()) + 1)}-${pad(day)}`;
        return isExactHolidayDate(key) ? [key] : [];
    }
    const rule = text.match(/^(\w+)\s+(\w+)\s+of\s+(\w+)$/i);
    if (!rule) return [];
    const ordinal = HOLIDAY_ORDINALS.indexOf(rule[1].toLowerCase());
    const weekday = HOLIDAY_WEEKDAY_NAMES.indexOf(rule[2].toLowerCase());
    const month = HOLIDAY_MONTH_NAMES.indexOf(rule[3].toLowerCase());
    if (ordinal < 0 || weekday < 0 || month < 0) return [];
    const matches = [];
    for (let key = `${year}-${pad(month + 1)}-01`; key.startsWith(`${year}-${pad(month + 1)}`); key = addDays(key, 1)) {
        if (new Date(`${key}T00:00:00Z`).getUTCDay() === weekday) matches.push(key);
    }
    const pick = HOLIDAY_ORDINALS[ordinal] === "last" ? matches[matches.length - 1] : matches[ordinal];
    return pick ? [pick] : [];
};

// Map of YYYY-MM-DD → holiday name for every policy holiday day between fromKey and toKey
const holidayDatesBetween = (calendar, fromKey, toKey) => {
    const dates = new Map();
    if (!Array.isArray(calendar)) return dates;
    for (const holiday of calendar) {
        const span = Number.isInteger(Number(holiday?.days)) && Number(holiday.days) > 0 ? Number(holiday.days) : 1;
        for (let year = Number(fromKey.slice(0, 4)) - 1; year <= Number(toKey.slice(0, 4)); year++) {
            for (const start of holidayStartsInYear(holiday?.date, year)) {
                for (let offset = 0; offset < span; offset++) {
                    const key = addDays(start, offset);
                    if (key >= fromKey && key <= toKey && !dates.has(key)) dates.set(key, holiday.name);
                }
            }
        }
    }
    return dates;
};

const EID_DEFAULT_HOLIDAYS = [
    { name: "Eid al-Fitr", date: "2027-03-09", days: 3 },
    { name: "Eid al-Adha", date: "2027-06-16", days: 4 },
];

const compactName = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Fills in the 2027 Eid dates when the calendar has no exact date for that Eid:
// the "Islamic calendar" placeholder row is replaced, or the row is added.
const withEidDefaults = (holidays) => {
    let rows = holidays.map((holiday) => ({ ...holiday }));
    for (const eid of EID_DEFAULT_HOLIDAYS) {
        const matches = (holiday) => compactName(holiday.name).includes(compactName(eid.name));
        if (rows.some((holiday) => matches(holiday) && isExactHolidayDate(String(holiday.date || "").trim()))) continue;
        const placeholderIndex = rows.findIndex(matches);
        rows = placeholderIndex >= 0
            ? rows.map((holiday, index) => (index === placeholderIndex ? { ...eid } : holiday))
            : [...rows, { ...eid }];
    }
    return rows;
};

// Who's on leave: Approved and Pending leaves count as booked days
const isActiveLeave = (leave) => ["approved", "pending"].includes(String(leave.status || "").toLowerCase());

// fromKey / toKey are YYYY-MM-DD; leaves carry fromDay / toDay in the same format
const leaveOverlaps = (leave, fromKey, toKey) =>
    Boolean(leave.fromDay && leave.toDay) && leave.fromDay <= toKey && leave.toDay >= fromKey;

const countEmployees = (leaves) => new Set(leaves.map((leave) => leave.employeeID)).size;

// Table presentation: avatar initials, a stable avatar colour per name, a colour per leave type
const nameInitials = (name) => String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";

const avatarTone = (name) => [...String(name || "")].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;

const LEAVE_TYPE_TONES = {
    annual: "annual",
    sick: "sick",
    casual: "casual",
    maternity: "family",
    paternity: "family",
    emergency: "emergency",
    unpaid: "unpaid",
    hajj: "hajj",
    bereavement: "bereavement",
    compensatory: "comp",
};

const leaveTypeTone = (type) => LEAVE_TYPE_TONES[String(type || "").trim().split(/\s+/)[0].toLowerCase()] || "other";

// Calendar view: weeks start on Sunday; Friday and Saturday are the Qatar weekend
const CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CALENDAR_WEEKEND = new Set([5, 6]);

const shiftMonth = (monthKey, amount) => {
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1 + amount, 1)).toISOString().slice(0, 7);
};

// Every day shown for a month (YYYY-MM), padded to whole weeks
const buildCalendarDays = (monthKey) => {
    const first = `${monthKey}-01`;
    const startOffset = new Date(`${first}T00:00:00Z`).getUTCDay();
    const daysInMonth = new Date(Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0)).getUTCDate();
    const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    return Array.from({ length: cellCount }, (_, index) => {
        const key = addDays(first, index - startOffset);
        return { key, inMonth: key.startsWith(monthKey), weekday: index % 7 };
    });
};

// One Leave Policy step: the title row opens and closes it like a dropdown
function PolicySection({ id, step, title, summary, open, onToggle, actions, className = "", children }) {
    const bodyId = `leave-policy-${id}`;
    return (
        <div className={`leave-policy-section leave-policy-acc${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}>
            <div className="leave-policy-acc-head">
                <h3>
                    <button type="button" className="leave-policy-acc-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
                        {step && <span className="leave-policy-step" aria-hidden="true">{step}</span>}
                        <span className="leave-policy-acc-title">{title}</span>
                        {summary && <small className="leave-policy-acc-summary">{summary}</small>}
                        <ChevronDown size={18} className="leave-policy-acc-chevron" aria-hidden="true" />
                    </button>
                </h3>
                {open && actions}
            </div>
            {open && <div id={bodyId} className="leave-policy-acc-body">{children}</div>}
        </div>
    );
}

function LeaveManagement() {
    const { t } = useTranslation();
    // Grade leave days are kept in Settings → Grade Master; shown here grouped like the company bands
    const { grades: masterGrades } = useGrades();
    const gradeBands = useMemo(() => masterGrades.filter((grade) => grade.active !== false).reduce((bands, grade) => {
        const days = Number(grade.leave_days) > 0 ? Number(grade.leave_days) : null;
        const last = bands[bands.length - 1];
        if (last && last.days === days) last.to = grade.grade_code;
        else bands.push({ from: grade.grade_code, to: grade.grade_code, days });
        return bands;
    }, []), [masterGrades]);
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

    // The dashboard links here with ?status=Pending; that view covers every month
    const linkedStatus = ["Pending", "Approved", "Rejected", "Cancelled"].includes(searchParams.get("status"))
        ? searchParams.get("status")
        : null;

    const [selectedStatus, setSelectedStatus] =
        useState(linkedStatus || "all");

    const [selectedLeaveType, setSelectedLeaveType] =
        useState("all");

    // The list opens on the current month; a new month starts empty
    const currentMonth = getCompanyToday().slice(0, 7);

    const [selectedMonth, setSelectedMonth] =
        useState(linkedStatus ? "all" : currentMonth);

    // "Who's on leave": YYYY-MM-DD range; to may be empty (single day)
    const [dateRange, setDateRange] = useState({ from: "", to: "" });
    const [leaveView, setLeaveView] = useState("list");
    const [todayKey] = useState(() => getCompanyToday());
    const [calendarMonth, setCalendarMonth] = useState(() => getCompanyToday().slice(0, 7));
    const [calendarDay, setCalendarDay] = useState(null);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const filtersRef = useRef(null);

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
        rwandaHolidayCalendar: DEFAULT_RWANDA_HOLIDAYS,
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
    const [policySaveFailed, setPolicySaveFailed] = useState(false);
    const [newLeaveType, setNewLeaveType] = useState("");
    const [leaveTypeError, setLeaveTypeError] = useState("");
    // Qatar holiday editor rows while editing; null when the editor is closed
    const [holidayDraft, setHolidayDraft] = useState(null);
    const [holidayError, setHolidayError] = useState("");
    // Leave Policy steps that are open (each step works like a dropdown)
    const [openPolicySections, setOpenPolicySections] = useState([]);
    const togglePolicySection = (id) => setOpenPolicySections((current) => (
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
    const sectionProps = (id) => ({ id, open: openPolicySections.includes(id), onToggle: () => togglePolicySection(id) });

    // D365 Holiday Sync
    const [d365SyncCalendarId, setD365SyncCalendarId] = useState("");
    const [d365SyncYear, setD365SyncYear] = useState(new Date().getFullYear());
    const [d365SyncLoading, setD365SyncLoading] = useState(false);
    const [d365SyncMessage, setD365SyncMessage] = useState("");
    const [d365SyncFailed, setD365SyncFailed] = useState(false);

    // =========================================================
    // DATE FORMAT
    // =========================================================

    const formatDate = (date) => {
        if (!date) return "";

        const parsedDate = new Date(date);

        if (Number.isNaN(parsedDate.getTime())) {
            return date;
        }

        return formatAppDate(parsedDate);
    };

    // =========================================================
    // GET MONTH FROM DATE
    // =========================================================

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

                      department:
                          leave.department ?? "",

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
                rwandaHolidayCalendar: Array.isArray(policy.rwandaHolidayCalendar) && policy.rwandaHolidayCalendar.length
                    ? policy.rwandaHolidayCalendar
                    : DEFAULT_RWANDA_HOLIDAYS,
                annualYearlyEntitlementDays: policy.annualLeave?.yearly_entitlement_days ?? 30,
                annualGradeOverrides: Object.entries(policy.annualLeave?.grade_overrides || {})
                    .map(([grade, days]) => ({ grade, days: Number(days) })),
                leaveAccrualSalaryBasis: policy.leave_accrual_salary_basis === "basic" ? "basic" : "total",
                sickEligibleAfterMonths: policy.sickLeave?.eligibleAfterMonths ?? 3,
                sickDaysPerYear: policy.sickLeave?.yearlyDays ?? 14,
                casualDays: policy.casualLeave?.days ?? 2,
                maternityDays: policy.maternityLeave?.days ?? 50,
                paternityDays: policy.paternityLeave?.days ?? 3,
                bereavementDays: policy.bereavementLeave?.immediateFamilyDays ?? 14,
                umrahDays: policy.umrahLeave?.days ?? 7,
                hajjDays: policy.hajjLeave?.days ?? 14,
                compensatoryOffValidityDays: policy.compensatoryOff?.validityDays ?? 90,
            });
        } catch (error) {
            console.error("Error fetching leave policy:", error);
            setPolicyMessage(t("leaveManagement.policy.loadFailed", { defaultValue: "Unable to load saved policy" }));
        } finally {
            setPolicyLoading(false);
        }
    };

    // Saves the whole policy (PUT replaces it); `holidays` / `leaveTypes` override what is being saved.
    // Returns true when saved.
    const saveLeavePolicy = async ({
        holidays = leavePolicy.qatarHolidayCalendar,
        rwandaHolidays = leavePolicy.rwandaHolidayCalendar,
        leaveTypes = leavePolicy.leaveTypes,
    } = {}) => {
        try {
            setPolicySaving(true);
            setPolicyMessage("");
            setPolicySaveFailed(false);
            const response = await fetch(POLICY_API_URL, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    policy: {
                        leaveTypes,
                        qatarHolidayCalendar: holidays,
                        rwandaHolidayCalendar: rwandaHolidays,
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
                            yearlyDays: Number(leavePolicy.sickDaysPerYear),
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
                            pay: "Full Pay",
                            approval: "Manager",
                        },
                        paternityLeave: { days: Number(leavePolicy.paternityDays), pay: "Full Pay" },
                        casualLeave: { days: Number(leavePolicy.casualDays), pay: "Full Pay" },
                        umrahLeave: { days: Number(leavePolicy.umrahDays), pay: "Unpaid" },
                        hajjLeave: { days: Number(leavePolicy.hajjDays), pay: "Unpaid" },
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
            return true;
        } catch (error) {
            console.error("Error saving leave policy:", error);
            setPolicyMessage(t("leaveManagement.policy.saveFailed", { defaultValue: "Unable to save policy" }));
            setPolicySaveFailed(true);
            return false;
        } finally {
            setPolicySaving(false);
        }
    };

    // Leave types save straight away, so an added type never waits on Save Policy
    const saveLeaveTypes = async (leaveTypes) => {
        const saved = await saveLeavePolicy({ leaveTypes });
        if (saved) setLeavePolicy((current) => ({ ...current, leaveTypes }));
        return saved;
    };

    const addLeaveType = async (event) => {
        event.preventDefault();
        const name = newLeaveType.trim().replace(/\s+/g, " ");
        if (!name) return;
        if (leavePolicy.leaveTypes.some((type) => type.toLowerCase() === name.toLowerCase())) {
            setLeaveTypeError(t("leaveManagement.policy.duplicateType", { defaultValue: "This leave type already exists." }));
            return;
        }
        setLeaveTypeError("");
        if (await saveLeaveTypes([...leavePolicy.leaveTypes, name])) setNewLeaveType("");
    };

    const closePolicySetup = () => {
        setIsPolicySetupOpen(false);
        setPolicyMessage("");
    };

    const startHolidayEditing = () => {
        setHolidayError("");
        setHolidayDraft(withEidDefaults(leavePolicy.qatarHolidayCalendar));
    };

    const updateHolidayDraft = (index, field, value) => {
        setHolidayDraft((current) => current.map((holiday, holidayIndex) =>
            holidayIndex === index ? { ...holiday, [field]: value } : holiday
        ));
    };

    const saveHolidays = async () => {
        const holidays = holidayDraft.map((holiday) => ({
            name: String(holiday.name || "").trim(),
            date: String(holiday.date || "").trim(),
            days: Number(holiday.days),
        }));
        if (holidays.some((holiday) => !holiday.name || !holiday.date)) {
            setHolidayError(t("leaveManagement.holidayEditor.missingFields", { defaultValue: "Each holiday needs a name and a date." }));
            return;
        }
        if (holidays.some((holiday) => ISO_DATE_PATTERN.test(holiday.date) && !isExactHolidayDate(holiday.date))) {
            setHolidayError(t("leaveManagement.holidayEditor.invalidDate", { defaultValue: "One of the dates does not exist. Check the YYYY-MM-DD dates." }));
            return;
        }
        if (holidays.some((holiday) => !Number.isInteger(holiday.days) || holiday.days < 1 || holiday.days > 7)) {
            setHolidayError(t("leaveManagement.holidayEditor.invalidDays", { defaultValue: "Days must be a whole number from 1 to 7." }));
            return;
        }
        setHolidayError("");
        if (await saveLeavePolicy({ holidays })) {
            setLeavePolicy((current) => ({ ...current, qatarHolidayCalendar: holidays }));
            setHolidayDraft(null);
        }
    };

    // ── D365 Holiday Sync ──────────────────────────────────────
    const syncHolidaysFromD365 = async () => {
        setD365SyncLoading(true);
        setD365SyncMessage("");
        setD365SyncFailed(false);
        try {
            const res = await fetch("/api/sync/d365-holidays", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
                body: JSON.stringify({
                    calendarId: d365SyncCalendarId.trim() || undefined,
                    year: Number(d365SyncYear),
                    countryCalendar: "qatar",
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setD365SyncFailed(true);
                setD365SyncMessage(data.message || "D365 sync failed");
            } else {
                const count = data.synced ?? 0;
                setD365SyncMessage(
                    count > 0
                        ? `✓ Synced ${count} holiday${count !== 1 ? "s" : ""} from D365 for ${data.year}.`
                        : (data.message || "No holidays found in D365 for the given parameters.")
                );
                // Refresh the leave policy to show the new calendar entries
                await fetchLeavePolicy();
            }
        } catch {
            setD365SyncFailed(true);
            setD365SyncMessage("Network error — could not reach the server.");
        } finally {
            setD365SyncLoading(false);
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

    // A missing or earlier "to" date means a single day
    const dateRangeEnd = dateRange.to && dateRange.to >= dateRange.from ? dateRange.to : dateRange.from;

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
                Boolean(dateRange.from) ||
                leaveMonthKey(leave) === selectedMonth;

            // ON LEAVE DURING: Approved/Pending leaves covering the range,
            // unless a status is picked explicitly
            const matchesDateRange =
                !dateRange.from ||
                (leaveOverlaps(leave, dateRange.from, dateRangeEnd) &&
                    (selectedStatus !== "all" || isActiveLeave(leave)));

            return (
                matchesSearch &&
                matchesStatus &&
                matchesLeaveType &&
                matchesMonth &&
                matchesDateRange
            );
        });
    }, [
        leaveData,
        search,
        selectedStatus,
        selectedLeaveType,
        selectedMonth,
        dateRange.from,
        dateRangeEnd,
    ]);

    const dateRangeEmployees = useMemo(
        () => countEmployees(filteredLeaves),
        [filteredLeaves]
    );

    const applyDateRange = (from, to = "") => {
        setDateRange({ from, to });
        setLeaveView("list");
    };

    // Hero banner: who is off today and how many requests wait for HR (all months)
    const todayOverview = useMemo(() => ({
        onLeave: countEmployees(leaveData.filter((leave) => isActiveLeave(leave) && leaveOverlaps(leave, todayKey, todayKey))),
        pending: leaveData.filter((leave) => String(leave.status || "").toLowerCase() === "pending").length,
    }), [leaveData, todayKey]);

    // Calendar: Approved/Pending leaves matching the search and leave type filters
    const calendarLeaves = useMemo(() => {
        const searchValue = search.trim().toLowerCase();
        return leaveData.filter((leave) =>
            isActiveLeave(leave) &&
            (selectedLeaveType === "all" || leave.leaveType === selectedLeaveType) &&
            (!searchValue ||
                leave.employeeName?.toLowerCase().includes(searchValue) ||
                String(leave.employeeID).toLowerCase().includes(searchValue))
        );
    }, [leaveData, search, selectedLeaveType]);

    const calendarDays = useMemo(
        () => buildCalendarDays(calendarMonth).map((day) => {
            const leaves = calendarLeaves.filter((leave) => leaveOverlaps(leave, day.key, day.key));
            return { ...day, leaves, employees: countEmployees(leaves) };
        }),
        [calendarMonth, calendarLeaves]
    );

    const calendarDayLeaves = useMemo(
        () => (calendarDay ? calendarLeaves.filter((leave) => leaveOverlaps(leave, calendarDay, calendarDay)) : []),
        [calendarDay, calendarLeaves]
    );

    // Public holidays from the saved policy, for the days the calendar shows
    const calendarHolidays = useMemo(
        () => holidayDatesBetween(
            leavePolicy.qatarHolidayCalendar,
            calendarDays[0].key,
            calendarDays[calendarDays.length - 1].key
        ),
        [calendarDays, leavePolicy.qatarHolidayCalendar]
    );

    // Excel export of the leaves shown for the "On leave during" range
    useEffect(() => {
        if (!isFiltersOpen) return undefined;
        const closeOnOutsideClick = (event) => {
            if (!filtersRef.current?.contains(event.target)) setIsFiltersOpen(false);
        };
        const closeOnEscape = (event) => {
            if (event.key === "Escape") setIsFiltersOpen(false);
        };
        document.addEventListener("mousedown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [isFiltersOpen]);

    const activeFilterCount = [
        selectedStatus !== "all",
        selectedLeaveType !== "all",
        Boolean(dateRange.from),
    ].filter(Boolean).length;

    const clearFilters = () => {
        setSelectedStatus("all");
        setSelectedLeaveType("all");
        setSelectedMonth(currentMonth);
        setDateRange({ from: "", to: "" });
    };

    const exportOnLeave = (format) => {
        if (!dateRange.from || !filteredLeaves.length) return;
        const period = dateRangeEnd === dateRange.from ? dateRange.from : `${dateRange.from}-to-${dateRangeEnd}`;
        exportTable(format, {
            fileName: `on-leave-${period}`,
            title: `On Leave (${period.replace("-to-", " to ")})`,
            sheetName: "On leave",
            headers: ["Employee ID", "Employee Name", "Department", "Leave Type", "From Date", "To Date", "Days", "Status", "Reason"],
            rows: filteredLeaves.map((leave) => [
                String(leave.employeeID ?? ""),
                leave.employeeName,
                leave.department || "",
                leave.leaveType,
                leave.fromDate,
                leave.toDate,
                Number(leave.days) || 0,
                leave.status,
                leave.reason === "-" ? "" : leave.reason,
            ]),
        });
    };

    const calendarMonthLabel = new Date(`${calendarMonth}-01T00:00:00Z`)
        .toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

    // Review popup: other employees booked on any of the same days, same department first
    const overlappingOthers = useMemo(() => {
        if (!selectedEmployee?.fromDay || !selectedEmployee?.toDay) return [];
        return leaveData
            .filter((leave) =>
                leave.id !== selectedEmployee.id &&
                leave.employeeID !== selectedEmployee.employeeID &&
                isActiveLeave(leave) &&
                leaveOverlaps(leave, selectedEmployee.fromDay, selectedEmployee.toDay)
            )
            .map((leave) => ({
                ...leave,
                sameDepartment: Boolean(selectedEmployee.department) && leave.department === selectedEmployee.department,
            }))
            .sort((a, b) => Number(b.sameDepartment) - Number(a.sameDepartment) || a.fromDay.localeCompare(b.fromDay));
    }, [leaveData, selectedEmployee]);

    const sameDepartmentOverlaps = overlappingOthers.filter((leave) => leave.sameDepartment).length;
        // =========================================================
    // PAGINATION
    // =========================================================

    const leavePager = usePagination(filteredLeaves);
    const setLeavePage = leavePager.setPage;

    // Any search or filter change goes back to page 1
    useEffect(() => {
        setLeavePage(1);
    }, [search, selectedStatus, selectedLeaveType, selectedMonth, dateRange.from, dateRangeEnd, setLeavePage]);

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
                    leaveMonthKey(leave) === selectedMonth
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

    const monthKeyLabel = (key) => {
        const [year, month] = key.split("-");
        return `${monthLabel(MONTHS.find((option) => option.value === month))} ${year}`;
    };

    // Newest first: the current month plus every month with a request
    const monthOptions = useMemo(
        () => [...new Set([currentMonth, ...leaveData.map(leaveMonthKey)])]
            .filter((key) => /^\d{4}-\d{2}$/.test(key))
            .sort()
            .reverse(),
        [currentMonth, leaveData]
    );

    const selectedMonthLabel = selectedMonth === "all"
        ? t("leaveManagement.allMonths", { defaultValue: "All Months" })
        : monthKeyLabel(selectedMonth);

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

    const reviewViewRef = useRef(null);
    const reviewedLeaveId = selectedEmployee?.id;

    useEffect(() => {
        if (reviewedLeaveId) reviewViewRef.current?.scrollIntoView({ block: "start" });
    }, [reviewedLeaveId]);

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

        exportTable(format, { fileName: "leave-requests", title: "Leave Requests", headers, rows });
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

            <div className={`leave-page lm-v2${selectedEmployee ? " is-reviewing" : ""}`}>

                {/* =================================================
                    HEADER
                ================================================= */}

                <header className="lm-hero">
                <div className="leave-header leave-hero">

                    <div className="leave-hero-main">
                        <span className="leave-hero-eyebrow">
                            <Plane size={14} aria-hidden="true" />
                            {t("leaveManagement.hero.eyebrow", { defaultValue: "Time off" })}
                        </span>

                        <h1>
                            {t("menu.leaveManagement", { defaultValue: "Leave Management" })}
                        </h1>

                        <div className="leave-hero-subtitle">
                            {t("leaveManagement.subtitle", { defaultValue: "Manage employee leave requests" })}
                        </div>

                        <div className="leave-hero-chips">
                            <span className="leave-hero-chip">
                                <span className="leave-hero-chip-dot date" aria-hidden="true" />
                                {formatAppDate(todayKey)}
                            </span>
                            <button
                                type="button"
                                className="leave-hero-chip"
                                onClick={() => applyDateRange(todayKey)}
                                title={t("leaveManagement.hero.onLeaveTodayHint", { defaultValue: "Show who is on leave today" })}
                            >
                                <span className="leave-hero-chip-dot leave" aria-hidden="true" />
                                {t("leaveManagement.hero.onLeaveToday", { count: todayOverview.onLeave, defaultValue: "{{count}} on leave today" })}
                            </button>
                            <button
                                type="button"
                                className="leave-hero-chip"
                                onClick={() => { setSelectedStatus("Pending"); setSelectedMonth("all"); setLeaveView("list"); }}
                                title={t("leaveManagement.hero.pendingHint", { defaultValue: "Show pending requests" })}
                            >
                                <span className="leave-hero-chip-dot pending" aria-hidden="true" />
                                {t("leaveManagement.hero.pending", { count: todayOverview.pending, defaultValue: "{{count}} awaiting review" })}
                            </button>
                        </div>
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
                                        {t("export.excel", { defaultValue: "Excel" })}
                                    </button>
                                    <button type="button" onClick={() => exportLeaves("pdf")} role="menuitem">
                                        {t("export.pdf", { defaultValue: "PDF" })}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* =================================================
                    MONTHLY SUMMARY
                ================================================= */}

                <div className="leave-summary">

                    {/* TOTAL REQUESTS */}

                    <div className="leave-card total-request-card">
                        <span className="leave-card-icon" aria-hidden="true"><Users size={18} /></span>
                        <div className="leave-card-body">
                            <h3>
                                {t("leaveManagement.cards.totalRequests", { defaultValue: "Total Requests" })}
                            </h3>
                            <h2>{monthlySummary.total}</h2>
                            <p>
                                {selectedMonth === "all"
                                    ? t("leaveManagement.cards.allRequests", { defaultValue: "All leave requests" })
                                    : t("leaveManagement.cards.monthRequests", { month: selectedMonthLabel, defaultValue: "{{month}} requests" })}
                            </p>
                        </div>
                    </div>

                    {/* APPROVED / REJECTED / PENDING: count + share of all requests */}

                    {[
                        {
                            key: "approved",
                            className: "approved-card",
                            icon: <CircleCheck size={18} />,
                            value: monthlySummary.approved,
                            caption: selectedMonth === "all"
                                ? t("leaveManagement.cards.approvedRequests", { defaultValue: "Approved requests" })
                                : t("leaveManagement.cards.monthApproved", { month: selectedMonthLabel, defaultValue: "{{month}} approved" }),
                        },
                        {
                            key: "rejected",
                            className: "rejected-card",
                            icon: <CircleX size={18} />,
                            value: monthlySummary.rejected,
                            caption: selectedMonth === "all"
                                ? t("leaveManagement.cards.rejectedRequests", { defaultValue: "Rejected requests" })
                                : t("leaveManagement.cards.monthRejected", { month: selectedMonthLabel, defaultValue: "{{month}} rejected" }),
                        },
                        {
                            key: "pending",
                            className: "pending-card",
                            icon: <Clock3 size={18} />,
                            value: monthlySummary.pending,
                            caption: selectedMonth === "all"
                                ? t("leaveManagement.cards.waitingApproval", { defaultValue: "Waiting for approval" })
                                : t("leaveManagement.cards.monthPending", { month: selectedMonthLabel, defaultValue: "{{month}} pending" }),
                        },
                    ].map((card) => {
                        const share = monthlySummary.total ? Math.round((card.value / monthlySummary.total) * 100) : 0;
                        return (
                            <div key={card.key} className={`leave-card ${card.className}`}>
                                <span className="leave-card-icon" aria-hidden="true">{card.icon}</span>
                                <div className="leave-card-body">
                                    <h3>{statusLabel(card.key.charAt(0).toUpperCase() + card.key.slice(1))}</h3>
                                    <h2>{card.value}</h2>
                                    <p>{card.caption} · {share}%</p>
                                </div>
                                <span className="leave-card-meter" aria-hidden="true">
                                    <i style={{ width: `${share}%` }} />
                                </span>
                            </div>
                        );
                    })}

                </div>
                </header>

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
                                onClick={closePolicySetup}
                                aria-label={t("leaveManagement.policy.close", { defaultValue: "Close leave policy setup" })}
                            >
                                ×
                            </button>
                        </div>
                        <div className="leave-policy-body">
                        <PolicySection
                            {...sectionProps("types")}
                            className="leave-policy-types"
                            step="1"
                            title={t("leaveManagement.policy.availableTypes", { defaultValue: "Available Leave Types" })}
                            summary={t("leaveManagement.policy.typesSummary", { count: leavePolicy.leaveTypes.length, defaultValue: "{{count}} types" })}
                        >
                            <p className="leave-policy-section-note">{t("leaveManagement.policy.typesNote", { defaultValue: "Types you add here appear in the employee Apply Leave form straight away. They have no fixed day limit; HR reviews each request." })}</p>
                            <div className="leave-policy-type-list">
                                {leavePolicy.leaveTypes.map((leaveType) => {
                                    const isCustom = !DEFAULT_LEAVE_TYPES.includes(leaveType);
                                    return (
                                        <span key={leaveType} className={isCustom ? "is-custom" : ""}>
                                            {leaveTypeLabel(leaveType)}
                                            {isCustom && (
                                                <button
                                                    type="button"
                                                    aria-label={t("leaveManagement.policy.removeType", { type: leaveType, defaultValue: "Remove leave type {{type}}" })}
                                                    disabled={policyLoading || policySaving}
                                                    onClick={() => saveLeaveTypes(leavePolicy.leaveTypes.filter((type) => type !== leaveType))}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </span>
                                    );
                                })}
                            </div>
                            <form className="leave-policy-add-type" onSubmit={addLeaveType}>
                                <input
                                    type="text"
                                    maxLength={40}
                                    aria-label={t("leaveManagement.policy.newType", { defaultValue: "New leave type" })}
                                    placeholder={t("leaveManagement.policy.newTypePlaceholder", { defaultValue: "New leave type (e.g. Study Leave)" })}
                                    value={newLeaveType}
                                    disabled={policyLoading || policySaving}
                                    onChange={(event) => {
                                        setNewLeaveType(event.target.value);
                                        setLeaveTypeError("");
                                    }}
                                />
                                <button type="submit" disabled={policyLoading || policySaving || !newLeaveType.trim()}>
                                    {t("leaveManagement.policy.addType", { defaultValue: "+ Add leave type" })}
                                </button>
                            </form>
                            {leaveTypeError && <p className="leave-holiday-error" role="alert">{leaveTypeError}</p>}
                        </PolicySection>
                        <PolicySection
                            {...sectionProps("annual")}
                            step="2"
                            title={leaveTypeLabel("Annual Leave")}
                            summary={t("leaveManagement.policy.annualSummary", { count: Number(leavePolicy.annualYearlyEntitlementDays) || 0, defaultValue: "{{count}} days/year by default · by grade" })}
                        >
                            <div className="leave-policy-fields annual">
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
                            </div>
                        <div className="leave-policy-grades">
                            <h4>{t("leaveManagement.policy.byGrade", { defaultValue: "Annual Leave Entitlement by Grade" })}</h4>
                            <p>{t("leaveManagement.policy.byGradeMaster", { defaultValue: "Set in Settings → Grade Master. Employees without a grade use the default above." })}</p>
                            {gradeBands.length > 0 && (
                                <table className="leave-grade-bands">
                                    <thead>
                                        <tr>
                                            <th>{t("leaveManagement.policy.gradeBand", { defaultValue: "Grades" })}</th>
                                            <th>{t("leaveManagement.policy.gradeDays", { defaultValue: "Annual Leave days" })}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {gradeBands.map((band) => (
                                            <tr key={band.from}>
                                                <td dir="ltr">{band.from === band.to ? band.from : `${band.from} – ${band.to}`}</td>
                                                <td>{band.days ?? <span aria-label={t("leaveManagement.policy.defaultDays", { defaultValue: "Default" })}>-</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            <Link className="leave-policy-add-grade leave-policy-grade-link" to="/settings/grade-master">
                                {t("leaveManagement.policy.manageGrades", { defaultValue: "Manage grades and leave days" })}
                            </Link>
                        </div>
                        </PolicySection>
                        <PolicySection
                            {...sectionProps("rules")}
                            step="3"
                            title={t("leaveManagement.policy.otherRules", { defaultValue: "Other Leave Rules" })}
                            summary={t("leaveManagement.policy.rulesSummary", { defaultValue: "Sick, casual, maternity, Hajj and more" })}
                        >
                            <div className="leave-policy-fields">
                            {[
                                ["sickEligibleAfterMonths", t("leaveManagement.policy.sickEligibleAfter", { defaultValue: "Sick Leave Eligible After" }), t("leaveManagement.policy.unitMonths", { defaultValue: "months" }), "1"],
                                ["sickDaysPerYear", t("leaveManagement.policy.sickDaysPerYear", { defaultValue: "Sick Leave" }), t("leaveManagement.policy.unitDaysPerYear", { defaultValue: "days per year" }), "1"],
                                ["casualDays", t("leaveManagement.policy.casualDays", { defaultValue: "Casual Leave" }), t("leaveManagement.policy.unitWorkingDaysPerYear", { defaultValue: "working days per year" }), "1"],
                                ["maternityDays", t("leaveManagement.policy.maternityDays", { defaultValue: "Maternity Leave Days" }), t("leaveManagement.policy.unitCalendarDays", { defaultValue: "calendar days, paid" }), "1"],
                                ["paternityDays", t("leaveManagement.policy.paternityDays", { defaultValue: "Paternity Leave" }), t("leaveManagement.policy.unitCalendarDays", { defaultValue: "calendar days, paid" }), "1"],
                                ["bereavementDays", t("leaveManagement.policy.bereavementDays", { defaultValue: "Compassionate / Bereavement" }), t("leaveManagement.policy.unitDaysPaid", { defaultValue: "days, paid" }), "1"],
                                ["umrahDays", t("leaveManagement.policy.umrahDays", { defaultValue: "Umrah Leave" }), t("leaveManagement.policy.unitDaysUnpaid", { defaultValue: "days, unpaid" }), "1"],
                                ["hajjDays", t("leaveManagement.policy.hajjDays", { defaultValue: "Hajj Leave" }), t("leaveManagement.policy.unitDaysUnpaid", { defaultValue: "days, unpaid" }), "1"],
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
                        <div className="leave-policy-rules">
                            <p><Trans i18nKey="leaveManagement.policy.rules.sickYearly" values={{ count: leavePolicy.sickDaysPerYear }} components={{ b: <strong /> }} defaults="<b>Sick Leave:</b> {{count}} days per year. Medical certificate required." /></p>
                            <p><Trans i18nKey="leaveManagement.policy.rules.limits" components={{ b: <strong /> }} defaults="<b>Limits:</b> Sick and Casual Leave count per calendar year. Maternity, Paternity, Compassionate/Bereavement, Umrah and Hajj are the maximum for each request. Maternity and Paternity count calendar days; the others count working days." /></p>
                            <p><Trans i18nKey="leaveManagement.policy.rules.maternity" components={{ b: <strong /> }} defaults="<b>Maternity Leave:</b> Full pay, HR approval, medical certificate required." /></p>
                            <p><Trans i18nKey="leaveManagement.policy.rules.bereavement" components={{ b: <strong /> }} defaults="<b>Bereavement:</b> Immediate family, manager approval." /></p>
                            <p><Trans i18nKey="leaveManagement.policy.rules.compensatory" components={{ b: <strong /> }} defaults="<b>Compensatory Off:</b> Public holiday or weekend work, manager approval." /></p>
                        </div>
                        </PolicySection>
                        <PolicySection
                            {...sectionProps("holidays")}
                            className="leave-holiday-calendar"
                            step="4"
                            title={t("leaveDetails.holidayCalendar", { defaultValue: "Qatar Holiday Calendar" })}
                            summary={t("leaveManagement.policy.holidaysSummary", { count: leavePolicy.qatarHolidayCalendar.length, defaultValue: "{{count}} holidays" })}
                            actions={!holidayDraft && (
                                <button
                                    type="button"
                                    className="leave-policy-add-grade"
                                    disabled={policyLoading || policySaving}
                                    onClick={startHolidayEditing}
                                >
                                    {t("leaveManagement.holidayEditor.edit", { defaultValue: "Edit holidays" })}
                                </button>
                            )}
                        >
                            {holidayDraft ? (
                                <div className="leave-holiday-editor">
                                    <p className="leave-holiday-note">
                                        {t("leaveManagement.holidayEditor.note", { defaultValue: "For Islamic holidays enter the real date each year (e.g. 2027-03-09)" })}
                                    </p>
                                    <div className="leave-holiday-edit-row leave-holiday-edit-labels" aria-hidden="true">
                                        <span>{t("leaveManagement.holidayEditor.name", { defaultValue: "Name" })}</span>
                                        <span>{t("leaveManagement.holidayEditor.date", { defaultValue: "Date (YYYY-MM-DD or 18 December)" })}</span>
                                        <span>{t("leaveManagement.holidayEditor.days", { defaultValue: "Days" })}</span>
                                    </div>
                                    {holidayDraft.map((holiday, index) => (
                                        <div key={index}>
                                            <div className="leave-holiday-edit-row">
                                                <input
                                                    type="text"
                                                    aria-label={t("leaveManagement.holidayEditor.name", { defaultValue: "Name" })}
                                                    placeholder={t("leaveManagement.holidayEditor.namePlaceholder", { defaultValue: "Holiday name" })}
                                                    value={holiday.name}
                                                    disabled={policySaving}
                                                    onChange={(event) => updateHolidayDraft(index, "name", event.target.value)}
                                                />
                                                <input
                                                    type="text"
                                                    aria-label={t("leaveManagement.holidayEditor.date", { defaultValue: "Date (YYYY-MM-DD or 18 December)" })}
                                                    placeholder="2027-03-09"
                                                    value={holiday.date}
                                                    disabled={policySaving}
                                                    onChange={(event) => updateHolidayDraft(index, "date", event.target.value)}
                                                />
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="7"
                                                    step="1"
                                                    aria-label={t("leaveManagement.holidayEditor.days", { defaultValue: "Days" })}
                                                    value={holiday.days}
                                                    disabled={policySaving}
                                                    onChange={(event) => updateHolidayDraft(index, "days", event.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    aria-label={t("leaveManagement.holidayEditor.remove", { name: holiday.name, defaultValue: "Remove holiday {{name}}" })}
                                                    disabled={policySaving}
                                                    onClick={() => setHolidayDraft((current) => current.filter((_, holidayIndex) => holidayIndex !== index))}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                            {String(holiday.date || "").trim() && !isResolvableHolidayDate(holiday.date) && (
                                                <p className="leave-holiday-warning">
                                                    {t("leaveManagement.holidayEditor.unresolved", { defaultValue: "This date is not recognised, so leave on it is still counted. Enter a date like 2027-03-09 or 18 December." })}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        className="leave-policy-add-grade"
                                        disabled={policySaving}
                                        onClick={() => setHolidayDraft((current) => [...current, { name: "", date: "", days: 1 }])}
                                    >
                                        {t("leaveManagement.holidayEditor.add", { defaultValue: "+ Add holiday" })}
                                    </button>
                                    {holidayError && <p className="leave-holiday-error" role="alert">{holidayError}</p>}
                                    <div className="leave-holiday-editor-actions">
                                        <button
                                            type="button"
                                            className="leave-holiday-cancel"
                                            disabled={policySaving}
                                            onClick={() => { setHolidayDraft(null); setHolidayError(""); }}
                                        >
                                            {t("leaveManagement.holidayEditor.cancel", { defaultValue: "Cancel" })}
                                        </button>
                                        <button
                                            type="button"
                                            className="leave-holiday-save"
                                            disabled={policySaving}
                                            onClick={saveHolidays}
                                        >
                                            {policySaving
                                                ? t("profileEdit.saving", { defaultValue: "Saving..." })
                                                : t("leaveManagement.holidayEditor.save", { defaultValue: "Save holidays" })}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="leave-holiday-list">
                                    {leavePolicy.qatarHolidayCalendar.map((holiday, index) => (
                                        <div className="leave-holiday-row" key={`${holiday.name}-${index}`}>
                                            <strong>{holidayName(holiday.name)}</strong>
                                            <span>{holidayDate(holiday.date)}</span>
                                            <b>{t("leaveManagement.dayCount", { count: Number(holiday.days), defaultValue: `${holiday.days} ${holiday.days === 1 ? "day" : "days"}` })}</b>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </PolicySection>
                        {/* ── D365 Holiday Sync ───────────────────────────────── */}
                        <PolicySection
                            {...sectionProps("d365")}
                            step="5"
                            title={t("leaveDetails.d365HolidaySync", { defaultValue: "Sync Holidays from D365" })}
                            summary={t("leaveManagement.policy.d365Summary", { defaultValue: "Read-only import from D365" })}
                        >
                            <p style={{ fontSize: "0.85rem", color: "var(--fg2)", margin: "0 0 12px 0" }}>
                                {t("leaveDetails.d365HolidaySyncDesc", {
                                    defaultValue:
                                        "Pull non-working dates from a D365 Finance & Operations work calendar and add them to the Qatar holiday calendar above. This is read-only — nothing is written back to D365.",
                                })}
                            </p>
                            <div className="leave-d365-sync-form">
                                <div className="leave-d365-sync-row">
                                    <label className="leave-d365-label">
                                        {t("leaveDetails.d365CalendarId", { defaultValue: "D365 Calendar ID" })}
                                        <input
                                            type="text"
                                            className="leave-d365-input"
                                            value={d365SyncCalendarId}
                                            onChange={(e) => setD365SyncCalendarId(e.target.value)}
                                            placeholder="e.g. SHELTER_QA"
                                        />
                                    </label>
                                    <label className="leave-d365-label">
                                        {t("leaveDetails.d365Year", { defaultValue: "Year" })}
                                        <input
                                            type="number"
                                            className="leave-d365-input leave-d365-input--short"
                                            value={d365SyncYear}
                                            min={2020}
                                            max={2035}
                                            onChange={(e) => setD365SyncYear(Number(e.target.value))}
                                        />
                                    </label>
                                </div>
                                <div className="leave-d365-sync-actions">
                                    <button
                                        type="button"
                                        className="leave-d365-sync-btn"
                                        onClick={syncHolidaysFromD365}
                                        disabled={d365SyncLoading}
                                    >
                                        {d365SyncLoading
                                            ? t("leaveDetails.d365Syncing", { defaultValue: "Syncing…" })
                                            : t("leaveDetails.d365SyncBtn", { defaultValue: "Sync from D365" })}
                                    </button>
                                    {d365SyncMessage && (
                                        <span className={d365SyncFailed ? "leave-d365-msg leave-d365-msg--error" : "leave-d365-msg"}>
                                            {d365SyncMessage}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </PolicySection>
                        </div>

                        <div className="leave-policy-footer">
                            {policyMessage && <span className={policySaveFailed ? "is-error" : ""}>{policyMessage}</span>}
                            <button
                                type="button"
                                onClick={async () => {
                                    if (await saveLeavePolicy()) closePolicySetup();
                                }}
                                disabled={policyLoading || policySaving}
                            >
                                {policySaving
                                    ? t("profileEdit.saving", { defaultValue: "Saving..." })
                                    : t("leaveManagement.policy.save", { defaultValue: "Save Policy" })}
                            </button>
                        </div>
                    </section>
                )}

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

                        <div className="leave-view-toggle" role="group" aria-label={t("leaveManagement.view.label", { defaultValue: "View" })}>
                            <button
                                type="button"
                                className={leaveView === "list" ? "active" : ""}
                                aria-pressed={leaveView === "list"}
                                onClick={() => setLeaveView("list")}
                            >
                                {t("leaveManagement.view.list", { defaultValue: "List" })}
                            </button>
                            <button
                                type="button"
                                className={leaveView === "calendar" ? "active" : ""}
                                aria-pressed={leaveView === "calendar"}
                                onClick={() => setLeaveView("calendar")}
                            >
                                {t("leaveManagement.view.calendar", { defaultValue: "Calendar" })}
                            </button>
                        </div>

                    </div>

                    {/* SEARCH + FILTERS */}
                    <div className="leave-tools leave-request-filters">
                        <label className="leave-search">
                            <Search size={16} aria-hidden="true" />
                            <input
                                type="text"
                                placeholder={t("hrAttendance.searchPlaceholder", { defaultValue: "Search employee..." })}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </label>

                        <div className="leave-tools-spacer" />

                        <div className="leave-filters" ref={filtersRef}>
                            <button
                                type="button"
                                className={`leave-filters-btn${activeFilterCount ? " has-active" : ""}`}
                                aria-expanded={isFiltersOpen}
                                aria-haspopup="dialog"
                                onClick={() => setIsFiltersOpen((open) => !open)}
                            >
                                <SlidersHorizontal size={16} aria-hidden="true" />
                                {t("leaveManagement.filters.button", { defaultValue: "Filters" })}
                                {activeFilterCount > 0 && <span className="leave-filters-count">{activeFilterCount}</span>}
                            </button>

                            {isFiltersOpen && (
                                <div className="leave-filters-panel" role="dialog" aria-label={t("leaveManagement.filters.button", { defaultValue: "Filters" })}>
                                    <label>
                                        <span>{t("leaveDetails.statusHeader", { defaultValue: "Status" })}</span>
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
                                    </label>

                                    <label>
                                        <span>{t("leaveDetails.leaveType", { defaultValue: "Leave Type" })}</span>
                                        <select
                                            value={selectedLeaveType}
                                            onChange={(e) => setSelectedLeaveType(e.target.value)}
                                        >
                                            <option value="all">{t("leaveManagement.allLeaveTypes", { defaultValue: "All Leave Types" })}</option>
                                            {leaveTypes.map((type) => (
                                                <option key={type} value={type}>{leaveTypeLabel(type)}</option>
                                            ))}
                                        </select>
                                    </label>

                                    <label>
                                        <span>{t("employeeAttendance.rowsPerPage", { defaultValue: "Rows per page" })}</span>
                                        <RowsPerPage inline value={leavePager.pageSize} onChange={leavePager.setPageSize} />
                                    </label>

                                    {leaveView === "list" && (
                                        <div className="leave-filters-group">
                                            <span>{t("leaveManagement.dateFilter.label", { defaultValue: "On leave during" })}</span>
                                            <div className="leave-date-range">
                                                <input
                                                    type="date"
                                                    aria-label={t("leaveManagement.dateFilter.from", { defaultValue: "From date" })}
                                                    value={dateRange.from}
                                                    onChange={(e) => setDateRange((current) => ({ ...current, from: e.target.value }))}
                                                />
                                                <span className="leave-date-filter-sep" aria-hidden="true">→</span>
                                                <input
                                                    type="date"
                                                    aria-label={t("leaveManagement.dateFilter.to", { defaultValue: "To date (optional)" })}
                                                    value={dateRange.to}
                                                    min={dateRange.from || undefined}
                                                    disabled={!dateRange.from}
                                                    onChange={(e) => setDateRange((current) => ({ ...current, to: e.target.value }))}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        className="leave-filters-clear"
                                        disabled={!activeFilterCount}
                                        onClick={clearFilters}
                                    >
                                        {t("leaveManagement.filters.clearAll", { defaultValue: "Clear all filters" })}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* MONTH + WHO'S ON LEAVE result */}
                    <div className="leave-date-filter">
                        <div className="leave-date-filter-row">
                            <label className="leave-month-filter">
                                <CalendarDays size={16} aria-hidden="true" />
                                {t("leaveManagement.filters.month", { defaultValue: "Month" })}
                                <select
                                    value={selectedMonth}
                                    disabled={Boolean(dateRange.from)}
                                    title={dateRange.from
                                        ? t("leaveManagement.dateFilter.monthHint", { defaultValue: "On leave during covers every month" })
                                        : undefined}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                >
                                    <option value="all">{t("leaveManagement.allMonths", { defaultValue: "All Months" })}</option>
                                    {monthOptions.map((key) => (
                                        <option key={key} value={key}>{monthKeyLabel(key)}</option>
                                    ))}
                                </select>
                            </label>
                            {leaveView === "list" && dateRange.from && (
                                <>
                                    <div className="leave-date-quick">
                                        <button type="button" className="clear" onClick={() => setDateRange({ from: "", to: "" })}>
                                            {t("leaveManagement.dateFilter.clear", { defaultValue: "Clear" })}
                                        </button>
                                    </div>
                                    <ExportMenu className="leave-date-export-menu" disabled={loading || !filteredLeaves.length} onExport={exportOnLeave} />
                                </>
                            )}
                        </div>
                        {leaveView === "list" && dateRange.from && !loading && !error && (
                            <div className="leave-date-filter-summary" role="status">
                                    {dateRangeEnd === dateRange.from
                                        ? t("leaveManagement.dateFilter.summaryDay", {
                                            count: dateRangeEmployees,
                                            date: formatAppDate(dateRange.from),
                                            defaultValue: "{{count}} employee(s) on leave on {{date}}",
                                        })
                                        : t("leaveManagement.dateFilter.summaryRange", {
                                            count: dateRangeEmployees,
                                            from: formatAppDate(dateRange.from),
                                            to: formatAppDate(dateRangeEnd),
                                            defaultValue: "{{count}} employee(s) on leave between {{from}} and {{to}}",
                                        })}
                                    {selectedStatus === "all" && (
                                        <span> · {t("leaveManagement.dateFilter.activeOnly", { defaultValue: "Approved and pending only" })}</span>
                                    )}
                            </div>
                        )}
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

                    {/* CALENDAR */}

                    {!loading && !error && leaveView === "calendar" && (
                        <div className="leave-calendar">
                            <div className="leave-calendar-head">
                                <button
                                    type="button"
                                    aria-label={t("leaveManagement.calendar.previous", { defaultValue: "Previous month" })}
                                    onClick={() => { setCalendarMonth((month) => shiftMonth(month, -1)); setCalendarDay(null); }}
                                >
                                    ‹
                                </button>
                                <h3>{calendarMonthLabel}</h3>
                                <button
                                    type="button"
                                    aria-label={t("leaveManagement.calendar.next", { defaultValue: "Next month" })}
                                    onClick={() => { setCalendarMonth((month) => shiftMonth(month, 1)); setCalendarDay(null); }}
                                >
                                    ›
                                </button>
                                <button
                                    type="button"
                                    className="leave-calendar-today"
                                    onClick={() => { setCalendarMonth(todayKey.slice(0, 7)); setCalendarDay(todayKey); }}
                                >
                                    {t("leaveManagement.dateFilter.today", { defaultValue: "Today" })}
                                </button>
                            </div>

                            <div className="leave-calendar-scroll">
                                <div className="leave-calendar-grid">
                                    {CALENDAR_WEEKDAYS.map((weekday, index) => (
                                        <div key={weekday} className={`leave-calendar-weekday${CALENDAR_WEEKEND.has(index) ? " weekend" : ""}`}>
                                            {t(`leaveManagement.calendar.weekdays.${weekday.toLowerCase()}`, { defaultValue: weekday })}
                                        </div>
                                    ))}
                                    {calendarDays.map((day) => {
                                        const holiday = calendarHolidays.get(day.key);
                                        return (
                                            <button
                                                type="button"
                                                key={day.key}
                                                className={[
                                                    "leave-calendar-day",
                                                    day.inMonth ? "" : "outside",
                                                    CALENDAR_WEEKEND.has(day.weekday) ? "weekend" : "",
                                                    holiday ? "holiday" : "",
                                                    day.key === todayKey ? "is-today" : "",
                                                    day.key === calendarDay ? "selected" : "",
                                                    day.employees ? "has-leave" : "",
                                                ].filter(Boolean).join(" ")}
                                                title={holiday ? holidayName(holiday) : undefined}
                                                aria-label={[
                                                    t("leaveManagement.calendar.dayLabel", {
                                                        date: formatAppDate(day.key),
                                                        count: day.employees,
                                                        defaultValue: "{{date}}: {{count}} on leave",
                                                    }),
                                                    holiday ? holidayName(holiday) : "",
                                                ].filter(Boolean).join(", ")}
                                                onClick={() => setCalendarDay(day.key)}
                                            >
                                                <span className="leave-calendar-date-row">
                                                    <span className="leave-calendar-date">{Number(day.key.slice(8, 10))}</span>
                                                    {holiday && <span className="leave-calendar-holiday-dot" aria-hidden="true" />}
                                                </span>
                                                {holiday && (
                                                    <span className="leave-calendar-holiday">{holidayName(holiday)}</span>
                                                )}
                                                {day.employees > 0 && (
                                                    <span className="leave-calendar-count">
                                                        {t("leaveManagement.calendar.onLeave", { count: day.employees, defaultValue: "{{count}} on leave" })}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="leave-calendar-legend" aria-hidden="true">
                                <span><i className="legend-swatch is-today" />{t("leaveManagement.dateFilter.today", { defaultValue: "Today" })}</span>
                                <span><i className="legend-swatch leave" />{t("leaveManagement.calendar.legendLeave", { defaultValue: "On leave" })}</span>
                                <span><i className="legend-swatch holiday" />{t("leaveManagement.calendar.legendHoliday", { defaultValue: "Public holiday" })}</span>
                                <span><i className="legend-swatch weekend" />{t("leaveManagement.calendar.legendWeekend", { defaultValue: "Weekend (Fri–Sat)" })}</span>
                            </div>

                            <div className="leave-calendar-detail">
                                {!calendarDay ? (
                                    <p className="empty-history">
                                        {t("leaveManagement.calendar.pickDay", { defaultValue: "Click a day to see who is on leave." })}
                                    </p>
                                ) : (
                                    <>
                                        <h4>
                                            {t("leaveManagement.calendar.dayTitle", {
                                                date: formatAppDate(calendarDay),
                                                count: countEmployees(calendarDayLeaves),
                                                defaultValue: "{{date}} · {{count}} employee(s) on leave",
                                            })}
                                        </h4>
                                        {calendarHolidays.get(calendarDay) && (
                                            <div className="leave-calendar-holiday-banner">
                                                <span className="leave-calendar-holiday-dot" aria-hidden="true" />
                                                {t("leaveManagement.calendar.publicHoliday", {
                                                    name: holidayName(calendarHolidays.get(calendarDay)),
                                                    defaultValue: "Public holiday: {{name}}",
                                                })}
                                            </div>
                                        )}
                                        {calendarDayLeaves.length === 0 ? (
                                            <p className="empty-history">
                                                {t("leaveManagement.calendar.nobody", { defaultValue: "Nobody is on leave on this day." })}
                                            </p>
                                        ) : (
                                            calendarDayLeaves.map((leave) => (
                                                <button
                                                    type="button"
                                                    key={leave.id}
                                                    className="leave-calendar-person"
                                                    onClick={() => handleEmployeeClick(leave)}
                                                >
                                                    <span>
                                                        <strong>{leave.employeeName}</strong>
                                                        <span className="leave-calendar-person-meta" dir="ltr">{leave.employeeID}{leave.department ? ` · ${leave.department}` : ""}</span>
                                                    </span>
                                                    <span className="leave-calendar-person-dates">
                                                        {leaveTypeLabel(leave.leaveType)} · <span dir="ltr">{leave.fromDate} – {leave.toDate}</span>
                                                    </span>
                                                    <span className={`leave-status ${leave.status?.toLowerCase()}`}>
                                                        {statusLabel(leave.status)}
                                                    </span>
                                                </button>
                                            ))
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TABLE */}

                    {!loading &&
                        !error && leaveView === "list" && (
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
                                                    <span className="leave-empty">
                                                        <span className="leave-empty-icon" aria-hidden="true"><Inbox size={22} /></span>
                                                        <strong>{t("leaveManagement.table.empty", { defaultValue: "No leave requests found" })}</strong>
                                                        <span>{t("leaveManagement.table.emptyHint", { defaultValue: "Try a different search, filter or date range." })}</span>
                                                    </span>
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

                                                            <span className="leave-person">
                                                                <span className={`leave-avatar tone-${avatarTone(leave.employeeName)}`} aria-hidden="true">
                                                                    {nameInitials(leave.employeeName)}
                                                                </span>
                                                                <span className="leave-person-text">
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
                                                                    {leave.department && (
                                                                        <span className="leave-person-dept">{leave.department}</span>
                                                                    )}
                                                                </span>
                                                            </span>

                                                        </td>

                                                        {/* LEAVE TYPE */}

                                                        <td>
                                                            <span className={`leave-type-chip tone-${leaveTypeTone(leave.leaveType)}`}>
                                                                {leaveTypeLabel(leave.leaveType)}
                                                            </span>
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
                                                            <span className="leave-days-pill">
                                                                {
                                                                    leave.days
                                                                }
                                                            </span>
                                                        </td>

                                                        {/* REASON */}

                                                        <td>
                                                            <span className="leave-reason" title={leave.reason}>
                                                                {
                                                                    leave.reason
                                                                }
                                                            </span>
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

                    {!loading && !error && leaveView === "list" && (
                        <Pagination page={leavePager.page} pageCount={leavePager.pageCount} onChange={leavePager.setPage} />
                    )}

                </div>

                {/* =================================================
                    EMPLOYEE REVIEW MODAL
                ================================================= */}

                {selectedEmployee && (
                    <div className="leave-review-view" ref={reviewViewRef}>

                        <div className="leave-review-panel">

                            {/* =================================================
                                MODAL HEADER
                            ================================================= */}

                            <button
                                type="button"
                                className="leave-review-back"
                                onClick={closeModal}
                                disabled={updating}
                            >
                                <ArrowLeft size={16} aria-hidden="true" />
                                {t("leaveManagement.review.back", { defaultValue: "Back to Leave Requests" })}
                            </button>

                            <div className="leave-review-header">

                                <div>

                                    <span className="leave-review-kicker">
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

                            <div className="leave-review-body">

                            <div className="review-columns">

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

                                </div>

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

                            <div className="review-tracker-section">

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

                            <div className="review-columns">

                            {/* =================================================
                                ALSO ON LEAVE DURING THESE DATES
                            ================================================= */}

                            <div className="leave-history leave-overlap">

                                <div className="history-heading">
                                    <h3>
                                        {t("leaveManagement.review.overlapTitle", { defaultValue: "Also on leave during these dates" })}
                                    </h3>
                                    <p>
                                        {overlappingOthers.length === 0
                                            ? t("leaveManagement.review.overlapNone", { defaultValue: "No other employee has approved or pending leave on these dates." })
                                            : t("leaveManagement.review.overlapSummary", {
                                                count: countEmployees(overlappingOthers),
                                                defaultValue: "{{count}} other employee(s) have approved or pending leave on these dates.",
                                            })}
                                        {sameDepartmentOverlaps > 0 && (
                                            <strong className="leave-overlap-warning">
                                                {" "}
                                                {t("leaveManagement.review.overlapSameDept", {
                                                    count: sameDepartmentOverlaps,
                                                    department: selectedEmployee.department,
                                                    defaultValue: "{{count}} from {{department}}.",
                                                })}
                                            </strong>
                                        )}
                                    </p>
                                </div>

                                {overlappingOthers.map((leave) => (
                                    <div
                                        className={`history-item${leave.sameDepartment ? " same-department" : ""}`}
                                        key={leave.id}
                                    >
                                        <div>
                                            <strong>
                                                {leave.employeeName}{" "}
                                                <span dir="ltr">({leave.employeeID})</span>
                                            </strong>
                                            <span>
                                                {leave.department || t("leaveManagement.review.noDepartment", { defaultValue: "No department" })}
                                                {leave.sameDepartment && ` · ${t("leaveManagement.review.sameDepartment", { defaultValue: "Same department" })}`}
                                            </span>
                                            <span>
                                                <span dir="ltr">{leave.fromDate} - {leave.toDate}</span>{" "}
                                                • {leaveTypeLabel(leave.leaveType)}
                                            </span>
                                        </div>
                                        <span className={`history-status ${leave.status?.toLowerCase()}`}>
                                            {statusLabel(leave.status)}
                                        </span>
                                    </div>
                                ))}

                            </div>

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