import { Product, AdminUser } from "../../../models/postgres/index.js";
import ProductContent from "../../../models/mongodb/ProductContent.js";
import Media from "../../../models/mongodb/Media.js";
import SEO from "../../../models/mongodb/SEO.js";
import { slugify } from "../../../utils/slugify.js";
import { sanitizeInput } from "../../../utils/sanitizer.js";
import logger from "../../../config/logger.js";
import mongoose from "mongoose";

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
const IMAGE_URL_RE = /\/api\/images\/([a-f0-9]{24})/i;

const toPlain = (instance) => {
  const obj = instance.get
    ? instance.get({ plain: true })
    : instance.toJSON
      ? instance.toJSON()
      : instance;
  if (obj.createdAt instanceof Date)
    obj.createdAt = obj.createdAt.toISOString();
  if (obj.updatedAt instanceof Date)
    obj.updatedAt = obj.updatedAt.toISOString();
  return obj;
};

const resolveMainImage = async (productId) => {
  try {
    const mainMedia = await Media.findOne({ productId, type: "main" });
    if (mainMedia?.fileId) return `/api/images/${mainMedia.fileId}`;
  } catch (err) {
    logger.error(
      `Error fetching main image for product ${productId}: ${err.message}`,
    );
  }
  return null;
};

const resolveGalleryImages = async (productId) => {
  try {
    const gallery = await Media.find({ productId, type: "gallery" }).sort({
      createdAt: 1,
    });
    return gallery
      .filter((m) => m.fileId)
      .map((m) => `/api/images/${m.fileId}`);
  } catch (err) {
    logger.error(
      `Error fetching gallery for product ${productId}: ${err.message}`,
    );
  }
  return [];
};

const enrichProduct = async (product) => {
  const data = toPlain(product);
  data.image = await resolveMainImage(data.id);
  data.galleryImages = await resolveGalleryImages(data.id);
  if (data.creator) data.createdByUser = data.creator;
  return data;
};

const extractFileId = (input) => {
  if (!input) return null;
  if (OBJECT_ID_RE.test(input)) return input;
  const match = input.match(IMAGE_URL_RE);
  return match ? match[1] : null;
};

const getGridFSMeta = async (fileIdStr) => {
  const fileId = new mongoose.Types.ObjectId(fileIdStr);
  const col = mongoose.connection.db.collection("images.files");
  return col.findOne({ _id: fileId });
};

export const productResolvers = {
  Query: {
    products: async (_, { limit = 10, offset = 0, status }, context) => {
      const where = {};

      if (status === "all" || status === "draft") {
        if (!context.user)
          throw new Error(
            "Authentication required to view non-published products",
          );
        if (status === "draft") where.status = "draft";
      } else {
        where.status = status || "published";
      }

      const products = await Product.findAll({
        where,
        limit: Math.min(limit, 100),
        offset,
        order: [["updatedAt", "DESC"]],
        include: [
          {
            model: AdminUser,
            as: "creator",
            attributes: ["id", "username", "name", "role"],
            required: false,
          },
        ],
      });

      return Promise.all(products.map(enrichProduct));
    },

    productById: async (_, { id }) => {
      const product = await Product.findByPk(id);
      return product ? enrichProduct(product) : null;
    },

    productBySlug: async (_, { slug }) => {
      let product = await Product.findOne({ where: { slug } });
      if (!product) product = await Product.findByPk(slug);
      if (!product) return null;

      if (product.status === "published") {
        await Product.increment("views", { by: 1, where: { id: product.id } });
      }
      return enrichProduct(product);
    },

    featuredProducts: async (_, { limit = 6 }) => {
      const products = await Product.findAll({
        where: { featured: true },
        limit: Math.min(limit, 50),
        order: [["createdAt", "DESC"]],
      });
      return Promise.all(products.map(enrichProduct));
    },
  },

  Mutation: {
    createProduct: async (_, { input }, context) => {
      if (!context.user) throw new Error("Authentication required");

      let slug = input.slug
        ? input.slug.toLowerCase().trim()
        : slugify(input.name);
      const existing = await Product.findOne({ where: { slug } });
      if (existing) slug = `${slug}-${Date.now()}`;

      const product = await Product.create({
        name: sanitizeInput(input.name),
        slug,
        description: sanitizeInput(input.description || ""),
        longDescription: input.longDescription || null,
        category: input.category || "Custom",
        featured: input.featured || false,
        status: input.status || "draft",
        seoTags: input.seoTags || null,
        wood_type: input.wood_type || null,
        material: input.material || null,
        finish: input.finish || null,
        joinery: input.joinery || null,
        delivery: input.delivery || "6-8 Weeks",
        dimensions: input.dimensions || null,
        specifications: input.specifications || [],
        features: input.features || [],
        createdBy: context.user.id,
      });

      await ProductContent.create({
        productId: product.id,
        shortDescription: input.description || "",
        tags: input.tags || [],
        seoData: input.seoData ? JSON.parse(input.seoData) : {},
      });

      // Main image
      if (input.mainImage && OBJECT_ID_RE.test(input.mainImage)) {
        const meta = await getGridFSMeta(input.mainImage);
        if (meta) {
          await Media.create({
            productId: product.id,
            fileId: new mongoose.Types.ObjectId(input.mainImage),
            fileName: meta.filename || `${product.id}-main`,
            fileSize: meta.length || 0,
            mimeType:
              meta.contentType || meta.metadata?.contentType || "image/jpeg",
            type: "main",
            uploadedBy: "admin",
          });
          product.image = input.mainImage;
          await product.save();
        }
      }

      // Gallery images
      if (input.galleryImages?.length) {
        for (let i = 0; i < input.galleryImages.length; i++) {
          const imgId = input.galleryImages[i];
          if (!OBJECT_ID_RE.test(imgId)) continue;
          const meta = await getGridFSMeta(imgId);
          if (meta) {
            await Media.create({
              productId: product.id,
              fileId: new mongoose.Types.ObjectId(imgId),
              fileName: meta.filename || `${product.id}-gallery-${i}`,
              fileSize: meta.length || 0,
              mimeType:
                meta.contentType || meta.metadata?.contentType || "image/jpeg",
              type: "gallery",
              uploadedBy: "admin",
            });
          }
        }
      }

      logger.info(`Product created: ${product.id} by user ${context.user.id}`);
      return enrichProduct(product);
    },

    updateProduct: async (_, { id, input }, context) => {
      if (!context.user) throw new Error("Authentication required");
      const product = await Product.findByPk(id);
      if (!product) throw new Error("Product not found");

      const pgFields = {};
      const allowed = [
        "name",
        "description",
        "longDescription",
        "category",
        "featured",
        "status",
        "seoTags",
        "wood_type",
        "material",
        "finish",
        "joinery",
        "delivery",
        "dimensions",
        "specifications",
        "features",
        "whatsappText",
        "emailText",
      ];
      for (const key of allowed) {
        if (input[key] !== undefined)
          pgFields[key] =
            key === "name" || key === "description"
              ? sanitizeInput(input[key])
              : input[key];
      }
      if (input.slug && input.slug !== product.slug) {
        pgFields.slug = input.slug.toLowerCase().trim().replace(/\s+/g, "-");
      }

      await product.update(pgFields);

      // Update main image
      if (input.mainImage !== undefined) {
        const mainFileId = extractFileId(input.mainImage);
        if (mainFileId) {
          const meta = await getGridFSMeta(mainFileId);
          if (meta) {
            await Media.deleteMany({ productId: product.id, type: "main" });
            await Media.create({
              productId: product.id,
              fileId: new mongoose.Types.ObjectId(mainFileId),
              fileName: meta.filename || `${product.id}-main`,
              fileSize: meta.length || 0,
              mimeType:
                meta.contentType || meta.metadata?.contentType || "image/jpeg",
              type: "main",
              uploadedBy: "admin",
            });
          }
        } else if (input.mainImage === "" || input.mainImage === null) {
          await Media.deleteMany({ productId: product.id, type: "main" });
        }
      }

      // Update gallery images (diff-based)
      if (input.galleryImages !== undefined) {
        const current = await Media.find({
          productId: product.id,
          type: "gallery",
        });
        const currentIds = current.map((m) => m.fileId?.toString());
        const newIds = (input.galleryImages || [])
          .map(extractFileId)
          .filter(Boolean);

        const toRemove = currentIds.filter((fid) => !newIds.includes(fid));
        const toAdd = newIds.filter((fid) => !currentIds.includes(fid));

        for (const fid of toRemove) {
          await Media.deleteOne({
            productId: product.id,
            type: "gallery",
            fileId: new mongoose.Types.ObjectId(fid),
          });
        }
        for (const fid of toAdd) {
          const meta = await getGridFSMeta(fid);
          if (meta) {
            await Media.create({
              productId: product.id,
              fileId: new mongoose.Types.ObjectId(fid),
              fileName: meta.filename || `${product.id}-gallery`,
              fileSize: meta.length || 0,
              mimeType:
                meta.contentType || meta.metadata?.contentType || "image/jpeg",
              type: "gallery",
              uploadedBy: "admin",
            });
          }
        }
      }

      logger.info(`Product updated: ${product.id} by user ${context.user.id}`);
      return enrichProduct(product);
    },

    deleteProduct: async (_, { id }, context) => {
      if (!context.user) throw new Error("Authentication required");
      const product = await Product.findByPk(id);
      if (!product) throw new Error("Product not found");

      await ProductContent.deleteOne({ productId: product.id });
      await Media.deleteMany({ productId: product.id });
      await SEO.deleteOne({ productId: product.id });
      await product.destroy();

      logger.info(`Product deleted: ${id} by user ${context.user.id}`);
      return { success: true, message: "Product deleted" };
    },
  },
};

export const productTypeDefs = `
  input SpecificationInput {
    key: String!
    value: String!
  }

  type Specification {
    key: String!
    value: String!
  }

  type ProductCreator {
    id: ID!
    username: String!
    name: String
    role: String
  }

  type Product {
    id: ID!
    name: String!
    slug: String!
    description: String
    category: String!
    image: String
    galleryImages: [String]
    featured: Boolean!
    status: String
    seoTags: String
    wood_type: String
    material: String
    finish: String
    joinery: String
    delivery: String
    dimensions: String
    views: Int
    createdAt: String!
    updatedAt: String!
    createdBy: ID
    createdByUser: ProductCreator
    longDescription: String
    specifications: [Specification]
    features: [String]
    whatsappText: String
    emailText: String
  }

  input ProductInput {
    name: String!
    slug: String!
    description: String
    longDescription: String
    category: String
    mainImage: String
    galleryImages: [String]
    featured: Boolean
    status: String
    seoTags: String
    wood_type: String
    material: String
    finish: String
    joinery: String
    delivery: String
    dimensions: String
    specifications: [SpecificationInput]
    features: [String]
    tags: [String]
    seoData: String
    whatsappText: String
    emailText: String
  }

  type ProductResponse {
    success: Boolean!
    message: String!
  }

  extend type Query {
    products(limit: Int, offset: Int, status: String): [Product!]!
    productById(id: ID!): Product
    productBySlug(slug: String!): Product
    featuredProducts(limit: Int): [Product!]!
  }

  extend type Mutation {
    createProduct(input: ProductInput!): Product!
    updateProduct(id: ID!, input: ProductInput!): Product!
    deleteProduct(id: ID!): ProductResponse!
  }
`;
