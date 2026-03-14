#!/usr/bin/env node
/**
 * Database Integrity Check — validates PostgreSQL & MongoDB data consistency.
 * Usage: node maintenance/dbIntegrity.js
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

const issues = [];

async function checkPostgresIntegrity() {
  console.log("[1] PostgreSQL integrity...");
  await sequelize.sync();

  const products = await Product.findAll({ raw: true });
  const projects = await Project.findAll({ raw: true });
  const blogs = await Blog.findAll({ raw: true });

  // Check for empty required fields
  for (const p of products) {
    if (!p.name) issues.push(`Product ${p.id}: missing name`);
    if (!p.slug) issues.push(`Product ${p.id}: missing slug`);
  }
  for (const p of projects) {
    if (!p.name) issues.push(`Project ${p.id}: missing name`);
    if (!p.slug) issues.push(`Project ${p.id}: missing slug`);
  }
  for (const b of blogs) {
    if (!b.title) issues.push(`Blog ${b.id}: missing title`);
    if (!b.slug) issues.push(`Blog ${b.id}: missing slug`);
  }

  // Check for duplicate slugs
  const productSlugs = products.map((p) => p.slug);
  const dupSlugs = productSlugs.filter((s, i) => productSlugs.indexOf(s) !== i);
  if (dupSlugs.length)
    issues.push(`Duplicate product slugs: ${dupSlugs.join(", ")}`);

  console.log(
    `  Products: ${products.length}, Projects: ${projects.length}, Blogs: ${blogs.length}`,
  );
}

async function checkMediaOrphans() {
  console.log("[2] Media orphan check...");
  if (mongoose.connection.readyState !== 1) await connectMongoDB();

  const media = await Media.find().lean();
  let orphaned = 0;

  for (const m of media) {
    const pid = m.productId || m.projectId || m.blogId || m.testimonialId;
    if (!pid) {
      orphaned++;
      continue;
    }

    if (m.productId) {
      const exists = await Product.findByPk(m.productId);
      if (!exists) {
        orphaned++;
        issues.push(`Media ${m._id}: product ${m.productId} not found`);
      }
    }
    if (m.projectId) {
      const exists = await Project.findByPk(m.projectId);
      if (!exists) {
        orphaned++;
        issues.push(`Media ${m._id}: project ${m.projectId} not found`);
      }
    }
  }

  console.log(`  Total media: ${media.length}, Orphaned: ${orphaned}`);
}

async function checkGridFSIntegrity() {
  console.log("[3] GridFS integrity...");
  if (mongoose.connection.readyState !== 1) await connectMongoDB();

  const filesCol = mongoose.connection.db.collection("images.files");
  const chunksCol = mongoose.connection.db.collection("images.chunks");

  const totalFiles = await filesCol.countDocuments();
  const totalChunks = await chunksCol.countDocuments();

  // Check for files without chunks
  const files = await filesCol.find().toArray();
  let missingChunks = 0;
  for (const f of files.slice(0, 100)) {
    const chunkCount = await chunksCol.countDocuments({ files_id: f._id });
    if (chunkCount === 0 && f.length > 0) {
      missingChunks++;
      issues.push(`GridFS file ${f._id} (${f.filename}): no chunks found`);
    }
  }

  // Check for media docs pointing to missing GridFS files
  const mediaWithFileId = await Media.find({ fileId: { $ne: null } }).lean();
  let missingFiles = 0;
  for (const m of mediaWithFileId) {
    const exists = await filesCol.findOne({ _id: m.fileId });
    if (!exists) {
      missingFiles++;
      issues.push(`Media ${m._id}: GridFS file ${m.fileId} not found`);
    }
  }

  console.log(`  GridFS files: ${totalFiles}, Chunks: ${totalChunks}`);
  console.log(
    `  Missing chunks: ${missingChunks}, Missing GridFS refs: ${missingFiles}`,
  );
}

async function run() {
  console.log("=== Database Integrity Check ===\n");

  await checkPostgresIntegrity();
  await checkMediaOrphans();
  await checkGridFSIntegrity();

  console.log(`\n=== Result ===`);
  if (issues.length === 0) {
    console.log("All checks passed — data is consistent.");
  } else {
    console.log(`Found ${issues.length} issue(s):`);
    issues.forEach((iss, i) => console.log(`  ${i + 1}. ${iss}`));
  }

  await sequelize.close().catch(() => {});
  await mongoose.connection.close().catch(() => {});
  process.exit(issues.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Integrity check error:", err.message);
  process.exit(1);
});
