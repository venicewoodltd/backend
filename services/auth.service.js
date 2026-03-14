/**
 * Production Auth Service
 * Password hashing (bcrypt), JWT generation/verification, refresh tokens
 */

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || "1h";
const REFRESH_TOKEN_EXPIRY = "7d";

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function generateToken(userId, email, role = "user") {
  return jwt.sign({ id: userId, email, role }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

export function generateRefreshToken(userId) {
  return jwt.sign(
    { id: userId, type: "refresh", jti: crypto.randomUUID() },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY },
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}

export default {
  hashPassword,
  comparePassword,
  generateToken,
  generateRefreshToken,
  verifyToken,
  decodeToken,
};
