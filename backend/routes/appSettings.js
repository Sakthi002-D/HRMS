// =====================================================
// WORKSPACE SETTINGS: GET for every signed-in user, PUT for HR only
// =====================================================

import express from "express";
import { requireHR } from "../middleware/auth.js";
import { WorkflowError } from "../services/manpowerWorkflow.js";
import { getAppSettings, saveAppSettings } from "../services/appSettings.js";

const router = express.Router();

router.get("/settings/app", async (req, res) => {
    try {
        res.json({ settings: await getAppSettings() });
    } catch (error) {
        console.error("Unable to load app settings:", error.message);
        res.status(500).json({ message: "Unable to load settings" });
    }
});

router.put("/settings/app", requireHR, async (req, res) => {
    try {
        res.json({ settings: await saveAppSettings(req.body?.settings || {}) });
    } catch (error) {
        if (error instanceof WorkflowError) return res.status(error.status).json({ message: error.message });
        console.error("Unable to save app settings:", error.message);
        res.status(500).json({ message: "Unable to save settings" });
    }
});

export default router;
