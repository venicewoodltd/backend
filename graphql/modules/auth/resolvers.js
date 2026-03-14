import { AdminUser } from "../../../models/postgres/index.js";
import {
  hashPassword,
  generateToken,
  comparePassword,
} from "../../../services/auth.service.js";
import { securityLogger } from "../../../config/logger.js";

export const authResolvers = {
  Mutation: {
    login: async (_, { email, password }) => {
      const user = await AdminUser.findOne({ where: { email } });
      if (!user) {
        securityLogger.warn(`GraphQL login failed — unknown email: ${email}`);
        throw new Error("Invalid credentials");
      }
      if (!user.isActive) {
        securityLogger.warn(
          `GraphQL login attempt on inactive account: ${email}`,
        );
        throw new Error("Account is inactive");
      }

      const valid = await comparePassword(password, user.password);
      if (!valid) {
        securityLogger.warn(
          `GraphQL login failed — wrong password for: ${email}`,
        );
        throw new Error("Invalid credentials");
      }

      const token = generateToken(user.id, user.email, user.role);

      user.lastLogin = new Date();
      await user.save();

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        token,
      };
    },
  },
};

export const authTypeDefs = `
  type User {
    id: ID!
    name: String!
    email: String!
    role: String!
    image: String
  }

  type AuthResponse {
    user: User!
    token: String!
  }

  extend type Mutation {
    login(email: String!, password: String!): AuthResponse!
  }
`;
