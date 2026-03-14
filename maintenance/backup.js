#!/usr/bin/env node
/**
 * Backup Script — exports PostgreSQL data and MongoDB collections.
 * Usage: node maintenance/backup.js [--output=./backups]
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
import connectMongoDB from "../config/mongodb.js";
import Media from "../models/mongodb/Media.js";
import ActivityLog from "../models/mongodb/ActivityLog.js";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputArg = process.argv.find((a) => a.startsWith("--output="));
const OUTPUT_DIR = outputArg
  ? outputArg.split("=")[1]
  : path.join(__dirname, "../backups");

async function run() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = path.join(OUTPUT_DIR, `backup-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`=== Backup to ${backupDir} ===\n`);

  // PostgreSQL
  await sequelize.sync();
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
    const data = await Model.findAll({ raw: true });
    const file = path.join(backupDir, `pg_${name.toLowerCase()}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`[PG] ${name}: ${data.length} records`);
  }

  // MongoDB
  if (mongoose.connection.readyState !== 1) await connectMongoDB();

  const mediaDocs = await Media.find().lean();
  fs.writeFileSync(
    path.join(backupDir, "mongo_media.json"),
    JSON.stringify(mediaDocs, null, 2),
  );
  console.log(`[Mongo] Media: ${mediaDocs.length} documents`);

  const activityDocs = await ActivityLog.find().lean();
  fs.writeFileSync(
    path.join(backupDir, "mongo_activity.json"),
    JSON.stringify(activityDocs, null, 2),
  );
  console.log(`[Mongo] ActivityLog: ${activityDocs.length} documents`);

  // GridFS file metadata (not binary data)
  const gridfsFiles = await mongoose.connection.db
    .collection("images.files")
    .find()
    .toArray();
  fs.writeFileSync(
    path.join(backupDir, "gridfs_files_meta.json"),
    JSON.stringify(gridfsFiles, null, 2),
  );
  console.log(`[GridFS] File metadata: ${gridfsFiles.length} entries`);

  // Summary
  const totalSize = fs.readdirSync(backupDir).reduce((sum, f) => {
    return sum + fs.statSync(path.join(backupDir, f)).size;
  }, 0);
  console.log(`\nBackup complete: ${(totalSize / 1024).toFixed(1)} KB total`);
  console.log(`Location: ${backupDir}`);

  await sequelize.close().catch(() => {});
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
}

run().catch((err) => {
  console.error("Backup error:", err.message);
  process.exit(1);
});
