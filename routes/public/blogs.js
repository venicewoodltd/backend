/**
 * Production Public Blogs Routes
 */

import express from "express";
import { sequelize } from "../../models/postgres/index.js";
import Media from "../../models/mongodb/Media.js";
import logger from "../../config/logger.js";

const router = express.Router();

// GET / — List published blogs
router.get("/", async (req, res) => {
  try {
    const { Blog } = sequelize.models;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 12, 100);
    const offset = (page - 1) * limit;
    const where = { status: "published" };

    if (req.query.category) where.category = req.query.category;

    const { count, rows } = await Blog.findAndCountAll({
      where,
      offset,
      limit,
      order: [["publishedAt", "DESC"]],
    });

    const enriched = await Promise.all(
      rows.map(async (b) => {
        const image = await Media.findOne({ blogId: b.id, type: "featured" });
        return {
          id: b.id,
          title: b.title,
          slug: b.slug,
          excerpt: b.excerpt,
          category: b.category,
          author: b.author,
          readingTime: b.readingTime,
          image: image?.fileId ? `/api/images/${image.fileId}` : null,
          publishedAt: b.publishedAt,
          createdAt: b.createdAt,
        };
      }),
    );

    res.json({
      success: true,
      data: enriched,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    logger.error("Public blogs list error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch blogs" });
  }
});

// GET /:slug — Single blog
router.get("/:slug", async (req, res) => {
  try {
    const { Blog } = sequelize.models;
    let blog = await Blog.findOne({
      where: { slug: req.params.slug, status: "published" },
    });
    if (!blog)
      blog = await Blog.findOne({
        where: { id: req.params.slug, status: "published" },
      });
    if (!blog)
      return res.status(404).json({ success: false, error: "Blog not found" });

    await Blog.increment("views", { where: { id: blog.id } });

    const image = await Media.findOne({ blogId: blog.id, type: "featured" });

    res.set("Cache-Control", "public, max-age=3600");
    res.json({
      success: true,
      data: {
        ...blog.toJSON(),
        image: image?.fileId ? `/api/images/${image.fileId}` : null,
      },
    });
  } catch (error) {
    logger.error("Public blog detail error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch blog" });
  }
});

export default router;
