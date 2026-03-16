/**
 * Production Admin Mastery Content Routes
 */

import express from "express";
import { adminAuth, requireAdminRole } from "../../middlewares/adminAuth.js";
import { MasteryContent } from "../../models/postgres/index.js";
import { logSettingsActivity } from "../../services/activityLog.service.js";
import logger from "../../config/logger.js";
import mongoose from "mongoose";
const { GridFSBucket } = mongoose.mongo;

const router = express.Router();

const defaultContent = {
  heroTitle: "The Art of Woodworking Mastery",
  heroSubtitle:
    "Discover the centuries-old techniques and modern innovations that define our craft.",
  section1Title: "Our Philosophy",
  section1Content:
    "At Venice Wood Ltd, we believe that true mastery comes from understanding both the wood and the craftsman.",
  section2Title: "Traditional Techniques",
  section2Content:
    "Our artisans employ time-honored joinery techniques including dovetail joints, mortise and tenon, and hand-carved details.",
  section3Title: "Modern Innovation",
  section3Content:
    "While we honor tradition, we also embrace modern tools and sustainable practices.",
  craftSkills: [
    { name: "Wood Selection", percentage: 95 },
    { name: "Hand Carving", percentage: 90 },
    { name: "Joinery", percentage: 98 },
    { name: "Finishing", percentage: 92 },
  ],
  yearsExperience: 25,
  projectsCompleted: 500,
  satisfiedClients: 350,
};

// GET / — Admin mastery content
router.get("/", adminAuth, requireAdminRole, async (req, res) => {
  try {
    let content = await MasteryContent.findOne({ where: { id: 1 } });
    if (!content)
      content = await MasteryContent.create({ id: 1, ...defaultContent });
    res.json({ success: true, data: content });
  } catch (error) {
    logger.error("Fetch mastery content error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch mastery content" });
  }
});

// GET /public — Public mastery content
router.get("/public", async (req, res) => {
  try {
    const content =
      (await MasteryContent.findOne({ where: { id: 1 } })) || defaultContent;
    res.json({ success: true, data: content });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch mastery content" });
  }
});

// PUT / — Update mastery content
router.put("/", adminAuth, requireAdminRole, async (req, res) => {
  try {
    const {
      heroTitle,
      heroSubtitle,
      heroImage,
      section1Title,
      section1Content,
      section1Image,
      section2Title,
      section2Content,
      section2Image,
      section3Title,
      section3Content,
      section3Image,
      history,
      craftSkills,
      yearsExperience,
      projectsCompleted,
      satisfiedClients,
    } = req.body;

    // Validate craftSkills
    if (craftSkills !== undefined) {
      if (!Array.isArray(craftSkills))
        return res
          .status(400)
          .json({ success: false, error: "craftSkills must be an array" });
      for (const skill of craftSkills) {
        if (!skill.name || typeof skill.name !== "string")
          return res.status(400).json({
            success: false,
            error: "Each skill must have a name string",
          });
        if (
          typeof skill.percentage !== "number" ||
          skill.percentage < 0 ||
          skill.percentage > 100
        )
          return res
            .status(400)
            .json({ success: false, error: "Skill percentage must be 0-100" });
      }
    }

    const validYears =
      Number.isInteger(Number(yearsExperience)) && Number(yearsExperience) >= 0
        ? Number(yearsExperience)
        : undefined;
    const validProjects =
      Number.isInteger(Number(projectsCompleted)) &&
      Number(projectsCompleted) >= 0
        ? Number(projectsCompleted)
        : undefined;
    const validClients =
      Number.isInteger(Number(satisfiedClients)) &&
      Number(satisfiedClients) >= 0
        ? Number(satisfiedClients)
        : undefined;

    const fields = {
      heroTitle,
      heroSubtitle,
      heroImage,
      section1Title,
      section1Content,
      section1Image,
      section2Title,
      section2Content,
      section2Image,
      section3Title,
      section3Content,
      section3Image,
      history,
      craftSkills,
      yearsExperience: validYears,
      projectsCompleted: validProjects,
      satisfiedClients: validClients,
    };

    // Remove undefined fields so we don't overwrite existing data with null
    const definedFields = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );

    const [content, created] = await MasteryContent.findOrCreate({
      where: { id: 1 },
      defaults: definedFields,
    });
    if (!created) {
      // Clean up old hero image from GridFS when a new one is provided
      if (heroImage && content.heroImage && heroImage !== content.heroImage) {
        try {
          const oldMatch = content.heroImage.match(
            /\/api\/images\/([a-f0-9]{24})$/,
          );
          if (oldMatch) {
            const oldFileId = new mongoose.Types.ObjectId(oldMatch[1]);
            const db = mongoose.connection.db;
            const bucket = new GridFSBucket(db, { bucketName: "images" });
            await bucket.delete(oldFileId);
            logger.info("Deleted old mastery hero image from GridFS", {
              fileId: oldMatch[1],
            });
          }
        } catch (cleanupErr) {
          logger.warn("Failed to delete old mastery hero image", {
            error: cleanupErr.message,
          });
        }
      }
      await content.update(definedFields);
    }

    logSettingsActivity("mastery", "Updated mastery content", req.admin, req, {
      sectionsUpdated: [
        "hero",
        "section1",
        "section2",
        "section3",
        "skills",
        "stats",
      ],
    }).catch(() => {});
    res.json({
      success: true,
      message: "Mastery content updated",
      data: content,
    });
  } catch (error) {
    logger.error("Update mastery content error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to update mastery content" });
  }
});

export default router;
