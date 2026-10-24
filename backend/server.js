import express from "express";
import cors from "cors";
import pool from "./db.js";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import assistantRouter from "./routes/assistant.js";
import recruitmentRouter from "./routes/recruitment.js";
import ticketsRouter from "./routes/tickets.js";
import resignationsRouter from "./routes/resignations.js";
import careersRouter from "./routes/careers.js";
import employeeDocumentsRouter, { ensureEmployeeDocumentSchema } from "./routes/employeeDocuments.js";
import { ensureTicketSchema } from "./services/ticketSchema.js";
import { checkLeaveAgainstResignation, ensureResignationSchema, startResignationScheduler } from "./services/resignationWorkflow.js";
import { ensureNotificationSchema, getInbox, sendQueuedEmails } from "./services/notificationService.js";
import { FILLED_APPLICATION_STATUSES, WorkflowError, ensureManpowerSchema, refreshJobFill } from "./services/manpowerWorkflow.js";
import { getCompanyToday } from "./services/leaveDateRules.js";
import { ensureCareerSchema } from "./services/careerApplications.js";
import { validateLeaveDates } from "./services/leaveDateRules.js";
import { ANNUAL_LEAVE_TYPE, checkAnnualLeaveRequest, getAnnualLeaveBalance } from "./services/annualLeaveBalance.js";
import { D365Error, findD365Employee, getD365Employees } from "./services/d365Employees.js";
import { getAttendanceCounts } from "./services/attendanceCounts.js";
import {
    ensureAnnualLeaveAccrualSchema,
    exportAnnualLeaveAccrualForFinance,
    getAnnualLeaveAccrualReport,
    runAnnualLeaveAccrual,
    startAnnualLeaveAccrualScheduler,
} from "./services/annualLeaveAccrual.js";
import { randomBytes, randomInt } from "node:crypto";
import { createApiAccessMiddleware, createLoginHandler, createChangePasswordHandler, requireAuth, requireHR, requireSelfOrHR, signToken, stripPassword } from "./middleware/auth.js";
import { setAccountPassword } from "./services/accountCredentials.js";
import { findPasswordIdentity, createResetPasswordHandler } from "./services/passwordRecovery.js";
import { pullD365Changes, pushEmployeeToD365, startD365SyncScheduler } from "./services/d365EmployeeSync.js";


const app = express();

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    : null;

// Behind Render's proxy: req.ip is the visitor's IP (Careers apply rate limit)
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/api", createApiAccessMiddleware(pool));

// AI Assistant Router
app.use("/api/assistant", assistantRouter);
// Manpower Requests, approval settings, masters, recruitment plan, in-app notifications
app.use("/api", recruitmentRouter);
// Support tickets, ticket categories, support agents, comments
app.use("/api", ticketsRouter);
// Resignation requests, approvals, Pending End of Service
app.use("/api", resignationsRouter);
// Public Careers page + HR Recruitment → Job Applications
app.use("/api", careersRouter);
// Employee documents: HR uploads Contract / Offer Letter / QID, employee uploads Visa / Passport
app.use("/api", employeeDocumentsRouter);

// Test API
app.get("/", (req, res) => {
    res.json({
        message: "HRMS Backend is running",
    });
});

// D365 employee directory pagination limits (server-side paging + search).
const D365_EMPLOYEE_PAGE_SIZE_DEFAULT = 25;
const D365_EMPLOYEE_PAGE_SIZE_MAX = 100;

// Returns a validated positive integer, `fallback` when absent, or null when invalid.
const parseD365PageParam = (raw, fallback, max) => {
    if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) return null;
    return Math.min(value, max);
};

// Search covers only fields D365 EmployeesV2 actually provides (name, personnel number).
const matchesD365EmployeeSearch = (employee, term) => {
    const needle = term.toLowerCase();
    return employee.name.toLowerCase().includes(needle) ||
        employee.personnelNumber.toLowerCase().includes(needle);
};

app.get("/api/d365/employees", async (req, res) => {
    if (req.query.view !== "attendance" && req.query.view !== "directory") {
        return res.status(400).json({ message: "Unsupported employee view" });
    }

    // Absent is fine; repeated/comma params arrive as an array and are rejected.
    if (req.query.search !== undefined && typeof req.query.search !== "string") {
        return res.status(400).json({ message: "search must be a string" });
    }

    const pageSize = parseD365PageParam(
        req.query.pageSize,
        D365_EMPLOYEE_PAGE_SIZE_DEFAULT,
        D365_EMPLOYEE_PAGE_SIZE_MAX
    );
    const page = parseD365PageParam(req.query.page, 1, Number.MAX_SAFE_INTEGER);

    if (pageSize === null || page === null) {
        return res.status(400).json({ message: "page and pageSize must be positive integers" });
    }

    // Pagination/search is opt-in so existing callers keep receiving a plain array.
    const wantsPaging = req.query.page !== undefined
        || req.query.pageSize !== undefined
        || req.query.search !== undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    try {
        const employees = await getD365Employees();
        const matched = search ? employees.filter((employee) => matchesD365EmployeeSearch(employee, search)) : employees;

        if (!wantsPaging) {
            return res.json(matched);
        }

        const total = matched.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * pageSize;

        res.json({
            employees: matched.slice(start, start + pageSize),
            total,
            page: safePage,
            pageSize,
            totalPages,
            search,
        });
    } catch (error) {
        if (error instanceof D365Error) {
            console.error(
                `D365 employees error [stage=${error.stage} upstreamStatus=${error.upstreamStatus ?? "n/a"} code=${error.code ?? "n/a"}]: ${error.message}`
            );
            return res.status(error.httpStatus).json({
                message: "Failed to fetch D365 employees",
                stage: error.stage,
                detail: error.message,
            });
        }

        console.error("D365 employees route error:", error?.code || error?.name, error?.message);
        res.status(500).json({ message: "Failed to fetch D365 employees", stage: "server" });
    }
});

// Manual D365 -> HRMS pull sync for linked employees (HR-only via the global API gate).
let d365ManualSyncRunning = false;
app.post("/api/d365/sync", async (req, res) => {
    if (d365ManualSyncRunning) {
        return res.status(409).json({ message: "A D365 sync is already running" });
    }
    d365ManualSyncRunning = true;
    try {
        const summary = await pullD365Changes(pool);
        res.json({ message: "D365 sync completed", ...summary });
    } catch (error) {
        console.error("D365 manual sync failed:", error.message);
        res.status(502).json({ message: "D365 sync failed" });
    } finally {
        d365ManualSyncRunning = false;
    }
});

// Punches for D365 employees are stored with the D365 identity and no HRMS employee_id
const D365_IDENTITY_FIELDS = ["personnelNumber", "employmentLegalEntityId", "employmentId"];

const hasD365Identity = (body) => D365_IDENTITY_FIELDS.some((field) => body?.[field] != null);

const resolveD365Identity = async (body, res) => {
    if (!D365_IDENTITY_FIELDS.every((field) => typeof body[field] === "string" && body[field].trim() !== "")) {
        res.status(400).json({ message: "personnelNumber, employmentLegalEntityId and employmentId are required" });
        return null;
    }

    try {
        const employee = await findD365Employee(body);
        if (!employee) {
            res.status(404).json({ message: "D365 employee not found" });
            return null;
        }
        return employee;
    } catch (error) {
        if (error instanceof D365Error) {
            console.error(`D365 employee verification error [stage=${error.stage} upstreamStatus=${error.upstreamStatus ?? "n/a"}]: ${error.message}`);
            res.status(error.httpStatus).json({ message: "Unable to verify D365 employee", stage: error.stage });
            return null;
        }
        throw error;
    }
};

const D365_ATTENDANCE_WHERE = `personnel_number = $1
    AND employment_legal_entity_id = $2
    AND employment_id = $3
    AND attendance_date = $4::date`;

const handleD365PunchIn = async (req, res) => {
    const employee = await resolveD365Identity(req.body, res);
    if (!employee) return;

    const timeResult = await pool.query(`
        SELECT
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS today,
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time AS current_time
    `);
    const { today, current_time: punchTime } = timeResult.rows[0];
    const identity = [employee.personnelNumber, employee.employmentLegalEntityId, employee.employmentId];

    const existing = await pool.query(`SELECT * FROM attendance WHERE ${D365_ATTENDANCE_WHERE}`, [...identity, today]);
    if (existing.rows.length > 0) {
        return res.status(400).json({
            message: "Employee has already punched in today",
            attendance: existing.rows[0],
        });
    }

    const [hours, minutes] = punchTime.toString().substring(0, 5).split(":").map(Number);
    const lateMinutes = Math.max(0, hours * 60 + minutes - 9 * 60);

    try {
        const result = await pool.query(
            `INSERT INTO attendance
                (employee_id, attendance_date, punch_in, status, late_minutes, shift, project,
                 personnel_number, employment_legal_entity_id, employment_id,
                 employee_name_snapshot, d365_sync_status)
             VALUES (NULL, $1, $2, $3, $4, '09:00 - 18:00', 'HRMS Portal', $5, $6, $7, $8, 'verified')
             RETURNING *`,
            [today, punchTime, lateMinutes > 0 ? "Late" : "Present", lateMinutes, ...identity, employee.name]
        );

        res.status(201).json({
            message: "Punch In successful",
            employee: { employee_id: employee.personnelNumber, name: employee.name },
            attendance: result.rows[0],
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(400).json({ message: "Employee has already punched in today" });
        }
        throw error;
    }
};

const handleD365PunchOut = async (req, res) => {
    const employee = await resolveD365Identity(req.body, res);
    if (!employee) return;

    const identity = [employee.personnelNumber, employee.employmentLegalEntityId, employee.employmentId];
    const existing = await pool.query(
        `SELECT * FROM attendance
         WHERE ${D365_ATTENDANCE_WHERE.replace("$4::date", "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date")}`,
        identity
    );

    if (existing.rows.length === 0) {
        return res.status(400).json({ message: "Employee has not punched in today" });
    }
    if (existing.rows[0].punch_out) {
        return res.status(400).json({
            message: "Employee has already punched out today",
            attendance: existing.rows[0],
        });
    }

    const result = await pool.query(
        `UPDATE attendance
         SET punch_out = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time
         WHERE id = $1
         RETURNING *`,
        [existing.rows[0].id]
    );

    res.json({
        message: "Punch Out successful",
        employee: { employee_id: employee.personnelNumber, name: employee.name },
        attendance: result.rows[0],
    });
};



// =========================
// GET ATTENDANCE
// =========================

app.get("/api/attendance", async (req, res) => {
    try {
        const requestedDate = req.query.date || null;
        const query = `
                SELECT
                    a.id,
                    e.employee_id,
                    e.name AS employee_name,
                    e.department,
                    COALESCE(a.attendance_date, COALESCE($1::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)) AS attendance_date,
                    a.punch_in,
                    CASE
                        WHEN a.status IS NOT NULL THEN a.status
                        WHEN COALESCE($1::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date) < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 'Absent'
                        ELSE 'Absent'
                    END AS status,
                    a.punch_out,
                    COALESCE(a.late_minutes, 0) AS late_minutes,
                    COALESCE(a.shift, '09:00 - 18:00') AS shift,
                    a.project,

                    CASE
                        WHEN a.punch_out IS NOT NULL
                        THEN ROUND(
                            EXTRACT(
                                EPOCH FROM (a.punch_out - a.punch_in)
                            ) / 60
                        )
                        ELSE NULL
                    END AS working_minutes,

                    CASE
                        WHEN a.punch_out IS NOT NULL
                        THEN LEAST(ROUND(EXTRACT(EPOCH FROM (a.punch_out - a.punch_in)) / 60), 540)
                        ELSE NULL
                    END AS normal_working_minutes,

                    CASE
                        WHEN a.punch_out IS NOT NULL
                        THEN GREATEST(ROUND(EXTRACT(EPOCH FROM (a.punch_out - a.punch_in)) / 60) - 540, 0)
                        ELSE NULL
                    END AS overtime_minutes

                FROM employees e
                LEFT JOIN attendance a
                    ON a.employee_id = e.employee_id
                    AND a.attendance_date = COALESCE($1::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)
                WHERE LOWER(COALESCE(e.status, 'active')) = 'active'
                  AND (
                      a.id IS NOT NULL
                      OR COALESCE($1::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date) < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
                      OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time >= TIME '18:00'
                  )
                ORDER BY a.id DESC NULLS LAST, e.name ASC
            `;
        const values = [requestedDate || null];

        const result = await pool.query(query, values);

        const d365Result = await pool.query(
            `SELECT
                id,
                personnel_number AS employee_id,
                'D365' AS source,
                personnel_number,
                employment_legal_entity_id,
                employment_id,
                COALESCE(employee_name_snapshot, '') AS employee_name,
                COALESCE(department_snapshot, '') AS department,
                attendance_date,
                punch_in,
                COALESCE(status, 'Present') AS status,
                punch_out,
                COALESCE(late_minutes, 0) AS late_minutes,
                COALESCE(shift, '09:00 - 18:00') AS shift,
                project,
                CASE WHEN punch_out IS NOT NULL
                    THEN ROUND(EXTRACT(EPOCH FROM (punch_out - punch_in)) / 60) END AS working_minutes,
                CASE WHEN punch_out IS NOT NULL
                    THEN LEAST(ROUND(EXTRACT(EPOCH FROM (punch_out - punch_in)) / 60), 540) END AS normal_working_minutes,
                CASE WHEN punch_out IS NOT NULL
                    THEN GREATEST(ROUND(EXTRACT(EPOCH FROM (punch_out - punch_in)) / 60) - 540, 0) END AS overtime_minutes
             FROM attendance
             WHERE employee_id IS NULL
               AND personnel_number IS NOT NULL
               AND attendance_date = COALESCE($1::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)`,
            values
        );

        const punched = [...d365Result.rows, ...result.rows.filter((row) => row.id != null)]
            .sort((a, b) => b.id - a.id);
        res.json([...punched, ...result.rows.filter((row) => row.id == null)]);

    } catch (error) {
        console.error("Error fetching attendance:", error);

        res.status(500).json({
            message: "Failed to fetch attendance"
        });
    }
});

// Employee attendance summary for dashboard charts
app.get("/api/attendance/employee/:employeeId/summary", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                COUNT(*) FILTER (
                    WHERE LOWER(COALESCE(status, '')) IN ('present', 'on time')
                      AND COALESCE(late_minutes, 0) = 0
                ) AS on_time,
                COUNT(*) FILTER (
                    WHERE LOWER(COALESCE(status, '')) = 'late'
                       OR COALESCE(late_minutes, 0) > 0
                ) AS late_attendance,
                COUNT(*) FILTER (
                    WHERE LOWER(COALESCE(status, '')) IN ('work from home', 'wfh')
                ) AS work_from_home,
                COUNT(*) FILTER (
                    WHERE LOWER(COALESCE(status, '')) = 'absent'
                ) AS absent
             FROM attendance
             WHERE employee_id = $1`,
            [req.params.employeeId]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching employee attendance summary:", error);
        res.status(500).json({ message: "Failed to fetch attendance summary" });
    }
});

app.get("/api/attendance/employee/:employeeId", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM attendance
             WHERE employee_id = $1
               AND ($2::date IS NULL OR attendance_date = $2::date)
             ORDER BY attendance_date DESC, id DESC`,
            [req.params.employeeId, req.query.date || null]
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching employee attendance:", error);
        res.status(500).json({ message: "Failed to fetch employee attendance" });
    }
});

// Add Attendance
app.post("/api/attendance", async (req, res) => {
    try {
        const {
            employee_id,
            attendance_date,
            punch_in,
            status,
            punch_out,
            break_minutes,
            shift,
            project
        } = req.body;

        const result = await pool.query(
            `INSERT INTO attendance 
            (
                employee_id, 
                attendance_date, 
                punch_in, 
                status, 
                punch_out, 
                break_minutes, 
                shift, 
                project
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING *`,
            [
                employee_id,
                attendance_date,
                punch_in,
                status || "Present",
                punch_out,
                break_minutes || 0,
                shift,
                project
            ]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error("Error adding attendance:", error);

        res.status(500).json({
            message: "Failed to add attendance"
        });
    }
});

// =========================
// BIOMETRIC PUNCH IN API
// =========================

app.post("/api/attendance/punch-in", async (req, res) => {
    try {
        if (hasD365Identity(req.body)) {
            return await handleD365PunchIn(req, res);
        }

        const { employee_id } = req.body;

        if (!employee_id) {
            return res.status(400).json({
                message: "Employee ID is required"
            });
        }

        // Check employee
        const employeeResult = await pool.query(
            `SELECT employee_id, name, department
             FROM employees
             WHERE employee_id = $1
               AND status = 'Active'`,
            [employee_id]
        );

        if (employeeResult.rows.length === 0) {
            return res.status(404).json({
                message: "Active employee not found"
            });
        }

        const employee = employeeResult.rows[0];

        // Get current India date and time
        const timeResult = await pool.query(`
            SELECT
                (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS today,
                (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time AS current_time
        `);

        const today = timeResult.rows[0].today;
        const punchTime = timeResult.rows[0].current_time;

        // Check whether employee already punched in today
        const existingResult = await pool.query(
            `SELECT *
             FROM attendance
             WHERE employee_id = $1
               AND attendance_date = $2`,
            [employee_id, today]
        );

        if (existingResult.rows.length > 0) {
            return res.status(400).json({
                message: "Employee has already punched in today",
                attendance: existingResult.rows[0]
            });
        }

        // Calculate late minutes from 09:00 AM
        const [hours, minutes] = punchTime
            .toString()
            .substring(0, 5)
            .split(":")
            .map(Number);

        const punchTotalMinutes = hours * 60 + minutes;
        const shiftStartMinutes = 9 * 60;

        let lateMinutes = 0;

        if (punchTotalMinutes > shiftStartMinutes) {
            lateMinutes =
                punchTotalMinutes - shiftStartMinutes;
        }

        // Status based on late minutes
        const status =
            lateMinutes > 0 ? "Late" : "Present";

        // Insert attendance
       const result = await pool.query(
    `INSERT INTO attendance
    (
        employee_id,
        attendance_date,
        punch_in,
        status,
        late_minutes,
        shift,
        project
    )
    VALUES
    (
        $1,
        $2,
        $3,
        $4,
        $5,
        '09:00 - 18:00',
        'HRMS Portal'
    )
    RETURNING *`,
    [
        employee_id,
        today,
        punchTime,
        status,
        lateMinutes
    ]
);

        res.status(201).json({
            message: "Punch In successful",
            employee: {
                employee_id: employee.employee_id,
                name: employee.name,
                department: employee.department
            },
            attendance: result.rows[0]
        });

    } catch (error) {
        console.error("Punch In error:", error);

        res.status(500).json({
            message: "Failed to process Punch In"
        });
    }
});

// =========================
// BIOMETRIC PUNCH OUT API
// =========================

app.post("/api/attendance/punch-out", async (req, res) => {
    try {
        if (hasD365Identity(req.body)) {
            return await handleD365PunchOut(req, res);
        }

        const { employee_id, punch_out } = req.body;

        if (!employee_id) {
            return res.status(400).json({
                message: "Employee ID is required"
            });
        }

        // Check employee
        const employeeResult = await pool.query(
            `SELECT employee_id, name, department
             FROM employees
             WHERE employee_id = $1
               AND status = 'Active'`,
            [employee_id]
        );

        if (employeeResult.rows.length === 0) {
            return res.status(404).json({
                message: "Active employee not found"
            });
        }

        const employee = employeeResult.rows[0];

        // Find today's attendance - India timezone
        const attendanceResult = await pool.query(
            `SELECT *
             FROM attendance
             WHERE employee_id = $1
               AND attendance_date =
               (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`,
            [employee_id]
        );

        if (attendanceResult.rows.length === 0) {
            return res.status(400).json({
                message: "Employee has not punched in today"
            });
        }

        const attendance = attendanceResult.rows[0];

        if (attendance.punch_out) {
            return res.status(400).json({
                message: "Employee has already punched out today",
                attendance
            });
        }

        const result = await pool.query(
            `UPDATE attendance
             SET punch_out = COALESCE(
                 $1::time,
                 (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time
             )
             WHERE id = $2
             RETURNING *`,
            [
                punch_out || null,
                attendance.id
            ]
        );

        res.json({
            message: "Punch Out successful",
            employee: {
                employee_id: employee.employee_id,
                name: employee.name,
                department: employee.department
            },
            attendance: result.rows[0]
        });

    } catch (error) {
        console.error("Punch Out error:", error);

        res.status(500).json({
            message: "Failed to process Punch Out"
        });
    }
});

// =========================
// EMPLOYEE APIs
// =========================

// Get all employees
app.get("/api/employees", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT e.*,
                EXISTS (
                    SELECT 1 FROM employee_d365_mapping m
                    WHERE m.employee_id = e.employee_id AND m.link_status = 'linked'
                ) AS d365_linked
             FROM employees e
             ORDER BY e.id ASC`
        );

        res.json(result.rows.map(stripPassword));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch employees",
        });
    }
});

// Get employee detail sections
app.get("/api/employees/:employeeId/details", async (req, res) => {
    try {
        const { employeeId } = req.params;
        const result = await pool.query(
            `SELECT
                e.id,
                e.employee_id,
                e.name,
                e.about,
                e.date_of_birth,
                e.gender,
                e.department,
                e.designation,
                e.email,
                e.phone,
                e.address,
                e.profile_photo,
                e.employment_contract_url,
                e.offer_letter_url,
                e.visa_copy_url,
                e.qid_copy_url,
                e.passport_copy_url,
                e.joining_date,
                e.employment_type,
                e.status,
                e.emergency_contact,
                e.passport_no,
                e.passport_exp_date,
                e.nationality,
                e.religion,
                e.marital_status,
                e.children_count,
                e.legal_entity,
                e.worker_type,
                e.employment_category,
                e.project_role_id,
                e.employment_end_date,
                e.termination_reason,
                e.last_date_worked,
                e.position,
                e.position_title,
                e.assignment_start,
                e.assignment_end,
                e.make_primary,
                COALESCE((SELECT row_to_json(b) FROM employee_bank_details b WHERE b.employee_id = e.employee_id ORDER BY b.id DESC LIMIT 1), '{}'::json) AS bank,
                COALESCE((SELECT row_to_json(f) FROM employee_family_details f WHERE f.employee_id = e.employee_id ORDER BY f.id DESC LIMIT 1), '{}'::json) AS family,
                COALESCE((SELECT json_agg(ed ORDER BY ed.id ASC) FROM employee_education ed WHERE ed.employee_id = e.employee_id), '[]'::json) AS education,
                COALESCE((SELECT json_agg(ex ORDER BY ex.start_date DESC NULLS LAST, ex.id DESC) FROM employee_experience ex WHERE ex.employee_id = e.id), '[]'::json) AS experience,
                COALESCE((SELECT row_to_json(p) FROM employee_projects p WHERE p.employee_id = e.employee_id ORDER BY p.id DESC LIMIT 1), '{}'::json) AS project
             FROM employees e
             WHERE e.employee_id = $1`,
            [employeeId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching employee details:", error);
        res.status(500).json({ message: "Failed to fetch employee details" });
    }
});

app.put("/api/employees/:employeeId/about", requireAuth(pool), requireSelfOrHR, async (req, res) => {
    try {
        const result = await pool.query(
            "UPDATE employees SET about = $1 WHERE employee_id = $2 RETURNING about",
            [req.body.about || null, req.params.employeeId]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: "Employee not found" });
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating employee about:", error);
        res.status(500).json({ message: "Failed to update about details", details: error.message });
    }
});

const detailTableConfig = {
    bank: { table: "employee_bank_details", key: "employee_id", columns: ["account_holder_name", "account_number", "bank_name", "branch_name", "ifsc_code", "account_type"] },
    family: { table: "employee_family_details", key: "employee_id", columns: ["father_name", "mother_name", "spouse_name", "spouse_employment", "marital_status", "children_count"] },
    project: { table: "employee_projects", key: "employee_id", columns: ["project_name", "description", "project_lead", "start_date", "deadline", "status"] },
};

app.post("/api/employees/:employeeId/education", requireAuth(pool), requireSelfOrHR, async (req, res) => {
    try {
        const columns = ["qualification", "institution", "field_of_study", "specialization", "start_year", "end_year", "grade", "education_type", "location", "currently_pursuing", "certificate_url"];
        const values = columns.map((column) => column === "currently_pursuing" ? Boolean(req.body[column]) : req.body[column] ?? null);
        const result = await pool.query(`INSERT INTO employee_education (employee_id, ${columns.join(", ")}) VALUES ($1, ${columns.map((_, index) => `$${index + 2}`).join(", ")}) RETURNING *`, [req.params.employeeId, ...values]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error adding education:", error);
        res.status(500).json({ message: "Failed to add education", details: error.message });
    }
});

app.put("/api/employees/:employeeId/education/:educationId", requireAuth(pool), requireSelfOrHR, async (req, res) => {
    try {
        const columns = ["qualification", "institution", "field_of_study", "specialization", "start_year", "end_year", "grade", "education_type", "location", "currently_pursuing", "certificate_url"];
        const values = columns.map((column) => column === "currently_pursuing" ? Boolean(req.body[column]) : req.body[column] ?? null);
        const assignments = columns.map((column, index) => `${column} = $${index + 1}`).join(", ");
        const result = await pool.query(`UPDATE employee_education SET ${assignments} WHERE id = $${values.length + 1} AND employee_id = $${values.length + 2} RETURNING *`, [...values, req.params.educationId, req.params.employeeId]);
        if (!result.rows.length) return res.status(404).json({ message: "Education record not found" });
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating education:", error);
        res.status(500).json({ message: "Failed to update education", details: error.message });
    }
});

app.delete("/api/employees/:employeeId/education/:educationId", requireAuth(pool), requireSelfOrHR, async (req, res) => {
    try {
        const result = await pool.query("DELETE FROM employee_education WHERE id = $1 AND employee_id = $2 RETURNING id", [req.params.educationId, req.params.employeeId]);
        if (!result.rows.length) return res.status(404).json({ message: "Education record not found" });
        res.json({ id: result.rows[0].id });
    } catch (error) {
        console.error("Error deleting education:", error);
        res.status(500).json({ message: "Failed to delete education", details: error.message });
    }
});

for (const [section, config] of Object.entries(detailTableConfig)) {
    app.put(`/api/employees/:employeeId/${section}`, requireAuth(pool), requireSelfOrHR, async (req, res) => {
        try {
            const { employeeId } = req.params;
            const employeeResult = await pool.query(
                "SELECT employee_id FROM employees WHERE employee_id = $1",
                [employeeId]
            );
            if (employeeResult.rows.length === 0) {
                return res.status(404).json({ message: "Employee not found" });
            }

            const values = config.columns.map((column) => req.body[column] ?? null);
            const existing = await pool.query(
                `SELECT id FROM ${config.table} WHERE ${config.key} = $1 ORDER BY id DESC LIMIT 1`,
                [employeeId]
            );

            let result;
            if (existing.rows.length > 0) {
                const assignments = config.columns.map((column, index) => `${column} = $${index + 1}`).join(", ");
                result = await pool.query(
                    `UPDATE ${config.table} SET ${assignments} WHERE id = $${values.length + 1} RETURNING *`,
                    [...values, existing.rows[0].id]
                );
            } else {
                const columns = [config.key, ...config.columns];
                const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
                result = await pool.query(
                    `INSERT INTO ${config.table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`,
                    [employeeId, ...values]
                );
            }
            res.json(result.rows[0]);
        } catch (error) {
            console.error(`Error updating employee ${section}:`, error);
            res.status(500).json({
                message: `Failed to update ${section} details`,
                details: error.message,
            });
        }
    });
}

app.post("/api/employees/:employeeId/experience", requireAuth(pool), requireSelfOrHR, async (req, res) => {
    try {
        const employeeResult = await pool.query(
            "SELECT id FROM employees WHERE employee_id = $1",
            [req.params.employeeId]
        );
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }
        const employeeDbId = employeeResult.rows[0].id;
        const columns = ["company_name", "designation", "department", "employment_type", "start_date", "end_date", "currently_working", "company_location", "job_description", "responsibilities", "skills", "reason_for_leaving"];
        const values = columns.map((column) => req.body[column] ?? null);
        const result = await pool.query(
            `INSERT INTO employee_experience (employee_id, ${columns.join(", ")}) VALUES ($1, ${columns.map((_, index) => `$${index + 2}`).join(", ")}) RETURNING *`,
            [employeeDbId, ...values]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error adding employee experience:", error);
        res.status(500).json({ message: "Failed to add experience details", details: error.message });
    }
});

app.put("/api/employees/:employeeId/experience/:experienceId", requireAuth(pool), requireSelfOrHR, async (req, res) => {
    try {
        const columns = ["company_name", "designation", "department", "employment_type", "start_date", "end_date", "currently_working", "company_location", "job_description", "responsibilities", "skills", "reason_for_leaving"];
        const values = columns.map((column) => column === "currently_working" ? Boolean(req.body[column]) : req.body[column] ?? null);
        const assignments = columns.map((column, index) => `${column} = $${index + 1}`).join(", ");
        const result = await pool.query(`UPDATE employee_experience SET ${assignments} WHERE id = $${values.length + 1} AND employee_id = (SELECT id FROM employees WHERE employee_id = $${values.length + 2}) RETURNING *`, [...values, req.params.experienceId, req.params.employeeId]);
        if (!result.rows.length) return res.status(404).json({ message: "Experience record not found" });
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating employee experience:", error);
        res.status(500).json({ message: "Failed to update experience details", details: error.message });
    }
});

app.delete("/api/employees/:employeeId/experience/:experienceId", requireAuth(pool), requireSelfOrHR, async (req, res) => {
    try {
        const result = await pool.query("DELETE FROM employee_experience WHERE id = $1 AND employee_id = (SELECT id FROM employees WHERE employee_id = $2) RETURNING id", [req.params.experienceId, req.params.employeeId]);
        if (!result.rows.length) return res.status(404).json({ message: "Experience record not found" });
        res.json({ id: result.rows[0].id });
    } catch (error) {
        console.error("Error deleting employee experience:", error);
        res.status(500).json({ message: "Failed to delete experience details", details: error.message });
    }
});

// ===============================
// FORGOT PASSWORD - SEND OTP
// ===============================

app.post("/api/forgot-password", async (req, res) => {
    try {
        const username = String(req.body?.username ?? req.body?.employee_id ?? "").trim();
        if (!username) {
            return res.status(400).json({
                message: "Username is required",
            });
        }

        const resolved = await findPasswordIdentity(pool, username);
        if (!resolved) {
            return res.status(404).json({
                message: "Account not found",
            });
        }

        const { employee, credentialType } = resolved;

        if (!employee.email) {
            return res.status(400).json({
                message: "No registered email found for this employee",
            });
        }

        // Generate 6 digit OTP
        const otp = randomInt(100000, 1000000).toString();

        // Hash OTP
        const otpHash = await bcrypt.hash(otp, 10);

        // OTP expires in 5 minutes
        const expiresAt = new Date(
            Date.now() + 5 * 60 * 1000
        );

        // Save OTP
        await pool.query(
            `INSERT INTO password_resets
             (employee_id, credential_type, otp_hash, expires_at)
             VALUES ($1, $2, $3, $4)`,
            [
                employee.employee_id,
                credentialType,
                otpHash,
                expiresAt,
            ]
        );

        // Gmail transporter
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // Send OTP
        await transporter.sendMail({
            from: `"HRMS" <${process.env.EMAIL_USER}>`,
            to: employee.email,
            subject: "HRMS Password Reset OTP",
            text: `Hello ${employee.name},

Your HRMS password reset OTP is: ${otp}

This OTP is valid for 5 minutes.

If you did not request a password reset, please ignore this email.

Regards,
HRMS Team`,
        });

        res.json({
            message: "OTP generated successfully",
            email: employee.email,
        });

    } catch (error) {
        console.error(
            "Forgot password error:",
            error
        );

        res.status(500).json({
            message: "Failed to generate OTP",
        });
    }
});


// ===============================
// VERIFY OTP
// ===============================

app.post("/api/verify-otp", async (req, res) => {
    try {
        const username = String(req.body?.username ?? req.body?.employee_id ?? "").trim();
        const { otp } = req.body || {};

        if (!username || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
            return res.status(400).json({
                message: "Employee ID and OTP are required",
            });
        }

        const resolved = await findPasswordIdentity(pool, username);
        if (!resolved) {
            return res.status(400).json({ message: "OTP not found or already used" });
        }
        const result = await pool.query(
            `SELECT *
             FROM password_resets
             WHERE employee_id = $1
               AND credential_type = $2
               AND verified = FALSE
             ORDER BY created_at DESC
             LIMIT 1`,
            [resolved.employee.employee_id, resolved.credentialType]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                message: "OTP not found or already used",
            });
        }

        const reset = result.rows[0];

        // Check expiry
        if (new Date() > new Date(reset.expires_at)) {
            return res.status(400).json({
                message: "OTP has expired",
            });
        }

        // Check attempts
        if (reset.attempts >= 5) {
            return res.status(400).json({
                message: "Too many incorrect attempts",
            });
        }

        // Compare OTP
        const isValid = await bcrypt.compare(
            otp.trim(),
            reset.otp_hash
        );

        if (!isValid) {
            await pool.query(
                `UPDATE password_resets
                 SET attempts = attempts + 1
                 WHERE id = $1 AND verified = FALSE AND attempts < 5
                   AND expires_at >= CURRENT_TIMESTAMP`,
                [reset.id]
            );

            return res.status(400).json({
                message: "Invalid OTP",
            });
        }

        // Mark OTP as verified
        const verified = await pool.query(
            `UPDATE password_resets
             SET verified = TRUE
             WHERE id = $1 AND verified = FALSE AND attempts < 5
               AND expires_at >= CURRENT_TIMESTAMP
             RETURNING id`,
            [reset.id]
        );
        if (verified.rowCount !== 1) {
            return res.status(400).json({ message: "OTP not found or already used" });
        }

        res.json({
            message: "OTP verified successfully",
            reset_token: signToken(resolved.employee.employee_id, {
                identityType: resolved.credentialType,
                credentialVersion: reset.id,
                purpose: "password-reset",
                ttl: 5 * 60,
            }),
        });

    } catch (error) {
        console.error(
            "Verify OTP error:",
            error
        );

        res.status(500).json({
            message: "Failed to verify OTP",
        });
    }
});


// ===============================
// RESET PASSWORD
// ===============================

app.post("/api/reset-password", createResetPasswordHandler(pool));

// Add New Employees
app.post("/api/employees", requireAuth(pool), requireHR, async (req, res) => {
    try {
        const {
            employee_id,
            name,
            department,
            designation,
            email,
            phone,
            date_of_birth,
            gender,
            address,
            joining_date,
            employment_type,
            emergency_contact,
            passport_no,
            passport_exp_date,
            nationality,
            religion,
            marital_status,
            children_count,
            status,
            legal_entity,
            worker_type,
            employment_category,
            project_role_id,
            employment_end_date,
            termination_reason,
            last_date_worked,
            position,
            position_title,
            assignment_start,
            assignment_end,
            make_primary
        } = req.body;

        const result = await pool.query(
            `INSERT INTO employees
            (
                employee_id, 
                name, 
                department, 
                designation, 
                email, 
                phone, 
                date_of_birth,
                gender,
                address,
                joining_date,
                employment_type,
                emergency_contact,
                passport_no,
                passport_exp_date,
                nationality,
                religion,
                marital_status,
                children_count,
                status,
                legal_entity,
                worker_type,
                employment_category,
                project_role_id,
                employment_end_date,
                termination_reason,
                last_date_worked,
                position,
                position_title,
                assignment_start,
                assignment_end,
                make_primary
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
            RETURNING *`,
            [
                employee_id,
                name,
                department,
                designation,
                email,
                phone,
                normalizeDateValue(date_of_birth),
                gender,
                address,
                normalizeDateValue(joining_date),
                employment_type,
                emergency_contact,
                passport_no,
                normalizeDateValue(passport_exp_date),
                nationality,
                religion,
                marital_status,
                children_count === "" || children_count == null ? null : Number(children_count),
                status || "Active",
                legal_entity || "SHLT",
                worker_type || "Employee",
                employment_category || null,
                project_role_id || null,
                employment_end_date || "Never",
                termination_reason || null,
                last_date_worked || null,
                position || designation,
                position_title || designation,
                normalizeDateValue(assignment_start),
                normalizeDateValue(assignment_end),
                Boolean(make_primary)
            ]
        );

        res.status(201).json(stripPassword(result.rows[0]));

    } catch (error) {
        console.error("Error adding employee", error);

        res.status(500).json({
            message: "Failed to add employee"
        });
    }
});


// Update Employee
app.put("/api/employees/:employeeId", requireAuth(pool), requireSelfOrHR, async (req, res) => {
    try {
        const { employeeId } = req.params;

       const {
        employee_id,
        name,
        date_of_birth,
        gender,
        department,
        designation,
        email,
        phone,
        address,
        joining_date,
        employment_type,
        status,
        emergency_contact,
        passport_no,
        passport_exp_date,
        nationality,
        religion,
        marital_status,
        children_count,
        legal_entity,
        worker_type,
        employment_category,
        project_role_id,
        employment_end_date,
        termination_reason,
        last_date_worked,
        position,
        position_title,
        assignment_start,
        assignment_end,
        make_primary,
        profile_photo
        } = req.body;

        // Employee IDs are referenced by attendance, leave, payroll and D365 mapping: never rewritten here
        if (employee_id !== undefined && employee_id !== null && String(employee_id) !== employeeId) {
            return res.status(400).json({ message: "Employee ID cannot be changed" });
        }

        // Employees may self-edit personal details only; master fields keep their stored values
        let master = {};
        if (req.auth.role !== "hr") {
            const current = await pool.query("SELECT * FROM employees WHERE employee_id = $1", [employeeId]);
            if (current.rows.length === 0) {
                return res.status(404).json({ message: "Employee not found" });
            }
            const c = current.rows[0];
            master = {
                ...(String(c.role || "").toLowerCase() === "hr" ? { email: c.email } : {}),
                name: c.name, department: c.department, designation: c.designation,
                joining_date: c.joining_date, employment_type: c.employment_type, status: c.status,
                legal_entity: c.legal_entity, worker_type: c.worker_type,
                employment_category: c.employment_category, project_role_id: c.project_role_id,
                employment_end_date: c.employment_end_date, termination_reason: c.termination_reason,
                last_date_worked: c.last_date_worked, position: c.position, position_title: c.position_title,
                assignment_start: c.assignment_start, assignment_end: c.assignment_end,
                make_primary: c.make_primary,
            };
        }
        const pick = (field, submitted) => (field in master ? master[field] : submitted);

        const result = await pool.query(
  `UPDATE employees
   SET
      employee_id = $1,
      name = $2,
      date_of_birth = $3,
      gender = $4,
      department = $5,
      designation = $6,
      email = $7,
      phone = $8,
      address = $9,
      joining_date = $10,
      employment_type = $11,
      status = $12,
        emergency_contact = $13,
        passport_no = $14,
        passport_exp_date = $15,
        nationality = $16,
        religion = $17,
        marital_status = $18,
        children_count = $19,
        legal_entity = $20,
        worker_type = $21,
        employment_category = $22,
        project_role_id = $23,
        employment_end_date = $24,
        termination_reason = $25,
        last_date_worked = $26,
        position = $27,
        position_title = $28,
        assignment_start = $29,
        assignment_end = $30,
        make_primary = $31,
        profile_photo = $32
    WHERE employee_id = $33
   RETURNING *`,
  [
    employeeId,
    pick("name", name),
    normalizeDateValue(date_of_birth),
    gender,
    pick("department", department),
    pick("designation", designation),
    pick("email", email),
    phone,
    address,
    pick("joining_date", normalizeDateValue(joining_date)),
    pick("employment_type", employment_type),
    pick("status", status),
    emergency_contact,
    passport_no,
    normalizeDateValue(passport_exp_date),
    nationality,
    religion,
    marital_status,
    children_count === "" || children_count == null ? null : Number(children_count),
    pick("legal_entity", legal_entity || "SHLT"),
    pick("worker_type", worker_type || "Employee"),
    pick("employment_category", employment_category || null),
    pick("project_role_id", project_role_id || null),
    pick("employment_end_date", employment_end_date || "Never"),
    pick("termination_reason", termination_reason || null),
    pick("last_date_worked", last_date_worked || null),
    pick("position", position || designation),
    pick("position_title", position_title || designation),
    pick("assignment_start", normalizeDateValue(assignment_start)),
    pick("assignment_end", normalizeDateValue(assignment_end)),
    pick("make_primary", Boolean(make_primary)),
    profile_photo || null,
    employeeId
  ]
);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Employee not found"
            });
        }

        // Best-effort HRMS -> D365 push for linked employees; never blocks the HRMS update.
        pushEmployeeToD365(pool, employeeId)
            .then((push) => {
                if (push.pushed) console.log(`D365 push for ${employeeId}: ${push.fields.join(", ")}`);
                else if (push.reason !== "not-linked") console.warn(`D365 push skipped for ${employeeId}: ${push.reason}`);
            })
            .catch((error) => console.error(`D365 push failed for ${employeeId}:`, error.message));

        res.json(stripPassword(result.rows[0]));

    } catch (error) {
        console.error("Error updating employee:", error);

        res.status(500).json({
            message: "Failed to update employee",
            details: error.message
        });
    }
});

// Set a custom password, or generate a one-time temporary password.
app.post("/api/employees/:employeeId/reset-password", requireAuth(pool), requireHR, async (req, res) => {
    try {
        const customPassword = String(req.body?.custom_password || "").trim();
        if (customPassword && customPassword.length < 6) {
            return res.status(400).json({ message: "Custom password must be at least 6 characters" });
        }

        const password = customPassword || randomBytes(9).toString("base64url").slice(0, 12);
        const passwordHash = await bcrypt.hash(password, 10);
        const identityType = req.body?.identity_type || "employee";
        if (!["employee", "hr"].includes(identityType)) {
            return res.status(400).json({ message: "Invalid account identity type" });
        }
        const updated = await setAccountPassword(pool, {
            identityType,
            employeeId: req.params.employeeId,
            passwordHash,
        });
        const result = updated.rows.length
            ? await pool.query(
                `SELECT employee_id, name FROM employees WHERE employee_id = $1`,
                [req.params.employeeId]
            )
            : updated;

        if (!result.rows.length) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.json({
            message: customPassword ? "Password updated" : "Temporary password generated",
            employee_id: result.rows[0].employee_id,
            employee_name: result.rows[0].name,
            temporary_password: password,
            is_custom_password: Boolean(customPassword),
        });
    } catch (error) {
        console.error("Error resetting employee password:", error);
        res.status(500).json({ message: "Failed to reset employee password" });
    }
});

app.post("/api/employees/:employeeId/change-password", requireAuth(pool), requireSelfOrHR, createChangePasswordHandler(pool));

// =========================
// EMPLOYEE SALARY APIs
// =========================

app.get("/api/payroll", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                s.payroll_id AS id,
                s.employee_id AS "employeeID",
                e.name AS "employeeName",
                e.department,
                e.designation,
                e.email,
                e.phone,
                e.joining_date AS "joiningDate",
                s.salary_month AS "salaryMonth",
                s.basic_salary AS "basicSalary",
                s.allowances,
                s.deductions,
                s.net_salary AS "netSalary",
                s.status
            FROM employee_payroll s
            JOIN employees e ON e.employee_id = s.employee_id
            ORDER BY s.salary_month DESC, s.employee_id ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching payroll:", error);
        res.status(500).json({ message: "Failed to fetch payroll records" });
    }
});

app.get("/api/payroll/employee/:employeeId", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                s.payroll_id AS id,
                s.employee_id AS "employeeID",
                e.name AS "employeeName",
                s.salary_month AS "salaryMonth",
                s.basic_salary AS "basicSalary",
                s.allowances,
                s.deductions,
                s.net_salary AS "netSalary",
                s.status,
                CASE WHEN LOWER(COALESCE(s.status, '')) = 'processed' THEN 'Transferred' ELSE 'Pending' END AS "transferStatus"
            FROM employee_payroll s
            JOIN employees e ON e.employee_id = s.employee_id
            WHERE s.employee_id = $1
            ORDER BY s.salary_month DESC, s.payroll_id DESC
        `, [req.params.employeeId]);
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching employee payroll:", error);
        res.status(500).json({ message: "Failed to fetch employee payroll" });
    }
});

app.post("/api/employee-requests", async (req, res) => {
    try {
        const { employee_id, request_type, details = {} } = req.body;
        if (!employee_id || !request_type) {
            return res.status(400).json({ message: "Employee and request type are required" });
        }

        const result = await pool.query(
            `INSERT INTO employee_requests (employee_id, request_type, details)
             VALUES ($1, $2, $3::jsonb)
             RETURNING id, employee_id, request_type, details, status, hr_response, created_at, updated_at`,
            [employee_id, request_type, JSON.stringify(details)]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Employee request creation error:", error);
        res.status(500).json({ message: "Failed to submit employee request" });
    }
});

app.get("/api/employee-requests/:employeeId", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.employee_id, r.request_type, r.details, r.status, r.hr_response, r.created_at, r.updated_at,
                    f.original_file_name AS file_name, f.uploaded_at AS file_uploaded_at
             FROM employee_requests r
             LEFT JOIN employee_request_files f ON f.request_id = r.id
             WHERE r.employee_id = $1
             ORDER BY r.created_at DESC, r.id DESC`,
            [req.params.employeeId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Employee request fetch error:", error);
        res.status(500).json({ message: "Failed to fetch employee requests" });
    }
});

app.get("/api/hr/employee-requests", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.employee_id, e.name AS employee_name, e.department, r.request_type,
                    r.details, r.status, r.hr_response, r.created_at, r.updated_at,
                    f.original_file_name AS file_name, f.uploaded_at AS file_uploaded_at
             FROM employee_requests r
             JOIN employees e ON e.employee_id = r.employee_id
             LEFT JOIN employee_request_files f ON f.request_id = r.id
             ORDER BY r.created_at DESC, r.id DESC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error("HR employee request fetch error:", error);
        res.status(500).json({ message: "Failed to fetch employee requests" });
    }
});

app.put("/api/hr/employee-requests/:id", requireAuth(pool), requireHR, async (req, res) => {
    try {
        const { status, hr_response = "" } = req.body;
        if (!["Approved", "Rejected"].includes(status)) {
            return res.status(400).json({ message: "Status must be Approved or Rejected" });
        }
        const result = await pool.query(
            `UPDATE employee_requests SET status = $1, hr_response = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING id, employee_id, request_type, details, status, hr_response, created_at, updated_at`,
            [status, hr_response, req.params.id]
        );
        if (!result.rows.length) return res.status(404).json({ message: "Employee request not found" });
        res.json(result.rows[0]);
    } catch (error) {
        console.error("HR employee request update error:", error);
        res.status(500).json({ message: "Failed to update employee request" });
    }
});

app.get("/api/notifications/employee/:employeeId", async (req, res) => {
    try {
        const [leaveResult, payrollResult, documentResult, requestResult, hrDocumentResult] = await Promise.all([
            pool.query(`SELECT id, leave_type, status, days, created_at, reviewed_at FROM leaves WHERE employee_id = $1 AND LOWER(status) IN ('approved', 'rejected') ORDER BY COALESCE(reviewed_at, created_at) DESC NULLS LAST, id DESC LIMIT 20`, [req.params.employeeId]),
            pool.query(`SELECT payroll_id AS id, salary_month, status, updated_at FROM employee_payroll WHERE employee_id = $1 AND LOWER(COALESCE(status, '')) IN ('processed', 'released') ORDER BY updated_at DESC NULLS LAST, payroll_id DESC LIMIT 20`, [req.params.employeeId]),
            pool.query(`SELECT passport_exp_date FROM employees WHERE employee_id = $1 AND passport_exp_date IS NOT NULL AND passport_exp_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`, [req.params.employeeId]),
            // Requests HR rejected, or approved AND attached the document to
            pool.query(
                `SELECT r.id, r.request_type, r.status, r.hr_response, r.updated_at,
                        f.original_file_name AS file_name, f.uploaded_at AS file_uploaded_at
                 FROM employee_requests r
                 LEFT JOIN employee_request_files f ON f.request_id = r.id
                 WHERE r.employee_id = $1
                   AND (r.status = 'Rejected' OR (r.status = 'Approved' AND f.request_id IS NOT NULL))
                 ORDER BY COALESCE(f.uploaded_at, r.updated_at) DESC
                 LIMIT 20`,
                [req.params.employeeId]
            ),
            // Documents HR uploaded for this employee (Contract, Offer Letter, QID) in the last 60 days
            pool.query(
                `SELECT doc_type, original_file_name, uploaded_at
                 FROM employee_document_files
                 WHERE employee_id = $1
                   AND uploaded_by_role = 'HR'
                   AND uploaded_at >= NOW() - INTERVAL '60 days'
                 ORDER BY uploaded_at DESC`,
                [req.params.employeeId]
            ),
        ]);
        res.json([
            ...leaveResult.rows.map((leave) => ({
                id: `leave-${leave.id}-${leave.status}`,
                type: "leave",
                title: `Leave ${leave.status}`,
                message: `${leave.leave_type} request (${leave.days || 1} day${Number(leave.days) === 1 ? "" : "s"})`,
                time: "Leave request updated",
                section: "leave",
                created_at: leave.reviewed_at || leave.created_at,
            })),
            ...payrollResult.rows.map((payroll) => ({
                id: `payroll-${payroll.id}`,
                type: "payroll",
                title: "Payroll Released",
                message: "Your salary details and payslip are available.",
                time: payroll.salary_month ? new Date(payroll.salary_month).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "Payroll updated",
                section: "payroll",
                created_at: payroll.updated_at,
            })),
            ...documentResult.rows.map((document) => ({
                id: `document-${req.params.employeeId}-${document.passport_exp_date}`,
                type: "document",
                title: "Documents Expiring",
                message: "Your passport/document is expiring soon.",
                time: `Expires ${new Date(document.passport_exp_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
                section: "documents",
            })),
            ...requestResult.rows.map((request) => {
                const approved = request.status === "Approved";
                const when = approved ? request.file_uploaded_at : request.updated_at;
                return {
                    // Includes the time, so a replaced document shows as a new notification
                    id: `employee-request-${request.id}-${request.status}-${new Date(when).getTime()}`,
                    type: "request",
                    title: approved ? `${request.request_type} approved – document ready` : `${request.request_type} Rejected`,
                    message: approved
                        ? `HR approved your ${request.request_type} and uploaded "${request.file_name}". Open Documents → Requests to HR to view it.`
                        : request.hr_response || `Your ${request.request_type} was rejected. Please contact HR for details.`,
                    time: new Date(when).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
                    created_at: when,
                    section: "documents",
                };
            }),
            ...hrDocumentResult.rows.map((document) => {
                const labels = { employment_contract: "Employment Contract", offer_letter: "Offer Letter", qid_copy: "QID Copy" };
                const label = labels[document.doc_type] || document.doc_type;
                return {
                    id: `hr-document-${document.doc_type}-${new Date(document.uploaded_at).getTime()}`,
                    type: "document",
                    title: `HR added your ${label}`,
                    message: `"${document.original_file_name}" is now available in Documents.`,
                    time: new Date(document.uploaded_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
                    created_at: document.uploaded_at,
                    section: "documents",
                };
            }),
            // Manpower Request / resignation notifications (hr_notifications inbox)
            ...(await getInbox(req.params.employeeId)).map((item) => ({
                id: `inbox-${item.id}`,
                type: "request",
                title: item.title,
                message: item.message,
                time: new Date(item.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
                section: String(item.link || "").startsWith("resignation:") ? "resignation" : "manpower",
                created_at: item.created_at,        
            })),
        ]);
    } catch (error) {
        console.error("Error fetching employee notifications:", error);
        res.status(500).json({ message: "Failed to fetch employee notifications" });
    }
});

app.post("/api/payroll", async (req, res) => {
    try {
        const { employeeID, salaryMonth, basicSalary, allowances, deductions, status } = req.body;
        if (!employeeID || !salaryMonth) {
            return res.status(400).json({ message: "Employee ID and salary month are required" });
        }
        const result = await pool.query(`
            INSERT INTO employee_payroll
                (employee_id, salary_month, basic_salary, allowances, deductions, status)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [employeeID, salaryMonth, Number(basicSalary) || 0, Number(allowances) || 0, Number(deductions) || 0, status || "Pending"]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error creating payroll:", error);
        res.status(500).json({ message: "Failed to create salary record" });
    }
});

app.put("/api/payroll/:id", async (req, res) => {
    try {
        const { employeeID, salaryMonth, basicSalary, allowances, deductions, status } = req.body;
        const result = await pool.query(`
            UPDATE employee_payroll
            SET employee_id = $1, salary_month = $2, basic_salary = $3,
                allowances = $4, deductions = $5, status = $6,
                updated_at = CURRENT_TIMESTAMP
            WHERE payroll_id = $7
            RETURNING *
        `, [employeeID, salaryMonth, Number(basicSalary) || 0, Number(allowances) || 0, Number(deductions) || 0, status || "Pending", req.params.id]);
        if (!result.rows.length) return res.status(404).json({ message: "Salary record not found" });
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating payroll:", error);
        res.status(500).json({ message: "Failed to update salary record" });
    }
});

app.delete("/api/payroll/:id", async (req, res) => {
    try {
        const result = await pool.query("DELETE FROM employee_payroll WHERE payroll_id = $1 RETURNING payroll_id AS id", [req.params.id]);
        if (!result.rows.length) return res.status(404).json({ message: "Salary record not found" });
        res.json({ message: "Salary record deleted" });
    } catch (error) {
        console.error("Error deleting payroll:", error);
        res.status(500).json({ message: "Failed to delete salary record" });
    }
});


// Archive Employee while preserving the employee and related history.
app.patch("/api/employees/:employeeId/status", requireAuth(pool), requireHR, async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { status, termination_reason, last_date_worked } = req.body;
        const allowedStatuses = ["Inactive", "Resigned", "Retired", "Dismissed", "Terminated"];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: "A valid employee exit status is required" });
        }

        const result = await pool.query(
            `UPDATE employees
             SET status = $1, termination_reason = $2, last_date_worked = $3
             WHERE employee_id = $4
             RETURNING *`,
            [status, termination_reason || status, normalizeDateValue(last_date_worked), employeeId]
        );

        if (!result.rows.length) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.json({ message: "Employee archived successfully", employee: stripPassword(result.rows[0]) });
    } catch (error) {
        console.error("Error archiving employee:", error);
        res.status(500).json({ message: "Failed to archive employee" });
    }
});

// Delete Employee
app.delete("/api/employees/:employeeId", requireAuth(pool), requireHR, async (req, res) => {
    try {
        const { employeeId } = req.params;

        const result = await pool.query(
            `DELETE FROM employees
             WHERE employee_id = $1
             RETURNING *`,
            [employeeId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Employee not found"
            });
        }

        res.json({
            message: "Employee deleted successfully",
            employee: stripPassword(result.rows[0])
        });

    } catch (error) {
        console.error("Error deleting employee:", error);

        res.status(500).json({
            message: "Failed to delete employee"
        });
    }
});

// =========================
// LEAVE MANAGEMENT API
// =========================

// Get all leave requests - HR
app.get("/api/leaves", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                l.id,
                l.employee_id,
                e.name AS employee_name,
                l.leave_type,
                l.from_date,
                l.to_date,
                l.days,
                l.reason,
                l.status,
                l.cancelled_by,
                l.cancelled_at,
                l.created_at,
                l.reviewed_at,
                TO_CHAR(l.from_date, 'YYYY-MM-DD') AS from_day,
                TO_CHAR(l.to_date, 'YYYY-MM-DD') AS to_day,
                TO_CHAR(l.resumed_on, 'YYYY-MM-DD') AS resumed_on
            FROM leaves l
            JOIN employees e
                ON l.employee_id = e.employee_id
            ORDER BY CASE WHEN LOWER(l.status) = 'pending' THEN 0 ELSE 1 END, l.id DESC
        `);

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching leaves:", error);

        res.status(500).json({
            message: "Failed to fetch leave requests"
        });
    }
});


// =========================
// HR - APPROVE / REJECT LEAVE
// =========================

app.put("/api/leaves/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                message: "Status is required"
            });
        }

        const allowedStatuses = [
            "Pending",
            "Approved",
            "Rejected",
            "Cancelled"
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                message: "Invalid leave status"
            });
        }

        const result = await pool.query(
            `
            UPDATE leaves
            SET status = $1,
                reviewed_at = CASE
                    WHEN $3::boolean THEN CURRENT_TIMESTAMP
                    ELSE reviewed_at
                END
            WHERE id = $2
            RETURNING *
            `,
            [status, id, status === "Approved" || status === "Rejected"]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Leave not found"
            });
        }

        res.json({
            message: `Leave ${status.toLowerCase()} successfully`,
            leave: result.rows[0]
        });

    } catch (error) {
        console.error("Error updating leave status:", error);

        res.status(500).json({
            message: "Failed to update leave status",
            error: error.message
        });
    }
});


// =========================
// HR - MARK LEAVE AS RESUMED
// =========================

app.put("/api/leaves/:id/resume", async (req, res) => {
    try {
        const { resumed_on } = req.body || {};

        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(resumed_on || ""))) {
            return res.status(400).json({
                message: "A valid resumption date (YYYY-MM-DD) is required"
            });
        }

        // Only approved leaves, after the leave has ended.
        // CURRENT_DATE + 1 allows for company timezones ahead of the server.
        const result = await pool.query(
            `
            UPDATE leaves
            SET resumed_on = $2::date
            WHERE id = $1
              AND LOWER(status) = 'approved'
              AND $2::date > to_date
              AND $2::date <= CURRENT_DATE + 1
            RETURNING id, TO_CHAR(resumed_on, 'YYYY-MM-DD') AS resumed_on
            `,
            [req.params.id, resumed_on]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                message: "Resumption can only be recorded for an approved leave, after its end date and not in the future"
            });
        }

        res.json({
            message: "Resumption recorded successfully",
            leave: result.rows[0]
        });

    } catch (error) {
        console.error("Error recording leave resumption:", error);

        res.status(500).json({
            message: "Failed to record resumption"
        });
    }
});


// =====================================================
// EMPLOYEE - GET OWN LEAVE REQUESTS
// =====================================================

app.get("/api/leaves/employee/:employeeId", async (req, res) => {
    try {
        const { employeeId } = req.params;

        const result = await pool.query(
            `
            SELECT
                id,
                employee_id,
                leave_type,
                from_date,
                to_date,
                days,
                reason,
                status,
                created_at,
                cancelled_by,
                cancelled_at
            FROM leaves
            WHERE employee_id = $1
            ORDER BY id DESC
            `,
            [employeeId]
        );

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching employee leaves:", error);

        res.status(500).json({
            message: "Failed to fetch employee leaves",
            error: error.message
        });
    }
});

// =====================================================
// EMPLOYEE - CANCEL OWN PENDING LEAVE
// =====================================================

app.put("/api/leaves/:id/cancel", async (req, res) => {
    try {
        const { employee_id } = req.body || {};
        if (!employee_id) {
            return res.status(400).json({ message: "Employee ID is required" });
        }

        const result = await pool.query(
            `UPDATE leaves
                         SET status = 'Cancelled',
                                 cancelled_by = $2,
                                 cancelled_at = CURRENT_TIMESTAMP
             WHERE id = $1
               AND employee_id = $2
               AND LOWER(status) = 'pending'
             RETURNING *`,
            [req.params.id, employee_id]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                message: "Only your pending leave requests can be cancelled",
            });
        }

        res.json({ message: "Leave request cancelled successfully", leave: result.rows[0] });
    } catch (error) {
        console.error("Error cancelling leave request:", error);
        res.status(500).json({ message: "Failed to cancel leave request" });
    }
});


// =====================================================
// EMPLOYEE - APPLY LEAVE
// =====================================================

const LEAVE_RULES = {
    sickEligibleMonths: 3,
    sickTotalDays: 84,
};

const parseDateOnly = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? null
            : new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
};

const completedMonthsBetween = (startDate, endDate) => {
    if (!startDate || !endDate || endDate < startDate) return 0;
    return Math.max(0, (endDate.getFullYear() - startDate.getFullYear()) * 12
        + endDate.getMonth() - startDate.getMonth()
        - (endDate.getDate() < startDate.getDate() ? 1 : 0));
};

// Annual Leave balance for the Apply Leave card and HR review modal.
// Always calculated live; never cached.
app.get("/api/employees/:employeeId/annual-leave-balance", async (req, res) => {
    try {
        const balance = await getAnnualLeaveBalance(req.params.employeeId);

        if (!balance) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.set("Cache-Control", "no-store");
        res.json(balance);
    } catch (error) {
        console.error("Error fetching annual leave balance:", error);
        res.status(500).json({ message: "Failed to fetch annual leave balance" });
    }
});

// =====================================================
// ANNUAL LEAVE ACCRUAL LEDGER (Finance)
// =====================================================

const ACCRUAL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// HR report: days and amount accrued per employee (optional ?month=YYYY-MM)
app.get("/api/reports/annual-leave-accrual", async (req, res) => {
    try {
        const month = req.query.month || null;
        if (month && !ACCRUAL_MONTH_PATTERN.test(month)) {
            return res.status(400).json({ message: "Month must be YYYY-MM" });
        }

        res.set("Cache-Control", "no-store");
        res.json(await getAnnualLeaveAccrualReport({ month }));
    } catch (error) {
        console.error("Error fetching annual leave accrual report:", error);
        res.status(500).json({ message: "Failed to fetch annual leave accrual report" });
    }
});

// "Export for Finance": marks the month's rows as posted (GL posting is a placeholder)
app.post("/api/reports/annual-leave-accrual/export-finance", async (req, res) => {
    try {
        const month = req.body?.month;
        if (!ACCRUAL_MONTH_PATTERN.test(String(month || ""))) {
            return res.status(400).json({ message: "Month (YYYY-MM) is required" });
        }

        res.json(await exportAnnualLeaveAccrualForFinance({ month }));
    } catch (error) {
        console.error("Error exporting annual leave accrual:", error);
        res.status(500).json({ message: "Failed to export annual leave accrual" });
    }
});

// Run the accrual job now (idempotent; the scheduler also runs it daily)
app.post("/api/annual-leave-accrual/run", async (req, res) => {
    try {
        res.json(await runAnnualLeaveAccrual());
    } catch (error) {
        console.error("Error running annual leave accrual:", error);
        res.status(500).json({ message: "Failed to run annual leave accrual" });
    }
});

app.post("/api/leaves", async (req, res) => {
    try {
        const {
            employee_id,
            leave_type,
            from_date,
            to_date,
            reason
        } = req.body;

        console.log("Apply Leave Request:", req.body);


        // Check required fields
        if (
            !employee_id ||
            !leave_type ||
            !from_date ||
            !to_date
        ) {
            return res.status(400).json({
                message: "Please fill all required fields"
            });
        }


        // Check employee
        const employeeResult = await pool.query(
            `
            SELECT
                employee_id,
                name,
                status,
                joining_date
            FROM employees
            WHERE employee_id = $1
            `,
            [employee_id]
        );

        if (employeeResult.rows.length === 0) {
            return res.status(404).json({
                message: "Employee not found"
            });
        }

        const employee = employeeResult.rows[0];

        const today = new Date();
        const joiningDate = parseDateOnly(employee.joining_date);


        // Only active employees can apply
        if (
            String(employee.status).toLowerCase() !==
            "active"
        ) {
            return res.status(400).json({
                message: "Inactive employees cannot apply for leave"
            });
        }


        // Validate dates
        const from = new Date(`${from_date}T00:00:00`);
        const to = new Date(`${to_date}T00:00:00`);

        if (
            Number.isNaN(from.getTime()) ||
            Number.isNaN(to.getTime())
        ) {
            return res.status(400).json({
                message: "Invalid date format"
            });
        }


        // To date cannot be before from date
        if (to < from) {
            return res.status(400).json({
                message: "To Date must be after or equal to From Date"
            });
        }

        // No past dates (company timezone)
        const leaveDateError = validateLeaveDates(from_date, to_date);

        if (leaveDateError) {
            return res.status(400).json({
                message: leaveDateError
            });
        }

        // Accepted resignation: no leave after the last working day
        const resignationLeaveError = await checkLeaveAgainstResignation(pool, employee_id, from_date, to_date);

        if (resignationLeaveError) {
            return res.status(400).json({
                message: resignationLeaveError
            });
        }


        // Calculate leave days
        const difference =
            Math.floor(
                (to.getTime() - from.getTime()) /
                (1000 * 60 * 60 * 24)
            ) + 1;

        const approvedTakenResult = await pool.query(
            `SELECT COALESCE(SUM(days), 0)::numeric AS total_days
             FROM leaves
             WHERE employee_id = $1
               AND status = 'Approved'
                             AND leave_type = $2`,
            [employee_id, leave_type]
        );
        const approvedTaken = Number(approvedTakenResult.rows[0].total_days || 0);

        if (leave_type === ANNUAL_LEAVE_TYPE) {
            const annualError = await checkAnnualLeaveRequest(employee_id, difference);
            if (annualError) {
                return res.status(400).json({
                    message: annualError,
                });
            }
        }

        if (leave_type === "Sick Leave") {
            const serviceMonths = completedMonthsBetween(joiningDate, today);
            const remainingDays = Math.max(0, LEAVE_RULES.sickTotalDays - approvedTaken);
            if (serviceMonths < LEAVE_RULES.sickEligibleMonths) {
                return res.status(400).json({
                    message: "Sick Leave is available after completing 3 months of service",
                    completed_months: serviceMonths,
                });
            }
            if (difference > remainingDays) {
                return res.status(400).json({
                    message: `Only ${remainingDays} Sick Leave day(s) remaining`,
                    remaining_days: remainingDays,
                });
            }
        }

        const fixedEntitlements = {
            "Maternity Leave": 50,
            "Bereavement Leave": 3,
        };
        if (fixedEntitlements[leave_type] !== undefined) {
            const remainingDays = Math.max(0, fixedEntitlements[leave_type] - approvedTaken);
            if (difference > remainingDays) {
                return res.status(400).json({
                    message: `Only ${remainingDays} ${leave_type} day(s) remaining`,
                    remaining_days: remainingDays,
                });
            }
        }


        // Insert leave
        const result = await pool.query(
            `
            INSERT INTO leaves
            (
                employee_id,
                leave_type,
                from_date,
                to_date,
                days,
                reason,
                status
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                'Pending'
            )
            RETURNING *
            `,
            [
                employee_id,
                leave_type,
                from_date,
                to_date,
                difference,
                reason || null
            ]
        );


        console.log(
            "Leave created successfully:",
            result.rows[0]
        );


        res.status(201).json({
            message: "Leave applied successfully",
            leave: result.rows[0]
        });

    } catch (error) {

        console.error(
            "===================================="
        );

        console.error(
            "ERROR APPLYING LEAVE:"
        );

        console.error(error);

        console.error(
            "===================================="
        );


        res.status(500).json({
            message: "Failed to apply leave",
            error: error.message
        });
    }
});

// =========================
// LEAVE POLICY SETTINGS API
// =========================

const DEFAULT_LEAVE_POLICY = {
    qatarHolidayCalendar: [
        { name: "National Day", date: "18 December", days: 1 },
        { name: "National Sports Day", date: "Second Tuesday of February", days: 1 },
        { name: "Eid al-Fitr", date: "Islamic calendar", days: 3 },
        { name: "Eid al-Adha", date: "Islamic calendar", days: 3 },
        { name: "Islamic New Year", date: "Islamic calendar", days: 1 },
        { name: "Prophet's Birthday", date: "Islamic calendar", days: 1 },
    ],
    leaveTypes: [
        "Annual Leave",
        "Casual Leave",
        "Sick Leave",
        "Paternity Leave",
        "Maternity Leave",
        "Hajj Leave",
        "Bereavement Leave",
        "Emergency Leave",
        "Compensatory Off",
        "Unpaid Leave (LOP)",
    ],
    // FRD SHELTER-HCM-LA-15-001: accrual_rate = yearly_entitlement_days ÷ 12
    annualLeave: {
        yearly_entitlement_days: 30,
        grade_overrides: {},
    },
    leave_accrual_salary_basis: "total",
    sickLeave: {
        eligibleAfterMonths: 3,
        medicalCertificateRequired: true,
        salaryBands: [
            { days: 14, pay: "100%" },
            { days: 28, pay: "50%" },
            { days: 42, pay: "Unpaid" },
        ],
    },
    maternityLeave: {
        days: 50,
        pay: "Full Pay",
        approval: "HR",
        medicalCertificateRequired: true,
    },
    bereavementLeave: {
        immediateFamilyDays: 3,
        approval: "Manager",
    },
    compensatoryOff: {
        eligibility: ["Worked on public holiday", "Worked on weekend"],
        validityDays: 90,
        approval: "Manager",
    },
};

app.get("/api/leave-policies", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT policy, updated_at FROM leave_policy_settings WHERE id = 1"
        );

        if (result.rows.length === 0) {
            await pool.query(
                `INSERT INTO leave_policy_settings (id, policy)
                 VALUES (1, $1::jsonb)
                 ON CONFLICT (id) DO NOTHING`,
                [JSON.stringify(DEFAULT_LEAVE_POLICY)]
            );
            return res.json({ policy: DEFAULT_LEAVE_POLICY });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching leave policy:", error);
        res.status(500).json({ message: "Failed to fetch leave policy" });
    }
});

app.put("/api/leave-policies", async (req, res) => {
    try {
        const policy = req.body?.policy;
        if (!policy || typeof policy !== "object") {
            return res.status(400).json({ message: "A valid leave policy is required" });
        }

        const result = await pool.query(
            `INSERT INTO leave_policy_settings (id, policy, updated_at)
             VALUES (1, $1::jsonb, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE
             SET policy = EXCLUDED.policy, updated_at = CURRENT_TIMESTAMP
             RETURNING policy, updated_at`,
            [JSON.stringify(policy)]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error saving leave policy:", error);
        res.status(500).json({ message: "Failed to save leave policy" });
    }
});

// =========================
// HR DASHBOARD API
// =========================

app.get("/api/dashboard", async (req, res) => {
    try {
        const employeesResult = await pool.query(`
            SELECT COUNT(*)::int AS total_employees
            FROM employees
            WHERE status = 'Active'
        `);

        const attendanceCounts = await getAttendanceCounts(pool);

        const leavesResult = await pool.query(`
            SELECT COUNT(*)::int AS pending_leaves
            FROM leaves
            WHERE LOWER(status) = 'pending'
        `);

        const onLeaveResult = await pool.query(`
            SELECT COUNT(DISTINCT employee_id)::int AS on_leave
            FROM leaves
            WHERE LOWER(status) = 'approved'
              AND from_date <= CURRENT_DATE
              AND to_date >= CURRENT_DATE
        `);

        const newJoinersResult = await pool.query(`
            SELECT COUNT(*)::int AS new_joiners
            FROM employees
            WHERE status = 'Active'
              AND joining_date >= DATE_TRUNC('month', CURRENT_DATE)
              AND joining_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
        `);

        const departmentsResult = await pool.query(`
            SELECT COUNT(DISTINCT department)::int AS departments
            FROM employees
            WHERE status = 'Active'
              AND department IS NOT NULL
              AND TRIM(department) <> ''
        `);

        let openPositions = 0;

        try {
            // Unfilled openings on jobs still recruiting
            const jobsResult = await pool.query(`
                SELECT COALESCE(SUM(GREATEST(j.openings - (
                    SELECT COUNT(*) FROM public.job_applications a
                    WHERE a.job_id = j.job_id AND LOWER(a.status) = ANY($1::text[])
                ), 0)), 0)::int AS open_positions
                FROM public.jobs j
                WHERE LOWER(j.status) IN ('open', 'active', 'recruitment in progress')
            `, [FILLED_APPLICATION_STATUSES]);

            openPositions = jobsResult.rows[0].open_positions;
        } catch (jobError) {
            console.log("Jobs table not available yet:", jobError.message);
        }

        let openTickets = 0;

        try {
            const ticketsResult = await pool.query(`
                SELECT COUNT(*)::int AS open_tickets
                FROM tickets
                WHERE LOWER(status) = 'open'
            `);

            openTickets = ticketsResult.rows[0].open_tickets;
        } catch (ticketError) {
            console.log("Tickets table not available yet:", ticketError.message);
        }

        res.json({
            totalEmployees: employeesResult.rows[0].total_employees,
            presentToday: attendanceCounts.present,
            onLeave: onLeaveResult.rows[0].on_leave,
            pendingLeaves: leavesResult.rows[0].pending_leaves,
            openTickets: openTickets,
            openPositions,
            newJoiners: newJoinersResult.rows[0].new_joiners,
            departments: departmentsResult.rows[0].departments,
            payrollStatus: null
        });

    } catch (error) {
        console.error("Error fetching dashboard data:", error);

        res.status(500).json({
            message: "Failed to fetch dashboard data"
        });
    }
});

app.get("/api/dashboard/departments", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department,
                COUNT(*)::int AS employee_count
            FROM employees
            WHERE status = 'Active'
            GROUP BY COALESCE(NULLIF(TRIM(department), ''), 'Unassigned')
            ORDER BY employee_count DESC, department ASC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching department summary:", error);
        res.status(500).json({ message: "Failed to fetch department summary" });
    }
});

        // =========================
// JOB / RECRUITMENT APIs
// =========================

// HR-only guard for the job / application routes below (WorkflowError → its status)
const withHR = (fn) => async (req, res) => {
    try {
        if (req.auth?.identityType !== "hr") {
            return res.status(403).json({ message: "HR access required" });
        }
    } catch (error) {
        if (error instanceof WorkflowError) return res.status(error.status).json({ message: error.message });
        console.error("HR check failed:", error);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
    return fn(req, res);
};

// GET all jobs (HR only: includes compensation, MPR and recruitment plan;
// the public Careers page uses /api/careers/jobs instead)
app.get("/api/jobs", withHR(async (req, res) => {
    try {
        // Filled = applications marked Hired/Joined. accepting_applications is
        // false once the job is closed or its application deadline has passed.
        const result = await pool.query(`
            SELECT
                j.id,
                j.job_id,
                j.title,
                j.department,
                j.openings,
                j.experience,
                j.location,
                j.employment_type,
                j.status,
                j.created_at,
                j.job_description,
                j.skills,
                j.compensation,
                j.mpr_id,
                m.mpr_no,
                COALESCE(j.request_type, m.request_type) AS request_type,
                j.sourcing,
                j.agency_id,
                a.name AS agency_name,
                TO_CHAR(j.application_deadline, 'YYYY-MM-DD') AS application_deadline,
                j.recruiter_employee_id,
                r.name AS recruiter_name,
                j.interview_panel,
                (SELECT COUNT(*)::int FROM public.job_applications ja
                  WHERE ja.job_id = j.job_id AND LOWER(ja.status) = ANY($2::text[])) AS filled,
                (SELECT COUNT(*)::int FROM public.job_applications ja WHERE ja.job_id = j.job_id) AS applications_count,
                (SELECT COUNT(*)::int FROM public.job_applications ja WHERE ja.job_id = j.job_id AND ja.status = 'New') AS new_applications,
                (j.application_deadline IS NOT NULL AND j.application_deadline < $1::date) AS deadline_passed,
                (LOWER(COALESCE(j.status, '')) IN ('open', 'recruitment in progress', 'active')
                  AND (j.application_deadline IS NULL OR j.application_deadline >= $1::date)) AS accepting_applications
            FROM public.jobs j
            LEFT JOIN manpower_requests m ON m.id = j.mpr_id
            LEFT JOIN recruitment_agencies a ON a.id = j.agency_id
            LEFT JOIN employees r ON r.employee_id = j.recruiter_employee_id
            ORDER BY j.id DESC
        `, [getCompanyToday(), FILLED_APPLICATION_STATUSES]);

        res.set("Cache-Control", "no-store");
        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching jobs:", error);

        res.status(500).json({
            message: "Failed to fetch jobs"
        });
    }
}));


// Direct job creation is disabled (FRD SHELTER-HCM-RC-01-001): job openings are
// created automatically when a Manpower Request is fully approved.
app.post("/api/jobs", (req, res) => {
    res.status(410).json({
        message: "Jobs can no longer be created directly. Raise a Manpower Request; the job opening is created when it is fully approved."
    });
});



// =========================
// JOB APPLICATION APIs
// Candidates apply through the public Careers page (routes/careers.js):
//   POST /api/careers/jobs/:jobId/apply — validated, CV stored privately
// HR lists / reviews them through /api/hr/job-applications.
// =========================

app.post("/api/job-applications", (req, res) => {
    res.status(410).json({ message: "Apply through the Careers page: POST /api/careers/jobs/:jobId/apply" });
});

app.post("/api/upload-resume", (req, res) => {
    res.status(410).json({ message: "CVs are uploaded with the application on the Careers page" });
});

// Update application status (HR only). Used for Hired / Joined, which fill the job;
// Shortlist / Hold / Reject go through POST /api/hr/job-applications/:id/:action.
app.put("/api/job-applications/:id/status", withHR(async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                message: "Status is required"
            });
        }

        const result = await pool.query(
            `
            UPDATE public.job_applications
            SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING id, application_id, job_id, status
            `,
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Application not found"
            });
        }

        // Close the job once hired/joined applications reach the openings
        await refreshJobFill(pool, result.rows[0].job_id);

        res.json(result.rows[0]);

    } catch (error) {
        console.error("Error updating application status:", error);

        res.status(500).json({
            message: "Failed to update application status"
        });
    }
}));


app.post("/api/login", createLoginHandler(pool));
// =========================
// SERVER
// =========================

const PORT = process.env.PORT || 5000;

const normalizeDateValue = (value) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return null;
    const dateValue = Array.isArray(value) ? value[0] : value;
    const parsedDate = new Date(dateValue);
    return Number.isNaN(parsedDate.getTime())
        ? null
        : parsedDate.toISOString().slice(0, 10);
};

const ensureEmployeePersonalInfoColumns = async () => {
    await pool.query(`
        ALTER TABLE employees
        ADD COLUMN IF NOT EXISTS passport_no TEXT,
        ADD COLUMN IF NOT EXISTS profile_photo TEXT,
        ADD COLUMN IF NOT EXISTS passport_exp_date DATE,
        ADD COLUMN IF NOT EXISTS nationality TEXT,
        ADD COLUMN IF NOT EXISTS religion TEXT,
        ADD COLUMN IF NOT EXISTS marital_status TEXT,
        ADD COLUMN IF NOT EXISTS children_count INTEGER
    `);
    await pool.query(`
        ALTER TABLE employees
        ALTER COLUMN name TYPE TEXT,
        ALTER COLUMN department TYPE TEXT,
        ALTER COLUMN designation TYPE TEXT,
        ALTER COLUMN email TYPE TEXT,
        ALTER COLUMN phone TYPE TEXT,
        ALTER COLUMN address TYPE TEXT,
        ALTER COLUMN employment_type TYPE TEXT,
        ALTER COLUMN emergency_contact TYPE TEXT,
        ALTER COLUMN passport_no TYPE TEXT,
        ALTER COLUMN profile_photo TYPE TEXT,
        ALTER COLUMN nationality TYPE TEXT,
        ALTER COLUMN religion TYPE TEXT,
        ALTER COLUMN marital_status TYPE TEXT
    `);
    await pool.query(`
        DO $$
        DECLARE column_record RECORD;
        BEGIN
            FOR column_record IN
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'employees'
                  AND table_schema = 'public'
                  AND data_type = 'character varying'
            LOOP
                EXECUTE format(
                    'ALTER TABLE employees ALTER COLUMN %I TYPE TEXT',
                    column_record.column_name
                );
            END LOOP;
        END $$;
    `);
};

const ensurePasswordResetTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS password_resets (
            id SERIAL PRIMARY KEY,
            employee_id TEXT NOT NULL,
            credential_type TEXT NOT NULL DEFAULT 'hr',
            otp_hash TEXT NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            verified BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(
        `ALTER TABLE password_resets
         ADD COLUMN IF NOT EXISTS credential_type TEXT NOT NULL DEFAULT 'hr'`
    );
    await pool.query(`
        CREATE INDEX IF NOT EXISTS password_resets_employee_id_idx
        ON password_resets (employee_id, created_at DESC)
    `);
};

const ensureLeavePolicyTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS leave_policy_settings (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            policy JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(
        `INSERT INTO leave_policy_settings (id, policy)
         VALUES (1, $1::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(DEFAULT_LEAVE_POLICY)]
    );
    await pool.query(
        `UPDATE leave_policy_settings
         SET policy = policy || jsonb_build_object('leaveTypes', $1::jsonb),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        [JSON.stringify(DEFAULT_LEAVE_POLICY.leaveTypes)]
    );
};

const ensureLeaveCancellationColumns = async () => {
    await pool.query(`
        ALTER TABLE leaves
        ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
        ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ
    `);
};

const ensureLeaveTrackingColumns = async () => {
    await pool.query(`
        ALTER TABLE leaves
        ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS resumed_on DATE
    `);
};

const ensureEmployeeRequestsTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS employee_requests (
            id BIGSERIAL PRIMARY KEY,
            employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
            request_type TEXT NOT NULL,
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
            hr_response TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS employee_requests_employee_id_idx ON employee_requests(employee_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS employee_requests_status_idx ON employee_requests(status)`);
};

ensureEmployeePersonalInfoColumns()
    .then(ensurePasswordResetTable)
    .then(ensureLeavePolicyTable)
    .then(ensureLeaveCancellationColumns)
    .then(ensureLeaveTrackingColumns)
    .then(ensureEmployeeRequestsTable)
    .then(() => ensureAnnualLeaveAccrualSchema())
    .then(() => ensureNotificationSchema())
    .then(() => ensureManpowerSchema())
    .then(() => ensureTicketSchema())
    .then(() => ensureResignationSchema())
    .then(() => ensureCareerSchema())
    .then(() => ensureEmployeeDocumentSchema())
    .then(() => {
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`HRMS Backend running on port ${PORT}`);
        });

        // Daily annual leave accrual (first run backfills from joining dates)
        startAnnualLeaveAccrualScheduler();
        startD365SyncScheduler(pool);

        // Daily: complete resignations the day after the last working day
        startResignationScheduler({ onEmails: sendQueuedEmails });
    })
    .catch((error) => {
        console.error("Failed to prepare database tables:", error);
        process.exit(1);
    });
