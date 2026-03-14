/**
 * Production Rate Limiting
 * Configurable via environment variables
 */

import rateLimit from "express-rate-limit";
import logger from "../config/logger.js";

const isProduction = process.env.NODE_ENV === "production";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 5 : 10000,
  message: {
    success: false,
    message: "Too many login attempts, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn("Login rate limit exceeded", { ip: req.ip });
    res.status(429).json(options.message);
  },
});

export const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX) || 50,
  message: {
    success: false,
    message: "Too many uploads, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for sensitive operations
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: "Too many attempts, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin routes limiter (authenticated routes)
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 200 : 10000,
  message: {
    success: false,
    message: "Too many admin requests, please slow down",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// GraphQL limiter
export const graphqlLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 60 : 10000,
  message: {
    success: false,
    message: "Too many GraphQL requests, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public form submission limiter (inquiries, contact)
export const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 10 : 10000,
  message: {
    success: false,
    message: "Too many submissions, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn("Form rate limit exceeded", { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
});

export default {
  loginLimiter,
  apiLimiter,
  uploadLimiter,
  strictLimiter,
  adminLimiter,
  graphqlLimiter,
  formLimiter,
};
