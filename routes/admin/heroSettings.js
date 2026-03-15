/**
 * Production Admin Hero Settings Routes
 */

import express from "express";
import { adminAuth, requireAdminRole } from "../../middlewares/adminAuth.js";
import mongoose from "mongoose";
const { GridFSBucket } = mongoose.mongo;
import multer from "multer";
import { Readable } from "stream";
import { logSettingsActivity } from "../../services/activityLog.service.js";
import { saveImageToGridFS } from "../../services/upload.service.js";
import logger from "../../config/logger.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    cb(
      allowed.includes(file.mimetype)
        ? null
        : new Error("Only JPEG, PNG, WebP allowed."),
      allowed.includes(file.mimetype),
    );
  },
});

// GET / — Public hero settings
router.get("/", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const files = await db
      .collection("heroImages.files")
      .find({})
      .sort({ uploadDate: -1 })
      .toArray();
    const settings = await db
      .collection("heroSettings")
      .findOne({ _id: "carousel" });
    const textContent = await db
      .collection("heroSettings")
      .findOne({ _id: "heroText" });

    const defaultSettings = { interval: 5000, transitionType: "fade" };
    const defaultText = {
      heroTitle: "Premium Bespoke Woodwork",
      heroSubtitle:
        "Handcrafted wooden furniture and architectural millwork in Mauritius.",
      titleColor: "#4e342e",
      subtitleColor: "#1f2937",
    };

    res.json({
      success: true,
      images: files || [],
      settings: settings
        ? {
            interval: settings.interval,
            transitionType: settings.transitionType,
          }
        : defaultSettings,
      heroText: textContent
        ? {
            heroTitle: textContent.heroTitle || defaultText.heroTitle,
            heroSubtitle: textContent.heroSubtitle || defaultText.heroSubtitle,
            titleColor: textContent.titleColor || defaultText.titleColor,
            subtitleColor:
              textContent.subtitleColor || defaultText.subtitleColor,
          }
        : defaultText,
    });
  } catch (error) {
    logger.error("Fetch hero settings error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch hero settings" });
  }
});

// POST /upload — Upload hero images
router.post(
  "/upload",
  adminAuth,
  requireAdminRole,
  (req, res, next) => {
    upload.array("images", 5)(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE")
          return res
            .status(400)
            .json({ success: false, error: "File too large. Max 10MB each." });
        return res
          .status(400)
          .json({ success: false, error: err.message || "Upload error" });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0)
        return res
          .status(400)
          .json({ success: false, error: "No files uploaded" });

      const db = mongoose.connection.db;
      const bucket = new GridFSBucket(db, { bucketName: "heroImages" });
      const uploadedFiles = [];

      for (const file of req.files) {
        const uploadStream = bucket.openUploadStream(file.originalname, {
          metadata: {
            originalName: file.originalname,
            mimeType: file.mimetype,
            uploadedBy: req.admin.id,
            uploadedAt: new Date(),
          },
        });

        await new Promise((resolve, reject) => {
          Readable.from([file.buffer])
            .pipe(uploadStream)
            .on("finish", () => {
              uploadedFiles.push({
                fileId: uploadStream.id,
                filename: file.originalname,
                mimeType: file.mimetype,
              });
              resolve();
            })
            .on("error", reject);
        });
      }

      logSettingsActivity(
        "hero",
        `Uploaded ${uploadedFiles.length} hero carousel image(s)`,
        req.admin,
        req,
        { imageCount: uploadedFiles.length },
      ).catch(() => {});
      res.json({
        success: true,
        message: `${uploadedFiles.length} image(s) uploaded`,
        files: uploadedFiles,
      });
    } catch (error) {
      logger.error("Upload hero images error", { error: error.message });
      res
        .status(500)
        .json({ success: false, error: "Failed to upload hero images" });
    }
  },
);

// GET /image/:fileId — Stream hero image
router.get("/image/:fileId", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId))
      return res.status(400).json({ success: false, error: "Invalid file ID" });

    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: "heroImages" });
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    const downloadStream = bucket.openDownloadStream(fileId);

    downloadStream.on("file", (file) => {
      res.setHeader("Content-Type", file.metadata?.mimeType || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
    });
    downloadStream.on("error", () => {
      if (!res.headersSent)
        res.status(404).json({ success: false, error: "Image not found" });
    });
    downloadStream.pipe(res);
  } catch (error) {
    if (!res.headersSent)
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch hero image" });
  }
});

// DELETE /image/:fileId
router.delete(
  "/image/:fileId",
  adminAuth,
  requireAdminRole,
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.fileId))
        return res
          .status(400)
          .json({ success: false, error: "Invalid file ID" });

      const db = mongoose.connection.db;
      const bucket = new GridFSBucket(db, { bucketName: "heroImages" });
      await bucket.delete(new mongoose.Types.ObjectId(req.params.fileId));
      res.json({ success: true, message: "Hero image deleted" });
    } catch (error) {
      logger.error("Delete hero image error", { error: error.message });
      res
        .status(500)
        .json({ success: false, error: "Failed to delete hero image" });
    }
  },
);

// PUT /settings — Update carousel settings
router.put("/settings", adminAuth, requireAdminRole, async (req, res) => {
  try {
    const { interval, transitionType } = req.body;
    if (interval == null || interval < 1000 || interval > 30000)
      return res
        .status(400)
        .json({ success: false, error: "Interval must be 1000-30000ms" });
    if (
      ![
        "fade",
        "slide-left",
        "slide-right",
        "slide-up",
        "slide-down",
        "zoom-in",
        "zoom-out",
        "morph",
        "flip",
      ].includes(transitionType)
    )
      return res.status(400).json({
        success: false,
        error: "Invalid transition type",
      });

    const db = mongoose.connection.db;
    await db.collection("heroSettings").updateOne(
      { _id: "carousel" },
      {
        $set: {
          interval,
          transitionType,
          updatedAt: new Date(),
          updatedBy: req.admin.id,
        },
      },
      { upsert: true },
    );

    logSettingsActivity(
      "hero",
      `Updated carousel: ${transitionType}, ${interval / 1000}s`,
      req.admin,
      req,
      { interval, transitionType },
    ).catch(() => {});
    res.json({
      success: true,
      message: "Carousel settings updated",
      settings: { interval, transitionType },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to update carousel settings" });
  }
});

// PUT /text — Update hero text content
router.put("/text", adminAuth, requireAdminRole, async (req, res) => {
  try {
    const { heroTitle, heroSubtitle, titleColor, subtitleColor } = req.body;
    if (!heroTitle?.trim())
      return res
        .status(400)
        .json({ success: false, error: "Hero title is required" });
    if (!heroSubtitle?.trim())
      return res
        .status(400)
        .json({ success: false, error: "Hero subtitle is required" });

    const db = mongoose.connection.db;
    await db.collection("heroSettings").updateOne(
      { _id: "heroText" },
      {
        $set: {
          heroTitle: heroTitle.trim(),
          heroSubtitle: heroSubtitle.trim(),
          titleColor: titleColor || "#4e342e",
          subtitleColor: subtitleColor || "#1f2937",
          updatedAt: new Date(),
          updatedBy: req.admin.id,
        },
      },
      { upsert: true },
    );

    logSettingsActivity("hero", `Updated hero text`, req.admin, req, {
      heroTitle,
      heroSubtitle,
    }).catch(() => {});
    res.json({
      success: true,
      message: "Hero text updated",
      heroText: {
        heroTitle: heroTitle.trim(),
        heroSubtitle: heroSubtitle.trim(),
        titleColor: titleColor || "#4e342e",
        subtitleColor: subtitleColor || "#1f2937",
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to update hero text" });
  }
});

export default router;
