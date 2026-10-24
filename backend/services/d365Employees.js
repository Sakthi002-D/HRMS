const REQUEST_TIMEOUT_MS = 300_000;
const MAX_PAGES = 200;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

export class D365Error extends Error {
    constructor(stage, message, { upstreamStatus = null, httpStatus = 502, code = null } = {}) {
        super(message);
        this.name = "D365Error";
        this.stage = stage;
        this.upstreamStatus = upstreamStatus;
        this.httpStatus = httpStatus;
        this.code = code;
    }
}

const redact = (text, config) => {
    let safe = String(text ?? "");
    for (const secret of [config?.clientSecret, config?.clientId, cachedToken]) {
        if (secret) {
            safe = safe.split(secret).join("[redacted]");
        }
    }
    return safe
        .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [redacted]")
        .replace(/eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g, "[redacted-token]")
        .split(/\r?\n/)[0]
        .slice(0, 300);
};

const readErrorDetail = async (response, config) => {
    try {
        const body = await response.json();
        const code = typeof body.error === "string" ? body.error : body.error?.code ?? null;
        const message = body.error_description ?? body.error?.message ?? body.message ?? "";
        return { code: code ? redact(code, config) : null, message: redact(message, config) };
    } catch {
        return { code: null, message: "" };
    }
};

export const getD365Config = () => {
    const rawBaseUrl = process.env.D365_BASE_URL?.trim();
    const tenantId = process.env.D365_TENANT_ID?.trim();
    const clientId = process.env.D365_CLIENT_ID?.trim();
    const clientSecret = process.env.D365_CLIENT_SECRET?.trim();

    const missing = [
        ["D365_BASE_URL", rawBaseUrl],
        ["D365_TENANT_ID", tenantId],
        ["D365_CLIENT_ID", clientId],
        ["D365_CLIENT_SECRET", clientSecret],
    ].filter(([, value]) => !value).map(([name]) => name);

    if (missing.length) {
        throw new D365Error("config", `Missing backend configuration: ${missing.join(", ")}`, { httpStatus: 500 });
    }

    let parsed;
    try {
        parsed = new URL(rawBaseUrl);
    } catch {
        throw new D365Error("config", "D365_BASE_URL is not a valid URL", { httpStatus: 500 });
    }
    if (parsed.protocol !== "https:" || (parsed.pathname !== "/" && parsed.pathname !== "") || parsed.search || parsed.hash) {
        throw new D365Error("config", "D365_BASE_URL must be the HTTPS environment root URL (no path)", { httpStatus: 500 });
    }

    return { baseUrl: parsed.origin, tenantId, clientId, clientSecret };
};

const fetchWithTimeout = async (stage, url, options, config) => {
    try {
        return await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
        const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
        throw new D365Error(
            stage,
            timedOut
                ? `D365 ${stage} request timed out`
                : `D365 ${stage} request could not connect: ${redact(error?.cause?.code || error?.message, config)}`,
            { httpStatus: timedOut ? 504 : 502 }
        );
    }
};

export const getAccessToken = async (config) => {
    if (cachedToken && cachedTokenExpiresAt > Date.now()) {
        return cachedToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
    const response = await fetchWithTimeout("authentication", tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: config.clientId,
            client_secret: config.clientSecret,
            scope: `${config.baseUrl}/.default`,
        }),
    }, config);

    if (!response.ok) {
        const detail = await readErrorDetail(response, config);
        throw new D365Error(
            "authentication",
            `D365 authentication failed (${response.status}${detail.code ? ` ${detail.code}` : ""}): ${detail.message || "no details"}`,
            { upstreamStatus: response.status, code: detail.code }
        );
    }

    const data = await response.json();
    const expiresInSeconds = Number(data.expires_in);
    if (typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
        throw new D365Error("authentication", "D365 authentication response was missing a valid access token");
    }

    cachedToken = data.access_token;
    cachedTokenExpiresAt = Date.now() + Math.max(0, expiresInSeconds - 60) * 1000;
    return cachedToken;
};

const fetchD365Employees = async () => {
    const config = getD365Config();
    const accessToken = await getAccessToken(config);
    const startUrl = new URL(`${config.baseUrl}/data/EmployeesV2`);
    startUrl.searchParams.set("$select", "PersonnelNumber,EmploymentLegalEntityId,EmploymentId,Name");

    const employees = [];
    const seenIdentities = new Set();
    let nextUrl = startUrl;
    let pages = 0;

    while (nextUrl) {
        if (nextUrl.origin !== config.baseUrl) {
            throw new D365Error("employees", "D365 returned a pagination link for an unexpected host");
        }
        if (++pages > MAX_PAGES) {
            throw new D365Error("employees", "D365 employee pagination exceeded the safety limit");
        }

        const response = await fetchWithTimeout("employees", nextUrl, {
            headers: {
                Authorization: "Bearer " + accessToken,
                Accept: "application/json",
            },
        }, config);

        if (!response.ok) {
            if (response.status === 401) {
                cachedToken = null;
                cachedTokenExpiresAt = 0;
            }
            const detail = await readErrorDetail(response, config);
            throw new D365Error(
                "employees",
                `D365 EmployeesV2 request failed (${response.status}${detail.code ? ` ${detail.code}` : ""}): ${detail.message || "no details"}`,
                { upstreamStatus: response.status, code: detail.code }
            );
        }

        const data = await response.json();
        if (!Array.isArray(data.value)) {
            throw new D365Error("employees", "D365 EmployeesV2 response did not contain an employee list");
        }

        for (const employee of data.value) {
            const personnelNumber = employee.PersonnelNumber == null ? "" : String(employee.PersonnelNumber).trim();
            const name = typeof employee.Name === "string" ? employee.Name.trim() : "";
            const employmentLegalEntityId = employee.EmploymentLegalEntityId == null ? "" : String(employee.EmploymentLegalEntityId);
            const employmentId = employee.EmploymentId == null ? "" : String(employee.EmploymentId);

            if (!personnelNumber || !name) {
                continue;
            }

            const identity = JSON.stringify([personnelNumber, employmentLegalEntityId, employmentId]);
            if (seenIdentities.has(identity)) {
                continue;
            }
            seenIdentities.add(identity);

            employees.push({ personnelNumber, employmentLegalEntityId, employmentId, name });
        }

        nextUrl = data["@odata.nextLink"] ? new URL(data["@odata.nextLink"], nextUrl) : null;
    }

    return employees;
};

const EMPLOYEE_CACHE_TTL_MS = 5 * 60_000;
let cachedEmployees = null;
let cachedEmployeesExpiresAt = 0;
let inFlightEmployees = null;

export const getD365Employees = async () => {
    if (cachedEmployees && cachedEmployeesExpiresAt > Date.now()) {
        return cachedEmployees;
    }

    inFlightEmployees ??= fetchD365Employees()
        .then((employees) => {
            cachedEmployees = employees;
            cachedEmployeesExpiresAt = Date.now() + EMPLOYEE_CACHE_TTL_MS;
            return employees;
        })
        .finally(() => {
            inFlightEmployees = null;
        });

    return inFlightEmployees;
};

export const findD365Employee = async ({ personnelNumber, employmentLegalEntityId, employmentId }) => {
    const employees = await getD365Employees();
    return employees.find((employee) =>
        employee.personnelNumber === String(personnelNumber ?? "").trim() &&
        employee.employmentLegalEntityId === String(employmentLegalEntityId ?? "") &&
        employee.employmentId === String(employmentId ?? "")
    ) || null;
};
