// =====================================================
// TICKETING SCHEMA
// Support tickets, categories, support agents and comments.
// Applied at backend startup and by `npm run migrate:tickets`.
// Mirrors migrations/013_create_tickets.sql. Everything is IF NOT EXISTS /
// ON CONFLICT DO NOTHING, so it is safe to run repeatedly.
// =====================================================

import pool from "../db.js";

export const TICKET_STATUSES = ["Open", "On Hold", "Reopened", "Resolved", "Closed"];
export const TICKET_PRIORITIES = ["Low", "Medium", "High"];

const DEFAULT_CATEGORIES = [
    ["IT Support", "Hardware, software, access and network issues"],
    ["HR", "Policies, documents and general HR queries"],
    ["Payroll", "Salary, deductions and payslip queries"],
    ["Leave & Attendance", "Leave balance and attendance corrections"],
    ["Facilities", "Office, seating and equipment requests"],
    ["Other", "Anything else"],
];

export async function ensureTicketSchema(db = pool) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS ticket_categories (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS support_agents (
            id SERIAL PRIMARY KEY,
            employee_id TEXT NOT NULL UNIQUE REFERENCES employees(employee_id) ON DELETE CASCADE,
            category_id INTEGER REFERENCES ticket_categories(id) ON DELETE SET NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS tickets (
            id BIGSERIAL PRIMARY KEY,
            subject TEXT NOT NULL,
            description TEXT,
            category_id INTEGER REFERENCES ticket_categories(id) ON DELETE SET NULL,
            priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High')),
            status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'On Hold', 'Reopened', 'Resolved', 'Closed')),
            raised_by TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
            assigned_to TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMPTZ
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS tickets_raised_by_idx ON tickets (raised_by)`);
    await db.query(`CREATE INDEX IF NOT EXISTS tickets_assigned_to_idx ON tickets (assigned_to)`);
    await db.query(`CREATE INDEX IF NOT EXISTS tickets_category_idx ON tickets (category_id)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS ticket_comments (
            id BIGSERIAL PRIMARY KEY,
            ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            author_employee_id TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
            comment TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON ticket_comments (ticket_id, created_at)`);

    await db.query(
        `
        INSERT INTO ticket_categories (name, description)
        SELECT c.name, c.description FROM UNNEST($1::text[], $2::text[]) AS c(name, description)
        ON CONFLICT (name) DO NOTHING
        `,
        [DEFAULT_CATEGORIES.map(([name]) => name), DEFAULT_CATEGORIES.map(([, description]) => description)]
    );
}
