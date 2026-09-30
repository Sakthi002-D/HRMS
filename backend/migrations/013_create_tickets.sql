-- Ticketing: support tickets, categories, support agents and comments.
-- Also applied automatically at backend startup (ensureTicketSchema in services/ticketSchema.js),
-- or on demand with: npm run migrate:tickets
-- Safe to re-run: creates only what is missing, never drops or alters existing tables.

CREATE TABLE IF NOT EXISTS ticket_categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_agents (
    id SERIAL PRIMARY KEY,
    employee_id TEXT NOT NULL UNIQUE REFERENCES employees(employee_id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES ticket_categories(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status);
CREATE INDEX IF NOT EXISTS tickets_raised_by_idx ON tickets (raised_by);
CREATE INDEX IF NOT EXISTS tickets_assigned_to_idx ON tickets (assigned_to);
CREATE INDEX IF NOT EXISTS tickets_category_idx ON tickets (category_id);

CREATE TABLE IF NOT EXISTS ticket_comments (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_employee_id TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON ticket_comments (ticket_id, created_at);

INSERT INTO ticket_categories (name, description) VALUES
    ('IT Support', 'Hardware, software, access and network issues'),
    ('HR', 'Policies, documents and general HR queries'),
    ('Payroll', 'Salary, deductions and payslip queries'),
    ('Leave & Attendance', 'Leave balance and attendance corrections'),
    ('Facilities', 'Office, seating and equipment requests'),
    ('Other', 'Anything else')
ON CONFLICT (name) DO NOTHING;
