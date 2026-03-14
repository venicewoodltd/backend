/**
 * Production Admin Categories Routes
 */

import express from "express";
import { Category } from "../../models/postgres/index.js";
import { adminAuth, requireAdminRole } from "../../middlewares/adminAuth.js";
import { slugify } from "../../utils/slugify.js";
import logger from "../../config/logger.js";

const router = express.Router();
router.use(adminAuth);

// GET / — List categories (optionally by type)
router.get("/", async (req, res) => {
  try {
    const where = {};
    const { type } = req.query;
    if (type && ["product", "project", "blog", "inquiry"].includes(type))
      where.type = type;

    const categories = await Category.findAll({
      where,
      order: [
        ["sortOrder", "ASC"],
        ["name", "ASC"],
      ],
    });
    res.json({ success: true, categories });
  } catch (error) {
    logger.error("Fetch categories error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch categories" });
  }
});

// POST / — Create category (admin only)
router.post("/", requireAdminRole, async (req, res) => {
  try {
    const { name, description, color, isActive, sortOrder, type } = req.body;
    if (!name || !name.trim())
      return res
        .status(400)
        .json({ success: false, error: "Category name is required" });

    const validTypes = ["product", "project", "blog", "inquiry"];
    const categoryType = validTypes.includes(type) ? type : "product";
    const slug = slugify(name.trim());

    const existing = await Category.findOne({
      where: { slug, type: categoryType },
    });
    if (existing)
      return res.status(400).json({
        success: false,
        error: `Category already exists for ${categoryType}s`,
      });

    const category = await Category.create({
      name: name.trim(),
      slug,
      type: categoryType,
      description: description || null,
      color: color || "#4e342e",
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: sortOrder || 0,
    });

    res.status(201).json({ success: true, category });
  } catch (error) {
    logger.error("Create category error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to create category" });
  }
});

// PUT /:id — Update category (admin only)
router.put("/:id", requireAdminRole, async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category)
      return res
        .status(404)
        .json({ success: false, error: "Category not found" });

    const { name, description, color, isActive, sortOrder } = req.body;
    const updates = {};
    if (description !== undefined) updates.description = description;
    if (color !== undefined) updates.color = color;
    if (isActive !== undefined) updates.isActive = isActive;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    if (name && name !== category.name) {
      updates.name = name;
      updates.slug = slugify(name);
      const existing = await Category.findOne({
        where: { slug: updates.slug, type: category.type },
      });
      if (existing && existing.id !== req.params.id) {
        return res.status(400).json({
          success: false,
          error: "Category with this name already exists",
        });
      }
    }

    await category.update(updates);
    res.json({ success: true, category });
  } catch (error) {
    logger.error("Update category error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to update category" });
  }
});

// DELETE /:id (admin only)
router.delete("/:id", requireAdminRole, async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category)
      return res
        .status(404)
        .json({ success: false, error: "Category not found" });
    await category.destroy();
    res.json({ success: true, message: "Category deleted" });
  } catch (error) {
    logger.error("Delete category error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to delete category" });
  }
});

export default router;
