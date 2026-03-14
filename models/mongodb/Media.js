/**
 * Production Media Model (MongoDB)
 * References GridFS files for image storage
 */

import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    productId: { type: String, index: true },
    projectId: { type: String, index: true },
    blogId: { type: String, index: true },
    testimonialId: { type: String, index: true },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    filePath: { type: String }, // Legacy - backward compatibility
    fileName: { type: String, required: true },
    fileSize: { type: Number },
    mimeType: { type: String, default: "image/jpeg" },
    type: {
      type: String,
      enum: ["main", "gallery", "document", "video", "featured"],
      default: "gallery",
    },
    metadata: {
      width: Number,
      height: Number,
      duration: Number,
      contentType: String,
    },
    uploadedBy: { type: String, default: "admin" },
  },
  { timestamps: true },
);

mediaSchema.index({ createdAt: -1 });

const Media = mongoose.model("Media", mediaSchema);
export default Media;
