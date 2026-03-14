/**
 * Production JWT Configuration
 */

if (!process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set.");
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error(
    "FATAL: JWT_SECRET must be at least 32 characters for production security.",
  );
}

export const jwtConfig = {
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  algorithm: "HS256",
};

export default jwtConfig;
