/**
 * Admin Backup Routes
 * List, create, delete, and download backups
 */
import express from "express";
import { adminAuth, requireAdminRole } from "../../middlewares/adminAuth.js";
import {
  createBackup,
  listBackups,
  deleteBackup,
  getBackupZipStream,
} from "../../services/backup.service.js";
import { logUserActivity } from "../../services/activityLog.service.js";
import logger from "../../config/logger.js";

const router = express.Router();

// All backup routes require admin auth + admin role
router.use(adminAuth, requireAdminRole);

// GET /api/admin/backups — List all backups
router.get("/", async (req, res) => {
  try {
    const backups = listBackups();
    res.json({ success: true, backups });
  } catch (error) {
    logger.error("List backups error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to list backups" });
  }
});

// POST /api/admin/backups — Create new backup
router.post("/", async (req, res) => {
  try {
    const manifest = await createBackup();

    logUserActivity(
      "backup_created",
      { id: manifest.name, name: manifest.name },
      req.admin,
      req,
    ).catch(() => {});

    res.json({ success: true, backup: manifest });
  } catch (error) {
    logger.error("Create backup error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to create backup" });
  }
});

// GET /api/admin/backups/:name/download — Download backup as zip
router.get("/:name/download", async (req, res) => {
  try {
    const { stream, zipName } = getBackupZipStream(req.params.name);

    logUserActivity(
      "backup_downloaded",
      { id: req.params.name, name: req.params.name },
      req.admin,
      req,
    ).catch(() => {});

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

    stream.pipe(res);

    stream.on("error", (err) => {
      logger.error("Backup download stream error", { error: err.message });
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Failed to create zip" });
      }
    });
  } catch (error) {
    logger.error("Download backup error", { error: error.message });
    const status = error.message === "Backup not found" ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/backups/:name — Delete a backup
router.delete("/:name", async (req, res) => {
  try {
    deleteBackup(req.params.name);

    logUserActivity(
      "backup_deleted",
      { id: req.params.name, name: req.params.name },
      req.admin,
      req,
    ).catch(() => {});

    res.json({ success: true, message: "Backup deleted" });
  } catch (error) {
    logger.error("Delete backup error", { error: error.message });
    const status = error.message === "Backup not found" ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

export default router;
