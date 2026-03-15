import "dotenv/config";
import jwt from "jsonwebtoken";
import app from "./app.js";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { typeDefs, resolvers } from "./graphql/schema.js";
import { sequelize, AdminUser } from "./models/postgres/index.js";
import connectMongoDB from "./config/mongodb.js";
import { initGridFS } from "./config/gridfs.js";
import logger, { securityLogger } from "./config/logger.js";
import mongoose from "mongoose";

// Route imports
import imageStreamRoutes from "./routes/imageStream.js";
import imageRoutes from "./routes/images.js";
import publicProductRoutes from "./routes/public/products.js";
import publicProjectRoutes from "./routes/public/projects.js";
import publicBlogRoutes from "./routes/public/blogs.js";
import publicInquiryRoutes from "./routes/public/inquiries.js";
import publicTestimonialRoutes from "./routes/public/testimonials.js";
import publicCategoryRoutes from "./routes/public/categories.js";
import publicLegalPagesRoutes from "./routes/public/legalPages.js";
import publicTrackVisitRoutes from "./routes/public/trackVisit.js";
import adminAuthRoutes from "./routes/admin/auth.js";
import adminUserRoutes from "./routes/admin/users.js";
import adminProductRoutes from "./routes/admin/products.js";
import adminProjectRoutes from "./routes/admin/projects.js";
import adminBlogRoutes from "./routes/admin/blogs.js";
import adminInquiryRoutes from "./routes/admin/inquiries.js";
import adminTestimonialRoutes from "./routes/admin/testimonials.js";
import adminHeroSettingsRoutes from "./routes/admin/heroSettings.js";
import adminContactSettingsRoutes from "./routes/admin/contactSettings.js";
import adminMasteryContentRoutes from "./routes/admin/masteryContent.js";
import adminMasteryPillarsRoutes from "./routes/admin/masteryPillars.js";
import adminCategoryRoutes from "./routes/admin/categories.js";
import adminGalleryRoutes from "./routes/admin/gallery.js";
import adminActivityRoutes from "./routes/admin/activity.js";
import adminLegalPagesRoutes from "./routes/admin/legalPages.js";
import adminAnalyticsRoutes from "./routes/admin/analytics.js";
import adminBackupRoutes from "./routes/admin/backups.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import {
  apiLimiter,
  adminLimiter,
  graphqlLimiter,
  formLimiter,
  uploadLimiter,
} from "./middlewares/rateLimiter.js";
import { cacheList } from "./middlewares/cacheHeaders.js";

/* ───── Environment Validation ───── */
const required = [
  "JWT_SECRET",
  "MONGO_URI",
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
];
const missing = required.filter((v) => !process.env[v]);
if (missing.length) {
  logger.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

if (
  process.env.NODE_ENV === "production" &&
  process.env.JWT_SECRET.length < 32
) {
  logger.error("JWT_SECRET must be at least 32 characters in production");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT, 10) || 4000;

/* ───── Startup ───── */
async function startServer() {
  try {
    // PostgreSQL
    await sequelize.sync({ alter: true });
    logger.info("PostgreSQL connected and synced");

    // MongoDB
    await connectMongoDB();
    logger.info("MongoDB connected");

    // GridFS
    initGridFS();
    logger.info("GridFS initialised");

    /* ── Image routes (before body-parser on some paths) ── */
    app.use("/api/images", uploadLimiter, imageStreamRoutes);
    app.use("/api/images", uploadLimiter, imageRoutes);

    /* ── Public routes ── */
    app.use("/api/products", apiLimiter, cacheList(60), publicProductRoutes);
    app.use("/api/projects", apiLimiter, cacheList(60), publicProjectRoutes);
    app.use("/api/blogs", apiLimiter, cacheList(60), publicBlogRoutes);
    app.use("/api/inquiries", formLimiter, publicInquiryRoutes);
    app.use(
      "/api/testimonials",
      apiLimiter,
      cacheList(120),
      publicTestimonialRoutes,
    );
    app.use(
      "/api/categories",
      apiLimiter,
      cacheList(300),
      publicCategoryRoutes,
    );
    app.use("/api/legal", apiLimiter, cacheList(300), publicLegalPagesRoutes);
    app.use("/api/track-visit", apiLimiter, publicTrackVisitRoutes);

    /* ── Admin routes ── */
    app.use("/api/admin/auth", adminLimiter, adminAuthRoutes);
    app.use("/api/admin/users", adminLimiter, adminUserRoutes);
    app.use("/api/admin/products", adminLimiter, adminProductRoutes);
    app.use("/api/admin/projects", adminLimiter, adminProjectRoutes);
    app.use("/api/admin/blogs", adminLimiter, adminBlogRoutes);
    app.use("/api/admin/inquiries", adminLimiter, adminInquiryRoutes);
    app.use("/api/admin/testimonials", adminLimiter, adminTestimonialRoutes);
    app.use("/api/admin/hero", adminLimiter, adminHeroSettingsRoutes);
    app.use("/api/admin/contact", adminLimiter, adminContactSettingsRoutes);
    app.use("/api/admin/mastery", adminLimiter, adminMasteryContentRoutes);
    app.use(
      "/api/admin/mastery-pillars",
      adminLimiter,
      adminMasteryPillarsRoutes,
    );
    app.use("/api/admin/categories", adminLimiter, adminCategoryRoutes);
    app.use("/api/admin/gallery", adminLimiter, adminGalleryRoutes);
    app.use("/api/admin/activity", adminLimiter, adminActivityRoutes);
    app.use("/api/admin/legal", adminLimiter, adminLegalPagesRoutes);
    app.use("/api/admin/analytics", adminLimiter, adminAnalyticsRoutes);
    app.use("/api/admin/backups", adminLimiter, adminBackupRoutes);

    /* ── Apollo GraphQL ── */
    const apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      introspection: process.env.NODE_ENV !== "production",
      formatError: (formatted, error) => {
        logger.error(`GraphQL error: ${formatted.message}`);
        if (process.env.NODE_ENV === "production") {
          return {
            message: formatted.message,
            locations: formatted.locations,
            path: formatted.path,
          };
        }
        return formatted;
      },
    });

    await apolloServer.start();
    logger.info("Apollo Server started");

    app.use(
      "/graphql",
      graphqlLimiter,
      expressMiddleware(apolloServer, {
        context: async ({ req }) => {
          let user = null;
          const token = req.headers.authorization?.split(" ")[1];
          if (token) {
            try {
              const decoded = jwt.verify(token, process.env.JWT_SECRET);
              user = await AdminUser.findByPk(decoded.id);
              if (user && !user.isActive) user = null;
            } catch {
              // invalid / expired token — user stays null
            }
          }
          return { user };
        },
      }),
    );

    /* ── 404 handler ── */
    app.use((_req, res) => {
      res.status(404).json({ success: false, message: "Not Found" });
    });

    /* ── Error handler ── */
    app.use(errorHandler);

    /* ── Listen ── */
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`GraphQL endpoint: /graphql`);
      logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
    });

    server.keepAliveTimeout = 65_000;
    server.headersTimeout = 66_000;

    /* ── Graceful shutdown ── */
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);

      server.close(async () => {
        try {
          await sequelize.close();
          logger.info("PostgreSQL connection closed");
        } catch {
          /* already closed */
        }
        try {
          await mongoose.connection.close();
          logger.info("MongoDB connection closed");
        } catch {
          /* already closed */
        }
        process.exit(0);
      });

      // Force exit after 15 s
      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, 15_000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled Rejection:", reason);
    });

    process.on("uncaughtException", (error) => {
      logger.error("Uncaught Exception:", error);
      shutdown("uncaughtException");
    });
  } catch (error) {
    logger.error(`Server startup failed: ${error.message}`);
    process.exit(1);
  }
}

startServer();
