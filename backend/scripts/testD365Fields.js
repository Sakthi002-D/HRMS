// Run this from the backend folder to discover what fields EmployeesV2 exposes:
//   node testD365Fields.js
//
// It fetches ONE record for personnel 3544 with NO $select so all fields come back.
// Look for "hire", "department", "date" in the output to find the correct field names.

import "dotenv/config";

const baseUrl = process.env.D365_BASE_URL?.trim();
const tenantId = process.env.D365_TENANT_ID?.trim();
const clientId = process.env.D365_CLIENT_ID?.trim();
const clientSecret = process.env.D365_CLIENT_SECRET?.trim();

if (!baseUrl || !tenantId || !clientId || !clientSecret) {
    console.error("Missing D365 env vars. Run from backend/ folder where .env lives.");
    process.exit(1);
}

// 1. Get token
const tokenRes = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
            scope: `${new URL(baseUrl).origin}/.default`,
        }),
    }
);
const tokenData = await tokenRes.json();
if (!tokenData.access_token) {
    console.error("Auth failed:", JSON.stringify(tokenData).slice(0, 300));
    process.exit(1);
}
const token = tokenData.access_token;
console.log("✅ Token OK");

// 2. Fetch one record for 3544 with NO $select (all fields returned)
const url = `${new URL(baseUrl).origin}/data/EmployeesV2?$filter=PersonnelNumber eq '3544'&cross-company=true&$top=1`;
console.log("Fetching:", url.replace(baseUrl, "[D365]"));

const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
});

if (!res.ok) {
    const text = await res.text();
    console.error(`D365 returned ${res.status}:`, text.slice(0, 500));
    process.exit(1);
}

const data = await res.json();
const record = data.value?.[0];
if (!record) {
    console.error("No record found for PersonnelNumber 3544.");
    process.exit(1);
}

// 3. Print all fields, highlighting date and department-related ones
console.log("\n=== ALL EmployeesV2 FIELDS FOR 3544 ===\n");
const keys = Object.keys(record).filter(k => !k.startsWith("@"));
for (const key of keys.sort()) {
    const val = record[key];
    const highlight = /hire|department|start|date|begin|origin|seniority/i.test(key);
    console.log(`${highlight ? "*** " : "    "}${key}: ${val}`);
}

console.log("\n=== FIELDS WITH VALUES (non-null, non-empty) ===\n");
for (const key of keys.sort()) {
    const val = record[key];
    if (val !== null && val !== "" && val !== "0001-01-01T00:00:00Z") {
        console.log(`  ${key}: ${val}`);
    }
}
