/**
 * Production Password Hashing Utilities
 */

import bcrypt from "bcrypt";
import crypto from "crypto";

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(plain, hashed) {
  return bcrypt.compare(plain, hashed);
}

export function generateTemporaryPassword() {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  const bytes = crypto.randomBytes(12);
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

export default { hashPassword, comparePassword, generateTemporaryPassword };
