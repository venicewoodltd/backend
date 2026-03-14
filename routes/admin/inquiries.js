/**
 * Production Admin Inquiries Routes
 */

import express from "express";
import { Inquiry } from "../../models/postgres/index.js";
import { adminAuth } from "../../middlewares/adminAuth.js";
import { logInquiryActivity } from "../../services/activityLog.service.js";
import { sendInquiryNotification } from "../../services/email.service.js";
import logger from "../../config/logger.js";
import { Op } from "sequelize";

const router = express.Router();
router.use(adminAuth);

// GET / — List inquiries with filtering
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, status, projectType } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (status && ["new", "read", "responded", "closed"].includes(status))
      where.status = status;
    if (projectType) where.projectType = projectType;

    const { count, rows } = await Inquiry.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: Math.min(parseInt(limit), 100),
      offset,
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error("List inquiries error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch inquiries" });
  }
});

// GET /:id
router.get("/:id", async (req, res) => {
  try {
    const inquiry = await Inquiry.findByPk(req.params.id);
    if (!inquiry)
      return res
        .status(404)
        .json({ success: false, error: "Inquiry not found" });

    if (inquiry.status === "new") await inquiry.update({ status: "read" });
    res.json({ success: true, data: inquiry });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch inquiry" });
  }
});

// PUT /:id — Update status/notes
router.put("/:id", async (req, res) => {
  try {
    const inquiry = await Inquiry.findByPk(req.params.id);
    if (!inquiry)
      return res
        .status(404)
        .json({ success: false, error: "Inquiry not found" });

    const { status, notes } = req.body;
    const updates = {};
    if (status && ["new", "read", "responded", "closed"].includes(status))
      updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    await inquiry.update(updates);
    logInquiryActivity(
      "updated",
      {
        id: inquiry.id,
        name: inquiry.name,
        status: updates.status || inquiry.status,
      },
      req.admin,
      req,
    ).catch(() => {});
    res.json({ success: true, data: inquiry });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update inquiry" });
  }
});

// DELETE /:id
router.delete("/:id", async (req, res) => {
  try {
    const inquiry = await Inquiry.findByPk(req.params.id);
    if (!inquiry)
      return res
        .status(404)
        .json({ success: false, error: "Inquiry not found" });
    await inquiry.destroy();
    logInquiryActivity(
      "deleted",
      { id: inquiry.id, name: inquiry.name },
      req.admin,
      req,
    ).catch(() => {});
    res.json({ success: true, message: "Inquiry deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete inquiry" });
  }
});

export default router;
