// =====================================================
// OFFER LETTER WORDING
// One source for the offer letter text, used by the email (hiring.js → offerEmail) and by the
// HR preview (src/components/recruitment/OfferLetterPreview.jsx), so the two never differ.
// Plain functions only (no Node or browser APIs): the frontend imports this file directly.
//
// `role` is the job + MPR values: job_title, position, designation, grade, department, site,
// accommodation, transport. `offer` is salary, currency, joining_date (YYYY-MM-DD) and
// probation_months.
// =====================================================

export const OFFER_CURRENCY = "QAR";
export const OFFER_VALID_DAYS = 14;

const isBlank = (value) => value === null || value === undefined || value === "";

// The date formats HR Settings offers; anything else falls back to DD-MM-YYYY
const DATE_FORMATS = ["DD-MM-YYYY", "MM-DD-YYYY", "YYYY-MM-DD"];

// "2026-12-01" → "01-12-2026" (or the HR Settings format). Every date in the offer letter
// (email, HR preview, public offer page) goes through this one function.
export const formatOfferDate = (dateKey, dateFormat) => {
    if (isBlank(dateKey)) return "";
    const [YYYY, MM, DD] = String(dateKey).slice(0, 10).split("-");
    const format = DATE_FORMATS.includes(dateFormat) ? dateFormat : DATE_FORMATS[0];
    return format.replace(/DD|MM|YYYY/g, (token) => ({ DD, MM, YYYY })[token]);
};

export const formatOfferMoney = (value) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
export const probationText = (months) => `${months} month${Number(months) === 1 ? "" : "s"}`;
const provided = (value) => (value ? "Provided" : "Not provided");

export const offerSubject = (role, company) => `Offer Letter – ${role.job_title} – ${company}`;
export const offerIntro = (role, company) => `We are pleased to offer you the position of ${role.designation || role.job_title} at ${company}.`;
export const offerSignature = (company) => `HR Team\n${company}`;

export const OFFER_REPLY_PREFIX = "Please accept or decline this offer by";
export const OFFER_ACCEPT_LABEL = "Accept offer";
export const OFFER_DECLINE_LABEL = "Decline offer";
export const OFFER_LINK_NOTE = "This link is personal to you; please do not forward it.";

// [label, value] rows of the letter. A null value means HR hasn't entered it yet (preview only;
// the email is sent with every value filled in). The third argument is optional: the app
// settings (only dateFormat is read), so callers can pass their settings object as it is.
export const offerRows = (role, offer, { dateFormat } = {}) => [
    ["Position", role.position || role.job_title],
    ["Designation", role.designation || role.job_title],
    ...(role.grade ? [["Grade", role.grade]] : []),
    ["Department", role.department || "—"],
    ["Site", role.site || "—"],
    ["Monthly salary", isBlank(offer.salary) ? null : `${offer.currency || OFFER_CURRENCY} ${formatOfferMoney(offer.salary)}`],
    ["Joining date", isBlank(offer.joining_date) ? null : formatOfferDate(offer.joining_date, dateFormat)],
    ["Probation", isBlank(offer.probation_months) ? null : probationText(offer.probation_months)],
    ["Accommodation", provided(role.accommodation)],
    ["Transport", provided(role.transport)],
];
