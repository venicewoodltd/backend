/**
 * Production Public Track Visit Routes
 */

import express from "express";
import mongoose from "mongoose";
import crypto from "crypto";

const router = express.Router();

// POST / — Track a page visit
router.post("/", async (req, res) => {
  try {
    const { path, referrer } = req.body;

    // Validate and sanitize path
    const safePath = typeof path === "string" ? path.slice(0, 500) : "/";
    const safeReferrer =
      typeof referrer === "string" ? referrer.slice(0, 1000) : undefined;
    const userAgent = (req.get("user-agent") || "").slice(0, 500);

    const sessionData = `${req.ip || "unknown"}${userAgent}`;
    const sessionId = crypto
      .createHash("sha256")
      .update(sessionData)
      .digest("hex")
      .slice(0, 32);

    const db = mongoose.connection.db;
    await db.collection("pagevisits").insertOne({
      timestamp: new Date(),
      path: safePath,
      userAgent,
      referrer: safeReferrer || req.get("referrer"),
      sessionId,
    });

    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

export default router;
