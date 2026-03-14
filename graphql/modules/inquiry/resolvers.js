import { Inquiry } from "../../../models/postgres/index.js";
import { sendInquiryNotification } from "../../../services/email.service.js";
import { sanitizeInput } from "../../../utils/sanitizer.js";
import logger from "../../../config/logger.js";

export const inquiryResolvers = {
  Query: {
    inquiries: async (_, { limit = 10, offset = 0 }, context) => {
      if (!context.user) throw new Error("Authentication required");
      return Inquiry.findAll({
        limit: Math.min(limit, 100),
        offset,
        order: [["createdAt", "DESC"]],
      });
    },
    inquiryById: async (_, { id }, context) => {
      if (!context.user) throw new Error("Authentication required");
      return Inquiry.findByPk(id);
    },
  },

  Inquiry: {
    project_type: (inquiry) => inquiry.projectType,
  },

  Mutation: {
    createInquiry: async (_, { input }) => {
      const inquiry = await Inquiry.create({
        name: sanitizeInput(input.name),
        email: sanitizeInput(input.email),
        phone: sanitizeInput(input.phone || ""),
        projectType: input.project_type || input.projectType,
        budget: input.budget,
        timeline: input.timeline,
        message: sanitizeInput(input.message),
        status: "new",
      });

      try {
        await sendInquiryNotification(inquiry);
      } catch (err) {
        logger.warn(
          `Failed to send inquiry notification for ${inquiry.id}: ${err.message}`,
        );
      }

      logger.info(`Inquiry created: ${inquiry.id}`);
      return inquiry;
    },
  },
};

export const inquiryTypeDefs = `
  type Inquiry {
    id: ID!
    name: String!
    email: String!
    phone: String
    project_type: String
    budget: String
    timeline: String
    message: String
    status: String!
    createdAt: String!
  }

  input InquiryInput {
    name: String!
    email: String!
    phone: String
    project_type: String
    budget: String
    timeline: String
    message: String
  }

  extend type Query {
    inquiries(limit: Int, offset: Int): [Inquiry!]!
    inquiryById(id: ID!): Inquiry
  }

  extend type Mutation {
    createInquiry(input: InquiryInput!): Inquiry!
  }
`;
