import { Project } from "../../../models/postgres/index.js";
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
  return obj;
};

const resolveProjectImage = async (projectId) => {
  try {
    const mainMedia = await Media.findOne({ projectId, type: "main" });
    if (mainMedia?.fileId) return `/api/images/${mainMedia.fileId}`;
  } catch (err) {
    logger.error(
      `Error fetching image for project ${projectId}: ${err.message}`,
    );
  }
  return null;
};

export const projectResolvers = {
  Query: {
    projects: async (_, { limit = 10, offset = 0 }) => {
      const projects = await Project.findAll({
        where: { status: "published" },
        limit: Math.min(limit, 100),
        offset,
        order: [["createdAt", "DESC"]],
      });
      return Promise.all(
        projects.map(async (p) => {
          const data = toPlain(p);
          data.image = await resolveProjectImage(data.id);
          return data;
        }),
      );
    },

    projectById: async (_, { id }, context) => {
      const where = { id };
      if (!context.user) where.status = "published";
      const project = await Project.findOne({ where });
      if (!project) return null;
      const data = toPlain(project);
      data.image = await resolveProjectImage(data.id);
      return data;
    },

    projectBySlug: async (_, { slug }, context) => {
      const where = { slug };
      if (!context.user) where.status = "published";
      let project = await Project.findOne({ where });
      if (!project && context.user) project = await Project.findByPk(slug);
      if (!project) return null;

      if (project.status === "published") {
        await Project.increment("views", { by: 1, where: { id: project.id } });
      }
      const data = toPlain(project);
      data.image = await resolveProjectImage(data.id);
      return data;
    },

    featuredProjects: async (_, { limit = 6 }) => {
      const projects = await Project.findAll({
        where: { featured: true, status: "published" },
        limit: Math.min(limit, 50),
        order: [["createdAt", "DESC"]],
      });
      return Promise.all(
        projects.map(async (p) => {
          const data = toPlain(p);
          data.image = await resolveProjectImage(data.id);
          return data;
        }),
      );
    },
  },

  Mutation: {
    createProject: async (_, { input }, context) => {
      if (!context.user) throw new Error("Authentication required");
      const slug = slugify(input.name);
      const project = await Project.create({
        name: sanitizeInput(input.name),
        slug,
        title: sanitizeInput(input.name),
        description: sanitizeInput(input.description || ""),
        category: input.category || "furniture",
        image: input.image || null,
        featured: input.featured || false,
        completionDate: input.completion_date || null,
        status: "draft",
        createdBy: context.user.id,
      });
      logger.info(`Project created: ${project.id} by user ${context.user.id}`);
      return toPlain(project);
    },

    updateProject: async (_, { id, input }, context) => {
      if (!context.user) throw new Error("Authentication required");
      const project = await Project.findByPk(id);
      if (!project) throw new Error("Project not found");

      const allowed = [
        "name",
        "description",
        "category",
        "image",
        "featured",
        "status",
      ];
      const safeInput = {};
      for (const key of allowed) {
        if (input[key] !== undefined) safeInput[key] = input[key];
      }
      if (safeInput.name) safeInput.slug = slugify(safeInput.name);
      if (input.completion_date !== undefined)
        safeInput.completionDate = input.completion_date;

      await project.update(safeInput);
      logger.info(`Project updated: ${project.id} by user ${context.user.id}`);
      return toPlain(project);
    },

    deleteProject: async (_, { id }, context) => {
      if (!context.user) throw new Error("Authentication required");
      const project = await Project.findByPk(id);
      if (!project) throw new Error("Project not found");

      await Media.deleteMany({ projectId: project.id });
      await project.destroy();
      logger.info(`Project deleted: ${id} by user ${context.user.id}`);
      return { success: true, message: "Project deleted successfully" };
    },
  },
};

export const projectTypeDefs = `
  type Project {
    id: ID!
    name: String!
    slug: String!
    description: String
    category: String
    image: String
    featured: Boolean!
    completion_date: String
    views: Int
    createdAt: String!
    updatedAt: String!
  }

  input ProjectInput {
    name: String!
    description: String
    category: String
    image: String
    featured: Boolean
    completion_date: String
  }

  extend type Query {
    projects(limit: Int, offset: Int): [Project!]!
    projectById(id: ID!): Project
    projectBySlug(slug: String!): Project
    featuredProjects(limit: Int): [Project!]!
  }

  extend type Mutation {
    createProject(input: ProjectInput!): Project!
    updateProject(id: ID!, input: ProjectInput!): Project!
    deleteProject(id: ID!): Response!
  }
`;
