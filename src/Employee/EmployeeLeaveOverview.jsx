import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Baby, Bell, BookOpen, CalendarDays, CalendarPlus, ChevronDown, ClipboardList, HeartPulse, Hourglass, Landmark, Plane, Repeat, ShieldCheck, Sun, Users } from "lucide-react";

const STATUS_TONES = { approved: "green", pending: "amber", rejected: "rose", cancelled: "muted" };

// Leave page: banner, policy balances, requests table, holidays and the rules from Leave Policy Setup
function EmployeeLeaveOverview({
    leaves, annualBalance, leaveRules, sickTaken, casualTaken, sickEligible, sickEligibleDate, holidays, currentYear,
    policy, policyUpdatedAt, leaveTypes = [], formatProfileDate, onApply, onOpenLeave, onCancelLeave,
    unreadNotifications, onOpenNotifications,
}) {
    const { t } = useTranslation();
    const [statusFilter, setStatusFilter] = useState("all");
    const [holidaysOpen, setHolidaysOpen] = useState(true);

    const statusOf = (leave) => String(leave.status || "pending").trim().toLowerCase();
    const countStatus = (status) => leaves.filter((leave) => statusOf(leave) === status).length;
    const pendingDays = (type) => leaves
        .filter((leave) => leave.leave_type === type && statusOf(leave) === "pending")
        .reduce((total, leave) => total + Number(leave.days || 0), 0);
    const days = (count) => t("leaveDetails.daysCount", { count: Number(count) || 0 });
    const typeLabel = (type) => t(`leaveTypes.${type}`, { defaultValue: type });

    const statusTabs = ["all", "pending", "approved", "rejected", "cancelled"].map((value) => ({
        value,
        label: value === "all" ? t("employeeHero.allStatuses", { defaultValue: "All" }) : t(`leaveDetails.status.${value}`, { defaultValue: value }),
        count: value === "all" ? leaves.length : countStatus(value),
        tone: STATUS_TONES[value],
    }));
    const visibleLeaves = statusFilter === "all" ? leaves : leaves.filter((leave) => statusOf(leave) === statusFilter);

    // Balances use the same numbers the server checks: Annual from the backend balance,
    // Sick / Casual = yearly limit − approved days this year
    const sickRemaining = Math.max(0, leaveRules.sick.totalDays - sickTaken);
    const casualRemaining = Math.max(0, leaveRules.casual.days - casualTaken);
    const balances = [
        {
            key: "annual",
            icon: Sun,
            title: typeLabel("Annual Leave"),
            value: annualBalance ? annualBalance.available : null,
            parts: annualBalance ? [
                { tone: "navy", label: t("employeeHero.used", { defaultValue: "Used" }), value: annualBalance.used },
                { tone: "amber", label: t("dashboard.pending"), value: annualBalance.pending },
                { tone: "orange", label: t("employeeHero.available", { defaultValue: "Available" }), value: annualBalance.available },
            ] : [],
            note: annualBalance
                ? t("employeeHero.perYear", { yearly: annualBalance.yearlyEntitlementDays, monthly: annualBalance.monthlyAccrual.toFixed(2), accrued: annualBalance.accrued, defaultValue: "{{accrued}} days earned so far · {{yearly}} days/year ({{monthly}}/month)" })
                : "",
        },
        {
            key: "sick",
            icon: HeartPulse,
            title: typeLabel("Sick Leave"),
            value: sickEligible ? sickRemaining : null,
            parts: sickEligible ? [
                { tone: "navy", label: t("employeeHero.used", { defaultValue: "Used" }), value: sickTaken },
                { tone: "amber", label: t("dashboard.pending"), value: pendingDays("Sick Leave") },
                { tone: "orange", label: t("employeeHero.available", { defaultValue: "Available" }), value: sickRemaining },
            ] : [],
            note: sickEligible
                ? t("employeeHero.yearlyLimit", { count: leaveRules.sick.totalDays, year: currentYear, defaultValue: "{{count}} days in {{year}} · medical certificate required" })
                : t("leavePolicy.eligibleAfter", { date: sickEligibleDate }),
        },
        {
            key: "casual",
            icon: Plane,
            title: typeLabel("Casual Leave"),
            value: casualRemaining,
            parts: [
                { tone: "navy", label: t("employeeHero.used", { defaultValue: "Used" }), value: casualTaken },
                { tone: "amber", label: t("dashboard.pending"), value: pendingDays("Casual Leave") },
                { tone: "orange", label: t("employeeHero.available", { defaultValue: "Available" }), value: casualRemaining },
            ],
            note: t("leavePolicy.workingDaysPerYear", { count: leaveRules.casual.days, defaultValue: "{{count}} working days per year" }),
        },
    ];

    // Leave Policy Setup, read-only. Annual Leave shows only this employee's grade
    // (the backend balance already picked the grade's days from HR's grade table).
    const payLabel = (pay) => ({
        "100%": t("leavePolicy.fullPay"),
        "50%": t("employeeHero.halfPay", { defaultValue: "Half pay" }),
        Unpaid: t("leavePolicy.unpaid"),
        "Full Pay": t("leavePolicy.fullPay"),
    }[pay] || pay);
    const grade = annualBalance?.grade;
    const sickBands = Array.isArray(policy?.sickLeave?.salaryBands) && policy.sickLeave.salaryBands.length
        ? policy.sickLeave.salaryBands
        : [{ days: 14, pay: "100%" }, { days: 28, pay: "50%" }, { days: 42, pay: "Unpaid" }];
    const salaryBasis = policy?.leave_accrual_salary_basis === "basic"
        ? t("employeeHero.basisBasic", { defaultValue: "basic" })
        : t("employeeHero.basisTotal", { defaultValue: "total" });
    const BUILT_IN = ["Annual Leave", "Sick Leave", "Casual Leave", "Maternity Leave", "Paternity Leave", "Bereavement Leave", "Umrah Leave", "Hajj Leave", "Compensatory Off"];
    const openTypes = leaveTypes.filter((type) => !BUILT_IN.includes(type));

    const policyItems = [
        {
            key: "annual", icon: Sun, title: typeLabel("Annual Leave"),
            value: annualBalance
                ? t("leavePolicy.daysPerYear", { count: annualBalance.yearlyEntitlementDays, defaultValue: "{{count}} days per year" })
                : "-",
            lines: annualBalance ? [
                t("employeeHero.accrual", { monthly: annualBalance.monthlyAccrual.toFixed(2), defaultValue: "{{monthly}} days earned every completed month from your joining date" }),
                t("employeeHero.salaryBasis", { basis: salaryBasis, defaultValue: "Leave salary is based on your {{basis}} salary" }),
                t("leavePolicy.hrApproval"),
            ] : [],
        },
        {
            key: "sick", icon: HeartPulse, title: typeLabel("Sick Leave"),
            value: t("leavePolicy.daysPerYear", { count: leaveRules.sick.totalDays, defaultValue: "{{count}} days per year" }),
            lines: [
                t("employeeHero.sickAfter", { count: leaveRules.sick.eligibleMonths, defaultValue: "Available after {{count}} months of service" }),
                sickBands.map((band) => t("employeeHero.bandDays", { days: band.days, pay: payLabel(band.pay), defaultValue: "{{days}} days {{pay}}" })).join(" · "),
                t("leavePolicy.medicalCertificate"),
            ],
        },
        {
            key: "casual", icon: Plane, title: typeLabel("Casual Leave"),
            value: t("leavePolicy.workingDaysPerYear", { count: leaveRules.casual.days, defaultValue: "{{count}} working days per year" }),
            lines: [t("leavePolicy.fullPay"), t("leavePolicy.managerOrHrApproval")],
        },
        {
            key: "maternity", icon: Baby, title: typeLabel("Maternity Leave"),
            value: t("leavePolicy.calendarDaysPerRequest", { count: leaveRules.maternity.days, defaultValue: "{{count}} calendar days" }),
            lines: [payLabel(policy?.maternityLeave?.pay || "Full Pay"), t("leavePolicy.hrApproval"), t("leavePolicy.medicalCertificate")],
        },
        {
            key: "paternity", icon: Users, title: typeLabel("Paternity Leave"),
            value: t("leavePolicy.calendarDaysPerRequest", { count: leaveRules.paternity.days, defaultValue: "{{count}} calendar days" }),
            lines: [payLabel(policy?.paternityLeave?.pay || "Full Pay"), t("leavePolicy.hrApproval")],
        },
        {
            key: "bereavement", icon: ShieldCheck, title: typeLabel("Bereavement Leave"),
            value: t("leavePolicy.daysPerRequest", { count: leaveRules.bereavement.days, defaultValue: "Up to {{count}} days per request" }),
            lines: [t("leavePolicy.bereavementDetail"), payLabel(policy?.bereavementLeave?.pay || "Full Pay"), t("leavePolicy.managerApproval")],
        },
        {
            key: "umrah", icon: Landmark, title: typeLabel("Umrah Leave"),
            value: t("leavePolicy.daysPerRequest", { count: leaveRules.umrah.days, defaultValue: "Up to {{count}} days per request" }),
            lines: [t("leavePolicy.unpaid"), t("leavePolicy.hrApproval")],
        },
        {
            key: "hajj", icon: Landmark, title: typeLabel("Hajj Leave"),
            value: t("leavePolicy.daysPerRequest", { count: leaveRules.hajj.days, defaultValue: "Up to {{count}} days per request" }),
            lines: [t("leavePolicy.unpaid"), t("leavePolicy.hrApproval")],
        },
        {
            key: "compensatory", icon: Repeat, title: typeLabel("Compensatory Off"),
            value: t("leavePolicy.validForDays", { count: leaveRules.compensatory.validityDays }),
            lines: [t("leavePolicy.compensatoryDetail"), t("leavePolicy.managerApproval")],
        },
        ...openTypes.map((type) => ({
            key: type, icon: BookOpen, title: typeLabel(type),
            value: t("leavePolicy.noFixedBalance"),
            lines: [t("employeeHero.hrReviews", { defaultValue: "HR reviews each request" })],
        })),
    ];

    return (
        <div className="elv">
            <header className="edash-hero">
                <div className="edash-hero-copy">
                    <span className="edash-hero-kicker">{t("employeeHero.kicker", { defaultValue: "Employee Portal" })}</span>
                    <h1>{t("employeeHeader.leave.title", { defaultValue: "Leave Details" })}</h1>
                    <p>{t("employeeHeader.leave.subtitle", { defaultValue: "View and manage your leave requests" })}</p>
                    <div className="edash-hero-chips">
                        <span><Sun size={14} aria-hidden="true" />{t("employeeHero.annualAvailable", { count: annualBalance ? annualBalance.available : 0, defaultValue: "{{count}} Annual Leave days available" })}</span>
                        <span><Hourglass size={14} aria-hidden="true" />{t("employeeHero.pendingLeaves", { count: countStatus("pending"), defaultValue: "{{count}} leave requests pending" })}</span>
                        <span><ClipboardList size={14} aria-hidden="true" />{t("employeeHero.requestsTotal", { count: leaves.length, defaultValue: "{{count}} requests in total" })}</span>
                    </div>
                </div>
                <div className="edash-hero-side">
                    <button type="button" className="edash-hero-bell" onClick={onOpenNotifications} aria-label={t("employeeNotifications.openNotifications", { defaultValue: "Open notifications" })}>
                        <Bell size={22} />
                        {unreadNotifications > 0 && <span className="edash-hero-bell-count">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
                    </button>
                    <button type="button" className="elv-apply" onClick={onApply}>
                        <CalendarPlus size={17} aria-hidden="true" />
                        {t("leaveDetails.applyLeave")}
                    </button>
                </div>
            </header>

            <div className="edash-body">
                <section className="edash-overview">
                    {balances.map((balance) => {
                        const Icon = balance.icon;
                        return (
                            <article className="edash-card" key={balance.key}>
                                <header className="edash-card-head">
                                    <h2>{balance.title}</h2>
                                    <span className="edash-card-icon"><Icon size={16} /></span>
                                </header>
                                <div className="edash-card-value">
                                    <strong>{balance.value === null ? "-" : balance.value}</strong>
                                    <span>{t("employeeHero.daysAvailable", { defaultValue: "days available to apply" })}</span>
                                </div>
                                <div className="edash-segbar" aria-hidden="true">
                                    {balance.parts.map((part) => part.value > 0 && <i key={part.tone} className={`edash-tone-${part.tone}`} style={{ flexGrow: part.value }} />)}
                                </div>
                                {balance.parts.length > 0 && (
                                    <div className="edash-mini">
                                        {balance.parts.map((part) => (
                                            <div className="edash-mini-item" key={part.tone}>
                                                <span className={`edash-mini-label edash-tone-${part.tone}`}>{part.label}</span>
                                                <strong>{part.value}</strong>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <p className="edash-card-sub">{balance.note}</p>
                            </article>
                        );
                    })}
                </section>

                <section className="edash-board">
                    <div className="edash-board-main">
                        <article className="edash-card eatt-records">
                            <header className="eatt-toolbar">
                                <div className="eatt-toolbar-row">
                                    <h2>{t("employeeHero.myRequests", { defaultValue: "My Leave Requests" })}</h2>
                                    <div className="eatt-tabs" role="tablist" aria-label={t("leaveDetails.statusHeader")}>
                                        {statusTabs.map((tab) => (
                                            <button
                                                type="button"
                                                role="tab"
                                                key={tab.value}
                                                aria-selected={statusFilter === tab.value}
                                                className={`${statusFilter === tab.value ? "active" : ""}${tab.tone && tab.tone !== "muted" ? ` edash-tone-${tab.tone}` : ""}`}
                                                onClick={() => setStatusFilter(tab.value)}
                                            >
                                                {tab.label}
                                                <b>{tab.count}</b>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </header>
                            <div className="eatt-table-wrap">
                                <table className="eatt-table">
                                    <thead>
                                        <tr>
                                            <th>{t("leaveDetails.leaveType")}</th>
                                            <th>{t("leaveDetails.from")}</th>
                                            <th>{t("leaveDetails.to")}</th>
                                            <th>{t("leaveDetails.days")}</th>
                                            <th>{t("leaveDetails.statusHeader")}</th>
                                            <th>{t("leaveDetails.action")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleLeaves.length > 0 ? visibleLeaves.map((leave) => {
                                            const status = statusOf(leave);
                                            return (
                                                <tr
                                                    key={leave.id}
                                                    className="elv-row"
                                                    tabIndex="0"
                                                    onClick={() => onOpenLeave(leave.id)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter" || event.key === " ") onOpenLeave(leave.id);
                                                    }}
                                                >
                                                    <td>
                                                        <div className="elv-type">
                                                            <strong>{typeLabel(leave.leave_type)}</strong>
                                                            {leave.reason && <span title={leave.reason}>{leave.reason}</span>}
                                                        </div>
                                                    </td>
                                                    <td>{formatProfileDate(leave.from_date)}</td>
                                                    <td>{formatProfileDate(leave.to_date)}</td>
                                                    <td>{days(leave.days)}</td>
                                                    <td><span className={`edash-pill edash-pill-${status}`}>{t(`leaveDetails.status.${status}`, { defaultValue: leave.status })}</span></td>
                                                    <td>
                                                        {status === "pending" ? (
                                                            <button
                                                                type="button"
                                                                className="elv-cancel"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    onCancelLeave(leave.id);
                                                                }}
                                                            >
                                                                {t("leaveDetails.cancel")}
                                                            </button>
                                                        ) : "-"}
                                                    </td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr><td colSpan="6" className="eatt-empty">{t("leaveDetails.noLeaves")}</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <p className="edash-card-sub">
                                {t("employeeHero.dayCountRule", { defaultValue: "Days count working days only (Friday, Saturday and public holidays are excluded). Maternity and Paternity Leave count calendar days." })}
                            </p>
                        </article>

                        <article className="edash-card">
                            <header className="edash-card-head">
                                <div>
                                    <h2>{t("employeeHero.leavePolicy", { defaultValue: "Leave Policy" })}</h2>
                                    <p className="edash-card-sub">
                                        {policyUpdatedAt
                                            ? t("employeeHero.policyUpdated", { date: formatProfileDate(policyUpdatedAt), defaultValue: "Set by HR · last updated {{date}}" })
                                            : t("employeeHero.policySetByHr", { defaultValue: "Set by HR" })}
                                    </p>
                                </div>
                                <span className="elv-grade">
                                    {grade
                                        ? t("employeeHero.gradeBadge", { grade, defaultValue: "Grade {{grade}}" })
                                        : t("employeeHero.noGrade", { defaultValue: "No grade · company default" })}
                                </span>
                            </header>
                            <div className="elv-policy">
                                {policyItems.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <section className="elv-policy-item" key={item.key}>
                                            <span className="elv-holiday-icon"><Icon size={15} /></span>
                                            <div>
                                                <h3>{item.title}</h3>
                                                <strong>{item.value}</strong>
                                                <ul>
                                                    {item.lines.filter(Boolean).map((line) => <li key={line}>{line}</li>)}
                                                </ul>
                                            </div>
                                        </section>
                                    );
                                })}
                            </div>
                        </article>
                    </div>

                    <aside className="edash-board-side">
                        <article className="edash-card">
                            <header className="edash-card-head">
                                <h2>{t("leaveDetails.holidayCalendar")}</h2>
                                <button
                                    type="button"
                                    className={`elv-toggle${holidaysOpen ? " open" : ""}`}
                                    aria-label={holidaysOpen ? t("leaveDetails.collapseHolidays") : t("leaveDetails.expandHolidays")}
                                    aria-expanded={holidaysOpen}
                                    onClick={() => setHolidaysOpen((open) => !open)}
                                >
                                    <ChevronDown size={16} />
                                </button>
                            </header>
                            {holidaysOpen && (
                                <ul className="elv-holidays">
                                    {holidays.map((holiday) => (
                                        <li key={`${holiday.name}-${holiday.date}`}>
                                            <span className="elv-holiday-icon"><CalendarDays size={15} /></span>
                                            <div>
                                                <strong>{holiday.name}</strong>
                                                <span>{holiday.date}</span>
                                            </div>
                                            <b>{days(holiday.days)}</b>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </article>
                    </aside>
                </section>
            </div>
        </div>
    );
}

export default EmployeeLeaveOverview;
