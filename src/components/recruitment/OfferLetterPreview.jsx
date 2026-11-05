// Live preview of the offer letter email (same rows and wording as offerEmail in backend/services/hiring.js).
import { useTranslation } from "react-i18next";
import { formatDate, formatMoney } from "./recruitmentApi";

const addDays = (dateKey, days) => {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

const offerLetterRows = (job, form, currency) => [
    ["Position", job.position || job.title],
    ["Designation", job.designation || job.title],
    ...(job.grade ? [["Grade", job.grade]] : []),
    ["Department", job.department || "—"],
    ["Site", job.site || "—"],
    ["Monthly salary", form.salary ? `${currency} ${formatMoney(form.salary)}` : "—"],
    ["Joining date", form.joining_date ? formatDate(form.joining_date) : "—"],
    ["Probation", form.probation_months ? `${form.probation_months} month${Number(form.probation_months) === 1 ? "" : "s"}` : "—"],
    ["Accommodation", job.accommodation ? "Provided" : "Not provided"],
    ["Transport", job.transport ? "Provided" : "Not provided"],
];

function OfferLetterPreview({ candidateName, company, job, form, currency, today }) {
    const { t } = useTranslation();
    // The link expires 14 days after sending or at the end of the joining date, whichever is first
    const expires = form.joining_date && today
        ? (addDays(today, 14) < form.joining_date ? addDays(today, 14) : form.joining_date)
        : "";

    return (
        <div className="offer-preview" aria-label={t("recruitment.hiring.offer.previewLabel", { defaultValue: "Offer letter preview" })}>
            <div className="offer-preview-subject">
                <span>{t("recruitment.hiring.offer.subject", { defaultValue: "Subject" })}</span>
                Offer Letter – {job.title} – {company}
            </div>
            <div className="offer-preview-body">
                <p>Hello {candidateName},</p>
                <p>We are pleased to offer you the position of {job.designation || job.title} at {company}.</p>
                <table>
                    <tbody>
                        {offerLetterRows(job, form, currency).map(([label, value]) => (
                            <tr key={label}><td>{label}</td><td>{value}</td></tr>
                        ))}
                    </tbody>
                </table>
                <p>Please accept or decline this offer by <strong>{expires ? formatDate(expires) : "—"}</strong>.</p>
                <div className="offer-preview-buttons" aria-hidden="true">
                    <span className="accept">Accept offer</span>
                    <span className="decline">Decline offer</span>
                </div>
                <p className="offer-preview-muted">This link is personal to you; please do not forward it.</p>
                <p>Regards,<br />HR Team<br />{company}</p>
            </div>
        </div>
    );
}

export default OfferLetterPreview;
