/**
 * Production Admin Mastery Pillars Routes
 */

import express from "express";
import { adminAuth, requireAdminRole } from "../../middlewares/adminAuth.js";
import { MasteryPillar } from "../../models/postgres/index.js";
import { logSettingsActivity } from "../../services/activityLog.service.js";
import logger from "../../config/logger.js";

const router = express.Router();

// GET / — List pillars (admin)
router.get("/", adminAuth, async (req, res) => {
  try {
    const pillars = await MasteryPillar.findAll({ order: [["order", "ASC"]] });
    res.json({ success: true, data: pillars });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch mastery pillars" });
  }
});

// GET /public — Active pillars (public)
router.get("/public", async (req, res) => {
  try {
    const pillars = await MasteryPillar.findAll({
      where: { isActive: true },
      order: [["order", "ASC"]],
    });
    res.json({ success: true, data: pillars });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch mastery pillars" });
  }
});

// GET /:id
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const pillar = await MasteryPillar.findByPk(req.params.id);
    if (!pillar)
      return res
        .status(404)
        .json({ success: false, error: "Pillar not found" });
    res.json({ success: true, data: pillar });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch pillar" });
  }
});

// POST / — Create pillar
router.post("/", adminAuth, requireAdminRole, async (req, res) => {
  try {
    const { title, description, icon, order, isActive } = req.body;
    if (!title || !description)
      return res
        .status(400)
        .json({ success: false, error: "Title and description are required" });
    if (title.length > 255)
      return res
        .status(400)
        .json({ success: false, error: "Title max 255 characters" });
    if (description.length > 2000)
      return res
        .status(400)
        .json({ success: false, error: "Description max 2000 characters" });

    let pillarOrder = order;
    if (pillarOrder === undefined || pillarOrder === null) {
      const maxOrder = await MasteryPillar.max("order");
      pillarOrder = (maxOrder || 0) + 1;
    }

    const pillar = await MasteryPillar.create({
      title: title.trim().substring(0, 255),
      description: description.trim().substring(0, 2000),
      icon: icon || "leaf",
      order: pillarOrder,
      isActive: isActive !== false,
    });

    logSettingsActivity(
      "mastery-pillars",
      `Created pillar: ${pillar.title}`,
      req.admin,
      req,
      { pillarId: pillar.id },
    ).catch(() => {});
    res.status(201).json({ success: true, data: pillar });
  } catch (error) {
    logger.error("Create pillar error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to create pillar" });
  }
});

// PUT /reorder/bulk — Bulk reorder (MUST be before /:id to avoid Express matching "reorder" as an ID)
router.put("/reorder/bulk", adminAuth, requireAdminRole, async (req, res) => {
  try {
    const { pillars } = req.body;
    if (!Array.isArray(pillars))
      return res
        .status(400)
        .json({ success: false, error: "Invalid pillars array" });

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const item of pillars) {
      if (!item.id || !uuidRegex.test(item.id))
        return res
          .status(400)
          .json({ success: false, error: `Invalid pillar ID: ${item.id}` });
      if (!Number.isInteger(item.order) || item.order < 0)
        return res
          .status(400)
          .json({ success: false, error: `Invalid order for ${item.id}` });
    }

    for (const item of pillars) {
      await MasteryPillar.update(
        { order: item.order },
        { where: { id: item.id } },
      );
    }

    res.json({ success: true, message: "Pillars reordered" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to reorder pillars" });
  }
});

// PUT /:id — Update pillar
router.put("/:id", adminAuth, requireAdminRole, async (req, res) => {
  try {
    const pillar = await MasteryPillar.findByPk(req.params.id);
    if (!pillar)
      return res
        .status(404)
        .json({ success: false, error: "Pillar not found" });

    const { title, description, icon, order, isActive } = req.body;
    await pillar.update({
      title:
        title !== undefined
          ? String(title).trim().substring(0, 255)
          : pillar.title,
      description:
        description !== undefined
          ? String(description).trim().substring(0, 2000)
          : pillar.description,
      icon: icon !== undefined ? icon : pillar.icon,
      order: order !== undefined ? order : pillar.order,
      isActive: isActive !== undefined ? isActive : pillar.isActive,
    });

    logSettingsActivity(
      "mastery-pillars",
      `Updated pillar: ${pillar.title}`,
      req.admin,
      req,
      { pillarId: pillar.id },
    ).catch(() => {});
    res.json({ success: true, data: pillar });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update pillar" });
  }
});

// DELETE /:id
router.delete("/:id", adminAuth, requireAdminRole, async (req, res) => {
  try {
    const pillar = await MasteryPillar.findByPk(req.params.id);
    if (!pillar)
      return res
        .status(404)
        .json({ success: false, error: "Pillar not found" });
    await pillar.destroy();
    logSettingsActivity(
      "mastery-pillars",
      `Deleted pillar: ${pillar.title}`,
      req.admin,
      req,
      { pillarId: req.params.id },
    ).catch(() => {});
    res.json({ success: true, message: "Pillar deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete pillar" });
  }
});

export default router;
