#!/usr/bin/env node
/**
 * Log Rotation — archives and compresses old log files.
 * Usage: node maintenance/logRotation.js [--max-age=30]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, "../logs");

const maxAgeArg = process.argv.find((a) => a.startsWith("--max-age="));
const MAX_AGE_DAYS = maxAgeArg ? parseInt(maxAgeArg.split("=")[1], 10) : 30;

async function run() {
  console.log("=== Log Rotation ===\n");

  if (!fs.existsSync(LOG_DIR)) {
    console.log("No logs directory found — nothing to do.");
    process.exit(0);
  }

  const files = fs.readdirSync(LOG_DIR);
  const now = Date.now();
  const maxAge = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  let compressed = 0;
  let deleted = 0;
  let totalFreed = 0;

  for (const file of files) {
    const filePath = path.join(LOG_DIR, file);
    const stat = fs.statSync(filePath);

    if (!stat.isFile()) continue;

    const age = now - stat.mtimeMs;

    // Compress .log files older than 7 days that aren't already compressed
    if (file.endsWith(".log") && age > 7 * 24 * 60 * 60 * 1000) {
      const gzPath = filePath + ".gz";
      if (!fs.existsSync(gzPath)) {
        const source = fs.createReadStream(filePath);
        const dest = fs.createWriteStream(gzPath);
        const gzip = createGzip();
        await pipeline(source, gzip, dest);
        const originalSize = stat.size;
        fs.unlinkSync(filePath);
        const newSize = fs.statSync(gzPath).size;
        totalFreed += originalSize - newSize;
        compressed++;
        console.log(
          `  Compressed: ${file} (${(originalSize / 1024).toFixed(1)}KB -> ${(newSize / 1024).toFixed(1)}KB)`,
        );
      }
    }

    // Delete compressed logs older than max age
    if (file.endsWith(".gz") && age > maxAge) {
      totalFreed += stat.size;
      fs.unlinkSync(filePath);
      deleted++;
      console.log(`  Deleted: ${file}`);
    }
  }

  console.log(`\nCompressed: ${compressed}, Deleted: ${deleted}`);
  console.log(`Space freed: ${(totalFreed / 1024).toFixed(1)} KB`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Log rotation error:", err.message);
  process.exit(1);
});
