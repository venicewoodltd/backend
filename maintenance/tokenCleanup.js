#!/usr/bin/env node
/**
 * Token & Session Cleanup — removes expired data.
 * Usage: node maintenance/tokenCleanup.js
 */
import "dotenv/config";
import connectMongoDB from "../config/mongodb.js";
import mongoose from "mongoose";
import ActivityLog from "../models/mongodb/ActivityLog.js";
import PageVisit from "../models/mongodb/PageVisit.js";

async function run() {
  console.log("=== Token & Session Cleanup ===\n");

  if (mongoose.connection.readyState !== 1) await connectMongoDB();

  // 1. Clean old activity logs (> 90 days)
  const activityCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const deletedActivities = await ActivityLog.deleteMany({
    timestamp: { $lt: activityCutoff },
  });
  console.log(
    `[1] Deleted ${deletedActivities.deletedCount} activity log(s) older than 90 days`,
  );

  // 2. Clean old page visits (> 180 days)
  const visitCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const deletedVisits = await PageVisit.deleteMany({
    createdAt: { $lt: visitCutoff },
  });
  console.log(
    `[2] Deleted ${deletedVisits.deletedCount} page visit(s) older than 180 days`,
  );

  // 3. Stats
  const activityCount = await ActivityLog.countDocuments();
  const visitCount = await PageVisit.countDocuments();
  console.log(
    `\nRemaining: ${activityCount} activity logs, ${visitCount} page visits`,
  );

  await mongoose.connection.close().catch(() => {});
  process.exit(0);
}

run().catch((err) => {
  console.error("Cleanup error:", err.message);
  process.exit(1);
});
