/**
 * Production Admin Auth Routes
 * Login with account lockout, refresh token rotation, change password, logout
 */

import express from "express";
import { AdminUser } from "../../models/postgres/index.js";
import {
  comparePassword,
  generateToken,
  generateRefreshToken,
  verifyToken,
} from "../../services/auth.service.js";
import { adminAuth } from "../../middlewares/adminAuth.js";
import { loginLimiter, strictLimiter } from "../../middlewares/rateLimiter.js";
import { logUserActivity } from "../../services/activityLog.service.js";
import logger, { securityLogger } from "../../config/logger.js";

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// POST /api/admin/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, error: "Username and password are required" });
    }

    const admin = await AdminUser.scope("withPassword").findOne({
      where: { username: username.toLowerCase().trim() },
    });

    if (!admin) {
      securityLogger.warn("Login failed - user not found", {
        username,
        ip: req.ip,
      });
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }

    // Account lockout check
    if (admin.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
      const remainingMs = new Date(admin.lockedUntil) - new Date();
      const remainingMin = Math.ceil(remainingMs / 60000);
      securityLogger.warn("Login attempt on locked account", {
        username,
        ip: req.ip,
        lockedUntil: admin.lockedUntil,
      });
      return res.status(423).json({
        success: false,
        error: `Account locked. Try again in ${remainingMin} minute(s).`,
      });
    }

    if (!admin.isActive) {
      securityLogger.warn("Login failed - inactive account", {
        username,
        ip: req.ip,
      });
      return res
        .status(401)
        .json({ success: false, error: "Account is deactivated" });
    }

    const isValid = await comparePassword(password, admin.password);
    if (!isValid) {
      // Increment failed attempts
      const attempts = (admin.failedLoginAttempts || 0) + 1;
      const updates = { failedLoginAttempts: attempts };
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        securityLogger.warn("Account locked due to failed attempts", {
          username,
          ip: req.ip,
          attempts,
        });
      }
      await AdminUser.update(updates, { where: { id: admin.id } });

      securityLogger.warn("Login failed - wrong password", {
        username,
        ip: req.ip,
        attempts,
      });
      return res.status(401).json({
        success: false,
        error:
          attempts >= MAX_FAILED_ATTEMPTS
            ? "Account locked due to too many failed attempts. Try again in 30 minutes."
            : "Invalid credentials",
      });
    }

    // Successful login — reset failed attempts
    const token = generateToken(admin.id, admin.email, admin.role);
    const refreshToken = generateRefreshToken(admin.id);

    await AdminUser.update(
      {
        lastLogin: new Date(),
        isOnline: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        refreshToken,
      },
      { where: { id: admin.id } },
    );

    const adminData = admin.toJSON();
    delete adminData.password;

    logUserActivity("login", adminData, adminData, req).catch(() => {});

    logger.info("Admin login", { userId: admin.id, username: admin.username });

    res.json({
      success: true,
      token,
      refreshToken,
      admin: adminData,
    });
  } catch (error) {
    logger.error("Login error", { error: error.message });
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

// POST /api/admin/auth/refresh — Rotate refresh token for a new access token
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res
        .status(400)
        .json({ success: false, error: "Refresh token required" });
    }

    const decoded = verifyToken(refreshToken);
    if (!decoded || decoded.type !== "refresh") {
      return res
        .status(401)
        .json({ success: false, error: "Invalid refresh token" });
    }

    const admin = await AdminUser.findByPk(decoded.id);
    if (!admin || !admin.isActive) {
      return res
        .status(401)
        .json({ success: false, error: "User not found or inactive" });
    }

    // Verify the refresh token matches what's stored (rotation check)
    if (admin.refreshToken !== refreshToken) {
      // Possible token reuse — revoke all tokens
      await AdminUser.update(
        { refreshToken: null, isOnline: false },
        { where: { id: admin.id } },
      );
      securityLogger.warn("Refresh token reuse detected — tokens revoked", {
        userId: admin.id,
        ip: req.ip,
      });
      return res
        .status(401)
        .json({ success: false, error: "Token reuse detected. Please login again." });
    }

    // Issue new token pair
    const newAccessToken = generateToken(admin.id, admin.email, admin.role);
    const newRefreshToken = generateRefreshToken(admin.id);

    await AdminUser.update(
      { refreshToken: newRefreshToken },
      { where: { id: admin.id } },
    );

    res.json({
      success: true,
      token: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    logger.error("Token refresh error", { error: error.message });
    res.status(401).json({ success: false, error: "Token refresh failed" });
  }
});

// POST /api/admin/auth/change-password
router.post("/change-password", adminAuth, strictLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ success: false, error: "Both passwords required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 8 characters",
      });
    }

    const admin = await AdminUser.scope("withPassword").findByPk(req.admin.id);
    const isValid = await comparePassword(currentPassword, admin.password);
    if (!isValid) {
      return res
        .status(401)
        .json({ success: false, error: "Current password is incorrect" });
    }

    const { hashPassword } = await import("../../utils/hash.js");
    const hashed = await hashPassword(newPassword);
    // Invalidate refresh token on password change
    await AdminUser.update(
      { password: hashed, refreshToken: null },
      { where: { id: admin.id } },
    );

    logUserActivity("password_changed", admin, req.admin, req).catch(() => {});

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    logger.error("Password change error", { error: error.message });
    res.status(500).json({ success: false, error: "Password change failed" });
  }
});

// POST /api/admin/auth/logout
router.post("/logout", adminAuth, async (req, res) => {
  try {
    await AdminUser.update(
      { isOnline: false, refreshToken: null },
      { where: { id: req.admin.id } },
    );
    logUserActivity("logout", req.admin, req.admin, req).catch(() => {});
    res.json({ success: true, message: "Logged out" });
  } catch {
    res.json({ success: true, message: "Logged out" });
  }
});

// GET /api/admin/auth/profile
router.get("/profile", adminAuth, async (req, res) => {
  res.json({ success: true, admin: req.admin });
});

export default router;
