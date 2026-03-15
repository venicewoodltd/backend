/**
 * Production Admin Users Routes
 */

import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { AdminUser } from "../../models/postgres/index.js";
import { adminAuth, requireAdminRole } from "../../middlewares/adminAuth.js";
import { hashPassword, generateTemporaryPassword } from "../../utils/hash.js";
import { saveImageToGridFS } from "../../services/upload.service.js";
import { getGridFSBucket } from "../../config/gridfs.js";
import { logUserActivity } from "../../services/activityLog.service.js";
import logger from "../../config/logger.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(adminAuth);

// Helper to delete a GridFS file by string ID
async function deleteGridFSPhoto(fileId) {
  if (!fileId) return;
  try {
    const bucket = getGridFSBucket();
    await bucket.delete(new mongoose.Types.ObjectId(fileId));
  } catch (err) {
    logger.warn("Failed to delete GridFS photo", {
      fileId,
      error: err.message,
    });
  }
}

// POST / — Create user (admin only)
router.post("/", requireAdminRole, async (req, res) => {
  try {
    const { name, username, email, password, role, permissions } = req.body;
    if (!name || !username || !email) {
      return res.status(400).json({
        success: false,
        error: "Name, username, and email are required",
      });
    }
    if (!/^[a-z0-9_-]{3,50}$/.test(username.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error:
          "Username must be 3-50 lowercase alphanumeric characters, hyphens, or underscores",
      });
    }

    const existing = await AdminUser.scope("withPassword").findOne({
      where: { username: username.toLowerCase() },
    });
    if (existing)
      return res
        .status(409)
        .json({ success: false, error: "Username already exists" });

    const emailExists = await AdminUser.scope("withPassword").findOne({
      where: { email: email.toLowerCase() },
    });
    if (emailExists)
      return res
        .status(409)
        .json({ success: false, error: "Email already exists" });

    const userPassword = password || generateTemporaryPassword();
    const hashed = await hashPassword(userPassword);

    const user = await AdminUser.create({
      name,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: hashed,
      role: role || "editor",
      permissions: permissions || [],
    });

    const userData = user.toJSON();
    delete userData.password;

    logUserActivity("created", userData, req.admin, req).catch(() => {});
    res.status(201).json({
      success: true,
      user: userData,
      ...(password ? {} : { temporaryPassword: userPassword }),
    });
  } catch (error) {
    logger.error("Create user error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to create user" });
  }
});

// GET / — List users (admin only)
router.get("/", requireAdminRole, async (req, res) => {
  try {
    const users = await AdminUser.findAll({ order: [["createdAt", "DESC"]] });
    res.json({ success: true, users });
  } catch (error) {
    logger.error("List users error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch users" });
  }
});

// GET /profile/me
router.get("/profile/me", async (req, res) => {
  res.json({ success: true, user: req.admin });
});

// PUT /profile/me — Update own profile
router.put("/profile/me", async (req, res) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email.toLowerCase();

    if (newPassword) {
      if (!currentPassword)
        return res
          .status(400)
          .json({ success: false, error: "Current password required" });
      const admin = await AdminUser.scope("withPassword").findByPk(
        req.admin.id,
      );
      const { comparePassword } = await import("../../utils/hash.js");
      const valid = await comparePassword(currentPassword, admin.password);
      if (!valid)
        return res
          .status(401)
          .json({ success: false, error: "Current password is incorrect" });
      updates.password = await hashPassword(newPassword);
    }

    await AdminUser.update(updates, { where: { id: req.admin.id } });
    const updated = await AdminUser.findByPk(req.admin.id);
    res.json({ success: true, user: updated.toJSON() });
  } catch (error) {
    logger.error("Update profile error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to update profile" });
  }
});

// GET /:id (admin only)
router.get("/:id", requireAdminRole, async (req, res) => {
  try {
    const user = await AdminUser.findByPk(req.params.id);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch user" });
  }
});

// PUT /:id (admin only)
router.put("/:id", requireAdminRole, async (req, res) => {
  try {
    const user = await AdminUser.findByPk(req.params.id);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    const { name, email, role, permissions, isActive, photoFileId } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email.toLowerCase();
    if (role !== undefined) updates.role = role;
    if (permissions !== undefined) updates.permissions = permissions;
    if (isActive !== undefined) updates.isActive = isActive;
    if (photoFileId !== undefined) updates.photoFileId = photoFileId;

    await user.update(updates);
    logUserActivity("updated", user.toJSON(), req.admin, req).catch(() => {});
    res.json({ success: true, user: user.toJSON() });
  } catch (error) {
    logger.error("Update user error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to update user" });
  }
});

// POST /:id/reset-password (admin only)
router.post("/:id/reset-password", requireAdminRole, async (req, res) => {
  try {
    const user = await AdminUser.findByPk(req.params.id);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    const newPassword = req.body.newPassword || generateTemporaryPassword();
    const hashed = await hashPassword(newPassword);
    await user.update({ password: hashed });

    logUserActivity("password_changed", user.toJSON(), req.admin, req).catch(
      () => {},
    );
    res.json({ success: true, temporaryPassword: newPassword });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to reset password" });
  }
});

// POST /photo — Upload profile photo
router.post(
  "/photo",
  (req, res, next) => {
    upload.single("photo")(req, res, (err) => {
      if (err) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? "File too large. Max 10MB."
            : err.message || "File upload error";
        return res.status(400).json({ success: false, error: message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, error: "No photo provided" });
      // Determine target user: allow admins to upload for other users
      const targetUserId = req.query.userId || req.admin.id;
      if (targetUserId !== req.admin.id && req.admin.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Not authorized to update this user's photo",
        });
      }
      // Delete old photo from GridFS if it exists
      const targetUser = await AdminUser.findByPk(targetUserId);
      if (!targetUser)
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      if (targetUser.photoFileId) {
        await deleteGridFSPhoto(targetUser.photoFileId);
      }
      const gridFile = await saveImageToGridFS(req.file.buffer, {
        filename: `profile-${targetUserId}-${Date.now()}`,
        contentType: req.file.mimetype,
      });
      await AdminUser.update(
        { photoFileId: gridFile._id.toString() },
        { where: { id: targetUserId } },
      );
      res.json({ success: true, photoFileId: gridFile._id.toString() });
    } catch (error) {
      logger.error("Photo upload error", {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: "Failed to upload photo",
      });
    }
  },
);

// DELETE /photo
router.delete("/photo", async (req, res) => {
  try {
    const targetUserId = req.query.userId || req.admin.id;
    if (targetUserId !== req.admin.id && req.admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Not authorized to remove this user's photo",
      });
    }
    const targetUser = await AdminUser.findByPk(targetUserId);
    if (!targetUser)
      return res.status(404).json({ success: false, error: "User not found" });
    if (targetUser.photoFileId) {
      await deleteGridFSPhoto(targetUser.photoFileId);
    }
    await AdminUser.update(
      { photoFileId: null },
      { where: { id: targetUserId } },
    );
    res.json({ success: true, message: "Photo removed" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to remove photo" });
  }
});

// DELETE /:id (admin only)
router.delete("/:id", requireAdminRole, async (req, res) => {
  try {
    if (req.params.id === req.admin.id)
      return res
        .status(400)
        .json({ success: false, error: "Cannot delete your own account" });
    const user = await AdminUser.findByPk(req.params.id);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });
    // Delete profile photo from GridFS before destroying user
    if (user.photoFileId) {
      await deleteGridFSPhoto(user.photoFileId);
    }
    await user.destroy();
    logUserActivity(
      "deleted",
      { id: user.id, username: user.username },
      req.admin,
      req,
    ).catch(() => {});
    res.json({ success: true, message: "User deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete user" });
  }
});

export default router;
