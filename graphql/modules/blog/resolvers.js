import { Blog, AdminUser } from "../../../models/postgres/index.js";
import Media from "../../../models/mongodb/Media.js";
import { slugify } from "../../../utils/slugify.js";
import { sanitizeInput } from "../../../utils/sanitizer.js";
import logger from "../../../config/logger.js";

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
  if (obj.publishedAt instanceof Date)
    obj.publishedAt = obj.publishedAt.toISOString();
  return obj;
};

const resolveBlogImage = async (blogId) => {
  try {
    const media = await Media.findOne({
      blogId,
      type: { $in: ["main", "featured"] },
    });
    if (media?.fileId) return `/api/images/${media.fileId}`;
  } catch (err) {
    logger.error(`Error fetching image for blog ${blogId}: ${err.message}`);
  }
  return null;
};

export const blogResolvers = {
  Query: {
    blogs: async (_, { limit = 10, offset = 0 }) => {
      const blogs = await Blog.findAll({
        where: { status: "published" },
        limit: Math.min(limit, 100),
        offset,
        order: [["createdAt", "DESC"]],
      });
      return Promise.all(
        blogs.map(async (b) => {
          const data = toPlain(b);
          data.image = data.image || (await resolveBlogImage(data.id));
          return data;
        }),
      );
    },

    blogById: async (_, { id }, context) => {
      const where = { id };
      if (!context.user) where.status = "published";
      const blog = await Blog.findOne({ where });
      if (!blog) return null;
      const data = toPlain(blog);
      data.image = data.image || (await resolveBlogImage(data.id));
      return data;
    },

    blogBySlug: async (_, { slug }) => {
      const blog = await Blog.findOne({ where: { slug, status: "published" } });
      if (!blog) return null;

      await Blog.increment("views", { by: 1, where: { id: blog.id } });
      const data = toPlain(blog);
      data.image = data.image || (await resolveBlogImage(data.id));
      return data;
    },
  },

  Mutation: {
    createBlog: async (_, { input }, context) => {
      if (!context.user) throw new Error("Authentication required");
      const slug = slugify(input.title);
      const blog = await Blog.create({
        title: sanitizeInput(input.title),
        slug,
        content: input.content,
        excerpt: sanitizeInput(input.excerpt || ""),
        category: sanitizeInput(input.category || "General"),
        status: input.published ? "published" : "draft",
        createdBy: context.user.id,
      });
      logger.info(`Blog created: ${blog.id} by user ${context.user.id}`);
      return toPlain(blog);
    },
  },
};

export const blogTypeDefs = `
  type Blog {
    id: ID!
    title: String!
    slug: String!
    content: String
    excerpt: String
    category: String
    image: String
    published: Boolean!
    status: String
    views: Int
    readingTime: Int
    author: String
    publishedAt: String
    createdAt: String!
  }

  input BlogInput {
    title: String!
    content: String
    excerpt: String
    category: String
    image: String
    published: Boolean
  }

  extend type Query {
    blogs(limit: Int, offset: Int): [Blog!]!
    blogById(id: ID!): Blog
    blogBySlug(slug: String!): Blog
  }

  extend type Mutation {
    createBlog(input: BlogInput!): Blog!
  }
`;
