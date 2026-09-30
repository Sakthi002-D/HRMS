import DatePicker from "../components/layout/common/DatePicker";

const COMPANY_TIMEZONE = "Asia/Qatar";
const PAST_DATE_ERROR = "Past dates cannot be selected";

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
    const today = getTodayInTimeZone(timeZone);
    const fromDateError = formData.from_date && formData.from_date < today ? PAST_DATE_ERROR : "";
    const toDateError = formData.to_date && formData.to_date < today
        ? PAST_DATE_ERROR
        : formData.from_date && formData.to_date && formData.to_date < formData.from_date ? "To Date cannot be before From Date" : "";
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

    return <div className="employee-modal"><div className="employee-modal-card apply-leave-card" data-datepicker-boundary><button className="modal-close" onClick={onClose}>×</button><h2>Apply for Leave</h2><p>Submit a new leave request</p><form onSubmit={handleSubmit}><div className="form-group"><label>Leave Type</label><select name="leave_type" value={formData.leave_type} onChange={handleChange}>{leaveTypes.map((leaveType) => <option key={leaveType} value={leaveType}>{leaveType}</option>)}</select><div className={`leave-eligibility ${selectedLeaveInfo.eligible ? "eligible" : "not-eligible"}`}><div className="leave-status-line"><strong>{selectedLeaveInfo.eligible ? "Eligible to apply" : "Not eligible yet"}</strong><span>{selectedLeaveInfo.eligible ? "✓" : "!"}</span></div><small>{selectedLeaveInfo.detail}</small><div className="leave-detail-grid"><div><small>Entitlement</small><b>{selectedLeaveInfo.entitlement}</b></div>{selectedLeaveInfo.remaining !== null && <div><small>{selectedLeaveInfo.balanceLabel || "Used / Remaining"}</small><b>{selectedLeaveInfo.used || 0} / {selectedLeaveInfo.remaining} days</b></div>}{selectedLeaveInfo.available !== undefined && selectedLeaveInfo.available !== null && <div><small>Available to apply</small><b>{selectedLeaveInfo.available} days</b></div>}<div><small>Pay</small><b>{selectedLeaveInfo.pay}</b></div><div><small>Approval</small><b>{selectedLeaveInfo.approval}</b></div><div><small>Document</small><b>{selectedLeaveInfo.document}</b></div>{requestedDays > 0 && selectedLeaveInfo.remaining !== null && <div><small>After request</small><b>{Math.max(0, selectedLeaveInfo.remaining - requestedDays)} days</b></div>}</div></div></div><div className="form-row"><div className="form-group"><label>From Date</label><DatePicker value={formData.from_date} onChange={handleFromDateChange} minDate={today} today={today} autoPosition />{fromDateError && <small className="date-field-error">{fromDateError}</small>}</div><div className="form-group"><label>To Date</label><DatePicker value={formData.to_date} onChange={(value) => setFormData((previous) => ({ ...previous, to_date: value }))} minDate={formData.from_date && formData.from_date > today ? formData.from_date : today} today={today} autoPosition />{toDateError && <small className="date-field-error">{toDateError}</small>}</div></div><div className="form-group"><label>Reason</label><textarea name="reason" rows="4" placeholder="Enter reason for leave..." value={formData.reason} onChange={handleChange} /></div><button type="submit" className="submit-leave-btn" disabled={loading || hasDateError}>{loading ? "Submitting..." : "Submit Leave Request"}</button></form></div></div>;
}

export default ApplyLeaveModal;
