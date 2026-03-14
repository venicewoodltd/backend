import mongoose from "mongoose";

const pageVisitSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now, index: true },
    path: { type: String, required: true },
    userAgent: String,
    ipAddress: String,
    referrer: String,
    sessionId: String,
  },
  { timestamps: false },
);

pageVisitSchema.index({ path: 1, timestamp: -1 });

const PageVisit = mongoose.model("PageVisit", pageVisitSchema);
export default PageVisit;
