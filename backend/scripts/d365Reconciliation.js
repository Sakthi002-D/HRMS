const norm = (value) => String(value ?? "").trim();
const lower = (value) => norm(value).toLowerCase();
const identityParts = (row) => [
    norm(row.PersonnelNumber ?? row.personnel_number),
    norm(row.EmploymentLegalEntityId ?? row.employment_legal_entity_id),
    norm(row.EmploymentId ?? row.employment_id),
];
export const d365IdentityKey = (row) => JSON.stringify(identityParts(row));
const group = (rows, key) => {
    const result = new Map();
    for (const row of rows) {
        const value = key(row);
        if (!value) continue;
        if (!result.has(value)) result.set(value, []);
        result.get(value).push(row);
    }
    return result;
};

export async function fetchD365Pages({ base, select, authorization, fetchImpl = fetch, maxPages = 200 }) {
    const origin = new URL(base).origin;
    if (new URL(base).protocol !== "https:") throw new Error("D365 requires HTTPS");
    if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error("Invalid D365 page limit");
    const rows = [];
    const visited = new Set();
    let expectedCount = null;
    let next = new URL("/data/EmployeesV2", origin);
    next.searchParams.set("$select", select);
    for (let page = 0; next; page++) {
        if (page >= maxPages) throw new Error("D365 pagination incomplete: page limit reached");
        if (next.origin !== origin || next.pathname !== "/data/EmployeesV2" || next.username || next.password) {
            throw new Error("Unexpected D365 pagination target");
        }
        if (visited.has(next.href)) throw new Error("D365 pagination cycle detected");
        visited.add(next.href);
        const response = await fetchImpl(next, {
            method: "GET",
            redirect: "error",
            headers: { Authorization: authorization, Accept: "application/json" },
            signal: AbortSignal.timeout(300_000),
        });
        if (!response.ok) throw new Error(`D365 EmployeesV2 read failed (${response.status})`);
        const body = await response.json();
        if (!body || !Array.isArray(body.value)
            || body.value.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
            throw new Error("Malformed D365 page");
        }
        if (Object.hasOwn(body, "@odata.count")) {
            const count = body["@odata.count"];
            if (!Number.isSafeInteger(count) || count < 0
                || (expectedCount !== null && expectedCount !== count)) {
                throw new Error("Malformed or inconsistent D365 row count");
            }
            expectedCount = count;
        }
        rows.push(...body.value);
        if (expectedCount !== null && rows.length > expectedCount) {
            throw new Error("D365 pagination returned more rows than reported");
        }
        const link = body["@odata.nextLink"];
        if (link !== undefined && link !== null && (typeof link !== "string" || !link.trim())) {
            throw new Error("Malformed D365 next link");
        }
        next = link == null ? null : new URL(link, next);
    }
    if (!rows.length) throw new Error("D365 returned no records; reconciliation blocked");
    if (expectedCount !== null && rows.length !== expectedCount) {
        throw new Error("D365 pagination incomplete: received row count does not match reported count");
    }
    return rows;
}

// Pure preview: input rows are never mutated and no database or environment modules are imported.
export function reconcileD365(d365, employees, mappings) {
    const identities = group(d365, d365IdentityKey);
    const personnel = group(d365, (row) => norm(row.PersonnelNumber));
    const employeeIds = group(employees, (row) => lower(row.employee_id));
    const emails = group(employees, (row) => lower(row.email));
    const sourceEmails = group(d365, (row) => lower(row.PrimaryContactEmail));
    const mappingKeys = group(mappings, d365IdentityKey);
    const mappingPersonnel = group(mappings, (row) => norm(row.personnel_number));
    const mappingEmployees = group(mappings, (row) => norm(row.employee_id));
    const records = d365.map((source) => {
        const key = d365IdentityKey(source);
        const [number, legalEntity, employmentId] = identityParts(source);
        const record = { key, personnel_number: number, legal_entity: legalEntity, employment_id: employmentId,
            category: "excluded", employee_id: null, reasons: [] };
        if (typeof source.PersonnelNumber !== "string"
            || typeof source.EmploymentLegalEntityId !== "string"
            || typeof source.EmploymentId !== "string"
            || !identityParts(source).every(Boolean)) record.reasons.push("incomplete-identity");
        if (!/^[A-Za-z0-9-]+$/.test(number) || /^EMP/i.test(number)) record.reasons.push("unsupported-personnel-number");
        if (["1610", "2866"].includes(number)) record.reasons.push("designated-manual-review");
        if (!norm(source.Name) && !norm(source.FirstName)) record.reasons.push("missing-name");
        if (record.reasons.length) return record;
        if (identities.get(key).length > 1 || personnel.get(number).length > 1) {
            record.category = "ambiguous";
            record.reasons.push(identities.get(key).length > 1 ? "duplicate-identity" : "multi-employment");
            return record;
        }
        const existingMappings = mappingKeys.get(key) || [];
        if (existingMappings.length) {
            const mapping = existingMappings[0];
            const target = employeeIds.get(lower(mapping.employee_id)) || [];
            if (existingMappings.length !== 1 || target.length !== 1
                || norm(target[0].employee_id) !== norm(mapping.employee_id)
                || (mappingPersonnel.get(number) || []).length !== 1
                || (mappingEmployees.get(norm(mapping.employee_id)) || []).length !== 1
                || mapping.link_status !== "linked") {
                record.category = "ambiguous";
                record.reasons.push("invalid-or-conflicting-existing-mapping");
            } else {
                record.category = "already-mapped";
                record.employee_id = norm(mapping.employee_id);
            }
            return record;
        }
        if (mappingPersonnel.has(number)) {
            record.category = "ambiguous";
            record.reasons.push("personnel-already-mapped-to-other-employment");
            return record;
        }
        const idMatches = employeeIds.get(lower(number)) || [];
        const email = lower(source.PrimaryContactEmail);
        const emailMatches = emails.get(email) || [];
        const candidates = [...new Set([...idMatches, ...emailMatches])];
        if (candidates.length > 1 || (email && (sourceEmails.get(email) || []).length > 1)) {
            record.category = "ambiguous";
            record.reasons.push("conflicting-or-shared-identity-signals");
        } else if (candidates.length === 1) {
            const targetId = norm(candidates[0].employee_id);
            if ((employeeIds.get(lower(targetId)) || []).length !== 1 || mappingEmployees.has(targetId)) {
                record.category = "ambiguous";
                record.reasons.push("employee-already-mapped");
            } else {
                record.category = "confirmed-link";
                record.employee_id = targetId;
                record.reasons.push("unique-personnel-or-email-match");
            }
        } else {
            const sourceName = lower(source.Name).replace(/\s+/g, " ");
            const phone = norm(source.PrimaryContactPhone).replace(/\D/g, "").slice(-8);
            const weak = employees.some((row) =>
                (sourceName && lower(row.name).replace(/\s+/g, " ") === sourceName)
                || (phone.length === 8 && norm(row.phone).replace(/\D/g, "").slice(-8) === phone));
            record.category = weak ? "ambiguous" : "new-record";
            if (weak) record.reasons.push("weak-signal-only");
        }
        return record;
    });
    const claimed = group(records.filter((row) => row.employee_id), (row) => row.employee_id);
    for (const record of records) {
        if (record.employee_id && claimed.get(record.employee_id).length > 1) {
            record.category = "ambiguous";
            record.reasons.push("employee-claimed-by-multiple-identities");
        }
    }
    return {
        counts: Object.fromEntries(["already-mapped", "confirmed-link", "new-record", "ambiguous", "excluded"]
            .map((category) => [category, records.filter((row) => row.category === category).length])),
        records,
        existing_employees_kept: employees.length,
        // Existing rows not linked by the preview are retained, never proposed for deletion.
        unmatched_existing_employee_ids: employees.filter((row) => !records.some((record) =>
            ["already-mapped", "confirmed-link"].includes(record.category)
            && record.employee_id === norm(row.employee_id))).map((row) => norm(row.employee_id)),
        unmatched_existing_mapping_count: mappings.filter((row) => !identities.has(d365IdentityKey(row))).length,
    };
}
