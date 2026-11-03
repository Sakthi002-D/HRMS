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

const numberFromEnv = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
};

/*
  Supabase limits how many connections one project may hold (pool_size 15 on the pooler).
  This backend keeps at most 5 (DB_POOL_MAX) so scripts, the SQL editor and other tools
  still have room. A request that cannot get a connection within 10 s (DB_CONNECTION_TIMEOUT_MS)
  fails with a "busy" error instead of waiting forever; idle connections close after 30 s.
*/
const pool = new Pool({
    connectionString: databaseUrl,
    max: numberFromEnv("DB_POOL_MAX", 5),
    connectionTimeoutMillis: numberFromEnv("DB_CONNECTION_TIMEOUT_MS", 10_000),
    idleTimeoutMillis: 30_000,
    ...(useDatabaseSsl ? { ssl: buildSslConfig() } : {})
});

// A dropped idle connection (pooler restart, network blip) must not crash the backend
pool.on("error", (error) => {
    console.error("Database pool: idle connection error:", error.message);
});

export default pool;