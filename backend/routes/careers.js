// =====================================================
// CAREERS (public, no login) + HR → Recruitment → Job Applications
//
// Public:  /api/careers/meta, /api/careers/jobs, /api/careers/jobs/:jobId,
//          POST /api/careers/jobs/:jobId/apply (multipart: "application" JSON + "cv" file)
// HR only: /api/hr/job-applications… (caller's employee ID from the session, as in
//          the rest of this API, checked against the HR role on every call)
// =====================================================

import express from "express";
import multer from "multer";
import pool from "../db.js";
import { sendQueuedEmails } from "../services/notificationService.js";
import { WorkflowError } from "../services/manpowerWorkflow.js";
import {
    CV_MAX_BYTES,
    ValidationError,
    actOnApplication,
    getApplicationCv,
    getApplicationDetail,
    getCareersMeta,
    getPublicJob,
    listApplications,
    listPublicJobs,
    requireHRActor,
    submitApplication,
} from "../services/careerApplications.js";

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
        console.error("Careers API error:", error);
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

// =====================================================
// SPAM PROTECTION
// =====================================================

// In-memory, per IP: APPLY_LIMIT submissions per APPLY_WINDOW_MS
const APPLY_LIMIT = 8;
const APPLY_WINDOW_MS = 15 * 60 * 1000;
const applyHits = new Map();

const rateLimitApply = (req, res, next) => {
    const now = Date.now();
    const key = req.ip || "unknown";
    const recent = (applyHits.get(key) || []).filter((time) => now - time < APPLY_WINDOW_MS);
    if (recent.length >= APPLY_LIMIT) {
        res.set("Retry-After", String(Math.ceil((APPLY_WINDOW_MS - (now - recent[0])) / 1000)));
        return res.status(429).json({ message: "Too many applications from your network. Please try again in a few minutes." });
    }
    recent.push(now);
    applyHits.set(key, recent);
    next();
};

setInterval(() => {
    const now = Date.now();
    applyHits.forEach((times, key) => {
        if (!times.some((time) => now - time < APPLY_WINDOW_MS)) applyHits.delete(key);
    });
}, APPLY_WINDOW_MS).unref();

const cvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: CV_MAX_BYTES, files: 1, fields: 10, fieldSize: 200 * 1024 },
}).single("cv");

const acceptCv = (req, res, next) =>
    cvUpload(req, res, (error) => {
        if (!error) return next();
        const message = error.code === "LIMIT_FILE_SIZE" ? "CV must be 5 MB or smaller" : "The application could not be read. Please try again.";
        res.status(400).json({ message, fields: error.code === "LIMIT_FILE_SIZE" ? { cv: message } : undefined });
    });

// =====================================================
// PUBLIC
// =====================================================

router.get("/careers/meta", handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getCareersMeta());
}));

router.get("/careers/jobs", handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await listPublicJobs());
}));

router.get("/careers/jobs/:jobId", handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getPublicJob(req.params.jobId));
}));

router.post("/careers/jobs/:jobId/apply", rateLimitApply, acceptCv, handle(async (req, res) => {
    // Honeypot: a hidden field real candidates never fill in
    if (String(req.body?.website || "").trim()) throw new WorkflowError("Your application could not be submitted", 400);

    let input;
    try {
        input = JSON.parse(req.body?.application || "{}");
    } catch {
        throw new WorkflowError("The application could not be read. Please try again.");
    }

    const { application, candidateEmail } = await inTransaction((db) =>
        submitApplication(db, { jobCode: req.params.jobId, input, file: req.file })
    );
    // Only sends when EMAIL_USER / EMAIL_PASS are set in .env
    sendQueuedEmails([candidateEmail]);
    res.status(201).json(application);
}));

// =====================================================
// HR
// =====================================================

const hrIdFrom = (req) => req.get("x-employee-id") || req.query.employee_id || req.body?.actor_id;

router.get("/hr/job-applications", handle(async (req, res) => {
    await requireHRActor(pool, hrIdFrom(req));
    res.set("Cache-Control", "no-store");
    res.json(await listApplications());
}));

// Unreviewed applications (sidebar + tab badge)
router.get("/hr/job-applications/new", handle(async (req, res) => {
    await requireHRActor(pool, hrIdFrom(req));
    res.set("Cache-Control", "no-store");
    res.json((await pool.query(`SELECT id FROM public.job_applications WHERE status = 'New'`)).rows);
}));

router.get("/hr/job-applications/:id", handle(async (req, res) => {
    await requireHRActor(pool, hrIdFrom(req));
    res.set("Cache-Control", "no-store");
    res.json(await getApplicationDetail(pool, req.params.id));
}));

// Streams the private CV; there is no public URL for it
router.get("/hr/job-applications/:id/cv", handle(async (req, res) => {
    await requireHRActor(pool, hrIdFrom(req));
    const cv = await getApplicationCv(pool, req.params.id);
    const inline = req.query.inline === "1" && cv.cv_mime === "application/pdf";
    const fileName = `${cv.application_id}-${cv.cv_name || "cv"}`.replace(/["\r\n]/g, "");
    res.set({
        "Content-Type": cv.cv_mime || "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    });
    res.send(cv.buffer);
}));

router.post("/hr/job-applications/:id/:action", handle(async (req, res) => {
    const detail = await inTransaction((db) =>
        actOnApplication(db, { id: req.params.id, action: req.params.action, actorId: hrIdFrom(req), remark: req.body?.remark })
    );
    res.json(detail);
}));

export default router;
