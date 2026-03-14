import {
  productTypeDefs,
  productResolvers,
} from "./modules/product/resolvers.js";
import {
  projectTypeDefs,
  projectResolvers,
} from "./modules/project/resolvers.js";
import { blogTypeDefs, blogResolvers } from "./modules/blog/resolvers.js";
import {
  inquiryTypeDefs,
  inquiryResolvers,
} from "./modules/inquiry/resolvers.js";
import { authTypeDefs, authResolvers } from "./modules/auth/resolvers.js";
import {
  testimonialTypeDefs,
  testimonialResolvers,
} from "./modules/testimonial/resolvers.js";
import { analyticsTypeDefs } from "./modules/analytics/resolvers.js";

const baseTypeDefs = `
  type Query {
    health: String
  }

  type Mutation {
    _dummy: String
  }

  type Response {
    success: Boolean!
    message: String!
  }
`;

export const typeDefs = [
  baseTypeDefs,
  analyticsTypeDefs,
  authTypeDefs,
  productTypeDefs,
  projectTypeDefs,
  blogTypeDefs,
  inquiryTypeDefs,
  testimonialTypeDefs,
];

export const resolvers = {
  Query: {
    health: () => "OK",
    ...productResolvers.Query,
    ...projectResolvers.Query,
    ...blogResolvers.Query,
    ...inquiryResolvers.Query,
    ...testimonialResolvers.Query,
  },
  Mutation: {
    ...productResolvers.Mutation,
    ...projectResolvers.Mutation,
    ...blogResolvers.Mutation,
    ...inquiryResolvers.Mutation,
    ...authResolvers.Mutation,
    ...testimonialResolvers.Mutation,
  },
};
