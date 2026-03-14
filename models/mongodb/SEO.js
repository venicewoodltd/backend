import mongoose from "mongoose";

const seoSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    metaDescription: String,
    keywords: [String],
    ogImage: String,
    ogTitle: String,
    ogDescription: String,
    twitterCard: String,
    canonicalUrl: String,
    structuredData: mongoose.Schema.Types.Mixed,
    robots: {
      index: { type: Boolean, default: true },
      follow: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

const SEO = mongoose.model("SEO", seoSchema);
export default SEO;
