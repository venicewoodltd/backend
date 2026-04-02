#!/usr/bin/env node
/**
 * Cron Scheduler for Venice Wood Ltd Backend
 *
 * Runs as a long-lived process alongside the server.
 * - Daily at 2:00 AM: Full database backup
 * - Weekly on Sunday at 3:00 AM: Full system maintenance check
 *
 * Usage:
 *   node scripts/cron-scheduler.js
 *
 * For production, run with PM2:
 *   pm2 start scripts/cron-scheduler.js --name "vw-cron"
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

let dbConnected = false;

async function ensureConnections() {
  if (dbConnected) return;
  try {
    await sequelize.authenticate();
    console.log("[CRON] PostgreSQL connected");

    if (mongoose.connection.readyState !== 1) {
      await connectMongoDB();
    }
    console.log("[CRON] MongoDB connected");

    initGridFS();
    dbConnected = true;
  } catch (err) {
    console.error("[CRON] Database connection failed:", err.message);
    dbConnected = false;
    throw err;
  }
}

async function runBackup() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] Starting daily backup...`);

  try {
    await ensureConnections();

    const manifest = await createBackup();
    console.log(`[BACKUP] Created: ${manifest.name}`);
    console.log(`[BACKUP] Files: ${manifest.fileCount}`);
    console.log(`[BACKUP] Size: ${(manifest.totalSize / 1024).toFixed(1)} KB`);

    // Prune old backups
    const backups = listBackups();
    if (backups.length > MAX_BACKUPS) {
      const toDelete = backups.slice(MAX_BACKUPS);
      for (const old of toDelete) {
        try {
          deleteBackup(old.name);
          console.log(`[BACKUP] Pruned: ${old.name}`);
        } catch (err) {
          console.error(`[BACKUP] Prune failed ${old.name}: ${err.message}`);
        }
      }
    }

    console.log(
      `[BACKUP] Complete. ${Math.min(backups.length, MAX_BACKUPS)} backup(s) retained.`,
    );
  } catch (err) {
    console.error(`[BACKUP] Failed: ${err.message}`);
  }
}

async function runWeeklyMaintenance() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] Starting weekly maintenance...`);

  try {
    await ensureConnections();

    // Run backup first
    await runBackup();

    // Check PostgreSQL connection health
    try {
      await sequelize.authenticate();
      console.log("[MAINTENANCE] PostgreSQL: healthy");
    } catch (err) {
      console.error("[MAINTENANCE] PostgreSQL: unhealthy -", err.message);
    }

    // Check MongoDB connection health
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db.admin().ping();
        console.log("[MAINTENANCE] MongoDB: healthy");
      } else {
        console.error("[MAINTENANCE] MongoDB: disconnected");
      }
    } catch (err) {
      console.error("[MAINTENANCE] MongoDB: unhealthy -", err.message);
    }

    // Log disk usage of backups folder
    try {
      const backups = listBackups();
      const totalSize = backups.reduce((sum, b) => sum + (b.size || 0), 0);
      console.log(
        `[MAINTENANCE] Backups: ${backups.length} files, ${(totalSize / 1024 / 1024).toFixed(2)} MB total`,
      );
    } catch (err) {
      console.error("[MAINTENANCE] Backup listing failed:", err.message);
    }

    console.log("[MAINTENANCE] Weekly maintenance complete.");
  } catch (err) {
    console.error(`[MAINTENANCE] Failed: ${err.message}`);
  }
}

// ── Scheduler ───────────────────────────────────────────────────────────
function getMillisUntil(targetHour, targetMinute, targetDay = null) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(targetHour, targetMinute, 0, 0);

  if (targetDay !== null) {
    // targetDay: 0 = Sunday, 1 = Monday, ...
    const daysUntil = (targetDay - now.getDay() + 7) % 7;
    target.setDate(
      target.getDate() + (daysUntil === 0 && now >= target ? 7 : daysUntil),
    );
  } else {
    // Daily: if target time already passed today, schedule for tomorrow
    if (now >= target) {
      target.setDate(target.getDate() + 1);
    }
  }

  return target.getTime() - now.getTime();
}

function scheduleDailyBackup() {
  const ms = getMillisUntil(2, 0); // 2:00 AM daily
  const nextRun = new Date(Date.now() + ms);
  console.log(`[SCHEDULER] Next daily backup: ${nextRun.toLocaleString()}`);

  setTimeout(async () => {
    await runBackup();
    // Reschedule for next day (24h)
    setInterval(runBackup, 24 * 60 * 60 * 1000);
  }, ms);
}

function scheduleWeeklyMaintenance() {
  const ms = getMillisUntil(3, 0, 0); // 3:00 AM Sunday
  const nextRun = new Date(Date.now() + ms);
  console.log(
    `[SCHEDULER] Next weekly maintenance: ${nextRun.toLocaleString()}`,
  );

  setTimeout(async () => {
    await runWeeklyMaintenance();
    // Reschedule weekly (7 days)
    setInterval(runWeeklyMaintenance, 7 * 24 * 60 * 60 * 1000);
  }, ms);
}

// ── Main ────────────────────────────────────────────────────────────────
console.log("╔══════════════════════════════════════════╗");
console.log("║  Venice Wood Ltd — Cron Scheduler        ║");
console.log("║  Daily backup: 2:00 AM                   ║");
console.log("║  Weekly maintenance: Sunday 3:00 AM      ║");
console.log("╚══════════════════════════════════════════╝");
console.log(`[SCHEDULER] Started at ${new Date().toLocaleString()}`);

scheduleDailyBackup();
scheduleWeeklyMaintenance();

// Keep process alive
process.on("SIGINT", async () => {
  console.log("\n[SCHEDULER] Shutting down...");
  if (dbConnected) {
    await sequelize.close().catch(() => {});
    await mongoose.connection.close().catch(() => {});
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[SCHEDULER] Shutting down...");
  if (dbConnected) {
    await sequelize.close().catch(() => {});
    await mongoose.connection.close().catch(() => {});
  }
  process.exit(0);
});
