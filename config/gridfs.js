/**
 * Production GridFS Configuration
 * MongoDB binary file storage for images
 */

import mongoose from "mongoose";
const { GridFSBucket } = mongoose.mongo;
import logger from "./logger.js";

let gfsBucket = null;

export const initGridFS = () => {
  if (mongoose.connection.readyState === 1) {
    gfsBucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "images",
    });
    logger.info("GridFS bucket initialized");
    return gfsBucket;
  }
  logger.error("Cannot initialize GridFS - MongoDB not connected");
  return null;
};

export const getGridFSBucket = () => {
  if (!gfsBucket) {
    if (mongoose.connection.readyState !== 1) {
      throw new Error("MongoDB connection not ready for GridFS");
    }
    gfsBucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "images",
    });
  }
  return gfsBucket;
};

export default { initGridFS, getGridFSBucket };
