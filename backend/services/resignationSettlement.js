// =====================================================
// RESIGNATION, SECOND HALF
//
// Final Settlement: figures are calculated (settlementCalculation.js) from the employee record
//   (latest payroll row: basic + allowances; joining date) and the leave module (annual leave balance
//   on the last working day), minus clearance deductions, plus optional manual rows. When the record
//   lacks basic / allowances / joining date, HR types them in the case window (kept in
//   settlement_manual.inputs, optionally saved to the record).
//   Who approves: Settings → Resignation → Final settlement → "Settlement approved by"
//   (finalSettlement.settlementApprover). Every approval path reads it through approverFor():
//   - HR (default): HR approves in the case window → figures frozen (settlement JSONB) → Exit Formalities.
//   - FINANCE (coming soon, needs a Finance screen): HR sends to Finance (role FINANCE); Finance
//     approves or returns with a remark. The backend for this path is below and ready.
// Exit Formalities: checklist; experience certificate / relieving letter PDFs (made in the HR
//   browser with jsPDF) are emailed to the employee. "Complete separation" → Completed.
// Completed: the employee becomes "Resigned" (record and history kept). Login is blocked from the
//   day after the last working day (status ≠ Active); the daily job does it when HR completes early.
// =====================================================

import { getCompanyToday } from "./leaveDateRules.js";
import { createNotifications } from "./notificationService.js";
import { WorkflowError, getActor, getApproverIds, getRolesFor } from "./manpowerWorkflow.js";
import {
    CURRENCY,
    applyInputOverrides,
    calculateSettlement,
    formatAmount,
    missingInputs,
    round2,
    settlementApproverOf,
} from "./settlementCalculation.js";
import {
    formatDateKey,
    getResignationSettings,
    hrIds,
    loadClearance,
    loadResignation,
    logAction,
    notifyEmployee,
    resignationLeaveBalance,
    text,
} from "./resignationWorkflow.js";

export { CURRENCY, calculateSettlement };

export const EXIT_CHECKLIST = [
    { key: "final_payment", label: "Final payment released" },
    { key: "visa_cancellation", label: "Work visa / QID cancellation submitted" },
    { key: "air_ticket", label: "Air ticket to home country booked", optional: true },
    { key: "experience_certificate", label: "Experience certificate issued" },
    { key: "relieving_letter", label: "Relieving letter issued" },
    { key: "payroll_access", label: "Payroll stopped and HRMS access removed" },
];
export const EXIT_DOCUMENTS = { experience_certificate: "Experience certificate", relieving_letter: "Relieving letter" };

const money = (value) => `${CURRENCY} ${formatAmount(value)}`;
// Net < 0: the employee owes the company
const netText = (net) => (net < 0 ? `amount the employee owes ${money(-net)}` : money(net));
const num = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));

// Inputs HR typed for what the employee record lacks: { basic, allowances, joining_date }
function cleanInputOverrides(input = {}) {
    const out = {};
    for (const key of ["basic", "allowances"]) {
        if (input[key] === undefined || input[key] === null || input[key] === "") continue;
        const value = num(input[key]);
        if (value === null || value < 0 || value > 10000000) throw new WorkflowError(`${key === "basic" ? "Basic salary" : "Allowances"} must be a number of 0 or more`);
        out[key] = round2(value);
    }
    if (input.joining_date) {
        if (!/^d{4}-d{2}-d{2}$/.test(String(input.joining_date))) throw new WorkflowError("Joining date must be a date");
        out.joining_date = String(input.joining_date);
    }
    return out;
}

// Manual rows: [{ description, amount > 0 }], at most 20 each; plus the typed inputs and the
// "Also save to the employee record" tick
export function cleanManualRows(input = {}) {
    const clean = (rows, label) => (Array.isArray(rows) ? rows : [])
        .filter((row) => text(row?.description) || num(row?.amount))
        .slice(0, 20)
        .map((row) => {
            const description = text(row.description).slice(0, 200);
            const amount = round2(num(row.amount) ?? NaN);
            if (!description) throw new WorkflowError(`Each "${label}" row needs a description`);
            if (!Number.isFinite(amount) || amount <= 0) throw new WorkflowError(`"${description}" needs an amount above 0`);
            return { description, amount };
        });
    return {
        earnings: clean(input.earnings, "Other earnings"),
        deductions: clean(input.deductions, "Other deductions"),
        inputs: cleanInputOverrides(input.inputs || {}),
        save_to_record: input.save_to_record !== false,
    };
}

// =====================================================
// CALCULATION
// =====================================================

async function loadSalaryRecord(db, employeeId) {
    const salary = await db.query(
        `SELECT payroll_id, basic_salary::float AS basic_salary, allowances::float AS allowances
         FROM employee_payroll WHERE employee_id = $1
         ORDER BY salary_month DESC NULLS LAST, updated_at DESC NULLS LAST LIMIT 1`,
        [employeeId]
    ).catch(() => ({ rows: [] }));
    return salary.rows[0] || null;
}

// What the employee record says (no overrides)
async function loadRecordInputs(db, resignation) {
    const salary = await loadSalaryRecord(db, resignation.employee_id);
    const basic = num(salary?.basic_salary);
    return {
        inputs: {
            basic: basic && basic > 0 ? basic : null,
            allowances: num(salary?.allowances),
            joining_date: resignation.joining_date || null,
            leave_balance: await resignationLeaveBalance(db, resignation),
        },
        hasSalaryRecord: Boolean(salary),
    };
}

const clearanceDeductionsOf = (clearance) => clearance.flatMap((department) => department.items
    .filter((item) => item.status === "Deduct" && Number(item.deduction_amount) > 0)
    .map((item) => ({ id: item.id, department: department.name, name: item.name, amount: Number(item.deduction_amount) })));

const EMPTY_MANUAL = { earnings: [], deductions: [], inputs: {}, save_to_record: true };

export async function buildSettlement(db, resignation, manual) {
    const settings = await getResignationSettings(db);
    const clearance = await loadClearance(db, resignation.id);
    const { inputs } = await loadRecordInputs(db, resignation);
    const rows = manual || EMPTY_MANUAL;
    return calculateSettlement({
        inputs: applyInputOverrides(inputs, rows.inputs),
        settings: settings.finalSettlement,
        lastWorkingDay: resignation.last_working_day,
        clearanceDeductions: clearanceDeductionsOf(clearance),
        manual: rows,
    });
}

// What the HR case window needs to recalculate the table in the browser (same function)
export async function settlementEditorFor(db, resignation) {
    const settings = await getResignationSettings(db);
    const clearance = await loadClearance(db, resignation.id);
    const { inputs, hasSalaryRecord } = await loadRecordInputs(db, resignation);
    return {
        record_inputs: inputs,
        record_missing: missingInputs(inputs),
        has_salary_record: hasSalaryRecord,
        rules: settings.finalSettlement,
        last_working_day: resignation.last_working_day,
        clearance_deductions: clearanceDeductionsOf(clearance),
    };
}

// Figures for the case window: frozen once approved or sent to Finance; otherwise a live draft
export async function settlementForDetail(db, resignation) {
    if (resignation.settlement && ["With Finance", "Approved"].includes(resignation.settlement_status)) return resignation.settlement;
    if (resignation.status !== "Final Settlement") return resignation.settlement || null;
    return buildSettlement(db, resignation, resignation.settlement_manual || EMPTY_MANUAL);
}

// "Also save to the employee record": fills only what the record lacks. Salary goes to the latest
// payroll row; no new payroll row is created (it would be a salary payment to transfer).
async function saveInputsToRecord(db, resignation, manual, actor) {
    if (!manual.save_to_record) return;
    const { inputs, hasSalaryRecord } = await loadRecordInputs(db, resignation);
    const missing = missingInputs(inputs);
    const typed = manual.inputs || {};
    const saved = [];
    if (hasSalaryRecord) {
        const basic = missing.includes("basic") && typed.basic > 0 ? typed.basic : null;
        const allowances = missing.includes("allowances") && typed.allowances !== undefined ? typed.allowances : null;
        if (basic !== null || allowances !== null) {
            const salary = await loadSalaryRecord(db, resignation.employee_id);
            await db.query(
                `UPDATE employee_payroll SET basic_salary = COALESCE($2, basic_salary), allowances = COALESCE($3, allowances), updated_at = CURRENT_TIMESTAMP
                 WHERE payroll_id = $1`,
                [salary.payroll_id, basic, allowances]
            );
            if (basic !== null) saved.push(`basic salary ${money(basic)}`);
            if (allowances !== null) saved.push(`allowances ${money(allowances)}`);
        }
    }
    if (missing.includes("joining_date") && typed.joining_date) {
        await db.query(`UPDATE employees SET joining_date = $2 WHERE employee_id = $1 AND joining_date IS NULL`, [resignation.employee_id, typed.joining_date]);
        saved.push(`joining date ${formatDateKey(typed.joining_date)}`);
    }
    if (saved.length) await logAction(db, resignation.id, "Employee record updated", actor, { remark: `Saved from the final settlement: ${saved.join(", ")}` });
}

// =====================================================
// APPROVER (Settings → Resignation → Final settlement → "Settlement approved by")
// =====================================================

export async function approverFor(db) {
    const settings = await getResignationSettings(db);
    return settlementApproverOf(settings.finalSettlement);
}

async function requireApprover(db, expected) {
    const approver = await approverFor(db);
    if (approver !== expected) {
        throw new WorkflowError(approver === "HR"
            ? "Final settlements are approved by HR (Settings → Resignation → Final settlement)"
            : "Final settlements are approved by Finance (Settings → Resignation → Final settlement)");
    }
}

const blockingMissing = (settlement) => settlement.missing.filter((key) => ["basic", "joining_date"].includes(key));

// =====================================================
// ACCESS
// =====================================================

async function requireHRActor(db, actorId, identityType) {
    const { actor, roles } = await getRolesFor(db, actorId);
    if (identityType === "employee" || !roles.some((item) => item.role === "HR")) throw new WorkflowError("Only HR can do this", 403);
    return actor;
}

export const financeIds = (db) => getApproverIds(db, "FINANCE", null);

async function loadForStatus(db, id, statuses) {
    const resignation = await loadResignation(db, id, { forUpdate: true });
    if (!statuses.includes(resignation.status)) throw new WorkflowError(`This resignation is ${resignation.status}; refresh the page and try again`, 409);
    return resignation;
}

const link = (id) => `resignation:${id}`;

// =====================================================
// FINAL SETTLEMENT
// =====================================================

export async function saveSettlementDraft(db, { id, actorId, identityType, body = {} }) {
    const actor = await requireHRActor(db, actorId, identityType);
    const resignation = await loadForStatus(db, id, ["Final Settlement"]);
    if (resignation.settlement_status === "With Finance") throw new WorkflowError("The settlement is with Finance; wait for their decision");
    const manual = cleanManualRows(body.manual);
    await saveInputsToRecord(db, resignation, manual, actor);
    await db.query(
        `UPDATE resignations SET settlement_manual = $2::jsonb, settlement_status = COALESCE(settlement_status, 'Draft'), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id, JSON.stringify(manual)]
    );
    await logAction(db, id, "Settlement draft saved", actor, { remark: `${manual.earnings.length} other earning(s), ${manual.deductions.length} other deduction(s)` });
    return { resignation: await loadResignation(db, id), emails: [] };
}

const BLOCKING_TEXT = { basic: "basic salary", joining_date: "joining date" };

// HR approves (setting = HR): figures frozen, approver / time / remark stored → Exit Formalities
export async function approveSettlement(db, { id, actorId, identityType, remark = "", body = {} }) {
    const actor = await requireHRActor(db, actorId, identityType);
    await requireApprover(db, "HR");
    const resignation = await loadForStatus(db, id, ["Final Settlement"]);
    if (resignation.settlement_status === "With Finance") throw new WorkflowError("The settlement is with Finance; wait for their decision");
    if (actor.employee_id === resignation.employee_id) throw new WorkflowError("You can't approve your own settlement", 403);
    const manual = body.manual ? cleanManualRows(body.manual) : { ...EMPTY_MANUAL, ...(resignation.settlement_manual || {}) };
    const settlement = await buildSettlement(db, resignation, manual);
    const blocking = blockingMissing(settlement);
    if (blocking.length) throw new WorkflowError(`Enter the ${blocking.map((key) => BLOCKING_TEXT[key]).join(" and ")} to approve`);
    await saveInputsToRecord(db, resignation, manual, actor);

    const note = text(remark).slice(0, 1000) || null;
    const approvedAt = new Date().toISOString();
    const frozen = {
        ...settlement,
        calculated_at: approvedAt,
        calculated_by: actor.name,
        approval: { role: "HR", by: actor.employee_id, by_name: actor.name, at: approvedAt, remark: note },
    };
    await db.query(
        `UPDATE resignations SET settlement = $2::jsonb, settlement_manual = $3::jsonb, settlement_status = 'Approved',
                settlement_decided_by = $4, settlement_decided_by_name = $5, settlement_decided_at = CURRENT_TIMESTAMP,
                settlement_remark = $6, status = 'Exit Formalities', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, JSON.stringify(frozen), JSON.stringify(manual), actor.employee_id, actor.name, note]
    );
    await logAction(db, id, "Settlement approved", actor, {
        stepRole: "HR",
        remark: `Final settlement approved by ${actor.name} · ${money(frozen.net)}${frozen.net < 0 ? " (amount the employee owes)" : ""}${note ? `. ${note}` : ""}`,
    });
    await logAction(db, id, "Exit Formalities", null, { remark: "Final settlement approved by HR" });

    const updated = await loadResignation(db, id);
    const employeeText = frozen.net < 0
        ? `Your final settlement has been approved. Amount to be recovered: ${money(-frozen.net)}. HR will contact you about the recovery. You can download the settlement statement from your Resignation page.`
        : `Your final settlement of ${money(frozen.net)} has been approved. Payment is on its way. You can download the settlement statement from your Resignation page.`;
    const emails = await notifyEmployee(db, updated, `Resignation ${updated.resignation_no}: settlement approved`, employeeText);
    return { resignation: updated, emails };
}

// A deduction must be corrected: back to Exit Clearance (HR's draft rows and typed inputs are kept)
export async function returnToClearance(db, { id, actorId, identityType, remark = "", body = {} }) {
    const actor = await requireHRActor(db, actorId, identityType);
    const resignation = await loadForStatus(db, id, ["Final Settlement"]);
    if (resignation.settlement_status === "With Finance") throw new WorkflowError("The settlement is with Finance; wait for their decision");
    const manual = body.manual ? cleanManualRows(body.manual) : null;
    await db.query(
        `UPDATE resignations SET status = 'Exit Clearance', clearance_completed_at = NULL,
                settlement_manual = COALESCE($2::jsonb, settlement_manual),
                settlement_status = CASE WHEN settlement_status IS NULL THEN NULL ELSE 'Draft' END, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, manual ? JSON.stringify(manual) : null]
    );
    const note = text(remark).slice(0, 1000);
    await logAction(db, id, "Returned to clearance", actor, { remark: note || "Final settlement reopened to correct a clearance deduction" });
    return { resignation: await loadResignation(db, id), emails: [] };
}

export async function sendSettlementToFinance(db, { id, actorId, identityType, body = {} }) {
    const actor = await requireHRActor(db, actorId, identityType);
    await requireApprover(db, "FINANCE");
    const resignation = await loadForStatus(db, id, ["Final Settlement"]);
    if (resignation.settlement_status === "With Finance") throw new WorkflowError("The settlement is already with Finance");
    const manual = body.manual ? cleanManualRows(body.manual) : { ...EMPTY_MANUAL, ...(resignation.settlement_manual || {}) };
    const settlement = await buildSettlement(db, resignation, manual);
    const blocking = blockingMissing(settlement);
    if (blocking.length) throw new WorkflowError(`Enter the ${blocking.map((key) => BLOCKING_TEXT[key]).join(" and ")} before sending to Finance`);
    await saveInputsToRecord(db, resignation, manual, actor);
    const finance = (await financeIds(db)).filter((person) => person !== resignation.employee_id);
    if (!finance.length) throw new WorkflowError("No Finance approver: assign the Finance role in Settings → Approval Workflows → Who holds each role");

    const frozen = { ...settlement, calculated_at: new Date().toISOString(), calculated_by: actor.name, approval: { role: "FINANCE" } };
    await db.query(
        `UPDATE resignations SET settlement = $2::jsonb, settlement_manual = $3::jsonb, settlement_status = 'With Finance',
                settlement_sent_at = CURRENT_TIMESTAMP, settlement_remark = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, JSON.stringify(frozen), JSON.stringify(manual)]
    );
    await logAction(db, id, "Sent to Finance", actor, { remark: `Net: ${netText(frozen.net)}` });

    const updated = await loadResignation(db, id);
    const emails = [
        ...(await createNotifications(db, finance, {
            type: "resignation",
            title: `Final settlement to approve: ${updated.employee_name}`,
            message: `${updated.resignation_no} (${updated.employee_id}, ${updated.department || "—"}). Net: ${netText(frozen.net)}. Open Resignation → My Approvals → Settlements.`,
            link: link(id),
        })),
        ...(await notifyEmployee(db, updated, `Resignation ${updated.resignation_no}: settlement with Finance`, "Your final settlement has been prepared and sent to Finance for approval.")),
    ];
    return { resignation: updated, emails };
}

// Finance: approve (→ Exit Formalities) or return to HR with a remark
export async function decideSettlement(db, { id, actorId, action, remark = "" }) {
    const resignation = await loadForStatus(db, id, ["Final Settlement"]);
    if (resignation.settlement_status !== "With Finance") throw new WorkflowError("This settlement is not waiting for Finance");
    const actor = await getActor(db, actorId);
    if (!(await financeIds(db)).includes(actor.employee_id)) throw new WorkflowError("Only a Finance approver can do this", 403);
    if (actor.employee_id === resignation.employee_id) throw new WorkflowError("You can't approve your own settlement", 403);
    const note = text(remark).slice(0, 1000) || null;
    const net = resignation.settlement?.net ?? 0;
    const hr = (await hrIds(db, null)).filter((person) => person !== resignation.employee_id);

    if (action === "return") {
        if (!note) throw new WorkflowError("Enter a remark so HR knows what to change");
        await db.query(
            `UPDATE resignations SET settlement_status = 'Returned', settlement_remark = $2, settlement_decided_by = $3,
                    settlement_decided_by_name = $4, settlement_decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [id, note, actor.employee_id, actor.name]
        );
        await logAction(db, id, "Settlement returned", actor, { stepRole: "FINANCE", remark: note });
        const emails = await createNotifications(db, hr, {
            type: "resignation",
            title: `Settlement returned: ${resignation.employee_name}`,
            message: `${resignation.resignation_no}: Finance (${actor.name}) returned the final settlement: ${note}`,
            link: link(id),
        });
        return { resignation: await loadResignation(db, id), emails };
    }
    if (action !== "approve") throw new WorkflowError("Unknown action", 404);

    const approval = { role: "FINANCE", by: actor.employee_id, by_name: actor.name, at: new Date().toISOString(), remark: note };
    await db.query(
        `UPDATE resignations SET settlement = COALESCE(settlement, '{}'::jsonb) || jsonb_build_object('approval', $5::jsonb),
                settlement_status = 'Approved', settlement_remark = $2, settlement_decided_by = $3,
                settlement_decided_by_name = $4, settlement_decided_at = CURRENT_TIMESTAMP, status = 'Exit Formalities', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, note, actor.employee_id, actor.name, JSON.stringify(approval)]
    );
    await logAction(db, id, "Settlement approved", actor, { stepRole: "FINANCE", remark: `Final settlement approved by ${actor.name} · ${money(net)}${note ? `. ${note}` : ""}` });
    await logAction(db, id, "Exit Formalities", null, { remark: "Final settlement approved by Finance" });
    const updated = await loadResignation(db, id);
    const emails = [
        ...(await createNotifications(db, hr, {
            type: "resignation",
            title: `Settlement approved: ${updated.employee_name}`,
            message: `${updated.resignation_no}: Finance approved ${netText(net)}. Complete the exit formalities in Resignations.`,
            link: link(id),
        })),
        ...(await notifyEmployee(db, updated, `Resignation ${updated.resignation_no}: settlement approved`,
            net < 0
                ? `Finance approved your final settlement. Amount to be recovered: ${money(-net)}. You can download the settlement statement from your Resignation page.`
                : `Finance approved your final settlement of ${money(net)}. Payment is on its way. You can download the settlement statement from your Resignation page.`)),
    ];
    return { resignation: updated, emails };
}

// For My Approvals → Settlements (Finance)
export async function listSettlementTasks(db, actorId) {
    await getActor(db, actorId);
    if (!(await financeIds(db)).includes(actorId)) return [];
    const result = await db.query(
        `SELECT r.id FROM resignations r WHERE r.status = 'Final Settlement' AND r.settlement_status = 'With Finance' AND r.employee_id <> $1 ORDER BY r.settlement_sent_at`,
        [actorId]
    );
    const tasks = [];
    for (const { id } of result.rows) {
        const row = await loadResignation(db, id);
        tasks.push({
            id: row.id,
            resignation_no: row.resignation_no,
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            department: row.department,
            designation: row.designation,
            grade: row.grade,
            joining_date: row.joining_date,
            last_working_day: row.last_working_day,
            settlement: row.settlement,
            settlement_sent_at: row.settlement_sent_at,
        });
    }
    return tasks;
}

// =====================================================
// EXIT FORMALITIES
// =====================================================

const checklistDone = (checklist, item) => Boolean(checklist?.[item.key]?.done || (item.optional && checklist?.[item.key]?.not_applicable));

export async function updateExitChecklist(db, { id, actorId, identityType, body = {} }) {
    const actor = await requireHRActor(db, actorId, identityType);
    await loadForStatus(db, id, ["Exit Formalities"]);
    const item = EXIT_CHECKLIST.find((entry) => entry.key === body.key);
    if (!item) throw new WorkflowError("Unknown checklist item");
    const notApplicable = Boolean(item.optional && body.not_applicable);
    const done = !notApplicable && Boolean(body.done);
    const entry = done || notApplicable ? { done, not_applicable: notApplicable, by: actor.employee_id, by_name: actor.name, at: new Date().toISOString() } : null;

    await db.query(
        `UPDATE resignations SET exit_checklist = CASE WHEN $3::jsonb IS NULL THEN exit_checklist - $2 ELSE jsonb_set(exit_checklist, ARRAY[$2], $3::jsonb) END,
                updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id, item.key, entry ? JSON.stringify(entry) : null]
    );
    await logAction(db, id, "Exit formality updated", actor, {
        remark: `${item.label}: ${notApplicable ? "Not eligible" : done ? "Done" : "Not done"}`,
    });
    return { resignation: await loadResignation(db, id), emails: [] };
}

// HR's browser makes the PDF (jsPDF) and sends it here; it's emailed to the employee and the item ticked
export async function issueExitDocument(db, { id, actorId, identityType, type, body = {} }) {
    const actor = await requireHRActor(db, actorId, identityType);
    const resignation = await loadForStatus(db, id, ["Exit Formalities"]);
    const label = EXIT_DOCUMENTS[type];
    if (!label) throw new WorkflowError("Unknown document", 404);
    const base64 = String(body.pdf || "").replace(/^data:application\/pdf;[^,]*,/, "");
    if (!/^[A-Za-z0-9+/=\s]+$/.test(base64) || base64.length < 100) throw new WorkflowError("The PDF is missing");
    const content = Buffer.from(base64, "base64");
    if (content.length > 2 * 1024 * 1024) throw new WorkflowError("The PDF is too large");
    if (content.subarray(0, 4).toString() !== "%PDF") throw new WorkflowError("The file is not a PDF");

    const issuedOn = body.issued_on && /^\d{4}-\d{2}-\d{2}$/.test(body.issued_on) ? body.issued_on : getCompanyToday();
    const info = { issued_on: issuedOn, by: actor.employee_id, by_name: actor.name, at: new Date().toISOString() };
    const tick = { done: true, not_applicable: false, by: actor.employee_id, by_name: actor.name, at: info.at };
    await db.query(
        `UPDATE resignations SET exit_documents = jsonb_set(exit_documents, ARRAY[$2], $3::jsonb),
                exit_checklist = jsonb_set(exit_checklist, ARRAY[$2], $4::jsonb), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id, type, JSON.stringify(info), JSON.stringify(tick)]
    );
    await logAction(db, id, `${label} issued`, actor, { remark: `Dated ${formatDateKey(issuedOn)}; emailed to the employee` });

    const fileName = `${resignation.employee_id}-${type.replace(/_/g, "-")}.pdf`;
    const emails = (await notifyEmployee(db, resignation, `${label} – ${resignation.resignation_no}`,
        `Your ${label.toLowerCase()} is attached. You can also download it from your Resignation page.`))
        .map((mail) => ({ ...mail, attachments: [{ filename: fileName, content, contentType: "application/pdf" }] }));
    return { resignation: await loadResignation(db, id), emails };
}

// Sets the employee to Resigned (login stops working: auth needs status Active). History is kept.
async function markEmployeeResigned(db, resignation) {
    await db.query(
        `UPDATE employees
         SET status = 'Resigned',
             last_date_worked = $2,
             termination_reason = COALESCE(NULLIF(TRIM(termination_reason), ''), 'Resignation')
         WHERE employee_id = $1 AND LOWER(COALESCE(status, 'active')) = 'active'`,
        [resignation.employee_id, resignation.last_working_day]
    );
}

export async function completeSeparation(db, { id, actorId, identityType, remark = "", today = getCompanyToday() }) {
    const actor = await requireHRActor(db, actorId, identityType);
    const resignation = await loadForStatus(db, id, ["Exit Formalities"]);
    const open = EXIT_CHECKLIST.filter((item) => !checklistDone(resignation.exit_checklist, item));
    if (open.length) throw new WorkflowError(`Still to do: ${open.map((item) => item.label).join(", ")}`);

    await db.query(
        `UPDATE resignations SET status = 'Completed', completed_at = CURRENT_TIMESTAMP, separated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
    );
    const loginEnds = resignation.last_working_day < today;
    if (loginEnds) await markEmployeeResigned(db, resignation);
    const note = text(remark);
    await logAction(db, id, "Completed", actor, {
        remark: `Separation complete. ${loginEnds
            ? "Employee set to Resigned; HRMS login blocked."
            : `Employee becomes Resigned and login stops after ${formatDateKey(resignation.last_working_day)}.`}${note ? ` ${note}` : ""}`,
    });
    const updated = await loadResignation(db, id);
    const emails = await notifyEmployee(db, updated, `Resignation ${updated.resignation_no} completed`,
        `Your separation is complete. Last working day: ${formatDateKey(updated.last_working_day)}. Your settlement statement, experience certificate and relieving letter stay on your Resignation page until then. Thank you for your service.`);
    return { resignation: updated, emails };
}

// Daily: Completed resignations whose last working day has passed → employee Resigned
export async function resignCompletedEmployees(db, { today = getCompanyToday() } = {}) {
    const due = await db.query(
        `SELECT r.id, r.employee_id, TO_CHAR(r.last_working_day, 'YYYY-MM-DD') AS last_working_day
         FROM resignations r JOIN employees e ON e.employee_id = r.employee_id
         WHERE r.status = 'Completed' AND r.separated_at IS NOT NULL AND r.last_working_day < $1::date
           AND LOWER(COALESCE(e.status, 'active')) = 'active'`,
        [today]
    );
    for (const row of due.rows) {
        await markEmployeeResigned(db, row);
        await logAction(db, row.id, "Employee resigned", null, { remark: "Last working day passed. Employee set to Resigned; HRMS login blocked." });
    }
    return due.rows.length;
}

// =====================================================
// TERMINATION REPORT
// =====================================================

export async function terminationReport(db, { from = null, to = null } = {}) {
    const result = await db.query(
        `SELECT e.employee_id, e.name, e.department, e.designation, e.grade, e.status,
                TO_CHAR(e.joining_date, 'YYYY-MM-DD') AS joining_date,
                TO_CHAR(COALESCE(r.last_working_day, e.last_date_worked), 'YYYY-MM-DD') AS last_working_day,
                COALESCE(NULLIF(TRIM(e.termination_reason), ''), e.status) AS termination_reason,
                r.id AS resignation_id, r.resignation_no, r.reason_category, r.exit_main_reason, r.eligible_for_rehire,
                (r.settlement->>'net')::float AS settlement_net, r.settlement_status
         FROM employees e
         LEFT JOIN LATERAL (
             SELECT * FROM resignations x WHERE x.employee_id = e.employee_id AND x.status = 'Completed' ORDER BY x.id DESC LIMIT 1
         ) r ON TRUE
         WHERE LOWER(COALESCE(e.status, 'active')) IN ('resigned', 'terminated', 'dismissed', 'retired', 'inactive')
           AND ($1::date IS NULL OR COALESCE(r.last_working_day, e.last_date_worked) >= $1::date)
           AND ($2::date IS NULL OR COALESCE(r.last_working_day, e.last_date_worked) <= $2::date)
         ORDER BY COALESCE(r.last_working_day, e.last_date_worked) DESC NULLS LAST, e.name`,
        [from, to]
    );
    return result.rows;
}
