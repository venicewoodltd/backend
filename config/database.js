/**
 * Production Database Configuration
 * PostgreSQL (Sequelize) + MongoDB (Mongoose) with connection pooling
 */

import mongoose from "mongoose";
import { Sequelize } from "sequelize";
import logger from "./logger.js";

export const createSequelizeInstance = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const dbHost = process.env.DB_HOST || "localhost";

  return new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: dbHost,
      port: parseInt(process.env.DB_PORT) || 5432,
      dialect: "postgres",
      logging: isProduction ? false : (msg) => logger.debug(msg),
      pool: {
        max: parseInt(process.env.DB_POOL_MAX) || 20,
        min: parseInt(process.env.DB_POOL_MIN) || 5,
        acquire: 30000,
        idle: 10000,
        evict: 1000,
      },
      dialectOptions: {
        ssl:
          dbHost !== "localhost" && dbHost !== "127.0.0.1"
            ? {
                require: true,
                rejectUnauthorized:
                  process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
              }
            : false,
        statement_timeout: 30000,
        idle_in_transaction_session_timeout: 60000,
      },
      retry: {
        max: 3,
      },
    },
  );
};

export const connectMongoDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI environment variable is not set");
  }
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    throw new Error("MONGO_URI must start with mongodb:// or mongodb+srv://");
  }

  logger.info("Connecting to MongoDB...");

  await mongoose.connect(uri, {
    maxPoolSize: parseInt(process.env.MONGO_POOL_MAX) || 20,
    minPoolSize: parseInt(process.env.MONGO_POOL_MIN) || 5,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    retryReads: true,
  });

  mongoose.connection.on("error", (err) => {
    logger.error("MongoDB connection error", { error: err.message });
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    logger.info("MongoDB reconnected");
  });

  logger.info("MongoDB connected");
};

export const connectPostgres = async (sequelize) => {
  await sequelize.authenticate();
  logger.info("PostgreSQL connected");
};

export { mongoose };

export default {
  createSequelizeInstance,
  connectMongoDB,
  connectPostgres,
  mongoose,
};
