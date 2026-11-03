// Diagnostic: find the department name entity for DepartmentNumber 00000031
// Also search for office location (Doha) for employee 3544
// Run from backend/ folder:   node scripts/testD365Department.js

import "dotenv/config";

const origin = new URL(process.env.D365_BASE_URL?.trim()).origin;
const tenantId = process.env.D365_TENANT_ID?.trim();
const clientId = process.env.D365_CLIENT_ID?.trim();
const clientSecret = process.env.D365_CLIENT_SECRET?.trim();

const tokenRes = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId,
        client_secret: clientSecret, scope: `${origin}/.default` }) }
);
const { access_token: token } = await tokenRes.json();
if (!token) { console.error("Auth failed"); process.exit(1); }
console.log("✅ Token OK\n");

const get = async (path) => {
    const url = `${origin}/data/${path}`;
    console.log(`→ GET /data/${path.slice(0, 130)}`);
    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
        const text = await res.text();
        if (!res.ok) { console.log(`  ❌ ${res.status}: ${text.slice(0, 200)}\n`); return null; }
        return JSON.parse(text);
    } catch (e) { console.log(`  ❌ Error: ${e.message}\n`); return null; }
};

const printAll = (data, label) => {
    if (!data) return;
    const rec = data.value ? data.value[0] : data;
    if (!rec) { console.log(`  (empty)\n`); return; }
    console.log(`  ✅ ${label}`);
    for (const [k, v] of Object.entries(rec).filter(([k]) => !k.startsWith("@")).sort()) {
        if (v !== null && v !== "" && v !== "0001-01-01T00:00:00Z") console.log(`    ${k}: ${v}`);
    }
    console.log();
};

// ─── Department name lookup ───────────────────────────────────────────────────
console.log("=== DEPARTMENT NAME (DepartmentNumber 00000031) ===\n");

printAll(await get(`OMDepartments?$filter=DepartmentNumber eq '00000031'&cross-company=true&$top=1`), "OMDepartments");
printAll(await get(`Departments?$filter=DepartmentNumber eq '00000031'&cross-company=true&$top=1`), "Departments");
printAll(await get(`DepartmentV2?$filter=DepartmentNumber eq '00000031'&cross-company=true&$top=1`), "DepartmentV2");
printAll(await get(`OMOperatingUnits?$filter=OperatingUnitNumber eq '00000031'&cross-company=true&$top=1`), "OMOperatingUnits");

// ─── Office location ─────────────────────────────────────────────────────────
console.log("=== OFFICE LOCATION (looking for Doha) ===\n");

// Maybe WorkerLocation entity
printAll(await get(`WorkerLocations?$filter=PersonnelNumber eq '3544'&cross-company=true&$top=1`), "WorkerLocations");

// PositionDetails might have a Location field - fetch ALL fields for POS68
const posAll = await get(`PositionDetails?$filter=PositionId eq 'POS68'&cross-company=true&$top=1`);
if (posAll?.value?.[0]) {
    const rec = posAll.value[0];
    console.log("  All PositionDetails fields (looking for location):");
    for (const [k, v] of Object.entries(rec).filter(([k]) => !k.startsWith("@")).sort()) {
        const hi = /loc|city|doha|office|site|facility/i.test(k);
        if (hi || (v !== null && v !== "" && v !== "0001-01-01T00:00:00Z"))
            console.log(`  ${hi ? "*** " : "    "}${k}: ${v}`);
    }
    console.log();
}

// Legal entity location (SHLT may be in Doha)
printAll(await get(`LegalEntities?$filter=LegalEntityId eq 'SHLT'&cross-company=true&$top=1&$select=LegalEntityId,Name,PrimaryAddressCity,PrimaryAddressCountryRegionId,AddressCity`), "LegalEntity SHLT location");

// EmploymentDetails might have a location
printAll(await get(`EmploymentDetails?$filter=PersonnelNumber eq '3544'&cross-company=true&$top=1`), "EmploymentDetails");

console.log("=== DONE ===\n");
