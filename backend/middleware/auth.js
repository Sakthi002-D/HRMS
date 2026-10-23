import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { employeeMappingPredicate, setAccountPassword } from "../services/accountCredentials.js";

const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS) || 8 * 60 * 60;

let secret = process.env.AUTH_TOKEN_SECRET;
if (!secret) {
    secret = randomBytes(32).toString("hex");
    console.warn("AUTH_TOKEN_SECRET is not set: using an ephemeral secret, tokens are invalidated on restart.");
}

const b64 = (value) => Buffer.from(value).toString("base64url");
const sign = (data, key) => createHmac("sha256", key).update(data).digest("base64url");

export const signToken = (employeeId, {
    key = secret,
    ttl = TOKEN_TTL_SECONDS,
    now = Date.now(),
    identityType = "hr",
    credentialVersion = 0,
    purpose = "session",
} = {}) => {
    const payload = b64(JSON.stringify({
        sub: employeeId,
        typ: identityType,
        ver: credentialVersion,
        purpose,
        exp: Math.floor(now / 1000) + ttl,
    }));
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
    const safe = { ...row };
    delete safe.password;
    delete safe.password_hash;
    return safe;
};

const sendError = (res, status, message) => res.status(status).json({ message });

export const isPublicApiRequest = (req) => {
    const path = req.path;
    const method = req.method.toUpperCase();
    if (method === "POST" && ["/login", "/forgot-password", "/verify-otp", "/reset-password"].includes(path)) return true;
    return (method === "GET" && /^\/careers\/(meta|jobs(?:\/[^/]+)?)$/.test(path))
        || (method === "POST" && /^\/careers\/jobs\/[^/]+\/apply$/.test(path));
};

const EMPLOYEE_SELF_PATHS = [
    /^\/assistant(?:\/.*)?$/,
    /^\/employees\/[^/]+(?:\/(?:details|about|education(?:\/[^/]+)?|family|bank|project|experience(?:\/[^/]+)?|change-password|annual-leave-balance|documents(?:\/[^/]+)?))?$/,
    /^\/attendance\/employee\/[^/]+\/summary$/,
    /^\/attendance\/employee\/[^/]+$/,
    /^\/payroll\/employee\/[^/]+$/,
    /^\/employee-requests(?:\/[^/]+)?$/,
    /^\/notifications\/employee\/[^/]+$/,
    /^\/notifications\/inbox\/[^/]+$/,
    /^\/notifications\/inbox\/[^/]+\/read$/,
    /^\/leaves\/employee\/[^/]+$/,
    /^\/leaves\/[^/]+\/cancel$/,
    /^\/leaves$/,
    /^\/resignations(?:\/employee\/[^/]+|\/[^/]+(?:\/(?:withdraw))?)?$/,
    /^\/employees\/[^/]+\/documents(?:\/[^/]+)?$/,
    /^\/employee-requests\/[^/]+\/documents$/,
    /^\/tickets(?:\/[^/]+(?:\/comments)?)?$/,
    /^\/ticket-categories$/,
    /^\/leave-policies$/,
    /^\/recruitment\/meta$/,
];

const isEmployeeSelfPath = (path) => EMPLOYEE_SELF_PATHS.some((pattern) => pattern.test(path));

const employeeMethodAllowed = (path, method) => {
    if (/^\/(?:leave-policies|ticket-categories|recruitment\/meta)$/.test(path)) return method === "GET";
    if (/^\/(?:attendance|payroll|notifications\/employee|leaves\/employee)\//.test(path)) return method === "GET";
    if (path === "/leaves" || path === "/employee-requests" || path === "/resignations" || path === "/assistant") return method === "POST";
    if (/^\/leaves\/[^/]+\/cancel$/.test(path)) return method === "PUT";
    if (/^\/resignations\/employee\//.test(path)) return method === "GET";
    if (/^\/resignations\/[^/]+\/withdraw$/.test(path)) return method === "POST";
    if (path.startsWith("/resignations/")) return false;
    if (path.startsWith("/notifications/inbox/")) return false;
    if (/^\/employee-requests\/[^/]+$/.test(path)) return method === "GET";
    if (/^\/employee-requests\/[^/]+\/documents$/.test(path)) return method === "GET";
    if (path === "/tickets" || /^\/tickets\/[^/]+\/comments$/.test(path)) return ["GET", "POST"].includes(method);
    if (/^\/tickets\/[^/]+$/.test(path)) return method === "GET";
    if (/^\/employees\/[^/]+\/change-password$/.test(path)) return method === "POST";
    if (/^\/employees\/[^/]+\/(?:details|annual-leave-balance)$/.test(path)) return method === "GET";
    if (/^\/employees\/[^/]+\/documents(?:\/[^/]+)?$/.test(path)) return ["GET", "POST"].includes(method);
    if (/^\/employees\/[^/]+$/.test(path)) return method === "PUT";
    return /^\/employees\/[^/]+\/(?:about|education(?:\/[^/]+)?|family|bank|project|experience(?:\/[^/]+)?)$/.test(path)
        && ["POST", "PUT", "DELETE"].includes(method);
};

export const createApiAccessMiddleware = (db) => {
    const authenticate = requireAuth(db);
    return async (req, res, next) => {
        if (isPublicApiRequest(req)) return next();
        return authenticate(req, res, async () => {
            if (req.auth.role === "hr") return next();
            if (!isEmployeeSelfPath(req.path) || !employeeMethodAllowed(req.path, req.method.toUpperCase())) {
                return sendError(res, 403, "HR access required");
            }

            const pathEmployeeId = req.params?.employeeId
                || req.params?.employee_id
                || req.path.match(/^\/(?:attendance\/employee|payroll\/employee|notifications\/employee|leaves\/employee|resignations\/employee)\/([^/]+)/)?.[1]
                || req.path.match(/^\/employee-requests\/([^/]+)$/)?.[1]
                || req.path.match(/^\/notifications\/inbox\/([^/]+)$/)?.[1]
                || req.path.match(/^\/employees\/([^/]+)/)?.[1];
            if (pathEmployeeId && pathEmployeeId !== req.auth.employeeId) {
                return sendError(res, 403, "You can only access your own records");
            }

            const bodyEmployeeId = req.body?.employee_id || req.body?.employeeID || req.body?.raised_by || req.body?.actor_id;
            if (bodyEmployeeId && bodyEmployeeId !== req.auth.employeeId) {
                return sendError(res, 403, "You can only act on your own records");
            }
            if (req.body && (req.path === "/leaves" || req.path === "/employee-requests" || req.path === "/resignations" || req.path === "/tickets")) {
                req.body.employee_id = req.auth.employeeId;
            }
            return next();
        });
    };
};

// Tokens bind the identity class and credential version; all claims are checked against current records.
export const requireAuth = (db) => async (req, res, next) => {
    try {
        const header = req.get("authorization") || "";
        const match = header.match(/^Bearer\s+(.+)$/i);
        if (!match) return sendError(res, 401, "Authentication required");

        const claims = verifyToken(match[1]);
        if (!claims || claims.purpose !== "session" || !["hr", "employee"].includes(claims.typ)
            || !Number.isInteger(claims.ver) || claims.ver < 0) return sendError(res, 401, "Invalid or expired token");

        let result;
        if (claims.typ === "employee") {
            result = await db.query(
                `SELECT e.employee_id, e.name, e.department, e.designation, e.email, e.status, e.access_disabled,
                        l.credential_version, l.enabled
                 FROM employee_logins l
                 JOIN employees e ON e.employee_id = l.employee_id
                 WHERE l.employee_id = $1 AND ${employeeMappingPredicate}`,
                [claims.sub]
            );
        } else {
            result = await db.query(
                `SELECT employee_id, name, department, designation, email, role, status, access_disabled,
                        COALESCE((to_jsonb(e)->>'auth_credential_version')::integer, 0) AS credential_version
                 FROM employees e WHERE employee_id = $1`,
                [claims.sub]
            );
        }
        const identity = result.rows[0];
        if (!identity || Number(identity.credential_version || 0) !== Number(claims.ver || 0)) {
            return sendError(res, 401, "Invalid or expired token");
        }
        if (claims.typ === "employee" && identity.enabled !== true) return sendError(res, 401, "Invalid or expired token");
        if (claims.typ === "hr" && String(identity.role || "").toLowerCase() !== "hr") return sendError(res, 401, "Invalid or expired token");
        if (identity.access_disabled === true || String(identity.status || "").toLowerCase() !== "active") {
            return sendError(res, 403, "Access disabled");
        }

        req.auth = {
            employeeId: identity.employee_id,
            role: claims.typ,
            identityType: claims.typ,
            name: identity.name,
            department: identity.department,
            designation: identity.designation,
            email: identity.email,
            credentialVersion: Number(identity.credential_version || 0),
        };
        return next();
    } catch (error) {
        if (["42P01", "42703"].includes(error.code)) {
            console.error("Authentication schema unavailable:", error.code);
            return sendError(res, 503, "Authentication database setup is incomplete. Please contact the administrator.");
        }
        console.error("Auth error:", error.message);
        return sendError(res, 500, "Authentication failed");
    }
};

export const requireHR = (req, res, next) =>
    req.auth?.identityType === "hr" ? next() : sendError(res, 403, "HR access required");

export const requireSelfOrHR = (req, res, next) =>
    req.auth?.identityType === "hr" || req.auth?.employeeId === req.params.employeeId
        ? next()
        : sendError(res, 403, "You can only modify your own record");

export const createChangePasswordHandler = (db) => async (req, res) => {
    try {
        const { current_password, new_password, repeat_password } = req.body || {};
        if (![current_password, new_password, repeat_password].every((value) => typeof value === "string" && value)) {
            return sendError(res, 400, "All password fields are required");
        }
        if (new_password.length < 6 || new_password !== repeat_password) {
            return sendError(res, 400, "New passwords must match and contain at least 6 characters");
        }
        if (req.auth.employeeId !== req.params.employeeId) return sendError(res, 403, "You can only change your own password");
        const result = req.auth.identityType === "employee"
            ? await db.query("SELECT password_hash AS password FROM employee_logins WHERE employee_id = $1 AND enabled = TRUE", [req.auth.employeeId])
            : await db.query("SELECT password FROM employees WHERE employee_id = $1 AND LOWER(role) = 'hr'", [req.auth.employeeId]);
        if (!result.rows[0]?.password || !(await bcrypt.compare(current_password, result.rows[0].password))) {
            return sendError(res, 401, "Current password is incorrect");
        }
        const updated = await setAccountPassword(db, {
            identityType: req.auth.identityType,
            employeeId: req.auth.employeeId,
            passwordHash: await bcrypt.hash(new_password, 10),
        });
        if (!updated.rows.length) return sendError(res, 409, "Account changed; sign in again");
        return res.json({ message: "Password changed successfully. Please sign in again." });
    } catch (error) {
        console.error("Password change failed:", error.code || "ACCOUNT_PASSWORD_CHANGE");
        return sendError(res, 500, "Failed to change password");
    }
};

export const createLoginHandler = (db) => async (req, res) => {
    try {
        const username = String(req.body?.username ?? req.body?.employee_id ?? "").trim();
        const password = req.body?.password;
        if (!username || typeof password !== "string" || !password) {
            return sendError(res, 400, "Username and password are required");
        }

        // HR sign-in must not depend on the employee portal migration being installed.
        const result = await db.query(
            `SELECT employee_id, name, department, designation, email, role, password, status, access_disabled,
                    COALESCE((to_jsonb(e)->>'auth_credential_version')::integer, 0) AS credential_version
             FROM employees e WHERE employee_id = $1 AND LOWER(role) = 'hr'`,
            [username]
        );
        const hr = result.rows[0];
        if (hr && String(hr.role || "").toLowerCase() === "hr") {
            if (hr.access_disabled === true || String(hr.status || "").toLowerCase() !== "active") {
                return sendError(res, 403, "Your account has been disabled. Please contact HR.");
            }
            if (!hr.password || !(await bcrypt.compare(password, hr.password))) {
                return sendError(res, 401, "Invalid username or password");
            }
            const employee = { ...stripPassword(hr), role: "hr" };
            delete employee.credential_version;
            return res.json({
                message: "Login successful",
                employee,
                role: "hr",
                token: signToken(hr.employee_id, { identityType: "hr", credentialVersion: hr.credential_version }),
            });
        }
        if (!/^EMP[A-Za-z0-9-]+$/i.test(username)) {
            return sendError(res, 401, "Invalid username or password");
        }

        const employeeLogin = await db.query(
            `SELECT e.employee_id, e.name, e.department, e.designation, e.email, e.status, e.access_disabled,
                    l.password_hash, l.credential_version, l.enabled
             FROM employee_logins l
             JOIN employees e ON e.employee_id = l.employee_id
             WHERE l.normalized_username = LOWER(BTRIM($1)) AND ${employeeMappingPredicate}`,
            [username]
        );
        if (employeeLogin.rows.length) {
            const identity = employeeLogin.rows[0];
            if (!identity.enabled || identity.access_disabled === true || String(identity.status || "").toLowerCase() !== "active") {
                return sendError(res, 403, "Your account has been disabled. Please contact HR.");
            }
            if (!(await bcrypt.compare(password, identity.password_hash))) {
                return sendError(res, 401, "Invalid username or password");
            }
            const employee = { ...identity, role: "employee" };
            delete employee.password_hash;
            delete employee.credential_version;
            delete employee.enabled;
            return res.json({
                message: "Login successful",
                employee,
                role: "employee",
                token: signToken(identity.employee_id, { identityType: "employee", credentialVersion: identity.credential_version }),
            });
        }

        return sendError(res, 401, "Invalid username or password");
    } catch (error) {
        if (["42P01", "42703"].includes(error.code)) {
            console.error("Login schema unavailable:", error.code);
            return sendError(res, 503, "Authentication database setup is incomplete. Please contact the administrator.");
        }
        console.error("Login error:", error.message);
        return sendError(res, 500, "Login failed");
    }
};
