/**
 * Production Admin Blogs Routes
 */

import express from "express";
import multer from "multer";
import { Blog, AdminUser } from "../../models/postgres/index.js";
import Media from "../../models/mongodb/Media.js";
import { adminAuth, requirePermission } from "../../middlewares/adminAuth.js";
import { saveImageToGridFS } from "../../services/upload.service.js";
import { getGridFSBucket } from "../../config/gridfs.js";
import { logBlogActivity } from "../../services/activityLog.service.js";
import { createSlug } from "../../utils/validators.js";
import logger from "../../config/logger.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use(adminAuth);
router.use(requirePermission("blogs"));

function calcReadingTime(text) {
  if (!text) return 1;
  return Math.max(1, Math.ceil(text.split(/\s+/).length / 200));
}

// POST /
router.post("/", upload.single("featured_image"), async (req, res) => {
  try {
    const body = req.body;
    const title = body.title?.trim();
    if (!title)
      return res
        .status(400)
        .json({ success: false, error: "Blog title is required" });
    if (!body.content?.trim())
      return res
        .status(400)
        .json({ success: false, error: "Blog content is required" });

    const slug = body.slug?.trim() || createSlug(title);
    const existing = await Blog.findOne({ where: { slug } });
    if (existing)
      return res
        .status(409)
        .json({ success: false, error: "Slug already exists" });

    const blog = await Blog.create({
      title,
      slug,
      excerpt: body.excerpt,
      content: body.content,
      category: body.category || "General",
      status: body.status || "draft",
      featured: body.featured === "true" || body.featured === true,
      author: body.author || "Venice Wood Ltd",
      seoTags: body.seoTags,
      readingTime: calcReadingTime(body.content),
      publishedAt: body.status === "published" ? new Date() : null,
      createdBy: req.admin.id,
    });

    // Featured image
    let imageFileId = body.featuredImageFileId;
    if (req.file) {
      const gridFile = await saveImageToGridFS(
        req.file.buffer,
        `blog-featured-${Date.now()}-${req.file.originalname}`,
      );
      imageFileId = gridFile._id.toString();
    }
    if (imageFileId) {
      await Media.create({
        blogId: blog.id,
        fileId: imageFileId,
        fileName: `featured-${slug}`,
        mimeType: "image/jpeg",
        type: "featured",
        uploadedBy: req.admin.username,
      });
    }

    logBlogActivity("created", blog.toJSON(), req.admin, req).catch(() => {});
    res.status(201).json({ success: true, blog: blog.toJSON() });
  } catch (error) {
    logger.error("Create blog error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to create blog" });
  }
});

// GET /
router.get("/", async (req, res) => {
  try {
    const blogs = await Blog.findAll({
      include: [
        {
          model: AdminUser,
          as: "creator",
          attributes: ["id", "name", "username"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const blogsWithImages = await Promise.all(
      blogs.map(async (blog) => {
        const media = await Media.findOne({
          blogId: blog.id,
          type: "featured",
        });
        return {
          ...blog.toJSON(),
          featuredImage: media?.fileId?.toString() || null,
        };
      }),
    );

    res.json({ success: true, blogs: blogsWithImages });
  } catch (error) {
    logger.error("List blogs error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch blogs" });
  }
});

// GET /:id
router.get("/:id", async (req, res) => {
  try {
    const blog = await Blog.findByPk(req.params.id, {
      include: [
        {
          model: AdminUser,
          as: "creator",
          attributes: ["id", "name", "username"],
        },
      ],
    });
    if (!blog)
      return res.status(404).json({ success: false, error: "Blog not found" });
    const media = await Media.find({ blogId: blog.id });
    res.json({ success: true, blog: { ...blog.toJSON(), media } });
  } catch (error) {
    logger.error("Get blog error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch blog" });
  }
});

// PUT /:id
router.put("/:id", upload.single("featured_image"), async (req, res) => {
  try {
    const blog = await Blog.findByPk(req.params.id);
    if (!blog)
      return res.status(404).json({ success: false, error: "Blog not found" });

    const body = req.body;
    const updates = {};
    const fields = [
      "title",
      "slug",
      "excerpt",
      "content",
      "category",
      "author",
      "seoTags",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    if (body.featured !== undefined)
      updates.featured = body.featured === "true" || body.featured === true;
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === "published" && !blog.publishedAt)
        updates.publishedAt = new Date();
    }
    if (body.content) updates.readingTime = calcReadingTime(body.content);

    if (req.file) {
      const gridFile = await saveImageToGridFS(
        req.file.buffer,
        `blog-featured-${Date.now()}-${req.file.originalname}`,
      );
      await Media.deleteMany({ blogId: blog.id, type: "featured" });
      await Media.create({
        blogId: blog.id,
        fileId: gridFile._id,
        fileName: `featured-${blog.slug}`,
        mimeType: req.file.mimetype,
        type: "featured",
        uploadedBy: req.admin.username,
      });
    } else if (body.featuredImageFileId) {
      await Media.deleteMany({ blogId: blog.id, type: "featured" });
      await Media.create({
        blogId: blog.id,
        fileId: body.featuredImageFileId,
        fileName: `featured-${blog.slug}`,
        mimeType: "image/jpeg",
        type: "featured",
        uploadedBy: req.admin.username,
      });
    }
    if (body.removeImage === "true") {
      await Media.deleteMany({ blogId: blog.id, type: "featured" });
    }

    await blog.update(updates);
    logBlogActivity("updated", blog.toJSON(), req.admin, req).catch(() => {});
    res.json({ success: true, blog: blog.toJSON() });
  } catch (error) {
    logger.error("Update blog error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to update blog" });
  }
});

// DELETE /:id
router.delete("/:id", async (req, res) => {
  try {
    const blog = await Blog.findByPk(req.params.id);
    if (!blog)
      return res.status(404).json({ success: false, error: "Blog not found" });
    // Delete GridFS files before removing Media docs
    const mediaItems = await Media.find({ blogId: blog.id });
    const bucket = getGridFSBucket();
    for (const m of mediaItems) {
      try {
        await bucket.delete(m.fileId);
      } catch {}
    }
    await Media.deleteMany({ blogId: blog.id });
    await blog.destroy();
    logBlogActivity(
      "deleted",
      { id: blog.id, title: blog.title },
      req.admin,
      req,
    ).catch(() => {});
    res.json({ success: true, message: "Blog deleted" });
  } catch (error) {
    logger.error("Delete blog error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to delete blog" });
  }
});

export default router;
