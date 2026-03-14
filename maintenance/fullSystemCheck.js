#!/usr/bin/env node
/**
 * Full System Check — runs all maintenance checks in sequence.
 * Usage: node maintenance/fullSystemCheck.js
 */
import "dotenv/config";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const checks = [
  { name: "Health Check", script: "healthCheck.js" },
  { name: "Security Audit", script: "securityAudit.js" },
  { name: "Database Integrity", script: "dbIntegrity.js" },
  { name: "Performance Check", script: "performanceCheck.js" },
  {
    name: "GridFS Cleanup (dry run)",
    script: "gridfsCleanup.js",
    args: ["--dry-run"],
  },
];

console.log("╔══════════════════════════════════╗");
console.log("║     Full System Check            ║");
console.log("╚══════════════════════════════════╝\n");

const results = [];

for (const check of checks) {
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Running: ${check.name}`);
  console.log("─".repeat(40));

  const scriptPath = path.join(__dirname, check.script);
  const args = check.args || [];

  try {
    const output = execFileSync("node", [scriptPath, ...args], {
      encoding: "utf8",
      timeout: 60_000,
      env: process.env,
      cwd: path.join(__dirname, ".."),
    });
    console.log(output);
    results.push({ name: check.name, status: "PASS" });
  } catch (err) {
    console.log(err.stdout || "");
    console.log(err.stderr || "");
    results.push({ name: check.name, status: "FAIL" });
  }
}

console.log("\n╔══════════════════════════════════╗");
console.log("║     Summary                      ║");
console.log("╚══════════════════════════════════╝\n");

const passed = results.filter((r) => r.status === "PASS").length;
const failed = results.filter((r) => r.status === "FAIL").length;

for (const r of results) {
  console.log(`  [${r.status}] ${r.name}`);
}

console.log(
  `\n  Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`,
);
console.log(
  `  Overall: ${failed === 0 ? "ALL SYSTEMS GO" : "ISSUES DETECTED"}\n`,
);

process.exit(failed > 0 ? 1 : 0);
