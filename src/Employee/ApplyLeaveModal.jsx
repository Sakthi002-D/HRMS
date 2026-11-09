import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, CalendarPlus, CheckCircle2, ChevronDown, X } from "lucide-react";
import DatePicker from "../components/layout/common/DatePicker";

const COMPANY_TIMEZONE = "Asia/Qatar";

// Today's date (YYYY-MM-DD) in the company timezone, not the browser's
const getTodayInTimeZone = (timeZone) => {
    const format = (zone) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    try {
        return format(timeZone || COMPANY_TIMEZONE);
    } catch {
        return format(COMPANY_TIMEZONE);
    }
};

function ApplyLeaveModal({
    formData, handleChange, setFormData, leaveTypes, selectedLeaveInfo, requestedDays, dayCountError = "", dayCountPending = false,
    loading, onSubmit, onClose, timeZone = COMPANY_TIMEZONE,
}) {
    const { t, i18n } = useTranslation();

    // Leave type values stay in English (they are saved); only the shown name is translated
    const leaveTypeName = (leaveType) => t(`leaveTypes.${leaveType}`, { defaultValue: leaveType });

    const today = getTodayInTimeZone(timeZone);
    const fromDateError = formData.from_date && formData.from_date < today ? t("applyLeave.pastDateError") : "";
    const toDateError = formData.to_date && formData.to_date < today
        ? t("applyLeave.pastDateError")
        : formData.from_date && formData.to_date && formData.to_date < formData.from_date ? t("applyLeave.toBeforeFrom") : "";
    const hasDateError = Boolean(fromDateError || toDateError);
    const datesChosen = Boolean(formData.from_date && formData.to_date && !hasDateError);

    // Balance this request is checked against: Annual uses what can still be applied for (balance − pending)
    const balance = selectedLeaveInfo.available ?? selectedLeaveInfo.remaining;
    const hasBalance = balance !== null && balance !== undefined;
    const afterRequest = hasBalance && datesChosen && !dayCountPending ? balance - requestedDays : null;
    const overLimit = afterRequest !== null && afterRequest < 0;
    const usedShare = hasBalance && balance + (selectedLeaveInfo.used || 0) > 0
        ? ((selectedLeaveInfo.used || 0) / (balance + (selectedLeaveInfo.used || 0))) * 100
        : 0;
    const requestShare = hasBalance && datesChosen && balance + (selectedLeaveInfo.used || 0) > 0
        ? Math.min((requestedDays / (balance + (selectedLeaveInfo.used || 0))) * 100, 100 - usedShare)
        : 0;

    const blocked = loading || hasDateError || Boolean(dayCountError) || overLimit || !selectedLeaveInfo.eligible;

    // Escape closes the form
    useEffect(() => {
        const onKey = (event) => { if (event.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const handleFromDateChange = (value) => setFormData((previous) => ({
        ...previous,
        from_date: value,
        // A From Date after the current To Date clears To Date
        to_date: value && previous.to_date && previous.to_date < value ? "" : previous.to_date,
    }));

    const handleSubmit = (event) => {
        if (blocked) {
            event.preventDefault();
            return;
        }
        onSubmit(event);
    };

    const longDate = (value) => {
        const [year, month, day] = String(value).split("-").map(Number);
        return new Date(year, month - 1, day).toLocaleDateString(i18n.language === "ar" ? "ar" : "en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    };
    const dayCountLabel = selectedLeaveInfo.calendarDays
        ? t("applyLeave.calendarDays", { count: requestedDays, defaultValue: "{{count}} calendar days" })
        : t("applyLeave.workingDays", { count: requestedDays, defaultValue: "{{count}} working days" });

    const details = [
        [t("applyLeave.entitlement"), selectedLeaveInfo.entitlement],
        [t("applyLeave.pay"), selectedLeaveInfo.pay],
        [t("applyLeave.approval"), selectedLeaveInfo.approval],
        [t("applyLeave.document"), selectedLeaveInfo.document],
    ].filter(([, value]) => value);

    return (
        <div className="employee-modal alm-overlay">
            <div className="employee-modal-card apply-leave-card alm" data-datepicker-boundary role="dialog" aria-modal="true" aria-labelledby="alm-title">
                <header className="alm-head">
                    <span className="alm-head-icon"><CalendarPlus size={20} /></span>
                    <div>
                        <h2 id="alm-title">{t("applyLeave.title")}</h2>
                        <p>{t("applyLeave.subtitle")}</p>
                    </div>
                    <button type="button" className="alm-close" onClick={onClose} aria-label={t("applyLeave.close")}><X size={18} /></button>
                </header>

                <form className="alm-form" onSubmit={handleSubmit}>
                    <div className="alm-body">
                        <div className="alm-main">
                            {/* Leave type */}
                            <div className="alm-field">
                                <label htmlFor="alm-type">{t("applyLeave.leaveType")}</label>
                                <div className="alm-select">
                                    <select id="alm-type" name="leave_type" value={formData.leave_type} onChange={handleChange}>
                                        {leaveTypes.map((leaveType) => (
                                            <option key={leaveType} value={leaveType}>{leaveTypeName(leaveType)}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} aria-hidden="true" />
                                </div>
                            </div>

                            {/* Dates */}
                            <div className="alm-dates">
                                <div className="alm-field">
                                    <label>{t("applyLeave.fromDate")}</label>
                                    <DatePicker value={formData.from_date} onChange={handleFromDateChange} minDate={today} today={today} autoPosition />
                                    {fromDateError && <small className="date-field-error">{fromDateError}</small>}
                                </div>
                                <span className="alm-dates-arrow" aria-hidden="true"><ArrowRight size={16} /></span>
                                <div className="alm-field">
                                    <label>{t("applyLeave.toDate")}</label>
                                    <DatePicker
                                        value={formData.to_date}
                                        onChange={(value) => setFormData((previous) => ({ ...previous, to_date: value }))}
                                        minDate={formData.from_date && formData.from_date > today ? formData.from_date : today}
                                        today={today}
                                        autoPosition
                                    />
                                    {toDateError && <small className="date-field-error">{toDateError}</small>}
                                </div>
                            </div>

                            {/* What the server will count for these dates */}
                            <div className={`alm-range${dayCountError ? " error" : ""}`} aria-live="polite">
                                {!datesChosen ? (
                                    <span className="alm-range-hint">{t("applyLeave.pickDates", { defaultValue: "Pick your dates to see how many days this request uses." })}</span>
                                ) : dayCountError ? (
                                    <span className="alm-range-hint"><AlertTriangle size={15} aria-hidden="true" />{dayCountError}</span>
                                ) : (
                                    <>
                                        <div className="alm-range-dates">
                                            <span>{longDate(formData.from_date)}</span>
                                            <ArrowRight size={14} aria-hidden="true" />
                                            <span>{longDate(formData.to_date)}</span>
                                        </div>
                                        <strong>{dayCountPending ? t("applyLeave.counting", { defaultValue: "Counting…" }) : dayCountLabel}</strong>
                                        <small>
                                            {selectedLeaveInfo.calendarDays
                                                ? t("applyLeave.calendarNote", { defaultValue: "Every calendar day is counted." })
                                                : t("applyLeave.excludedNote", { defaultValue: "Fridays, Saturdays and public holidays are not counted." })}
                                        </small>
                                    </>
                                )}
                            </div>

                            {/* Reason */}
                            <div className="alm-field">
                                <label htmlFor="alm-reason">{t("applyLeave.reason")}</label>
                                <textarea id="alm-reason" name="reason" rows="3" maxLength={500} placeholder={t("applyLeave.reasonPlaceholder")} value={formData.reason} onChange={handleChange} />
                                <small className="alm-count">{(formData.reason || "").length} / 500</small>
                            </div>
                        </div>

                        {/* Live eligibility and balance for the chosen type */}
                        <aside className={`alm-side ${selectedLeaveInfo.eligible ? "eligible" : "not-eligible"}`}>
                            <div className="alm-status">
                                {selectedLeaveInfo.eligible ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                                <strong>{selectedLeaveInfo.eligible ? t("applyLeave.eligible") : t("applyLeave.notEligible")}</strong>
                            </div>
                            <p className="alm-detail">{selectedLeaveInfo.detail}</p>

                            {hasBalance && (
                                <div className="alm-balance">
                                    <div className="alm-balance-top">
                                        <span>{selectedLeaveInfo.available !== undefined && selectedLeaveInfo.available !== null ? t("applyLeave.availableToApply") : t("applyLeave.balance", { defaultValue: "Balance" })}</span>
                                        <strong>{t("applyLeave.daysValue", { count: balance })}</strong>
                                    </div>
                                    <div className="alm-meter" aria-hidden="true">
                                        <i className="used" style={{ width: `${usedShare}%` }} />
                                        <i className={`request${overLimit ? " over" : ""}`} style={{ width: `${requestShare}%` }} />
                                    </div>
                                    <div className="alm-balance-legend">
                                        <span className="used">{t("employeeHero.used", { defaultValue: "Used" })}: {selectedLeaveInfo.used || 0}</span>
                                        {datesChosen && !dayCountError && <span className="request">{t("applyLeave.requested", { defaultValue: "This request" })}: {dayCountPending ? "…" : requestedDays}</span>}
                                    </div>
                                    {afterRequest !== null && (
                                        <div className={`alm-after${overLimit ? " over" : ""}`}>
                                            {overLimit
                                                ? t("applyLeave.overLimit", { count: Math.abs(afterRequest), defaultValue: "{{count}} days more than you have" })
                                                : t("applyLeave.afterLeft", { count: afterRequest, defaultValue: "{{count}} days left after this request" })}
                                        </div>
                                    )}
                                </div>
                            )}

                            <dl className="alm-facts">
                                {details.map(([label, value]) => (
                                    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                                ))}
                            </dl>
                        </aside>
                    </div>

                    <footer className="alm-foot">
                        <span className="alm-foot-summary">
                            {datesChosen && !dayCountError && !dayCountPending ? `${leaveTypeName(formData.leave_type)} · ${dayCountLabel}` : leaveTypeName(formData.leave_type)}
                        </span>
                        <div className="alm-foot-actions">
                            <button type="button" className="alm-btn" onClick={onClose}>{t("applyLeave.cancel", { defaultValue: "Cancel" })}</button>
                            <button type="submit" className="alm-btn primary" disabled={blocked || !datesChosen || dayCountPending}>
                                {loading ? t("applyLeave.submitting") : t("applyLeave.submit")}
                            </button>
                        </div>
                    </footer>
                </form>
            </div>
        </div>
    );
}

export default ApplyLeaveModal;
