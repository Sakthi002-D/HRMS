// =====================================================
// WORKSPACE SETTINGS (HR portal → Settings)
// Company-wide values shared by every browser and by the server itself
// (emails, session timeout, date format). Timezone and currency stay in
// recruitment_settings, which the recruitment workflow already reads.
// =====================================================

import pool from "../db.js";
import { WorkflowError, getRecruitmentSettings, saveRecruitmentSettings } from "./manpowerWorkflow.js";

export const DATE_FORMATS = ["DD-MM-YYYY", "MM-DD-YYYY", "YYYY-MM-DD"];
export const SESSION_TIMEOUTS = [15, 30, 60, 120, 240];

export const DEFAULT_APP_SETTINGS = {
    companyName: "Shelter Group",
    supportEmail: "",
    dateFormat: "DD-MM-YYYY",
    sessionTimeout: 30,
    emailNotifications: true,
    leaveNotifications: true,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function ensureAppSettingsSchema(db = pool) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            settings JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.query(`INSERT INTO app_settings (id, settings) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`);
}

const readStored = async (db) => {
    const result = await db.query("SELECT settings FROM app_settings WHERE id = 1");
    return result.rows[0]?.settings || {};
};

// Stored values + defaults, with timezone / currency taken from the recruitment settings
export async function getAppSettings(db = pool) {
    const [stored, recruitment] = await Promise.all([readStored(db), getRecruitmentSettings(db)]);
    return {
        ...DEFAULT_APP_SETTINGS,
        ...stored,
        timezone: recruitment.timezone || "Asia/Qatar",
        currency: recruitment.currency,
        currencySymbol: recruitment.currencySymbol,
    };
}

// Email code must never fail because settings could not be read
export async function getAppSettingsSafe(db = pool) {
    try {
        return await getAppSettings(db);
    } catch (error) {
        console.error("Unable to read app settings, using defaults:", error.message);
        return { ...DEFAULT_APP_SETTINGS };
    }
}

export async function saveAppSettings(input, db = pool) {
    const stored = await readStored(db);
    const next = { ...stored };

    if (input.companyName !== undefined) {
        const name = String(input.companyName).trim();
        if (!name) throw new WorkflowError("Company name is required");
        next.companyName = name.slice(0, 80);
    }
    if (input.supportEmail !== undefined) {
        const email = String(input.supportEmail).trim();
        if (email && !EMAIL_PATTERN.test(email)) throw new WorkflowError("Support email is not a valid email address");
        next.supportEmail = email.slice(0, 120);
    }
    if (input.dateFormat !== undefined) {
        if (!DATE_FORMATS.includes(input.dateFormat)) throw new WorkflowError("Unknown date format");
        next.dateFormat = input.dateFormat;
    }
    if (input.sessionTimeout !== undefined) {
        const minutes = Number(input.sessionTimeout);
        if (!SESSION_TIMEOUTS.includes(minutes)) throw new WorkflowError("Unknown session timeout");
        next.sessionTimeout = minutes;
    }
    ["emailNotifications", "leaveNotifications"].forEach((flag) => {
        if (input[flag] !== undefined) next[flag] = input[flag] === true;
    });

    const recruitmentChanges = {};
    ["timezone", "currency", "currencySymbol"].forEach((field) => {
        if (input[field] !== undefined) recruitmentChanges[field] = input[field];
    });
    if (Object.keys(recruitmentChanges).length) {
        if (recruitmentChanges.currency !== undefined && !String(recruitmentChanges.currency).trim()) {
            throw new WorkflowError("Currency is required");
        }
        await saveRecruitmentSettings(recruitmentChanges, db);
    }

    await db.query(
        `UPDATE app_settings SET settings = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
        [JSON.stringify(next)]
    );
    return getAppSettings(db);
}
