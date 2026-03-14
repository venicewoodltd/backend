import { Testimonial } from "../../../models/postgres/index.js";
import logger from "../../../config/logger.js";

export const testimonialResolvers = {
  Query: {
    testimonials: async (_, { limit = 10 }) => {
      return Testimonial.findAll({
        limit: Math.min(limit, 100),
        order: [["createdAt", "DESC"]],
      });
    },
    featuredTestimonials: async (_, { limit = 5 }) => {
      return Testimonial.findAll({
        where: { featured: true },
        limit: Math.min(limit, 50),
      });
    },
  },

  Mutation: {
    createTestimonial: async (_, { input }, context) => {
      if (!context.user) throw new Error("Authentication required");
      const testimonial = await Testimonial.create({
        author: input.author,
        content: input.content,
        rating: input.rating,
        image: input.image || null,
        featured: input.featured || false,
      });
      logger.info(
        `Testimonial created: ${testimonial.id} by user ${context.user.id}`,
      );
      return testimonial;
    },
  },
};

export const testimonialTypeDefs = `
  type Testimonial {
    id: ID!
    author: String!
    content: String!
    rating: Int
    image: String
    featured: Boolean!
    createdAt: String!
  }

  input TestimonialInput {
    author: String!
    content: String!
    rating: Int
    image: String
    featured: Boolean
  }

  extend type Query {
    testimonials(limit: Int): [Testimonial!]!
    featuredTestimonials(limit: Int): [Testimonial!]!
  }

  extend type Mutation {
    createTestimonial(input: TestimonialInput!): Testimonial!
  }
`;
