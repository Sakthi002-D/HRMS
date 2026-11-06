// Public offer page (/offer/:token, no login): the candidate accepts or declines their offer.
// Shows only this candidate's offer summary; the link works once and expires (backend/services/hiring.js).
// Opening the link never saves an answer (email scanners open links automatically):
// ?answer=accept / ?answer=decline only pre-selects the choice, and the candidate must confirm it.
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CircleCheck, CircleX, Clock3, Lock } from "lucide-react";
import CareersHeader from "../components/careers/CareersHeader";
import CareersFooter from "../components/careers/CareersFooter";
import API_URL from "../config/api";
import "./Careers.css";

// Load the offer. Any failure becomes one friendly message; the real error is logged by the backend.
async function loadOffer(token) {
    let data = {};
    try {
        const response = await fetch(`${API_URL}/api/careers/offers/${encodeURIComponent(token || "")}`, { cache: "no-store" });
        data = await response.json().catch(() => ({}));
        if (response.ok) return data;
    } catch {
        // network error: same friendly message below
    }
    const contact = data.supportEmail || "our HR team";
    throw new Error(`We couldn't load your offer. Please try again later or contact ${contact}.`);
}

const MESSAGES = {
    invalid: { icon: Lock, tone: "closed", title: "This link is not valid", text: "Please use the link in your offer email exactly as it was sent, or contact our HR team." },
    expired: { icon: Clock3, tone: "closed", title: "This offer link has expired", text: "The time to respond to this offer has passed, or a newer offer email was sent. Please contact our HR team." },
    answered: { icon: CircleCheck, tone: "", title: "You have already responded to this offer", text: "Your answer has been recorded. Our HR team will contact you if anything else is needed." },
    accepted: { icon: CircleCheck, tone: "success", title: "Thank you – you have accepted the offer", text: "Welcome aboard! Our HR team will contact you shortly about the pre-joining documents and your first day." },
    declined: { icon: CircleX, tone: "", title: "Thank you for letting us know", text: "You have declined the offer. We appreciate your time and wish you every success." },
};

async function respond(token, answer, reason) {
    const response = await fetch(`${API_URL}/api/careers/offers/${encodeURIComponent(token)}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, reason }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Your answer could not be saved. Please try again.");
    return data;
}

function Message({ kind }) {
    const { icon: Icon, tone, title, text } = MESSAGES[kind];
    return (
        <div className={`careers-empty offer-message ${tone}`} role="status">
            <Icon size={44} aria-hidden="true" />
            <h2>{title}</h2>
            <p>{text}</p>
        </div>
    );
}

function OfferResponse() {
    const { token } = useParams();
    const [searchParams] = useSearchParams();
    const [state, setState] = useState({ loading: true, data: null, error: "" });
    // "accept" | "decline" | "" — pre-selected from the email button, saved only on Confirm
    const [choice, setChoice] = useState(["accept", "decline"].includes(searchParams.get("answer")) ? searchParams.get("answer") : "");
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let ignore = false;
        loadOffer(token)
            .then((data) => !ignore && setState({ loading: false, data, error: "" }))
            .catch((err) => !ignore && setState({ loading: false, data: null, error: err.message }));
        return () => { ignore = true; };
    }, [token]);

    const answer = async (choice) => {
        setBusy(true);
        setError("");
        try {
            const data = await respond(token, choice, choice === "decline" ? reason.trim() : "");
            setResult(data.alreadyAnswered ? "answered" : data.state);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    let content;
    if (state.loading) content = <p className="careers-state">Loading your offer...</p>;
    else if (state.error) content = <p className="careers-state error">{state.error}</p>;
    else if (result) content = <Message kind={MESSAGES[result] ? result : "invalid"} />;
    else if (state.data.state !== "open") content = <Message kind={["accepted", "declined"].includes(state.data.state) ? "answered" : state.data.state === "expired" ? "expired" : "invalid"} />;
    else {
        const { offer, company } = state.data;
        content = (
            <section className="career-detail-section offer-card">
                <p className="careers-eyebrow">OFFER LETTER</p>
                <h1>{offer.job_title}</h1>
                <p className="offer-greeting">Dear {offer.candidate_name}, we are pleased to offer you this position at {company}.</p>
                <dl className="offer-summary">
                    {offer.rows.map(([label, value]) => (
                        <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                        </div>
                    ))}
                </dl>
                <p className="careers-muted">Please respond by <strong>{offer.expires_on}</strong>. You can answer only once.</p>

                {choice === "accept" && (
                    <div className="offer-decline">
                        <p className="careers-muted">You are accepting this offer. Click the button below to confirm.</p>
                        <div className="offer-buttons">
                            <button type="button" className="career-apply-btn" onClick={() => answer("accept")} disabled={busy}>
                                {busy ? "Saving..." : "Confirm acceptance"}
                            </button>
                            <button type="button" className="careers-clear" onClick={() => setChoice("")} disabled={busy}>Back</button>
                        </div>
                    </div>
                )}
                {choice === "decline" && (
                    <div className="offer-decline">
                        <label htmlFor="offer-decline-reason">Reason for declining (optional)</label>
                        <textarea id="offer-decline-reason" rows="3" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
                        <div className="offer-buttons">
                            <button type="button" className="career-apply-btn offer-decline-btn" onClick={() => answer("decline")} disabled={busy}>
                                {busy ? "Saving..." : "Confirm decline"}
                            </button>
                            <button type="button" className="careers-clear" onClick={() => setChoice("")} disabled={busy}>Back</button>
                        </div>
                    </div>
                )}
                {!choice && (
                    <div className="offer-buttons">
                        <button type="button" className="career-apply-btn" onClick={() => setChoice("accept")}>Accept offer</button>
                        <button type="button" className="career-apply-btn offer-decline-btn" onClick={() => setChoice("decline")}>Decline offer</button>
                    </div>
                )}
                {error && <p className="careers-state error" role="alert">{error}</p>}
            </section>
        );
    }

    return (
        <div className="careers-page">
            <CareersHeader />
            <main className="careers-main narrow">{content}</main>
            <CareersFooter />
        </div>
    );
}

export default OfferResponse;
