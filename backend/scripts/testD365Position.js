// Diagnostic: discover D365 Position/Department fields for employee 3544
// Run from backend/ folder:   node scripts/testD365Position.js
//
// This tries several D365 entities that could hold department and office location.
// Output tells us the exact entity names + field names to use in the real sync.

import "dotenv/config";

const baseUrl = process.env.D365_BASE_URL?.trim();
const tenantId = process.env.D365_TENANT_ID?.trim();
const clientId = process.env.D365_CLIENT_ID?.trim();
const clientSecret = process.env.D365_CLIENT_SECRET?.trim();

if (!baseUrl || !tenantId || !clientId || !clientSecret) {
    console.error("Missing D365 env vars. Run from backend/ folder where .env lives.");
    process.exit(1);
}

const origin = new URL(baseUrl).origin;

// ─── Auth ───────────────────────────────────────────────────────────────────
const tokenRes = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
            scope: `${origin}/.default`,
        }),
    }
);
const tokenData = await tokenRes.json();
if (!tokenData.access_token) {
    console.error("Auth failed:", JSON.stringify(tokenData).slice(0, 300));
    process.exit(1);
}
const token = tokenData.access_token;
console.log("✅ Token OK\n");

// ─── Helper ──────────────────────────────────────────────────────────────────
const get = async (path) => {
    const url = `${origin}/data/${path}`;
    console.log(`→ GET /data/${path.slice(0, 120)}`);
    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            signal: AbortSignal.timeout(60_000),
        });
        const text = await res.text();
        if (!res.ok) {
            console.log(`  ❌ ${res.status}: ${text.slice(0, 200)}\n`);
            return null;
        }
        const json = JSON.parse(text);
        return json;
    } catch (e) {
        console.log(`  ❌ Error: ${e.message}\n`);
        return null;
    }
};

const printRecord = (record, label) => {
    if (!record) return;
    console.log(`\n  ✅ ${label}`);
    const keys = Object.keys(record).filter(k => !k.startsWith("@")).sort();
    // First show non-null values
    console.log("  Non-null fields:");
    for (const key of keys) {
        const val = record[key];
        if (val !== null && val !== "" && val !== "0001-01-01T00:00:00Z") {
            const highlight = /dept|depart|location|office|position|title|name|description/i.test(key);
            console.log(`    ${highlight ? "*** " : "    "}${key}: ${val}`);
        }
    }
    console.log();
};

// ─── Step 1: EmployeesV2 with wider SELECT to find location fields ─────────
console.log("=== STEP 1: EmployeesV2 with extra location/department fields ===\n");
const emp = await get(`EmployeesV2?$filter=PersonnelNumber eq '3544'&cross-company=true&$top=1&$select=PersonnelNumber,EmploymentLegalEntityId,EmploymentId,PrimaryPositionId,WorkerLocationId,OfficeLocation,WorkLocation,DepartmentId,DepartmentName,WorkerType,ProfessionalTitle`);
if (emp?.value?.[0]) {
    printRecord(emp.value[0], "EmployeesV2 extra fields");
} else {
    // Try without $select to see ALL fields and look for location/department
    console.log("  Falling back to full record (no $select)...");
    const empFull = await get(`EmployeesV2?$filter=PersonnelNumber eq '3544'&cross-company=true&$top=1`);
    if (empFull?.value?.[0]) {
        const rec = empFull.value[0];
        console.log("  Location/department/position-related fields:");
        for (const key of Object.keys(rec).sort()) {
            if (/dept|depart|location|office|position|title|site|facility/i.test(key)) {
                console.log(`    ${key}: ${rec[key]}`);
            }
        }
    }
}

// ─── Step 2: Worker position assignments ─────────────────────────────────────
console.log("\n=== STEP 2: Worker position assignments for PersonnelNumber 3544 ===\n");

// Try HcmPositionWorkerAssignment
const assign1 = await get(`HcmPositionWorkerAssignment?$filter=PersonnelNumber eq '3544'&cross-company=true&$top=5`);
if (assign1?.value?.length) {
    console.log(`  Found ${assign1.value.length} record(s):`);
    assign1.value.forEach((r, i) => printRecord(r, `HcmPositionWorkerAssignment[${i}]`));
}

// Try PositionWorkerAssignments (V2 style)
const assign2 = await get(`PositionWorkerAssignments?$filter=PersonnelNumber eq '3544'&cross-company=true&$top=5`);
if (assign2?.value?.length) {
    console.log(`  Found ${assign2.value.length} record(s):`);
    assign2.value.forEach((r, i) => printRecord(r, `PositionWorkerAssignments[${i}]`));
}

// Try HcmWorkerBaseEntity
const assign3 = await get(`HcmWorker?$filter=PersonnelNumber eq '3544'&cross-company=true&$top=1`);
if (assign3?.value?.length) printRecord(assign3.value[0], "HcmWorker");

// ─── Step 3: Position details by POS68 ───────────────────────────────────────
console.log("\n=== STEP 3: Position details for POS68 ===\n");

// Try HcmPositionDetail
const pos1 = await get(`HcmPositionDetail?$filter=PositionId eq 'POS68'&cross-company=true&$top=1`);
if (pos1?.value?.length) printRecord(pos1.value[0], "HcmPositionDetail");

// Try PositionDetails
const pos2 = await get(`PositionDetails?$filter=PositionId eq 'POS68'&cross-company=true&$top=1`);
if (pos2?.value?.length) printRecord(pos2.value[0], "PositionDetails");

// Try HcmPosition
const pos3 = await get(`HcmPosition?$filter=PositionId eq 'POS68'&cross-company=true&$top=1`);
if (pos3?.value?.length) printRecord(pos3.value[0], "HcmPosition");

// Try HcmPositionHierarchy
const pos4 = await get(`HcmPositionHierarchy?$filter=PositionId eq 'POS68'&cross-company=true&$top=1`);
if (pos4?.value?.length) printRecord(pos4.value[0], "HcmPositionHierarchy");

// ─── Step 4: Department entity ───────────────────────────────────────────────
console.log("\n=== STEP 4: Try to list departments ===\n");

const dept1 = await get(`OMOperatingUnit?$filter=contains(Name,'Mechanical')&cross-company=true&$top=3`);
if (dept1?.value?.length) {
    dept1.value.forEach((r, i) => printRecord(r, `OMOperatingUnit[${i}]`));
}

const dept2 = await get(`HcmDepartments?$top=3&cross-company=true`);
if (dept2?.value?.length) {
    dept2.value.forEach((r, i) => printRecord(r, `HcmDepartments[${i}]`));
}

// ─── Step 5: Worker location ─────────────────────────────────────────────────
console.log("\n=== STEP 5: Worker locations / office locations ===\n");

const loc1 = await get(`WorkerLocationLookup?$filter=PersonnelNumber eq '3544'&cross-company=true&$top=1`);
if (loc1?.value?.length) printRecord(loc1.value[0], "WorkerLocationLookup");

const loc2 = await get(`WorkerPostalAddresses?$filter=PersonnelNumber eq '3544'&cross-company=true&$top=1`);
if (loc2?.value?.length) printRecord(loc2.value[0], "WorkerPostalAddresses");

console.log("\n=== DONE ===");
console.log("Share this output so we can implement the real sync.\n");
