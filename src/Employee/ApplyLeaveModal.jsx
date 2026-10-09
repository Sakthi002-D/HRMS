import { useTranslation } from "react-i18next";
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

function ApplyLeaveModal({ formData, handleChange, setFormData, leaveTypes, selectedLeaveInfo, requestedDays, loading, onSubmit, onClose, timeZone = COMPANY_TIMEZONE }) {
    const { t } = useTranslation();

    // Leave type values stay in English (they are saved); only the shown name is translated
    const leaveTypeName = (leaveType) => t(`leaveTypes.${leaveType}`, { defaultValue: leaveType });

    const today = getTodayInTimeZone(timeZone);
    const fromDateError = formData.from_date && formData.from_date < today ? t("applyLeave.pastDateError") : "";
    const toDateError = formData.to_date && formData.to_date < today
        ? t("applyLeave.pastDateError")
        : formData.from_date && formData.to_date && formData.to_date < formData.from_date ? t("applyLeave.toBeforeFrom") : "";
    const hasDateError = Boolean(fromDateError || toDateError);

    const handleFromDateChange = (value) => setFormData((previous) => ({
        ...previous,
        from_date: value,
        // A From Date after the current To Date clears To Date
        to_date: value && previous.to_date && previous.to_date < value ? "" : previous.to_date,
    }));

    const handleSubmit = (event) => {
        if (hasDateError) {
            event.preventDefault();
            return;
        }
        onSubmit(event);
    };

    // Annual Leave labels its balance "Used / Balance"; other types use "Used / Remaining"
    const balanceLabel = selectedLeaveInfo.balanceLabel === "Used / Balance"
        ? t("applyLeave.usedBalance")
        : t("applyLeave.usedRemaining");

    return (
        <div className="employee-modal">
            <div className="employee-modal-card apply-leave-card" data-datepicker-boundary>
                <button className="modal-close" onClick={onClose} aria-label={t("applyLeave.close")}>×</button>
                <h2>{t("applyLeave.title")}</h2>
                <p>{t("applyLeave.subtitle")}</p>

                <form onSubmit={handleSubmit}>
                    {/* Leave type + eligibility box */}
                    <div className="form-group">
                        <label>{t("applyLeave.leaveType")}</label>
                        <select name="leave_type" value={formData.leave_type} onChange={handleChange}>
                            {leaveTypes.map((leaveType) => (
                                <option key={leaveType} value={leaveType}>{leaveTypeName(leaveType)}</option>
                            ))}
                        </select>

                        <div className={`leave-eligibility ${selectedLeaveInfo.eligible ? "eligible" : "not-eligible"}`}>
                            <div className="leave-status-line">
                                <strong>{selectedLeaveInfo.eligible ? t("applyLeave.eligible") : t("applyLeave.notEligible")}</strong>
                                <span>{selectedLeaveInfo.eligible ? "✓" : "!"}</span>
                            </div>
                            <small>{selectedLeaveInfo.detail}</small>
                            <div className="leave-detail-grid">
                                <div><small>{t("applyLeave.entitlement")}</small><b>{selectedLeaveInfo.entitlement}</b></div>
                                {selectedLeaveInfo.remaining !== null && (
                                    <div>
                                        <small>{balanceLabel}</small>
                                        <b>{t("applyLeave.usedOf", { used: selectedLeaveInfo.used || 0, remaining: selectedLeaveInfo.remaining })}</b>
                                    </div>
                                )}
                                {selectedLeaveInfo.available !== undefined && selectedLeaveInfo.available !== null && (
                                    <div>
                                        <small>{t("applyLeave.availableToApply")}</small>
                                        <b>{t("applyLeave.daysValue", { count: selectedLeaveInfo.available })}</b>
                                    </div>
                                )}
                                <div><small>{t("applyLeave.pay")}</small><b>{selectedLeaveInfo.pay}</b></div>
                                <div><small>{t("applyLeave.approval")}</small><b>{selectedLeaveInfo.approval}</b></div>
                                <div><small>{t("applyLeave.document")}</small><b>{selectedLeaveInfo.document}</b></div>
                                {requestedDays > 0 && selectedLeaveInfo.remaining !== null && (
                                    <div>
                                        <small>{t("applyLeave.afterRequest")}</small>
                                        <b>{t("applyLeave.daysValue", { count: Math.max(0, selectedLeaveInfo.remaining - requestedDays) })}</b>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="form-row">
                        <div className="form-group">
                            <label>{t("applyLeave.fromDate")}</label>
                            <DatePicker value={formData.from_date} onChange={handleFromDateChange} minDate={today} today={today} autoPosition />
                            {fromDateError && <small className="date-field-error">{fromDateError}</small>}
                        </div>
                        <div className="form-group">
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

                    {/* Reason */}
                    <div className="form-group">
                        <label>{t("applyLeave.reason")}</label>
                        <textarea name="reason" rows="4" placeholder={t("applyLeave.reasonPlaceholder")} value={formData.reason} onChange={handleChange} />
                    </div>

                    <button type="submit" className="submit-leave-btn" disabled={loading || hasDateError}>
                        {loading ? t("applyLeave.submitting") : t("applyLeave.submit")}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default ApplyLeaveModal;