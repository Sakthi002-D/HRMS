// =====================================================
// RESIGNATION AFTER HR ACCEPTS (first half)
//
// Serving Notice → Exit Clearance → Final Settlement (built next; for now only the status)
//   Serving Notice: handover notes, exit interview, "Employee withdrew" (→ Withdrawn,
//   employee stays active), "Start exit clearance".
//   Exit Clearance: departments + items copied from Settings → Resignation → Exit clearance.
//   Each department owner (or HR on their behalf) marks items Done / Deduct / Not issued.
//   "Proceed to final settlement" only when no item is Pending.
//
// Assets: this HRMS has no asset-assignment table yet, so clearance items come from Settings
// only. When one is added, append its rows in startExitClearance (source = 'asset').
// Every change writes a resignation_actions row (history).
// =====================================================

import { getCompanyToday } from "./leaveDateRules.js";
import { createNotifications } from "./notificationService.js";
import { WorkflowError, getActor, getRolesFor } from "./manpowerWorkflow.js";
import {
    approversForStep,
    daysLeftFor,
    formatDateKey,
    getResignationSettings,
    hrIds,
    loadClearance,
    loadResignation,
    logAction,
    notifyEmployee,
    text,
} from "./resignationWorkflow.js";

export const CLEARANCE_STATUSES = ["Pending", "Done", "Deduct", "Not issued"];
export const EXIT_MAIN_REASONS = ["Better opportunity", "Salary / benefits", "Career growth", "Management", "Work environment", "Personal / family", "Relocation", "Higher studies", "Health", "Other"];
const CURRENCY = "QAR";

// "Done" reads "Returned" for assets
export const clearanceStatusLabel = (status, type) => (status === "Done" && type === "Asset" ? "Returned" : status);

const money = (value) => `${CURRENCY} ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function requireHRActor(db, actorId, identityType) {
    const { actor, roles } = await getRolesFor(db, actorId);
    if (identityType === "employee" || !roles.some((item) => item.role === "HR")) throw new WorkflowError("Only HR can do this", 403);
    return actor;
}

async function loadForStatus(db, id, statuses) {
    const resignation = await loadResignation(db, id, { forUpdate: true });
    if (!statuses.includes(resignation.status)) {
        throw new WorkflowError(`This resignation is ${resignation.status}; refresh the page and try again`, 409);
    }
    return resignation;
}

const link = (id) => `resignation:${id}`;

// =====================================================
// SERVING NOTICE
// =====================================================

// Handover notes + exit interview (main reason, eligible for rehire, internal notes)
export async function saveNoticeDetails(db, { id, actorId, identityType, body = {} }) {
    const actor = await requireHRActor(db, actorId, identityType);
    const resignation = await loadForStatus(db, id, ["Accepted", "Serving Notice", "Exit Clearance"]);

    const handover = text(body.handover_notes) || null;
    const mainReason = text(body.exit_main_reason) || null;
    if (mainReason && !EXIT_MAIN_REASONS.includes(mainReason)) throw new WorkflowError("Choose a main reason from the list");
    const rehireValue = body.eligible_for_rehire;
    const rehire = rehireValue === true || rehireValue === "true" || rehireValue === "Yes"
        ? true
        : rehireValue === false || rehireValue === "false" || rehireValue === "No" ? false : null;
    const internal = text(body.exit_internal_notes) || null;

    const changes = [];
    if (handover !== (resignation.handover_notes || null)) changes.push("handover notes");
    if (mainReason !== (resignation.exit_main_reason || null)) changes.push(`main reason${mainReason ? `: ${mainReason}` : " cleared"}`);
    if (rehire !== resignation.eligible_for_rehire) changes.push(`eligible for rehire: ${rehire === null ? "not set" : rehire ? "Yes" : "No"}`);
    if (internal !== (resignation.exit_internal_notes || null)) changes.push("internal notes");
    if (!changes.length) return { resignation, emails: [] };

    await db.query(
        `UPDATE resignations SET handover_notes = $2, exit_main_reason = $3, eligible_for_rehire = $4, exit_internal_notes = $5,
                updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id, handover, mainReason, rehire, internal]
    );
    await logAction(db, id, "Exit interview updated", actor, { remark: `Updated ${changes.join(", ")}` });
    return { resignation: await loadResignation(db, id), emails: [] };
}

// The employee changed their mind during the notice period: HR records it, employment continues
export async function recordEmployeeWithdrew(db, { id, actorId, identityType, remark = "" }) {
    const actor = await requireHRActor(db, actorId, identityType);
    await loadForStatus(db, id, ["Accepted", "Serving Notice"]);
    const note = text(remark) || null;

    await db.query(
        `UPDATE resignations SET status = 'Withdrawn', current_step = NULL, withdrawn_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
    );
    await logAction(db, id, "Withdrawn", actor, { remark: `Employee withdrew during the notice period${note ? `: ${note}` : ""}. Employee stays active.` });
    const updated = await loadResignation(db, id);
    const emails = await notifyEmployee(db, updated, `Resignation ${updated.resignation_no} withdrawn`, "You withdrew your resignation. Your employment continues as normal.");
    return { resignation: updated, emails };
}

// =====================================================
// EXIT CLEARANCE
// =====================================================

export async function startExitClearance(db, { id, actorId, identityType, remark = "" }) {
    const actor = await requireHRActor(db, actorId, identityType);
    const resignation = await loadForStatus(db, id, ["Accepted", "Serving Notice"]);
    const settings = await getResignationSettings(db);
    const departments = (settings.clearanceDepartments || []).filter((department) => department.items?.length);

    // Line Manager department without an owner: the employee's Line Manager (not an HR fallback)
    const lineManager = await approversForStep(db, "LINE_MANAGER", resignation);
    const lineManagerIds = String(lineManager.via || "").startsWith("HR") ? [] : lineManager.ids;

    // Clearance rows from an earlier attempt (e.g. HR restarted) are replaced
    await db.query(`DELETE FROM resignation_clearance_departments WHERE resignation_id = $1`, [id]);

    const notices = [];
    for (const [index, department] of departments.entries()) {
        const owners = (department.ownerId ? [department.ownerId] : department.useLineManager ? lineManagerIds : [])
            .filter((ownerId) => ownerId !== resignation.employee_id);
        const inserted = await db.query(
            `INSERT INTO resignation_clearance_departments (resignation_id, department_key, name, owner_ids, sort_order)
             VALUES ($1, $2, $3, $4::text[], $5) RETURNING id`,
            [id, department.id, department.name, owners, index]
        );
        const departmentId = inserted.rows[0].id;
        for (const [itemIndex, item] of department.items.entries()) {
            await db.query(
                `INSERT INTO resignation_clearance_items (resignation_id, department_id, name, item_type, source, sort_order)
                 VALUES ($1, $2, $3, $4, 'settings', $5)`,
                [id, departmentId, item.name, item.type, itemIndex]
            );
        }
        notices.push({ department, owners });
    }

    await db.query(
        `UPDATE resignations SET status = 'Exit Clearance', clearance_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
    );
    const note = text(remark);
    await logAction(db, id, "Exit clearance started", actor, {
        remark: `${departments.length} department${departments.length === 1 ? "" : "s"}: ${departments.map((department) => department.name).join(", ") || "none"}${note ? `. ${note}` : ""}`,
    });

    const updated = await loadResignation(db, id);
    const who = `${updated.employee_name} (${updated.employee_id}, ${updated.department || "—"})`;
    const lastDay = formatDateKey(updated.last_working_day);
    const emails = [];
    const unowned = [];
    for (const { department, owners } of notices) {
        if (!owners.length) {
            unowned.push(department.name);
            continue;
        }
        emails.push(...(await createNotifications(db, owners, {
            type: "resignation",
            title: `Exit clearance: ${updated.employee_name} – ${department.name}`,
            message: `${who} is leaving on ${lastDay}. Please clear: ${department.items.map((item) => item.name).join(", ")}. Open Resignation → My Approvals → Clearance.`,
            link: link(id),
        })));
    }
    const hr = (await hrIds(db, null)).filter((person) => person !== updated.employee_id && person !== actor.employee_id);
    if (unowned.length) {
        emails.push(...(await createNotifications(db, hr, {
            type: "resignation",
            title: `Exit clearance needs HR: ${updated.employee_name}`,
            message: `${updated.resignation_no}: no owner is set for ${unowned.join(", ")}. Clear these items in Resignations, or set owners in Settings → Resignation → Exit clearance.`,
            link: link(id),
        })));
    }
    const assets = departments.flatMap((department) => department.items.filter((item) => item.type === "Asset").map((item) => item.name));
    emails.push(...(await notifyEmployee(db, updated, `Resignation ${updated.resignation_no}: exit clearance started`,
        `Exit clearance has started. Last working day: ${lastDay}.${assets.length ? ` Please return: ${assets.join(", ")}.` : ""} Track each item on your Resignation page.`)));
    return { resignation: updated, emails };
}

export async function updateClearanceItem(db, { id, itemId, actorId, identityType, status, amount, remark = "" }) {
    const resignation = await loadForStatus(db, id, ["Exit Clearance"]);
    const itemResult = await db.query(
        `SELECT i.id, i.name, i.item_type, i.status, i.department_id, d.name AS department_name, d.owner_ids
         FROM resignation_clearance_items i
         JOIN resignation_clearance_departments d ON d.id = i.department_id
         WHERE i.id = $1 AND i.resignation_id = $2
         FOR UPDATE OF i`,
        [itemId, id]
    );
    const item = itemResult.rows[0];
    if (!item) throw new WorkflowError("Clearance item not found", 404);

    const { actor, roles } = await getRolesFor(db, actorId);
    const isHR = identityType !== "employee" && roles.some((entry) => entry.role === "HR");
    const isOwner = (item.owner_ids || []).includes(actor.employee_id);
    if (!isHR && !isOwner) throw new WorkflowError(`Only the ${item.department_name} clearance owner or HR can update this item`, 403);
    if (actor.employee_id === resignation.employee_id) throw new WorkflowError("You can't clear your own items", 403);

    if (!CLEARANCE_STATUSES.includes(status)) throw new WorkflowError("Choose Pending, Returned / Done, Deduct or Not issued");
    let deduction = null;
    if (status === "Deduct") {
        deduction = Math.round(Number(amount) * 100) / 100;
        if (!Number.isFinite(deduction) || deduction <= 0) throw new WorkflowError(`Enter the amount to deduct (${CURRENCY})`);
        if (deduction > 10_000_000) throw new WorkflowError("The deduction amount is too large");
    }
    const note = text(remark).slice(0, 500) || null;

    const before = await loadClearance(db, id);
    await db.query(
        `UPDATE resignation_clearance_items
         SET status = $2, deduction_amount = $3, remark = $4, updated_by = $5, updated_by_name = $6, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [itemId, status, deduction, note, actor.employee_id, actor.name]
    );
    await db.query(`UPDATE resignations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);

    const label = clearanceStatusLabel(status, item.item_type);
    await logAction(db, id, "Clearance updated", actor, {
        remark: `${item.department_name} · ${item.name}: ${label}${deduction ? ` ${money(deduction)}` : ""}${note ? ` – ${note}` : ""}${!isOwner ? " (by HR)" : ""}`,
    });

    const after = await loadClearance(db, id);
    const wasCleared = before.find((department) => String(department.id) === String(item.department_id))?.cleared;
    const nowCleared = after.find((department) => String(department.id) === String(item.department_id))?.cleared;
    const emails = [];
    if (!wasCleared && nowCleared) {
        await logAction(db, id, "Department cleared", actor, { remark: `${item.department_name} cleared` });
    }
    if (!before.every((department) => department.cleared) && after.every((department) => department.cleared)) {
        await logAction(db, id, "Exit clearance complete", null, { remark: "Every department is cleared. Ready for final settlement." });
        emails.push(...(await createNotifications(db, (await hrIds(db, null)).filter((person) => person !== resignation.employee_id), {
            type: "resignation",
            title: `Exit clearance complete: ${resignation.employee_name}`,
            message: `${resignation.resignation_no}: every department has cleared ${resignation.employee_name} (${resignation.employee_id}). Proceed to final settlement in Resignations.`,
            link: link(id),
        })));
    }
    return { resignation: await loadResignation(db, id), emails };
}

export async function proceedToFinalSettlement(db, { id, actorId, identityType, remark = "" }) {
    const actor = await requireHRActor(db, actorId, identityType);
    await loadForStatus(db, id, ["Exit Clearance"]);
    const clearance = await loadClearance(db, id);
    const pending = clearance.filter((department) => !department.cleared).map((department) => department.name);
    if (pending.length) throw new WorkflowError(`Not cleared yet: ${pending.join(", ")}`);

    await db.query(
        `UPDATE resignations SET status = 'Final Settlement', clearance_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
    );
    const deductions = clearance.flatMap((department) => department.items).filter((item) => item.status === "Deduct");
    const total = deductions.reduce((sum, item) => sum + Number(item.deduction_amount || 0), 0);
    const note = text(remark);
    await logAction(db, id, "Final Settlement", actor, {
        remark: `Exit clearance closed${deductions.length ? `; deductions ${money(total)}` : ""}${note ? `. ${note}` : ""}`,
    });
    const updated = await loadResignation(db, id);
    const emails = await notifyEmployee(db, updated, `Resignation ${updated.resignation_no}: final settlement`,
        "Your exit clearance is complete. HR is now preparing your final settlement.");
    return { resignation: updated, emails };
}

// =====================================================
// MY APPROVALS → CLEARANCE (department owners)
// =====================================================

export async function listClearanceTasks(db, actorId, { today = getCompanyToday() } = {}) {
    await getActor(db, actorId);
    const owned = await db.query(
        `SELECT DISTINCT d.resignation_id
         FROM resignation_clearance_departments d
         JOIN resignations r ON r.id = d.resignation_id
         WHERE $1 = ANY(d.owner_ids) AND r.status = 'Exit Clearance' AND r.employee_id <> $1`,
        [actorId]
    );
    const tasks = [];
    for (const { resignation_id: resignationId } of owned.rows) {
        const resignation = await loadResignation(db, resignationId);
        const departments = (await loadClearance(db, resignationId))
            .filter((department) => department.owners.some((owner) => owner.employee_id === actorId));
        tasks.push({
            resignation: {
                id: resignation.id,
                resignation_no: resignation.resignation_no,
                employee_id: resignation.employee_id,
                employee_name: resignation.employee_name,
                department: resignation.department,
                designation: resignation.designation,
                last_working_day: resignation.last_working_day,
                status: resignation.status,
                days_left: daysLeftFor(resignation, today),
            },
            departments,
        });
    }
    return tasks.sort((a, b) => String(a.resignation.last_working_day).localeCompare(String(b.resignation.last_working_day)));
}
