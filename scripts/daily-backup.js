#!/usr/bin/env node
/**
 * Daily Backup Scheduler
 * Run with: node scripts/daily-backup.js
 * Or add to cron: 0 2 * * * cd /path/to/backend && node scripts/daily-backup.js
 *
 * Keeps last 7 daily backups by default (configurable via MAX_BACKUPS env var)
 */
import "dotenv/config";
import {
  createBackup,
  listBackups,
  deleteBackup,
} from "../services/backup.service.js";
import { sequelize } from "../models/postgres/index.js";
import connectMongoDB from "../config/mongodb.js";
import { initGridFS } from "../config/gridfs.js";
import mongoose from "mongoose";

const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS, 10) || 7;

async function runDailyBackup() {
  console.log(`[${new Date().toISOString()}] Starting daily backup...`);

  try {
    // Initialize database connections
    await sequelize.authenticate();
    console.log("PostgreSQL connected");

    if (mongoose.connection.readyState !== 1) {
      await connectMongoDB();
    }
    console.log("MongoDB connected");

    initGridFS();

    // Create backup
    const manifest = await createBackup();
    console.log(`Backup created: ${manifest.name}`);
    console.log(`  Files: ${manifest.fileCount}`);
    console.log(`  Size: ${(manifest.totalSize / 1024).toFixed(1)} KB`);

    // Prune old backups (keep last MAX_BACKUPS)
    const backups = listBackups();
    if (backups.length > MAX_BACKUPS) {
      const toDelete = backups.slice(MAX_BACKUPS);
      for (const old of toDelete) {
        try {
          deleteBackup(old.name);
          console.log(`  Pruned old backup: ${old.name}`);
        } catch (err) {
          console.error(`  Failed to prune ${old.name}: ${err.message}`);
        }
      }
    }

    console.log(
      `\nBackup complete. ${Math.min(backups.length, MAX_BACKUPS)} backup(s) retained.`,
    );
  } catch (err) {
    console.error(`Backup failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
    await mongoose.connection.close().catch(() => {});
    process.exit();
  }
}

runDailyBackup();
