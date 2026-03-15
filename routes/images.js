/**
 * Production Image Upload/Delete Routes
 */

import express from "express";
import multer from "multer";
import mongoose from "mongoose";
const { GridFSBucket } = mongoose.mongo;
import Media from "../models/mongodb/Media.js";
import { uploadToGridFS } from "../services/gridfsUpload.js";
import { adminAuth } from "../middlewares/adminAuth.js";
import logger from "../config/logger.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (parseInt(process.env.MAX_IMAGE_SIZE_MB) || 10) * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "image/bmp",
      "image/tiff",
      "image/x-icon",
    ];
    const extValid = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico)$/i.test(
      file.originalname,
    );
    cb(
      allowed.includes(file.mimetype) && extValid
        ? null
        : new Error("Only image files allowed"),
      allowed.includes(file.mimetype) && extValid,
    );
  },
});

// POST /image — Upload image to GridFS
router.post(
  "/image",
  adminAuth,
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? "File too large. Max " +
              (parseInt(process.env.MAX_IMAGE_SIZE) || 10 * 1024 * 1024) /
                1024 /
                1024 +
              "MB."
            : err.message || "File upload error";
        return res.status(400).json({ success: false, error: message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, error: "No file provided" });

      const filename = `${Date.now()}-${req.file.originalname}`;
      const gridfsFile = await uploadToGridFS(req.file.buffer, {
        filename,
        contentType: req.file.mimetype,
      });

      res.json({
        success: true,
        fileId: gridfsFile._id,
        filename,
        message: "Image uploaded",
      });
    } catch (error) {
      logger.error("Image upload error", {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: "Image upload failed",
      });
    }
  },
);

// DELETE /:fileId — Delete image from GridFS
router.delete("/:fileId", adminAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      return res.status(400).json({ success: false, error: "Invalid file ID" });
    }

    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "images",
    });
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);

    try {
      await bucket.delete(fileId);
    } catch {}
    await Media.deleteMany({ fileId });

    res.json({ success: true, message: "Image deleted" });
  } catch (error) {
    logger.error("Image delete error", { error: error.message });
    res.status(500).json({ success: false, error: "Image deletion failed" });
  }
});

export default router;
