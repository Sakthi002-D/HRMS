import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || "";
const useDatabaseSsl = process.env.DATABASE_SSL === "true";

const pool = new Pool({
    connectionString: databaseUrl,
    ...(useDatabaseSsl ? {
        ssl: {
            rejectUnauthorized: false
        }
    } : {})
});

export default pool;