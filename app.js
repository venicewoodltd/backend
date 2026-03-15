/**
 * Venice Wood Ltd - Production Express Application
 * Security-hardened configuration with comprehensive middleware stack
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import hpp from "hpp";
import logger from "./config/logger.js";

const app = express();
const isProduction = process.env.NODE_ENV === "production";

// =============================================
// 1. TRUST PROXY (for reverse proxy / load balancer)
// =============================================
if (isProduction) {
  app.set("trust proxy", 1);
}

// =============================================
// 2. COMPRESSION
// =============================================
app.use(
  compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.path.startsWith("/api/images/")) return false;
      return compression.filter(req, res);
    },
  }),
);

// =============================================
// 3. REQUEST LOGGING (Morgan → Winston)
// =============================================
const morganStream = { write: (message) => logger.info(message.trim()) };
app.use(morgan(isProduction ? "combined" : "dev", { stream: morganStream }));

// =============================================
// 4. BODY PARSING with size limits
// =============================================
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// =============================================
// 5. HTTP PARAMETER POLLUTION protection
// =============================================
app.use(hpp());

// =============================================
// 6. CORS - Strict origin whitelist
// =============================================
const allowedOrigins = [
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",").map((u) => u.trim()) : []),
  ...(isProduction
    ? []
    : [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
      ]),
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || (!isProduction && !origin)) {
      callback(null, true);
    } else {
      logger.warn("CORS blocked request", { origin });
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// =============================================
// 7. SECURITY HEADERS (Helmet)
// =============================================
app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: [
              "'self'",
              "data:",
              "blob:",
              ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
            ],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
  }),
);

// =============================================
// 8. IMAGE ROUTE CORS HEADERS
// =============================================
app.use((req, res, next) => {
  if (req.path.startsWith("/api/images")) {
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
  }
  next();
});

// =============================================
// 9. SECURITY HEADERS - Additional
// =============================================
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (isProduction) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }
  next();
});

// =============================================
// 10. HEALTH CHECK ENDPOINT
// =============================================
app.get("/health", async (req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {},
  };

  try {
    const { sequelize } = await import("./models/postgres/index.js");
    await sequelize.authenticate();
    health.checks.postgresql = "connected";
  } catch {
    health.checks.postgresql = "disconnected";
    health.status = "degraded";
  }

  try {
    const mongoose = (await import("mongoose")).default;
    health.checks.mongodb =
      mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    if (health.checks.mongodb !== "connected") health.status = "degraded";
  } catch {
    health.checks.mongodb = "disconnected";
    health.status = "degraded";
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  res.status(statusCode).json(health);
});

// Readiness probe
app.get("/ready", async (req, res) => {
  try {
    const { sequelize } = await import("./models/postgres/index.js");
    await sequelize.authenticate();
    const mongoose = (await import("mongoose")).default;
    if (mongoose.connection.readyState !== 1)
      throw new Error("MongoDB not ready");
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

export default app;
