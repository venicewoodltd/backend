/**
 * Production Public Categories Routes
 */

import express from "express";
import { Category } from "../../models/postgres/index.js";

const router = express.Router();

// GET / — Active categories
router.get("/", async (req, res) => {
  try {
    const where = { isActive: true };
    const { type } = req.query;
    if (type && ["product", "project", "blog", "inquiry"].includes(type))
      where.type = type;

    const categories = await Category.findAll({
      where,
      order: [
        ["sortOrder", "ASC"],
        ["name", "ASC"],
      ],
      attributes: [
        "id",
        "name",
        "slug",
        "description",
        "color",
        "isActive",
        "type",
      ],
    });

    res.json({ success: true, categories });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch categories" });
  }
});

export default router;
