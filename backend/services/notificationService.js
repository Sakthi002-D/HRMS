// =====================================================
// IN-APP + EMAIL NOTIFICATIONS
// In-app rows go to hr_notifications (shown in the employee bell and the HR
// dashboard bell). Email uses the same Gmail settings as password reset
// (EMAIL_USER / EMAIL_PASS); when they're missing, email is skipped.
// =====================================================

import nodemailer from "nodemailer";
import pool from "../db.js";

export async function ensureNotificationSchema(db = pool) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS hr_notifications (
            id BIGSERIAL PRIMARY KEY,
            recipient_employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
            type TEXT NOT NULL DEFAULT 'general',
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            link TEXT,
            read_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(`
        CREATE INDEX IF NOT EXISTS hr_notifications_recipient_idx
        ON hr_notifications (recipient_employee_id, created_at DESC)
    `);
}

let transporter = null;
const getTransporter = () => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
    transporter ||= nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    return transporter;
};

// Insert in-app notifications (inside the caller's transaction) and return
// the emails to send once the transaction commits.
export async function createNotifications(db, recipientIds, { type = "general", title, message, link = null }) {
    const ids = [...new Set((recipientIds || []).filter(Boolean))];
    if (ids.length === 0) return [];

    const result = await db.query(
        `
        INSERT INTO hr_notifications (recipient_employee_id, type, title, message, link)
        SELECT r.recipient, $2, $3, $4, $5 FROM UNNEST($1::text[]) AS r(recipient)
        WHERE EXISTS (SELECT 1 FROM employees e WHERE e.employee_id = r.recipient)
        RETURNING recipient_employee_id
        `,
        [ids, type, title, message, link]
    );

    const emails = await db.query(
        `SELECT employee_id, name, email FROM employees WHERE employee_id = ANY($1::text[]) AND email IS NOT NULL AND email <> ''`,
        [result.rows.map((row) => row.recipient_employee_id)]
    );

    return emails.rows.map((row) => ({ to: row.email, name: row.name, subject: title, text: message }));
}

// Fire-and-forget: email failures never break the workflow.
// Optional per mail: plainSubject (no "HRMS:" prefix) and signature (default "HRMS"),
// for emails to people outside the company such as job applicants.
export function sendQueuedEmails(queue) {
    const mailer = getTransporter();
    if (!mailer || !queue?.length) return;

    queue.forEach((mail) => {
        mailer
            .sendMail({
                from: `"${mail.plainSubject ? "Shelter Group Careers" : "HRMS"}" <${process.env.EMAIL_USER}>`,
                to: mail.to,
                subject: mail.plainSubject ? mail.subject : `HRMS: ${mail.subject}`,
                text: `Hello ${mail.name || ""},\n\n${mail.text}\n\nRegards,\n${mail.signature || "HRMS"}`,
            })
            .catch((error) => console.error("Notification email failed:", error.message));
    });
}

export async function getInbox(employeeId, db = pool) {
    const result = await db.query(
        `SELECT id, type, title, message, link, read_at, created_at
         FROM hr_notifications
         WHERE recipient_employee_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [employeeId]
    );
    return result.rows;
}
