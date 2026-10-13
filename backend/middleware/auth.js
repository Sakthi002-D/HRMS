import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS) || 8 * 60 * 60;

let secret = process.env.AUTH_TOKEN_SECRET;
if (!secret) {
    secret = randomBytes(32).toString("hex");
    console.warn("AUTH_TOKEN_SECRET is not set: using an ephemeral secret, tokens are invalidated on restart.");
}

const b64 = (value) => Buffer.from(value).toString("base64url");
const sign = (data, key) => createHmac("sha256", key).update(data).digest("base64url");

export const signToken = (employeeId, { key = secret, ttl = TOKEN_TTL_SECONDS, now = Date.now() } = {}) => {
    const payload = b64(JSON.stringify({ sub: employeeId, exp: Math.floor(now / 1000) + ttl }));
    return `${payload}.${sign(payload, key)}`;
};

export const verifyToken = (token, { key = secret, now = Date.now() } = {}) => {
    if (typeof token !== "string") return null;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra !== undefined) return null;

    const expected = Buffer.from(sign(payload, key));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (!data.sub || typeof data.exp !== "number" || data.exp * 1000 < now) return null;
        return data;
    } catch {
        return null;
    }
};

export const stripPassword = (row) => {
    if (!row || typeof row !== "object") return row;
    const { password, ...safe } = row;
    return safe;
};

const sendError = (res, status, message) => res.status(status).json({ message });

// Verifies the bearer token, then re-reads the employee so role changes and disabled access apply immediately.
export const requireAuth = (db) => async (req, res, next) => {
    try {
        const header = req.get("authorization") || "";
        const match = header.match(/^Bearer (.+)$/i);
        if (!match) return sendError(res, 401, "Authentication required");

        const claims = verifyToken(match[1]);
        if (!claims) return sendError(res, 401, "Invalid or expired token");

        const result = await db.query(
            `SELECT employee_id, role, access_disabled FROM employees WHERE employee_id = $1`,
            [claims.sub]
        );
        const employee = result.rows[0];
        if (!employee) return sendError(res, 401, "Invalid or expired token");
        if (employee.access_disabled === true) return sendError(res, 403, "Access disabled");

        req.auth = {
            employeeId: employee.employee_id,
            role: String(employee.role || "").toLowerCase(),
        };
        next();
    } catch (error) {
        console.error("Auth error:", error.message);
        sendError(res, 500, "Authentication failed");
    }
};

export const requireHR = (req, res, next) =>
    req.auth?.role === "hr" ? next() : sendError(res, 403, "HR access required");

// HR may act on any employee; an employee only on their own record (:employeeId)
export const requireSelfOrHR = (req, res, next) => {
    if (req.auth?.role === "hr") return next();
    if (req.auth?.employeeId && req.auth.employeeId === req.params.employeeId) return next();
    return sendError(res, 403, "You can only modify your own record");
};

export const createLoginHandler = (db) => async (req, res) => {
    try {
        const employeeId = String(req.body?.employee_id ?? "").trim();
        const password = req.body?.password;
        if (!employeeId || typeof password !== "string" || !password) {
            return sendError(res, 400, "Employee ID and password are required");
        }

        const result = await db.query(`SELECT * FROM employees WHERE employee_id = $1`, [employeeId]);
        if (result.rows.length === 0) return sendError(res, 401, "Invalid employee ID or password");
        const employee = result.rows[0];

        if (employee.access_disabled === true) {
            return sendError(res, 403, "Your account has been disabled. Please contact HR.");
        }

        // Imported (D365) employees have no password until HR issues one
        if (!employee.password) return sendError(res, 401, "Invalid employee ID or password");

        const valid = await bcrypt.compare(password, employee.password);
        if (!valid) return sendError(res, 401, "Invalid employee ID or password");

        res.json({
            message: "Login successful",
            employee: stripPassword(employee),
            token: signToken(employee.employee_id),
        });
    } catch (error) {
        console.error("Login error:", error.message);
        sendError(res, 500, "Login failed");
    }
};
