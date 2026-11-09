// Live preview of the offer letter, laid out like a letter. The wording comes from
// backend/services/offerLetterContent.js, the same module the email uses, so the two never differ.
import { useTranslation } from "react-i18next";
import {
    OFFER_ACCEPT_LABEL,
    OFFER_DECLINE_LABEL,
    OFFER_LINK_NOTE,
    OFFER_REPLY_PREFIX,
    OFFER_VALID_DAYS,
    formatOfferDate,
    offerIntro,
    offerRows,
    offerSignature,
    offerSubject,
} from "../../../backend/services/offerLetterContent.js";
import { getAppSettings } from "../../utils/appSettings";

const addDays = (dateKey, days) => {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

// Same rule as issueToken in backend/services/hiring.js: the link expires 14 days after sending
// or at the end of the joining date (midnight that night), whichever is first. The email prints
// the date of that moment, so this assumes the offer is sent today.
const expiryKey = (today, joiningDate) => {
    if (!today || !joiningDate) return "";
    const limit = addDays(today, OFFER_VALID_DAYS);
    return limit <= joiningDate ? limit : addDays(joiningDate, 1);
};

function OfferLetterPreview({ candidateName, company: companyName, job, form, currency, today }) {
    const { t } = useTranslation();
    const company = String(companyName || "Shelter Group"); // same fallback as the email
    // Same date formatter and HR Settings date format as the email and the public offer page
    const { dateFormat } = getAppSettings();
    const formatDate = (key) => formatOfferDate(key, dateFormat);
    const role = { ...job, job_title: job.title };
    const offer = { ...form, currency };
    const expiry = expiryKey(today, form.joining_date);
    const [regards, ...signature] = ["Regards,", ...offerSignature(company).split("\n")];

    return (
        <article className="offer-letter" lang="en" dir="ltr" aria-label={t("recruitment.hiring.offer.previewLabel", { defaultValue: "Offer letter preview" })}>
            <header className="offer-letter-head">
                <span className="offer-letter-mark">{String(company).toUpperCase()}</span>
                <span className="offer-letter-date">{formatDate(today)}</span>
            </header>

            <p className="offer-letter-subject"><span>Subject:</span> {offerSubject(role, company)}</p>
            <p>Hello {candidateName},</p>
            <p>{offerIntro(role, company)}</p>

            <dl className="offer-letter-table">
                {offerRows(role, offer, { dateFormat }).map(([label, value]) => (
                    <div key={label}>
                        <dt>{label}</dt>
                        <dd className={value === null || value === "—" ? "empty" : ""}>
                            {value === null ? t("recruitment.hiring.offer.notEntered", { defaultValue: "Not entered yet" }) : value}
                        </dd>
                    </div>
                ))}
            </dl>

            {/* Before a joining date is entered the real date isn't known yet */}
            <p>
                {expiry
                    ? <>{OFFER_REPLY_PREFIX} <strong>{formatDate(expiry)}</strong>.</>
                    : <>Please accept or decline this offer <strong>within {OFFER_VALID_DAYS} days</strong>.</>}
            </p>
            <div className="offer-letter-buttons">
                <span className="accept" aria-disabled="true">{OFFER_ACCEPT_LABEL}</span>
                <span className="decline" aria-disabled="true">{OFFER_DECLINE_LABEL}</span>
            </div>
            <p className="offer-letter-note">
                {t("recruitment.hiring.offer.buttonsNote", { defaultValue: "These buttons work in the candidate's email." })} {OFFER_LINK_NOTE}
            </p>

            <p className="offer-letter-sign">
                {regards}
                {signature.map((line) => <span key={line}><br />{line}</span>)}
            </p>
        </article>
    );
}

export default OfferLetterPreview;
