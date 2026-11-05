// =====================================================
// RECRUITMENT → HIRING (services/hiring.js)
//
// Public:  GET  /api/careers/offers/:token           offer summary for the /offer/:token page
//          POST /api/careers/offers/:token/respond   { answer: "accept" | "decline", reason }
// HR only: /api/hr/hiring… (caller's employee ID from the session, checked against the HR role)
//
// Like Schedule Interview, every change is saved first; the email goes out after the commit,
// so a failed email never loses the decision.
// =====================================================

import express from "express";
import pool from "../db.js";
import { getAppSettingsSafe } from "../services/appSettings.js";
import { sendEmailNow } from "../services/notificationService.js";
import { WorkflowError } from "../services/manpowerWorkflow.js";
import { ValidationError, requireHRActor } from "../services/careerApplications.js";
import {
    getHiringDetail,
    getPublicOffer,
    hireCandidate,
    listHiring,
    listUnseenResponses,
    markResponseSeen,
    recordInterviewResult,
    recordOfferEmail,
    recordOfferResponse,
    recordResultEmail,
    resendOffer,
    respondToOffer,
    savePrejoiningItem,
    sendOffer,
    suggestEmployeeId,
} from "../services/hiring.js";

const router = express.Router();

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        if (error instanceof ValidationError) {
            return res.status(400).json({ message: error.message, fields: error.fields });
        }
        if (error instanceof WorkflowError) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error("Hiring API error:", error);
        res.status(500).json({ message: "Something went wrong. Please try again." });
    }
};

async function inTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// { sent: true } or { sent: false, reason } — never throws
async function trySend(mail, label) {
    try {
        await sendEmailNow(mail);
        return { sent: true };
    } catch (error) {
        console.error(`${label} email failed:`, error.message);
        return { sent: false, reason: error.message };
    }
}

// =====================================================
// PUBLIC OFFER PAGE
// =====================================================

// In-memory, per IP: OFFER_LIMIT requests per OFFER_WINDOW_MS (tokens are unguessable; this stops hammering)
const OFFER_LIMIT = 30;
const OFFER_WINDOW_MS = 15 * 60 * 1000;
const offerHits = new Map();

const rateLimitOffer = (req, res, next) => {
    const now = Date.now();
    const key = req.ip || "unknown";
    const recent = (offerHits.get(key) || []).filter((time) => now - time < OFFER_WINDOW_MS);
    if (recent.length >= OFFER_LIMIT) {
        res.set("Retry-After", String(Math.ceil((OFFER_WINDOW_MS - (now - recent[0])) / 1000)));
        return res.status(429).json({ message: "Too many requests. Please try again in a few minutes." });
    }
    recent.push(now);
    offerHits.set(key, recent);
    next();
};

setInterval(() => {
    const now = Date.now();
    offerHits.forEach((times, key) => {
        if (!times.some((time) => now - time < OFFER_WINDOW_MS)) offerHits.delete(key);
    });
}, OFFER_WINDOW_MS).unref();

const noIndex = (res) => res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" });

router.get("/careers/offers/:token", rateLimitOffer, handle(async (req, res) => {
    noIndex(res);
    res.json(await getPublicOffer(pool, req.params.token, await getAppSettingsSafe()));
}));

router.post("/careers/offers/:token/respond", rateLimitOffer, handle(async (req, res) => {
    noIndex(res);
    const result = await inTransaction((db) =>
        respondToOffer(db, { token: req.params.token, answer: req.body?.answer, reason: req.body?.reason })
    );
    // HR's copy goes to the company support email (HR Settings); the in-app notification is already saved
    if (result.hrEmail) {
        const settings = await getAppSettingsSafe();
        if (settings.supportEmail) trySend({ ...result.hrEmail, to: settings.supportEmail }, "Offer response (HR)");
        else console.warn("Offer response: no company support email in HR Settings, so HR was only notified in-app");
    }
    res.json({ state: result.state, alreadyAnswered: Boolean(result.alreadyAnswered) });
}));

// =====================================================
// HR
// =====================================================

const hrIdFrom = (req) => req.auth?.employeeId;

const requireHR = async (req) => requireHRActor(pool, hrIdFrom(req));

router.get("/hr/hiring", handle(async (req, res) => {
    await requireHR(req);
    res.set("Cache-Control", "no-store");
    res.json(await listHiring(pool));
}));

// Offer answers HR hasn't opened yet (sidebar + Hiring tab badge)
router.get("/hr/hiring/responses", handle(async (req, res) => {
    await requireHR(req);
    res.set("Cache-Control", "no-store");
    res.json(await listUnseenResponses(pool));
}));

router.get("/hr/hiring/:id", handle(async (req, res) => {
    await requireHR(req);
    res.set("Cache-Control", "no-store");
    res.json(await getHiringDetail(pool, req.params.id));
}));

router.post("/hr/hiring/:id/seen", handle(async (req, res) => {
    await requireHR(req);
    await markResponseSeen(pool, req.params.id);
    res.json({ ok: true });
}));

router.get("/hr/hiring/:id/next-employee-id", handle(async (req, res) => {
    await requireHR(req);
    res.set("Cache-Control", "no-store");
    res.json({ employee_id: await suggestEmployeeId(pool) });
}));

router.post("/hr/hiring/:id/result", handle(async (req, res) => {
    const settings = await getAppSettingsSafe();
    const { interviewId, email } = await inTransaction((db) =>
        recordInterviewResult(db, { id: req.params.id, actorId: hrIdFrom(req), input: req.body, settings })
    );
    const result = await trySend(email, "Interview result");
    await recordResultEmail(pool, interviewId, result).catch((error) => console.error("Unable to record result email:", error.message));
    res.json({ application: await getHiringDetail(pool, req.params.id), email: result });
}));

router.post("/hr/hiring/:id/offer", handle(async (req, res) => {
    const settings = await getAppSettingsSafe();
    const { offerId, email } = await inTransaction((db) =>
        sendOffer(db, { id: req.params.id, actorId: hrIdFrom(req), input: req.body, settings })
    );
    const result = await trySend(email, "Offer letter");
    await recordOfferEmail(pool, offerId, result).catch((error) => console.error("Unable to record offer email:", error.message));
    res.json({ application: await getHiringDetail(pool, req.params.id), email: result });
}));

router.post("/hr/hiring/:id/offer/resend", handle(async (req, res) => {
    const settings = await getAppSettingsSafe();
    const { offerId, email } = await inTransaction((db) =>
        resendOffer(db, { id: req.params.id, actorId: hrIdFrom(req), settings })
    );
    const result = await trySend(email, "Offer letter (resend)");
    await recordOfferEmail(pool, offerId, result).catch((error) => console.error("Unable to record offer email:", error.message));
    res.json({ application: await getHiringDetail(pool, req.params.id), email: result });
}));

router.post("/hr/hiring/:id/offer/response", handle(async (req, res) => {
    await inTransaction((db) => recordOfferResponse(db, { id: req.params.id, actorId: hrIdFrom(req), input: req.body }));
    res.json({ application: await getHiringDetail(pool, req.params.id) });
}));

router.put("/hr/hiring/:id/prejoining", handle(async (req, res) => {
    await inTransaction((db) => savePrejoiningItem(db, { id: req.params.id, actorId: hrIdFrom(req), input: req.body }));
    res.json({ application: await getHiringDetail(pool, req.params.id) });
}));

router.post("/hr/hiring/:id/hire", handle(async (req, res) => {
    const settings = await getAppSettingsSafe();
    const { employee, email } = await inTransaction((db) =>
        hireCandidate(db, { id: req.params.id, actorId: hrIdFrom(req), input: req.body, settings })
    );
    const result = await trySend(email, "Welcome");
    res.json({ application: await getHiringDetail(pool, req.params.id), employee, email: result });
}));

export default router;
