/**
 * Production Product Content Model (MongoDB)
 * Extended content, SEO data, revisions
 */

import mongoose from "mongoose";

const productContentSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, unique: true, index: true },
    longDescription: String,
    shortDescription: String,
    specifications: [{ key: String, value: String }],
    features: [String],
    images: [
      {
        url: String,
        alt: String,
        type: { type: String, enum: ["main", "gallery"] },
        uploadedAt: Date,
      },
    ],
    tags: [String],
    seoData: {
      title: String,
      metaDescription: String,
      keywords: [String],
      ogImage: String,
    },
    revisions: [
      {
        version: Number,
        changes: mongoose.Schema.Types.Mixed,
        changedBy: String,
        changedAt: Date,
      },
    ],
  },
  { timestamps: true },
);

const ProductContent = mongoose.model("ProductContent", productContentSchema);
export default ProductContent;
