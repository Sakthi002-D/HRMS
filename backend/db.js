import dotenv from "dotenv";
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sharedEnvPath = fileURLToPath(new URL("./.env", import.meta.url));
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || sharedEnvPath });

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

const databaseUrl = process.env.DATABASE_URL || "";
const useDatabaseSsl = process.env.DATABASE_SSL === "true";

function buildSslConfig() {
    const caPath = process.env.DATABASE_SSL_CA_PATH;
    if (!caPath) {
        throw new Error("DATABASE_SSL=true requires DATABASE_SSL_CA_PATH (path to the Supabase CA certificate).");
    }
    let ca;
    try {
        ca = readFileSync(caPath, "utf8");
    } catch (err) {
        throw new Error(`Cannot read DATABASE_SSL_CA_PATH (${err.code || "error"}). Download the Supabase CA certificate and fix the path.`);
    }
    return { ca, rejectUnauthorized: true };
}

const pool = new Pool({
    connectionString: databaseUrl,
    ...(useDatabaseSsl ? { ssl: buildSslConfig() } : {})
});

export default pool;