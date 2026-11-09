// =====================================================
// RESIGNATION: employee form, approvals, HR lists, settings,
// notice period, exit clearance (FRD SHELTER-HCM-SSP-20-001)
//
// Identity: the caller is req.auth.employeeId (signed session token).
// Employee portal logins may only: read their own page, submit, withdraw, act on Line Manager /
// Department Head steps they hold (/decision/...) and clear items of departments they own.
// =====================================================

import express from "express";
import multer from "multer";
import pool from "../db.js";
import { isDocumentStorageConfigured, signedDocumentUrl, uploadDocument } from "../services/documentStorage.js";
import { sendEmailNow } from "../services/notificationService.js";
import { getAppSettingsSafe } from "../services/appSettings.js";
import { WorkflowError, getRolesFor, roleLabel } from "../services/manpowerWorkflow.js";
import {
    RESIGNATION_STEP_ROLES,
    approveResignation,
    completeDueResignations,
    getResignationDetail,
    getTrackedResignationId,
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
import {
    CLEARANCE_STATUSES,
    EXIT_MAIN_REASONS,
    listClearanceTasks,
    proceedToFinalSettlement,
    recordEmployeeWithdrew,
    saveNoticeDetails,
    startExitClearance,
    updateClearanceItem,
} from "../services/resignationExit.js";
import {
    EXIT_CHECKLIST,
    approveSettlement,
    completeSeparation,
    decideSettlement,
    issueExitDocument,
    listSettlementTasks,
    returnToClearance,
    saveSettlementDraft,
    sendSettlementToFinance,
    terminationReport,
    updateExitChecklist,
} from "../services/resignationSettlement.js";

const router = express.Router();

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
        if (["42P01", "42703"].includes(error.code) || (error.code === "23514" && error.constraint === "resignations_status_check")) {
            console.error("Resignation schema error (run backend/migrations/029_resignation_exit_clearance.sql):", error.message);
            return res.status(503).json({ message: "The resignation database update has not been applied yet. Please contact the administrator." });
        }
        console.error("Resignation API error:", error);
        res.status(500).json({ message: "Something went wrong. Please try again." });
    }
};

// Resignation emails go through the SMTP_* settings in .env (sendEmailNow; it falls back to the
// Gmail settings when SMTP_HOST is not set). Sent after COMMIT; a failed email never undoes the step.
// HR Settings → "Email Notifications" off skips them, like other staff emails.
async function sendResignationEmails(queue) {
    if (!queue?.length) return;
    const settings = await getAppSettingsSafe();
    if (settings.emailNotifications === false) return;
    for (const mail of queue) {
        sendEmailNow(mail).catch((error) => console.error(`Resignation email to ${mail.to} failed:`, error.message));
    }
}

// Runs fn in a transaction; queued emails are sent only after COMMIT
async function inTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        sendResignationEmails(result?.emails);
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

const actorFrom = (req) => req.auth?.employeeId;
const isEmployeePortal = (req) => req.auth?.identityType === "employee";

async function requireHR(req) {
    if (isEmployeePortal(req)) throw new WorkflowError("HR access required", 403);
    const { roles } = await getRolesFor(pool, actorFrom(req));
    if (!roles.some((item) => item.role === "HR")) throw new WorkflowError("Only HR can do this", 403);
}

const detailFor = (req, id) => getResignationDetail(pool, id, actorFrom(req), { identityType: req.auth.identityType });

// =====================================================
// SETTINGS (HR portal → Settings)
// =====================================================

async function activeGrades() {
    try {
        const result = await pool.query(`SELECT code FROM grades WHERE active = TRUE ORDER BY sort_order, code`);
        return result.rows.map((row) => row.code);
    } catch (error) {
        if (error.code === "42P01") return [];
        throw error;
    }
}

router.get("/resignations/settings", handle(async (req, res) => {
    const roleLabels = Object.fromEntries(RESIGNATION_STEP_ROLES.map((role) => [role, roleLabel(role)]));
    const [settings, grades] = await Promise.all([getResignationSettings(), activeGrades()]);
    res.json({ settings, stepRoles: RESIGNATION_STEP_ROLES, roleLabels, grades });
}));

router.put("/resignations/settings", handle(async (req, res) => {
    await requireHR(req);
    res.json({ settings: await saveResignationSettings(req.body?.settings || {}) });
}));

// =====================================================
// EMPLOYEE
// =====================================================

// Everything the Resignation page needs in one call
router.get("/resignations/employee/:employeeId", handle(async (req, res) => {
    const employeeId = req.params.employeeId;
    const employeePortal = isEmployeePortal(req);
    const [form, activeId, history, approvals, clearanceTasks, settlementTasks, rolesInfo] = await Promise.all([
        getResignationFormInfo(pool, employeeId),
        getTrackedResignationId(pool, employeeId),
        listEmployeeResignations(pool, employeeId),
        listResignationsForApprover(pool, employeeId, { employeePortal }),
        listClearanceTasks(pool, employeeId),
        listSettlementTasks(pool, employeeId),
        getRolesFor(pool, employeeId),
    ]);
    const approverRoles = ["LINE_MANAGER", "DEPT_HEAD", ...(employeePortal ? [] : ["HR"])];

    res.set("Cache-Control", "no-store");
    res.json({
        ...form,
        active: activeId ? await getResignationDetail(pool, activeId, employeeId, { identityType: req.auth.identityType }) : null,
        history,
        approvals,
        clearanceTasks,
        settlementTasks,
        clearanceStatuses: CLEARANCE_STATUSES,
        isApprover: approvals.length > 0 || clearanceTasks.length > 0 || settlementTasks.length > 0
            || rolesInfo.roles.some((item) => [...approverRoles, "FINANCE"].includes(item.role)),
    });
}));

router.post("/resignations", acceptLetter, handle(async (req, res) => {
    const employeeId = isEmployeePortal(req) ? req.auth.employeeId : req.body?.employee_id;
    if (!employeeId) throw new WorkflowError("Sign in again: your employee ID is missing", 401);
    if (req.file && !isDocumentStorageConfigured()) throw new WorkflowError("The letter could not be uploaded: document storage is not configured on the server", 503);

    // Uploaded with the backend's service key (private bucket); only the path is saved. A failed
    // upload fails the whole request (inside the transaction), so no broken link is stored.
    const uploadLetter = req.file
        ? async () => {
            const extension = (req.file.originalname.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
            const safeId = String(employeeId).replace(/[^A-Za-z0-9_-]/g, "_");
            const path = `resignations/${safeId}/letter-${Date.now()}.${extension}`;
            await uploadDocument(path, req.file.buffer, { contentType: req.file.mimetype, label: "The letter" });
            return { url: path, name: req.file.originalname };
        }
        : null;

    const { resignation } = await inTransaction((db) => submitResignation(db, { employeeId, body: req.body, uploadLetter }));
    res.status(201).json(await getResignationDetail(pool, resignation.id, employeeId, { identityType: req.auth.identityType }));
}));

// =====================================================
// APPROVALS
// =====================================================

router.get("/resignations/approvals", handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await listResignationsForApprover(pool, actorFrom(req), { employeePortal: isEmployeePortal(req) }));
}));

// Resignation letter: HR or the employee who owns it gets a signed URL valid for 10 minutes.
// Old records store a public URL; it's turned back into the storage path here.
router.get("/resignations/:id/letter", handle(async (req, res) => {
    const result = await pool.query(`SELECT employee_id, letter_url, letter_name FROM resignations WHERE id = $1`, [req.params.id]);
    const row = result.rows[0];
    if (!row) throw new WorkflowError("Resignation not found", 404);
    const isOwner = String(row.employee_id) === String(actorFrom(req));
    if (!isOwner) await requireHR(req);
    if (!row.letter_url) throw new WorkflowError("No resignation letter was attached", 404);
    const signed = await signedDocumentUrl(row.letter_url);
    res.set("Cache-Control", "no-store");
    res.json({ url: signed.url, name: row.letter_name || "Resignation letter", expiresIn: signed.expiresIn });
}));

router.get("/resignations/:id", handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await detailFor(req, req.params.id));
}));

const decide = (action) => (db, req) => {
    const common = { id: req.params.id, actorId: actorFrom(req), remark: req.body?.remark, employeePortal: isEmployeePortal(req) };
    return action === "approve"
        ? approveResignation(db, { ...common, lastWorkingDay: req.body?.last_working_day, noticePeriodDays: req.body?.notice_period_days })
        : rejectResignation(db, common);
};

// Line Manager / Department Head (Employee portal → My Approvals) and HR: approve or reject the
// current step. The service checks the caller holds the step (Employee portal: not the HR step).
router.post("/resignations/:id/decision/:action", handle(async (req, res) => {
    if (!["approve", "reject"].includes(req.params.action)) throw new WorkflowError("Unknown action", 404);
    await inTransaction((db) => decide(req.params.action)(db, req));
    res.json(await detailFor(req, req.params.id));
}));

// Exit clearance item: the department owner (Employee portal → My Approvals → Clearance) or HR
router.put("/resignations/:id/clearance/items/:itemId", handle(async (req, res) => {
    await inTransaction((db) => updateClearanceItem(db, {
        id: req.params.id,
        itemId: req.params.itemId,
        actorId: actorFrom(req),
        identityType: req.auth.identityType,
        status: req.body?.status,
        amount: req.body?.amount,
        remark: req.body?.remark,
    }));
    const tasks = await listClearanceTasks(pool, actorFrom(req));
    let detail = null;
    try {
        detail = await detailFor(req, req.params.id);
    } catch (error) {
        if (!(error instanceof WorkflowError)) throw error;
    }
    res.json({ resignation: detail, clearanceTasks: tasks });
}));

// Finance (Employee portal → My Approvals → Settlements, or the HR case window): approve / return
router.post("/resignations/:id/settlement/:decision", handle(async (req, res) => {
    if (!["approve", "return"].includes(req.params.decision)) throw new WorkflowError("Unknown action", 404);
    await inTransaction((db) => decideSettlement(db, {
        id: req.params.id,
        actorId: actorFrom(req),
        action: req.params.decision,
        remark: req.body?.remark,
    }));
    const settlementTasks = await listSettlementTasks(pool, actorFrom(req));
    let resignation = null;
    if (!isEmployeePortal(req)) resignation = await detailFor(req, req.params.id).catch(() => null);
    res.json({ resignation, settlementTasks });
}));

// Experience certificate / relieving letter: HR's browser sends the PDF; it's emailed to the employee
router.post("/resignations/:id/documents/:type", handle(async (req, res) => {
    await requireHR(req);
    await inTransaction((db) => issueExitDocument(db, {
        id: req.params.id,
        actorId: actorFrom(req),
        identityType: req.auth.identityType,
        type: req.params.type,
        body: req.body || {},
    }));
    res.json(await detailFor(req, req.params.id));
}));

const hrAction = (fn) => (db, req) => fn(db, {
    id: req.params.id,
    actorId: actorFrom(req),
    identityType: req.auth.identityType,
    remark: req.body?.remark,
    body: req.body || {},
});

const ACTIONS = {
    approve: decide("approve"),
    reject: decide("reject"),
    withdraw: (db, req) => withdrawResignation(db, { id: req.params.id, actorId: actorFrom(req), remark: req.body?.remark }),
    // HR only (Serving Notice / Exit Clearance)
    "notice-details": hrAction(saveNoticeDetails),
    "employee-withdrew": hrAction(recordEmployeeWithdrew),
    "start-clearance": hrAction(startExitClearance),
    "final-settlement": hrAction(proceedToFinalSettlement),
    // HR only (Final Settlement / Exit Formalities). Who approves the settlement comes from
    // Settings → Resignation → Final settlement: HR → approve-settlement; Finance → send-to-finance
    "settlement-draft": hrAction(saveSettlementDraft),
    "approve-settlement": hrAction(approveSettlement),
    "return-to-clearance": hrAction(returnToClearance),
    "send-to-finance": hrAction(sendSettlementToFinance),
    "exit-checklist": hrAction(updateExitChecklist),
    "complete-separation": hrAction(completeSeparation),
};
const HR_ONLY_ACTIONS = [
    "notice-details", "employee-withdrew", "start-clearance", "final-settlement",
    "settlement-draft", "approve-settlement", "return-to-clearance", "send-to-finance", "exit-checklist", "complete-separation",
];

router.post("/resignations/:id/:action", handle(async (req, res) => {
    if (isEmployeePortal(req)) {
        if (req.params.action !== "withdraw") throw new WorkflowError("HR access required", 403);
        const owned = await pool.query(
            "SELECT id FROM resignations WHERE id = $1 AND employee_id = $2",
            [req.params.id, req.auth.employeeId]
        );
        if (!owned.rows.length) throw new WorkflowError("Resignation not found", 404);
    }
    const run = ACTIONS[req.params.action];
    if (!run) throw new WorkflowError("Unknown action", 404);
    if (HR_ONLY_ACTIONS.includes(req.params.action)) await requireHR(req);
    await inTransaction((db) => run(db, req));
    res.json(await detailFor(req, req.params.id));
}));

// =====================================================
// HR PORTAL
// =====================================================

router.get("/hr/resignations", handle(async (req, res) => {
    await requireHR(req);
    res.set("Cache-Control", "no-store");
    res.json(await listAllResignations());
}));

router.get("/hr/resignations/meta", handle(async (req, res) => {
    await requireHR(req);
    res.json({ exitMainReasons: EXIT_MAIN_REASONS, clearanceStatuses: CLEARANCE_STATUSES, exitChecklist: EXIT_CHECKLIST });
}));

// Reports → Termination report: employees who left (Resigned / Terminated / ...), with settlement
router.get("/hr/resignations/termination-report", handle(async (req, res) => {
    await requireHR(req);
    const date = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : null);
    res.set("Cache-Control", "no-store");
    res.json(await terminationReport(pool, { from: date(req.query.from), to: date(req.query.to) }));
}));

router.get("/hr/end-of-service", handle(async (req, res) => {
    await requireHR(req);
    res.set("Cache-Control", "no-store");
    res.json(await listPendingEndOfService());
}));

// Runs the daily completion job now (it also runs automatically every day)
router.post("/hr/resignations/run-daily-job", handle(async (req, res) => {
    await requireHR(req);
    const { completed, emails } = await completeDueResignations();
    sendResignationEmails(emails);
    res.json({ completed: completed.length });
}));

export default router;
