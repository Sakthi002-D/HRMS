// Leave Policy Setup values that apply-leave checks depend on.

const numberOr = (value, fallback) =>
    value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : fallback;

// Saved policy → limits used by POST /api/leaves. 0 is a valid saved value.
export const leaveRulesFromPolicy = (policy) => ({
    sickEligibleMonths: numberOr(policy?.sickLeave?.eligibleAfterMonths, 3),
    sickDaysPerYear: numberOr(policy?.sickLeave?.yearlyDays, 14),
    casualDaysPerYear: numberOr(policy?.casualLeave?.days, 2),
    maternityDays: numberOr(policy?.maternityLeave?.days, 50),
    paternityDays: numberOr(policy?.paternityLeave?.days, 3),
    bereavementDays: numberOr(policy?.bereavementLeave?.immediateFamilyDays, 14),
    umrahDays: numberOr(policy?.umrahLeave?.days, 7),
    hajjDays: numberOr(policy?.hajjLeave?.days, 14),
});

// Counted in calendar days (weekends and holidays included); every other type counts working days
export const CALENDAR_DAY_LEAVE_TYPES = ["Maternity Leave", "Paternity Leave"];

/*
  The limit for a leave type: { days, perYear }.
  perYear: approved days in the same calendar year count against it (Sick, Casual).
  Otherwise the limit is per request (each maternity, bereavement, Umrah or Hajj leave).
  Types without a limit (Emergency, Unpaid, Compensatory Off, custom types) return null.
*/
export const leaveLimitFor = (leaveType, rules) => ({
    "Sick Leave": { days: rules.sickDaysPerYear, perYear: true },
    "Casual Leave": { days: rules.casualDaysPerYear, perYear: true },
    "Maternity Leave": { days: rules.maternityDays, perYear: false },
    "Paternity Leave": { days: rules.paternityDays, perYear: false },
    "Bereavement Leave": { days: rules.bereavementDays, perYear: false },
    "Umrah Leave": { days: rules.umrahDays, perYear: false },
    "Hajj Leave": { days: rules.hajjDays, perYear: false },
}[leaveType] ?? null);

// Message when a request is over its limit, or null
export const leaveLimitError = (leaveType, requestedDays, rules, takenThisYear = 0) => {
    const limit = leaveLimitFor(leaveType, rules);
    if (!limit) return null;
    const remaining = Math.max(0, limit.days - (limit.perYear ? takenThisYear : 0));
    if (requestedDays <= remaining) return null;
    return limit.perYear
        ? { message: `Only ${remaining} ${leaveType} day(s) remaining this year`, remaining }
        : { message: `${leaveType} can be at most ${limit.days} day(s) per request`, remaining };
};

// Built-in types are always kept; types HR added stay after them.
export const mergeLeaveTypes = (defaults, saved) => [
    ...defaults,
    ...(Array.isArray(saved) ? saved : []).filter((type) => !defaults.includes(type)),
];
