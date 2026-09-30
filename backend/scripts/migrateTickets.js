// Creates the ticketing tables if they are missing. Usage: npm run migrate:tickets
import pool from "../db.js";
import { ensureTicketSchema } from "../services/ticketSchema.js";

try {
    await ensureTicketSchema();
    console.log("Ticketing tables are ready (tickets, ticket_categories, support_agents, ticket_comments).");
} catch (error) {
    console.error("Ticketing migration failed:", error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
