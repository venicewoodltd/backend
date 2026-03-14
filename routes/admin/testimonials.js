/**
 * Production Admin Testimonials Routes
 */

import express from "express";
import multer from "multer";
import { Testimonial } from "../../models/postgres/index.js";
import Media from "../../models/mongodb/Media.js";
import { adminAuth } from "../../middlewares/adminAuth.js";
import { saveImageToGridFS } from "../../services/upload.service.js";
import { logTestimonialActivity } from "../../services/activityLog.service.js";
import { sanitizeString } from "../../utils/validators.js";
import logger from "../../config/logger.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    cb(
      allowed.includes(file.mimetype)
        ? null
        : new Error("Invalid file type. Only JPEG, PNG, WebP, GIF allowed."),
      allowed.includes(file.mimetype),
    );
  },
});

router.use(adminAuth);

// POST / — Create testimonial
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { author, content, rating, featured } = req.body;
    if (!author || !content)
      return res
        .status(400)
        .json({ success: false, error: "Author and content are required" });
    if (rating !== undefined && rating !== null && rating !== "") {
      const parsed = parseInt(rating);
      if (isNaN(parsed) || parsed < 1 || parsed > 5)
        return res
          .status(400)
          .json({ success: false, error: "Rating must be 1-5" });
    }

    let imageId = null;
    let uploadedFile = null;
    if (req.file) {
      uploadedFile = await saveImageToGridFS(
        req.file.buffer,
        `testimonial-${Date.now()}-${req.file.originalname}`,
      );
      imageId = uploadedFile._id.toString();
    }

    const testimonial = await Testimonial.create({
      author: sanitizeString(author.trim()),
      content: sanitizeString(content.trim()),
      rating:
        rating !== undefined && rating !== null && rating !== ""
          ? parseInt(rating)
          : null,
      image: imageId,
      featured: featured === true || featured === "true",
    });

    if (imageId && uploadedFile) {
      await Media.create({
        testimonialId: testimonial.id,
        fileId: uploadedFile._id,
        fileName: uploadedFile.filename,
        fileSize: uploadedFile.length,
        mimeType: uploadedFile.contentType,
        type: "main",
        uploadedBy: req.admin?.id || "system",
      }).catch(() => {});
    }

    logTestimonialActivity(
      "create",
      {
        id: testimonial.id,
        customerName: author.trim(),
        rating: rating ? parseInt(rating) : null,
      },
      req.admin,
      req,
      { hasImage: !!imageId },
    ).catch(() => {});
    res.status(201).json({ success: true, data: testimonial });
  } catch (error) {
    logger.error("Create testimonial error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to create testimonial" });
  }
});

// GET / — List testimonials
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, featured } = req.query;
    const where = {};
    if (featured === "true") where.featured = true;
    const { count, rows } = await Testimonial.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: Math.min(parseInt(limit), 100),
      offset: (parseInt(page) - 1) * parseInt(limit),
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
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch testimonials" });
  }
});

// GET /:id
router.get("/:id", async (req, res) => {
  try {
    const testimonial = await Testimonial.findByPk(req.params.id);
    if (!testimonial)
      return res
        .status(404)
        .json({ success: false, error: "Testimonial not found" });
    res.json({ success: true, data: testimonial });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch testimonial" });
  }
});

// PUT /:id
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const testimonial = await Testimonial.findByPk(req.params.id);
    if (!testimonial)
      return res
        .status(404)
        .json({ success: false, error: "Testimonial not found" });

    const { author, content, rating, featured } = req.body;
    const updates = {};
    if (author) updates.author = sanitizeString(author.trim());
    if (content) updates.content = sanitizeString(content.trim());
    if (rating !== undefined && rating !== null && rating !== "") {
      const parsed = parseInt(rating);
      if (isNaN(parsed) || parsed < 1 || parsed > 5)
        return res
          .status(400)
          .json({ success: false, error: "Rating must be 1-5" });
      updates.rating = parsed;
    }
    if (featured !== undefined)
      updates.featured = featured === true || featured === "true";

    if (req.file) {
      const uploadedFile = await saveImageToGridFS(
        req.file.buffer,
        `testimonial-${Date.now()}-${req.file.originalname}`,
      );
      updates.image = uploadedFile._id.toString();
      await Media.create({
        testimonialId: req.params.id,
        fileId: uploadedFile._id,
        fileName: uploadedFile.filename,
        fileSize: uploadedFile.length,
        mimeType: uploadedFile.contentType,
        type: "main",
        uploadedBy: req.admin?.id || "system",
      }).catch(() => {});
    }

    await testimonial.update(updates);
    logTestimonialActivity(
      "update",
      { id: testimonial.id, customerName: testimonial.author },
      req.admin,
      req,
    ).catch(() => {});
    res.json({ success: true, data: testimonial });
  } catch (error) {
    logger.error("Update testimonial error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to update testimonial" });
  }
});

// DELETE /:id
router.delete("/:id", async (req, res) => {
  try {
    const testimonial = await Testimonial.findByPk(req.params.id);
    if (!testimonial)
      return res
        .status(404)
        .json({ success: false, error: "Testimonial not found" });
    await testimonial.destroy();
    logTestimonialActivity(
      "delete",
      { id: testimonial.id, customerName: testimonial.author },
      req.admin,
      req,
    ).catch(() => {});
    res.json({ success: true, message: "Testimonial deleted" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to delete testimonial" });
  }
});

export default router;
