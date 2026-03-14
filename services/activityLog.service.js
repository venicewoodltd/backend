/**
 * Production Activity Log Service
 * Audit trail for all CRUD operations
 */

import ActivityLog from "../models/mongodb/ActivityLog.js";
import logger from "../config/logger.js";

const ACTIVITY_CONFIG = {
  product: {
    created: { icon: "📦", color: "bg-green-100 text-green-600" },
    updated: { icon: "✏️", color: "bg-blue-100 text-blue-600" },
    deleted: { icon: "🗑️", color: "bg-red-100 text-red-600" },
    published: { icon: "🚀", color: "bg-purple-100 text-purple-600" },
  },
  project: {
    created: { icon: "🏗️", color: "bg-green-100 text-green-600" },
    updated: { icon: "✏️", color: "bg-blue-100 text-blue-600" },
    deleted: { icon: "🗑️", color: "bg-red-100 text-red-600" },
    published: { icon: "🚀", color: "bg-purple-100 text-purple-600" },
  },
  blog: {
    created: { icon: "📝", color: "bg-green-100 text-green-600" },
    updated: { icon: "✏️", color: "bg-blue-100 text-blue-600" },
    deleted: { icon: "🗑️", color: "bg-red-100 text-red-600" },
    published: { icon: "🚀", color: "bg-purple-100 text-purple-600" },
  },
  inquiry: {
    created: { icon: "📬", color: "bg-yellow-100 text-yellow-600" },
    updated: { icon: "📋", color: "bg-blue-100 text-blue-600" },
    deleted: { icon: "🗑️", color: "bg-red-100 text-red-600" },
  },
  testimonial: {
    created: { icon: "⭐", color: "bg-yellow-100 text-yellow-600" },
    updated: { icon: "✏️", color: "bg-blue-100 text-blue-600" },
    deleted: { icon: "🗑️", color: "bg-red-100 text-red-600" },
  },
  user: {
    login: { icon: "🔑", color: "bg-green-100 text-green-600" },
    logout: { icon: "👋", color: "bg-gray-100 text-gray-600" },
    created: { icon: "👤", color: "bg-green-100 text-green-600" },
    updated: { icon: "✏️", color: "bg-blue-100 text-blue-600" },
    deleted: { icon: "🗑️", color: "bg-red-100 text-red-600" },
  },
  settings: { updated: { icon: "⚙️", color: "bg-blue-100 text-blue-600" } },
};

function getConfig(entityType, action) {
  return (
    ACTIVITY_CONFIG[entityType]?.[action] || {
      icon: "📝",
      color: "bg-gray-100 text-gray-600",
    }
  );
}

async function logActivity(params) {
  try {
    const {
      type,
      category,
      title,
      description,
      entityType,
      entityId,
      entityName,
      admin,
      req,
      metadata,
    } = params;
    const config = getConfig(entityType, type.split("_").pop());

    await ActivityLog.create({
      type,
      category,
      title,
      description,
      icon: config.icon,
      color: config.color,
      entityType,
      entityId,
      entityName,
      performedBy: admin
        ? { userId: admin.id, username: admin.username, role: admin.role }
        : undefined,
      metadata,
      ipAddress: req?.ip,
      userAgent: req?.headers?.["user-agent"],
      timestamp: new Date(),
    });
  } catch (err) {
    logger.error("Activity logging failed", { error: err.message });
  }
}

export function logProductActivity(action, data, admin, req, metadata) {
  return logActivity({
    type: `product_${action}`,
    category: "content",
    title: `Product ${action}`,
    description: `Product "${data.name || data.id}" was ${action}`,
    entityType: "product",
    entityId: data.id,
    entityName: data.name,
    admin,
    req,
    metadata,
  });
}

export function logProjectActivity(action, data, admin, req, metadata) {
  return logActivity({
    type: `project_${action}`,
    category: "content",
    title: `Project ${action}`,
    description: `Project "${data.name || data.title || data.id}" was ${action}`,
    entityType: "project",
    entityId: data.id,
    entityName: data.name || data.title,
    admin,
    req,
    metadata,
  });
}

export function logBlogActivity(action, data, admin, req, metadata) {
  return logActivity({
    type: `blog_${action}`,
    category: "content",
    title: `Blog ${action}`,
    description: `Blog "${data.title || data.id}" was ${action}`,
    entityType: "blog",
    entityId: data.id,
    entityName: data.title,
    admin,
    req,
    metadata,
  });
}

export function logInquiryActivity(action, data, admin, req, metadata) {
  return logActivity({
    type: `inquiry_${action}`,
    category: "inquiry",
    title: `Inquiry ${action}`,
    description: `Inquiry from "${data.name || data.id}" was ${action}`,
    entityType: "inquiry",
    entityId: data.id,
    entityName: data.name,
    admin,
    req,
    metadata,
  });
}

export function logTestimonialActivity(action, data, admin, req, metadata) {
  return logActivity({
    type: `testimonial_${action}`,
    category: "testimonial",
    title: `Testimonial ${action}`,
    description: `Testimonial by "${data.author || data.id}" was ${action}`,
    entityType: "testimonial",
    entityId: data.id,
    entityName: data.author,
    admin,
    req,
    metadata,
  });
}

export function logUserActivity(action, data, admin, req) {
  return logActivity({
    type: `user_${action}`,
    category: "user",
    title: `User ${action}`,
    description: `User "${data.username || data.name || data.id}" ${action}`,
    entityType: "user",
    entityId: data.id,
    entityName: data.username || data.name,
    admin,
    req,
  });
}

export function logSettingsActivity(
  section,
  description,
  admin,
  req,
  metadata,
) {
  return logActivity({
    type: `${section}_updated`,
    category: "settings",
    title: `${section} updated`,
    description,
    entityType: "settings",
    admin,
    req,
    metadata,
  });
}

export async function getRecentActivities(limit = 20, filter = {}) {
  const query = {};
  if (filter.category) query.category = filter.category;
  if (filter.type) query.type = filter.type;
  return ActivityLog.find(query).sort({ timestamp: -1 }).limit(limit).lean();
}

export default {
  logProductActivity,
  logProjectActivity,
  logBlogActivity,
  logInquiryActivity,
  logTestimonialActivity,
  logUserActivity,
  logSettingsActivity,
  getRecentActivities,
};
