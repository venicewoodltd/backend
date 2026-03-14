/**
 * Production Image Stream Routes — GridFS image serving
 */

import express from "express";
import mongoose from "mongoose";
const { GridFSBucket } = mongoose.mongo;
import Media from "../models/mongodb/Media.js";
import logger from "../config/logger.js";

const router = express.Router();

// CORS middleware for image routes
router.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    process.env.CLIENT_URL,
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin))
    res.set("Access-Control-Allow-Origin", origin);
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, DELETE, POST");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Credentials", "true");
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// GET /:id — Stream image from GridFS
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid image ID" });
    }

    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const filesCollection = mongoose.connection.db.collection("images.files");
    const gridfsFile = await filesCollection.findOne({ _id: fileId });

    if (!gridfsFile)
      return res.status(404).json({ success: false, error: "Image not found" });

    const contentType =
      gridfsFile.metadata?.contentType ||
      gridfsFile.contentType ||
      "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    if (gridfsFile.length) res.set("Content-Length", String(gridfsFile.length));

    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "images",
    });
    const downloadStream = bucket.openDownloadStream(fileId);

    downloadStream.on("error", (error) => {
      logger.error("Image stream error", {
        error: error.message,
        fileId: req.params.id,
      });
      if (!res.headersSent)
        res
          .status(500)
          .json({ success: false, error: "Failed to stream image" });
    });

    downloadStream.pipe(res);
  } catch (error) {
    logger.error("Image retrieval error", { error: error.message });
    if (!res.headersSent)
      res
        .status(500)
        .json({ success: false, error: "Failed to retrieve image" });
  }
});

// GET /product/:productId — All images for a product
router.get("/product/:productId", async (req, res) => {
  try {
    const media = await Media.find({ productId: req.params.productId }).sort({
      createdAt: 1,
    });
    if (!media?.length)
      return res.status(404).json({ success: false, error: "No images found" });

    const images = { main: null, gallery: [] };
    for (const m of media) {
      const item = {
        id: m._id,
        fileId: m.fileId,
        filename: m.fileName,
        url: `/api/images/${m.fileId}`,
        size: m.fileSize,
        uploadedAt: m.createdAt,
      };
      if (m.type === "main") images.main = item;
      else if (m.type === "gallery") images.gallery.push(item);
    }

    res.json({ success: true, productId: req.params.productId, images });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to retrieve product images" });
  }
});

// GET /project/:projectId — All images for a project
router.get("/project/:projectId", async (req, res) => {
  try {
    const media = await Media.find({ projectId: req.params.projectId }).sort({
      createdAt: 1,
    });
    if (!media?.length)
      return res.status(404).json({ success: false, error: "No images found" });

    const images = { main: null, gallery: [] };
    for (const m of media) {
      const item = {
        id: m._id,
        fileId: m.fileId,
        filename: m.fileName,
        url: `/api/images/${m.fileId}`,
        size: m.fileSize,
        uploadedAt: m.createdAt,
      };
      if (m.type === "main") images.main = item;
      else if (m.type === "gallery") images.gallery.push(item);
    }

    res.json({ success: true, projectId: req.params.projectId, images });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to retrieve project images" });
  }
});

export default router;
