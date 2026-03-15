import { AdminUser } from "../../../models/postgres/index.js";
import {
  hashPassword,
  generateToken,
  comparePassword,
} from "../../../services/auth.service.js";
import { securityLogger } from "../../../config/logger.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export const authResolvers = {
  Mutation: {
    login: async (_, { email, password }) => {
      const user = await AdminUser.scope("withPassword").findOne({
        where: { email },
      });
      if (!user) {
        securityLogger.warn(`GraphQL login failed — unknown email: ${email}`);
        throw new Error("Invalid credentials");
      }

      // Account lockout check
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const remainingMin = Math.ceil(
          (new Date(user.lockedUntil) - new Date()) / 60000,
        );
        securityLogger.warn(
          `GraphQL login attempt on locked account: ${email}`,
        );
        throw new Error(
          `Account locked. Try again in ${remainingMin} minute(s).`,
        );
      }

      if (!user.isActive) {
        securityLogger.warn(
          `GraphQL login attempt on inactive account: ${email}`,
        );
        throw new Error("Account is inactive");
      }

      const valid = await comparePassword(password, user.password);
      if (!valid) {
        // Increment failed attempts
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const updates = { failedLoginAttempts: attempts };
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
          securityLogger.warn(
            `GraphQL account locked due to failed attempts: ${email}`,
          );
        }
        await AdminUser.update(updates, { where: { id: user.id } });
        securityLogger.warn(
          `GraphQL login failed — wrong password for: ${email}`,
        );
        throw new Error("Invalid credentials");
      }

      // Reset failed attempts on successful login
      const token = generateToken(user.id, user.email, user.role);

      await AdminUser.update(
        { lastLogin: new Date(), failedLoginAttempts: 0, lockedUntil: null },
        { where: { id: user.id } },
      );

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
