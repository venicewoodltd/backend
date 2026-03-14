/**
 * Production Admin Projects Routes
 */

import express from "express";
import multer from "multer";
import { Project, AdminUser } from "../../models/postgres/index.js";
import Media from "../../models/mongodb/Media.js";
import { adminAuth, requirePermission } from "../../middlewares/adminAuth.js";
import { saveImageToGridFS } from "../../services/upload.service.js";
import { getGridFSBucket } from "../../config/gridfs.js";
import { logProjectActivity } from "../../services/activityLog.service.js";
import { createSlug } from "../../utils/validators.js";
import logger from "../../config/logger.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use(adminAuth);
router.use(requirePermission("projects"));

// POST /
router.post(
  "/",
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "galleryImages", maxCount: 20 },
  ]),
  async (req, res) => {
    try {
      const body = req.body;
      const name = body.name?.trim();
      if (!name)
        return res
          .status(400)
          .json({ success: false, error: "Project name is required" });

      const slug = body.slug?.trim() || createSlug(name);
      const existing = await Project.findOne({ where: { slug } });
      if (existing)
        return res
          .status(409)
          .json({ success: false, error: "Slug already exists" });

      const parseJSON = (val, def) => {
        try {
          return typeof val === "string" ? JSON.parse(val) : val || def;
        } catch {
          return def;
        }
      };

      const project = await Project.create({
        name,
        slug,
        title: body.title || name,
        description: body.description,
        longDescription: body.longDescription,
        category: body.category || "furniture",
        primaryWood: body.primaryWood,
        client: body.client,
        location: body.location,
        completionDate: body.completionDate || null,
        dimensions: parseJSON(body.dimensions, null),
        materials: parseJSON(body.materials, null),
        techniques: parseJSON(body.techniques, null),
        specifications: parseJSON(body.specifications, null),
        timeline: parseJSON(body.timeline, null),
        testimonial: parseJSON(body.testimonial, null),
        seoTags: body.seoTags,
        featured: body.featured === "true" || body.featured === true,
        status: body.status || "draft",
        createdBy: req.admin.id,
      });

      // Main image
      let mainImageFileId = body.mainImageFileId;
      if (req.files?.mainImage?.[0]) {
        const file = req.files.mainImage[0];
        const gridFile = await saveImageToGridFS(
          file.buffer,
          `project-main-${Date.now()}-${file.originalname}`,
        );
        mainImageFileId = gridFile._id.toString();
      }
      if (mainImageFileId) {
        await Media.create({
          projectId: project.id,
          fileId: mainImageFileId,
          fileName: `main-${slug}`,
          mimeType: "image/jpeg",
          type: "main",
          uploadedBy: req.admin.username,
        });
        await project.update({ image: mainImageFileId });
      }

      // Gallery
      const galleryIds = body.galleryImageFileIds
        ? Array.isArray(body.galleryImageFileIds)
          ? body.galleryImageFileIds
          : [body.galleryImageFileIds]
        : [];
      if (req.files?.galleryImages) {
        for (const file of req.files.galleryImages) {
          const gridFile = await saveImageToGridFS(
            file.buffer,
            `project-gallery-${Date.now()}-${file.originalname}`,
          );
          galleryIds.push(gridFile._id.toString());
        }
      }
      for (const fid of galleryIds) {
        await Media.create({
          projectId: project.id,
          fileId: fid,
          fileName: `gallery-${slug}-${fid}`,
          mimeType: "image/jpeg",
          type: "gallery",
          uploadedBy: req.admin.username,
        });
      }

      logProjectActivity("created", project.toJSON(), req.admin, req).catch(
        () => {},
      );
      res.status(201).json({ success: true, project: project.toJSON() });
    } catch (error) {
      logger.error("Create project error", { error: error.message });
      res
        .status(500)
        .json({ success: false, error: "Failed to create project" });
    }
  },
);

// GET /
router.get("/", async (req, res) => {
  try {
    const projects = await Project.findAll({
      include: [
        {
          model: AdminUser,
          as: "creator",
          attributes: ["id", "name", "username"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    res.json({ success: true, projects });
  } catch (error) {
    logger.error("List projects error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch projects" });
  }
});

// GET /:id
router.get("/:id", async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id, {
      include: [
        {
          model: AdminUser,
          as: "creator",
          attributes: ["id", "name", "username"],
        },
      ],
    });
    if (!project)
      return res
        .status(404)
        .json({ success: false, error: "Project not found" });
    const media = await Media.find({ projectId: project.id });
    res.json({ success: true, project: { ...project.toJSON(), media } });
  } catch (error) {
    logger.error("Get project error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch project" });
  }
});

// PUT /:id
router.put(
  "/:id",
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "galleryImages", maxCount: 20 },
  ]),
  async (req, res) => {
    try {
      const project = await Project.findByPk(req.params.id);
      if (!project)
        return res
          .status(404)
          .json({ success: false, error: "Project not found" });

      const body = req.body;
      const parseJSON = (val, def) => {
        try {
          return typeof val === "string" ? JSON.parse(val) : val || def;
        } catch {
          return def;
        }
      };

      const updates = {};
      const fields = [
        "name",
        "slug",
        "title",
        "description",
        "longDescription",
        "category",
        "primaryWood",
        "client",
        "location",
        "seoTags",
      ];
      for (const f of fields) {
        if (body[f] !== undefined) updates[f] = body[f];
      }
      if (body.completionDate !== undefined)
        updates.completionDate = body.completionDate || null;
      if (body.featured !== undefined)
        updates.featured = body.featured === "true" || body.featured === true;
      if (body.status !== undefined) updates.status = body.status;
      for (const f of [
        "dimensions",
        "materials",
        "techniques",
        "specifications",
        "timeline",
        "testimonial",
      ]) {
        if (body[f] !== undefined) updates[f] = parseJSON(body[f], null);
      }

      if (req.files?.mainImage?.[0]) {
        const file = req.files.mainImage[0];
        const gridFile = await saveImageToGridFS(
          file.buffer,
          `project-main-${Date.now()}-${file.originalname}`,
        );
        await Media.deleteMany({ projectId: project.id, type: "main" });
        await Media.create({
          projectId: project.id,
          fileId: gridFile._id,
          fileName: `main-${project.slug}`,
          mimeType: file.mimetype,
          type: "main",
          uploadedBy: req.admin.username,
        });
        updates.image = gridFile._id.toString();
      } else if (body.mainImageFileId) {
        await Media.deleteMany({ projectId: project.id, type: "main" });
        await Media.create({
          projectId: project.id,
          fileId: body.mainImageFileId,
          fileName: `main-${project.slug}`,
          mimeType: "image/jpeg",
          type: "main",
          uploadedBy: req.admin.username,
        });
        updates.image = body.mainImageFileId;
      }

      if (req.files?.galleryImages) {
        for (const file of req.files.galleryImages) {
          const gridFile = await saveImageToGridFS(
            file.buffer,
            `project-gallery-${Date.now()}-${file.originalname}`,
          );
          await Media.create({
            projectId: project.id,
            fileId: gridFile._id,
            fileName: `gallery-${file.originalname}`,
            mimeType: file.mimetype,
            type: "gallery",
            uploadedBy: req.admin.username,
          });
        }
      }
      if (body.removedGalleryIds) {
        const ids = Array.isArray(body.removedGalleryIds)
          ? body.removedGalleryIds
          : [body.removedGalleryIds];
        for (const id of ids) await Media.findByIdAndDelete(id);
      }

      await project.update(updates);
      logProjectActivity("updated", project.toJSON(), req.admin, req).catch(
        () => {},
      );
      res.json({ success: true, project: project.toJSON() });
    } catch (error) {
      logger.error("Update project error", { error: error.message });
      res
        .status(500)
        .json({ success: false, error: "Failed to update project" });
    }
  },
);

// DELETE /:id
router.delete("/:id", async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project)
      return res
        .status(404)
        .json({ success: false, error: "Project not found" });
    // Delete GridFS files before removing Media docs
    const mediaItems = await Media.find({ projectId: project.id });
    const bucket = getGridFSBucket();
    for (const m of mediaItems) {
      try {
        await bucket.delete(m.fileId);
      } catch {}
    }
    await Media.deleteMany({ projectId: project.id });
    await project.destroy();
    logProjectActivity(
      "deleted",
      { id: project.id, name: project.name },
      req.admin,
      req,
    ).catch(() => {});
    res.json({ success: true, message: "Project deleted" });
  } catch (error) {
    logger.error("Delete project error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to delete project" });
  }
});

export default router;
