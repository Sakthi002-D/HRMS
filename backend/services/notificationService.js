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

// Inbox rows are saved as finished English text. These patterns mirror the sentences built in
// resignationWorkflow.js, manpowerWorkflow.js and careerApplications.js, so the employee portal can
// show them translated ("kind" + "params"). No match → no kind, and the portal shows the English text.
const INBOX_KINDS = [
    ["resignation_submitted", /^Resignation (?<number>.+) submitted$/, /^Your resignation is (?<status>.+)\. Last working day: (?<date>[^.]+)\.$/],
    ["resignation_step_approved", /^Resignation (?<number>[^:]+): (?<status>.+)$/, /^(?<role>.+?) \((?<actor>.+)\) approved your resignation\. It is now .+\.$/],
    ["resignation_accepted_changed", /^Resignation (?<number>.+) accepted$/, /^HR accepted your resignation\. You are serving notice until (?<date>[^.]+)\. Your last working day was changed from (?<previousDate>[^.]+)\.$/],
    ["resignation_accepted", /^Resignation (?<number>.+) accepted$/, /^HR accepted your resignation\. You are serving notice until (?<date>[^.]+)\.$/],
    ["resignation_rejected", /^Resignation (?<number>.+) rejected$/, /^(?<role>.+?) \((?<actor>.+?)\) rejected your resignation: (?<reason>[\s\S]*)$/],
    ["resignation_withdrawn", /^Resignation (?<number>.+) withdrawn$/, /^You withdrew your resignation\. Your employment continues as normal\.$/],
    ["resignation_withdrawn_approver", /^Resignation (?<number>.+) withdrawn$/, /^(?<name>.+) \((?<employeeId>[^()]+)\) withdrew their resignation\. No action is needed\.$/],
    ["resignation_completed", /^Resignation (?<number>.+) completed$/, /^Your last working day was (?<date>[^.]+)\. HR will process your final settlement\.$/],
    ["resignation_awaiting_approval_early", /^Resignation (?<number>.+) awaits your approval$/, /^(?<name>.+) \((?<employeeId>[^,()]+), (?<department>.+)\) resigned\. Last working day (?<date>[^.]+)\. Early release requested\. Open Resignation → My Approvals\.$/],
    ["resignation_awaiting_approval", /^Resignation (?<number>.+) awaits your approval$/, /^(?<name>.+) \((?<employeeId>[^,()]+), (?<department>.+)\) resigned\. Last working day (?<date>[^.]+)\. Open Resignation → My Approvals\.$/],
    ["resignation_accepted_hr", /^Resignation accepted: (?<name>.+)$/, /^(?<number>\S+) accepted\. .+ \((?<employeeId>[^,()]+), (?<department>.+)\)\. Last working day: (?<date>[^.]+)\. Final settlement to be processed after the last working day\.$/],
    ["resignation_end_of_service", /^Pending End of Service: (?<name>.+)$/, /^.+ \((?<employeeId>[^,()]+), (?<department>.+)\) finished on (?<date>[^.]+) and is now Inactive\.$/],
    ["mpr_awaiting_approval_exception", /^MPR (?<number>\S+) awaits your approval$/, /^(?<requestType>Replacement|New Position): (?<title>.+) \((?<openings>\d+) × (?<department>.+)\) \(budget exception\)\. Open Manpower Requests → My Approvals\.$/],
    ["mpr_awaiting_approval", /^MPR (?<number>\S+) awaits your approval$/, /^(?<requestType>Replacement|New Position): (?<title>.+) \((?<openings>\d+) × (?<department>.+)\)\. Open Manpower Requests → My Approvals\.$/],
    ["mpr_rejected", /^MPR (?<number>\S+) was rejected$/, /^(?<role>.+?) rejected "(?<title>.+)": (?<reason>[\s\S]*)$/],
    ["mpr_sent_back", /^MPR (?<number>\S+) was sent back$/, /^(?<role>.+?) sent back "(?<title>.+)": (?<reason>[\s\S]*)\. Edit and resubmit it from Manpower Requests\.$/],
    ["mpr_approved", /^MPR (?<number>\S+) approved$/, /^Job opening (?<jobId>\S+) was created for "(?<title>.+)"\.$/],
    ["mpr_assets", /^Assets required for (?<jobId>\S+)$/, /^(?<openings>\d+) × (?<title>.+) \((?<department>.+), (?<location>.+)\) needs: (?<assets>.+)\. MPR (?<number>\S+); applications (?<startDate>.+) – (?<endDate>.+)\.$/],
    ["mpr_accommodation", /^Accommodation required for (?<jobId>\S+)$/, /^Arrange accommodation for (?<openings>\d+) × (?<title>.+) \((?<department>.+), (?<location>.+)\)\. MPR (?<number>\S+)\.$/],
    ["mpr_recruitment_plan", /^Complete recruitment plan for (?<jobId>\S+)$/, /^MPR (?<number>\S+) is fully approved and job opening \S+ \((?<title>.+)\) was created\. Complete its recruitment plan in Recruitment → Job Openings\.$/],
    ["job_application", /^New application for (?<jobId>\S+)$/, /^(?<name>.+) \((?<candidateType>Fresher|Experienced)\) applied for (?<jobTitle>.+)\. Application (?<applicationNo>\S+)\. Open Recruitment → Job Applications\.$/],
];

export const inboxKind = (item) => {
    for (const [kind, titlePattern, messagePattern] of INBOX_KINDS) {
        const title = titlePattern.exec(item.title || "");
        const message = title && messagePattern.exec(item.message || "");
        if (message) return { kind, params: { ...title.groups, ...message.groups } };
    }
    return {};
};
