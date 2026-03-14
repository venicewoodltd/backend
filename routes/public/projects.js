/**
 * Production Public Projects Routes
 */

import express from "express";
import { sequelize } from "../../models/postgres/index.js";
import Media from "../../models/mongodb/Media.js";
import logger from "../../config/logger.js";

const router = express.Router();

// GET / — List published projects
router.get("/", async (req, res) => {
  try {
    const { Project } = sequelize.models;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 12, 100);
    const offset = (page - 1) * limit;
    const where = { status: "published" };

    if (req.query.category) where.category = req.query.category;
    if (req.query.search) {
      const term = req.query.search.toLowerCase().replace(/[%_]/g, "\\$&");
      where.name = sequelize.where(
        sequelize.fn("LOWER", sequelize.col("name")),
        "LIKE",
        `%${term}%`,
      );
    }

    const { count, rows } = await Project.findAndCountAll({
      where,
      offset,
      limit,
      order: [["completionDate", "DESC"]],
    });

    const enriched = await Promise.all(
      rows.map(async (p) => {
        const image = await Media.findOne({ projectId: p.id, type: "main" });
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          title: p.title,
          description: p.description,
          category: p.category,
          image: image ? `/api/images/${image.fileId}` : null,
          featured: p.featured,
          primaryWood: p.primaryWood,
          client: p.client,
          location: p.location,
          completionDate: p.completionDate,
          createdAt: p.createdAt,
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
    logger.error("Public projects list error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch projects" });
  }
});

// GET /:slug — Single project
router.get("/:slug", async (req, res) => {
  try {
    const { Project } = sequelize.models;
    let project = await Project.findOne({
      where: { slug: req.params.slug, status: "published" },
    });
    if (!project)
      project = await Project.findOne({
        where: { id: req.params.slug, status: "published" },
      });
    if (!project)
      return res
        .status(404)
        .json({ success: false, error: "Project not found" });

    await Project.increment("views", { by: 1, where: { id: project.id } });

    const [mainImage, galleryImages] = await Promise.all([
      Media.findOne({ projectId: project.id, type: "main" }),
      Media.find({ projectId: project.id, type: "gallery" }),
    ]);

    res.json({
      success: true,
      data: {
        ...project.toJSON(),
        image: mainImage ? `/api/images/${mainImage.fileId}` : null,
        gallery: galleryImages.map((img) => ({
          id: img._id.toString(),
          url: `/api/images/${img.fileId}`,
          fileName: img.fileName,
          type: img.type,
        })),
      },
    });
  } catch (error) {
    logger.error("Public project detail error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch project" });
  }
});

export default router;
