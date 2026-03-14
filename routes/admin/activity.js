/**
 * Production Admin Activity Routes
 */

import express from "express";
import { adminAuth } from "../../middlewares/adminAuth.js";
import {
  Product,
  Project,
  Blog,
  Inquiry,
  Testimonial,
} from "../../models/postgres/index.js";
import { getRecentActivities } from "../../services/activityLog.service.js";
import { Op } from "sequelize";
import logger from "../../config/logger.js";

const router = express.Router();
router.use(adminAuth);

function getRelativeTime(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// GET /recent
router.get("/recent", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const { category, type } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (type) filter.entityType = type;

    const loggedActivities = await getRecentActivities(limit, filter);
    if (loggedActivities?.length > 0) {
      return res.json({
        success: true,
        data: loggedActivities.map((a) => ({
          id: a.id || a._id?.toString(),
          type: a.entityType || a.type,
          icon: a.icon,
          title: a.title,
          subtitle: a.description,
          entityId: a.entityId,
          timestamp: a.timestamp,
          relativeTime: a.relativeTime || getRelativeTime(a.timestamp),
          color: a.color,
          category: a.category,
          performedBy: a.performedBy,
          metadata: a.metadata,
        })),
        total: loggedActivities.length,
        source: "activity_log",
      });
    }

    // Fallback: infer from content timestamps
    const activities = [];
    const [inquiries, testimonials, blogs, projects, products] =
      await Promise.all([
        Inquiry.findAll({
          order: [["createdAt", "DESC"]],
          limit: 5,
          attributes: ["id", "name", "projectType", "status", "createdAt"],
        }),
        Testimonial.findAll({
          order: [["createdAt", "DESC"]],
          limit: 5,
          attributes: ["id", "author", "rating", "createdAt"],
        }),
        Blog.findAll({
          where: { status: "published" },
          order: [["updatedAt", "DESC"]],
          limit: 5,
          attributes: ["id", "title", "author", "createdAt", "updatedAt"],
        }),
        Project.findAll({
          order: [["updatedAt", "DESC"]],
          limit: 5,
          attributes: [
            "id",
            "title",
            "status",
            "client",
            "createdAt",
            "updatedAt",
          ],
        }),
        Product.findAll({
          order: [["updatedAt", "DESC"]],
          limit: 5,
          attributes: [
            "id",
            "name",
            "category",
            "status",
            "createdAt",
            "updatedAt",
          ],
        }),
      ]);

    inquiries.forEach((i) =>
      activities.push({
        id: `inq-${i.id}`,
        type: "inquiry",
        icon: "✉️",
        title: "New Inquiry",
        subtitle: `${i.name} - ${i.projectType || "General"}`,
        timestamp: i.createdAt,
        relativeTime: getRelativeTime(i.createdAt),
        color: "bg-blue-100 text-blue-600",
      }),
    );
    testimonials.forEach((t) =>
      activities.push({
        id: `test-${t.id}`,
        type: "testimonial",
        icon: "⭐",
        title: "New Testimonial",
        subtitle: `${t.author} - ${t.rating || 5}★`,
        timestamp: t.createdAt,
        relativeTime: getRelativeTime(t.createdAt),
        color: "bg-yellow-100 text-yellow-600",
      }),
    );
    blogs.forEach((b) =>
      activities.push({
        id: `blog-${b.id}`,
        type: "blog",
        icon: "📝",
        title: "Blog Published",
        subtitle: b.title,
        timestamp: b.updatedAt,
        relativeTime: getRelativeTime(b.updatedAt),
        color: "bg-purple-100 text-purple-600",
      }),
    );
    projects.forEach((p) =>
      activities.push({
        id: `proj-${p.id}`,
        type: "project",
        icon: "🏗️",
        title:
          p.status === "published" ? "Project Completed" : "Project Updated",
        subtitle: `${p.title}${p.client ? ` for ${p.client}` : ""}`,
        timestamp: p.updatedAt,
        relativeTime: getRelativeTime(p.updatedAt),
        color: "bg-green-100 text-green-600",
      }),
    );
    products.forEach((p) => {
      const isNew =
        new Date(p.createdAt).getTime() === new Date(p.updatedAt).getTime();
      activities.push({
        id: `prod-${p.id}`,
        type: "product",
        icon: "📦",
        title: isNew ? "New Product" : "Product Updated",
        subtitle: `${p.name}${p.category ? ` in ${p.category}` : ""}`,
        timestamp: p.updatedAt,
        relativeTime: getRelativeTime(p.updatedAt),
        color: "bg-teal-100 text-teal-600",
      });
    });

    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({
      success: true,
      data: activities.slice(0, limit),
      total: Math.min(activities.length, limit),
      source: "content_timestamps",
    });
  } catch (error) {
    logger.error("Activity recent error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to get recent activity" });
  }
});

// GET /stats
router.get("/stats", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date();
    thisMonth.setDate(thisMonth.getDate() - 30);

    const [tI, wI, mI, tT, wT, mT, tB, wB, mB, tPr, wPr, mPr, tPd, wPd, mPd] =
      await Promise.all([
        Inquiry.count({ where: { createdAt: { [Op.gte]: today } } }),
        Inquiry.count({ where: { createdAt: { [Op.gte]: thisWeek } } }),
        Inquiry.count({ where: { createdAt: { [Op.gte]: thisMonth } } }),
        Testimonial.count({ where: { createdAt: { [Op.gte]: today } } }),
        Testimonial.count({ where: { createdAt: { [Op.gte]: thisWeek } } }),
        Testimonial.count({ where: { createdAt: { [Op.gte]: thisMonth } } }),
        Blog.count({
          where: { updatedAt: { [Op.gte]: today }, status: "published" },
        }),
        Blog.count({
          where: { updatedAt: { [Op.gte]: thisWeek }, status: "published" },
        }),
        Blog.count({
          where: { updatedAt: { [Op.gte]: thisMonth }, status: "published" },
        }),
        Project.count({
          where: { updatedAt: { [Op.gte]: today }, status: "published" },
        }),
        Project.count({
          where: { updatedAt: { [Op.gte]: thisWeek }, status: "published" },
        }),
        Project.count({
          where: { updatedAt: { [Op.gte]: thisMonth }, status: "published" },
        }),
        Product.count({ where: { createdAt: { [Op.gte]: today } } }),
        Product.count({ where: { createdAt: { [Op.gte]: thisWeek } } }),
        Product.count({ where: { createdAt: { [Op.gte]: thisMonth } } }),
      ]);

    res.json({
      success: true,
      data: {
        today: {
          inquiries: tI,
          testimonials: tT,
          blogs: tB,
          projects: tPr,
          products: tPd,
          total: tI + tT + tB + tPr + tPd,
        },
        thisWeek: {
          inquiries: wI,
          testimonials: wT,
          blogs: wB,
          projects: wPr,
          products: wPd,
          total: wI + wT + wB + wPr + wPd,
        },
        thisMonth: {
          inquiries: mI,
          testimonials: mT,
          blogs: mB,
          projects: mPr,
          products: mPd,
          total: mI + mT + mB + mPr + mPd,
        },
      },
    });
  } catch (error) {
    logger.error("Activity stats error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to get activity stats" });
  }
});

export default router;
