#!/usr/bin/env node
/**
 * Security Audit — checks environment, credentials, and configuration.
 * Usage: node maintenance/securityAudit.js
 */
import "dotenv/config";
import crypto from "crypto";
import { sequelize, AdminUser } from "../models/postgres/index.js";

const findings = [];

function check(label, pass, detail) {
  findings.push({ label, pass, detail });
}

async function auditEnvironment() {
  check(
    "NODE_ENV is production",
    process.env.NODE_ENV === "production",
    `Current: ${process.env.NODE_ENV || "undefined"}`,
  );
  check(
    "JWT_SECRET >= 32 chars",
    (process.env.JWT_SECRET || "").length >= 32,
    `Length: ${(process.env.JWT_SECRET || "").length}`,
  );
  check(
    "JWT_SECRET has entropy",
    /[a-z]/.test(process.env.JWT_SECRET || "") &&
      /[A-Z]/.test(process.env.JWT_SECRET || "") &&
      /[0-9]/.test(process.env.JWT_SECRET || ""),
    "Mixed case + digits required",
  );
  check("DB_PASSWORD is set", !!process.env.DB_PASSWORD, "");
  check("MONGO_URI is set", !!process.env.MONGO_URI, "");
  check(
    "SMTP configured",
    !!process.env.SMTP_HOST && !!process.env.SMTP_USER,
    process.env.SMTP_HOST ? "Configured" : "Not configured",
  );
  check(
    "CLIENT_URL is set",
    !!process.env.CLIENT_URL,
    process.env.CLIENT_URL || "Not set",
  );
  check(
    "Default admin password changed",
    process.env.DEFAULT_ADMIN_PASSWORD !== "12345678",
    "Should not be default",
  );
}

async function auditUsers() {
  await sequelize.sync();
  const users = await AdminUser.findAll();

  check(
    "At least one admin exists",
    users.length > 0,
    `Found: ${users.length}`,
  );

  const inactive = users.filter((u) => !u.isActive);
  check(
    "No stale inactive admins",
    inactive.length <= 1,
    `Inactive: ${inactive.length}`,
  );

  // Check for duplicate emails
  const emails = users.map((u) => u.email);
  const unique = new Set(emails);
  check(
    "No duplicate admin emails",
    emails.length === unique.size,
    `Total: ${emails.length}, Unique: ${unique.size}`,
  );

  // Check lastLogin freshness
  const stale = users.filter((u) => {
    if (!u.lastLogin) return true;
    const days = (Date.now() - new Date(u.lastLogin).getTime()) / 86400000;
    return days > 90;
  });
  check(
    "All admins active in 90 days",
    stale.length === 0,
    `Stale accounts: ${stale.length}`,
  );
}

async function auditSSL() {
  const dbHost = process.env.DB_HOST || "localhost";
  check(
    "PostgreSQL uses non-localhost",
    dbHost !== "localhost" && dbHost !== "127.0.0.1",
    `Host: ${dbHost}`,
  );

  const mongoUri = process.env.MONGO_URI || "";
  check(
    "MongoDB uses TLS/SSL",
    mongoUri.includes("ssl=true") ||
      mongoUri.includes("tls=true") ||
      mongoUri.includes("+srv"),
    mongoUri.includes("localhost") ? "Local (OK for dev)" : "Remote",
  );
}

async function run() {
  console.log("=== Security Audit ===\n");

  await auditEnvironment();
  await auditUsers().catch((err) => check("User audit", false, err.message));
  await auditSSL();

  const pass = findings.filter((f) => f.pass);
  const fail = findings.filter((f) => !f.pass);

  for (const f of findings) {
    console.log(
      `[${f.pass ? "PASS" : "FAIL"}] ${f.label}${f.detail ? " — " + f.detail : ""}`,
    );
  }

  console.log(`\nPassed: ${pass.length}/${findings.length}`);
  if (fail.length > 0) {
    console.log("\nAction items:");
    fail.forEach((f, i) => console.log(`  ${i + 1}. Fix: ${f.label}`));
  }

  await sequelize.close().catch(() => {});
  process.exit(fail.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Audit error:", err.message);
  process.exit(1);
});
