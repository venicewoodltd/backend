#!/usr/bin/env node
/**
 * Performance Check — reports on query times, table sizes, and indexes.
 * Usage: node maintenance/performanceCheck.js
 */
import "dotenv/config";
import { sequelize } from "../models/postgres/index.js";
import connectMongoDB from "../config/mongodb.js";
import mongoose from "mongoose";

async function checkPostgres() {
  console.log("[1] PostgreSQL Performance...");

  // Table sizes
  const [tables] = await sequelize.query(`
    SELECT tablename, pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
  `);
  console.log("  Table sizes:");
  for (const t of tables) console.log(`    ${t.tablename}: ${t.size}`);

  // Index usage
  const [indexes] = await sequelize.query(`
    SELECT indexrelname AS index, idx_scan AS scans, pg_size_pretty(pg_relation_size(indexrelid)) AS size
    FROM pg_stat_user_indexes
    ORDER BY idx_scan DESC
    LIMIT 15
  `);
  console.log("  Top indexes by usage:");
  for (const idx of indexes.slice(0, 10))
    console.log(`    ${idx.index}: ${idx.scans} scans (${idx.size})`);

  // Slow query candidates
  const [seqScans] = await sequelize.query(`
    SELECT relname AS table, seq_scan, seq_tup_read, idx_scan, n_live_tup AS rows
    FROM pg_stat_user_tables
    WHERE seq_scan > 0
    ORDER BY seq_tup_read DESC
    LIMIT 10
  `);
  if (seqScans.length) {
    console.log("  Sequential scans (may need indexes):");
    for (const s of seqScans)
      console.log(`    ${s.table}: ${s.seq_scan} seq scans, ${s.rows} rows`);
  }
}

async function checkMongo() {
  console.log("\n[2] MongoDB Performance...");
  if (mongoose.connection.readyState !== 1) await connectMongoDB();

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  for (const col of collections) {
    const stats = await db.command({ collStats: col.name });
    const sizeMB = (stats.storageSize / 1024 / 1024).toFixed(2);
    console.log(
      `  ${col.name}: ${stats.count} docs, ${sizeMB} MB, ${stats.nindexes} indexes`,
    );
  }
}

async function checkMemory() {
  console.log("\n[3] Process Memory...");
  const mem = process.memoryUsage();
  console.log(`  RSS: ${(mem.rss / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Heap Total: ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  External: ${(mem.external / 1024 / 1024).toFixed(1)} MB`);
}

async function run() {
  console.log("=== Performance Check ===\n");

  await sequelize.sync();
  await checkPostgres();
  await checkMongo();
  await checkMemory();

  await sequelize.close().catch(() => {});
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
}

run().catch((err) => {
  console.error("Performance check error:", err.message);
  process.exit(1);
});
