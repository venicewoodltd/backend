/**
 * Production Public Testimonials Routes
 */

import express from "express";
import { Testimonial } from "../../models/postgres/index.js";

const router = express.Router();

// GET / — Featured/all testimonials
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const where = {};
    if (req.query.featured === "true") where.featured = true;

    const testimonials = await Testimonial.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
    });

    res.json({ success: true, data: testimonials });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch testimonials" });
  }
});

export default router;
