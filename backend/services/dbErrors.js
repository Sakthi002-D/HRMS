// Errors that mean "no database connection free right now" rather than a bug:
//   - pg pool waited connectionTimeoutMillis for a free client
//   - Supabase pooler limit: "(EMAXCONNSESSION) max clients reached in session mode"
//   - Postgres itself is full (53300 too_many_connections)
const BUSY_PATTERN = /timeout exceeded when trying to connect|EMAXCONNSESSION|max clients reached|too many clients|remaining connection slots/i;

export const isDatabaseBusyError = (error) =>
    Boolean(error) && (error.code === "53300" || BUSY_PATTERN.test(String(error.message || "")));

export const DATABASE_BUSY_MESSAGE = "The system is busy right now. Please try again in a moment.";
