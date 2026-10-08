// =====================================================
// EMPLOYEE DOCUMENTS
//   HR uploads:       Employment Contract, Offer Letter, QID Copy
//   Employee uploads: Visa Copy, Passport Copy (own documents only)
//   Everyone allowed can list / view. Files are stored in the database
//   (Render's disk is wiped on restart, so a folder would lose them).
// =====================================================

import express from "express";
import multer from "multer";
import pool from "../db.js";
import { requireHRActor } from "../services/careerApplications.js";
import { WorkflowError } from "../services/manpowerWorkflow.js";

const router = express.Router();

// Which documents exist, and who uploads each one
const DOCUMENT_TYPES = {
    employment_contract: { label: "Employment Contract", uploadedBy: "HR" },
    offer_letter: { label: "Offer Letter", uploadedBy: "HR" },
    qid_copy: { label: "QID Copy", uploadedBy: "HR" },
    visa_copy: { label: "Visa Copy", uploadedBy: "EMPLOYEE" },
    passport_copy: { label: "Passport Copy", uploadedBy: "EMPLOYEE" },
};

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

// The file is kept in memory just long enough to save it into the database
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    fileFilter: (req, file, callback) => (
        ALLOWED_MIME_TYPES.includes(file.mimetype)
            ? callback(null, true)
            : callback(new Error("Only PDF, JPG or PNG files are allowed"))
    ),
});

// File details returned to the screens (never the file bytes themselves)
const DOCUMENT_INFO_COLUMNS = `
    id, employee_id, doc_type, original_file_name, mime_type, file_size,
    uploaded_by_role, uploaded_by_id, uploaded_at
`;

// Called once at server start (see the ensure...Schema chain in server.js)
export async function ensureEmployeeDocumentSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS employee_document_files (
            id BIGSERIAL PRIMARY KEY,
            employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE ON UPDATE CASCADE,
            doc_type TEXT NOT NULL,
            original_file_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            file_data BYTEA NOT NULL,
            uploaded_by_role TEXT NOT NULL,
            uploaded_by_id TEXT,
            uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (employee_id, doc_type)
        )
    `);

    // Files HR attaches to an employee request (Salary Certificate, NOC, Letter, Expense)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS employee_request_files (
            request_id BIGINT PRIMARY KEY REFERENCES employee_requests(id) ON DELETE CASCADE,
            original_file_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            file_data BYTEA NOT NULL,
            uploaded_by_id TEXT,
            uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

class DocumentError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

// Turns thrown errors into { message } replies the screens can show
const handle = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next);
    } catch (error) {
        if (error instanceof DocumentError || error instanceof WorkflowError) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error("Employee documents error:", error);
        res.status(500).json({ message: "Something went wrong with the document. Please try again." });
    }
};

// Who is asking (actor_id), and are they allowed to see this employee's documents?
async function getAccess(req) {
    const actorId = String(req.query.actor_id || "").trim();
    const employeeId = String(req.params.employeeId || "");
    if (!actorId) throw new DocumentError("Please log in again", 401);

    const employee = await pool.query(`SELECT employee_id FROM employees WHERE employee_id = $1`, [employeeId]);
    if (!employee.rows.length) throw new DocumentError("Employee not found", 404);

    let isHR = false;
    try {
        await requireHRActor(pool, actorId);
        isHR = true;
    } catch (error) {
        if (!(error instanceof WorkflowError)) throw error;
    }

    const isSelf = actorId === employeeId;
    if (!isHR && !isSelf) throw new DocumentError("You can only access your own documents", 403);
    return { actorId, isHR, isSelf };
}

// Who is asking about an employee REQUEST, and are they allowed?
// hrOnly = true → only HR (uploading). Otherwise HR or the employee who raised it (viewing).
async function getRequestAccess(req, { hrOnly = false } = {}) {
    const actorId = String(req.query.actor_id || "").trim();
    if (!actorId) throw new DocumentError("Please log in again", 401);
    if (!/^\d+$/.test(String(req.params.requestId))) throw new DocumentError("Request not found", 404);

    const { rows } = await pool.query(
        `SELECT id, employee_id, request_type, status FROM employee_requests WHERE id = $1`,
        [req.params.requestId]
    );
    const request = rows[0];
    if (!request) throw new DocumentError("Request not found", 404);

    let isHR = false;
    try {
        await requireHRActor(pool, actorId);
        isHR = true;
    } catch (error) {
        if (!(error instanceof WorkflowError)) throw error;
    }

    const isOwner = actorId === String(request.employee_id);
    if (hrOnly ? !isHR : !(isHR || isOwner)) {
        throw new DocumentError(hrOnly ? "Only HR can upload request documents" : "You can only view your own requests", 403);
    }
    return { actorId, request };
}

// LIST: all uploaded documents of one employee (details only)
router.get("/employees/:employeeId/documents", handle(async (req, res) => {
    await getAccess(req);
    const { rows } = await pool.query(
        `SELECT ${DOCUMENT_INFO_COLUMNS} FROM employee_document_files WHERE employee_id = $1 ORDER BY doc_type`,
        [req.params.employeeId]
    );
    res.set("Cache-Control", "no-store");
    res.json(rows);
}));

// UPLOAD (or replace): 1) check permission, 2) receive the file, 3) save it
router.post(
    "/employees/:employeeId/documents/:docType",
    handle(async (req, res, next) => {
        const type = DOCUMENT_TYPES[req.params.docType];
        if (!type) throw new DocumentError("Unknown document type", 404);

        const access = await getAccess(req);
        const allowed = type.uploadedBy === "HR" ? access.isHR : access.isSelf;
        if (!allowed) {
            throw new DocumentError(
                type.uploadedBy === "HR"
                    ? `${type.label} is uploaded by HR`
                    : `${type.label} is uploaded by the employee from the Employee portal`,
                403
            );
        }
        req.documentAccess = access;
        next();
    }),
    (req, res, next) => upload.single("document")(req, res, (error) => {
        if (!error) return next();
        res.status(400).json({
            message: error.code === "LIMIT_FILE_SIZE" ? "The file must be 5 MB or smaller" : error.message || "Upload failed",
        });
    }),
    handle(async (req, res) => {
        if (!req.file) throw new DocumentError("Choose a file to upload");
        const type = DOCUMENT_TYPES[req.params.docType];
        const { actorId } = req.documentAccess;

        const { rows } = await pool.query(
            `INSERT INTO employee_document_files
                (employee_id, doc_type, original_file_name, mime_type, file_size, file_data, uploaded_by_role, uploaded_by_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (employee_id, doc_type) DO UPDATE SET
                original_file_name = EXCLUDED.original_file_name,
                mime_type = EXCLUDED.mime_type,
                file_size = EXCLUDED.file_size,
                file_data = EXCLUDED.file_data,
                uploaded_by_role = EXCLUDED.uploaded_by_role,
                uploaded_by_id = EXCLUDED.uploaded_by_id,
                uploaded_at = CURRENT_TIMESTAMP
             RETURNING ${DOCUMENT_INFO_COLUMNS}`,
            [
                req.params.employeeId,
                req.params.docType,
                req.file.originalname,
                req.file.mimetype,
                req.file.size,
                req.file.buffer,
                type.uploadedBy,
                actorId,
            ]
        );
        res.status(201).json(rows[0]);
    })
);

// VIEW / DOWNLOAD the actual file (?download=1 saves it instead of opening it)
router.get("/employees/:employeeId/documents/:docType/file", handle(async (req, res) => {
    await getAccess(req);
    const { rows } = await pool.query(
        `SELECT original_file_name, mime_type, file_data FROM employee_document_files WHERE employee_id = $1 AND doc_type = $2`,
        [req.params.employeeId, req.params.docType]
    );
    if (!rows.length) throw new DocumentError("Document not found", 404);

    const file = rows[0];
    const disposition = req.query.download ? "attachment" : "inline";
    res.set("Content-Type", file.mime_type);
    res.set("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(file.original_file_name)}`);
    res.set("Cache-Control", "no-store");
    res.send(file.file_data);
}));
// HR attaches the issued document to an employee request (or replaces it)
router.post(
    "/employee-requests/:requestId/file",
    handle(async (req, res, next) => {
        const access = await getRequestAccess(req, { hrOnly: true });
        const status = String(access.request.status).toLowerCase();
        if (status === "rejected") {
            throw new DocumentError("This request was rejected, so no document can be attached");
        }
        if (status !== "approved") {
            throw new DocumentError("Approve the request first, then upload the document");
        }
        req.requestAccess = access;
        next();
    }),
    (req, res, next) => upload.single("document")(req, res, (error) => {
        if (!error) return next();
        res.status(400).json({
            message: error.code === "LIMIT_FILE_SIZE" ? "The file must be 5 MB or smaller" : error.message || "Upload failed",
        });
    }),
    handle(async (req, res) => {
        if (!req.file) throw new DocumentError("Choose a file to upload");
        const { rows } = await pool.query(
            `INSERT INTO employee_request_files
                (request_id, original_file_name, mime_type, file_size, file_data, uploaded_by_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (request_id) DO UPDATE SET
                original_file_name = EXCLUDED.original_file_name,
                mime_type = EXCLUDED.mime_type,
                file_size = EXCLUDED.file_size,
                file_data = EXCLUDED.file_data,
                uploaded_by_id = EXCLUDED.uploaded_by_id,
                uploaded_at = CURRENT_TIMESTAMP
             RETURNING request_id, original_file_name, mime_type, file_size, uploaded_at`,
            [req.params.requestId, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer, req.requestAccess.actorId]
        );
        res.status(201).json(rows[0]);
    })
);

// View the file attached to a request (HR, or the employee who raised it)
router.get("/employee-requests/:requestId/file", handle(async (req, res) => {
    await getRequestAccess(req);
    const { rows } = await pool.query(
        `SELECT original_file_name, mime_type, file_data FROM employee_request_files WHERE request_id = $1`,
        [req.params.requestId]
    );
    if (!rows.length) throw new DocumentError("No document has been uploaded for this request yet", 404);

    const file = rows[0];
    res.set("Content-Type", file.mime_type);
    res.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.original_file_name)}`);
    res.set("Cache-Control", "no-store");
    res.send(file.file_data);
}));

export default router;