// =====================================================
// TICKETING: support tickets, categories, support agents, comments
//
// Identity: like the rest of this API, the caller's employee ID comes from the
// client session (actor_id / employee_id).
// =====================================================

import express from "express";
import pool from "../db.js";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "../services/ticketSchema.js";

const router = express.Router();

class TicketError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        if (error instanceof TicketError) {
            return res.status(error.status).json({ message: error.message });
        }
        if (error.code === "23505") {
            return res.status(409).json({ message: "That record already exists" });
        }
        if (error.code === "23503") {
            return res.status(400).json({ message: "Referenced employee or category does not exist" });
        }
        console.error("Tickets API error:", error);
        res.status(500).json({ message: "Something went wrong. Please try again." });
    }
};

const clean = (value) => (typeof value === "string" ? value.trim() : value) || null;

const TICKET_SELECT = `
    SELECT
        t.id,
        'TKT-' || LPAD(t.id::text, 4, '0') AS ticket_code,
        t.subject,
        t.description,
        t.category_id,
        c.name AS category_name,
        t.priority,
        t.status,
        t.raised_by,
        rb.name AS raised_by_name,
        t.assigned_to,
        ag.name AS assigned_to_name,
        t.created_at,
        t.updated_at,
        t.resolved_at,
        (SELECT COUNT(*)::int FROM ticket_comments tc WHERE tc.ticket_id = t.id) AS comment_count
    FROM tickets t
    LEFT JOIN ticket_categories c ON c.id = t.category_id
    LEFT JOIN employees rb ON rb.employee_id = t.raised_by
    LEFT JOIN employees ag ON ag.employee_id = t.assigned_to
`;

const getTicket = async (id) => {
    const result = await pool.query(`${TICKET_SELECT} WHERE t.id = $1`, [id]);
    if (!result.rows[0]) throw new TicketError("Ticket not found", 404);
    return result.rows[0];
};

// Active agent for the category (or a general agent) with the fewest open tickets
const pickAgent = async (categoryId) => {
    const result = await pool.query(
        `
        SELECT sa.employee_id
        FROM support_agents sa
        WHERE sa.is_active AND (sa.category_id = $1 OR sa.category_id IS NULL)
        ORDER BY (sa.category_id IS NULL),
            (SELECT COUNT(*) FROM tickets t
             WHERE t.assigned_to = sa.employee_id AND t.status IN ('Open', 'On Hold', 'Reopened')),
            sa.id
        LIMIT 1
        `,
        [categoryId]
    );
    return result.rows[0]?.employee_id || null;
};

// =====================================================
// TICKETS
// =====================================================

router.get("/tickets", handle(async (req, res) => {
    const { status, raised_by, assigned_to } = req.query;
    const conditions = [];
    const values = [];

    if (status && status !== "all") {
        values.push(status);
        conditions.push(`t.status = $${values.length}`);
    }
    if (raised_by) {
        values.push(raised_by);
        conditions.push(`t.raised_by = $${values.length}`);
    }
    if (assigned_to) {
        values.push(assigned_to);
        conditions.push(`t.assigned_to = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(`${TICKET_SELECT} ${where} ORDER BY t.updated_at DESC, t.id DESC`, values);
    res.json(result.rows);
}));

router.get("/tickets/:id", handle(async (req, res) => {
    res.json(await getTicket(req.params.id));
}));

router.post("/tickets", handle(async (req, res) => {
    const subject = clean(req.body.subject);
    const description = clean(req.body.description);
    const categoryId = req.body.category_id ? Number(req.body.category_id) : null;
    const priority = req.body.priority || "Medium";
    const raisedBy = clean(req.body.raised_by) || clean(req.body.actor_id);
    let assignedTo = clean(req.body.assigned_to);

    if (!subject) throw new TicketError("Subject is required");
    if (!TICKET_PRIORITIES.includes(priority)) throw new TicketError("Invalid priority");
    if (!raisedBy) throw new TicketError("Raised by employee is required");

    assignedTo ||= await pickAgent(categoryId);

    const result = await pool.query(
        `
        INSERT INTO tickets (subject, description, category_id, priority, raised_by, assigned_to)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        `,
        [subject, description, categoryId, priority, raisedBy, assignedTo]
    );

    res.status(201).json(await getTicket(result.rows[0].id));
}));

router.patch("/tickets/:id", handle(async (req, res) => {
    const updates = [];
    const values = [];
    const set = (column, value) => {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
    };

    if (req.body.status !== undefined) {
        if (!TICKET_STATUSES.includes(req.body.status)) throw new TicketError("Invalid status");
        set("status", req.body.status);
        updates.push(["Resolved", "Closed"].includes(req.body.status)
            ? "resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP)"
            : "resolved_at = NULL");
    }
    if (req.body.priority !== undefined) {
        if (!TICKET_PRIORITIES.includes(req.body.priority)) throw new TicketError("Invalid priority");
        set("priority", req.body.priority);
    }
    if (req.body.assigned_to !== undefined) set("assigned_to", clean(req.body.assigned_to));
    if (req.body.category_id !== undefined) set("category_id", req.body.category_id ? Number(req.body.category_id) : null);
    if (req.body.subject !== undefined) {
        if (!clean(req.body.subject)) throw new TicketError("Subject is required");
        set("subject", clean(req.body.subject));
    }
    if (req.body.description !== undefined) set("description", clean(req.body.description));

    if (!updates.length) throw new TicketError("Nothing to update");

    values.push(req.params.id);
    const result = await pool.query(
        `UPDATE tickets SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING id`,
        values
    );
    if (!result.rows[0]) throw new TicketError("Ticket not found", 404);

    res.json(await getTicket(req.params.id));
}));

// =====================================================
// COMMENTS
// =====================================================

router.get("/tickets/:id/comments", handle(async (req, res) => {
    const result = await pool.query(
        `
        SELECT tc.id, tc.ticket_id, tc.author_employee_id, e.name AS author_name, tc.comment, tc.created_at
        FROM ticket_comments tc
        LEFT JOIN employees e ON e.employee_id = tc.author_employee_id
        WHERE tc.ticket_id = $1
        ORDER BY tc.created_at ASC
        `,
        [req.params.id]
    );
    res.json(result.rows);
}));

router.post("/tickets/:id/comments", handle(async (req, res) => {
    const comment = clean(req.body.comment);
    if (!comment) throw new TicketError("Comment is required");

    await getTicket(req.params.id);
    const result = await pool.query(
        `INSERT INTO ticket_comments (ticket_id, author_employee_id, comment) VALUES ($1, $2, $3) RETURNING *`,
        [req.params.id, clean(req.body.actor_id), comment]
    );
    await pool.query(`UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [req.params.id]);
    res.status(201).json(result.rows[0]);
}));

// =====================================================
// CATEGORIES & SUPPORT AGENTS
// =====================================================

router.get("/ticket-categories", handle(async (req, res) => {
    const result = await pool.query(`
        SELECT c.id, c.name, c.description, c.is_active,
            COUNT(t.id)::int AS ticket_count,
            COUNT(t.id) FILTER (WHERE t.status IN ('Open', 'On Hold', 'Reopened'))::int AS open_count
        FROM ticket_categories c
        LEFT JOIN tickets t ON t.category_id = c.id
        WHERE c.is_active
        GROUP BY c.id
        ORDER BY c.name
    `);
    res.json(result.rows);
}));

router.post("/ticket-categories", handle(async (req, res) => {
    const name = clean(req.body.name);
    if (!name) throw new TicketError("Category name is required");
    const result = await pool.query(
        `INSERT INTO ticket_categories (name, description) VALUES ($1, $2) RETURNING *`,
        [name, clean(req.body.description)]
    );
    res.status(201).json(result.rows[0]);
}));

router.get("/support-agents", handle(async (req, res) => {
    const result = await pool.query(`
        SELECT sa.id, sa.employee_id, e.name, sa.category_id, c.name AS category_name, sa.is_active,
            (SELECT COUNT(*)::int FROM tickets t
             WHERE t.assigned_to = sa.employee_id AND t.status IN ('Open', 'On Hold', 'Reopened')) AS open_count
        FROM support_agents sa
        JOIN employees e ON e.employee_id = sa.employee_id
        LEFT JOIN ticket_categories c ON c.id = sa.category_id
        WHERE sa.is_active
        ORDER BY e.name
    `);
    res.json(result.rows);
}));

router.post("/support-agents", handle(async (req, res) => {
    const employeeId = clean(req.body.employee_id);
    if (!employeeId) throw new TicketError("Employee is required");
    const categoryId = req.body.category_id ? Number(req.body.category_id) : null;
    const result = await pool.query(
        `
        INSERT INTO support_agents (employee_id, category_id)
        VALUES ($1, $2)
        ON CONFLICT (employee_id) DO UPDATE SET category_id = EXCLUDED.category_id, is_active = TRUE
        RETURNING *
        `,
        [employeeId, categoryId]
    );
    res.status(201).json(result.rows[0]);
}));

router.delete("/support-agents/:id", handle(async (req, res) => {
    const result = await pool.query(`UPDATE support_agents SET is_active = FALSE WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!result.rows[0]) throw new TicketError("Support agent not found", 404);
    res.json({ id: result.rows[0].id });
}));

export default router;
