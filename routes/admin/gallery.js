/**
 * Production Admin Gallery Routes
 */

import express from "express";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import Media from "../../models/mongodb/Media.js";
import { sequelize } from "../../models/postgres/index.js";
import { adminAuth, requireAdminRole } from "../../middlewares/adminAuth.js";
import logger from "../../config/logger.js";

const router = express.Router();
router.use(adminAuth);

// GET / — All images with associations
router.get("/", async (req, res) => {
  try {
    const { Product, Project, Blog, Testimonial } = sequelize.models;
    const filesCollection = mongoose.connection.db.collection("images.files");
    const heroFilesCollection =
      mongoose.connection.db.collection("heroImages.files");

    const [
      gridfsFiles,
      heroFiles,
      mediaDocuments,
      products,
      projects,
      blogs,
      testimonials,
    ] = await Promise.all([
      filesCollection.find({}).sort({ uploadDate: -1 }).toArray(),
      heroFilesCollection.find({}).sort({ uploadDate: -1 }).toArray(),
      Media.find({}),
      Product.findAll({ attributes: ["id", "name", "slug"] }),
      Project.findAll({ attributes: ["id", "name", "title", "slug"] }),
      Blog.findAll({ attributes: ["id", "title", "slug"] }),
      Testimonial.findAll({ attributes: ["id", "author", "image"] }),
    ]);

    // Build lookup maps
    const mediaByFileId = {};
    for (const m of mediaDocuments) {
      const fid = m.fileId?.toString();
      if (fid) {
        if (!mediaByFileId[fid]) mediaByFileId[fid] = [];
        mediaByFileId[fid].push(m);
      }
    }

    const productMap = Object.fromEntries(
      products.map((p) => [p.id, { name: p.name, slug: p.slug }]),
    );
    const projectMap = Object.fromEntries(
      projects.map((p) => [p.id, { name: p.name || p.title, slug: p.slug }]),
    );
    const blogMap = Object.fromEntries(
      blogs.map((b) => [b.id, { name: b.title, slug: b.slug }]),
    );
    const testimonialMap = Object.fromEntries(
      testimonials.map((t) => [t.id, { name: t.author }]),
    );
    const testimonialByImage = Object.fromEntries(
      testimonials
        .filter((t) => t.image)
        .map((t) => [t.image, { id: t.id, name: t.author }]),
    );

    const images = gridfsFiles.map((file) => {
      const fid = file._id.toString();
      const entries = mediaByFileId[fid] || [];
      const associations = [];

      for (const m of entries) {
        if (m.productId && productMap[m.productId])
          associations.push({
            entityType: "product",
            entityId: m.productId,
            entityName: productMap[m.productId].name,
            imageType: m.type,
          });
        if (m.projectId && projectMap[m.projectId])
          associations.push({
            entityType: "project",
            entityId: m.projectId,
            entityName: projectMap[m.projectId].name,
            imageType: m.type,
          });
        if (m.blogId && blogMap[m.blogId])
          associations.push({
            entityType: "blog",
            entityId: m.blogId,
            entityName: blogMap[m.blogId].name,
            imageType: m.type,
          });
        if (m.testimonialId && testimonialMap[m.testimonialId])
          associations.push({
            entityType: "testimonial",
            entityId: m.testimonialId,
            entityName: testimonialMap[m.testimonialId].name,
            imageType: m.type,
          });
      }

      if (
        testimonialByImage[fid] &&
        !associations.some(
          (a) =>
            a.entityType === "testimonial" &&
            a.entityId === testimonialByImage[fid].id,
        )
      ) {
        associations.push({
          entityType: "testimonial",
          entityId: testimonialByImage[fid].id,
          entityName: testimonialByImage[fid].name,
          imageType: "main",
        });
      }

      return {
        fileId: fid,
        filename: file.filename,
        contentType: file.contentType || "image/jpeg",
        size: file.length,
        uploadDate: file.uploadDate,
        url: `/api/images/${fid}`,
        bucket: "images",
        associations,
        isOrphaned: associations.length === 0,
      };
    });

    const heroImgs = heroFiles.map((file) => ({
      fileId: file._id.toString(),
      filename: file.filename,
      contentType: file.contentType || "image/jpeg",
      size: file.length,
      uploadDate: file.uploadDate,
      url: `/api/admin/hero/image/${file._id.toString()}`,
      bucket: "heroImages",
      associations: [
        {
          entityType: "hero",
          entityId: "home",
          entityName: "Home Page Hero",
          imageType: "carousel",
        },
      ],
      isOrphaned: false,
    }));

    const allImages = [...images, ...heroImgs];
    const stats = {
      totalImages: allImages.length,
      orphanedImages: allImages.filter((i) => i.isOrphaned).length,
      productImages: allImages.filter((i) =>
        i.associations.some((a) => a.entityType === "product"),
      ).length,
      projectImages: allImages.filter((i) =>
        i.associations.some((a) => a.entityType === "project"),
      ).length,
      blogImages: allImages.filter((i) =>
        i.associations.some((a) => a.entityType === "blog"),
      ).length,
      heroImages: heroFiles.length,
      totalSize: allImages.reduce((s, i) => s + (i.size || 0), 0),
    };

    res.json({ success: true, data: allImages, stats });
  } catch (error) {
    logger.error("Gallery fetch error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch gallery" });
  }
});

// DELETE /cleanup/orphaned — MUST be before /:fileId to avoid param matching
router.delete("/cleanup/orphaned", requireAdminRole, async (req, res) => {
  try {
    const { Product, Project, Blog, Testimonial } = sequelize.models;
    const filesCollection = mongoose.connection.db.collection("images.files");

    const [
      gridfsFiles,
      mediaDocuments,
      products,
      projects,
      blogs,
      testimonials,
    ] = await Promise.all([
      filesCollection.find({}).toArray(),
      Media.find({}),
      Product.findAll({ attributes: ["id"] }),
      Project.findAll({ attributes: ["id"] }),
      Blog.findAll({ attributes: ["id"] }),
      Testimonial.findAll({ attributes: ["id", "image"] }),
    ]);

    const existingIds = {
      product: new Set(products.map((p) => p.id)),
      project: new Set(projects.map((p) => p.id)),
      blog: new Set(blogs.map((b) => b.id)),
      testimonial: new Set(testimonials.map((t) => t.id)),
    };
    const testimonialImageIds = new Set(
      testimonials.filter((t) => t.image).map((t) => t.image),
    );

    const validFileIds = new Set();
    for (const m of mediaDocuments) {
      const hasValid =
        (m.productId && existingIds.product.has(m.productId)) ||
        (m.projectId && existingIds.project.has(m.projectId)) ||
        (m.blogId && existingIds.blog.has(m.blogId)) ||
        (m.testimonialId && existingIds.testimonial.has(m.testimonialId));
      if (hasValid && m.fileId) validFileIds.add(m.fileId.toString());
    }
    for (const fid of testimonialImageIds) validFileIds.add(fid);

    const orphaned = gridfsFiles.filter(
      (f) => !validFileIds.has(f._id.toString()),
    );
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "images",
    });

    let deletedCount = 0;
    for (const file of orphaned) {
      try {
        await bucket.delete(file._id);
        await Media.deleteMany({ fileId: file._id });
        deletedCount++;
      } catch {}
    }

    res.json({
      success: true,
      message: `Deleted ${deletedCount} orphaned images`,
      deletedCount,
    });
  } catch (error) {
    logger.error("Gallery cleanup error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to cleanup orphaned images" });
  }
});

// DELETE /:fileId
router.delete("/:fileId", requireAdminRole, async (req, res) => {
  try {
    const { fileId } = req.params;
    const requestedBucket = req.query.bucket || "images";
    const bucketName = ["images", "heroImages"].includes(requestedBucket)
      ? requestedBucket
      : "images";

    if (!mongoose.Types.ObjectId.isValid(fileId))
      return res.status(400).json({ success: false, error: "Invalid file ID" });
    const objectId = new mongoose.Types.ObjectId(fileId);

    let deleted = false;
    try {
      await new GridFSBucket(mongoose.connection.db, { bucketName }).delete(
        objectId,
      );
      deleted = true;
    } catch {
      const other = bucketName === "images" ? "heroImages" : "images";
      try {
        await new GridFSBucket(mongoose.connection.db, {
          bucketName: other,
        }).delete(objectId);
        deleted = true;
      } catch {}
    }

    const mediaResult = await Media.deleteMany({ fileId: objectId });
    if (!deleted && mediaResult.deletedCount === 0)
      return res.status(404).json({ success: false, error: "Image not found" });
    res.json({
      success: true,
      message: "Image deleted",
      deletedMedia: mediaResult.deletedCount,
    });
  } catch (error) {
    logger.error("Gallery delete error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to delete image" });
  }
});

export default router;
