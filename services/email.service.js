/**
 * Production Email Service
 * Nodemailer integration
 */

import nodemailer from "nodemailer";
import logger from "../config/logger.js";

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (process.env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      logger.warn("SMTP not configured — emails will be logged only");
    }
  }
  return transporter;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendEmail(to, subject, html) {
  const transport = getTransporter();
  if (!transport) {
    logger.info("Email (not sent - no SMTP)", { to, subject });
    return false;
  }

  try {
    await transport.sendMail({
      from:
        process.env.EMAIL_FROM || "Venice Wood Ltd <noreply@venicewoodltd.com>",
      to,
      subject,
      html,
    });
    logger.info("Email sent", { to, subject });
    return true;
  } catch (err) {
    logger.error("Email send failed", { to, subject, error: err.message });
    return false;
  }
}

export async function sendInquiryNotification(inquiry) {
  const subject = `New Inquiry from ${escapeHtml(inquiry.name)}`;
  const html = `
    <h2>New Project Inquiry</h2>
    <p><strong>Name:</strong> ${escapeHtml(inquiry.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(inquiry.email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(inquiry.phone || "N/A")}</p>
    <p><strong>Type:</strong> ${escapeHtml(inquiry.projectType)}</p>
    <p><strong>Budget:</strong> ${escapeHtml(inquiry.budget || "N/A")}</p>
    <p><strong>Timeline:</strong> ${escapeHtml(inquiry.timeline || "N/A")}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(inquiry.message)}</p>
  `;
  return sendEmail(
    process.env.SMTP_USER || "admin@venicewoodltd.com",
    subject,
    html,
  );
}

export default { sendEmail, sendInquiryNotification };
