/**
 * Production Public Legal Pages Routes
 */

import express from "express";
import mongoose from "mongoose";

const router = express.Router();
const COLLECTION_NAME = "legalPages";

// GET /privacy-policy
router.get("/privacy-policy", async (req, res) => {
  try {
    const doc = await mongoose.connection.db
      .collection(COLLECTION_NAME)
      .findOne({ _id: "privacyPolicy" });
    res.json({
      success: true,
      title: doc?.title || "Privacy Policy",
      content: doc?.content || "",
      lastUpdated: doc?.lastUpdated || null,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch privacy policy" });
  }
});

// GET /terms-conditions
router.get("/terms-conditions", async (req, res) => {
  try {
    const doc = await mongoose.connection.db
      .collection(COLLECTION_NAME)
      .findOne({ _id: "termsConditions" });
    res.json({
      success: true,
      title: doc?.title || "Terms and Conditions",
      content: doc?.content || "",
      lastUpdated: doc?.lastUpdated || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch terms" });
  }
});

export default router;
