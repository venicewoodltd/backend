/**
 * Production Admin Contact Settings Routes
 */

import express from "express";
import { adminAuth, requireAdminRole } from "../../middlewares/adminAuth.js";
import { ContactSettings } from "../../models/postgres/index.js";
import { logSettingsActivity } from "../../services/activityLog.service.js";
import logger from "../../config/logger.js";

const router = express.Router();

const defaultSettings = {
  studioLocation: "Bel Air Riviere Seche, Mauritius",
  email: "info@venicewoodltd.com",
  phone: "+230 5712 3456",
  responseTime: "We typically respond within 24 hours.",
  facebookUrl: "",
  whatsappNumber: "+23057123456",
  instagramUrl: "",
  footerText:
    "Premium bespoke woodwork and custom carpentry in Mauritius. Excellence in every detail.",
  faqs: [],
};

// GET / — Admin get contact settings
router.get("/", adminAuth, requireAdminRole, async (req, res) => {
  try {
    const settings =
      (await ContactSettings.findOne({ where: { id: 1 } })) || defaultSettings;
    res.json({ success: true, data: settings });
  } catch (error) {
    logger.error("Fetch contact settings error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch contact settings" });
  }
});

// GET /public — Public access (no auth)
router.get("/public", async (req, res) => {
  try {
    const settings =
      (await ContactSettings.findOne({ where: { id: 1 } })) || defaultSettings;
    res.json({ success: true, data: settings });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch contact settings" });
  }
});

// PUT / — Update contact settings
router.put("/", adminAuth, requireAdminRole, async (req, res) => {
  try {
    const {
      studioLocation,
      email,
      phone,
      responseTime,
      facebookUrl,
      whatsappNumber,
      instagramUrl,
      footerText,
      faqs,
    } = req.body;
    if (!studioLocation || !email || !phone || !responseTime) {
      return res.status(400).json({
        success: false,
        error: "Studio location, email, phone, and response time are required",
      });
    }

    const [settings, created] = await ContactSettings.findOrCreate({
      where: { id: 1 },
      defaults: {
        studioLocation,
        email,
        phone,
        responseTime,
        facebookUrl: facebookUrl || "",
        whatsappNumber: whatsappNumber || "+23057123456",
        instagramUrl: instagramUrl || "",
        footerText:
          footerText ||
          "Premium bespoke woodwork and custom carpentry in Mauritius. Excellence in every detail.",
        faqs: Array.isArray(faqs) ? faqs : [],
      },
    });

    if (!created) {
      const updates = {
        studioLocation,
        email,
        phone,
        responseTime,
        facebookUrl: facebookUrl || "",
        whatsappNumber: whatsappNumber || settings.whatsappNumber,
        instagramUrl: instagramUrl || "",
      };
      if (footerText !== undefined) updates.footerText = footerText;
      if (faqs !== undefined) updates.faqs = Array.isArray(faqs) ? faqs : [];
      await settings.update(updates);
    }

    logSettingsActivity(
      "contact",
      "Updated contact information settings",
      req.admin,
      req,
      { email, phone, location: studioLocation },
    ).catch(() => {});
    res.json({
      success: true,
      message: "Contact settings updated",
      data: settings,
    });
  } catch (error) {
    logger.error("Update contact settings error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to update contact settings" });
  }
});

export default router;
