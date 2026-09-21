import dotenv from "dotenv";
import pg from "pg";
import { fileURLToPath } from "node:url";

const sharedEnvPath = fileURLToPath(new URL("../../backend/.env", import.meta.url));
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || sharedEnvPath });

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

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