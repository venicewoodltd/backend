/**
 * Production Upload Service
 * GridFS image storage with Sharp optimization
 */

import mongoose from "mongoose";
const { GridFSBucket } = mongoose.mongo;
import sharp from "sharp";
import Media from "../models/mongodb/Media.js";
import logger from "../config/logger.js";

const MAX_DIMENSION = parseInt(process.env.MAX_IMAGE_DIMENSION) || 4096;
const IMAGE_QUALITY = parseInt(process.env.IMAGE_QUALITY) || 85;

/**
 * Detect image format from magic bytes
 */
function detectFormat(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpeg";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46)
    return "gif";
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  ) {
    if (
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    )
      return "webp";
  }
  return null;
}

/**
 * Process image with Sharp: optimize, resize if too large
 */
async function processImage(buffer, format) {
  try {
    let pipeline = sharp(buffer, { failOn: "none" }).rotate(); // Auto-rotate EXIF

    const metadata = await sharp(buffer).metadata();
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    switch (format) {
      case "jpeg":
        return await pipeline
          .jpeg({ quality: IMAGE_QUALITY, mozjpeg: true })
          .toBuffer();
      case "png":
        return await pipeline
          .png({ quality: IMAGE_QUALITY, effort: 10 })
          .toBuffer();
      case "webp":
        return await pipeline
          .webp({ quality: IMAGE_QUALITY, smartSubsample: true })
          .toBuffer();
      default:
        return buffer; // GIF, SVG, BMP, TIFF, ICO — pass through
    }
  } catch (err) {
    logger.warn("Image processing fallback to raw buffer", {
      error: err.message,
    });
    return buffer;
  }
}

/**
 * Save image buffer to GridFS
 */
export async function saveImageToGridFS(buffer, filenameOrOptions) {
  const filename =
    typeof filenameOrOptions === "string"
      ? filenameOrOptions
      : filenameOrOptions?.filename || `image-${Date.now()}`;

  const contentType =
    typeof filenameOrOptions === "object"
      ? filenameOrOptions.contentType
      : null;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB connection not available");
  }

  const format = detectFormat(buffer);
  const processedBuffer = await processImage(buffer, format);

  const bucket = new GridFSBucket(db, {
    bucketName: "images",
  });

  const resolvedContentType = contentType || `image/${format || "jpeg"}`;

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: resolvedContentType,
      metadata: { contentType: resolvedContentType },
    });

    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve({
        _id: uploadStream.id,
        filename,
        contentType: resolvedContentType,
        length: processedBuffer.length,
      });
    };

    uploadStream.on("finish", done);
    uploadStream.on("close", done);
    uploadStream.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
    uploadStream.end(processedBuffer);
  });
}

/**
 * Upload to GridFS (alias for route compatibility)
 */
export async function uploadToGridFS(buffer, options = {}) {
  return saveImageToGridFS(buffer, options);
}

/**
 * Save multiple images to GridFS
 */
export async function saveMultipleImages(items) {
  return Promise.all(
    items.map(({ buffer, filename }) => saveImageToGridFS(buffer, filename)),
  );
}

/**
 * Get all media for a product
 */
export async function getProductImages(productId) {
  return Media.find({ productId }).sort({ createdAt: 1 });
}

/**
 * Delete image from GridFS + Media
 */
export async function deleteImage(mediaId) {
  const media = await Media.findById(mediaId);
  if (!media) return false;

  try {
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "images",
    });
    await bucket.delete(media.fileId);
  } catch (err) {
    logger.warn("GridFS delete failed (file may not exist)", {
      mediaId,
      error: err.message,
    });
  }

  await Media.findByIdAndDelete(mediaId);
  return true;
}

/**
 * Validate image file
 */
export function validateImageFile(file) {
  const allowedMimeTypes = [
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
  const maxSize = (parseInt(process.env.MAX_IMAGE_SIZE_MB) || 50) * 1024 * 1024;

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return { valid: false, error: "Unsupported image format" };
  }
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File exceeds ${process.env.MAX_IMAGE_SIZE_MB || 50}MB limit`,
    };
  }
  return { valid: true };
}

export default {
  saveImageToGridFS,
  uploadToGridFS,
  saveMultipleImages,
  getProductImages,
  deleteImage,
  validateImageFile,
};
