/**
 * Production PostgreSQL Models - Central Index
 * All Sequelize models + associations
 */

import { Sequelize, DataTypes } from "sequelize";
import { createSequelizeInstance } from "../../config/database.js";

const sequelize = createSequelizeInstance();

// =============================================
// PRODUCT MODEL
// =============================================
const Product = sequelize.define(
  "Product",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true, len: [1, 255] },
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { notEmpty: true },
    },
    description: { type: DataTypes.TEXT },
    longDescription: { type: DataTypes.TEXT },
    category: { type: DataTypes.STRING, defaultValue: "Custom" },
    seoTags: { type: DataTypes.TEXT },
    image: { type: DataTypes.TEXT },
    featured: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: {
      type: DataTypes.ENUM("draft", "published"),
      defaultValue: "draft",
    },
    wood_type: { type: DataTypes.STRING },
    material: { type: DataTypes.STRING },
    finish: { type: DataTypes.STRING },
    joinery: { type: DataTypes.STRING },
    delivery: { type: DataTypes.STRING },
    dimensions: { type: DataTypes.JSONB },
    specifications: { type: DataTypes.JSONB, defaultValue: [] },
    features: { type: DataTypes.JSONB, defaultValue: [] },
    createdBy: { type: DataTypes.UUID },
    views: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    tableName: "products",
    indexes: [
      { fields: ["category"] },
      { fields: ["status"] },
      { fields: ["featured"] },
      { fields: ["createdBy"] },
      { fields: ["slug"], unique: true },
    ],
  },
);

// =============================================
// PROJECT MODEL
// =============================================
const Project = sequelize.define(
  "Project",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true },
    },
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    longDescription: { type: DataTypes.TEXT },
    category: { type: DataTypes.STRING, defaultValue: "furniture" },
    image: { type: DataTypes.TEXT },
    featured: { type: DataTypes.BOOLEAN, defaultValue: false },
    primaryWood: { type: DataTypes.STRING },
    client: { type: DataTypes.STRING },
    location: { type: DataTypes.STRING },
    completionDate: { type: DataTypes.DATE },
    dimensions: { type: DataTypes.JSONB },
    materials: { type: DataTypes.JSONB },
    techniques: { type: DataTypes.JSONB },
    specifications: { type: DataTypes.JSONB },
    timeline: { type: DataTypes.JSONB },
    testimonial: { type: DataTypes.JSONB },
    seoTags: { type: DataTypes.TEXT },
    status: {
      type: DataTypes.ENUM("draft", "published"),
      defaultValue: "draft",
    },
    createdBy: { type: DataTypes.UUID },
    views: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    tableName: "projects",
    indexes: [
      { fields: ["category"] },
      { fields: ["status"] },
      { fields: ["featured"] },
      { fields: ["createdBy"] },
      { fields: ["slug"], unique: true },
    ],
  },
);

// =============================================
// BLOG MODEL
// =============================================
const Blog = sequelize.define(
  "Blog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true },
    },
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    excerpt: { type: DataTypes.TEXT },
    content: { type: DataTypes.TEXT, allowNull: false },
    category: { type: DataTypes.STRING, defaultValue: "General" },
    status: {
      type: DataTypes.ENUM("draft", "published"),
      defaultValue: "draft",
    },
    featured: { type: DataTypes.BOOLEAN, defaultValue: false },
    author: { type: DataTypes.STRING, defaultValue: "Venice Wood Ltd" },
    createdBy: { type: DataTypes.UUID },
    seoTags: { type: DataTypes.TEXT },
    readingTime: { type: DataTypes.INTEGER, defaultValue: 1 },
    views: { type: DataTypes.INTEGER, defaultValue: 0 },
    publishedAt: { type: DataTypes.DATE },
  },
  {
    tableName: "blogs",
    hooks: {
      beforeUpdate: (blog) => {
        if (
          blog.changed("status") &&
          blog.status === "published" &&
          !blog.publishedAt
        ) {
          blog.publishedAt = new Date();
        }
      },
    },
    indexes: [
      { fields: ["category"] },
      { fields: ["status"] },
      { fields: ["featured"] },
      { fields: ["createdBy"] },
      { fields: ["publishedAt"] },
      { fields: ["slug"], unique: true },
    ],
  },
);

// =============================================
// ADMIN USER MODEL
// =============================================
const AdminUser = sequelize.define(
  "AdminUser",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { len: [2, 255] },
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 50],
        is: /^[a-z0-9_-]+$/i,
      },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { len: [8, 500] },
    },
    role: {
      type: DataTypes.ENUM("admin", "editor"),
      allowNull: false,
      defaultValue: "editor",
    },
    photoFileId: { type: DataTypes.STRING },
    permissions: { type: DataTypes.JSON, defaultValue: [] },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastLogin: { type: DataTypes.DATE },
    isOnline: { type: DataTypes.BOOLEAN, defaultValue: false },
    lastActivity: { type: DataTypes.DATE },
    failedLoginAttempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE, allowNull: true },
    refreshToken: { type: DataTypes.STRING(500), allowNull: true },
  },
  {
    tableName: "admin_users",
    defaultScope: { attributes: { exclude: ["password"] } },
    scopes: { withPassword: { attributes: {} } },
    indexes: [
      { fields: ["username"], unique: true },
      { fields: ["email"], unique: true },
      { fields: ["isActive"] },
    ],
  },
);

// =============================================
// INQUIRY MODEL
// =============================================
const Inquiry = sequelize.define(
  "Inquiry",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isEmail: true },
    },
    phone: { type: DataTypes.STRING },
    projectType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    budget: {
      type: DataTypes.ENUM(
        "5000-10000",
        "10000-25000",
        "25000-50000",
        "50000+",
      ),
    },
    timeline: {
      type: DataTypes.ENUM("urgent", "standard", "flexible", "custom"),
    },
    message: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM("new", "read", "responded", "closed"),
      defaultValue: "new",
    },
    notes: { type: DataTypes.TEXT },
  },
  {
    tableName: "inquiries",
    indexes: [
      { fields: ["status"] },
      { fields: ["projectType"] },
      { fields: ["createdAt"] },
    ],
  },
);

// =============================================
// TESTIMONIAL MODEL
// =============================================
const Testimonial = sequelize.define(
  "Testimonial",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    author: { type: DataTypes.STRING, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    rating: { type: DataTypes.INTEGER, validate: { min: 1, max: 5 } },
    image: { type: DataTypes.STRING },
    featured: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    tableName: "testimonials",
    indexes: [{ fields: ["featured"] }],
  },
);

// =============================================
// CATEGORY MODEL
// =============================================
const Category = sequelize.define(
  "Category",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: false },
    type: {
      type: DataTypes.ENUM("product", "project", "blog", "inquiry"),
      allowNull: false,
      defaultValue: "product",
    },
    description: { type: DataTypes.TEXT },
    color: { type: DataTypes.STRING, defaultValue: "#4e342e" },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    tableName: "categories",
    indexes: [{ unique: true, fields: ["slug", "type"] }],
  },
);

// =============================================
// MASTERY CONTENT MODEL (Singleton)
// =============================================
const MasteryContent = sequelize.define(
  "MasteryContent",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    heroTitle: {
      type: DataTypes.STRING(255),
      defaultValue: "The Art of Woodworking Mastery",
    },
    heroSubtitle: { type: DataTypes.TEXT },
    heroImage: { type: DataTypes.STRING(500) },
    section1Title: { type: DataTypes.STRING(255) },
    section1Content: { type: DataTypes.TEXT },
    section1Image: { type: DataTypes.STRING(500) },
    section2Title: { type: DataTypes.STRING(255) },
    section2Content: { type: DataTypes.TEXT },
    section2Image: { type: DataTypes.STRING(500) },
    section3Title: { type: DataTypes.STRING(255) },
    section3Content: { type: DataTypes.TEXT },
    section3Image: { type: DataTypes.STRING(500) },
    craftSkills: {
      type: DataTypes.JSONB,
      defaultValue: [
        { name: "Fine Furniture", percentage: 95 },
        { name: "Architectural Joinery", percentage: 90 },
        { name: "Wood Carving", percentage: 88 },
        { name: "Restoration", percentage: 92 },
      ],
    },
    history: { type: DataTypes.TEXT },
    yearsExperience: { type: DataTypes.INTEGER, defaultValue: 25 },
    projectsCompleted: { type: DataTypes.INTEGER, defaultValue: 500 },
    satisfiedClients: { type: DataTypes.INTEGER, defaultValue: 350 },
  },
  { tableName: "mastery_content" },
);

// =============================================
// MASTERY PILLAR MODEL
// =============================================
const MasteryPillar = sequelize.define(
  "MasteryPillar",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    icon: { type: DataTypes.STRING, defaultValue: "leaf" },
    order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    tableName: "mastery_pillars",
    indexes: [{ fields: ["order"] }, { fields: ["isActive"] }],
  },
);

// =============================================
// CONTACT SETTINGS MODEL (Singleton)
// =============================================
const ContactSettings = sequelize.define(
  "ContactSettings",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
    studioLocation: {
      type: DataTypes.STRING,
      defaultValue: "Bel Air Riviere Seche, Mauritius",
    },
    email: { type: DataTypes.STRING, defaultValue: "info@venicewooldltd.com" },
    phone: { type: DataTypes.STRING, defaultValue: "+230 5712 3456" },
    responseTime: {
      type: DataTypes.STRING,
      defaultValue: "We typically respond within 24 hours.",
    },
    facebookUrl: { type: DataTypes.STRING },
    whatsappNumber: { type: DataTypes.STRING, defaultValue: "+23057123456" },
    instagramUrl: { type: DataTypes.STRING },
    footerText: {
      type: DataTypes.STRING(500),
      defaultValue:
        "Premium bespoke woodwork and custom carpentry in Mauritius. Excellence in every detail.",
    },
    faqs: {
      type: DataTypes.JSONB,
      defaultValue: [
        {
          q: "How long does it take to complete a custom project?",
          a: "Timeline varies based on project complexity, but typically ranges from 3-6 months. Simpler pieces may take 4-8 weeks, while elaborate commissions can take 12+ months.",
        },
        {
          q: "What is your design consultation process?",
          a: "We start with an initial consultation to understand your vision. This is followed by design sketches, material selection, and approval stages before production begins.",
        },
        {
          q: "Can I visit the studio?",
          a: "Yes! We welcome studio visits by appointment. You can see our work in progress and meet our craftsmen.",
        },
        {
          q: "Do you work internationally?",
          a: "Absolutely. We ship our pieces worldwide and have completed commissions across Europe, North America, and the Middle East.",
        },
      ],
    },
  },
  { tableName: "contact_settings" },
);

// =============================================
// ASSOCIATIONS
// =============================================
Product.belongsTo(AdminUser, { foreignKey: "createdBy", as: "creator" });
Blog.belongsTo(AdminUser, { foreignKey: "createdBy", as: "creator" });
Project.belongsTo(AdminUser, { foreignKey: "createdBy", as: "creator" });

export {
  sequelize,
  Product,
  Project,
  Blog,
  AdminUser,
  Inquiry,
  Testimonial,
  Category,
  MasteryContent,
  MasteryPillar,
  ContactSettings,
};

export default sequelize;
