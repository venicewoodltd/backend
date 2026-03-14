/**
 * Production Admin Products Routes
 */

import express from "express";
import multer from "multer";
import { Product, AdminUser } from "../../models/postgres/index.js";
import Media from "../../models/mongodb/Media.js";
import { adminAuth, requirePermission } from "../../middlewares/adminAuth.js";
import { saveImageToGridFS } from "../../services/upload.service.js";
import { getGridFSBucket } from "../../config/gridfs.js";
import { logProductActivity } from "../../services/activityLog.service.js";
import { createSlug } from "../../utils/validators.js";
import logger from "../../config/logger.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use(adminAuth);
router.use(requirePermission("products"));

// POST / — Create product
router.post(
  "/",
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "galleryImages", maxCount: 20 },
  ]),
  async (req, res) => {
    try {
      const body = req.body;
      const name = body.name?.trim();
      if (!name)
        return res
          .status(400)
          .json({ success: false, error: "Product name is required" });

      const slug = body.slug?.trim() || createSlug(name);
      const existing = await Product.findOne({ where: { slug } });
      if (existing)
        return res.status(409).json({
          success: false,
          error: "A product with this slug already exists",
        });

      // Parse JSON fields safely
      const parseJSON = (val, def) => {
        try {
          return typeof val === "string" ? JSON.parse(val) : val || def;
        } catch {
          return def;
        }
      };

      const product = await Product.create({
        name,
        slug,
        description: body.description,
        longDescription: body.longDescription,
        category: body.category || "Custom",
        seoTags: body.seoTags,
        featured: body.featured === "true" || body.featured === true,
        status: body.status || "draft",
        wood_type: body.wood_type,
        material: body.material,
        finish: body.finish,
        joinery: body.joinery,
        delivery: body.delivery,
        dimensions: parseJSON(body.dimensions, null),
        specifications: parseJSON(body.specifications, []),
        features: parseJSON(body.features, []),
        createdBy: req.admin.id,
      });

      // Handle main image
      let mainImageFileId = body.mainImageFileId;
      if (req.files?.mainImage?.[0]) {
        const file = req.files.mainImage[0];
        const gridFile = await saveImageToGridFS(
          file.buffer,
          `product-main-${Date.now()}-${file.originalname}`,
        );
        mainImageFileId = gridFile._id.toString();
      }

      if (mainImageFileId) {
        await Media.create({
          productId: product.id,
          fileId: mainImageFileId,
          fileName: `main-${product.slug}`,
          mimeType: "image/jpeg",
          type: "main",
          uploadedBy: req.admin.username,
        });
        await product.update({ image: mainImageFileId });
      }

      // Handle gallery images
      const galleryFileIds = body.galleryImageFileIds
        ? Array.isArray(body.galleryImageFileIds)
          ? body.galleryImageFileIds
          : [body.galleryImageFileIds]
        : [];
      if (req.files?.galleryImages) {
        for (const file of req.files.galleryImages) {
          const gridFile = await saveImageToGridFS(
            file.buffer,
            `product-gallery-${Date.now()}-${file.originalname}`,
          );
          galleryFileIds.push(gridFile._id.toString());
        }
      }

      for (const fid of galleryFileIds) {
        await Media.create({
          productId: product.id,
          fileId: fid,
          fileName: `gallery-${product.slug}-${fid}`,
          mimeType: "image/jpeg",
          type: "gallery",
          uploadedBy: req.admin.username,
        });
      }

      logProductActivity("created", product.toJSON(), req.admin, req).catch(
        () => {},
      );

      res.status(201).json({ success: true, product: product.toJSON() });
    } catch (error) {
      logger.error("Create product error", { error: error.message });
      res
        .status(500)
        .json({ success: false, error: "Failed to create product" });
    }
  },
);

// GET / — List products
router.get("/", async (req, res) => {
  try {
    const products = await Product.findAll({
      include: [
        {
          model: AdminUser,
          as: "creator",
          attributes: ["id", "name", "username"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    res.json({ success: true, products });
  } catch (error) {
    logger.error("List products error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch products" });
  }
});

// GET /:id — Get product
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [
        {
          model: AdminUser,
          as: "creator",
          attributes: ["id", "name", "username"],
        },
      ],
    });
    if (!product)
      return res
        .status(404)
        .json({ success: false, error: "Product not found" });

    const media = await Media.find({ productId: product.id });
    res.json({ success: true, product: { ...product.toJSON(), media } });
  } catch (error) {
    logger.error("Get product error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch product" });
  }
});

// PUT /:id — Update product
router.put(
  "/:id",
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "galleryImages", maxCount: 20 },
  ]),
  async (req, res) => {
    try {
      const product = await Product.findByPk(req.params.id);
      if (!product)
        return res
          .status(404)
          .json({ success: false, error: "Product not found" });

      const body = req.body;
      const parseJSON = (val, def) => {
        try {
          return typeof val === "string" ? JSON.parse(val) : val || def;
        } catch {
          return def;
        }
      };

      const updates = {};
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.slug !== undefined) {
        const slugExists = await Product.findOne({
          where: { slug: body.slug },
        });
        if (slugExists && slugExists.id !== product.id) {
          return res
            .status(409)
            .json({ success: false, error: "Slug already exists" });
        }
        updates.slug = body.slug;
      }
      if (body.description !== undefined)
        updates.description = body.description;
      if (body.longDescription !== undefined)
        updates.longDescription = body.longDescription;
      if (body.category !== undefined) updates.category = body.category;
      if (body.seoTags !== undefined) updates.seoTags = body.seoTags;
      if (body.featured !== undefined)
        updates.featured = body.featured === "true" || body.featured === true;
      if (body.status !== undefined) updates.status = body.status;
      if (body.wood_type !== undefined) updates.wood_type = body.wood_type;
      if (body.material !== undefined) updates.material = body.material;
      if (body.finish !== undefined) updates.finish = body.finish;
      if (body.joinery !== undefined) updates.joinery = body.joinery;
      if (body.delivery !== undefined) updates.delivery = body.delivery;
      if (body.dimensions !== undefined)
        updates.dimensions = parseJSON(body.dimensions, null);
      if (body.specifications !== undefined)
        updates.specifications = parseJSON(body.specifications, []);
      if (body.features !== undefined)
        updates.features = parseJSON(body.features, []);

      // Handle new main image
      if (req.files?.mainImage?.[0]) {
        const file = req.files.mainImage[0];
        const gridFile = await saveImageToGridFS(
          file.buffer,
          `product-main-${Date.now()}-${file.originalname}`,
        );
        await Media.deleteMany({ productId: product.id, type: "main" });
        await Media.create({
          productId: product.id,
          fileId: gridFile._id,
          fileName: `main-${product.slug}`,
          mimeType: file.mimetype,
          type: "main",
          uploadedBy: req.admin.username,
        });
        updates.image = gridFile._id.toString();
      } else if (body.mainImageFileId) {
        await Media.deleteMany({ productId: product.id, type: "main" });
        await Media.create({
          productId: product.id,
          fileId: body.mainImageFileId,
          fileName: `main-${product.slug}`,
          mimeType: "image/jpeg",
          type: "main",
          uploadedBy: req.admin.username,
        });
        updates.image = body.mainImageFileId;
      }

      // Handle new gallery images
      if (req.files?.galleryImages) {
        for (const file of req.files.galleryImages) {
          const gridFile = await saveImageToGridFS(
            file.buffer,
            `product-gallery-${Date.now()}-${file.originalname}`,
          );
          await Media.create({
            productId: product.id,
            fileId: gridFile._id,
            fileName: `gallery-${file.originalname}`,
            mimeType: file.mimetype,
            type: "gallery",
            uploadedBy: req.admin.username,
          });
        }
      }

      // Handle removed gallery images
      if (body.removedGalleryIds) {
        const ids = Array.isArray(body.removedGalleryIds)
          ? body.removedGalleryIds
          : [body.removedGalleryIds];
        for (const id of ids) {
          await Media.findByIdAndDelete(id);
        }
      }

      await product.update(updates);

      logProductActivity("updated", product.toJSON(), req.admin, req).catch(
        () => {},
      );
      res.json({ success: true, product: product.toJSON() });
    } catch (error) {
      logger.error("Update product error", { error: error.message });
      res
        .status(500)
        .json({ success: false, error: "Failed to update product" });
    }
  },
);

// DELETE /:id
router.delete("/:id", async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product)
      return res
        .status(404)
        .json({ success: false, error: "Product not found" });

    // Delete GridFS files before removing Media docs
    const mediaItems = await Media.find({ productId: product.id });
    const bucket = getGridFSBucket();
    for (const m of mediaItems) {
      try {
        await bucket.delete(m.fileId);
      } catch {}
    }
    await Media.deleteMany({ productId: product.id });
    await product.destroy();

    logProductActivity(
      "deleted",
      { id: product.id, name: product.name },
      req.admin,
      req,
    ).catch(() => {});
    res.json({ success: true, message: "Product deleted" });
  } catch (error) {
    logger.error("Delete product error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to delete product" });
  }
});

export default router;
