/**
 * Production Public Products Routes
 */

import express from "express";
import { sequelize } from "../../models/postgres/index.js";
import ProductContent from "../../models/mongodb/ProductContent.js";
import Media from "../../models/mongodb/Media.js";
import SEO from "../../models/mongodb/SEO.js";
import logger from "../../config/logger.js";

const router = express.Router();

// GET / — List published products with pagination
router.get("/", async (req, res) => {
  try {
    const { Product } = sequelize.models;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 12, 100);
    const offset = (page - 1) * limit;
    const where = { status: "published" };

    if (req.query.category) where.category = req.query.category;
    if (req.query.featured === "true") where.featured = true;
    if (req.query.search) {
      const term = req.query.search.toLowerCase().replace(/[%_]/g, "\\$&");
      where.name = sequelize.where(
        sequelize.fn("LOWER", sequelize.col("name")),
        "LIKE",
        `%${term}%`,
      );
    }

    const sortField = ["name", "createdAt", "category"].includes(req.query.sort)
      ? req.query.sort
      : "createdAt";
    const { count, rows } = await Product.findAndCountAll({
      where,
      offset,
      limit,
      order: [[sortField, req.query.order === "asc" ? "ASC" : "DESC"]],
    });

    const enriched = await Promise.all(
      rows.map(async (p) => {
        const image = await Media.findOne({ productId: p.id, type: "main" });
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          description: p.description,
          category: p.category,
          image: image?.fileId ? `/api/images/${image.fileId}` : null,
          featured: p.featured,
          wood_type: p.wood_type,
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
    logger.error("Public products list error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch products" });
  }
});

// GET /featured
router.get("/featured", async (req, res) => {
  try {
    const { Product } = sequelize.models;
    const products = await Product.findAll({
      where: { featured: true, status: "published" },
      limit: 6,
      order: [["createdAt", "DESC"]],
    });

    const enriched = await Promise.all(
      products.map(async (p) => {
        const image = await Media.findOne({ productId: p.id, type: "main" });
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          image: image?.fileId ? `/api/images/${image.fileId}` : null,
        };
      }),
    );

    res.json({ success: true, data: enriched });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch featured products" });
  }
});

// GET /category/:category
router.get("/category/:category", async (req, res) => {
  try {
    const { Product } = sequelize.models;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 12, 100);
    const { count, rows } = await Product.findAndCountAll({
      where: { category: req.params.category, status: "published" },
      offset: (page - 1) * limit,
      limit,
      order: [["createdAt", "DESC"]],
    });

    const enriched = await Promise.all(
      rows.map(async (p) => {
        const image = await Media.findOne({ productId: p.id, type: "main" });
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          category: p.category,
          image: image?.fileId ? `/api/images/${image.fileId}` : null,
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
    res.status(500).json({ success: false, error: "Failed to fetch products" });
  }
});

// GET /:slug — Single product detail
router.get("/:slug", async (req, res) => {
  try {
    const { Product } = sequelize.models;
    let product = await Product.findOne({
      where: { slug: req.params.slug, status: "published" },
    });
    if (!product)
      product = await Product.findOne({
        where: { id: req.params.slug, status: "published" },
      });
    if (!product)
      return res
        .status(404)
        .json({ success: false, error: "Product not found" });

    await Product.increment("views", { where: { id: product.id } });

    const [content, images, seo] = await Promise.all([
      ProductContent.findOne({ productId: product.id }),
      Media.find({ productId: product.id }),
      SEO.findOne({ productId: product.id }),
    ]);

    res.set("Cache-Control", "public, max-age=3600");
    res.json({
      success: true,
      data: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        category: product.category,
        featured: product.featured,
        wood_type: product.wood_type,
        material: product.material,
        finish: product.finish,
        joinery: product.joinery,
        delivery: product.delivery,
        createdAt: product.createdAt,
        longDescription: content?.longDescription,
        specifications: content?.specifications || [],
        features: content?.features || [],
        tags: content?.tags || [],
        images: images.map((img) => ({
          id: img._id,
          url: img.fileId ? `/api/images/${img.fileId}` : img.filePath,
          type: img.type,
        })),
        seo: seo
          ? {
              title: seo.title,
              metaDescription: seo.metaDescription,
              keywords: seo.keywords,
            }
          : null,
      },
    });
  } catch (error) {
    logger.error("Public product detail error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch product" });
  }
});

export default router;
