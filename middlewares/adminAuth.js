/**
 * Production Admin Authentication Middleware
 * JWT verification with active user check
 */

import jwt from "jsonwebtoken";
import { AdminUser } from "../models/postgres/index.js";
import logger, { securityLogger } from "../config/logger.js";

export async function adminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, error: "No authentication token provided" });
    }

    const token = authHeader.slice(7);
    if (!token || token === "undefined" || token === "null") {
      return res
        .status(401)
        .json({ success: false, error: "Invalid token format" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await AdminUser.scope("withPassword").findByPk(decoded.id);
    if (!admin || !admin.isActive) {
      securityLogger.warn("Auth attempt by inactive/missing user", {
        userId: decoded.id,
        ip: req.ip,
      });
      return res
        .status(401)
        .json({ success: false, error: "Admin user not found or inactive" });
    }

    const adminData = admin.toJSON();
    delete adminData.password;
    req.admin = adminData;

    // Fire-and-forget activity update
    AdminUser.update(
      { lastActivity: new Date(), isOnline: true },
      { where: { id: admin.id } },
    ).catch(() => {});

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, error: "Token expired" });
    }
    if (error.name === "JsonWebTokenError") {
      securityLogger.warn("Invalid JWT attempt", {
        ip: req.ip,
        error: error.message,
      });
      return res.status(401).json({ success: false, error: "Invalid token" });
    }
    logger.error("Auth middleware error", { error: error.message });
    res.status(401).json({ success: false, error: "Authentication failed" });
  }
}

export function requireAdminRole(req, res, next) {
  if (req.admin?.role !== "admin") {
    securityLogger.warn("Unauthorized admin role access attempt", {
      userId: req.admin?.id,
      role: req.admin?.role,
      path: req.path,
    });
    return res
      .status(403)
      .json({ success: false, error: "Admin access required" });
  }
  next();
}

export function requirePermission(...modules) {
  return (req, res, next) => {
    if (req.admin?.role === "admin") return next();

    if (req.admin?.role === "editor") {
      const hasPermission = modules.some((mod) =>
        req.admin.permissions?.includes(mod),
      );
      if (!hasPermission) {
        securityLogger.warn("Permission denied", {
          userId: req.admin?.id,
          required: modules,
          has: req.admin?.permissions,
        });
        return res.status(403).json({
          success: false,
          error: `You don't have permission to access ${modules.join(", ")}`,
        });
      }
      return next();
    }

    res.status(401).json({ success: false, error: "Authentication required" });
  };
}

export default adminAuth;
