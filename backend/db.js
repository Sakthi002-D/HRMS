import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

const pool = connectionString
    ? new Pool({
        connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    })
    : {
        async query() {
            throw new Error(
                "Missing DATABASE_URL in backend/.env. Add your PostgreSQL connection string to use database-backed APIs."
            );
        }
    };

export default pool;