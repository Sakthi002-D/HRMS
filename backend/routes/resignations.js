// =====================================================
// RESIGNATION: employee form, approvals, HR lists, settings
// FRD SHELTER-HCM-SSP-20-001
//
// Identity: like the rest of this API, the caller's employee ID comes from the
// client session (actor_id / employee_id).
// =====================================================

import express from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import pool from "../db.js";
import { sendQueuedEmails } from "../services/notificationService.js";
import { WorkflowError, getRolesFor, roleLabel } from "../services/manpowerWorkflow.js";
import {
    RESIGNATION_STEP_ROLES,
    approveResignation,
    completeDueResignations,
    getActiveResignationId,
    getResignationDetail,
    getResignationFormInfo,
    getResignationSettings,
    listAllResignations,
    listEmployeeResignations,
    listPendingEndOfService,
    listResignationsForApprover,
    rejectResignation,
    saveResignationSettings,
    submitResignation,
    withdrawResignation,
} from "../services/resignationWorkflow.js";

const router = express.Router();

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const LETTER_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
];

const letterUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (LETTER_TYPES.includes(file.mimetype)) return callback(null, true);
        callback(new WorkflowError("Resignation letter must be a PDF, Word document or image"));
    },
}).single("letter");

// Multer errors (size / type) become 400s instead of 500s
const acceptLetter = (req, res, next) =>
    letterUpload(req, res, (error) => {
        if (!error) return next();
        const message = error.code === "LIMIT_FILE_SIZE" ? "Resignation letter must be 5 MB or smaller" : error.message;
        res.status(400).json({ message });
    });

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        if (error instanceof WorkflowError) {
            return res.status(error.status).json({ message: error.message });
        }
        if (error.code === "23505") {
            return res.status(409).json({ message: "You already have an active resignation" });
        }
        console.error("Resignation API error:", error);
        res.status(500).json({ message: "Something went wrong. Please try again." });
    }
};

// Runs fn in a transaction; queued emails are sent only after COMMIT
async function inTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        sendQueuedEmails(result?.emails);
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

const actorFrom = (req) => req.body?.actor_id || req.query.employee_id || req.query.actor_id;

async function requireHR(actorId) {
    const { roles } = await getRolesFor(pool, actorId);
    if (!roles.some((item) => item.role === "HR")) throw new WorkflowError("Only HR can do this", 403);
}

// =====================================================
// SETTINGS (HR portal → Settings)
// =====================================================

router.get("/resignations/settings", handle(async (req, res) => {
    const roleLabels = Object.fromEntries(RESIGNATION_STEP_ROLES.map((role) => [role, roleLabel(role)]));
    res.json({ settings: await getResignationSettings(), stepRoles: RESIGNATION_STEP_ROLES, roleLabels });
}));

router.put("/resignations/settings", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    res.json({ settings: await saveResignationSettings(req.body?.settings || {}) });
}));

// =====================================================
// EMPLOYEE
// =====================================================

// Everything the Resignation page needs in one call
router.get("/resignations/employee/:employeeId", handle(async (req, res) => {
    const employeeId = req.params.employeeId;
    const [form, activeId, history, approvals, rolesInfo] = await Promise.all([
        getResignationFormInfo(pool, employeeId),
        getActiveResignationId(pool, employeeId),
        listEmployeeResignations(pool, employeeId),
        listResignationsForApprover(pool, employeeId),
        getRolesFor(pool, employeeId),
    ]);
    const approverRoles = ["LINE_MANAGER", "DEPT_HEAD", "HR"];

    res.set("Cache-Control", "no-store");
    res.json({
        ...form,
        active: activeId ? await getResignationDetail(pool, activeId, employeeId) : null,
        history,
        approvals,
        isApprover: approvals.length > 0 || rolesInfo.roles.some((item) => approverRoles.includes(item.role)),
    });
}));

router.post("/resignations", acceptLetter, handle(async (req, res) => {
    const employeeId = req.body?.employee_id;
    if (!employeeId) throw new WorkflowError("Sign in again: your employee ID is missing", 401);
    if (req.file && !supabase) throw new WorkflowError("Document storage is not configured, so the letter can't be uploaded", 503);

    const uploadLetter = req.file
        ? async () => {
            const extension = req.file.originalname.split(".").pop()?.toLowerCase() || "bin";
            const fileName = `resignations/${employeeId}/letter-${Date.now()}.${extension}`;
            const { error } = await supabase.storage.from("employee-documents").upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
            if (error) throw new WorkflowError(`Unable to upload the resignation letter: ${error.message}`, 502);
            const { data } = supabase.storage.from("employee-documents").getPublicUrl(fileName);
            return { url: data.publicUrl, name: req.file.originalname };
        }
        : null;

    const { resignation } = await inTransaction((db) => submitResignation(db, { employeeId, body: req.body, uploadLetter }));
    res.status(201).json(await getResignationDetail(pool, resignation.id, employeeId));
}));

// =====================================================
// APPROVALS
// =====================================================

router.get("/resignations/approvals", handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await listResignationsForApprover(pool, actorFrom(req)));
}));

router.get("/resignations/:id", handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getResignationDetail(pool, req.params.id, actorFrom(req)));
}));

const ACTIONS = {
    approve: (db, req) => approveResignation(db, {
        id: req.params.id,
        actorId: actorFrom(req),
        remark: req.body?.remark,
        lastWorkingDay: req.body?.last_working_day,
    }),
    reject: (db, req) => rejectResignation(db, { id: req.params.id, actorId: actorFrom(req), remark: req.body?.remark }),
    withdraw: (db, req) => withdrawResignation(db, { id: req.params.id, actorId: actorFrom(req), remark: req.body?.remark }),
};

router.post("/resignations/:id/:action", handle(async (req, res) => {
    const run = ACTIONS[req.params.action];
    if (!run) throw new WorkflowError("Unknown action", 404);
    await inTransaction((db) => run(db, req));
    res.json(await getResignationDetail(pool, req.params.id, actorFrom(req)));
}));

// =====================================================
// HR PORTAL
// =====================================================

router.get("/hr/resignations", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    res.set("Cache-Control", "no-store");
    res.json(await listAllResignations());
}));

router.get("/hr/end-of-service", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    res.set("Cache-Control", "no-store");
    res.json(await listPendingEndOfService());
}));

// Runs the daily completion job now (it also runs automatically every day)
router.post("/hr/resignations/run-daily-job", handle(async (req, res) => {
    await requireHR(actorFrom(req));
    const { completed, emails } = await completeDueResignations();
    sendQueuedEmails(emails);
    res.json({ completed: completed.length });
}));

export default router;
