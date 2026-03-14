#!/usr/bin/env node
/**
 * GridFS Cleanup — removes orphaned GridFS files and media documents.
 * Usage: node maintenance/gridfsCleanup.js [--dry-run]
 */
import "dotenv/config";
import {
  sequelize,
  Product,
  Project,
  Blog,
  Testimonial,
} from "../models/postgres/index.js";
import connectMongoDB from "../config/mongodb.js";
import Media from "../models/mongodb/Media.js";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";

const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
  console.log(`=== GridFS Cleanup ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  await sequelize.sync();
  if (mongoose.connection.readyState !== 1) await connectMongoDB();

  const filesCol = mongoose.connection.db.collection("images.files");
  const bucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: "images",
  });

  // 1. Find orphaned media docs (pointing to entities that no longer exist)
  console.log("[1] Checking for orphaned media documents...");
  const allMedia = await Media.find().lean();
  const orphanedMedia = [];

  for (const m of allMedia) {
    let exists = false;
    if (m.productId) exists = !!(await Product.findByPk(m.productId));
    else if (m.projectId) exists = !!(await Project.findByPk(m.projectId));
    else if (m.blogId) exists = !!(await Blog.findByPk(m.blogId));
    else if (m.testimonialId)
      exists = !!(await Testimonial.findByPk(m.testimonialId));

    if (!exists) orphanedMedia.push(m);
  }
  console.log(`  Found ${orphanedMedia.length} orphaned media document(s)`);

  // 2. Find GridFS files not referenced by any media doc
  console.log("[2] Checking for unreferenced GridFS files...");
  const allFiles = await filesCol.find().toArray();
  const referencedFileIds = new Set(
    allMedia.filter((m) => m.fileId).map((m) => m.fileId.toString()),
  );
  const unreferencedFiles = allFiles.filter(
    (f) => !referencedFileIds.has(f._id.toString()),
  );
  console.log(
    `  Found ${unreferencedFiles.length} unreferenced GridFS file(s)`,
  );

  // 3. Find media docs pointing to missing GridFS files
  console.log("[3] Checking for broken media references...");
  const brokenMedia = [];
  for (const m of allMedia) {
    if (m.fileId) {
      const exists = await filesCol.findOne({ _id: m.fileId });
      if (!exists) brokenMedia.push(m);
    }
  }
  console.log(`  Found ${brokenMedia.length} broken media reference(s)`);

  // Clean up
  if (!DRY_RUN) {
    let cleaned = 0;

    // Remove orphaned media docs and their GridFS files
    for (const m of orphanedMedia) {
      if (m.fileId) {
        try {
          await bucket.delete(m.fileId);
        } catch {
          /* already gone */
        }
      }
      await Media.deleteOne({ _id: m._id });
      cleaned++;
    }

    // Remove unreferenced GridFS files
    for (const f of unreferencedFiles) {
      try {
        await bucket.delete(f._id);
        cleaned++;
      } catch {
        /* already gone */
      }
    }

    // Remove broken media docs
    for (const m of brokenMedia) {
      await Media.deleteOne({ _id: m._id });
      cleaned++;
    }

    console.log(`\nCleaned ${cleaned} item(s)`);
  } else {
    console.log("\nDry run — no changes made. Remove --dry-run to execute.");
  }

  // Stats
  const remaining = await filesCol.countDocuments();
  const mediaRemaining = await Media.countDocuments();
  console.log(`\nGridFS files remaining: ${remaining}`);
  console.log(`Media documents remaining: ${mediaRemaining}`);

  await sequelize.close().catch(() => {});
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
}

run().catch((err) => {
  console.error("Cleanup error:", err.message);
  process.exit(1);
});
