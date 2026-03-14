/**
 * Production Activity Log Model (MongoDB)
 * Comprehensive audit trail
 */

import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, default: "📝" },
    color: { type: String, default: "bg-gray-100 text-gray-600" },
    entityType: { type: String },
    entityId: { type: String, index: true },
    entityName: { type: String },
    performedBy: {
      userId: String,
      username: String,
      role: String,
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
    milestone: {
      milestoneType: String,
      value: Number,
      previousValue: Number,
    },
    ipAddress: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

activityLogSchema.index({ type: 1, timestamp: -1 });
activityLogSchema.index({ category: 1, timestamp: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
export default ActivityLog;
