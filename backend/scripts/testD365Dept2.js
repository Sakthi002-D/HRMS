// Final diagnostic: find department name fields + office location
// Run from backend/ folder:   node scripts/testD365Dept2.js

import "dotenv/config";

const origin = new URL(process.env.D365_BASE_URL?.trim()).origin;
const tenantId = process.env.D365_TENANT_ID?.trim();
const clientId = process.env.D365_CLIENT_ID?.trim();
const clientSecret = process.env.D365_CLIENT_SECRET?.trim();

const { access_token: token } = await (await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId,
        client_secret: clientSecret, scope: `${origin}/.default` }) }
)).json();
console.log("✅ Token OK\n");

const get = async (path) => {
    console.log(`→ GET /data/${path.slice(0, 130)}`);
    try {
        const res = await fetch(`${origin}/data/${path}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            signal: AbortSignal.timeout(30_000),
        });
        const text = await res.text();
        if (!res.ok) { console.log(`  ❌ ${res.status}: ${text.slice(0, 300)}\n`); return null; }
        return JSON.parse(text);
    } catch (e) { console.log(`  ❌ ${e.message}\n`); return null; }
};

const print = (data, label) => {
    const rec = data?.value?.[0] ?? data;
    if (!rec || typeof rec !== "object") { console.log(`  (no data)\n`); return; }
    console.log(`  ✅ ${label}`);
    for (const [k, v] of Object.entries(rec).filter(([k]) => !k.startsWith("@")).sort())
        if (v !== null && v !== "" && v !== "0001-01-01T00:00:00Z") console.log(`    ${k}: ${v}`);
    console.log();
};

// ─── 1. Departments entity — get ONE record to see ALL field names ─────────
console.log("=== Departments entity — all fields ===\n");
print(await get(`Departments?$top=1&cross-company=true`), "Departments (first record)");

// ─── 2. Search Departments by name ────────────────────────────────────────
console.log("=== Search for 'Mechanical' in Departments ===\n");
const mech = await get(`Departments?$filter=contains(Name,'Mechanical')&cross-company=true&$top=3`);
if (mech?.value?.length) mech.value.forEach((r, i) => print({value:[r]}, `Departments[${i}]`));
else console.log("  (none found with Name contains 'Mechanical')\n");

// ─── 3. EmployeesV2 — check if it has location/city fields ────────────────
console.log("=== EmployeesV2 select only location-related fields ===\n");
print(await get(`EmployeesV2?$filter=PersonnelNumber eq '3544'&cross-company=true&$top=1&$select=PersonnelNumber,PrimaryAddressCity,PrimaryAddressCountryRegionId,WorkerLocationId,OfficeLocation,WorkerType`), "EmployeesV2 location fields");

// ─── 4. LegalEntities — find SHLT's city (without bad fields) ─────────────
console.log("=== LegalEntities for SHLT ===\n");
const le = await get(`LegalEntities?$filter=LegalEntityId eq 'SHLT'&cross-company=true&$top=1`);
if (le?.value?.[0]) {
    const rec = le.value[0];
    console.log("  SHLT fields:");
    for (const [k, v] of Object.entries(rec).filter(([k]) => !k.startsWith("@")).sort())
        if (v !== null && v !== "") console.log(`    ${/city|addr|loc|name|country|region/i.test(k) ? "*** " : "    "}${k}: ${v}`);
    console.log();
}

console.log("=== DONE ===\n");
