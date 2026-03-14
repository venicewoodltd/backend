/**
 * Production Admin Legal Pages Routes
 */

import express from "express";
import mongoose from "mongoose";
import { adminAuth, requireAdminRole } from "../../middlewares/adminAuth.js";
import logger from "../../config/logger.js";

const router = express.Router();
const COLLECTION_NAME = "legalPages";

const defaultPages = {
  privacyPolicy: {
    title: "Privacy Policy",
    content: "",
    lastUpdated: null,
    updatedBy: null,
  },
  termsConditions: {
    title: "Terms and Conditions",
    content: "",
    lastUpdated: null,
    updatedBy: null,
  },
};

// GET / — Get all legal pages
router.get("/", adminAuth, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection(COLLECTION_NAME);
    const [privacy, terms] = await Promise.all([
      collection.findOne({ _id: "privacyPolicy" }),
      collection.findOne({ _id: "termsConditions" }),
    ]);

    res.json({
      success: true,
      privacyPolicy: privacy
        ? {
            title: privacy.title || "Privacy Policy",
            content: privacy.content || "",
            lastUpdated: privacy.lastUpdated,
            updatedBy: privacy.updatedBy,
          }
        : defaultPages.privacyPolicy,
      termsConditions: terms
        ? {
            title: terms.title || "Terms and Conditions",
            content: terms.content || "",
            lastUpdated: terms.lastUpdated,
            updatedBy: terms.updatedBy,
          }
        : defaultPages.termsConditions,
    });
  } catch (error) {
    logger.error("Fetch legal pages error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch legal pages" });
  }
});

// PUT /privacy-policy
router.put("/privacy-policy", adminAuth, requireAdminRole, async (req, res) => {
  try {
    const { title, content } = req.body;
    const db = mongoose.connection.db;
    await db
      .collection(COLLECTION_NAME)
      .updateOne(
        { _id: "privacyPolicy" },
        {
          $set: {
            title: title || "Privacy Policy",
            content: content || "",
            lastUpdated: new Date(),
            updatedBy: req.admin.username,
          },
        },
        { upsert: true },
      );
    res.json({ success: true, message: "Privacy policy updated" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to update privacy policy" });
  }
});

// PUT /terms-conditions
router.put(
  "/terms-conditions",
  adminAuth,
  requireAdminRole,
  async (req, res) => {
    try {
      const { title, content } = req.body;
      const db = mongoose.connection.db;
      await db
        .collection(COLLECTION_NAME)
        .updateOne(
          { _id: "termsConditions" },
          {
            $set: {
              title: title || "Terms and Conditions",
              content: content || "",
              lastUpdated: new Date(),
              updatedBy: req.admin.username,
            },
          },
          { upsert: true },
        );
      res.json({ success: true, message: "Terms and conditions updated" });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to update terms" });
    }
  },
);

export default router;
