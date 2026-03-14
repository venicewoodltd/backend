/**
 * Production Error Handler Middleware
 * Structured error responses — no stack traces in production
 */

import logger from "../config/logger.js";

export const errorHandler = (err, req, res, _next) => {
  const isProduction = process.env.NODE_ENV === "production";

  // Log full error server-side
  logger.error("Request error", {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    statusCode: err.statusCode,
  });

  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let details = {};

  // Map specific error types
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation Error";
    details = err.errors || {};
  } else if (err.name === "UnauthorizedError") {
    statusCode = 401;
    message = "Unauthorized";
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid ID format";
  } else if (err.code === 11000) {
    statusCode = 409;
    message = "Duplicate field value";
    const field = err.keyPattern ? Object.keys(err.keyPattern)[0] : "unknown";
    details.field = field;
  } else if (err.name === "SequelizeValidationError") {
    statusCode = 400;
    message = "Validation Error";
    details =
      err.errors?.map((e) => ({ field: e.path, message: e.message })) || [];
  } else if (err.name === "SequelizeUniqueConstraintError") {
    statusCode = 409;
    message = "Duplicate entry";
    details =
      err.errors?.map((e) => ({ field: e.path, message: e.message })) || [];
  }

  // In production, never expose internal error details for 500s
  if (isProduction && statusCode === 500) {
    message = "Internal Server Error";
    details = {};
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(Object.keys(details).length > 0 && { details }),
    ...(!isProduction && { stack: err.stack }),
  });
};

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default errorHandler;
