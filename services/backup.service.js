/**
 * Backup Service — Create, list, delete, and download backups
 * Supports PostgreSQL data + MongoDB collections + GridFS metadata
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createReadStream, createWriteStream } from "fs";
import archiver from "archiver";
import {
  sequelize,
  Product,
  Project,
  Blog,
  Inquiry,
  Testimonial,
  AdminUser,
  Category,
  MasteryContent,
  MasteryPillar,
  ContactSettings,
} from "../models/postgres/index.js";
import Media from "../models/mongodb/Media.js";
import ActivityLog from "../models/mongodb/ActivityLog.js";
import mongoose from "mongoose";
import logger from "../config/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, "../backups");

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Create a new backup
 * @returns {{ name, timestamp, size, fileCount, details }}
 */
export async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupName = `backup-${timestamp}`;
  const backupDir = path.join(BACKUP_DIR, backupName);
  fs.mkdirSync(backupDir, { recursive: true });

  const details = { postgresql: {}, mongodb: {}, gridfs: {} };

  // PostgreSQL models
  const pgModels = {
    Product,
    Project,
    Blog,
    Inquiry,
    Testimonial,
    AdminUser,
    Category,
    MasteryContent,
    MasteryPillar,
    ContactSettings,
  };

  for (const [name, Model] of Object.entries(pgModels)) {
    try {
      const scope = name === "AdminUser" ? "withPassword" : undefined;
      const data = scope
        ? await Model.scope(scope).findAll({ raw: true })
        : await Model.findAll({ raw: true });
      const file = path.join(backupDir, `pg_${name.toLowerCase()}.json`);
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      details.postgresql[name] = data.length;
    } catch (err) {
      logger.error(`Backup PG ${name} failed`, { error: err.message });
      details.postgresql[name] = `ERROR: ${err.message}`;
    }
  }

  // MongoDB collections
  try {
    const mediaDocs = await Media.find().lean();
    fs.writeFileSync(
      path.join(backupDir, "mongo_media.json"),
      JSON.stringify(mediaDocs, null, 2),
    );
    details.mongodb.media = mediaDocs.length;
  } catch (err) {
    details.mongodb.media = `ERROR: ${err.message}`;
  }

  try {
    const activityDocs = await ActivityLog.find().lean();
    fs.writeFileSync(
      path.join(backupDir, "mongo_activity.json"),
      JSON.stringify(activityDocs, null, 2),
    );
    details.mongodb.activity = activityDocs.length;
  } catch (err) {
    details.mongodb.activity = `ERROR: ${err.message}`;
  }

  // GridFS file metadata
  try {
    const gridfsFiles = await mongoose.connection.db
      .collection("images.files")
      .find()
      .toArray();
    fs.writeFileSync(
      path.join(backupDir, "gridfs_files_meta.json"),
      JSON.stringify(gridfsFiles, null, 2),
    );
    details.gridfs.fileMetadata = gridfsFiles.length;
  } catch (err) {
    details.gridfs.fileMetadata = `ERROR: ${err.message}`;
  }

  // Calculate total size
  const files = fs.readdirSync(backupDir);
  const totalSize = files.reduce((sum, f) => {
    return sum + fs.statSync(path.join(backupDir, f)).size;
  }, 0);

  const manifest = {
    name: backupName,
    timestamp: new Date().toISOString(),
    fileCount: files.length,
    totalSize,
    details,
  };
  fs.writeFileSync(
    path.join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  logger.info(`Backup created: ${backupName}`, {
    size: totalSize,
    files: files.length,
  });

  return manifest;
}

/**
 * List all backups
 * @returns {Array<{ name, timestamp, size, fileCount }>}
 */
export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
  const backups = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("backup-")) continue;

    const dir = path.join(BACKUP_DIR, entry.name);
    const manifestPath = path.join(dir, "manifest.json");

    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        backups.push({
          name: manifest.name,
          timestamp: manifest.timestamp,
          size: manifest.totalSize,
          fileCount: manifest.fileCount,
          details: manifest.details,
        });
      } catch {
        // Backup without valid manifest — estimate from files
        const files = fs.readdirSync(dir);
        const size = files.reduce(
          (s, f) => s + fs.statSync(path.join(dir, f)).size,
          0,
        );
        backups.push({
          name: entry.name,
          timestamp: entry.name.replace("backup-", "").replace(/-/g, ":"),
          size,
          fileCount: files.length,
        });
      }
    } else {
      const files = fs.readdirSync(dir);
      const size = files.reduce(
        (s, f) => s + fs.statSync(path.join(dir, f)).size,
        0,
      );
      backups.push({
        name: entry.name,
        timestamp: null,
        size,
        fileCount: files.length,
      });
    }
  }

  return backups.sort(
    (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0),
  );
}

/**
 * Delete a backup
 * @param {string} backupName
 * @returns {boolean}
 */
export function deleteBackup(backupName) {
  // Validate backup name to prevent path traversal
  if (
    !backupName ||
    !backupName.startsWith("backup-") ||
    backupName.includes("..") ||
    backupName.includes("/") ||
    backupName.includes("\\")
  ) {
    throw new Error("Invalid backup name");
  }

  const dir = path.join(BACKUP_DIR, backupName);
  if (!fs.existsSync(dir)) {
    throw new Error("Backup not found");
  }

  fs.rmSync(dir, { recursive: true, force: true });
  logger.info(`Backup deleted: ${backupName}`);
  return true;
}

/**
 * Create a zip stream for downloading a backup
 * @param {string} backupName
 * @returns {{ stream: ReadableStream, zipName: string }}
 */
export function getBackupZipStream(backupName) {
  // Validate backup name to prevent path traversal
  if (
    !backupName ||
    !backupName.startsWith("backup-") ||
    backupName.includes("..") ||
    backupName.includes("/") ||
    backupName.includes("\\")
  ) {
    throw new Error("Invalid backup name");
  }

  const dir = path.join(BACKUP_DIR, backupName);
  if (!fs.existsSync(dir)) {
    throw new Error("Backup not found");
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.directory(dir, backupName);
  archive.finalize();

  return {
    stream: archive,
    zipName: `${backupName}.zip`,
  };
}

export default {
  createBackup,
  listBackups,
  deleteBackup,
  getBackupZipStream,
};
