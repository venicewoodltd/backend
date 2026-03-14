#!/usr/bin/env node
/**
 * Health Check — verifies all services are operational.
 * Usage: node maintenance/healthCheck.js
 * Exit code 0 = healthy, 1 = unhealthy
 */
import "dotenv/config";
import { sequelize } from "../models/postgres/index.js";
import connectMongoDB from "../config/mongodb.js";
import mongoose from "mongoose";

const checks = [];

async function checkPostgres() {
  const start = Date.now();
  try {
    await sequelize.authenticate();
    checks.push({
      service: "PostgreSQL",
      status: "OK",
      latency: Date.now() - start,
    });
  } catch (err) {
    checks.push({ service: "PostgreSQL", status: "FAIL", error: err.message });
  }
}

async function checkMongoDB() {
  const start = Date.now();
  try {
    if (mongoose.connection.readyState !== 1) await connectMongoDB();
    await mongoose.connection.db.admin().ping();
    checks.push({
      service: "MongoDB",
      status: "OK",
      latency: Date.now() - start,
    });
  } catch (err) {
    checks.push({ service: "MongoDB", status: "FAIL", error: err.message });
  }
}

async function checkGridFS() {
  const start = Date.now();
  try {
    if (mongoose.connection.readyState !== 1) await connectMongoDB();
    const count = await mongoose.connection.db
      .collection("images.files")
      .countDocuments();
    checks.push({
      service: "GridFS",
      status: "OK",
      latency: Date.now() - start,
      files: count,
    });
  } catch (err) {
    checks.push({ service: "GridFS", status: "FAIL", error: err.message });
  }
}

async function checkMemory() {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  checks.push({
    service: "Memory",
    status: heapMB < 512 ? "OK" : "WARN",
    heapMB,
    rssMB,
  });
}

async function run() {
  console.log("=== Health Check ===\n");
  const start = Date.now();

  await checkPostgres();
  await checkMongoDB();
  await checkGridFS();
  await checkMemory();

  const failed = checks.filter((c) => c.status === "FAIL");

  for (const c of checks) {
    const icon =
      c.status === "OK" ? "PASS" : c.status === "WARN" ? "WARN" : "FAIL";
    const detail = c.error || (c.latency ? `${c.latency}ms` : "");
    console.log(`[${icon}] ${c.service} ${detail}`);
  }

  console.log(`\nTotal: ${Date.now() - start}ms`);
  console.log(`Result: ${failed.length === 0 ? "HEALTHY" : "UNHEALTHY"}`);

  await sequelize.close().catch(() => {});
  await mongoose.connection.close().catch(() => {});
  process.exit(failed.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Health check error:", err.message);
  process.exit(1);
});
