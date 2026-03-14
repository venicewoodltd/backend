/**
 * Production Public Inquiries Routes
 */

import express from "express";
import { Inquiry } from "../../models/postgres/index.js";
import { sendInquiryNotification } from "../../services/email.service.js";
import { logInquiryActivity } from "../../services/activityLog.service.js";
import { sanitizeString } from "../../utils/validators.js";
import { apiLimiter } from "../../middlewares/rateLimiter.js";
import logger from "../../config/logger.js";

const router = express.Router();

// POST / — Submit inquiry (rate limited)
router.post("/", apiLimiter, async (req, res) => {
  try {
    const { name, email, phone, projectType, budget, timeline, message } =
      req.body;

    if (!name || !email || !message) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Name, email, and message are required",
        });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid email address" });
    }

    if (message.trim().length < 10) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Message must be at least 10 characters",
        });
    }

    const validProjectTypes = [
      "furniture",
      "architectural",
      "interiors",
      "restoration",
      "marine",
      "other",
    ];
    const validBudgets = ["5000-10000", "10000-25000", "25000-50000", "50000+"];
    const validTimelines = ["urgent", "standard", "flexible", "custom"];

    const inquiry = await Inquiry.create({
      name: sanitizeString(name.trim()),
      email: email.trim().toLowerCase(),
      phone: phone ? sanitizeString(phone.trim()) : null,
      projectType: projectType
        ? sanitizeString(projectType.trim())
        : "other",
      budget: validBudgets.includes(budget) ? budget : null,
      timeline: validTimelines.includes(timeline) ? timeline : null,
      message: sanitizeString(message.trim()),
      status: "new",
    });

    // Send email notification (non-blocking)
    sendInquiryNotification(inquiry).catch((err) =>
      logger.warn("Inquiry email failed", { error: err.message }),
    );
    logInquiryActivity(
      "created",
      { id: inquiry.id, name: inquiry.name, projectType: inquiry.projectType },
      null,
      req,
    ).catch(() => {});

    res
      .status(201)
      .json({ success: true, message: "Inquiry submitted successfully" });
  } catch (error) {
    logger.error("Submit inquiry error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to submit inquiry" });
  }
});

export default router;
