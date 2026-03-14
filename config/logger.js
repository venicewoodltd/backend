/**
 * Production Logger - Winston configuration
 * Structured JSON logging with daily rotation
 */

import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";

const LOG_DIR = process.env.LOG_DIR || "./logs";
const LOG_LEVEL =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} ${level}: ${message}${metaStr}`;
  }),
);

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
    level: LOG_LEVEL,
  }),
];

// File transports only in production
if (process.env.NODE_ENV === "production") {
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "app-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "30d",
      format: logFormat,
      level: "info",
    }),
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "90d",
      format: logFormat,
      level: "error",
    }),
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "security-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "90d",
      format: logFormat,
      level: "warn",
    }),
  );
}

const logger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: { service: "venicewood-api" },
  transports,
  exitOnError: false,
});

// Security-specific logger
export const securityLogger = winston.createLogger({
  level: "info",
  defaultMeta: { service: "venicewood-security" },
  format: logFormat,
  transports:
    process.env.NODE_ENV === "production"
      ? [
          new DailyRotateFile({
            filename: path.join(LOG_DIR, "security-%DATE%.log"),
            datePattern: "YYYY-MM-DD",
            maxSize: "20m",
            maxFiles: "90d",
          }),
        ]
      : [new winston.transports.Console({ format: consoleFormat })],
});

export default logger;
